let selectedChannel = null;
let twitchEmbed = null;
let statusMap = new Map();
let refreshTimer = null;
let hasSuccessfulStatusSync = false;

const $ = id => document.getElementById(id);
const membersEl = $('members');
const searchEl = $('search');
const countEl = $('member-count');
const liveCountEl = $('live-count');
const titleEl = $('stream-title');
const metaEl = $('stream-meta');
const statusEl = $('stream-status');
const playerEl = $('player');
const emptyEl = $('empty-player');
const apiNoteEl = $('api-note');
const lastUpdateEl = $('last-update');
const refreshBtn = $('refresh');

function setStatus(type, text) {
  statusEl.textContent = text;
  statusEl.className = `status ${type}`;
}

function updateSelected() {
  document.querySelectorAll('.member-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.channel === selectedChannel);
  });
}

function getMemberStatus(channel) {
  return statusMap.get(channel.toLowerCase()) || null;
}

function renderMembers(filter = '') {
  const q = filter.trim().toLowerCase();
  const filtered = MEMBERS
    .filter(member => `${member.name} ${member.channel} ${member.role}`.toLowerCase().includes(q))
    .sort((a, b) => {
      // Once Twitch status is known, keep LIVE members at the top.
      const al = getMemberStatus(a.channel)?.live === true ? 1 : 0;
      const bl = getMemberStatus(b.channel)?.live === true ? 1 : 0;
      return bl - al;
    });

  membersEl.innerHTML = '';
  countEl.textContent = `${filtered.length} live${filtered.length > 1 ? 's' : ''}`;

  filtered.forEach(member => {
    const info = getMemberStatus(member.channel);
    const known = Boolean(info);
    const live = info?.live === true;
    const button = document.createElement('button');
    button.className = `member-card${live ? ' is-live' : ''}${known ? '' : ' is-checking'}`;
    button.type = 'button';
    button.dataset.channel = member.channel;

    const stateText = !known ? 'Vérification…' : live
      ? `${info.viewer_count?.toLocaleString('fr-FR') || 0} spectateurs`
      : 'Hors ligne';

    button.innerHTML = `
      <span class="avatar">${member.icon}</span>
      <span class="member-copy">
        <strong>${member.name}</strong>
        <small>${member.role} · ${stateText}</small>
      </span>
      <span class="member-live" title="${!known ? 'Vérification en cours' : live ? 'En direct' : 'Hors ligne'}">${!known ? '◌' : '●'}</span>
    `;
    button.addEventListener('click', () => selectMember(member));
    membersEl.appendChild(button);
  });

  updateSelected();
}

function updateMemberCard(channel) {
  const card = [...document.querySelectorAll('.member-card')]
    .find(c => c.dataset.channel.toLowerCase() === channel.toLowerCase());
  if (!card) return;

  const member = MEMBERS.find(m => m.channel.toLowerCase() === channel.toLowerCase());
  const info = getMemberStatus(channel);
  if (!member) return;

  const known = Boolean(info);
  const live = info?.live === true;
  card.classList.toggle('is-live', live);
  card.classList.toggle('is-checking', !known);

  const small = card.querySelector('.member-copy small');
  if (small) {
    small.textContent = `${member.role} · ${!known ? 'Vérification…' : live ? `${info.viewer_count?.toLocaleString('fr-FR') || 0} spectateurs` : 'Hors ligne'}`;
  }

  const dot = card.querySelector('.member-live');
  if (dot) {
    dot.textContent = !known ? '◌' : '●';
    dot.title = !known ? 'Vérification en cours' : live ? 'En direct' : 'Hors ligne';
  }
}

function markMemberLive(channel, live, details = {}) {
  const key = channel.toLowerCase();
  const previous = statusMap.get(key) || { channel };
  statusMap.set(key, { ...previous, ...details, channel, live });
  updateMemberCard(channel);
  updateLiveCount();
}

function updateLiveCount() {
  if (!hasSuccessfulStatusSync && statusMap.size === 0) {
    liveCountEl.textContent = '● VÉRIFICATION…';
    return;
  }
  const total = [...statusMap.values()].filter(s => s.live).length;
  liveCountEl.textContent = `● ${total} LIVE`;
}

function updateSelectedInfo() {
  const member = MEMBERS.find(m => m.channel.toLowerCase() === selectedChannel?.toLowerCase());
  if (!member) return;
  const info = getMemberStatus(member.channel);

  titleEl.textContent = member.name;
  if (!info) {
    metaEl.textContent = `${member.role} · vérification du statut Twitch…`;
    setStatus('checking', '● VÉRIFICATION…');
  } else if (info.live) {
    metaEl.textContent = `${info.game_name || member.role} · ${(info.viewer_count || 0).toLocaleString('fr-FR')} spectateurs`;
    setStatus('live', `● LIVE · ${(info.viewer_count || 0).toLocaleString('fr-FR')} spectateurs`);
  } else {
    metaEl.textContent = `${member.role} · twitch.tv/${member.channel}`;
    setStatus('offline', '● HORS LIGNE');
  }
}

function participationScen() {
  const member = MEMBERS.find(m => m.channel.toLowerCase() === selectedChannel?.toLowerCase());
  if (!member) return;
  const container = document.querySelector("#scenarios");
  container.innerHTML = "";

  Object.entries(scenarios).forEach(([scenarioId, scenarioName]) => {
    // Display the box only if the member participated
    if (member.participatedScenarios.includes(scenarioId)) {
      const box = document.createElement("div");

      box.className = "scenario-box";
      box.textContent = scenarioName;

      container.appendChild(box);
    }
  });
}

function selectMember(member) {
  selectedChannel = member.channel;
  localStorage.setItem('pocketStoriesLastStreamer', member.channel);
  updateSelectedInfo();
  updateSelected();
  participationScen();
  loadPlayer(member.channel);
}

function loadPlayer(channel) {
  emptyEl.hidden = true;
  playerEl.innerHTML = '';
  twitchEmbed = null;
  if (!window.Twitch?.Embed) {
    setStatus('unknown', '● TWITCH INDISPONIBLE');
    return;
  }

  const parent = window.location.hostname || 'localhost';
  twitchEmbed = new Twitch.Embed('player', {
    width: '100%',
    height: '100%',
    channel,
    layout: 'video',
    autoplay: false,
    parent: [parent]
  });

  if (Twitch.Embed.ONLINE) {
    twitchEmbed.addEventListener(Twitch.Embed.ONLINE, () => {
      if (selectedChannel === channel) markMemberLive(channel, true);
    });
  }
  if (Twitch.Embed.OFFLINE) {
    twitchEmbed.addEventListener(Twitch.Embed.OFFLINE, () => {
      if (selectedChannel === channel) markMemberLive(channel, false);
    });
  }
}

function apiBase() {
  return String(window.POCKET_CONFIG?.apiUrl || '').replace(/\/$/, '');
}

async function refreshStatuses() {
  const base = apiBase();
  if (!base) {
    liveCountEl.textContent = '● API NON CONFIGURÉE';
    apiNoteEl.textContent = 'Ajoutez l’URL du Worker dans site-config.js';
    // Keep the member list visible even when the API is not configured.
    renderMembers(searchEl.value);
    return;
  }

  refreshBtn.disabled = true;
  try {
    const response = await fetch(`${base}/api/status`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = await response.json();
    const members = Array.isArray(json.members) ? json.members : [];
    if (!members.length) throw new Error('Worker returned no member statuses');

    statusMap = new Map(members.map(s => [s.channel.toLowerCase(), s]));
    hasSuccessfulStatusSync = true;

    const total = members.filter(s => s.live).length;
    liveCountEl.textContent = `● ${total} LIVE`;
    apiNoteEl.textContent = `Synchronisé · ${total} en direct`;
    lastUpdateEl.textContent = `Dernière vérification : ${new Date().toLocaleTimeString('fr-FR')}`;

    // Update the existing list without touching the Twitch player.
    renderMembers(searchEl.value);
    updateSelectedInfo();
  } catch (error) {
    console.warn('Status refresh failed:', error);
    liveCountEl.textContent = hasSuccessfulStatusSync ? liveCountEl.textContent : '● STATUT INDISPONIBLE';
    apiNoteEl.textContent = hasSuccessfulStatusSync
      ? 'Dernière synchronisation conservée · nouvelle vérification impossible.'
      : 'Impossible de joindre le Worker Twitch.';
    if (!hasSuccessfulStatusSync) {
      renderMembers(searchEl.value);
      if (selectedChannel) setStatus('unknown', '● STATUT INDISPONIBLE');
    }
  } finally {
    refreshBtn.disabled = false;
  }
}

searchEl.addEventListener('input', () => renderMembers(searchEl.value));
refreshBtn.addEventListener('click', refreshStatuses);

// Render the complete member list immediately, before waiting for Twitch/Worker.
renderMembers();
const saved = localStorage.getItem('pocketStoriesLastStreamer');
const initialMember = MEMBERS.find(m => m.channel.toLowerCase() === saved?.toLowerCase()) || MEMBERS[0];
selectMember(initialMember);
refreshStatuses();
refreshTimer = setInterval(refreshStatuses, 30000);
