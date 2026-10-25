/* =========================================================================
   /RAM JA — serveur (local ou en ligne), sans dépendance, Node.js >= 18
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
const Ani = require('./public/js/animation.js');   // animations : americano, mexicano, par équipes, montée-descente
const reducerOf = T => (Ani.isAnimation(T) ? Ani : Engine);
const { createStore, norm } = require('./lib/store.js');
const Backup = require('./lib/backup.js');
const Retention = require('./lib/retention.js');
const Mail = require('./lib/mail.js');
const Access = require('./lib/access.js');
const Shopify = require('./lib/shopify.js');
const Auth = require('./lib/auth.js');

const PORT = +process.env.PORT || 3737;
const ROOT = path.join(__dirname, 'public');
const store = createStore(process.env.DATA_DIR || path.join(__dirname, 'data'));   // DATA_DIR : dossier de test
const ram = require('./lib/ramclub.js').createRamClub(process.env.DATA_DIR || path.join(__dirname, 'data'));   // /RAM Club : clubs, publications, groupes…
const { createClubs, withClubLinks } = require('./lib/clubs.js');
const clubs = createClubs(store);   // référentiel des clubs commun aux deux applis
withClubLinks(store, clubs);        // comptes et tournois enregistrés avec le club_id de leur texte « club »
const adhesions = require('./lib/adhesions.js').createAdhesions({ store, ram, onUsers: ids => Promise.all(ids.map(id => followRamClub(id).catch(() => {}))) });   // qui appartient à quel club, rôle et saison
const progression = require('./lib/progression.js').createProgression({ store, ram });   // trophées et points de chaque adhérent, par club et saison
const groupes = require('./lib/groupes.js').createGroupes({ store, ram });   // groupes d'entraînement et équipes, avec leurs membres
const fiches = require('./lib/fiches.js').createFiches({ store, ram, mainClubOf: id => mainClubOf(id) });   // profil sportif et enfants → fiches joueurs
const push = require('./lib/webpush.js').createWebPush({ store, log: m => console.warn('/RAM Club : ' + m) });   // notifications sur le téléphone
require('./lib/pushnotif.js').createNotifier({ ram, push, log: m => console.warn('/RAM Club : ' + m) });   // qui prévenir à chaque changement d'un club
/* titres de juge-arbitre des adhérents d'un espace (clé → [« JAP2 »…]), gardés 10 minutes */
const titlesCache = new Map();
async function jaTitlesOf(spaceId) {
  const c = titlesCache.get(spaceId);
  if (c && Date.now() - c.at < 600000) return c.map;
  const g = await ram.groupsOf(spaceId), map = {};
  for (const [key, userId] of Object.entries((g && g.users) || {})) {
    const id = await store.getIdentity(userId).catch(() => null);
    if (id && Array.isArray(id.jaTitles) && id.jaTitles.length) map[key] = id.jaTitles;
  }
  titlesCache.set(spaceId, { at: Date.now(), map });
  return map;
}
/* identité du club : celle de son espace /RAM Club (logo, sigle, couleur, adresse, terrains) recopiée dans le
   référentiel des clubs, et reprise par /RAM JA pour les nouveaux tournois */
async function syncClubIdentity(spaceId) {
  const sp = (await ram.spaces()).find(s => s.id === spaceId);
  const conf = sp && sp.club_id && await ram.confOf(spaceId);
  if (!conf) return;
  const info = conf.info || {}, tc = +info.courts || 0, pc = +info.pistes || 0;
  await clubs.update(sp.club_id, { logo: conf.logo || conf.logoD || null, short: conf.short || null, accent: conf.accent || null, address: info.addr || null,
    tennis_courts: tc || null, padel_courts: pc || null, sports: [tc && 'Tennis', pc && 'Padel'].filter(Boolean) });
}
function watchClubIdentity() {
  const timers = new Map();
  ram.onChange(id => { clearTimeout(timers.get(id)); timers.set(id, setTimeout(() => { timers.delete(id); syncClubIdentity(id).catch(e => console.error('Identité du club :', e.message)); }, 4000)); });
}
/* le club d'un compte suit son club /RAM Club (adhésion validée la plus récente) ;
   sans club /RAM Club, il garde celui qu'il a choisi */
/* club principal d'un compte (celui de sa licence) : celui qu'il a choisi parmi ses clubs /RAM Club,
   sinon son adhésion validée la plus récente ; les autres sont ses clubs secondaires */
async function mainClubOf(userId) {
  const id = await store.getIdentity(userId).catch(() => null), want = id && id.mainClub;
  if (want && (await store.listMemberships('user_id', userId)).some(r => r.source === 'ramclub' && r.status === 'actif' && r.club_id === want)) return want;
  return adhesions.ramClubOf(userId);
}
async function followRamClub(userId) {
  const u = await store.getUser(userId); if (!u || u.guest) return;
  const clubId = await mainClubOf(userId); if (!clubId || clubId === u.club_id) return;
  u.club = clubs.name(clubId); await store.saveUser(u);
  await syncAccountPlayer(u).catch(() => {});
}
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
// corps brut (octets exacts) : nécessaire pour vérifier la signature des webhooks Shopify
function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', d => { chunks.push(d); n += d.length; if (n > 5e6) req.destroy(); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
/* Fichiers CSS et JS versionnés : les pages et feuilles de style citent « /css/x.css?v=empreinte ».
   Avec l'empreinte, le navigateur garde le fichier un an sans redemander (il change d'adresse quand
   son contenu change) ; sans elle, chaque page retéléchargeait tous les fichiers. */
const versions = new Map();   // chemin → { mtime, v }
function assetVersion(rel) {
  const file = path.join(ROOT, rel);
  try {
    const st = fs.statSync(file), c = versions.get(rel);
    if (c && c.mtime === st.mtimeMs) return c.v;
    const v = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 10);
    versions.set(rel, { mtime: st.mtimeMs, v }); return v;
  } catch (e) { return ''; }
}
const ASSET_REF = /(["'(])(\/(?:css|js|fonts)\/[\w.-]+\.(?:css|js))(?=["')])/g;
const withVersions = text => text.replace(ASSET_REF, (m, q, rel) => { const v = assetVersion(rel); return v ? `${q}${rel}?v=${v}` : m; });
function sendFile(res, rel, versioned) {
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Page introuvable'); }
    const ext = path.extname(file);
    // pages et feuilles de style : les fichiers qu'elles citent reçoivent leur empreinte de version
    if (ext === '.html' || ext === '.css') data = withVersions(data.toString('utf8'));
    // icônes (favicon, icône d'application) : toujours revérifiées pour que les changements de logo apparaissent
    const longCache = /\.(woff2|png|webp|jpg)$/.test(ext) && !/favicon|app-icon/.test(rel);
    const cache = versioned && /\.(css|js)$/.test(ext) ? 'public, max-age=31536000, immutable' : longCache ? 'public, max-age=604800' : 'no-cache';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(data);
  });
}
// /RAM Club : fichiers de l'appli (dossier club/). Pages, scripts et icônes toujours revérifiés,
// le service worker de l'appli gère le hors-ligne.
const CLUB_ROOT = path.join(__dirname, 'club');
// pages de /RAM Club à adresse propre : connexion (et inscription, mot de passe oublié) et présentation
const CLUB_PAGES = { '/connexion': '/connexion.html', '/inscription': '/connexion.html', '/mot-de-passe-oublie': '/connexion.html', '/presentation': '/presentation.html' };
function sendClub(res, rel) {
  if (CLUB_PAGES[rel]) rel = CLUB_PAGES[rel];
  if (!rel || rel.endsWith('/')) rel = (rel || '/') + 'index.html';
  const file = path.normalize(path.join(CLUB_ROOT, rel));
  if (!file.startsWith(CLUB_ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Page introuvable'); }
    const ext = path.extname(file);
    const longCache = /\.(png|webp|jpg|woff2)$/.test(ext) && !/icon|favicon/.test(rel);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': longCache ? 'public, max-age=604800' : 'no-cache' });
    res.end(data);
  });
}
function lanAddresses() {
  const out = [];
  Object.values(os.networkInterfaces()).forEach(l => (l || []).forEach(i => { if (i.family === 'IPv4' && !i.internal) out.push(i.address); }));
  return out;
}
// adresse publique du logiciel pour les liens envoyés par e-mail (jamais déduite de l'en-tête Host en ligne)
const appUrl = req => process.env.APP_URL || (ONLINE ? 'https://ja.riseandmove.fr' : origin(req));
const origin = req => `${(req.headers['x-forwarded-proto'] || 'http').split(',')[0]}://${req.headers['x-forwarded-host'] || req.headers.host}`;
/* administrateurs : e-mails listés dans ADMIN_EMAILS (Render), ou offre « admin » */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'baptiste.belier@gmail.com').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
const isAdmin = u => !!(u && !u.guest && (ADMIN_EMAILS.includes(String(u.email || '').toLowerCase()) || u.plan === 'admin'));
// offres : essai, actif (abonnement payé), offert (accès gratuit), admin
const PLANS = { essai: 'Essai', actif: 'Abonné', offert: 'Accès offert', admin: 'Administrateur' };
const freeAccess = u => isAdmin(u) || (u && u.plan === 'offert');
const { splitName } = require('./lib/names');
/* titres de juge-arbitre reconnus, par sport */
const JA_TITLES = { tennis: ['JAT1', 'JAT2', 'JAT3'], padel: ['JAP1', 'JAP2', 'JAP3'] };
let refDir = null;   // juges-arbitres /RAM JA proposés dans les tournois, recalculés toutes les 2 minutes
const publicUser = u => u && { id: u.id, email: u.email, name: u.name, ...splitName(u), avatar: u.avatar || '', club: u.club, clubId: u.club_id || null, jaTitles: Array.isArray(u.jaTitles) ? u.jaTitles : [], hasPassword: !!u.pass_hash, guest: !!u.guest, plan: isAdmin(u) ? 'admin' : (u.plan || 'essai'),
  planLabel: PLANS[isAdmin(u) ? 'admin' : (u.plan || 'essai')], admin: isAdmin(u), free: freeAccess(u) };

/* droits d'accès d'un compte (essai, abonné, lecture seule), gardés 1 min par compte */
const accessCache = new Map();
async function accessFor(u) {
  if (!u) return Access.accessOf(null);
  const c = accessCache.get(u.id);
  if (c && Date.now() - c.at < 60000) return c.a;
  // abonnement et tournois lus en même temps (un seul aller-retour vers la base au lieu de deux)
  const [billing, tours] = u.guest ? [null, []] : await Promise.all([store.getBilling(u.id).catch(() => null), store.listTournaments(u.id).catch(() => [])]);
  const a = Access.accessOf(u, billing, tours, freeAccess(u));
  accessCache.set(u.id, { at: Date.now(), a });
  return a;
}
const accessOfOwner = async id => accessFor(await store.getUser(id));

/* compte de la session : gardé 20 s en mémoire (chaque page et chaque appel n'interroge plus la base),
   oublié dès que le compte est enregistré ou supprimé */
const userCache = new Map();
let clubDir = null;   // annuaire des clubs (/RAM Club + tournois /RAM JA), recalculé toutes les 5 minutes
['saveUser', 'deleteUser'].forEach(fn => { const orig = store[fn].bind(store); store[fn] = async (x, ...rest) => { userCache.delete(typeof x === 'object' ? x.id : x); try { return await orig(x, ...rest); } finally { userCache.delete(typeof x === 'object' ? x.id : x); } }; });
async function currentUser(req) {
  const id = Auth.sessionUserId(req);
  if (!id) return null;
  const c = userCache.get(id);
  if (c && Date.now() - c.at < 20000) return c.u;
  const u = await store.getUser(id);
  if (u) userCache.set(id, { u, at: Date.now() }); else userCache.delete(id);
  return u;
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
  row.state = Ani.isAnimation(row.state) ? row.state : Engine.migrate(row.state || Engine.initialState());
  room = { row, rev: 1, history: [], clients: new Set(), timer: null, seen: Date.now() };
  rooms.set(id, room);
  return room;
}
function saveRoom(room) {
  clearTimeout(room.timer);
  room.timer = setTimeout(() => {
    room.row.updated_at = Date.now();
    store.saveTournament(room.row).catch(e => console.error('Sauvegarde impossible :', e.message));
    jaClub.schedule(room, msg => console.error(msg));   // publication /RAM Club tenue à jour
    if (Ani.isAnimation(room.row.state)) aniParticipations(room).catch(e => console.error('Animation, historique des joueurs :', e.message));
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
const SCORE_ACTIONS = new Set(['noop', 'match/point', 'match/undoPoint', 'match/game', 'match/ungame', 'match/server', 'match/start', 'display/set', 'ani/score']);
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
  // animation (americano…) : son propre état, son propre moteur
  const state = opts.animation ? Ani.initialState(opts.animation) : Engine.initialState();
  if (!opts.animation) {
    if (opts.demo) Engine.reduce(state, { type: 'demo/load', payload: { n: 16 } });
    if (opts.profile) Engine.reduce(state, { type: 'profile/apply', payload: { profile: opts.profile } });
    if (opts.template) Engine.reduce(state, { type: 'template/apply', payload: { template: opts.template } });
  }
  if (opts.name) state.tournament.name = opts.name;
  if (opts.example) state.tournament.example = true;   // tournoi d'exemple de l'inscription : hors limite de l'essai
  // identité du club (référentiel, venue de /RAM Club) : adresse, logo et pistes de padel par défaut
  const cl = !opts.state && clubs.lookup((state.tournament || {}).club);
  if (cl) {
    if (!state.tournament.address && cl.address) state.tournament.address = cl.address;
    if (!state.tournament.logo && cl.logo) state.tournament.logo = cl.logo;
    const defCourts = state.courts.every((c, i) => c.name === 'Terrain ' + (i + 1));
    if (cl.padel_courts && defCourts) state.courts = Array.from({ length: Math.min(16, cl.padel_courts) }, (_, i) => ({ id: 'c' + (i + 1), name: 'Piste ' + (i + 1), start: state.tournament.startTime || '09:00' }));
  }
  if (opts.state) Object.assign(state, Ani.isAnimation(opts.state) ? JSON.parse(JSON.stringify(opts.state)) : Engine.migrate(JSON.parse(JSON.stringify(opts.state))));
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
  reducerOf(draft).reduce(draft, action);
  room.history.push(before); if (room.history.length > 60) room.history.shift();
  room.row.state = draft; room.rev++; saveRoom(room); broadcast(room);
}

/* tournois et animations publiés sur /RAM Club, inscriptions depuis l'appli du club (lib/jaclub.js) */
const jaClub = require('./lib/jaclub.js').createJaClub({ store, ram, clubs, Engine, Ani, getRoom, applyServerAction });

/* ---------------------------------------------------------------------
   base de joueurs : un joueur = une licence (ou, à défaut, NOM + prénom)
   --------------------------------------------------------------------- */
const publicPlayer = pl => ({ id: pl.id, last: pl.last, first: pl.first, licence: pl.licence, rank: pl.rank, clubId: pl.club_id || null, club: clubs.name(pl.club_id) || undefined,
  sex: pl.sex || undefined, birthYear: pl.birth_year || undefined, padelLevel: pl.padel_level || undefined, tennisRank: pl.tennis_rank || undefined });
async function upsertPlayerFrom(pl, owner) {
  const licence = String(pl.licence || '').replace(/\s+/g, '').toUpperCase();   // chiffres et une lettre : même numéro quelle que soit la casse
  const last = String(pl.last || '').trim().toUpperCase(), first = String(pl.first || '').trim();
  const nameKey = norm(last) + '|' + norm(first);
  let p = (pl.playerId && await store.getPlayer(pl.playerId)) || await store.findPlayer(licence, nameKey);
  const now = Date.now();
  if (!p) p = { id: 'j' + Auth.randomId(12), created_at: now, created_by: owner };
  Object.assign(p, { last: last || p.last, first: first || p.first, licence: licence || p.licence || '', rank: pl.rank || p.rank || '', updated_at: now });
  // club du joueur saisi par le juge-arbitre ; la fiche d'un compte garde le club choisi par son titulaire
  const withClub = !p.user_id && String(pl.club || '').trim();
  if (withClub) p.club_id = await clubs.idOf(pl.club, { by: owner }).catch(() => p.club_id || null);
  p.name_key = norm(p.last) + '|' + norm(p.first);
  p.search = norm(`${p.last} ${p.first} ${p.licence}`);
  await store.savePlayer(p);
  if (withClub) await adhesions.addTournamentPlayer(p).catch(e => console.error('Adhésion du joueur :', e.message));
  return p;
}

/* ---------- fiche joueur de chaque compte /RAM ----------
   Chaque compte (créé depuis /RAM JA ou /RAM Club : c'est la même inscription) a sa propre fiche joueur,
   qui suit le compte : nom, prénom, licence et classement padel sont recopiés à chaque modification du profil.
   Seule exception : une fiche saisie par un juge-arbitre qui porte la même licence est la même personne :
   le compte la reprend, avec son historique. Une fiche n'appartient qu'à un seul compte. */
const playerKeys = pl => Object.assign(pl, { name_key: norm(pl.last) + '|' + norm(pl.first), search: norm(`${pl.last} ${pl.first} ${pl.licence || ''}`) });
// fiche créée pour le compte et jamais jouée : on peut la supprimer quand le compte en reprend une autre
async function emptyAccountPlayer(pl) {
  if (!pl || pl.created_by !== 'compte') return false;
  return !(await store.participationsOf('player_id', pl.id).catch(() => [1])).length;
}
// le compte passe sur une autre fiche (choisie par « Est-ce toi ? » ou trouvée par sa licence)
async function moveAccountPlayer(u, id, pl) {
  const old = id.player && id.player !== pl.id ? await store.getPlayer(id.player).catch(() => null) : null;
  if (old && old.user_id === u.id) {
    if (old.rank && !pl.rank) pl.rank = old.rank;   // le classement padel déjà saisi suit le compte
    if (await emptyAccountPlayer(old)) await store.deletePlayer(old.id);
    else { old.user_id = null; await store.savePlayer(old); }
  }
  pl.user_id = u.id; id.player = pl.id;
}
/* crée ou met à jour la fiche du compte ; extra : { rank } (classement padel venu de /RAM Club) */
async function syncAccountPlayer(u, extra = {}) {
  if (!u || u.guest) return null;
  const id = Object.assign({}, await store.getIdentity(u.id).catch(() => null));
  const nm = splitName(Object.assign({}, u, id)), first = String(nm.first || '').trim(), last = String(nm.last || '').trim().toUpperCase();
  if (!first && !last) return null;
  const licence = String(id.licence || '').toUpperCase(), now = Date.now(), was = id.player;   // moveAccountPlayer change id.player en route
  let pl = id.player ? await store.getPlayer(id.player).catch(() => null) : null;
  if (pl && pl.user_id && pl.user_id !== u.id) pl = null;
  // même licence qu'une fiche de juge-arbitre qui n'est à personne : c'est la sienne, il la reprend
  if (licence && (!pl || pl.licence !== licence)) {
    const lic = await store.findPlayer(licence, '\u0000').catch(() => null);
    if (lic && lic.licence === licence && lic.id !== (pl && pl.id) && (!lic.user_id || lic.user_id === u.id)) { await moveAccountPlayer(u, id, lic); pl = lic; }
  }
  if (!pl) pl = { id: 'j' + Auth.randomId(12), created_at: now, created_by: 'compte', rank: '' };
  Object.assign(pl, { user_id: u.id, last: last || pl.last || '', first: first || pl.first || '', licence: licence || pl.licence || '', updated_at: now });
  if (extra.rank !== undefined) pl.rank = String(extra.rank || '').slice(0, 12);
  if (u.club_id) pl.club_id = u.club_id;   // le club du compte devient celui de sa fiche
  await store.savePlayer(playerKeys(pl));
  if (was !== pl.id) { id.player = pl.id; await store.saveIdentity(u.id, id); }
  await ram.linkPlayer(u.id, pl.id).catch(() => {});
  await adhesions.syncAccount(u, pl.id).catch(e => console.error('Adhésion du compte :', e.message));   // son club de licence pour la saison
  return pl.id;
}
const ensureAccountPlayer = u => syncAccountPlayer(u);
// au démarrage : les comptes existants reçoivent leur fiche (dans l'ordre de création, le premier compte au même nom l'emporte)
async function ensureAllAccountPlayers(log) {
  const users = (await store.listUsers()).filter(u => !u.guest).sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
  let n = 0;
  for (const u of users) { try { const before = (await store.getIdentity(u.id).catch(() => null)) || {}; if (!before.player && await ensureAccountPlayer(u)) n++; } catch (e) {} }
  if (n) log(`Base de joueurs : ${n} fiche(s) créée(s) ou rattachée(s) pour les comptes /RAM`);
}

/* au démarrage : les données saisies avant le référentiel des clubs y sont rattachées (une seule fois :
   seul ce qui n'a pas encore de club_id est repris) */
async function ensureClubLinks(log) {
  await clubs.load();
  let nU = 0, nR = 0, nT = 0, nP = 0;
  const users = (await store.listUsers()).filter(u => !u.guest);
  for (const u of users) {
    try {
      if (!u.club) { const pr = await store.getProfile(u.id).catch(() => null); if (pr && String(pr.club || '').trim()) u.club = String(pr.club).trim().slice(0, 120); }   // club des réglages du juge-arbitre
      if (u.club && !u.club_id) { await store.saveUser(u); if (u.club_id) { nU++; await syncAccountPlayer(u).catch(() => {}); } }
    } catch (e) {}
  }
  for (const s of await ram.spaces().catch(() => [])) {
    if (s.club_id) continue;
    const c = await clubs.resolve(s.name).catch(() => null); if (c) { await ram.linkClub(s.id, c.id); nR++; }
  }
  // adhésions : clubs des comptes et adhérents des espaces /RAM Club, pour la saison en cours
  for (const u of users) if (u.club_id) { const id = await store.getIdentity(u.id).catch(() => null); await adhesions.syncAccount(u, id && id.player).catch(() => {}); }
  await adhesions.syncAllSpaces();
  await progression.syncAllSpaces();
  await groupes.syncAllSpaces();
  await fiches.syncAllSpaces();
  await ram.eachSpace(id => syncClubIdentity(id));
  for (const meta of await store.listAllTournaments()) {
    const s = meta.summary || meta;
    if (meta.club_id || !s.closed || s.example || !String(s.club || '').trim()) continue;
    try {
      const parts = await store.participationsOf('tournament_id', meta.id);
      if (!parts.length) continue;   // tournoi de démonstration : rien n'est entré dans la base
      const club = await clubs.resolve(s.club, { by: meta.owner }); if (!club) continue;
      const row = rooms.has(meta.id) ? rooms.get(meta.id).row : await store.getTournament(meta.id);
      if (!row) continue;
      await store.saveTournament(row); await store.setParticipationsClub(meta.id, club.id); nT++;
      // club de chaque joueur, tel que saisi par le juge-arbitre
      for (const pair of (row.state && row.state.pairs) || []) for (const pl of [pair.p1, pair.p2]) {
        if (!pl || !pl.playerId || !String(pl.club || '').trim()) continue;
        const fiche = await store.getPlayer(pl.playerId).catch(() => null);
        if (fiche && !fiche.club_id && !fiche.user_id) { fiche.club_id = await clubs.idOf(pl.club, { by: meta.owner }); await store.savePlayer(fiche); await adhesions.addTournamentPlayer(fiche).catch(() => {}); nP++; }
      }
    } catch (e) {}
  }
  if (nU + nR + nT + nP) log(`Clubs : ${clubs.list().length} au référentiel — ${nU} compte(s), ${nR} espace(s) /RAM Club, ${nT} tournoi(s), ${nP} fiche(s) joueur rattaché(s)`);
}

/* animation terminée : sa place entre dans l'historique de chaque joueur reconnu (compte /RAM ou fiche de la base),
   comme un tournoi (sans points FFT) ; rouverte, elle en ressort */
async function aniParticipations(room) {
  const T = room.row.state, A = T.ani, t = T.tournament || {};
  if (t.example || A.players.some(p => p.demo)) return;
  const done = A.status === 'done';
  const st = done ? Ani.standings(T) : null;
  const sig = done ? JSON.stringify(st.rows.map(x => [x.ids, x.pf])) + t.name + t.dateStart : '';
  if (room.aniSig === sig || (!done && room.aniSig === undefined && !(await store.participationsOf('tournament_id', room.row.id).catch(() => [])).length)) { room.aniSig = sig; return; }
  room.aniSig = sig;
  await store.deleteParticipationsForTournament(room.row.id);
  if (!done) return;
  const byId = Object.fromEntries(A.players.map(p => [p.id, p]));
  const playerOf = async p => {
    if (p.playerId) return p.playerId;
    if (p.src && p.src.u && !p.src.k) { const id = await store.getIdentity(p.src.u).catch(() => null); return (id && id.player) || null; }
    return null;
  };
  const club = await clubs.resolve(t.club, { by: room.row.owner }).catch(() => null), rows = [], now = Date.now();
  for (const [i, x] of st.rows.entries()) for (const id of x.ids) {
    const p = byId[id], pid = p && await playerOf(p);
    if (!pid) continue;
    rows.push({ id: 'pa' + Auth.randomId(12), player_id: pid, tournament_id: room.row.id, owner: room.row.owner, club_id: club ? club.id : null,
      t_name: t.name, t_club: t.club, t_category: 'Animation · ' + ((Ani.FORMATS[A.format] || {}).name || ''), t_gender: '', t_date: t.dateStart,
      place: i + 1, place_lo: null, points: 0, partner: x.ids.filter(y => y !== id).map(y => (byId[y] || {}).name || '').join(' & '), n_pairs: st.rows.length, closed_at: now });
  }
  await store.addParticipations(rows);
}

async function closeTournament(room, u) {
  const T = room.row.state;
  // animation : terminée par son moteur (classement figé), sans résultats FFT à enregistrer
  if (Ani.isAnimation(T)) {
    try { applyServerAction(room, { type: 'ani/finish' }); } catch (e) { return { error: e.message }; }
    return { ok: true, saved: 0, skipped: 0, unfinished: 0, guest: !!u.guest };
  }
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
    // club organisateur : entre dans le référentiel avec le premier tournoi clôturé qui a des résultats
    const club = rows.length && !t.example ? await clubs.resolve(t.club, { by: u.id }).catch(() => null) : null;
    if (club) { room.row.club_id = club.id; rows.forEach(r => { r.club_id = club.id; }); }
    await store.addParticipations(rows);
    saved = rows.length;
  }
  applyServerAction(room, { type: 'tournament/setClosed', payload: { closed: true } });
  return { ok: true, saved, skipped, unfinished: left, guest: !!u.guest };
}

/* statistiques d'un compte : chaque joueur compté individuellement sur tous ses tournois tirés au sort */
const statsCache = new Map();
async function accountStats(owner) {
  const list = (await store.listTournaments(owner)).slice(0, 300);
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
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
  return { tournaments: nT, matches: nM, players: players.length,
    byTournaments: top('tournaments', 'points'), byPoints: top('points', 'tournaments'), byMatches: top('matches', 'wins') };
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
    /* ---------- /RAM Club (club.riseandmove.fr) : même serveur, mêmes comptes, même base ----------
       Sur le sous-domaine club., tout ce qui n'est pas l'API est l'appli /RAM Club (dossier club/).
       Ailleurs (ja., localhost), elle reste accessible sous /club/ pour les essais. */
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0].toLowerCase();
    // feuilles de style et polices communes (pages de connexion et de présentation) : servies aussi sur club.
    if (/^club\./.test(host) && !p.startsWith('/api/') && !/^\/(css|fonts)\//.test(p)) return sendClub(res, p);
    if (p === '/club') return redirect(res, '/club/');
    if (p.startsWith('/club/')) return sendClub(res, p.slice(5));

    /* ---------- fichiers statiques ---------- */
    if (/^\/(css|js|img|fonts)\//.test(p) || p === '/manifest.webmanifest') return sendFile(res, p, url.searchParams.has('v'));
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
    if (p === '/mot-de-passe-oublie' || p === '/reinitialiser') return sendFile(res, '/auth.html');
    if (p === '/connexion' || p === '/inscription') {
      const u = await currentUser(req);
      // déjà connecté : tableau de bord, ou retour direct vers /RAM Club si l'on en vient
      const back = String(url.searchParams.get('retour') || '');
      if (u && !u.guest) return redirect(res, /^(https:\/\/club\.riseandmove\.fr\/|\/club\/)/.test(back) ? back : '/dashboard', { 'Set-Cookie': Auth.sessionCookie(req, Auth.makeToken(u.id)) });
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
    // déconnexion sans changer de page (/RAM Club, y compris sur club.riseandmove.fr)
    if (p === '/api/auth/logout' && req.method === 'POST') return json(res, 200, { ok: true }, { 'Set-Cookie': Auth.sessionCookie(req, null) });
    let m = p.match(/^\/t\/([\w-]+)\/?(tv|overlay|print|remote)?$/);
    if (m) {
      if (!m[2]) { // éditeur : réservé au propriétaire
        const uid = Auth.sessionUserId(req);
        const row = await store.getTournament(m[1]);
        if (!row) return redirect(res, '/app');
        if (!uid || uid !== row.owner) return redirect(res, '/connexion?retour=' + encodeURIComponent(p));
        return sendFile(res, Ani.isAnimation(row.state) ? '/animation.html' : '/editor.html');
      }
      // animation : une seule page, qui s'adapte (écran TV, saisie des scores par les joueurs)
      const room = await getRoom(m[1]).catch(() => null);
      if (room && Ani.isAnimation(room.row.state)) return sendFile(res, '/animation.html');
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
      await ensureAccountPlayer(u).catch(e => console.error('Fiche joueur du compte :', e.message));   // sa fiche joueur /RAM JA
      // premier tournoi d'exemple pour bien démarrer
      await newTournament(u.id, { demo: true, example: true, name:'Tournoi d\'exemple' });
      // e-mail de bienvenue (sans bloquer l'inscription si l'envoi échoue)
      Mail.send(Object.assign({ to: email }, Mail.welcomeMail({ first, appUrl: appUrl(req) }))).catch(e => console.error('E-mail de bienvenue :', e.message));
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
    /* ---------- boutique Shopify : commande payée → accès activé ou prolongé (création du compte si besoin) ---------- */
    if (p === '/api/shopify/webhook' && req.method === 'POST') {
      const raw = await readRaw(req);
      const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
      if (!secret) { console.error('Webhook Shopify reçu, mais SHOPIFY_WEBHOOK_SECRET est absente dans Render'); return json(res, 503, { error: 'Non configuré' }); }
      if (!Shopify.verify(raw, req.headers['x-shopify-hmac-sha256'], secret)) return json(res, 401, { error: 'Signature invalide' });
      if (req.headers['x-shopify-topic'] !== 'orders/paid') return json(res, 200, { ignored: true });
      let order; try { order = JSON.parse(raw.toString('utf8')); } catch (e) { return json(res, 400, { error: 'JSON invalide' }); }
      const email = Shopify.orderEmail(order);
      if (!email) { console.error(`Shopify : commande ${order.name || order.id} sans e-mail, accès non activé`); return json(res, 200, { ok: false }); }
      let u = await store.getUserByEmail(email);
      const r = Shopify.applyOrder(u ? await store.getBilling(u.id) : null, order);
      if (!r.changed) return json(res, 200, { ok: true, reason: r.reason });
      let link = null;
      const c = order.customer || {}, first = String(c.first_name || '').trim().slice(0, 40), last = String(c.last_name || '').trim().slice(0, 40);
      if (!u) {
        // premier achat sans compte : le compte est créé, le client choisit son mot de passe depuis l'e-mail
        u = { id: 'u' + Auth.randomId(12), email, name: [first, last].filter(Boolean).join(' '), club: String((order.billing_address && order.billing_address.company) || '').slice(0, 120),
          pass_hash: null, plan: 'actif', guest: false, created_at: Date.now() };
        await store.saveUser(u);
        if (first || last) await store.saveIdentity(u.id, { first, last });
      await ensureAccountPlayer(u).catch(e => console.error('Fiche joueur du compte :', e.message));   // sa fiche joueur /RAM JA
        await newTournament(u.id, { demo: true, example: true, name: 'Tournoi d\'exemple' });
      } else if ((u.plan || 'essai') === 'essai') { u.plan = 'actif'; await store.saveUser(u); }
      if (!u.pass_hash) link = appUrl(req) + '/reinitialiser?t=' + encodeURIComponent(Auth.makeResetToken(u, Date.now(), 7 * 864e5));
      await store.saveBilling(u.id, r.billing);
      accessCache.delete(u.id);
      console.log(`  Shopify : commande ${order.name || order.id} payée (${r.items.join(', ')}) → ${email}, accès jusqu'au ${new Date(r.billing.until).toISOString().slice(0, 10)}`);
      const id = await store.getIdentity(u.id).catch(() => null);
      Mail.send(Object.assign({ to: email }, Mail.accessMail({ first: (id && id.first) || first, items: r.items, until: r.billing.until, link, appUrl: appUrl(req) })))
        .catch(e => console.error('E-mail d\'activation :', e.message));
      return json(res, 200, { ok: true });
    }

    /* ---------- mot de passe oublié : lien par e-mail, valable 1 h et une seule fois ---------- */
    if (p === '/api/auth/forgot' && req.method === 'POST') {
      const b = await readBody(req);
      const email = String(b.email || '').trim().toLowerCase();
      if (Auth.tooManyAttempts('forgot|' + clientIp(req))) return json(res, 429, { error: 'Trop de demandes : réessayez dans 15 minutes.' });
      if (!Mail.enabled()) return json(res, 503, { error: 'L\'envoi d\'e-mails n\'est pas encore activé : écrivez-nous pour réinitialiser votre mot de passe.' });
      const u = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? await store.getUserByEmail(email) : null;
      if (u && !u.guest) {
        const link = appUrl(req) + '/reinitialiser?t=' + encodeURIComponent(Auth.makeResetToken(u));
        const id = await store.getIdentity(u.id).catch(() => null);
        await Mail.send(Object.assign({ to: u.email }, Mail.resetMail({ first: (id && id.first) || splitName(u).first, link }))).catch(e => console.error('E-mail de réinitialisation :', e.message));
      }
      // même réponse que le compte existe ou non (on ne révèle pas quelles adresses sont inscrites)
      return json(res, 200, { ok: true });
    }
    if (p === '/api/auth/reset' && req.method === 'POST') {
      const b = await readBody(req);
      const t = Auth.readResetToken(b.token);
      const u = t ? await store.getUser(t.userId) : null;
      if (!u || !Auth.resetMatches(u, t)) return json(res, 400, { error: 'Lien expiré ou déjà utilisé : refaites une demande.' });
      if (String(b.password || '').length < 8) return json(res, 400, { error: 'Le mot de passe doit faire au moins 8 caractères.' });
      u.pass_hash = Auth.hashPassword(b.password); await store.saveUser(u);
      return json(res, 200, { ok: true }, { 'Set-Cookie': Auth.sessionCookie(req, Auth.makeToken(u.id)) });
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
        const list = await Promise.all(users.map(async x => Object.assign(publicUser(x), { rawPlan: x.plan || 'essai', created_at: x.created_at, tournaments: count[x.id] || 0,
          access: await accessFor(x), billing: await store.getBilling(x.id).catch(() => null) })));
        return json(res, 200, { guests, tournaments: tours.length, plans: PLANS, trialDays: Access.TRIAL_DAYS,
          users: list.sort((a, b) => (b.created_at || 0) - (a.created_at || 0)) });
      }
      // date de fin d'accès payé (réglée à la main en attendant l'activation automatique par Shopify)
      let ac = p.match(/^\/api\/admin\/users\/([\w-]+)\/access$/);
      if (ac && req.method === 'POST') {
        const b = await readBody(req);
        const x = await store.getUser(ac[1]); if (!x) return json(res, 404, { error: 'Compte introuvable' });
        const until = b.until ? Date.parse(String(b.until).slice(0, 10) + 'T23:59:59') : 0;
        if (b.until && !until) return json(res, 400, { error: 'Date invalide' });
        await store.saveBilling(x.id, until ? { until, source: 'admin', at: Date.now() } : null);
        if (until && (x.plan || 'essai') === 'essai') { x.plan = 'actif'; await store.saveUser(x); }
        if (!until && x.plan === 'actif') { x.plan = 'essai'; await store.saveUser(x); }
        accessCache.delete(x.id);
        return json(res, 200, { ok: true, access: await accessFor(x) });
      }
      // sauvegardes : liste, sauvegarde immédiate, téléchargement
      if (p === '/api/admin/backups' && req.method === 'GET') {
        const list = await store.listBackups();
        return json(res, 200, { keep: Backup.KEEP, storage: ONLINE ? 'Supabase Storage (bucket privé « sauvegardes »)' : 'dossier data/sauvegardes',
          backups: list.map(b => Object.assign(b, { at: Backup.dateOf(b.name) })) });
      }
      if (p === '/api/admin/backups' && req.method === 'POST') {
        const b = await Backup.createBackup(store, 'manuel');
        return json(res, 200, { ok: true, backup: b });
      }
      let bm = p.match(/^\/api\/admin\/backups\/([\w.-]+\.json)$/);
      if (bm && req.method === 'GET') {
        const text = await store.getBackup(bm[1]);
        if (!text) return json(res, 404, { error: 'Sauvegarde introuvable' });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${bm[1]}"`, 'Cache-Control': 'no-store' });
        return res.end(text);
      }
      let am = p.match(/^\/api\/admin\/users\/([\w-]+)$/);
      if (am && req.method === 'POST') {
        const b = await readBody(req);
        if (!PLANS[b.plan]) return json(res, 400, { error: 'Offre inconnue' });
        const x = await store.getUser(am[1]); if (!x) return json(res, 404, { error: 'Compte introuvable' });
        x.plan = b.plan; await store.saveUser(x);
        accessCache.delete(x.id);
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
      if (b.jaTitles != null) {   // titres de juge-arbitre : un pour le tennis, un pour le padel, au plus
        const list = (Array.isArray(b.jaTitles) ? b.jaTitles : []).map(x => String(x).toUpperCase());
        id.jaTitles = Object.values(JA_TITLES).map(set => list.find(x => set.includes(x))).filter(Boolean); changed = true; refDir = null; titlesCache.clear();
      }
      if (b.avatar != null) {   // photo de profil : image réduite (data URL), ou '' pour la retirer
        const a = String(b.avatar);
        if (a && (!/^data:image\/(png|jpeg|webp);base64,/.test(a) || a.length > 400000)) return json(res, 400, { error: 'Image trop lourde ou format non reconnu.' });
        id.avatar = a; changed = true;
      }
      // le club d'un adhérent /RAM Club est celui de /RAM Club : il ne se change pas ici
      if (b.club != null && !(await mainClubOf(u.id).catch(() => null))) u.club = String(b.club).trim().slice(0, 120);
      await store.saveUser(u);
      if (changed) await store.saveIdentity(u.id, id);
      await syncAccountPlayer(u).catch(e => console.error('Fiche joueur du compte :', e.message));   // la fiche joueur suit le profil
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
      // identité et accès lus en même temps
      const [id, access] = await Promise.all([u && !u.guest ? store.getIdentity(u.id).catch(() => null) : null, u ? accessFor(u) : null]);
      // compte /RAM : la session est renouvelée et étendue à tout riseandmove.fr (/RAM JA + /RAM Club)
      const renew = u && !u.guest ? { 'Set-Cookie': Auth.sessionCookie(req, Auth.makeToken(u.id)) } : undefined;
      return json(res, 200, { user: publicUser(u && Object.assign({}, u, id || {})), access, storage: store.kind }, renew);
    }

    /* ---------- API /RAM Club (même compte /RAM, mêmes données Supabase) ---------- */
    if (p.startsWith('/api/ram/')) {
      const u = await currentUser(req);
      if (!u || u.guest) return json(res, 401, { error: 'Connectez-vous avec votre compte /RAM.' });
      const fail = e => json(res, 400, { error: e.message });
      // mes clubs /RAM Club, avec le club du référentiel et lequel est mon club principal
      if (p === '/api/ram/clubs' && req.method === 'GET') {
        const main = await mainClubOf(u.id).catch(() => null), sps = await ram.spaces();
        return json(res, 200, { clubs: (await ram.myClubs(u.id)).map(c => { const cid = (sps.find(s => s.id === c.id) || {}).club_id || null; return Object.assign(c, { clubId: cid, main: !!cid && cid === main }); }) });
      }
      // notifications sur le téléphone : clé publique, abonnement de cet appareil, désabonnement
      if (p === '/api/ram/push/key' && req.method === 'GET') return json(res, 200, { key: await push.publicKey() });
      if (p === '/api/ram/push/subscribe' && req.method === 'POST') {
        const b = await readBody(req);
        return push.subscribe(u.id, b.subscription, req.headers['user-agent']).then(() => json(res, 200, { ok: true }), fail);
      }
      if (p === '/api/ram/push/unsubscribe' && req.method === 'POST') {
        const b = await readBody(req);
        return push.unsubscribe(String(b.endpoint || '')).then(() => json(res, 200, { ok: true }), fail);
      }
      // pastilles : nouveautés de chacun de mes clubs depuis ma dernière visite
      if (p === '/api/ram/badges' && req.method === 'POST') {
        const b = await readBody(req);
        return json(res, 200, { badges: await ram.badges(u.id, b.since && typeof b.since === 'object' ? b.since : {}) });
      }
      // choisir son club principal (celui de sa licence) parmi ses clubs
      if (p === '/api/ram/main' && req.method === 'POST') {
        const b = await readBody(req), sp = (await ram.spaces()).find(s => s.id === b.id);
        const me = sp && await ram.memberInfo(sp.id, u.id);
        if (!me || !me.valid || !sp.club_id) return json(res, 400, { error: 'Choisissez un club dont l’adhésion est validée.' });
        const id = Object.assign({}, await store.getIdentity(u.id).catch(() => null), { mainClub: sp.club_id });
        await store.saveIdentity(u.id, id);
        await followRamClub(u.id);
        return json(res, 200, { ok: true });
      }
      if (p === '/api/ram/clubs' && req.method === 'POST') {
        const b = await readBody(req), id = await store.getIdentity(u.id).catch(() => null), n = splitName(Object.assign({}, u, id || {}));
        // l'espace /RAM Club est relié au club du référentiel (créé s'il n'y est pas encore)
        const club = await clubs.resolve(b.name, { by: u.id }).catch(() => null);
        return ram.create({ id: u.id, email: u.email, name: [n.first, n.last].filter(Boolean).join(' ') || u.name }, Object.assign({}, b, { clubId: club && club.id })).then(async c => {
          await adhesions.syncSpace(c.id).catch(() => {});   // le créateur, au bureau du club : son club /RAM JA devient celui-ci
          await progression.syncSpace(c.id).catch(() => {});
          await groupes.syncSpace(c.id).catch(() => {});
          return json(res, 200, c);
        }, fail);
      }
      if (p === '/api/ram/join' && req.method === 'POST') {
        const b = await readBody(req), id = await store.getIdentity(u.id).catch(() => null), n = splitName(Object.assign({}, u, id || {}));
        return ram.join({ id: u.id, email: u.email, name: [n.first, n.last].filter(Boolean).join(' ') || u.name }, b.code).then(c => json(res, 200, c), fail);
      }
      const m = p.match(/^\/api\/ram\/c\/([\w-]{1,32})\/(sync|ops|role|remove|events)$/);
      // connexion en direct : l'appareil est prévenu dès qu'un élément du club change, puis il synchronise
      if (m && m[2] === 'events') {
        let ka = null, off = null;
        const end = () => { clearInterval(ka); if (off) off(); };
        off = await ram.listen(u.id, m[1], rev => { res.write(`data: ${JSON.stringify({ rev })}\n\n`); if (rev < 0) { end(); res.end(); } });
        if (!off) return json(res, 404, { error: "Ce club n'existe pas ou vous n'en faites plus partie." });
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write(': ok\n\n');
        ka = setInterval(() => res.write(': ping\n\n'), 20000);
        req.on('close', end);
        return;
      }
      if (m && m[2] === 'sync') {
        const out = await ram.sync(u.id, m[1], url.searchParams.get('since'));
        // titres de juge-arbitre /RAM JA des adhérents (badge dans le club), au premier chargement
        if (out && !+url.searchParams.get('since')) out.jaTitles = await jaTitlesOf(m[1]).catch(() => ({}));
        return out ? json(res, 200, out) : json(res, 404, { error: "Ce club n'existe pas ou vous n'en faites plus partie." });
      }
      if (m && req.method === 'POST') {
        const b = await readBody(req);
        if (m[2] === 'ops') return ram.ops(u.id, m[1], b.ops).then(r => json(res, 200, r), fail);
        if (m[2] === 'role') return ram.setRole(u.id, m[1], b.key, b.role).then(r => json(res, 200, r), fail);
        if (m[2] === 'remove') return ram.remove(u.id, m[1], b.key).then(r => json(res, 200, r), fail);
      }
      return json(res, 404, { error: 'Introuvable' });
    }

    /* ---------- API tournois (tableau de bord) ---------- */
    if (p === '/api/tournaments') {
      const u = await currentUser(req); if (!u) return json(res, 401, { error: 'Connexion requise' });
      if (req.method === 'POST') {
        const acc = await accessFor(u);
        if (!acc.canCreate) return json(res, 402, { error: Access.message(acc), access: acc });
        accessCache.delete(u.id);
        const b = await readBody(req);
        let opts = { name: b.name, demo: !!b.demo, profile: u.guest ? null : await store.getProfile(u.id) };
        // animation (americano, mexicano, par équipes, montée-descente)
        if (b.kind === 'animation') opts = { animation: { format: b.format, name: b.name, club: (opts.profile && opts.profile.club) || u.club || '' } };
        if (b.template) {
          const mine = await store.getTemplates(u.id);
          opts.template = Engine.PRESETS.find(t => t.id === b.template) || mine.find(t => t.id === b.template);
        }
        const row = await newTournament(u.id, opts);
        return json(res, 200, { id: row.id });
      }
      // les deux lectures partent en même temps (avant : l'une après l'autre, deux allers-retours vers la base)
      const [tournaments, mine] = await Promise.all([store.listTournaments(u.id), store.getTemplates(u.id)]);
      return json(res, 200, { tournaments, presets: Engine.PRESETS, mine });
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
        const acc = await accessFor(u);
        if (!acc.canCreate) return json(res, 402, { error: Access.message(acc), access: acc });
        accessCache.delete(u.id);
        const st = JSON.parse(JSON.stringify(room.row.state));
        delete st.tournament.example;
        Object.assign(st, { pairs: [], draw: null, matches: [], poules: [] });
        if (Ani.isAnimation(st)) { Object.assign(st.ani, { players: [], rounds: [], status: 'setup', seed: Math.floor(Math.random() * 1e9) }); st.ani.timer.endsAt = null; st.tournament.closed = false; st.tournament.closedAt = null; }
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

    /* ---------- API statistiques du compte (page Statistiques) ---------- */
    if (p === '/api/stats') {
      const u = await currentUser(req); if (!u) return json(res, 401, { error: 'Connexion requise' });
      return json(res, 200, Object.assign(await accountStats(u.id), { guest: !!u.guest }));
    }

    /* ---------- liens /RAM JA ↔ /RAM Club ---------- */
    /* ma fiche joueur /RAM JA : celle rattachée à mon compte, sinon les fiches qui pourraient être la mienne
       (même licence, ou même nom et prénom), avec leurs derniers tournois pour que je me reconnaisse */
    if (p === '/api/me/player') {
      const u = await currentUser(req); if (!u || u.guest) return json(res, 401, { error: 'Connexion requise' });
      const id = Object.assign({}, await store.getIdentity(u.id).catch(() => null));
      const histOf = async pls => { const parts = await store.participationsOfPlayers(pls.map(x => x.id)).catch(() => []);
        return pls.map(pl => Object.assign(publicPlayer(pl), { history: parts.filter(x => x.player_id === pl.id).sort((a, b) => (b.closed_at || 0) - (a.closed_at || 0))
          .map(x => ({ tournament: x.t_name, club: x.t_club, category: x.t_category, gender: x.t_gender, date: x.t_date, place: x.place, placeLo: x.place_lo, points: x.points, partner: x.partner, pairs: x.n_pairs })) })); };
      if (req.method === 'POST') {
        const b = await readBody(req);
        if (b.licence !== undefined) id.licence = String(b.licence || '').replace(/\s+/g, '').toUpperCase().slice(0, 20);   // les licences comportent une lettre
        if (b.dismiss) id.dismissed = [...new Set([...(id.dismissed || []), String(b.dismiss)])].slice(-20);
        if (b.player) {   // « Est-ce toi ? » : le compte passe sur la fiche qui porte déjà ses tournois
          const pl = await store.getPlayer(String(b.player)).catch(() => null);
          if (!pl) return json(res, 404, { error: 'Fiche joueur introuvable' });
          // une fiche n'appartient qu'à un seul compte : personne ne peut s'attribuer les résultats d'un autre
          if (pl.user_id && pl.user_id !== u.id) return json(res, 409, { error: 'Cette fiche est déjà rattachée à un autre compte /RAM. Contacte le juge-arbitre en cas d\'erreur.' });
          await moveAccountPlayer(u, id, pl); await store.savePlayer(pl);
        }
        await store.saveIdentity(u.id, id);
        // la fiche suit le profil : nom, prénom, licence, classement padel
        await syncAccountPlayer(u, b.rank !== undefined ? { rank: b.rank } : {});
        Object.assign(id, await store.getIdentity(u.id).catch(() => null));
      }
      try {
        const mine = id.player ? await store.getPlayer(id.player).catch(() => null) : null;
        // homonymes : fiches au même nom (ou à la même licence) qui ne sont à personne, à proposer par « Est-ce toi ? »
        const nm = splitName(Object.assign({}, u, id)), key = norm(String(nm.last).toUpperCase()) + '|' + norm(nm.first);
        const found = new Map();
        if (id.licence) { const pl = await store.findPlayer(id.licence, '\u0000').catch(() => null); if (pl && pl.licence === id.licence) found.set(pl.id, pl); }
        if (nm.last && nm.first) (await store.searchPlayers(`${nm.last} ${nm.first}`, 10).catch(() => [])).filter(pl => pl.name_key === key).forEach(pl => found.set(pl.id, pl));
        const cands = [...found.values()].filter(pl => pl.id !== (mine && mine.id) && !pl.user_id && !(id.dismissed || []).includes(pl.id)).slice(0, 4);
        return json(res, 200, { linked: mine ? (await histOf([mine]))[0] : null, licence: id.licence || '', candidates: await histOf(cands) });
      } catch (e) { return json(res, 200, { linked: null, licence: id.licence || '', candidates: [] }); }
    }
    /* annuaire des clubs commun aux deux applis : le référentiel des clubs, avec pour chacun
       son espace /RAM Club éventuel et le nombre de tournois /RAM JA qu'il a accueillis */
    if (p === '/api/clubs-directory') {
      const u = await currentUser(req); if (!u) return json(res, 401, { error: 'Connexion requise' });
      if (!clubDir || Date.now() - clubDir.at > 300000) {
        await clubs.load();
        const dir = new Map(clubs.list().map(c => [c.id, { id: c.id, name: c.name, city: c.city || '', ramClub: false, tournaments: 0 }]));
        const of = (id, name) => dir.get(id) || dir.get((clubs.lookup(name) || {}).id);
        (await ram.spaces().catch(() => [])).forEach(s => { const c = of(s.club_id, s.name); if (c) c.ramClub = true; });
        (await store.listAllTournaments().catch(() => [])).forEach(t => { const s = t.summary || {}; const c = !s.example && of(t.club_id, s.club); if (c) c.tournaments++; });
        clubDir = { at: Date.now(), list: [...dir.values()].sort((a, b) => Number(b.ramClub) - Number(a.ramClub) || b.tournaments - a.tournaments || a.name.localeCompare(b.name)) };
      }
      const q = norm(url.searchParams.get('q') || '');
      return json(res, 200, { clubs: clubDir.list.filter(c => !q || norm(c.name).includes(q)).slice(0, q ? 30 : 500) });
    }
    /* juges-arbitres /RAM JA proposés dans le champ « Juge-arbitre » d'un tournoi : comptes qui ont un titre
       de juge-arbitre ou qui ont déjà organisé un vrai tournoi (pas les comptes seulement /RAM Club) ;
       seulement nom, titres et club — jamais de coordonnées */
    if (p === '/api/referees') {
      const u = await currentUser(req); if (!u || u.guest) return json(res, 401, { error: 'Connexion requise' });
      if (!refDir || Date.now() - refDir.at > 120000) {
        const [users, ids, tours] = await Promise.all([store.listUsers(), store.listIdentities().catch(() => []), store.listAllTournaments().catch(() => [])]);
        const organisers = new Set(tours.filter(t => !(t.summary || {}).example).map(t => t.owner));
        const idOf = new Map(ids.map(x => [x.owner, x.identity || {}]));
        refDir = { at: Date.now(), list: users.filter(x => !x.guest).map(x => {
          const id = idOf.get(x.id) || {}, n = splitName(Object.assign({}, x, id)), titles = Array.isArray(id.jaTitles) ? id.jaTitles : [];
          if (!titles.length && !organisers.has(x.id)) return null;
          return { id: x.id, first: n.first || '', last: String(n.last || '').toUpperCase(), titles, club: clubs.name(x.club_id) || x.club || '' };
        }).filter(r => r && (r.first || r.last)).sort((a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first)) };
      }
      const q = norm(url.searchParams.get('q') || '');
      const hit = r => !q || norm(`${r.first} ${r.last}`).includes(q) || norm(`${r.last} ${r.first}`).includes(q);
      // les juges-arbitres de mon club d'abord (« mon club » dans la liste)
      const mine = u.club_id ? clubs.name(u.club_id) : '';
      const list = refDir.list.filter(hit).map(r => Object.assign({}, r, { sameClub: !!mine && r.club === mine }));
      list.sort((a, b) => Number(b.sameClub) - Number(a.sameClub));
      return json(res, 200, { referees: list.slice(0, 20) });
    }
    /* s'inscrire (ou se désinscrire) à un tournoi /RAM JA depuis /RAM Club */
    if ((p === '/api/ja/inscription' || p === '/api/ja/desinscription') && req.method === 'POST') {
      const u = await currentUser(req); if (!u || u.guest) return json(res, 401, { error: 'Connectez-vous avec votre compte /RAM.' });
      const b = await readBody(req);
      try { return json(res, 200, p === '/api/ja/inscription' ? await jaClub.register(u, String(b.tid || ''), b.partner || null, b.kid ? String(b.kid) : null) : await jaClub.unregister(u, String(b.tid || ''), b.kid ? String(b.kid) : null)); }
      catch (e) { return json(res, 400, { error: e.message }); }
    }
    /* mes clubs : adhésions de mon compte et de ma fiche joueur, saison par saison */
    if (p === '/api/me/clubs') {
      const u = await currentUser(req); if (!u || u.guest) return json(res, 401, { error: 'Connexion requise' });
      const id = await store.getIdentity(u.id).catch(() => null);
      const rows = await adhesions.ofUser(u.id, id && id.player).catch(() => []);
      const managed = await mainClubOf(u.id).catch(() => null);
      const prog = await progression.ofUser(u.id).catch(() => []), grs = await groupes.ofUser(u.id).catch(() => []);
      return json(res, 200, { season: adhesions.seasonOf(), managed: managed ? { clubId: managed, club: clubs.name(managed) } : null, memberships: rows.map(r => ({ clubId: r.club_id, club: clubs.name(r.club_id), role: r.role, status: r.status, season: r.season, source: r.source, licenceClub: !!r.licence_club })),
        // progression /RAM Club : points et trophées, par club et par saison
        progress: prog.map(g => ({ clubId: g.club_id, club: clubs.name(g.club_id), season: g.season, points: g.points, trophies: Object.keys(g.trophies || {}).length })),
        // mes groupes d'entraînement et mes équipes
        groups: grs.map(g => ({ clubId: g.club_id, club: clubs.name(g.club_id), name: g.name, type: g.type, sport: g.sport, day: g.day, start: g.start_time, duration: g.duration, location: g.location, role: g.role, season: g.season })) });
    }
    /* un club : fiche et effectifs de la saison ; la liste nominative est réservée à son bureau */
    m = p.match(/^\/api\/clubs\/(c[\w]{1,24})(\/members)?$/);
    if (m) {
      const u = await currentUser(req); if (!u || u.guest) return json(res, 401, { error: 'Connexion requise' });
      await clubs.load();
      const club = clubs.get(m[1]); if (!club) return json(res, 404, { error: 'Club introuvable' });
      const season = url.searchParams.get('saison') || adhesions.seasonOf();
      const rows = (await store.listMemberships('club_id', club.id)).filter(r => r.season === season);
      const mine = rows.filter(r => r.user_id === u.id);
      const bureau = isAdmin(u) || mine.some(r => r.role === 'bureau' && r.status === 'actif');
      if (!m[2]) {
        // une personne compte une fois, avec son rôle le plus élevé
        const best = new Map(), rank = { bureau: 0, coach: 1, adherent: 2, joueur: 3 };
        rows.filter(r => r.status === 'actif').forEach(r => { const k = r.user_id || r.player_id, b = best.get(k); if (!b || rank[r.role] < rank[b]) best.set(k, r.role); });
        const counts = { bureau: 0, coach: 0, adherent: 0, joueur: 0 }; best.forEach(role => { counts[role]++; });
        const ramClub = (await ram.spaces().catch(() => [])).some(s => s.club_id === club.id);
        return json(res, 200, { club: { id: club.id, name: club.name, city: club.city || '', short: club.short || '' }, season, counts, ramClub, bureau,
          me: mine.map(r => ({ role: r.role, status: r.status, source: r.source })) });
      }
      if (!bureau) return json(res, 403, { error: 'Réservé au bureau du club.' });
      const players = await store.getPlayers([...new Set(rows.map(r => r.player_id).filter(Boolean))]).catch(() => []);
      const people = new Map();
      for (const r of rows) {
        const k = r.user_id || r.player_id, pl = players.find(x => x.id === r.player_id);
        const o = people.get(k) || { last: '', first: '', licence: '', roles: [], status: 'actif', sources: [] };
        if (pl) Object.assign(o, { last: pl.last, first: pl.first, licence: pl.licence || '' });
        else if (r.user_id && !o.last) { const usr = await store.getUser(r.user_id).catch(() => null); if (usr) Object.assign(o, splitName(usr)); }
        if (!o.roles.includes(r.role)) o.roles.push(r.role);
        if (!o.sources.includes(r.source)) o.sources.push(r.source);
        if (r.status === 'attente' && r.source === 'ramclub') o.status = 'attente';
        people.set(k, o);
      }
      return json(res, 200, { season, members: [...people.values()].sort((a, b) => String(a.last).localeCompare(String(b.last))) });
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
          const list = players.map(pl => Object.assign(publicPlayer(pl), { tournaments: parts.filter(x => x.player_id === pl.id).length }));
          // adhérents /RAM Club pas encore dans la base : proposés aussi (nom, licence, classement padel, club)
          const known = new Set(players.flatMap(pl => [pl.id, pl.licence && 'l:' + pl.licence, pl.name_key && 'n:' + pl.name_key].filter(Boolean)));
          (await ram.searchMembers(q, 6).catch(() => [])).forEach(m => {
            const w = m.name.trim().split(/\s+/), first = w.shift() || '', last = w.join(' ').toUpperCase();
            if ((m.ja && known.has(m.ja)) || (m.licence && known.has('l:' + m.licence)) || known.has('n:' + norm(last) + '|' + norm(first))) return;
            list.push({ id: 'rc-' + m.clubId + '-' + m.key, last, first, licence: m.licence, rank: m.rank, club: m.club, source: 'club', tournaments: 0 });
          });
          return json(res, 200, { players: list });
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
          // le club des réglages du juge-arbitre devient celui de son compte, s'il n'en avait pas
          if (!u.club && String(p.club || '').trim()) { u.club = String(p.club).trim().slice(0, 120); await store.saveUser(u); await syncAccountPlayer(u).catch(() => {}); }
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
    m = p.match(/^\/api\/t\/([\w-]+)\/(events|action|undo|export|info|stats)$/);
    if (m) {
      const room = await getRoom(m[1]);
      if (!room) return json(res, 404, { error: 'Tournoi introuvable' });
      const level = await access(req, url, room);
      if (level === 'blocked') return json(res, 429, { error: 'Trop de codes incorrects : réessayez dans 15 minutes.' });
      if (!level) return json(res, 401, { error: 'Accès refusé : connexion, clé de diffusion ou code PIN requis.' });
      const what = m[2];
      // écran TV : statistiques générales du compte organisateur (pas seulement ce tournoi), gardées 1 min
      if (what === 'stats') {
        const c = statsCache.get(room.row.owner);
        if (c && Date.now() - c.at < 60000) return json(res, 200, c.data);
        const data = await accountStats(room.row.owner);
        statsCache.set(room.row.owner, { at: Date.now(), data });
        return json(res, 200, data);
      }

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
        const acc = await accessOfOwner(room.row.owner);
        if (!acc.canEdit) return json(res, 402, { error: Access.message(acc) });
        if (room.history.length) { room.row.state = JSON.parse(room.history.pop()); room.rev++; saveRoom(room); broadcast(room); }
        return json(res, 200, { ok: true });
      }
      if (what === 'action' && req.method === 'POST') {
        const action = restoreImages(await readBody(req));
        if (level === 'view' && !VIEW_ACTIONS.has(action.type)) return json(res, 403, { error: 'Action non autorisée depuis cet écran.' });
        // accès terminé : le tournoi reste visible mais n'est plus modifiable
        if (!Access.READONLY_OK.has(action.type)) {
          const acc = await accessOfOwner(room.row.owner);
          if (!acc.canEdit) return json(res, 402, { error: Access.message(acc) || 'Lecture seule.' });
        }
        if (level === 'score' && !SCORE_ACTIONS.has(action.type)) return json(res, 403, { error: 'Action non autorisée depuis la télécommande.' });
        if (action.type === 'noop') return json(res, 200, { ok: true, rev: room.rev });
        const before = JSON.stringify(room.row.state);
        const draft = JSON.parse(before);
        try { reducerOf(draft).reduce(draft, action); } catch (e) { return json(res, 400, { error: e.message }); }
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
  console.log('   /RAM JA — serveur démarré');
  console.log('  ==============================================');
  console.log(`   Stockage : ${ONLINE ? 'Supabase (en ligne)' : 'fichiers locaux (dossier data)'}`);
  console.log(`   Ouvrir   : http://localhost:${PORT}/`);
  if (!ONLINE) lanAddresses().forEach(ip => console.log(`   Réseau   : http://${ip}:${PORT}/`));
  console.log('\n   Laissez cette fenêtre ouverte pendant le tournoi.\n');
  Backup.schedule(store, msg => console.log('  ' + msg));
  Retention.schedule(store, msg => console.log('  ' + msg));
  Mail.keepAlive(msg => console.log('  ' + msg));
  ensureAllAccountPlayers(msg => console.log('  ' + msg)).catch(e => console.error('  Fiches joueurs des comptes :', e.message))
    .then(() => ensureClubLinks(msg => console.log('  ' + msg))).catch(e => console.error('  Clubs :', e.message));
  adhesions.watch(msg => console.error('  ' + msg));
  progression.watch(msg => console.error('  ' + msg));   // et sa progression (trophées, points)
  groupes.watch(msg => console.error('  ' + msg));
  fiches.watch(msg => console.error('  ' + msg));
  watchClubIdentity();   // logo, adresse, terrains du club        // et ses groupes   // chaque changement d'un espace /RAM Club met à jour ses adhésions
});
server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.log(`\n  Le port ${PORT} est déjà utilisé : /RAM JA est sans doute déjà lancé.\n`);
  else console.error(e);
});
// sauvegarde propre à l'arrêt
['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, async () => {
  for (const r of rooms.values()) { clearTimeout(r.timer); r.row.updated_at = Date.now(); try { await store.saveTournament(r.row); } catch (e) {} }
  process.exit(0);
}));
