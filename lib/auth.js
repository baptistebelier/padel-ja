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
/* lien « mot de passe oublié » : valable 1 h, et une seule fois (il porte une empreinte du mot de passe
   actuel : dès que le mot de passe change, le lien ne marche plus) */
const passPrint = hash => crypto.createHash('sha256').update(String(hash || 'aucun')).digest('base64url').slice(0, 12);
// ttl : 1 h pour « mot de passe oublié », 7 jours pour activer un compte créé par un achat
function makeResetToken(user, now = Date.now(), ttl = 3600e3) {
  const v = `r.${user.id}.${now + ttl}.${passPrint(user.pass_hash)}`;
  return `${v}.${sign(v)}`;
}
function readResetToken(tok, now = Date.now()) {
  const parts = String(tok || '').split('.');
  if (parts.length !== 5 || parts[0] !== 'r') return null;
  const v = parts.slice(0, 4).join('.'), sig = sign(v);
  if (sig.length !== parts[4].length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(parts[4]))) return null;
  if (+parts[2] < now) return null;
  return { userId: parts[1], print: parts[3] };
}
const resetMatches = (user, t) => !!(user && t && passPrint(user.pass_hash) === t.print);

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(c => { const i = c.indexOf('='); if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); });
  return out;
}
/* Compte /RAM unique : sur riseandmove.fr, la session vaut pour tous les sous-domaines
   (ja.riseandmove.fr = Padel JA, club.riseandmove.fr = RAM Club). L'ancien cookie limité à un seul
   sous-domaine est effacé au passage. En local (localhost), un cookie simple. */
const sharedDomain = req => {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0].toLowerCase();
  return /(^|\.)riseandmove\.fr$/.test(host) ? '.riseandmove.fr' : '';
};
function sessionCookie(req, token, days) {
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
  const dom = sharedDomain(req);
  const clearHostOnly = `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  const value = token
    ? `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${(days || DAYS) * 86400}${secure}`
    : clearHostOnly;
  if (!dom) return value;
  return [clearHostOnly, value + `; Domain=${dom}`];
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

module.exports = { hashPassword, checkPassword, makeToken, sessionCookie, sessionUserId, randomId, randomPin, tooManyAttempts, makeResetToken, readResetToken, resetMatches };
