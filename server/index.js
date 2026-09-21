// server/index.js — ponto de entrada do painel: HTTP (painel + API) e streaming (fonte ao vivo + ouvintes).
'use strict';

const express = require('express');
const path = require('path');
const http = require('http');
const config = require('./config');
const store = require('./store');
const auth = require('./auth');
const StreamEngine = require('./stream/engine');
const { handleSourceRequest } = require('./stream/source');
const createApi = require('./api');

async function main() {
  // 1. banco de dados
  store.load();
  if (store.getUsers().length === 0) {
    const { run } = require('./seed');
    run();
  }

  // 2. motor de streaming
  const engine = new StreamEngine(store);

  // retoma a transmissão automaticamente após reinício (configurável em Config)
  if (store.getSettings().autoStart !== false) {
    engine.start();
  }

  // 4. aplicação web
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // registro de ouvintes no stream
  app.get('/stream', (req, res) => {
    // endpoint público: os ouvintes conectam aqui
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-cache, no-store',
      'icy-name': store.getSettings().stationName || 'Rádio',
    });
    if (!engine.isOnAir()) {
      res.end();
      return;
    }
    engine.registerListener();
    const id = engine.broadcaster.addListener(res);
    req.on('close', () => engine.broadcaster.removeListener(id));
    // se ainda não há leitor, o AutoDJ não inicia sozinho por ouvinte;
    // use o botão Play no painel para iniciar a transmissão.
  });

  app.get('/stream.json', (req, res) => {
    // metadados públicos do stream (para o player e painel público)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(engine.state());
  });

  app.get('/listen', (req, res) => {
    res.sendFile(path.join(config.root, 'public', 'player.html'));
  });

  app.get('/login', (req, res) => {
    res.sendFile(path.join(config.root, 'public', 'login.html'));
  });

  app.use('/api', createApi(engine));

  // protege apenas a página do painel (o restante é público para o player/ouvintes)
  const guard = (req, res, next) => {
    if (req.path === '/' || req.path === '/index.html') {
      const session = auth.getSession(auth.parseCookie(req).session);
      if (!session) return res.redirect('/login');
    }
    next();
  };
  app.use('/', guard, express.static(path.join(config.root, 'public')));

  // tratamento de erros da API
  app.use((err, req, res, next) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Arquivo muito grande para o limite configurado' });
      }
      console.error('[http] erro:', err.message);
      if (res.headersSent) return next(err);
      return res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
    }
    next();
  });

  const server = http.createServer((req, res) => {
    // fonte ao vivo (protocolo Icecast) embutida na mesma porta do painel
    const method = (req.method || '').toUpperCase();
    if (method === 'SOURCE' || method === 'PUT') {
      return handleSourceRequest(engine, store)(req, res);
    }
    app(req, res);
  });

  // 5. sobe tudo
  server.listen(config.port, () => {
    console.log(`[painel] ${store.getSettings().stationName || 'Rádio'} no ar!`);
    console.log(`         Painel: http://localhost:${config.port}`);
    console.log(`         Player/ouvintes: http://localhost:${config.port}/listen`);
    console.log(`         Stream: http://localhost:${config.port}/stream`);
    console.log(`         Fonte ao vivo (locutores): http://localhost:${config.port}/live`);
  });

  // persistência ao encerrar
  const shutdown = () => {
    console.log('\n[painel] Encerrando e salvando dados...');
    engine.broadcaster.destroy();
    server.close(() => {
      store.flushNow().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[painel] Falha ao iniciar:', err);
  process.exit(1);
});