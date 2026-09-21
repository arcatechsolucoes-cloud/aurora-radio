// server/store.js — persistência simples em JSON (data/db.json) com gravação atômica e debounce.
'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');

class Store {
  constructor() {
    this.data = null;
    this._dirty = false;
    this._timer = null;
    this._writeChain = Promise.resolve();
  }

  ensureDirs() {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.mkdirSync(config.uploadsDir, { recursive: true });
  }

  load() {
    this.ensureDirs();
    if (fs.existsSync(config.dbFile)) {
      try {
        this.data = JSON.parse(fs.readFileSync(config.dbFile, 'utf8'));
      } catch (err) {
        console.error('[store] Falha ao ler db.json, iniciando limpo:', err.message);
        this.data = null;
      }
    }
    if (!this.data || typeof this.data !== 'object') this.data = {};
    this.#applyDefaults();
    return this.data;
  }

  #applyDefaults() {
    const d = this.data;
    d.users = d.users || [];
    d.settings = d.settings || {};
    d.stream = d.stream || {};
    d.playlists = d.playlists || [];
    d.media = d.media || [];
    d.stats = d.stats || {
      peakToday: 0,
      totalListenersToday: 0,
      totalListenersAll: 0,
      streamsToday: 0,
      history: [],
    };
    d.liveLog = d.liveLog || [];
    d.meta = d.meta || { createdAt: new Date().toISOString() };
  }

  get db() {
    return this.data;
  }

  save(immediate) {
    this._dirty = true;
    if (this._timer) clearTimeout(this._timer);
    const delay = immediate ? 0 : 250;
    this._timer = setTimeout(() => this._flush(), delay);
  }

  async _flush() {
    if (!this._dirty) return;
    this._dirty = false;
    const json = JSON.stringify(this.data, null, 2);
    const tmp = config.dbFile + '.tmp';
    const chain = this._writeChain.then(() =>
      new Promise((resolve, reject) => {
        fs.writeFile(tmp, json, (err) => {
          if (err) return reject(err);
          fs.rename(tmp, config.dbFile, (err2) => (err2 ? reject(err2) : resolve()));
        });
      })
    );
    this._writeChain = chain.catch((err) => {
      console.error('[store] Erro ao gravar:', err.message);
    });
    await chain;
  }

  flushNow() {
    return this._flush();
  }

  // helpers de acesso rápido
  getSettings() {
    return this.data.settings;
  }
  getStreamCfg() {
    return this.data.stream;
  }
  getUsers() {
    return this.data.users;
  }
  getMedia() {
    return this.data.media;
  }
  getPlaylists() {
    return this.data.playlists;
  }
  getStats() {
    return this.data.stats;
  }
  getLiveLog() {
    return this.data.liveLog;
  }
}

module.exports = new Store();