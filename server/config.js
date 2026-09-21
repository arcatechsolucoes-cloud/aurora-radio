// server/config.js — configuração central do painel (lê variáveis de ambiente/.env)
'use strict';

const fs = require('fs');
const path = require('path');

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

try { loadEnvFile(); } catch (_) { /* ignora */ }

const ROOT = path.join(__dirname, '..');

function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function envInt(name, fallback) {
  const v = parseInt(env(name, ''), 10);
  return Number.isFinite(v) ? v : fallback;
}

const config = {
  root: ROOT,
  // Porta HTTP do painel (página + API)
  port: envInt('PORT', 3000),
  // Porta anunciada para a fonte ao vivo (embutida na mesma porta HTTP;
  // use 80 em produção para softwares de locução, que não falam HTTPS)
  streamPort: envInt('STREAM_PORT', 3000),
  // Host público anunciado no painel (endereço do servidor)
  publicHost: env('PUBLIC_HOST', 'localhost'),
  // Diretório de dados (banco JSON + uploads). Use volume persistente em produção.
  dataDir: env('DATA_DIR', path.join(ROOT, 'data')),
  // Segredo para assinar o cookie de sessão (mude em produção!)
  sessionSecret: env('SESSION_SECRET', 'aurora-panel-dev-secret-troque-em-producao'),
  // Título padrão da estação
  stationName: env('STATION_NAME', 'Rádio Aurora FM'),
  // Limite de tamanho de upload (bytes) — default 200 MB
  maxUploadBytes: envInt('MAX_UPLOAD_BYTES', 200 * 1024 * 1024),
  // Intervalo (s) de gravação das estatísticas no disco
  persistInterval: envInt('PERSIST_INTERVAL', 30),
  // Caminho do banco JSON
  get dbFile() { return path.join(this.dataDir, 'db.json'); },
  get uploadsDir() { return path.join(this.dataDir, 'uploads'); },
  // Faixa demo embutida no repositório (garante áudio no primeiro uso,
  // antes de o usuário enviar músicas reais)
  get demoFile() { return path.join(ROOT, 'assets', 'aurora-demo.mp3'); },
};

module.exports = config;