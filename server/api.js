// server/api.js — rotas REST do painel (autenticadas, com papéis admin/locutor).
'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const config = require('./config');
const auth = require('./auth');
const store = require('./store');

module.exports = function createApi(engine) {
  const router = express.Router();

  // ---------- helpers ----------
  function slugify(name) {
    return (
      String(name)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'arquivo'
    );
  }

  function fmtDuration(seconds) {
    seconds = Math.max(0, Math.round(seconds));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function sanitizeUser(u) {
    return { id: u.id, username: u.username, name: u.name, role: u.role, active: u.active };
  }

  function sendUser(user) {
    return {
      ...sanitizeUser(user),
      password: '',
    };
  }

  // ---------- tipos de mídia ----------
  const MEDIA_TYPES = ['musica', 'vinheta', 'programete', 'hora_certa'];
  const normType = (t) => (MEDIA_TYPES.includes(String(t)) ? String(t) : 'musica');

  // ---------- upload de mídia ----------
  const storage = multer.diskStorage({
    destination(req, file, cb) {
      cb(null, config.uploadsDir);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const name = slugify(path.basename(file.originalname || 'audio', ext));
      cb(null, `${Date.now()}-${name}${ext}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: config.maxUploadBytes },
    fileFilter(req, file, cb) {
      const okExt = ['.mp3', '.aac', '.m4a', '.ogg', '.wav', '.flac'];
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (okExt.includes(ext) || (file.mimetype || '').startsWith('audio/') || ext === '') {
        return cb(null, true);
      }
      cb(new Error('Formato de áudio não suportado'));
    },
  });

  // ---------- auth ----------
  router.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Informe usuário e senha' });
    const user = auth.findUser(store.getUsers(), username);
    if (!user || !user.active) return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    if (!auth.verifyPassword(password, user)) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }
    const token = auth.createSession(user);
    res.setHeader('Set-Cookie', auth.sessionCookie(token));
    res.json({ user: sanitizeUser(user) });
  });

  router.post('/logout', auth.requireAuth, (req, res) => {
    auth.destroySession(req.sessionToken);
    res.setHeader('Set-Cookie', auth.clearCookie());
    res.json({ ok: true });
  });

  router.get('/session', auth.requireAuth, (req, res) => {
    res.json({ user: { username: req.session.username, role: req.session.role, name: req.session.name } });
  });

  // ---------- painel ----------
  router.get('/dashboard', auth.requireAuth, (req, res) => {
    const s = engine.state();
    const db = store.db;
    let usedBytes = 0;
    try {
      usedBytes = dirSize(config.uploadsDir);
    } catch (_) {}
    res.json({
      ...s,
      storage: {
        usedBytes,
        maxBytes: config.maxUploadBytes,
        usedGB: +(usedBytes / 1e9).toFixed(2),
        maxGB: 10, // exibição (limite do plano)
        trackCount: db.media.length,
      },
      liveSource: {
        status: db.settings.liveUser ? 'disponível' : 'configurar',
        lastDj: db.liveLog.slice(-1)[0]?.name || '—',
      },
    });
  });

  router.post('/transport', auth.requireAuth, (req, res) => {
    const on = !!(req.body && req.body.running);
    if (on) engine.start();
    else engine.stop();
    res.json({ running: engine.running });
  });

  // ---------- configuração de stream ----------
  router.get('/streams/config', auth.requireAuth, (req, res) => {
    res.json(store.getStreamCfg());
  });

  router.put('/streams/config', auth.requireAuth, auth.requireRole('admin'), (req, res) => {
    const cfg = store.getStreamCfg();
    const b = req.body || {};
    if (b.format) cfg.format = b.format;
    if (b.bitrate) cfg.bitrate = parseInt(b.bitrate, 10);
    if (b.mount) cfg.mount = b.mount.startsWith('/') ? b.mount : '/' + b.mount;
    if (b.maxListeners) cfg.maxListeners = parseInt(b.maxListeners, 10);
    if (b.title) cfg.title = b.title;
    if (b.buffer !== undefined) cfg.buffer = parseInt(b.buffer, 10);
    store.save();
    res.json(cfg);
  });

  // ---------- playlists ----------
  router.get('/playlists', auth.requireAuth, (req, res) => {
    res.json(store.getPlaylists());
  });

  router.post('/playlists', auth.requireAuth, auth.requireRole('admin'), (req, res) => {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ error: 'Nome obrigatório' });
    const playlist = {
      id: 'p_' + crypto.randomBytes(4).toString('hex'),
      name: String(b.name).slice(0, 80),
      shuffle: !!b.shuffle,
      trackIds: Array.isArray(b.trackIds) ? b.trackIds : [],
    };
    store.getPlaylists().push(playlist);
    store.save();
    res.json(playlist);
  });

  router.patch('/playlists/:id', auth.requireAuth, auth.requireRole('admin'), (req, res) => {
    const p = store.getPlaylists().find((x) => x.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'Playlist não encontrada' });
    const b = req.body || {};
    if (b.name !== undefined) p.name = String(b.name).slice(0, 80);
    if (b.shuffle !== undefined) p.shuffle = !!b.shuffle;
    if (Array.isArray(b.trackIds)) p.trackIds = b.trackIds;
    store.save();
    res.json(p);
  });

  router.delete('/playlists/:id', auth.requireAuth, auth.requireRole('admin'), (req, res) => {
    const list = store.getPlaylists();
    const idx = list.findIndex((x) => x.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Playlist não encontrada' });
    list.splice(idx, 1);
    store.save();
    res.json({ ok: true });
  });

  // ---------- mídia ----------
  router.get('/media', auth.requireAuth, (req, res) => {
    const bits = new Map();
    for (const p of store.getPlaylists()) {
      for (const id of p.trackIds) {
        bits.set(String(id), (bits.get(String(id)) || 0) + 1);
      }
    }
    const items = store.getMedia().map((m) => ({
      ...m,
      type: normType(m.type),
      playlistsCount: bits.get(String(m.id)) || 0,
    }));
    res.json(items);
  });

  router.post('/media/upload', auth.requireAuth, auth.requireRole('admin'), upload.array('files'), (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }
    const bitrate = store.getStreamCfg().bitrate || 128;
    const type = normType(req.body && req.body.type);
    const created = req.files.map((f) => {
      const ext = path.extname(f.originalname || '').toLowerCase().replace('.', '').toUpperCase() || 'MP3';
      const seconds = (f.size * 8) / (bitrate * 1000);
      const m = {
        id: 'm_' + crypto.randomBytes(4).toString('hex'),
        title: path.basename(f.originalname || 'faixa', path.extname(f.originalname || '')).slice(0, 120) || 'Faixa',
        type, // musica | vinheta | programete | hora_certa
        format: ext,
        duration: fmtDuration(seconds),
        size: +(f.size / 1e6).toFixed(1),
        file: f.filename,
        uploadedAt: new Date().toISOString(),
      };
      return m;
    });
    store.getMedia().push(...created);
    store.save();
    res.json({ created });
  });

  router.get('/media/:id/file', auth.requireAuth, (req, res) => {
    const m = store.getMedia().find((x) => x.id === req.params.id);
    if (!m) return res.status(404).json({ error: 'Arquivo não encontrado' });
    const full = path.join(config.uploadsDir, m.file);
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'Arquivo não existe no disco' });
    res.sendFile(full, {
      headers: { 'Content-Type': 'audio/' + (m.format || 'mpeg').toLowerCase() },
    });
  });

  router.delete('/media/:id', auth.requireAuth, auth.requireRole('admin'), (req, res) => {
    const list = store.getMedia();
    const idx = list.findIndex((x) => x.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Arquivo não encontrado' });
    const [m] = list.splice(idx, 1);
    // remove da playlist
    store.getPlaylists().forEach((p) => {
      p.trackIds = p.trackIds.filter((id) => String(id) !== String(m.id));
    });
    const full = path.join(config.uploadsDir, m.file);
    try { fs.unlinkSync(full); } catch (_) {}
    store.save();
    res.json({ ok: true });
  });

  router.patch('/media/:id', auth.requireAuth, auth.requireRole('admin'), (req, res) => {
    const m = store.getMedia().find((x) => x.id === req.params.id);
    if (!m) return res.status(404).json({ error: 'Arquivo não encontrado' });
    if (req.body && req.body.title !== undefined) m.title = String(req.body.title).slice(0, 120);
    if (req.body && req.body.type !== undefined) m.type = normType(req.body.type);
    store.save();
    res.json(m);
  });

  // ---------- usuários ----------
  router.get('/users', auth.requireAuth, auth.requireRole('admin'), (req, res) => {
    res.json(store.getUsers().map(sanitizeUser));
  });

  router.post('/users', auth.requireAuth, auth.requireRole('admin'), (req, res) => {
    const b = req.body || {};
    if (!b.username || !b.password) return res.status(400).json({ error: 'Usuário e senha obrigatórios' });
    if (auth.findUser(store.getUsers(), b.username)) {
      return res.status(409).json({ error: 'Nome de usuário já existe' });
    }
    const user = {
      id: 'u_' + crypto.randomBytes(4).toString('hex'),
      username: String(b.username).slice(0, 40),
      name: String(b.name || b.username).slice(0, 80),
      role: b.role === 'locutor' ? 'locutor' : 'admin',
      active: b.active !== false,
      createdAt: new Date().toISOString(),
      ...auth.hashPassword(b.password),
    };
    store.getUsers().push(user);
    store.save();
    res.json(sanitizeUser(user));
  });

  router.patch('/users/:id', auth.requireAuth, auth.requireRole('admin'), (req, res) => {
    const u = store.getUsers().find((x) => x.id === req.params.id);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
    const b = req.body || {};
    if (b.name !== undefined) u.name = String(b.name).slice(0, 80);
    if (b.role !== undefined) u.role = b.role === 'locutor' ? 'locutor' : 'admin';
    if (b.active !== undefined) u.active = !!b.active;
    if (b.password) {
      const { salt, hash } = auth.hashPassword(b.password);
      u.salt = salt;
      u.hash = hash;
    }
    store.save();
    res.json(sanitizeUser(u));
  });

  router.delete('/users/:id', auth.requireAuth, auth.requireRole('admin'), (req, res) => {
    const list = store.getUsers();
    const idx = list.findIndex((x) => x.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    const [u] = list.splice(idx, 1);
    if (u.username === 'admin') {
      list.splice(idx, 0, u); // devolve
      return res.status(400).json({ error: 'Não é possível remover o administrador principal' });
    }
    if (u.username === req.session.username) {
      list.splice(idx, 0, u); // devolve
      return res.status(400).json({ error: 'Você não pode excluir a própria conta' });
    }
    store.save();
    res.json({ ok: true });
  });

  // ---------- configurações gerais ----------
  router.get('/settings', auth.requireAuth, (req, res) => {
    const s = store.getSettings();
    res.json({
      stationName: s.stationName,
      timezone: s.timezone,
      description: s.description,
      notificationsDowntime: s.notificationsDowntime,
      backupAuto: s.backupAuto,
      publicStats: s.publicStats,
      autodjPlaylistId: s.autodjPlaylistId,
      autoStart: s.autoStart,
    });
  });

  router.put('/settings', auth.requireAuth, auth.requireRole('admin'), (req, res) => {
    const s = store.getSettings();
    const b = req.body || {};
    if (b.stationName !== undefined) s.stationName = String(b.stationName).slice(0, 80);
    if (b.timezone !== undefined) s.timezone = b.timezone;
    if (b.description !== undefined) s.description = String(b.description).slice(0, 160);
    if (b.notificationsDowntime !== undefined) s.notificationsDowntime = !!b.notificationsDowntime;
    if (b.backupAuto !== undefined) s.backupAuto = !!b.backupAuto;
    if (b.publicStats !== undefined) s.publicStats = !!b.publicStats;
    if (b.autoStart !== undefined) s.autoStart = !!b.autoStart;
    if (b.autodjPlaylistId !== undefined) s.autodjPlaylistId = b.autodjPlaylistId;
    store.save();
    res.json(store.getSettings());
  });

  // ---------- fonte ao vivo ----------
  router.get('/live/info', auth.requireAuth, (req, res) => {
    const s = store.getSettings();
    res.json({
      host: config.publicHost,
      port: config.streamPort,
      mount: store.getStreamCfg().mount === '/stream' ? '/live' : store.getStreamCfg().mount,
      user: s.liveUser || 'source',
      pass: s.livePass || 'livepass',
    });
  });

  router.put('/live/info', auth.requireAuth, auth.requireRole('admin'), (req, res) => {
    const s = store.getSettings();
    const b = req.body || {};
    if (b.user) s.liveUser = String(b.user).slice(0, 40);
    if (b.pass) s.livePass = String(b.pass).slice(0, 64);
    store.save();
    res.json({ user: s.liveUser, pass: s.livePass });
  });

  // ---------- estatísticas ----------
  router.get('/stats/history', auth.requireAuth, (req, res) => {
    const db = store.db;
    res.json({
      kpis: {
        peakListeners: db.stats.peakToday,
        totalListenersToday: db.stats.totalListenersToday,
        streamsToday: db.stats.streamsToday,
        uptime: fmtDuration(engine.uptimeSeconds),
      },
      history: engine.history.slice(0, 20),
      liveLog: db.liveLog.slice(-20).reverse(),
    });
  });

  return router;
};

function dirSize(dir) {
  let total = 0;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) total += dirSize(p);
    else total += fs.statSync(p).size;
  }
  return total;
}