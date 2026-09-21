// server/auth.js — autenticação: hash de senha (scrypt), sessões em memória com cookie assinado.
'use strict';

const crypto = require('crypto');
const config = require('./config');

const SESSIONS = new Map(); // token -> { username, role, name, createdAt, lastSeen }

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), s, 64).toString('hex');
  return { salt: s, hash };
}

function verifyPassword(password, record) {
  if (!record || !record.salt || !record.hash) return false;
  const { hash } = hashPassword(password, record.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(record.hash, 'hex'));
}

function findUser(users, username) {
  if (!users || !username) return null;
  return users.find(
    (u) => u.username && u.username.toLowerCase() === String(username).toLowerCase()
  );
}

function createSession(user) {
  const id = crypto.randomBytes(24).toString('hex');
  const sig = sign(id);
  const token = id + '.' + sig;
  SESSIONS.set(id, {
    username: user.username,
    role: user.role,
    name: user.name,
    createdAt: Date.now(),
    lastSeen: Date.now(),
  });
  return token;
}

function sign(value) {
  return crypto.createHmac('sha256', config.sessionSecret).update(value).digest('hex');
}

function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [id, sig] = token.split('.');
  if (!id || !sig) return null;
  const expected = sign(id);
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return id;
}

function destroySession(token) {
  const id = verifyToken(token);
  if (id) SESSIONS.delete(id);
}

function getSession(token) {
  const id = verifyToken(token);
  const s = id ? SESSIONS.get(id) : null;
  if (s) s.lastSeen = Date.now();
  return s;
}

// Middleware para rotas autenticadas
function requireAuth(req, res, next) {
  const token = parseCookie(req).session;
  const session = getSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  req.session = session;
  req.sessionToken = token;
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.session && req.session.role === role) return next();
    res.status(403).json({ error: 'Acesso restrito a administradores' });
  };
}

function parseCookie(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function sessionCookie(token) {
  return (
    'session=' +
    encodeURIComponent(token) +
    '; HttpOnly; Path=/; SameSite=Lax' +
    (config.cookieSecure ? '; Secure' : '')
  );
}

function clearCookie() {
  return 'session=; HttpOnly; Path=/; Max-Age=0';
}

module.exports = {
  hashPassword,
  verifyPassword,
  findUser,
  createSession,
  destroySession,
  getSession,
  requireAuth,
  requireRole,
  sessionCookie,
  clearCookie,
  parseCookie,
};