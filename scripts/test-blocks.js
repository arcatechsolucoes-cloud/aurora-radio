// scripts/test-blocks.js — teste ponta a ponta da programação por blocos (local).
// Sobe 1 faixa de cada tipo, cria playlist em blocos, ativa como AutoDJ e observa o histórico.
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const root = path.resolve(__dirname, '..');

async function main() {
  // 1. login
  const loginRes = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'aurora2024' }),
  });
  const setCookie = loginRes.headers.get('set-cookie') || '';
  const cookie = setCookie.split(';')[0];
  const auth = { Authorization: 'Bearer x', Cookie: cookie, 'Content-Type': 'application/json' };
  if (!cookie) throw new Error('Falhou login: ' + loginRes.status);

  const api = async (p, opts = {}) => {
    const isForm = opts.body instanceof FormData;
    const res = await fetch(BASE + '/api' + p, {
      ...opts,
      headers: {
        Cookie: cookie,
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        ...(opts.headers || {}),
      },
    });
    const txt = await res.text();
    let j;
    try { j = JSON.parse(txt); } catch (_) { j = txt; }
    if (!res.ok) throw new Error('/api' + p + ' -> ' + res.status + ': ' + txt.slice(0, 160));
    return j;
  };

  // 2. limpa playlists de teste antigas
  const pls = await api('/playlists');
  for (const p of pls) if (String(p.name).startsWith('[teste]')) await api('/playlists/' + p.id, { method: 'DELETE' });

  // 3. sobe 1 demo em cada tipo + renomeia
  const demo = path.join(root, 'assets', 'aurora-demo.mp3');
  const buf = fs.readFileSync(demo);
  const ids = {};
  const types = [
    ['musica', 'Z MUSICA'],
    ['vinheta', 'Z VINHETA'],
    ['programete', 'Z PROGRAMETE'],
    ['comercial', 'Z COMERCIAL'],
    ['hora_certa', 'Z HORA CERTA'],
  ];
  for (const [type, name] of types) {
    const fd = new FormData();
    fd.append('files', new Blob([buf], { type: 'audio/mpeg' }), 'demo-' + type + '.mp3');
    fd.append('type', type);
    const r = await api('/media/upload', { method: 'POST', headers: { Cookie: cookie }, body: fd });
    const id = r.created[0].id;
    await api('/media/' + id, { method: 'PATCH', body: JSON.stringify({ title: name }) });
    ids[type] = id;
    console.log('subiu', type, '->', id, name);
  }

  // 4. playlist em blocos: música → vinheta → programete → comercial → hora certa → música
  const pl = await api('/playlists', {
    method: 'POST',
    body: JSON.stringify({
      name: '[teste] Blocos',
      shuffle: false,
      trackIds: [],
      slots: [
        { type: 'music' },
        { type: 'vinheta' },
        { type: 'programete', id: ids.programete },
        { type: 'comercial', id: ids.comercial },
        { type: 'hora_certa', id: ids.hora_certa },
        { type: 'music' },
      ],
    }),
  });
  console.log('playlist criada:', pl.id);

  // 5. ativa como playlist do AutoDJ
  await api('/settings', { method: 'PUT', body: JSON.stringify({ autodjPlaylistId: pl.id }) });
  console.log('AutoDJ apontado para a playlist de teste');

  // 6. espera ~40s de reprodução e lê o histórico
  console.log('aguardando 40s de reprodução…');
  await new Promise((r) => setTimeout(r, 40000));

  const dash = await api('/dashboard');
  const hist = (dash.history || []).map((h) => h.title);
  console.log('\n=== histórico tocado (posição 1 = mais recente) ===');
  hist.slice(0, 12).forEach((t, i) => console.log(String(i + 1).padStart(2, '0') + '  ' + t));
  // histórico é guardado do mais novo para o mais antigo -> inverte p/ ordem de execução
  const histRev = hist.slice().reverse();

  const np = dash.nowPlaying;
  console.log('\n=== tocando agora ===', np && np.title);
  console.log('playlist:', dash.playlistName, '| shuffle:', dash.playlistShuffle);

  // 7. valida a ordem dos itens fixos no histórico (ordem de execução: antigo -> novo)
  const fixed = histRev.filter((t) => t.includes('Z '));
  const expectOrder = ['Z PROGRAMETE', 'Z COMERCIAL', 'Z HORA CERTA'];
  const subsequence = [];
  for (const t of fixed) {
    if (t === expectOrder[subsequence.length]) subsequence.push(t);
  }
  const ok = subsequence.length === expectOrder.length;
  console.log('\nRESULTADO:', ok ? 'OK — itens fixos tocam em ordem (programete→comercial→hora certa)' : 'FALHOU — ordem dos itens fixos não respeitada');
  console.log('sequência observada (fixos, em ordem de execução):', fixed.join(' -> '));
  process.exitCode = ok ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exit(1); });