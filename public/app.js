/* public/app.js — lógica do painel (comunicação com /api) */
'use strict';

// ---------- helpers ----------
let CURRENT_USER = null;

async function api(path, opts) {
  const res = await fetch('/api' + path, {
    headers: opts && opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (res.status === 401) {
    location.href = '/login';
    throw new Error('Sessão expirada');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtClock(s) {
  s = Math.max(0, s | 0);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h + ':' + m + ':' + ss;
}

function fmtSize(bytes) {
  if (!bytes) return '0 GB';
  const gb = bytes / 1e9;
  if (gb >= 1) return gb.toFixed(1).replace('.', ',') + ' GB';
  return Math.round(bytes / 1e6) + ' MB';
}

// ---------- modal ----------
function openModal(html) {
  const backdrop = document.getElementById('modalBackdrop');
  const box = document.getElementById('modalBox');
  box.innerHTML = html;
  backdrop.classList.add('show');
  backdrop.onclick = (e) => {
    if (e.target === backdrop) backdrop.classList.remove('show');
  };
  return box;
}
function closeModal() {
  const backdrop = document.getElementById('modalBackdrop');
  const box = document.getElementById('modalBox');
  box.classList.remove('modal--wide');
  backdrop.classList.remove('show');
}

// ---------- navegação ----------
const navBtns = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view');
function switchView(name) {
  navBtns.forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  views.forEach((v) => v.classList.toggle('active', v.dataset.view === name));
  if (name === 'autodj') loadPlaylists();
  if (name === 'media') loadMedia();
  if (name === 'live') loadLive();
  if (name === 'stats') loadStats();
  if (name === 'users') loadUsers();
  if (name === 'settings') loadSettings();
  if (name === 'stream') loadStreamCfg();
}
navBtns.forEach((btn) => btn.addEventListener('click', () => switchView(btn.dataset.view)));
document.getElementById('brandBtn').addEventListener('click', () => switchView('dashboard'));

// ---------- sessão ----------
async function initSession() {
  const data = await api('/session');
  CURRENT_USER = data.user;
  const avatar = document.getElementById('avatarBox');
  avatar.textContent = (data.user.name || data.user.username || '?')[0].toUpperCase();
  avatar.title = 'Sessão: ' + data.user.username + ' (' + (data.user.role === 'admin' ? 'administrador' : 'locutor') + ')';
  if (data.user.role !== 'admin') {
    document.querySelectorAll('[data-admin="1"]').forEach((el) => {
      el.style.display = 'none';
      el.disabled = true;
    });
  }
}
document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await api('/logout', { method: 'POST' }); } catch (_) {}
  location.href = '/login';
});

// ---------- VU meter ----------
const vu = document.getElementById('vuMeter');
for (let i = 0; i < 28; i++) {
  const bar = document.createElement('i');
  bar.style.height = '4px';
  vu.appendChild(bar);
}
const bars = vu.querySelectorAll('i');

// ---------- dashboard ----------
let lastNow = '';
async function pollDashboard() {
  try {
    const d = await api('/dashboard');
    document.getElementById('hdrListeners').textContent = d.listeners;
    document.getElementById('s_listeners').textContent = d.listeners;
    document.getElementById('s_peak').textContent = d.peakToday;
    document.getElementById('s_bitrate').textContent = d.bitrate;
    document.getElementById('s_uptime').textContent = fmtClock(d.uptimeSeconds);

    const pill = document.getElementById('onairPill');
    pill.classList.toggle('live', d.onAir);
    document.getElementById('onairText').textContent = d.onAir ? (d.live ? 'Ao vivo' : 'No ar') : 'Fora do ar';

    const ring = document.getElementById('transportRing');
    ring.classList.toggle('live', d.running || d.live);
    const caption = document.getElementById('transportCaption');
    caption.textContent = d.running ? 'Parar transmissão' : 'Iniciar transmissão';
    const icon = document.getElementById('transportIcon');
    icon.innerHTML = d.running
      ? '<rect x="5" y="5" width="14" height="14" rx="1.5"></rect>'
      : '<polygon points="6,4 20,12 6,20"></polygon>';

    // now playing
    document.getElementById('npTitle').textContent = d.nowPlaying ? d.nowPlaying.title : '—';
    document.getElementById('npMeta').textContent = d.nowPlaying
      ? d.nowPlaying.playlist
      : (d.running || d.live ? 'no ar' : 'Aguardando transmissão');
    document.getElementById('npSource').textContent = d.live ? 'Fonte ao vivo' : 'AutoDJ';
    document.getElementById('npBar').style.width = d.onAir ? '38%' : '0%';
    if (d.nowPlaying && d.nowPlaying.title !== lastNow) {
      lastNow = d.nowPlaying.title;
      document.title = (d.nowPlaying.title + ' · ').slice(0, 60) + 'Rádio Aurora FM';
    } else if (!d.onAir) {
      document.title = 'Rádio Aurora FM — Console';
    }

    // live status
    const lt = document.getElementById('liveStatusTag');
    lt.textContent = d.live ? 'conectado' : 'desconectado';
    lt.classList.toggle('on', d.live);
    document.getElementById('lastDj').textContent = d.liveSource?.lastDj || '—';

    // fila
    const q = document.getElementById('queueList');
    if (d.queuePreview.length === 0) {
      q.innerHTML = '<li><span>—</span><span></span></li><li><span>—</span><span></span></li><li><span>—</span><span></span></li>';
    } else {
      q.innerHTML = d.queuePreview
        .map((t, i) => `<li><span>${i + 1}. ${esc(t.title)}</span><span>${esc(t.duration)}</span></li>`)
        .join('');
    }
    document.getElementById('queueSource').textContent = d.live ? 'Fonte ao vivo' : 'AutoDJ';

    // storage
    document.getElementById('storageUsed').textContent = fmtSize(d.storage.usedBytes);
    document.getElementById('storageTracks').textContent = d.storage.trackCount;
    const pct = Math.min(100, (d.storage.usedBytes / d.storage.maxBytes) * 100);
    document.getElementById('storageBar').style.width = pct.toFixed(1) + '%';

    // VU (cosmético)
    bars.forEach((b) => (b.style.height = d.onAir ? 6 + Math.random() * 38 + 'px' : '4px'));
  } catch (_) {}
}
document.getElementById('transportBtn').addEventListener('click', async () => {
  const btn = document.getElementById('transportBtn');
  btn.disabled = true;
  try {
    const d = await api('/dashboard');
    await api('/transport', {
      method: 'POST',
      body: JSON.stringify({ running: !d.running }),
    });
    toast('Transmissão ' + (!d.running ? 'iniciada' : 'parada'));
  } catch (e) {
    toast(e.message);
  }
  btn.disabled = false;
});

// ---------- stream config ----------
async function loadStreamCfg() {
  try {
    const c = await api('/streams/config');
    document.getElementById('fFormat').value = c.format || 'MP3';
    document.getElementById('fBitrate').value = c.bitrate || 128;
    document.getElementById('fMount').value = c.mount || '/stream';
    document.getElementById('fMax').value = c.maxListeners || 500;
    document.getElementById('fTitle').value = c.title || '';
    document.getElementById('fBuffer').value = c.buffer || 4;
    document.getElementById('fBufferVal').textContent = (c.buffer || 4) + 's';
  } catch (_) {}
}
document.getElementById('fBuffer').addEventListener('input', (e) => {
  document.getElementById('fBufferVal').textContent = e.target.value + 's';
});
document.getElementById('saveStreamBtn').addEventListener('click', async () => {
  try {
    await api('/streams/config', {
      method: 'PUT',
      body: JSON.stringify({
        format: document.getElementById('fFormat').value,
        bitrate: document.getElementById('fBitrate').value,
        mount: document.getElementById('fMount').value,
        maxListeners: document.getElementById('fMax').value,
        title: document.getElementById('fTitle').value,
        buffer: document.getElementById('fBuffer').value,
      }),
    });
    toast('Configuração de stream salva');
  } catch (e) {
    toast(e.message);
  }
});

// ---------- playlists ----------
let CURRENT_PLAYLIST = null;
let libraryCache = [];

async function loadPlaylists() {
  try {
    const playlists = await api('/playlists');
    if (!CURRENT_PLAYLIST || !playlists.find((p) => p.id === CURRENT_PLAYLIST.id)) {
      CURRENT_PLAYLIST = playlists.find((p) => p.name === 'Louvor Manhã') || playlists[0] || null;
    } else {
      CURRENT_PLAYLIST = playlists.find((p) => p.id === CURRENT_PLAYLIST.id) || playlists[0] || null;
    }
    const sidebar = document.getElementById('playlistSidebar');
    sidebar.innerHTML = playlists
      .map(
        (p) =>
          `<div class="playlist-item ${CURRENT_PLAYLIST && p.id === CURRENT_PLAYLIST.id ? 'active' : ''}" data-id="${esc(p.id)}">
             <span class="name">${esc(p.name)}</span><span class="count">${esc(p.trackIds.length)}</span>
           </div>`
      )
      .join('<div style="padding:4px 0;border-bottom:1px solid var(--border-soft);margin:0 6px;"></div>');
    sidebar.querySelectorAll('.playlist-item').forEach((el) => {
      el.addEventListener('click', () => {
        CURRENT_PLAYLIST = playlists.find((p) => p.id === el.dataset.id);
        renderPlaylist();
        sidebar.querySelectorAll('.playlist-item').forEach((x) => x.classList.remove('active'));
        el.classList.add('active');
      });
    });
    renderPlaylist();
    // atualiza select de configurações
    const sel = document.getElementById('setPlaylist');
    if (sel) {
      const prev = sel.value;
      sel.innerHTML = playlists
        .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
        .join('');
      sel.value = prev || '';
    }
  } catch (_) {}
}

function renderPlaylist() {
  const title = document.getElementById('playlistTitle');
  if (!CURRENT_PLAYLIST) {
    title.textContent = 'Nenhuma playlist';
    document.getElementById('playlistMode').textContent = '';
    document.getElementById('playlistTracks').innerHTML =
      '<div class="field" style="padding:10px 0;"><span class="hint">Crie uma playlist para começar.</span></div>';
    return;
  }
  title.textContent = CURRENT_PLAYLIST.name;
  document.getElementById('playlistMode').innerHTML = `modo aleatório <span class="toggle ${CURRENT_PLAYLIST.shuffle ? 'on' : ''}" id="shuffleToggle" style="margin-left:8px;vertical-align:middle;"><i></i></span>`;

  const byId = new Map(libraryCache.map((m) => [String(m.id), m]));
  const rows = CURRENT_PLAYLIST.trackIds
    .map((id, i) => byId.get(String(id)))
    .filter(Boolean)
    .map(
      (m, i) => `<div class="track-row">
        <span class="track-idx">${String(i + 1).padStart(2, '0')}</span>
        <span style="display:flex;align-items:center;gap:8px;min-width:0;"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(m.title)}</span><span class="track-type-tag">${esc(typeLabel(m.type))}</span></span>
        <span class="track-dur">${esc(m.duration)}</span>
        <button class="icon-btn danger remove-track" data-id="${esc(m.id)}" title="Remover da playlist"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>`
    )
    .join('');

  document.getElementById('playlistTracks').innerHTML =
    rows ||
    '<div class="field" style="padding:10px 0;"><span class="hint">Playlist vazia — adicione faixas da biblioteca.</span></div>';

  const sh = document.getElementById('shuffleToggle');
  if (sh) sh.addEventListener('click', () => toggleShuffle());

  document.querySelectorAll('.remove-track').forEach((el) => {
    el.addEventListener('click', async () => {
      CURRENT_PLAYLIST.trackIds = CURRENT_PLAYLIST.trackIds.filter((id) => String(id) !== String(el.dataset.id));
      await api('/playlists/' + CURRENT_PLAYLIST.id, {
        method: 'PATCH',
        body: JSON.stringify({ trackIds: CURRENT_PLAYLIST.trackIds }),
      });
      loadPlaylists();
      toast('Faixa removida');
    });
  });
}

async function toggleShuffle() {
  if (!CURRENT_PLAYLIST) return;
  CURRENT_PLAYLIST.shuffle = !CURRENT_PLAYLIST.shuffle;
  await api('/playlists/' + CURRENT_PLAYLIST.id, {
    method: 'PATCH',
    body: JSON.stringify({ shuffle: CURRENT_PLAYLIST.shuffle }),
  });
  renderPlaylist();
}

// ---------- programador de sequência (construtor de playlist) ----------
function openSequencer(opts) {
  const { title = 'Programar sequência', playlistName = '', initialIds = [], saveLabel = 'Salvar playlist', onSave } = opts || {};
  const box = openModal(`
    <h3>${esc(title)}</h3>
    <div class="field"><label>Nome da playlist</label><input id="seqName" type="text" value="${esc(playlistName)}" placeholder="Ex.: Programação da Manhã"></div>
    <div class="field"><label>Tipos</label><div class="chip-row" id="seqChips" style="margin:0;"></div></div>
    <div class="seq-wrap">
      <div class="seq-pane">
        <h4>Biblioteca <span style="opacity:.6" id="seqLibCount"></span></h4>
        <div id="seqLibList"><div class="seq-empty">Carregando…</div></div>
      </div>
      <div class="seq-pane">
        <h4>Sequência <span style="opacity:.6" id="seqCount">0 faixas</span></h4>
        <div id="seqList"><div class="seq-empty">Clique em <b>+</b> nas faixas da biblioteca ao lado para montar a ordem. Use ↑ ↓ para reordenar.</div></div>
      </div>
    </div>
    <div class="form-actions" style="margin-top:16px;">
      <button class="btn ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="seqOk">${esc(saveLabel)}</button>
    </div>`);
  box.classList.add('modal--wide');

  const state = { filter: 'all', ids: initialIds.slice() };

  const renderChips = () => {
    const chips = [{ id: 'all', label: 'Todas' }, ...MEDIA_TYPES]
      .map((t) => `<button class="chip ${state.filter === t.id ? 'on' : ''}" data-f="${esc(t.id)}">${esc(t.label)}</button>`)
      .join('');
    const row = document.getElementById('seqChips');
    row.innerHTML = chips;
    row.querySelectorAll('.chip').forEach((el) => {
      el.addEventListener('click', () => {
        state.filter = el.dataset.f;
        renderChips();
        renderLib();
      });
    });
  };

  const renderLib = () => {
    const list = libraryCache.filter((m) => state.filter === 'all' || normType(m.type) === state.filter);
    document.getElementById('seqLibCount').textContent = list.length ? `(${list.length})` : '';
    const el = document.getElementById('seqLibList');
    if (list.length === 0) {
      el.innerHTML = '<div class="seq-empty">Nenhuma faixa nesta categoria. Envie músicas, vinhetas, programetes e hora certa na aba Mídia.</div>';
      return;
    }
    el.innerHTML = list
      .map(
        (m) => `<div class="seq-item">
          <span class="idx">${esc(typeLabel(m.type))}</span>
          <span class="ttl">${esc(m.title)}<span style="color:var(--text-3);font-family:var(--font-mono);font-size:11px;margin-left:8px;">${esc(m.duration)}</span></span>
          <button class="add-one" data-id="${esc(m.id)}" title="Adicionar à sequência">+</button>
        </div>`
      )
      .join('');
    el.querySelectorAll('.add-one').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = libraryCache.find((x) => String(x.id) === String(btn.dataset.id));
        if (!m) return;
        state.ids.push(m.id);
        renderSeq();
        toast('Adicionado: ' + m.title);
      });
    });
  };

  const renderSeq = () => {
    const byId = new Map(libraryCache.map((m) => [String(m.id), m]));
    const el = document.getElementById('seqList');
    document.getElementById('seqCount').textContent = state.ids.length + (state.ids.length === 1 ? ' faixa' : ' faixas');
    if (state.ids.length === 0) {
      el.innerHTML = '<div class="seq-empty">Sequência vazia.</div>';
      return;
    }
    el.innerHTML = state.ids
      .map((id, i) => {
        const m = byId.get(String(id));
        if (!m) return '';
        return `<div class="seq-item">
          <span class="idx">${String(i + 1).padStart(2, '0')}</span>
          <span class="ttl">${esc(m.title)}</span>
          <span class="dur">${esc(m.duration)}</span>
          <span style="display:inline-flex;gap:4px;white-space:nowrap;">
            <button class="seq-tool up ${i === 0 ? 'off' : ''}" data-i="${i}" title="Subir">↑</button>
            <button class="seq-tool down ${i === state.ids.length - 1 ? 'off' : ''}" data-i="${i}" title="Descer">↓</button>
            <button class="seq-tool danger rm" data-i="${i}" title="Remover">✕</button>
          </span>
        </div>`;
      })
      .join('');
    el.querySelectorAll('.up').forEach((b) => b.addEventListener('click', () => seqMove(+b.dataset.i, -1)));
    el.querySelectorAll('.down').forEach((b) => b.addEventListener('click', () => seqMove(+b.dataset.i, 1)));
    el.querySelectorAll('.rm').forEach((b) =>
      b.addEventListener('click', () => {
        state.ids.splice(+b.dataset.i, 1);
        renderSeq();
      })
    );
  };

  const seqMove = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= state.ids.length) return;
    [state.ids[i], state.ids[j]] = [state.ids[j], state.ids[i]];
    renderSeq();
  };

  renderChips();
  renderLib();
  renderSeq();

  document.getElementById('seqOk').addEventListener('click', async () => {
    const name = document.getElementById('seqName').value.trim();
    if (!name) return toast('Informe o nome da playlist');
    if (state.ids.length === 0) return toast('Adicione pelo menos uma faixa à sequência');
    const okBtn = document.getElementById('seqOk');
    okBtn.disabled = true;
    try {
      await onSave(name, state.ids.slice());
      closeModal();
      await loadPlaylists();
      toast('Playlist salva');
    } catch (e) {
      toast(e.message);
      okBtn.disabled = false;
    }
  });
}

document.getElementById('newPlaylistBtn').addEventListener('click', () => {
  openSequencer({
    title: 'Nova playlist programada',
    playlistName: '',
    initialIds: [],
    saveLabel: 'Criar playlist',
    onSave: async (name, ids) => {
      const p = await api('/playlists', {
        method: 'POST',
        body: JSON.stringify({ name, shuffle: false, trackIds: ids }),
      });
      CURRENT_PLAYLIST = p;
    },
  });
});

document.getElementById('programOrderBtn').addEventListener('click', () => {
  if (!CURRENT_PLAYLIST) return toast('Selecione uma playlist primeiro');
  openSequencer({
    title: 'Programar sequência — ' + CURRENT_PLAYLIST.name,
    playlistName: CURRENT_PLAYLIST.name,
    initialIds: CURRENT_PLAYLIST.trackIds || [],
    saveLabel: 'Salvar sequência',
    onSave: async (name, ids) => {
      await api('/playlists/' + CURRENT_PLAYLIST.id, {
        method: 'PATCH',
        body: JSON.stringify({ name, shuffle: false, trackIds: ids }),
      });
      CURRENT_PLAYLIST.name = name;
      CURRENT_PLAYLIST.trackIds = ids;
      CURRENT_PLAYLIST.shuffle = false;
    },
  });
});

document.getElementById('renamePlaylistBtn').addEventListener('click', async () => {
  if (!CURRENT_PLAYLIST) return toast('Selecione uma playlist');
  openModal(`
    <h3>Renomear playlist</h3>
    <div class="field"><label>Nome</label><input id="plName" type="text" value="${esc(CURRENT_PLAYLIST.name)}"></div>
    <div class="form-actions">
      <button class="btn ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="plOk">Salvar</button>
    </div>`);
  document.getElementById('plOk').addEventListener('click', async () => {
    const name = document.getElementById('plName').value.trim();
    if (!name) return toast('Informe um nome');
    await api('/playlists/' + CURRENT_PLAYLIST.id, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    closeModal();
    await loadPlaylists();
    toast('Playlist renomeada');
  });
});

document.getElementById('deletePlaylistBtn').addEventListener('click', async () => {
  if (!CURRENT_PLAYLIST) return toast('Selecione uma playlist');
  if (!confirm('Excluir a playlist "' + CURRENT_PLAYLIST.name + '"?')) return;
  await api('/playlists/' + CURRENT_PLAYLIST.id, { method: 'DELETE' });
  CURRENT_PLAYLIST = null;
  await loadPlaylists();
  toast('Playlist excluída');
});

document.getElementById('addTrackBtn').addEventListener('click', openTrackPicker);

async function openTrackPicker() {
  if (!CURRENT_PLAYLIST) return toast('Selecione uma playlist primeiro');
  if (libraryCache.length === 0) libraryCache = await api('/media');
  const inPl = new Set(CURRENT_PLAYLIST.trackIds.map(String));
  const options = libraryCache
    .map(
      (m) => `<label class="track-row" style="cursor:pointer;display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:8px 10px;">
        <input type="checkbox" class="pick-track" value="${esc(m.id)}" ${inPl.has(String(m.id)) ? 'checked' : ''}>
        <span>${esc(m.title)}</span><span class="track-dur">${esc(m.duration)}</span>
      </label>`
    )
    .join('');
  openModal(`
    <h3>Adicionar faixas — ${esc(CURRENT_PLAYLIST.name)}</h3>
    ${options || '<p style="color:var(--text-3);font-size:13px;">Biblioteca vazia. Envie arquivos na aba Mídia.</p>'}
    <div class="form-actions">
      <button class="btn ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="pickOk">Adicionar selecionadas</button>
    </div>`);
  document.getElementById('pickOk').addEventListener('click', async () => {
    const ids = Array.from(document.querySelectorAll('.pick-track:checked')).map((x) => x.value);
    const merged = Array.from(new Set([...CURRENT_PLAYLIST.trackIds.map(String), ...ids]));
    await api('/playlists/' + CURRENT_PLAYLIST.id, {
      method: 'PATCH',
      body: JSON.stringify({ trackIds: merged }),
    });
    closeModal();
    await loadPlaylists();
    toast('Faixas atualizadas');
  });
}

// ---------- mídia ----------
const MEDIA_TYPES = [
  { id: 'musica', label: 'Música' },
  { id: 'vinheta', label: 'Vinheta' },
  { id: 'programete', label: 'Programete' },
  { id: 'hora_certa', label: 'Hora certa' },
];
const normType = (t) => (MEDIA_TYPES.some((x) => x.id === t) ? t : 'musica');
const typeLabel = (t) => (MEDIA_TYPES.find((x) => x.id === t) || {}).label || 'Música';

let mediaFilter = 'all';

function renderMediaChips(items) {
  const counts = { all: items.length };
  MEDIA_TYPES.forEach((t) => (counts[t.id] = 0));
  items.forEach((m) => counts[normType(m.type)]++);
  const row = document.getElementById('mediaChips');
  const chips = [{ id: 'all', label: 'Todas' }, ...MEDIA_TYPES]
    .map(
      (t) =>
        `<button class="chip ${mediaFilter === t.id ? 'on' : ''}" data-f="${esc(t.id)}">${esc(t.label)}<b>${counts[t.id] ?? 0}</b></button>`
    )
    .join('');
  row.innerHTML = chips;
  row.querySelectorAll('.chip').forEach((el) => {
    el.addEventListener('click', () => {
      mediaFilter = el.dataset.f;
      renderMediaChips(items);
      renderMediaRows(items);
    });
  });
}

function renderMediaRows(items) {
  const filtered = mediaFilter === 'all' ? items : items.filter((m) => normType(m.type) === mediaFilter);
  const tbody = document.getElementById('mediaTbody');
  if (filtered.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="color:var(--text-3);">' +
      (mediaFilter === 'all'
        ? 'Biblioteca vazia — envie seus primeiros arquivos.'
        : 'Nenhuma faixa nesta categoria — envie arquivos ou mude o tipo de alguma faixa.') +
      '</td></tr>';
    return;
  }
  tbody.innerHTML = filtered
    .map(
      (m) => `<tr>
          <td><a href="/api/media/${esc(m.id)}/file" target="_blank" style="color:var(--text-1);text-decoration:none;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px;" title="Ouvir prévia">${esc(m.title)}</a></td>
          <td><select class="media-type" data-id="${esc(m.id)}" title="Mudar tipo">${MEDIA_TYPES.map(
            (t) => `<option value="${esc(t.id)}" ${normType(m.type) === t.id ? 'selected' : ''}>${esc(t.label)}</option>`
          ).join('')}</select></td>
          <td>${esc(m.duration)}</td>
          <td>${esc(m.format)}</td>
          <td>${String(m.size).replace('.', ',')} MB</td>
          <td>${m.playlistsCount || 0}</td>
          <td class="row-actions">
            <button class="icon-btn play-media" data-id="${esc(m.id)}" title="Prévia"><svg viewBox="0 0 24 24"><polygon points="6,4 20,12 6,20"/></svg></button>
            <button class="icon-btn danger del-media" data-id="${esc(m.id)}" title="Excluir"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7"/></svg></button>
          </td>
        </tr>`
    )
    .join('');

  tbody.querySelectorAll('.play-media').forEach((el) => {
    el.addEventListener('click', () => {
      window.open('/api/media/' + el.dataset.id + '/file', '_blank');
    });
  });

  tbody.querySelectorAll('.del-media').forEach((el) => {
    el.addEventListener('click', async () => {
      if (!confirm('Excluir este arquivo da biblioteca?')) return;
      await api('/media/' + el.dataset.id, { method: 'DELETE' });
      loadMedia();
      loadPlaylists();
      toast('Arquivo excluído');
    });
  });

  tbody.querySelectorAll('.media-type').forEach((el) => {
    el.addEventListener('change', async () => {
      const id = el.dataset.id;
      const type = normType(el.value);
      await api('/media/' + id, { method: 'PATCH', body: JSON.stringify({ type }) });
      const item = libraryCache.find((m) => String(m.id) === id);
      if (item) item.type = type;
      renderMediaChips(items);
      toast('Tipo atualizado');
    });
  });
}

async function loadMedia() {
  try {
    const items = await api('/media');
    libraryCache = items.map((m) => ({ ...m, type: normType(m.type) }));
    document.getElementById('mediaSub').textContent = libraryCache.length + ' faixas';
    renderMediaChips(libraryCache);
    renderMediaRows(libraryCache);
  } catch (_) {}
}

document.getElementById('uploadBtn').addEventListener('click', () => {
  let uploadType = 'musica';
  openModal(`
    <h3>Enviar arquivos de áudio</h3>
    <div class="field"><label>Tipo das mídias</label>
      <div class="chip-row" id="upTypes" style="margin:0;">${MEDIA_TYPES.map(
        (t) => `<button class="chip ${t.id === 'musica' ? 'on' : ''}" data-t="${esc(t.id)}">${esc(t.label)}</button>`
      ).join('')}</div>
      <span class="hint">Selecione a categoria antes de enviar: cada arquivo entra no tipo escolhido.</span>
    </div>
    <div class="dropzone" id="dropzone">Arraste arquivos aqui<br>ou clique para escolher<br><span style="font-size:11px;">MP3, AAC, OGG, WAV, FLAC • até 200 MB</span></div>
    <ul class="mini-list" id="uploadList" style="margin-top:12px;"></ul>
    <div class="form-actions">
      <button class="btn ghost" onclick="closeModal()">Fechar</button>
      <button class="btn primary" id="uploadOk" disabled>Enviar</button>
    </div>`);
  const typeRow = document.getElementById('upTypes');
  typeRow.querySelectorAll('.chip').forEach((el) => {
    el.addEventListener('click', () => {
      uploadType = el.dataset.t;
      typeRow.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === el));
    });
  });
  const dz = document.getElementById('dropzone');
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.multiple = true;
  fileInput.accept = 'audio/*,.mp3,.aac,.ogg,.wav,.flac';
  let files = [];
  const listEl = document.getElementById('uploadList');
  const okBtn = document.getElementById('uploadOk');
  const renderList = () => {
    listEl.innerHTML = files.map((f) => `<li><span>${esc(f.name)}</span><span>${(f.size / 1e6).toFixed(1).replace('.', ',')} MB</span></li>`).join('');
    okBtn.disabled = files.length === 0;
  };
  dz.onclick = () => fileInput.click();
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('drag'); };
  dz.ondragleave = () => dz.classList.remove('drag');
  dz.ondrop = (e) => {
    e.preventDefault();
    dz.classList.remove('drag');
    files = [...e.dataTransfer.files];
    renderList();
  };
  fileInput.onchange = () => {
    files = [...fileInput.files];
    renderList();
  };
  okBtn.addEventListener('click', async () => {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    fd.append('type', uploadType);
    okBtn.disabled = true;
    okBtn.textContent = 'Enviando…';
    try {
      const r = await api('/media/upload', { method: 'POST', body: fd });
      toast(r.created.length + ' arquivo(s) enviado(s) como ' + typeLabel(uploadType).toLowerCase());
      closeModal();
      libraryCache = await api('/media');
      loadMedia();
    } catch (e) {
      toast(e.message);
      okBtn.disabled = false;
      okBtn.textContent = 'Enviar';
    }
  });
});

// ---------- fonte ao vivo ----------
let LIVE_INFO = null;
async function loadLive() {
  try {
    LIVE_INFO = await api('/live/info');
    document.getElementById('lvHost').textContent = LIVE_INFO.host;
    document.getElementById('lvPort').textContent = LIVE_INFO.port;
    document.getElementById('lvMount').textContent = LIVE_INFO.mount;
    document.getElementById('lvUser').textContent = LIVE_INFO.user;

    const users = await api('/users').catch(() => []);
    const locutores = users.filter((u) => u.role === 'locutor');
    document.getElementById('locutorCount').textContent = locutores.length;
    document.getElementById('locutorList').innerHTML =
      locutores
        .map((u) => `<li><span>${esc(u.username)}</span><span class="tag ${u.active ? 'on' : ''}">${u.active ? 'ativo' : 'bloqueado'}</span></li>`)
        .join('') || '<li><span>Nenhum locutor ainda</span></li>';
  } catch (_) {}
}
document.getElementById('togglePw').addEventListener('click', () => {
  const pw = document.getElementById('pw');
  if (!LIVE_INFO) return;
  pw.textContent = pw.textContent === '••••••••' ? LIVE_INFO.pass : '••••••••';
});
document.getElementById('copyCreds').addEventListener('click', async () => {
  if (!LIVE_INFO) return;
  const text = `Servidor: ${LIVE_INFO.host}\nPorta: ${LIVE_INFO.port}\nMount: ${LIVE_INFO.mount}\nUsuário: ${LIVE_INFO.user}\nSenha: ${LIVE_INFO.pass}`;
  try {
    await navigator.clipboard.writeText(text);
    toast('Credenciais copiadas');
  } catch (_) {
    toast('Falha ao copiar');
  }
});
document.getElementById('changeLiveCreds').addEventListener('click', () => {
  openModal(`
    <h3>Alterar credenciais da fonte ao vivo</h3>
    <div class="form-grid">
      <div class="field"><label>Usuário (source)</label><input id="ccUser" type="text" value="${esc(LIVE_INFO?.user || 'source')}"></div>
      <div class="field"><label>Senha</label><input id="ccPass" type="text" value="${esc(LIVE_INFO?.pass || '')}" autocomplete="off"></div>
    </div>
    <div class="form-actions">
      <button class="btn ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="ccOk">Salvar</button>
    </div>`);
  document.getElementById('ccOk').addEventListener('click', async () => {
    await api('/live/info', {
      method: 'PUT',
      body: JSON.stringify({ user: document.getElementById('ccUser').value, pass: document.getElementById('ccPass').value }),
    });
    closeModal();
    await loadLive();
    toast('Credenciais atualizadas — reinicie o programa de transmissão');
  });
});
document.getElementById('addLocutorBtn').addEventListener('click', () => {
  openModal(`
    <h3>Novo locutor</h3>
    <div class="form-grid">
      <div class="field"><label>Usuário</label><input id="nuUser" type="text" autocomplete="off"></div>
      <div class="field"><label>Senha</label><input id="nuPass" type="text" autocomplete="off"></div>
    </div>
    <div class="form-actions">
      <button class="btn ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="nuOk">Criar</button>
    </div>`);
  document.getElementById('nuOk').addEventListener('click', async () => {
    const username = document.getElementById('nuUser').value.trim();
    const password = document.getElementById('nuPass').value;
    if (!username || !password) return toast('Informe usuário e senha');
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({ username, password, role: 'locutor', active: true }),
      });
      closeModal();
      await loadLive();
      toast('Locutor criado');
    } catch (e) {
      toast(e.message);
    }
  });
});

// ---------- locutor no navegador ----------
const bw = {
  stream: null,
  ctx: null,
  proc: null,
  enc: null,
  writer: null,
  live: false,
};

function audioChunksToInt16(chunk) {
  const n = chunk.length;
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, chunk[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

async function bwStart() {
  const startBtn = document.getElementById('bwStart');
  const stopBtn = document.getElementById('bwStop');
  const errEl = document.getElementById('bwError');
  errEl.style.display = 'none';
  if (!LIVE_INFO) {
    try {
      await loadLive();
    } catch (_) {}
  }
  if (!LIVE_INFO) {
    errEl.textContent = 'Não foi possível carregar as credenciais da fonte. Recarregue a página.';
    errEl.style.display = 'block';
    return;
  }
  try {
    bw.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    errEl.textContent = 'Não foi possível acessar o microfone: ' + e.message;
    errEl.style.display = 'block';
    return;
  }

  bw.ctx = new (window.AudioContext || window.webkitAudioContext)();
  const rate = bw.ctx.sampleRate;
  bw.enc = new lamejs.Mp3Encoder(1, rate, 128);

  // stream de upload contínuo via POST /live/ingest
  const bodyStream = new ReadableStream({
    start(controller) {
      bw.writer = controller;
    },
  });

  const base = btoa(LIVE_INFO.user + ':' + LIVE_INFO.pass);
  const resp = await fetch('/live/ingest', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + base,
      'Content-Type': 'audio/mpeg',
      'X-Live-Name': 'Locutor (navegador)',
    },
    body: bodyStream,
  });
  if (resp.status !== 200) {
    bw.stream.getTracks().forEach((t) => t.stop());
    errEl.textContent = 'Falha na conexão: HTTP ' + resp.status;
    errEl.style.display = 'block';
    return;
  }
  bw.live = true;

  const source = bw.ctx.createMediaStreamSource(bw.stream);
  bw.proc = bw.ctx.createScriptProcessor(4096, 1, 1);
  bw.proc.onaudioprocess = (ev) => {
    if (!bw.live || !bw.writer) return;
    const int16 = audioChunksToInt16(ev.inputBuffer.getChannelData(0));
    const mp3 = bw.enc.encodeBuffer(int16);
    if (mp3.length > 0) {
      try {
        bw.writer.enqueue(mp3);
      } catch (_) {}
    }
  };
  const mute = bw.ctx.createGain();
  mute.gain.value = 0;
  source.connect(bw.proc);
  bw.proc.connect(mute);
  mute.connect(bw.ctx.destination);

  startBtn.disabled = true;
  stopBtn.disabled = false;
  document.getElementById('bwTag').textContent = 'no ar';
  document.getElementById('bwTag').className = 'tag on';
  document.getElementById('bwStatus').textContent = 'transmitindo';
  toast('🎙️ Locutor no ar!');
}

async function bwStop() {
  document.getElementById('bwStart').disabled = false;
  document.getElementById('bwStop').disabled = true;
  bw.live = false;
  if (bw.enc) {
    const end = bw.enc.flush();
    if (end.length > 0 && bw.writer) {
      try {
        bw.writer.enqueue(end);
        bw.writer.close();
      } catch (_) {}
    }
  }
  if (bw.proc) bw.proc.disconnect();
  if (bw.stream) bw.stream.getTracks().forEach((t) => t.stop());
  if (bw.ctx) bw.ctx.close().catch(() => {});
  bw.proc = null;
  bw.enc = null;
  bw.writer = null;
  bw.stream = null;
  bw.ctx = null;
  document.getElementById('bwTag').textContent = 'parado';
  document.getElementById('bwTag').className = 'tag';
  document.getElementById('bwStatus').textContent = 'desconectado';
  toast('Transmissão encerrada — AutoDJ retomou');
}

document.getElementById('bwStart').addEventListener('click', bwStart);
document.getElementById('bwStop').addEventListener('click', bwStop);

// ---------- estatísticas ----------
async function loadStats() {
  try {
    const s = await api('/stats/history');
    document.getElementById('st_peak').textContent = s.kpis.peakListeners;
    document.getElementById('st_uptime').textContent = s.kpis.uptime;
    document.getElementById('st_total').textContent = s.kpis.totalListenersToday;
    document.getElementById('st_live').textContent = s.kpis.streamsToday + ' conexões hoje';
    document.getElementById('historyList').innerHTML =
      s.history.length === 0
        ? '<li><span>Nada tocado ainda</span></li>'
        : s.history.map((h) => `<li><span>${esc(h.title)}</span><span>${esc(h.at ? h.at.slice(11, 16) : '')}</span></li>`).join('');

    const d = await api('/dashboard');
    const a = document.getElementById('st_autodj');
    a.textContent = d.running ? 'no ar' : 'desligado';
    a.className = 'tag' + (d.running ? ' on' : '');
    const l = document.getElementById('st_livestatus');
    l.textContent = d.live ? 'conectado' : 'desconectado';
    l.className = 'tag' + (d.live ? ' on' : '');
    document.getElementById('st_format').textContent = d.format;
    document.getElementById('st_mount').textContent = d.mount;
  } catch (_) {}
}

// ---------- usuários ----------
async function loadUsers() {
  try {
    const users = await api('/users');
    const tbody = document.getElementById('usersTbody');
    tbody.innerHTML = users
      .map(
        (u) => `<tr>
          <td>${esc(u.name)}</td>
          <td style="font-family:var(--font-mono);">${esc(u.username)}</td>
          <td><span class="role-pill ${u.role === 'admin' ? 'admin' : ''}">${u.role === 'admin' ? 'administrador' : 'locutor'}</span></td>
          <td><span class="tag ${u.active ? 'on' : ''}" id="us-${esc(u.id)}">${u.active ? 'ativo' : 'bloqueado'}</span></td>
          <td class="row-actions">
            <button class="icon-btn edit-user" data-id="${esc(u.id)}" title="Editar"><svg viewBox="0 0 24 24"><path d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 15.5Z"/></svg></button>
            <button class="icon-btn danger del-user" data-id="${esc(u.id)}" title="Excluir"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7"/></svg></button>
          </td>
        </tr>`
      )
      .join('');
    tbody.querySelectorAll('.edit-user').forEach((el) => {
      el.addEventListener('click', () => {
        const u = users.find((x) => x.id === el.dataset.id);
        if (!u) return;
        openModal(`
          <h3>Editar usuário</h3>
          <div class="form-grid">
            <div class="field"><label>Nome</label><input id="euName" type="text" value="${esc(u.name)}"></div>
            <div class="field"><label>Papel</label><select id="euRole"><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>administrador</option><option value="locutor" ${u.role === 'locutor' ? 'selected' : ''}>locutor</option></select></div>
            <div class="field" style="grid-column:span 2;"><label>Nova senha (deixe vazio para manter)</label><input id="euPass" type="text" autocomplete="off"></div>
            <div class="field" style="grid-column:span 2;"><label class="check"><input type="checkbox" id="euActive" ${u.active ? 'checked' : ''}> Ativo (pode entrar no console)</label></div>
          </div>
          <div class="form-actions">
            <button class="btn ghost" onclick="closeModal()">Cancelar</button>
            <button class="btn primary" id="euOk">Salvar</button>
          </div>`);
        document.getElementById('euOk').addEventListener('click', async () => {
          const body = {
            name: document.getElementById('euName').value,
            role: document.getElementById('euRole').value,
            active: document.getElementById('euActive').checked,
          };
          const p = document.getElementById('euPass').value;
          if (p) body.password = p;
          await api('/users/' + u.id, { method: 'PATCH', body: JSON.stringify(body) });
          closeModal();
          loadUsers();
          toast('Usuário atualizado');
        });
      });
    });
    tbody.querySelectorAll('.del-user').forEach((el) => {
      el.addEventListener('click', async () => {
        if (!confirm('Excluir este usuário?')) return;
        await api('/users/' + el.dataset.id, { method: 'DELETE' });
        loadUsers();
        toast('Usuário excluído');
      });
    });
  } catch (_) {}
}

document.getElementById('newUserBtn').addEventListener('click', () => {
  openModal(`
    <h3>Novo usuário</h3>
    <div class="form-grid">
      <div class="field"><label>Nome</label><input id="nuName" type="text"></div>
      <div class="field"><label>Usuário (login)</label><input id="nuUser" type="text" autocomplete="off"></div>
      <div class="field"><label>Senha</label><input id="nuPass" type="text" autocomplete="off"></div>
      <div class="field"><label>Papel</label><select id="nuRole"><option value="locutor">locutor</option><option value="admin">administrador</option></select></div>
    </div>
    <div class="form-actions">
      <button class="btn ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="nuOk">Criar</button>
    </div>`);
  document.getElementById('nuOk').addEventListener('click', async () => {
    const username = document.getElementById('nuUser').value.trim();
    const password = document.getElementById('nuPass').value;
    if (!username || !password) return toast('Informe usuário e senha');
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password,
          name: document.getElementById('nuName').value,
          role: document.getElementById('nuRole').value,
          active: true,
        }),
      });
      closeModal();
      loadUsers();
      toast('Usuário criado');
    } catch (e) {
      toast(e.message);
    }
  });
});

// ---------- configurações ----------
async function loadSettings() {
  try {
    if (libraryCache.length === 0) libraryCache = await api('/media');
    const s = await api('/settings');
    document.getElementById('setName').value = s.stationName || '';
    document.getElementById('setTz').value = s.timezone || 'America/Sao_Paulo';
    document.getElementById('setDesc').value = s.description || '';
    const sel = document.getElementById('setPlaylist');
    if (sel.options.length === 0) {
      const playlists = await api('/playlists');
      sel.innerHTML = playlists.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    }
    if (s.autodjPlaylistId) sel.value = s.autodjPlaylistId;
    const tgl = (id, on) => document.getElementById(id).classList.toggle('on', !!on);
    tgl('tglDown', s.notificationsDowntime);
    tgl('tglBackup', s.backupAuto);
    tgl('tglPub', s.publicStats);
    tgl('tglAuto', s.autoStart);
  } catch (_) {}
}

document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
  try {
    await api('/settings', {
      method: 'PUT',
      body: JSON.stringify({
        stationName: document.getElementById('setName').value,
        timezone: document.getElementById('setTz').value,
        description: document.getElementById('setDesc').value,
        autodjPlaylistId: document.getElementById('setPlaylist').value,
        notificationsDowntime: document.getElementById('tglDown').classList.contains('on'),
        backupAuto: document.getElementById('tglBackup').classList.contains('on'),
        publicStats: document.getElementById('tglPub').classList.contains('on'),
        autoStart: document.getElementById('tglAuto').classList.contains('on'),
      }),
    });
    document.getElementById('stationNameTop').textContent = document.getElementById('setName').value || 'Rádio';
    toast('Configurações salvas');
  } catch (e) {
    toast(e.message);
  }
});
['tglDown', 'tglBackup', 'tglPub', 'tglAuto'].forEach((id) => {
  document.getElementById(id).addEventListener('click', () => {
    document.getElementById(id).classList.toggle('on');
  });
});

// ---------- loop principal ----------
(async function boot() {
  try {
    await initSession();
    libraryCache = await api('/media');
    await loadSettings();
    pollDashboard();
    setInterval(pollDashboard, 1000);
  } catch (e) {
    if (e.message !== 'Sessão expirada') toast('Falha ao iniciar: ' + e.message);
  }
})();