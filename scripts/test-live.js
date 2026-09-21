// scripts/test-live.js — simula um locutor conectando pelo protocolo Icecast (teste rápido)
// Uso: node scripts/test-live.js [segundos]
'use strict';
const net = require('net');

const SECONDS = parseInt(process.argv[2] || '3', 10);
const HOST = process.env.LIVE_HOST || '127.0.0.1';
const PORT = parseInt(process.env.LIVE_PORT || '3000', 10); // mesma porta do painel
const USER = process.env.LIVE_USER || 'source';
const PASS = process.env.LIVE_PASS || 'k9$vT2mQpz'; // senha padrão do seed — ajuste se mudou

const b64 = Buffer.from(USER + ':' + PASS).toString('base64');

const sock = net.connect({ host: HOST, port: PORT }, () => {
  console.log('[live] conectado na porta ' + PORT);
  sock.write(
    'SOURCE /live HTTP/1.0\r\n' +
      'Host: ' + HOST + ':' + PORT + '\r\n' +
      'User-Agent: aurora-test-locutor/1.0\r\n' +
      'Content-Type: audio/mpeg\r\n' +
      'Ice-Name: Teste do Locutor\r\n' +
      'Authorization: Basic ' + b64 + '\r\n' +
      '\r\n'
  );
  const chunk = Buffer.alloc(4096, 0x55);
  const timer = setInterval(() => sock.write(chunk), 200);
  setTimeout(() => {
    clearInterval(timer);
    sock.end();
    console.log('[live] simula desconexão do locutor');
    process.exit(0);
  }, SECONDS * 1000);
});

sock.on('data', (d) => {
  console.log('[live] resposta do servidor:', JSON.stringify(d.toString('utf8').slice(0, 120)));
});
sock.on('error', (e) => {
  console.error('[live] erro:', e.message);
  process.exit(1);
});