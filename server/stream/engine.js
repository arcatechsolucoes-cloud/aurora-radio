// server/stream/engine.js — estado da transmissão: AutoDJ (playlists), fonte ao vivo e estatísticas.
'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const Broadcaster = require('./broadcaster');
const config = require('../config');

const CHUNK = 8192;
const MAX_HISTORY = 20;

class StreamEngine extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.broadcaster = new Broadcaster(() => {
      this._onListenerChange();
    });
    this.running = false; // AutoDJ ligado/desligado
    this.live = false; // alguém transmitindo ao vivo
    this.liveSourceName = null;
    this.liveTrackTitle = null;
    this.nowPlaying = null; // { title, playlist, file }
    this.history = []; // últimos títulos tocados
    this.uptimeSeconds = 0;
    this.peakNow = 0;
    this.totalConnected = 0;
    this.startedAt = null;

    this._shuffleBag = [];
    this._autoIndex = 0;
    this._loopActive = false;
    this._lastPersist = Date.now();

    setInterval(() => this._tick(), 1000);
  }

  // ---------- controle ----------
  start() {
    if (this.running) return;
    this.running = true;
    if (!this.startedAt) this.startedAt = Date.now();
    this._ensureLoop();
  }

  stop() {
    this.running = false;
    // mantém ouvintes se houver fonte ao vivo; senão ficam fora do ar
    this._resetNowPlayingForStop();
  }

  toggle() {
    if (this.running) this.stop();
    else this.start();
    return this.running;
  }

  isOnAir() {
    return this.running || this.live;
  }

  _resetNowPlayingForStop() {
    if (!this.live && this.running === false) {
      this.nowPlaying = null;
    }
  }

  // ---------- AutoDJ ----------
  _ensureLoop() {
    if (this._loopActive) return;
    this._loopActive = true;
    this._autodjLoop().catch((err) => {
      console.error('[engine] erro no loop AutoDJ:', err.message);
    });
  }

  _buildShuffleBag() {
    const playlist = this._selectedPlaylist();
    const tracks = this._playlistFiles(playlist);
    if (tracks.length === 0) return [];
    // embaralha
    const bag = tracks.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return bag;
  }

  _selectedPlaylist() {
    const cfg = this.store.getSettings();
    const id = cfg.autodjPlaylistId;
    return this.store.getPlaylists().find((p) => String(p.id) === String(id)) || null;
  }

  _playlistFiles(playlist) {
    const media = this.store.getMedia();
    const byId = new Map(media.map((m) => [String(m.id), m]));
    let ids;
    if (playlist && playlist.trackIds && playlist.trackIds.length > 0) {
      ids = playlist.trackIds;
    } else {
      ids = media.map((m) => String(m.id)); // fallback: biblioteca inteira
    }
    const files = [];
    for (const id of ids) {
      const m = byId.get(String(id));
      if (!m) continue;
      const full = path.join(config.uploadsDir, m.file);
      if (m.format && String(m.format).toUpperCase() !== 'MP3') continue; // v1: só MP3 no AutoDJ
      if (fs.existsSync(full)) {
        files.push({ meta: m, path: full });
      }
    }
    // se a playlist não tem arquivos no disco, toca qualquer MP3 existente da biblioteca
    if (files.length === 0) {
      for (const m of media) {
        if (!m || (m.format && String(m.format).toUpperCase() !== 'MP3')) continue;
        const full = path.join(config.uploadsDir, m.file);
        if (fs.existsSync(full)) files.push({ meta: m, path: full });
      }
    }
    // última garantia: faixa demo embutida no repositório
    if (files.length === 0 && fs.existsSync(config.demoFile)) {
      files.push({
        meta: {
          id: 'demo',
          title: 'Aurora FM — Abertura (demo)',
          duration: '0:03',
          file: 'aurora-demo.mp3',
          format: 'MP3',
        },
        path: config.demoFile,
      });
    }
    return files;
  }

  _nextTrack() {
    const playlist = this._selectedPlaylist();
    const shuffle = !!(playlist && playlist.shuffle);
    const files = this._playlistFiles(playlist);
    if (files.length === 0) return null;

    if (shuffle) {
      if (this._shuffleBag.length === 0) this._shuffleBag = this._buildShuffleBag();
      const item = this._shuffleBag.pop();
      return item || null;
    }
    const idx = this._autoIndex % files.length;
    this._autoIndex++;
    // evita repetir a mesma música duas vezes seguidas (com poucas faixas)
    if (files.length > 1 && this.nowPlaying && files[idx].meta.id === this.nowPlaying.meta?.id) {
      this._autoIndex++;
    }
    return files[this._autoIndex % files.length];
  }

  async _autodjLoop() {
    while (true) {
      if (!this.running || this.live) {
        await sleep(300);
        continue;
      }
      const track = this._nextTrack();
      if (!track) {
        await sleep(1000);
        continue;
      }
      this.nowPlaying = {
        title: track.meta.title,
        playlist: this._selectedPlaylist()?.name || 'Biblioteca',
        file: track.meta.file,
        meta: track.meta,
      };
      this._pushTitleToMetadata(track.meta.title);
      this.emit('nowplaying', this.nowPlaying);

      await this._streamFile(track.path);

      this.history.unshift({ title: track.meta.title, at: new Date().toISOString(), dur: track.meta.duration });
      if (this.history.length > MAX_HISTORY) this.history.length = MAX_HISTORY;
    }
  }

  _streamFile(filePath) {
    // marca o ritmo de reprodução: bytes por segundo = bitrate configurado
    const bytesPerSec = ((this.store.getStreamCfg().bitrate || 128) * 1000) / 8;
    return new Promise((resolve) => {
      let stream;
      let ended = false;
      const finish = () => {
        if (ended) return;
        ended = true;
        resolve();
      };
      try {
        stream = fs.createReadStream(filePath, { highWaterMark: CHUNK });
      } catch (_) {
        return finish();
      }
      stream.on('data', (c) => {
        // pausa até o tempo real daquele trecho passar
        stream.pause();
        const delay = Math.max(10, (c.length / bytesPerSec) * 1000);
        setTimeout(() => {
          if (!this.running || this.live) {
            stream.destroy();
            return finish();
          }
          this.broadcaster.push(c);
          stream.resume();
        }, delay);
      });
      stream.on('end', finish);
      stream.on('error', finish);
      stream.on('close', finish);
    });
  }

  _pushTitleToMetadata(title) {
    // notifica ouvintes com suporte a metadados ICY (best effort)
    this.emit('title', title);
  }

  // ---------- fonte ao vivo (Icecast) ----------
  startLive(sourceName) {
    this.live = true;
    this.liveSourceName = sourceName || 'Fonte ao vivo';
    this.nowPlaying = { title: '— TOCOU AO VIVO —', playlist: sourceName || 'Fonte ao vivo', meta: null };
    this._shuffleBag = [];
    const stats = this.store.getStats();
    stats.streamsToday++;
    stats.liveLog = stats.liveLog || [];
    this.store.getLiveLog().push({ name: sourceName || 'Fonte ao vivo', at: new Date().toISOString() });
    if (this.store.getLiveLog().length > 50) this.store.getLiveLog().splice(0, this.store.getLiveLog().length - 50);
    this.store.save();
    this.emit('livechange', true);
  }

  stopLive() {
    this.live = false;
    this.liveSourceName = null;
    if (!this.running) this.nowPlaying = null;
    this.emit('livechange', false);
  }

  incomingAudio(chunk) {
    this.broadcaster.push(chunk);
  }

  // ---------- ouvintes / tick ----------
  _onListenerChange() {
    // registra conexões totais
  }

  registerListener() {
    this.totalConnected++;
    this.store.getStats().totalListenersAll++;
  }

  _tick() {
    const now = Date.now();
    if (this.isOnAir()) this.uptimeSeconds++;
    const current = this.broadcaster.count;

    // fora do ar: desconecta ouvintes (o player mostra "Fora do ar")
    if (!this.isOnAir() && current > 0) {
      this.broadcaster.stopAll();
    }

    if (this.isOnAir() && current > this.peakNow) this.peakNow = current;
    if (current > this.store.getStats().peakToday) {
      this.store.getStats().peakToday = current;
    }

    // persistência periódica
    if (now - this._lastPersist > config.persistInterval * 1000) {
      this._lastPersist = now;
      this.store.save();
    }
  }

  // ---------- estado completo para o painel ----------
  state() {
    const cfg = this.store.getStreamCfg();
    const stats = this.store.getStats();
    const listeners = this.broadcaster.count;
    const playlist = this._selectedPlaylist();
    return {
      onAir: this.isOnAir(),
      running: this.running,
      live: this.live,
      liveSourceName: this.liveSourceName,
      nowPlaying: this.nowPlaying
        ? { title: this.nowPlaying.title, playlist: this.nowPlaying.playlist }
        : null,
      history: this.history.slice(0, 8),
      listeners,
      peakToday: stats.peakToday,
      totalConnected: this.totalConnected,
      uptimeSeconds: this.uptimeSeconds,
      bitrate: cfg.bitrate || 128,
      format: cfg.format || 'MP3',
      mount: cfg.mount || '/stream',
      playlistShuffle: !!(playlist && playlist.shuffle),
      playlistName: playlist ? playlist.name : null,
      queuePreview: this._queuePreview(playlist),
      startedAt: this.startedAt ? new Date(this.startedAt).toISOString() : null,
    };
  }

  _queuePreview(playlist) {
    // usa as mesmas faixas realmente tocáveis do AutoDJ
    const files = this._playlistFiles(playlist);
    const out = [];
    let n = 0;
    for (const f of files) {
      const m = f.meta;
      // se for a música tocando, pula para a próxima
      if (this.nowPlaying && this.nowPlaying.meta && String(this.nowPlaying.meta.id) === String(m.id)) continue;
      out.push({ title: m.title, duration: m.duration });
      if (++n >= 3) break;
    }
    return out;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = StreamEngine;