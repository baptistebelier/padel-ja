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
const Engine = require('./public/js/engine.js');
const { createStore } = require('./lib/store.js');
const Auth = require('./lib/auth.js');

const PORT = +process.env.PORT || 3737;
const ROOT = path.join(__dirname, 'public');
const store = createStore(path.join(__dirname, 'data'));
const ONLINE = store.kind === 'supabase';

/* ---------------------------------------------------------------------
   utilitaires HTTP
   --------------------------------------------------------------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

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
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': /\.(woff2|png|jpg)$/.test(ext) ? 'public, max-age=604800' : 'no-cache' });
    res.end(data);
  });
}
function lanAddresses() {
  const out = [];
  Object.values(os.networkInterfaces()).forEach(l => (l || []).forEach(i => { if (i.family === 'IPv4' && !i.internal) out.push(i.address); }));
  return out;
}
const origin = req => `${(req.headers['x-forwarded-proto'] || 'http').split(',')[0]}://${req.headers['x-forwarded-host'] || req.headers.host}`;
const publicUser = u => u && { id: u.id, email: u.email, name: u.name, club: u.club, guest: !!u.guest, plan: u.plan };

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
function broadcast(room) {
  const msg = `data: ${JSON.stringify({ rev: room.rev, state: room.row.state, canUndo: room.history.length > 0 })}\n\n`;
  for (const c of room.clients) c.res.write(msg);
}
// libère la mémoire des tournois inactifs
setInterval(() => {
  for (const [id, r] of rooms) if (!r.clients.size && Date.now() - r.seen > 2 * 3600000) { clearTimeout(r.timer); store.saveTournament(r.row).catch(() => {}); rooms.delete(id); }
}, 10 * 60000);

/* droits d'accès à un tournoi */
const VIEW_ACTIONS = new Set(['noop', 'draw/flip', 'draw/flipRandom']);
const SCORE_ACTIONS = new Set(['noop', 'match/point', 'match/undoPoint', 'match/server', 'match/start', 'display/set']);
async function access(req, url, room) {
  const uid = Auth.sessionUserId(req);
  if (uid && uid === room.row.owner) return 'owner';
  const pin = req.headers['x-pin'] || url.searchParams.get('pin');
  if (pin && pin === room.row.pin) return 'score';
  const k = req.headers['x-key'] || url.searchParams.get('k');
  if (k && k === room.row.key) return 'view';
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    /* ---------- fichiers statiques ---------- */
    if (/^\/(css|js|img|fonts)\//.test(p) || p === '/manifest.webmanifest') return sendFile(res, p);
    if (p === '/favicon.ico') return sendFile(res, '/img/favicon.png');

    /* ---------- pages ---------- */
    if (p === '/') return sendFile(res, '/landing.html');
    if (p === '/connexion' || p === '/inscription') return sendFile(res, '/auth.html');
    if (p === '/app') { if (!(await currentUser(req))) return redirect(res, '/connexion'); return sendFile(res, '/app.html'); }
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
      const u = { id: 'u' + Auth.randomId(12), email, name: String(b.name || '').slice(0, 80), club: String(b.club || '').slice(0, 120),
        pass_hash: Auth.hashPassword(b.password), plan: 'essai', guest: false, created_at: Date.now() };
      await store.saveUser(u);
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
    if (p === '/api/me') {
      const u = await currentUser(req);
      return json(res, 200, { user: publicUser(u), storage: store.kind });
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
    m = p.match(/^\/api\/tournaments\/([\w-]+)(\/duplicate)?$/);
    if (m) {
      const u = await currentUser(req); if (!u) return json(res, 401, { error: 'Connexion requise' });
      const room = await getRoom(m[1]);
      if (!room || room.row.owner !== u.id) return json(res, 404, { error: 'Tournoi introuvable' });
      if (m[2] && req.method === 'POST') {
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

    /* ---------- API réglages du compte (club, terrains, logo, partenaires) ---------- */
    if (p === '/api/profile') {
      const u = await currentUser(req); if (!u) return json(res, 401, { error: 'Connexion requise' });
      if (req.method === 'POST') {
        const b = await readBody(req);
        const room = b.tid && await getRoom(b.tid);
        if (!room || room.row.owner !== u.id) return json(res, 404, { error: 'Tournoi introuvable' });
        if (u.guest) return json(res, 403, { error: 'Créez un compte pour mémoriser vos réglages.' });
        await store.saveProfile(u.id, Engine.profileFromState(room.row.state));
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
      if (!level) return json(res, 401, { error: 'Accès refusé : connexion, clé de diffusion ou code PIN requis.' });
      const what = m[2];

      if (what === 'events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write(`data: ${JSON.stringify({ rev: room.rev, state: room.row.state, canUndo: room.history.length > 0 })}\n\n`);
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
        if (room.history.length) { room.row.state = JSON.parse(room.history.pop()); room.rev++; saveRoom(room); broadcast(room); }
        return json(res, 200, { ok: true });
      }
      if (what === 'action' && req.method === 'POST') {
        const action = await readBody(req);
        if (level === 'view' && !VIEW_ACTIONS.has(action.type)) return json(res, 403, { error: 'Action non autorisée depuis cet écran.' });
        if (level === 'score' && !SCORE_ACTIONS.has(action.type)) return json(res, 403, { error: 'Action non autorisée depuis la télécommande.' });
        if (action.type === 'noop') return json(res, 200, { ok: true, rev: room.rev });
        const before = JSON.stringify(room.row.state);
        const draft = JSON.parse(before);
        try { Engine.reduce(draft, action); } catch (e) { return json(res, 400, { error: e.message }); }
        if (!/^match\/(point|undoPoint)$/.test(action.type)) { room.history.push(before); if (room.history.length > 60) room.history.shift(); }
        room.row.state = draft; room.rev++; saveRoom(room); broadcast(room);
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
