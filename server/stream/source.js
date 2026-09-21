// server/stream/source.js — aceita conexões de locutores (protocolo Icecast: SOURCE/PUT)
// Embarcado no próprio servidor HTTP do painel (funciona na mesma porta pública,
// inclusive no Fly.io / Render, que expõem apenas uma porta).
'use strict';

function basicAuth(headers) {
  const authHeader = headers['authorization'] || '';
  const b64 = authHeader.replace(/^Basic\s+/i, '');
  if (!b64) return null;
  try {
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    const ci = decoded.indexOf(':');
    if (ci < 0) return null;
    return { user: decoded.slice(0, ci), pass: decoded.slice(ci + 1) };
  } catch (_) {
    return null;
  }
}

// Cria o handler embutido: req/res do servidor HTTP do painel.
function handleSourceRequest(engine, store) {
  return function sourceHandler(req, res) {
    const method = (req.method || '').toUpperCase();
    if (method !== 'SOURCE' && method !== 'PUT') {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Metodo invalido');
    }

    // mount da URL: SOURCE /live HTTP/1.0
    const m = (req.url || '/').match(/^\/([^\s?]*)/);
    const mount = m && m[1] ? '/' + m[1] : '/live';

    // autenticação Basic (usuário/senha da fonte ao vivo)
    const settings = store.getSettings();
    const expectedUser = settings.liveUser || 'source';
    const expectedPass = settings.livePass || 'livepass';
    const creds = basicAuth(req.headers);
    const ok = !!creds && creds.user === expectedUser && creds.pass === expectedPass;

    if (!ok) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="source"' });
      return res.end();
    }

    engine.startLive(req.headers['ice-name'] || settings.stationName || 'Fonte ao vivo');
    console.log(
      `[source] ${req.headers['ice-name'] || settings.stationName || 'Fonte ao vivo'} conectou na mount ${mount} (${req.headers['content-type'] || 'desconhecido'})`
    );

    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.flushHeaders();

    let ended = false;
    const stopLive = () => {
      if (ended) return;
      ended = true;
      engine.stopLive();
      console.log('[source] fonte ao vivo desconectada — AutoDJ retomando');
    };

    req.on('data', (c) => engine.incomingAudio(c));
    req.on('end', stopLive);
    req.on('close', stopLive);
    req.on('error', stopLive);
    res.on('close', stopLive);
    res.on('error', stopLive);
  };
}

module.exports = { handleSourceRequest };