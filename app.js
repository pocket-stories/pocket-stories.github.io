let selectedChannel = null;
let twitchEmbed = null;
let statusMap = new Map();
let refreshTimer = null;

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

function setStatus(type, text) { statusEl.textContent = text; statusEl.className = `status ${type}`; }
function updateSelected() { document.querySelectorAll('.member-card').forEach(c => c.classList.toggle('selected', c.dataset.channel === selectedChannel)); }

function renderMembers(filter='') {
  const q = filter.trim().toLowerCase();
  membersEl.innerHTML = '';
  const filtered = MEMBERS.filter(m => `${m.name} ${m.channel} ${m.role}`.toLowerCase().includes(q));
  countEl.textContent = `${filtered.length} membre${filtered.length > 1 ? 's' : ''}`;
  filtered.forEach(member => {
    const s = statusMap.get(member.channel.toLowerCase());
    const button = document.createElement('button');
    button.className = `member-card${s?.live ? ' is-live' : ''}`;
    button.type = 'button';
    button.dataset.channel = member.channel;
    button.innerHTML = `<span class="avatar">${member.icon}</span><span class="member-copy"><strong>${member.name}</strong><small>${member.role} · ${member.channel}</small></span><span class="member-live" title="${s?.live ? 'En direct' : 'Hors ligne'}">●</span>`;
    button.addEventListener('click', () => selectMember(member));
    membersEl.appendChild(button);
  });
  updateSelected();
}

function markMemberLive(channel, live) {
  const card = [...document.querySelectorAll('.member-card')].find(c => c.dataset.channel.toLowerCase() === channel.toLowerCase());
  if (!card) return;
  card.classList.toggle('is-live', live);
  const dot = card.querySelector('.member-live');
  if (dot) dot.title = live ? 'En direct' : 'Hors ligne';
}

function selectMember(member) {
  selectedChannel = member.channel;
  localStorage.setItem('pocketStoriesLastStreamer', member.channel);
  titleEl.textContent = member.name;
  const info = statusMap.get(member.channel.toLowerCase());
  metaEl.textContent = info?.live ? `${info.game_name || member.role} · ${info.viewer_count?.toLocaleString('fr-FR') || 0} spectateurs` : `${member.role} · twitch.tv/${member.channel}`;
  setStatus(info?.live ? 'live' : (statusMap.size ? 'offline' : 'checking'), info?.live ? `● LIVE · ${info.viewer_count.toLocaleString('fr-FR')} spectateurs` : (statusMap.size ? '● HORS LIGNE' : '● CONNEXION...'));
  updateSelected();
  loadPlayer(member.channel);
}

function loadPlayer(channel) {
  emptyEl.hidden = true;
  playerEl.innerHTML = '';
  twitchEmbed = null;
  if (!window.Twitch?.Embed) { setStatus('unknown', '● TWITCH INDISPONIBLE'); return; }
  const host = window.location.hostname || 'localhost';
  const parent = host === 'localhost' || host === '127.0.0.1' ? host : host;
  twitchEmbed = new Twitch.Embed('player', {
    width: '100%', height: '100%', channel, layout: 'video', autoplay: false, parent: [parent]
  });
  if (Twitch.Embed.ONLINE) twitchEmbed.addEventListener(Twitch.Embed.ONLINE, () => {
    markMemberLive(channel, true);
    if (selectedChannel === channel && !statusMap.get(channel)?.live) setStatus('live', '● LIVE');
  });
  if (Twitch.Embed.OFFLINE) twitchEmbed.addEventListener(Twitch.Embed.OFFLINE, () => {
    markMemberLive(channel, false);
    if (selectedChannel === channel) setStatus('offline', '● HORS LIGNE');
  });
  setTimeout(() => {
    if (selectedChannel === channel && statusEl.classList.contains('checking')) setStatus('unknown', '● STATUT INCONNU');
  }, 8000);
}

function apiBase() {
  return String(window.POCKET_CONFIG?.apiUrl || '').replace(/\/$/, '');
}

async function refreshStatuses() {
  const base = apiBase();
  if (!base) {
    liveCountEl.textContent = '● API NON CONFIGURÉE';
    apiNoteEl.textContent = 'Ajoutez l’URL du Worker dans site-config.js';
    return;
  }
  refreshBtn.disabled = true;
  try {
    const response = await fetch(`${base}/api/status`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    statusMap = new Map((json.members || []).map(s => [s.channel.toLowerCase(), s]));
    const total = (json.members || []).filter(s => s.live).length;
    liveCountEl.textContent = `● ${total} LIVE`;
    apiNoteEl.textContent = `Synchronisé · ${total} en direct`;
    lastUpdateEl.textContent = `Dernière vérification : ${new Date().toLocaleTimeString('fr-FR')}`;
    renderMembers(searchEl.value);
    const selected = MEMBERS.find(m => m.channel.toLowerCase() === selectedChannel?.toLowerCase());
    if (selected) selectMember(selected);
  } catch (e) {
    console.warn(e);
    liveCountEl.textContent = '● API ERREUR';
    apiNoteEl.textContent = 'Impossible de joindre le Worker Twitch.';
    if (selectedChannel) setStatus('unknown', '● STATUT INDISPONIBLE');
  } finally {
    refreshBtn.disabled = false;
  }
}

searchEl.addEventListener('input', () => renderMembers(searchEl.value));
refreshBtn.addEventListener('click', refreshStatuses);
renderMembers();
const saved = localStorage.getItem('pocketStoriesLastStreamer');
selectMember(MEMBERS.find(m => m.channel === saved) || MEMBERS[0]);
refreshStatuses();
refreshTimer = setInterval(refreshStatuses, 60000);
