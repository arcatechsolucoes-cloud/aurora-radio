// server/seed.js — cria dados iniciais do painel (usuários, configurações, playlists, mídia).
// Rode com: npm run seed  (ou node server/seed.js)
'use strict';

const store = require('./store');
const { hashPassword } = require('./auth');

function run() {
  const db = store.load();

  if (db.users.length === 0) {
    db.users = [
      {
        id: 'u_admin',
        username: 'admin',
        name: 'Marcelo Souza',
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString(),
        ...hashPassword('aurora2024'),
      },
      {
        id: 'u_djmarcos',
        username: 'dj_marcos',
        name: 'dj_marcos',
        role: 'locutor',
        active: true,
        createdAt: new Date().toISOString(),
        ...hashPassword('dj2024'),
      },
      {
        id: 'u_camila',
        username: 'dj_camila',
        name: 'dj_camila',
        role: 'locutor',
        active: true,
        createdAt: new Date().toISOString(),
        ...hashPassword('dj2024'),
      },
      {
        id: 'u_paulo',
        username: 'dj_paulo',
        name: 'dj_paulo',
        role: 'locutor',
        active: false,
        createdAt: new Date().toISOString(),
        ...hashPassword('dj2024'),
      },
    ];
  }

  if (!db.settings.stationName) {
    Object.assign(db.settings, {
      stationName: 'Rádio Aurora FM',
      timezone: 'America/Sao_Paulo',
      description: 'Transmissão de louvor, estudos e reflexões — 24 horas no ar',
      notificationsDowntime: true,
      backupAuto: true,
      publicStats: false,
      autoStart: true, // retoma a transmissão automaticamente após reiniciar o servidor
      liveUser: 'source',
      livePass: 'k9$vT2mQpz',
      autodjPlaylistId: 'p_manha',
    });
  }

  if (!db.stream.format) {
    Object.assign(db.stream, {
      format: 'MP3',
      bitrate: 128,
      mount: '/stream',
      maxListeners: 500,
      title: 'Rádio Aurora FM — ao vivo',
      buffer: 4,
    });
  }

  if (db.playlists.length === 0) {
    db.playlists = [
      { id: 'p_manha', name: 'Louvor Manhã', shuffle: true, trackIds: [] },
      { id: 'p_noite', name: 'Reflexão da Noite', shuffle: true, trackIds: [] },
      { id: 'p_estudos', name: 'Estudos Bíblicos', shuffle: true, trackIds: [] },
      { id: 'p_anuncios', name: 'Anúncios da Semana', shuffle: false, trackIds: [] },
    ];
  }

  if (db.media.length === 0) {
    const agora = new Date().toISOString();
    db.media = [
      {
        id: 'm_espirito',
        title: 'Vem, Espírito Santo',
        format: 'MP3',
        duration: '3:42',
        size: 5.1,
        file: 'vem-espirito-santo.mp3',
        uploadedAt: agora,
      },
      {
        id: 'm_cordeiro',
        title: 'Digno é o Cordeiro',
        format: 'MP3',
        duration: '4:10',
        size: 5.8,
        file: 'digno-e-o-cordeiro.mp3',
        uploadedAt: agora,
      },
      {
        id: 'm_coracao',
        title: 'Coração em Chamas',
        format: 'MP3',
        duration: '3:15',
        size: 4.4,
        file: 'coracao-em-chamas.mp3',
        uploadedAt: agora,
      },
      {
        id: 'm_anuncio',
        title: 'Anúncio — Culto de domingo',
        format: 'MP3',
        duration: '0:38',
        size: 0.9,
        file: 'anuncio-culto.mp3',
        uploadedAt: agora,
      },
    ];
    db.playlists[0].trackIds = ['m_espirito', 'm_cordeiro', 'm_coracao', 'm_anuncio'];
  }

  store.save(true);
  store.flushNow().then(() => {
    console.log('✔ Base de dados inicial criada em data/db.json');
    console.log('  Usuário admin: admin / aurora2024  (TROQUE a senha depois do primeiro acesso!)');
  });
}

if (require.main === module) {
  run();
}

module.exports = { run };