/* PADEL JA — comptes : mots de passe chiffrés (scrypt) et session signée (cookie) */
'use strict';
const crypto = require('crypto');

const SECRET = process.env.SESSION_SECRET || 'padelja-local-' + require('os').hostname();
const COOKIE = 'pja_session';
const DAYS = 30;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `scrypt$${salt}$${h}`;
}
function checkPassword(pw, stored) {
  if (!stored) return false;
  const [, salt, h] = String(stored).split('$');
  const test = crypto.scryptSync(String(pw), salt, 64);
  const ref = Buffer.from(h, 'hex');
  return ref.length === test.length && crypto.timingSafeEqual(ref, test);
}

const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
function makeToken(userId, days) {
  const exp = Date.now() + (days || DAYS) * 86400000;
  const v = `${userId}.${exp}`;
  return `${v}.${sign(v)}`;
}
function readToken(tok) {
  if (!tok) return null;
  const parts = tok.split('.'); if (parts.length !== 3) return null;
  const v = `${parts[0]}.${parts[1]}`;
  const sig = sign(v);
  if (sig.length !== parts[2].length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(parts[2]))) return null;
  if (+parts[1] < Date.now()) return null;
  return parts[0];
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(c => { const i = c.indexOf('='); if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); });
  return out;
}
function sessionCookie(req, token, days) {
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
  if (!token) return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${(days || DAYS) * 86400}${secure}`;
}
const sessionUserId = req => readToken(parseCookies(req)[COOKIE]);

const randomId = (n = 10) => crypto.randomBytes(n).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, n);
const randomPin = () => String(crypto.randomInt(100000, 1000000));   // 6 chiffres (les anciens tournois gardent leur code à 4 chiffres)

/* anti-force brute très simple sur la connexion */
const attempts = new Map();
function tooManyAttempts(key) {
  const now = Date.now(), a = attempts.get(key) || { n: 0, t: now };
  if (now - a.t > 15 * 60000) { a.n = 0; a.t = now; }
  a.n++; attempts.set(key, a);
  return a.n > 12;
}

module.exports = { hashPassword, checkPassword, makeToken, sessionCookie, sessionUserId, randomId, randomPin, tooManyAttempts };
