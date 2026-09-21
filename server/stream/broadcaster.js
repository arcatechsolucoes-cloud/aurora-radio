// server/stream/broadcaster.js — distribui um único fluxo de áudio para todos os ouvintes conectados.
'use strict';

const crypto = require('crypto');

const MAX_QUEUE = 1024 * 1024; // 1 MB de buffer por ouvinte lento, depois desconecta

class Broadcaster {
  constructor(onListenerChange) {
    this.listeners = new Map(); // id -> { res, queue: [], destroyed }
    this.onListenerChange = onListenerChange || (() => {});
    this._flushTimer = setInterval(() => this._flushAll(), 250);
  }

  get count() {
    return this.listeners.size;
  }

  addListener(res) {
    const id = crypto.randomBytes(8).toString('hex');
    const entry = { res, queue: [], destroyed: false, bytes: 0 };
    this.listeners.set(id, entry);
    this.onListenerChange();
    return id;
  }

  removeListener(id) {
    const entry = this.listeners.get(id);
    if (!entry) return;
    this.listeners.delete(id);
    if (!entry.destroyed) {
      entry.destroyed = true;
      try { entry.res.end(); } catch (_) {}
    }
    this.onListenerChange();
  }

  push(chunk) {
    if (!chunk || chunk.length === 0) return;
    for (const [id, entry] of this.listeners) {
      if (entry.destroyed) continue;
      entry.bytes += chunk.length;
      let ok = true;
      try {
        ok = entry.res.write(chunk);
      } catch (_) {
        this.removeListener(id);
        continue;
      }
      if (!ok) {
        entry.queue.push(chunk);
        if (entry.queue.reduce((a, b) => a + b.length, 0) > MAX_QUEUE) {
          this.removeListener(id); // ouvinte lento demais
        }
      }
    }
  }

  _flushAll() {
    for (const [id, entry] of this.listeners) {
      if (entry.destroyed || entry.queue.length === 0) continue;
      let drained = false;
      try {
        while (entry.queue.length > 0) {
          const b = entry.queue[0];
          if (entry.res.write(b)) {
            entry.queue.shift();
          } else {
            drained = true;
            break;
          }
        }
      } catch (_) {
        this.removeListener(id);
      }
      if (!drained && entry.queue.length === 0) {
        // tentar esvaziar novamente dobrando o write até voltar a fluir
      }
    }
  }

  stopAll() {
    for (const id of Array.from(this.listeners.keys())) this.removeListener(id);
  }

  destroy() {
    clearInterval(this._flushTimer);
    this.stopAll();
    this.listeners.clear();
  }
}

module.exports = Broadcaster;