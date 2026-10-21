/* =========================================================================
   PADEL JA — serveur (local ou en ligne), sans dépendance, Node.js >= 18
   - comptes juge-arbitre, plusieurs tournois par compte, démo en un clic
   - chaque tournoi a son « salon » temps réel (Server-Sent Events)
   - écrans TV / overlay ouverts sur un autre appareil : clé de diffusion
   - télécommande téléphone : code PIN du tournoi
   ========================================================================= */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Engine = require('./public/js/engine.js');
const { createStore, norm } = require('./lib/store.js');
const Auth = require('./lib/auth.js');

const PORT = +process.env.PORT || 3737;
const ROOT = path.join(__dirname, 'public');
const store = createStore(path.join(__dirname, 'data'));
const ONLINE = store.kind === 'supabase';

/* ---------------------------------------------------------------------
   utilitaires HTTP
   --------------------------------------------------------------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

function json(res, code, obj, headers) {
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {}));
  res.end(JSON.stringify(obj));
}
function redirect(res, to, headers) { res.writeHead(302, Object.assign({ Location: to }, headers || {})); res.end(); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', d => { b += d; if (b.length > 20e6) req.destroy(); });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(new Error('JSON invalide')); } });
  });
}
function sendFile(res, rel) {
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Page introuvable'); }
    const ext = path.extname(file);
    // icônes (favicon, icône d'application) : toujours revérifiées pour que les changements de logo apparaissent
    const longCache = /\.(woff2|png|webp|jpg)$/.test(ext) && !/favicon|app-icon/.test(rel);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': longCache ? 'public, max-age=604800' : 'no-cache' });
    res.end(data);
  });
}
function lanAddresses() {
  const out = [];
  Object.values(os.networkInterfaces()).forEach(l => (l || []).forEach(i => { if (i.family === 'IPv4' && !i.internal) out.push(i.address); }));
  return out;
}
const origin = req => `${(req.headers['x-forwarded-proto'] || 'http').split(',')[0]}://${req.headers['x-forwarded-host'] || req.headers.host}`;
/* administrateurs : e-mails listés dans ADMIN_EMAILS (Render), ou offre « admin » */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'baptiste.belier@gmail.com').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
const isAdmin = u => !!(u && !u.guest && (ADMIN_EMAILS.includes(String(u.email || '').toLowerCase()) || u.plan === 'admin'));
// offres : essai, actif (abonnement payé), offert (accès gratuit), admin
const PLANS = { essai: 'Essai', actif: 'Abonné', offert: 'Accès offert', admin: 'Administrateur' };
const freeAccess = u => isAdmin(u) || (u && u.plan === 'offert');
// prénom / nom : champs séparés, sinon déduits de l'ancien champ « nom et prénom »
const splitName = u => {
  if (u.first != null || u.last != null) return { first: u.first || '', last: u.last || '' };
  const w = String(u.name || '').trim().split(/\s+/).filter(Boolean);
  return { first: w[0] || '', last: w.slice(1).join(' ') };
};
const publicUser = u => u && { id: u.id, email: u.email, name: u.name, ...splitName(u), avatar: u.avatar || '', club: u.club, hasPassword: !!u.pass_hash, guest: !!u.guest, plan: isAdmin(u) ? 'admin' : (u.plan || 'essai'),
  planLabel: PLANS[isAdmin(u) ? 'admin' : (u.plan || 'essai')], admin: isAdmin(u), free: freeAccess(u) };

async function currentUser(req) {
  const id = Auth.sessionUserId(req);
  return id ? store.getUser(id) : null;
}

/* ---------------------------------------------------------------------
   salons de tournoi (état en mémoire + sauvegarde différée)
   --------------------------------------------------------------------- */
const rooms = new Map();

async function getRoom(id) {
  let room = rooms.get(id);
  if (room) { room.seen = Date.now(); return room; }
  const row = await store.getTournament(id);
  if (!row) return null;
  if (rooms.has(id)) return rooms.get(id);
  row.state = Engine.migrate(row.state || Engine.initialState());
  room = { row, rev: 1, history: [], clients: new Set(), timer: null, seen: Date.now() };
  rooms.set(id, room);
  return room;
}
function saveRoom(room) {
  clearTimeout(room.timer);
  room.timer = setTimeout(() => {
    room.row.updated_at = Date.now();
    store.saveTournament(room.row).catch(e => console.error('Sauvegarde impossible :', e.message));
  }, 700);
}
/* images (logos du club, des partenaires) : envoyées une seule fois, à part.
   Dans l'état diffusé à chaque point, chaque image est remplacée par un lien court /api/img/<empreinte>
   que le navigateur garde en cache ; l'état enregistré conserve les images complètes. */
const IMG = new Map();   // empreinte → data URL
const IMG_RE = /^\/api\/img\/([a-f0-9]{20})$/;
function stripImages(v) {
  if (typeof v === 'string') {
    if (v.length > 300 && v.startsWith('data:image/')) {
      const h = crypto.createHash('sha1').update(v).digest('hex').slice(0, 20);
      IMG.set(h, v); return '/api/img/' + h;
    }
    return v;
  }
  if (Array.isArray(v)) return v.map(stripImages);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = stripImages(v[k]); return o; }
  return v;
}
// une action renvoyée par un écran peut contenir ces liens : on remet les images complètes avant de l'appliquer
function restoreImages(v) {
  if (typeof v === 'string') { const m = v.match(IMG_RE); return m && IMG.has(m[1]) ? IMG.get(m[1]) : v; }
  if (Array.isArray(v)) return v.map(restoreImages);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = restoreImages(v[k]); return o; }
  return v;
}
const stateMsg = room => `data: ${JSON.stringify({ rev: room.rev, state: stripImages(room.row.state), canUndo: room.history.length > 0 })}\n\n`;
function broadcast(room) {
  const msg = stateMsg(room);
  for (const c of room.clients) c.res.write(msg);
}
// libère la mémoire des tournois inactifs
setInterval(() => {
  for (const [id, r] of rooms) if (!r.clients.size && Date.now() - r.seen > 2 * 3600000) { clearTimeout(r.timer); store.saveTournament(r.row).catch(() => {}); rooms.delete(id); }
}, 10 * 60000);

/* droits d'accès à un tournoi */
const VIEW_ACTIONS = new Set(['noop', 'draw/flip', 'draw/flipRandom']);
const SCORE_ACTIONS = new Set(['noop', 'match/point', 'match/undoPoint', 'match/game', 'match/ungame', 'match/server', 'match/start', 'display/set']);
// anti-force brute : au-delà de 10 codes PIN / clés faux en 15 min, l'appareil est bloqué pour ce tournoi
const accessFails = new Map();
const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
setInterval(() => { const now = Date.now(); for (const [k, f] of accessFails) if (now > f.until) accessFails.delete(k); }, 15 * 60000);
async function access(req, url, room) {
  const uid = Auth.sessionUserId(req);
  if (uid && uid === room.row.owner) return 'owner';
  const pin = req.headers['x-pin'] || url.searchParams.get('pin');
  const k = req.headers['x-key'] || url.searchParams.get('k');
  if (!pin && !k) return null;
  const fk = clientIp(req) + '|' + room.row.id, f = accessFails.get(fk);
  if (f && f.n >= 10 && Date.now() < f.until) return 'blocked';
  if (pin && pin === room.row.pin) return 'score';
  if (k && k === room.row.key) return 'view';
  const n = f && Date.now() < f.until ? f.n + 1 : 1;
  accessFails.set(fk, { n, until: Date.now() + 15 * 60000 });
  return null;
}

async function newTournament(owner, opts) {
  const state = Engine.initialState();
  if (opts.demo) Engine.reduce(state, { type: 'demo/load', payload: { n: 16 } });
  if (opts.profile) Engine.reduce(state, { type: 'profile/apply', payload: { profile: opts.profile } });
  if (opts.template) Engine.reduce(state, { type: 'template/apply', payload: { template: opts.template } });
  if (opts.name) state.tournament.name = opts.name;
  if (opts.state) Object.assign(state, Engine.migrate(JSON.parse(JSON.stringify(opts.state))));
  const row = { id: Auth.randomId(10), owner, key: Auth.randomId(16), pin: Auth.randomPin(), created_at: Date.now(), updated_at: Date.now(), state };
  await store.saveTournament(row);
  return row;
}

/* noms et horaires des terrains repris automatiquement dans les réglages du compte (hors démo) */
async function rememberCourts(room) {
  const u = await store.getUser(room.row.owner);
  if (!u || u.guest) return;
  const profile = (await store.getProfile(u.id)) || {};
  profile.courts = room.row.state.courts.map(c => ({ name: c.name, start: c.start, logo: c.logo || '' }));
  await store.saveProfile(u.id, profile);
}

/* action appliquée par le serveur lui-même (clôture, réouverture) */
function applyServerAction(room, action) {
  const before = JSON.stringify(room.row.state);
  const draft = JSON.parse(before);
  Engine.reduce(draft, action);
  room.history.push(before); if (room.history.length > 60) room.history.shift();
  room.row.state = draft; room.rev++; saveRoom(room); broadcast(room);
}

/* ---------------------------------------------------------------------
   base de joueurs : un joueur = une licence (ou, à défaut, NOM + prénom)
   --------------------------------------------------------------------- */
const publicPlayer = pl => ({ id: pl.id, last: pl.last, first: pl.first, licence: pl.licence, rank: pl.rank });
async function upsertPlayerFrom(pl, owner) {
  const licence = String(pl.licence || '').replace(/\s+/g, '');
  const last = String(pl.last || '').trim().toUpperCase(), first = String(pl.first || '').trim();
  const nameKey = norm(last) + '|' + norm(first);
  let p = (pl.playerId && await store.getPlayer(pl.playerId)) || await store.findPlayer(licence, nameKey);
  const now = Date.now();
  if (!p) p = { id: 'j' + Auth.randomId(12), created_at: now, created_by: owner };
  Object.assign(p, { last: last || p.last, first: first || p.first, licence: licence || p.licence || '', rank: pl.rank || p.rank || '', updated_at: now });
  p.name_key = norm(p.last) + '|' + norm(p.first);
  p.search = norm(`${p.last} ${p.first} ${p.licence}`);
  await store.savePlayer(p);
  return p;
}

async function closeTournament(room, u) {
  const T = room.row.state;
  if (!T.draw || !T.draw.built) return { error: 'Le tirage n\'a pas été fait : rien à clôturer.' };
  const R = Engine.resolve(T);
  const left = T.matches.filter(m => !R[m.id].staticBye && R[m.id].state !== 'done').length;
  const results = Engine.finalResults(T, R);
  const t = T.tournament;
  let saved = 0, skipped = 0;
  if (!u.guest) {
    await store.deleteParticipationsForTournament(room.row.id);
    const rows = [];
    const pname = pl => `${String(pl.last || '').toUpperCase()} ${pl.first || ''}`.trim();
    for (const res of results) {
      const pair = T.pairs.find(x => x.id === res.pair);
      if (!pair || pair.demo) { skipped++; continue; }
      for (const [pl, mate] of [[pair.p1, pair.p2], [pair.p2, pair.p1]]) {
        if (!pl || !String(pl.last || '').trim()) continue;
        const player = await upsertPlayerFrom(pl, u.id);
        pl.playerId = player.id;
        rows.push({ id: 'pa' + Auth.randomId(12), player_id: player.id, tournament_id: room.row.id, owner: u.id,
          t_name: t.name, t_club: t.club, t_category: t.category, t_gender: t.gender, t_date: t.dateStart,
          place: res.place, place_lo: res.placeLo, points: res.points, partner: pname(mate || {}), n_pairs: results.length, closed_at: Date.now() });
      }
    }
    await store.addParticipations(rows);
    saved = rows.length;
  }
  applyServerAction(room, { type: 'tournament/setClosed', payload: { closed: true } });
  return { ok: true, saved, skipped, unfinished: left, guest: !!u.guest };
}

/* comptes « démo » : effacés après 24 h */
async function cleanupGuests() {
  try {
    const users = await store.listUsers();
    const old = users.filter(u => u.guest && Date.now() - u.created_at > 24 * 3600000);
    if (!old.length) return;
    const tours = await store.listAllTournaments();
    for (const u of old) {
      for (const t of tours.filter(x => x.owner === u.id)) { rooms.delete(t.id); await store.deleteTournament(t.id); }
      await store.deleteUser(u.id);
    }
  } catch (e) { console.error('Nettoyage démo :', e.message); }
}
setInterval(cleanupGuests, 3600000); setTimeout(cleanupGuests, 5000);

/* ---------------------------------------------------------------------
   routes
   --------------------------------------------------------------------- */
const PAGES = { tv: 'tv.html', overlay: 'overlay.html', print: 'print.html', remote: 'remote.html' };

/* « tournoi en cours » : non clôturé, tirage fait en priorité, puis le plus proche dans le temps */
function currentTournament(list) {
  const today = new Date().toISOString().slice(0, 10);
  const open = list.filter(t => !t.closed);
  const score = t => (t.drawn && t.done < t.matches ? 0 : 1) * 1e9 + Math.abs(Date.parse(t.dateStart || today) - Date.parse(today)) / 864e5;
  return open.sort((a, b) => score(a) - score(b))[0] || null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    /* ---------- fichiers statiques ---------- */
    if (/^\/(css|js|img|fonts)\//.test(p) || p === '/manifest.webmanifest') return sendFile(res, p);
    if (p === '/favicon.ico') return sendFile(res, '/img/favicon.png');
    if (p === '/sw.js') return sendFile(res, '/js/sw.js');   // service worker (mode hors ligne), servi à la racine
    let im = p.match(IMG_RE);
    if (im) {   // image d'un tournoi (logo, partenaire), mise en cache par le navigateur
      const d = IMG.get(im[1]); if (!d) { res.writeHead(404); return res.end(); }
      const [head, b64] = d.split(',');
      res.writeHead(200, { 'Content-Type': (head.match(/^data:([^;]+)/) || [])[1] || 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' });
      return res.end(Buffer.from(b64 || '', 'base64'));
    }

    /* ---------- pages ---------- */
    if (p === '/') return sendFile(res, '/landing.html');
    if (p === '/connexion' || p === '/inscription') {
      const u = await currentUser(req);
      if (u && !u.guest) return redirect(res, '/dashboard');   // déjà connecté : tableau de bord
      return sendFile(res, '/auth.html');
    }
    if (p === '/admin') { if (!isAdmin(await currentUser(req))) return redirect(res, '/app'); return sendFile(res, '/admin.html'); }
    if (p === '/app') { if (!(await currentUser(req))) return redirect(res, '/connexion'); return sendFile(res, '/app.html'); }
    // espace du juge-arbitre : tableau de bord, calendrier, joueurs, profil
    const ACCOUNT_PAGES = { '/dashboard': 'dashboard.html', '/calendrier': 'calendrier.html', '/joueurs': 'joueurs.html', '/statistiques': 'statistiques.html', '/profil': 'profil.html' };
    if (ACCOUNT_PAGES[p]) { if (!(await currentUser(req))) return redirect(res, '/connexion?retour=' + p); return sendFile(res, '/' + ACCOUNT_PAGES[p]); }
    if (p === '/en-cours') {   // raccourci vers le tournoi en cours le plus récent
      const u = await currentUser(req); if (!u) return redirect(res, '/connexion');
      const cur = currentTournament(await store.listTournaments(u.id));
      return redirect(res, cur ? '/t/' + cur.id : '/app');
    }
    if (p === '/demo') {
      const u = { id: 'g' + Auth.randomId(10), email: null, name: 'Démo', guest: true, plan: 'demo', created_at: Date.now() };
      await store.saveUser(u);
      const row = await newTournament(u.id, { demo: true });
      return redirect(res, '/t/' + row.id, { 'Set-Cookie': Auth.sessionCookie(req, Auth.makeToken(u.id, 1), 1) });
    }
    if (p === '/deconnexion') return redirect(res, '/', { 'Set-Cookie': Auth.sessionCookie(req, null) });
    let m = p.match(/^\/t\/([\w-]+)\/?(tv|overlay|print|remote)?$/);
    if (m) {
      if (!m[2]) { // éditeur : réservé au propriétaire
        const uid = Auth.sessionUserId(req);
        const row = await store.getTournament(m[1]);
        if (!row) return redirect(res, '/app');
        if (!uid || uid !== row.owner) return redirect(res, '/connexion?retour=' + encodeURIComponent(p));
        return sendFile(res, '/editor.html');
      }
      return sendFile(res, '/' + PAGES[m[2]]);
    }
    // anciennes adresses de la version 1
    if (['/tv', '/overlay', '/remote', '/print'].includes(p)) return redirect(res, '/app');

    /* ---------- API comptes ---------- */
    if (p === '/api/auth/signup' && req.method === 'POST') {
      const b = await readBody(req);
      const email = String(b.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { error: 'Adresse e-mail invalide.' });
      if (String(b.password || '').length < 8) return json(res, 400, { error: 'Le mot de passe doit faire au moins 8 caractères.' });
      if (await store.getUserByEmail(email)) return json(res, 409, { error: 'Un compte existe déjà avec cette adresse.' });
      const first = String(b.first || '').trim().slice(0, 40), last = String(b.last || '').trim().slice(0, 40);
      const u = { id: 'u' + Auth.randomId(12), email, name: [first, last].filter(Boolean).join(' ') || String(b.name || '').slice(0, 80), club: String(b.club || '').slice(0, 120),
        pass_hash: Auth.hashPassword(b.password), plan: 'essai', guest: false, created_at: Date.now() };
      await store.saveUser(u);
      if (first || last) await store.saveIdentity(u.id, { first, last });
      // premier tournoi d'exemple pour bien démarrer
      await newTournament(u.id, { demo: true, name: 'Tournoi d\'exemple' });
      return json(res, 200, { ok: true, user: publicUser(u) }, { 'Set-Cookie': Auth.sessionCookie(req, Auth.makeToken(u.id)) });
    }
    if (p === '/api/auth/login' && req.method === 'POST') {
      const b = await readBody(req);
      const email = String(b.email || '').trim().toLowerCase();
      if (Auth.tooManyAttempts(email + '|' + req.socket.remoteAddress)) return json(res, 429, { error: 'Trop de tentatives : réessayez dans 15 minutes.' });
      const u = await store.getUserByEmail(email);
      if (!u || !Auth.checkPassword(b.password, u.pass_hash)) return json(res, 401, { error: 'E-mail ou mot de passe incorrect.' });
      return json(res, 200, { ok: true, user: publicUser(u) }, { 'Set-Cookie': Auth.sessionCookie(req, Auth.makeToken(u.id)) });
    }
    /* ---------- API administration ---------- */
    if (p.startsWith('/api/admin/')) {
      const u = await currentUser(req);
      if (!isAdmin(u)) return json(res, 403, { error: 'Réservé aux administrateurs' });
      if (p === '/api/admin/users') {
        const users = (await store.listUsers()).filter(x => !x.guest);
        const tours = await store.listAllTournaments();
        const count = {}; tours.forEach(t => { count[t.owner] = (count[t.owner] || 0) + 1; });
        const guests = (await store.listUsers()).filter(x => x.guest).length;
        return json(res, 200, { guests, tournaments: tours.length, plans: PLANS,
          users: users.map(x => Object.assign(publicUser(x), { rawPlan: x.plan || 'essai', created_at: x.created_at, tournaments: count[x.id] || 0 }))
            .sort((a, b) => (b.created_at || 0) - (a.created_at || 0)) });
      }
      let am = p.match(/^\/api\/admin\/users\/([\w-]+)$/);
      if (am && req.method === 'POST') {
        const b = await readBody(req);
        if (!PLANS[b.plan]) return json(res, 400, { error: 'Offre inconnue' });
        const x = await store.getUser(am[1]); if (!x) return json(res, 404, { error: 'Compte introuvable' });
        x.plan = b.plan; await store.saveUser(x);
        return json(res, 200, { ok: true, user: publicUser(x) });
      }
      am = p.match(/^\/api\/admin\/players\/([\w-]+)$/);
      if (am && req.method === 'DELETE') {         // droit à l'effacement (RGPD)
        await store.deletePlayer(am[1]);
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: 'Inconnu' });
    }
    if (p === '/api/me' && req.method === 'POST') {   // modifier son nom et son club
      const u = await currentUser(req); if (!u || u.guest) return json(res, 403, { error: 'Créez un compte pour modifier votre profil.' });
      const b = await readBody(req);
      // identité (prénom, nom, photo) rangée avec les données du compte ; on complète l'existant
      const id = Object.assign({}, await store.getIdentity(u.id).catch(() => null));
      let changed = false;
      if (b.first != null || b.last != null) {
        id.first = String(b.first || '').trim().slice(0, 40); id.last = String(b.last || '').trim().slice(0, 40);
        u.name = [id.first, id.last].filter(Boolean).join(' '); changed = true;
      } else if (b.name != null) u.name = String(b.name).trim().slice(0, 80);
      if (b.avatar != null) {   // photo de profil : image réduite (data URL), ou '' pour la retirer
        const a = String(b.avatar);
        if (a && (!/^data:image\/(png|jpeg|webp);base64,/.test(a) || a.length > 400000)) return json(res, 400, { error: 'Image trop lourde ou format non reconnu.' });
        id.avatar = a; changed = true;
      }
      if (b.club != null) u.club = String(b.club).trim().slice(0, 120);
      await store.saveUser(u);
      if (changed) await store.saveIdentity(u.id, id);
      return json(res, 200, { ok: true, user: publicUser(Object.assign({}, u, id)) });
    }
    if (p === '/api/me/password' && req.method === 'POST') {
      const u = await currentUser(req); if (!u || u.guest) return json(res, 403, { error: 'Créez un compte pour choisir un mot de passe.' });
      const b = await readBody(req);
      if (!Auth.checkPassword(b.current, u.pass_hash)) return json(res, 400, { error: 'Mot de passe actuel incorrect.' });
      if (String(b.next || '').length < 8) return json(res, 400, { error: 'Le nouveau mot de passe doit faire au moins 8 caractères.' });
      u.pass_hash = Auth.hashPassword(b.next); await store.saveUser(u);
      return json(res, 200, { ok: true });
    }
    if (p === '/api/me') {
      const u = await currentUser(req);
      const id = u && !u.guest ? await store.getIdentity(u.id).catch(() => null) : null;
      return json(res, 200, { user: publicUser(u && Object.assign({}, u, id || {})), storage: store.kind });
    }

    /* ---------- API tournois (tableau de bord) ---------- */
    if (p === '/api/tournaments') {
      const u = await currentUser(req); if (!u) return json(res, 401, { error: 'Connexion requise' });
      if (req.method === 'POST') {
        const b = await readBody(req);
        let opts = { name: b.name, demo: !!b.demo, profile: u.guest ? null : await store.getProfile(u.id) };
        if (b.template) {
          const mine = await store.getTemplates(u.id);
          opts.template = Engine.PRESETS.find(t => t.id === b.template) || mine.find(t => t.id === b.template);
        }
        const row = await newTournament(u.id, opts);
        return json(res, 200, { id: row.id });
      }
      return json(res, 200, { tournaments: await store.listTournaments(u.id), presets: Engine.PRESETS, mine: await store.getTemplates(u.id) });
    }
    m = p.match(/^\/api\/tournaments\/([\w-]+)(\/duplicate|\/close|\/reopen)?$/);
    if (m) {
      const u = await currentUser(req); if (!u) return json(res, 401, { error: 'Connexion requise' });
      const room = await getRoom(m[1]);
      if (!room || room.row.owner !== u.id) return json(res, 404, { error: 'Tournoi introuvable' });
      if (m[2] === '/close' && req.method === 'POST') {
        const r = await closeTournament(room, u);
        return json(res, 200, r);
      }
      if (m[2] === '/reopen' && req.method === 'POST') {
        // les résultats seront réenregistrés à la prochaine clôture
        await store.deleteParticipationsForTournament(room.row.id).catch(() => {});
        applyServerAction(room, { type: 'tournament/setClosed', payload: { closed: false } });
        return json(res, 200, { ok: true });
      }
      if (m[2] === '/duplicate' && req.method === 'POST') {
        // dupliquer = même configuration, sans joueurs ni matchs
        const st = JSON.parse(JSON.stringify(room.row.state));
        Object.assign(st, { pairs: [], draw: null, matches: [], poules: [] });
        st.tournament.name = st.tournament.name + ' (copie)';
        const row = await newTournament(u.id, { state: st });
        return json(res, 200, { id: row.id });
      }
      if (req.method === 'DELETE') {
        for (const c of room.clients) c.res.end();
        rooms.delete(m[1]); await store.deleteTournament(m[1]);
        return json(res, 200, { ok: true });
      }
    }

    /* ---------- API statistiques du compte : joueurs (individuellement) sur tous mes tournois ---------- */
    if (p === '/api/stats') {
      const u = await currentUser(req); if (!u) return json(res, 401, { error: 'Connexion requise' });
      const list = (await store.listTournaments(u.id)).slice(0, 300);
      const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
      const agg = {};
      let nT = 0, nM = 0;
      for (const meta of list) {
        const row = rooms.has(meta.id) ? rooms.get(meta.id).row : await store.getTournament(meta.id);
        const T = row && row.state;
        if (!T || !T.draw || !T.draw.built) continue;
        const R = Engine.resolve(T);
        const done = T.matches.filter(m => !R[m.id].staticBye && R[m.id].state === 'done');
        const finished = T.tournament.closed || T.matches.every(m => R[m.id].staticBye || R[m.id].state === 'done');
        const FR = finished ? Engine.finalResults(T, R) : [], pts = {};
        FR.forEach(x => { pts[x.pair] = x.points || 0; });
        let counted = false;
        for (const pair of T.pairs) {
          if (pair.demo || !T.draw.entrants.includes(pair.id)) continue;
          const played = done.filter(m => !m.wo && (R[m.id].A === pair.id || R[m.id].B === pair.id));
          const won = played.filter(m => R[m.id].winner === pair.id).length;
          for (const pl of [pair.p1, pair.p2]) {
            if (!pl || !String(pl.last || '').trim()) continue;
            const key = pl.licence ? 'l:' + pl.licence : 'n:' + norm(pl.last) + '|' + norm(pl.first);
            const a = agg[key] = agg[key] || { last: '', first: '', club: '', tournaments: 0, matches: 0, wins: 0, points: 0, titles: 0, lastAt: 0 };
            const at = Date.parse(T.tournament.dateStart || '') || meta.updated_at || 0;
            if (at >= a.lastAt) { a.last = String(pl.last).toUpperCase(); a.first = pl.first || ''; if (pl.club) a.club = pl.club; a.lastAt = at; } else if (!a.club && pl.club) a.club = pl.club;
            a.tournaments++; a.matches += played.length; a.wins += won; a.points += pts[pair.id] || 0;
            if (FR[0] && FR[0].place === 1 && FR[0].pair === pair.id) a.titles++;
            counted = true;
          }
        }
        if (counted) { nT++; nM += done.length; }
      }
      const players = Object.values(agg).map(({ lastAt, ...x }) => x);
      const top = (k, k2) => players.slice().sort((a, b) => b[k] - a[k] || b[k2] - a[k2] || a.last.localeCompare(b.last)).slice(0, 10);
      return json(res, 200, { tournaments: nT, matches: nM, players: players.length, guest: !!u.guest,
        byTournaments: top('tournaments', 'points'), byPoints: top('points', 'tournaments'), byMatches: top('matches', 'wins') });
    }

    /* ---------- API base de joueurs (partagée entre tous les juges-arbitres) ---------- */
    if (p === '/api/players' || p.startsWith('/api/players/') || p === '/api/club-players') {
      const u = await currentUser(req); if (!u) return json(res, 401, { error: 'Connexion requise' });
      if (u.guest) return json(res, 200, { players: [], guest: true });
      try {
        if (p === '/api/players') {
          const q = String(url.searchParams.get('q') || '').trim();
          if (q.length < 2) return json(res, 200, { players: [] });
          const players = await store.searchPlayers(q, 8);
          const parts = await store.participationsOfPlayers(players.map(x => x.id));
          return json(res, 200, { players: players.map(pl => Object.assign(publicPlayer(pl), { tournaments: parts.filter(x => x.player_id === pl.id).length })) });
        }
        if (p === '/api/club-players') {
          // joueurs les plus fidèles aux tournois de ce juge-arbitre
          const parts = await store.participationsOf('owner', u.id);
          const agg = {};
          parts.forEach(x => {
            const a = agg[x.player_id] = agg[x.player_id] || { id: x.player_id, count: 0, best: null, points: 0, last: 0, wins: 0 };
            a.count++; a.points += x.points || 0; a.last = Math.max(a.last, x.closed_at || 0);
            if (a.best == null || x.place < a.best) a.best = x.place;
            if (x.place === 1) a.wins++;
          });
          const top = Object.values(agg).sort((a, b) => b.count - a.count || b.points - a.points).slice(0, 60);
          const players = await store.getPlayers(top.map(x => x.id));
          const tours = new Set(parts.map(x => x.tournament_id)).size;
          return json(res, 200, { tournaments: tours, players: top.map(a => Object.assign(a, publicPlayer(players.find(pl => pl.id === a.id) || {}))) });
        }
        const pid = p.split('/')[3];
        const pl = await store.getPlayer(pid);
        if (!pl) return json(res, 404, { error: 'Joueur introuvable' });
        const parts = (await store.participationsOf('player_id', pid)).sort((a, b) => (b.closed_at || 0) - (a.closed_at || 0));
        return json(res, 200, { player: publicPlayer(pl), history: parts.map(x => ({ tournament: x.t_name, club: x.t_club, category: x.t_category, gender: x.t_gender,
          date: x.t_date, place: x.place, placeLo: x.place_lo, points: x.points, partner: x.partner, pairs: x.n_pairs, mine: x.owner === u.id })) });
      } catch (e) {
        if (/players|participations/.test(e.message) && /404|PGRST20|does not exist|relation/.test(e.message)) return json(res, 503, { error: 'Base de joueurs pas encore installée : exécutez supabase-v2.sql dans Supabase.', setup: true });
        throw e;
      }
    }

    /* ---------- API réglages du compte (club, terrains, logo, partenaires) ---------- */
    if (p === '/api/profile') {
      const u = await currentUser(req); if (!u) return json(res, 401, { error: 'Connexion requise' });
      if (req.method === 'POST') {
        const b = await readBody(req);
        if (u.guest) return json(res, 403, { error: 'Créez un compte pour mémoriser vos réglages.' });
        if (b.profile && typeof b.profile === 'object') {
          // préférences modifiées depuis la page Mon profil : uniquement les champs prévus
          const src = b.profile, p = {};
          Engine.PROFILE_FIELDS.forEach(k => { if (src[k] !== undefined) p[k] = src[k]; });
          p.courts = (Array.isArray(src.courts) ? src.courts : []).slice(0, 30)
            .map(c => ({ name: String((c && c.name) || '').slice(0, 40) || 'Terrain', start: /^\d\d:\d\d$/.test(c && c.start) ? c.start : '09:00',
              logo: (l => /^data:image\//.test(l) && l.length < 400000 ? l : '')(restoreImages(String((c && c.logo) || ''))) }));
          if (Array.isArray(p.sponsors)) p.sponsors = p.sponsors.slice(0, 40).map((s, i) => ({ id: String((s && s.id) || 's' + i), name: String((s && s.name) || '').slice(0, 60), logo: String((s && s.logo) || '') }));
          await store.saveProfile(u.id, p);
        } else {
          const room = b.tid && await getRoom(b.tid);
          if (!room || room.row.owner !== u.id) return json(res, 404, { error: 'Tournoi introuvable' });
          await store.saveProfile(u.id, Engine.profileFromState(room.row.state));
        }
      }
      return json(res, 200, { profile: await store.getProfile(u.id), guest: !!u.guest });
    }

    /* ---------- API modèles du compte ---------- */
    if (p === '/api/templates') {
      const u = await currentUser(req); if (!u) return json(res, 401, { error: 'Connexion requise' });
      let mine = await store.getTemplates(u.id);
      if (req.method === 'POST') {
        const b = await readBody(req);
        const room = b.tid && await getRoom(b.tid);
        if (!room || room.row.owner !== u.id) return json(res, 404, { error: 'Tournoi introuvable' });
        mine.push(Engine.templateFromState(room.row.state, b.name, b.desc));
        await store.saveTemplates(u.id, mine);
      }
      if (req.method === 'DELETE') { mine = mine.filter(t => t.id !== url.searchParams.get('id')); await store.saveTemplates(u.id, mine); }
      return json(res, 200, { presets: Engine.PRESETS, mine });
    }

    /* ---------- API d'un tournoi ---------- */
    m = p.match(/^\/api\/t\/([\w-]+)\/(events|action|undo|export|info)$/);
    if (m) {
      const room = await getRoom(m[1]);
      if (!room) return json(res, 404, { error: 'Tournoi introuvable' });
      const level = await access(req, url, room);
      if (level === 'blocked') return json(res, 429, { error: 'Trop de codes incorrects : réessayez dans 15 minutes.' });
      if (!level) return json(res, 401, { error: 'Accès refusé : connexion, clé de diffusion ou code PIN requis.' });
      const what = m[2];

      if (what === 'events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write(stateMsg(room));
        const c = { res, level };
        room.clients.add(c);
        const ka = setInterval(() => res.write(': ping\n\n'), 20000);
        req.on('close', () => { clearInterval(ka); room.clients.delete(c); room.seen = Date.now(); });
        return;
      }
      if (what === 'info') {
        return json(res, 200, { level, pin: level === 'owner' ? room.row.pin : null, key: level === 'owner' ? room.row.key : null,
          origin: origin(req), lan: ONLINE ? [] : lanAddresses(), port: PORT, online: ONLINE });
      }
      if (what === 'export') {
        if (level !== 'owner') return json(res, 403, { error: 'Réservé au juge-arbitre' });
        const name = (room.row.state.tournament.name || 'tournoi').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_');
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${name}.padelja.json"` });
        return res.end(JSON.stringify(room.row.state, null, 1));
      }
      if (what === 'undo' && req.method === 'POST') {
        if (level !== 'owner') return json(res, 403, { error: 'Réservé au juge-arbitre' });
        if (room.row.state.tournament.closed) return json(res, 403, { error: 'Tournoi clôturé : rouvrez-le pour le modifier.' });
        if (room.history.length) { room.row.state = JSON.parse(room.history.pop()); room.rev++; saveRoom(room); broadcast(room); }
        return json(res, 200, { ok: true });
      }
      if (what === 'action' && req.method === 'POST') {
        const action = restoreImages(await readBody(req));
        if (level === 'view' && !VIEW_ACTIONS.has(action.type)) return json(res, 403, { error: 'Action non autorisée depuis cet écran.' });
        if (level === 'score' && !SCORE_ACTIONS.has(action.type)) return json(res, 403, { error: 'Action non autorisée depuis la télécommande.' });
        if (action.type === 'noop') return json(res, 200, { ok: true, rev: room.rev });
        const before = JSON.stringify(room.row.state);
        const draft = JSON.parse(before);
        try { Engine.reduce(draft, action); } catch (e) { return json(res, 400, { error: e.message }); }
        if (!/^match\/(point|undoPoint|game|ungame)$/.test(action.type)) { room.history.push(before); if (room.history.length > 60) room.history.shift(); }
        room.row.state = draft; room.rev++; saveRoom(room); broadcast(room);
        // terrains renommés / ajoutés / supprimés : mémorisés aussitôt dans les réglages du compte
        if (/^court\//.test(action.type)) rememberCourts(room).catch(e => console.error('terrains non mémorisés', e.message));
        return json(res, 200, { ok: true, rev: room.rev });
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Page introuvable');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: 'Erreur serveur : ' + e.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  ==============================================');
  console.log('   PADEL JA — serveur démarré');
  console.log('  ==============================================');
  console.log(`   Stockage : ${ONLINE ? 'Supabase (en ligne)' : 'fichiers locaux (dossier data)'}`);
  console.log(`   Ouvrir   : http://localhost:${PORT}/`);
  if (!ONLINE) lanAddresses().forEach(ip => console.log(`   Réseau   : http://${ip}:${PORT}/`));
  console.log('\n   Laissez cette fenêtre ouverte pendant le tournoi.\n');
});
server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.log(`\n  Le port ${PORT} est déjà utilisé : Padel JA est sans doute déjà lancé.\n`);
  else console.error(e);
});
// sauvegarde propre à l'arrêt
['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, async () => {
  for (const r of rooms.values()) { clearTimeout(r.timer); r.row.updated_at = Date.now(); try { await store.saveTournament(r.row); } catch (e) {} }
  process.exit(0);
}));
