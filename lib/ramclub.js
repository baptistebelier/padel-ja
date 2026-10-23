/* =========================================================================
   RAM CLUB — données réelles des clubs (réseau social des clubs de tennis et de padel)
   - Un club = des éléments rangés par collection : publications, messages, groupes,
     rencontres, profils des adhérents… (le contenu de chaque élément est libre, en JSON)
   - Le serveur garde chaque club en mémoire et écrit chaque changement dans Supabase
     (tables ram_clubs, ram_members, ram_items) ou dans des fichiers en local.
   - Les appareils se synchronisent avec un numéro de version (rev) : « donne-moi ce qui a
     changé depuis la version N ».
   - Les modifications arrivent en petites opérations (patch) appliquées sur la dernière
     version : deux adhérents qui s'inscrivent en même temps ne s'écrasent pas.
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { clubScores, memberProgress, deriveCounts } = require('./ram-score');

const COLLS = ['conf', 'post', 'msg', 'chan', 'group', 'champ', 'rec', 'art', 'partner', 'comm', 'report', 'member', 'prefs', 'stats', 'claim'];
const ROLES = ['bureau', 'coach', 'mem'];
const idOk = id => typeof id === 'string' && /^[\w.-]{1,64}$/.test(id);
const isObj = o => o && typeof o === 'object' && !Array.isArray(o);
const clone = o => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/* saison sportive : de septembre à août (« 2026-2027 ») */
function seasonOf(d = new Date()) { const y = d.getFullYear(); return d.getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`; }

/* numéros de version croissants (microsecondes), même si deux écritures tombent dans la même milliseconde */
let lastRev = 0;
const nextRev = () => (lastRev = Math.max(Date.now() * 1000, lastRev + 1));

/* ---------------------------------------------------------------------
   Patch : liste d'opérations { p: chemin, t: set | unset | add | rm, v }
   add / rm : ajouter ou retirer une valeur d'une liste (sans doublon)
   --------------------------------------------------------------------- */
function applyPatch(data, patch) {
  const out = clone(isObj(data) ? data : {});
  for (const op of patch || []) {
    const p = op.p;
    if (!Array.isArray(p) || !p.length || p.some(k => typeof k !== 'string' || k === '__proto__' || k === 'constructor' || k === 'prototype')) throw new Error('chemin invalide');
    let o = out;
    for (const k of p.slice(0, -1)) { if (!isObj(o[k])) o[k] = {}; o = o[k]; }
    const k = p[p.length - 1];
    if (op.t === 'set') o[k] = clone(op.v);
    else if (op.t === 'unset') delete o[k];
    else if (op.t === 'add') { if (!Array.isArray(o[k])) o[k] = []; if (!o[k].some(x => JSON.stringify(x) === JSON.stringify(op.v))) o[k].push(clone(op.v)); }
    else if (op.t === 'rm') { if (Array.isArray(o[k])) o[k] = o[k].filter(x => JSON.stringify(x) !== JSON.stringify(op.v)); }
    else throw new Error('opération inconnue');
  }
  return out;
}
/* un patch qui ne touche que « moi » (ou mes enfants) : ma réponse, ma réaction, mon inscription… */
const selfOnly = (patch, keys) => { const K = [].concat(keys); return Array.isArray(patch) && patch.length > 0 && patch.every(op => (op.p || []).some(k => K.includes(k)) || ((op.t === 'add' || op.t === 'rm') && K.includes(op.v))); };

/* ---------------------------------------------------------------------
   Droits : qui peut écrire quoi
   ctx = { key, role, staff, bureau, valid }
   --------------------------------------------------------------------- */
function authorOf(club, ctx, coll, id, d) {
  if (!d) return false;
  const k = ctx.key, get = (c, i) => { const it = club.items.get(c + '/' + i); return it && !it.del ? it.data : null; };
  const capOf = tid => { const g = get('group', tid); return !!g && g.cap === k; };
  switch (coll) {
    case 'conf': return ctx.bureau;
    case 'post':
      if (ctx.staff) return true;
      if (d.by === k) return true;
      if (d.by === 'club' && (d.kind === 'result' || d.kind === 'match')) { const r = get('rec', d.rec); return !!r && capOf(r.tid); }
      if (d.by === 'club' && d.kind === 'teamfinal') return capOf(d.tid);
      return false;
    case 'msg': return ctx.staff || d.by === k;
    case 'chan': case 'champ': case 'art': case 'partner': return ctx.staff;
    case 'group': return ctx.staff || d.cap === k || d.coach === k;
    case 'rec': return ctx.staff || capOf(d.tid);
    case 'comm': return ctx.staff || d.resp === k;
    case 'report': return ctx.staff;
    case 'member': return ctx.staff || id === k || d.parent === k;
    case 'prefs': return id === k;
    case 'stats': return ctx.staff || id === k;
    case 'claim': return ctx.staff || d.by === k;
  }
  return false;
}
/* ce qu'un adhérent peut lire : tout le club une fois son adhésion validée ;
   avant validation, seulement la fiche du club et son propre profil */
function readable(ctx, coll, id, d) {
  if (coll === 'prefs') return id === ctx.key;
  if (coll === 'report') return ctx.staff;
  if (coll === 'claim') return ctx.staff || (d && d.by === ctx.key);
  if (ctx.valid) return true;
  return coll === 'conf' || ((coll === 'member' || coll === 'stats') && id === ctx.key);
}

/* vérifie et applique une opération ; renvoie l'élément modifié ou lève une erreur lisible */
function checkOp(club, ctx, op) {
  const { coll, id } = op || {};
  if (!COLLS.includes(coll) || !idOk(id)) throw new Error('élément invalide');
  const cur = club.items.get(coll + '/' + id), before = cur && !cur.del ? cur.data : null;
  // avant validation : seulement son profil, ses réglages et ses compteurs
  if (!ctx.valid && !((coll === 'member' || coll === 'prefs' || coll === 'stats') && id === ctx.key)) throw new Error('adhésion pas encore validée');
  let after = null;
  if (op.op === 'del') {
    if (!before) return null;
    if (!authorOf(club, ctx, coll, id, before) || coll === 'conf' || (coll === 'member' && !ctx.bureau && before.parent !== ctx.key)) throw new Error('suppression non autorisée');
  } else if (op.op === 'put') {
    if (!isObj(op.data)) throw new Error('contenu invalide');
    after = clone(op.data);
    if (before && !authorOf(club, ctx, coll, id, before)) throw new Error('modification non autorisée');
    if (!authorOf(club, ctx, coll, id, after)) throw new Error('création non autorisée');
  } else if (op.op === 'patch') {
    if (!before && coll !== 'prefs' && coll !== 'stats') throw new Error('élément introuvable');
    after = applyPatch(before, op.patch);
    const own = authorOf(club, ctx, coll, id, before || after) && authorOf(club, ctx, coll, id, after);
    if (!own && !(['post', 'msg', 'rec', 'group', 'comm'].includes(coll) && selfOnly(op.patch, [ctx.key].concat(ctx.kids || [])))) throw new Error('modification non autorisée');
  } else throw new Error('opération inconnue');
  // la validation d'une adhésion (saison) ne se donne pas soi-même
  if (coll === 'member' && !ctx.bureau && JSON.stringify((before || {}).valid || '') !== JSON.stringify((after || {}).valid || '')) {
    if (!(ctx.staff && after && after.valid)) throw new Error('seul le bureau valide une adhésion');
  }
  // trophées décernés (« award:… ») : seuls le bureau et les enseignants les donnent ou les retirent
  if (coll === 'stats' && !ctx.staff) {
    const aw = d => JSON.stringify(((d && Array.isArray(d.k)) ? d.k : []).filter(x => String(x).startsWith('award:')).sort());
    if (aw(before) !== aw(after)) throw new Error('seul le club décerne un trophée');
  }
  // compteur de mises à jour du classement (trophée « Classement à jour ») : tenu par le serveur,
  // une mise à jour comptée par jour au plus, impossible à modifier depuis un appareil
  // fiche joueur /RAM JA rattachée (« _ja ») : écrite seulement par le serveur (rattachement vérifié), jamais par un appareil
  if (coll === 'member' && after) { if (before && before._ja) after._ja = before._ja; else delete after._ja; }
  if (coll === 'member' && after) {
    const b = before || {}, rankOf = d => JSON.stringify([d.r || '', d.pad || '', d.pl || 0]);
    after._rk = +b._rk || 0; after._rkd = b._rkd || '';
    const today = new Date().toISOString().slice(0, 10);
    if (before && rankOf(b) !== rankOf(after) && after._rkd !== today) { after._rk++; after._rkd = today; }
    if (!after._rk) { delete after._rk; delete after._rkd; }
  }
  return after;
}

/* ---------------------------------------------------------------------
   Stockage : fichiers (local, tests) ou Supabase (en ligne)
   --------------------------------------------------------------------- */
function fileBackend(dir) {
  const D = path.join(dir, 'ramclub');
  fs.mkdirSync(D, { recursive: true });
  const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')); } catch (e) { return d; } };
  const write = (f, o) => { const p = path.join(D, f); fs.writeFileSync(p + '.tmp', JSON.stringify(o)); fs.renameSync(p + '.tmp', p); };
  const safe = s => String(s).replace(/[^\w-]/g, '');
  return {
    kind: 'fichiers',
    async clubs() { return read('clubs.json', []); },
    async saveClub(c) { write('clubs.json', read('clubs.json', []).filter(x => x.id !== c.id).concat([c])); },
    async members() { return read('members.json', []); },
    async saveMember(m) { write('members.json', read('members.json', []).filter(x => !(x.club_id === m.club_id && x.user_id === m.user_id)).concat([m])); },
    async deleteMember(clubId, userId) { write('members.json', read('members.json', []).filter(x => !(x.club_id === clubId && x.user_id === userId))); },
    async items(clubId) { return read('items-' + safe(clubId) + '.json', []); },
    async saveItems(clubId, rows) {
      const f = 'items-' + safe(clubId) + '.json', all = read(f, []), key = r => r.coll + '/' + r.id;
      const m = new Map(all.map(r => [key(r), r])); rows.forEach(r => m.set(key(r), r)); write(f, [...m.values()]);
    }
  };
}
function supabaseBackend(url, key) {
  const base = url.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '') + '/rest/v1/';
  const H = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) H.Authorization = 'Bearer ' + key;
  async function q(method, table, query, body, extra) {
    const r = await fetch(base + table + (query ? '?' + query : ''), { method, headers: Object.assign({}, H, extra || {}), body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(`Supabase ${method} ${table} : ${r.status} ${await r.text()}`);
    const t = await r.text(); return t ? JSON.parse(t) : null;
  }
  const enc = encodeURIComponent, merge = { Prefer: 'resolution=merge-duplicates,return=minimal' };
  const all = async (t, query) => { const out = []; for (let o = 0; ; o += 1000) { const rows = await q('GET', t, query, null, { Range: o + '-' + (o + 999) }); out.push(...rows); if (rows.length < 1000) return out; } };
  return {
    kind: 'supabase',
    async clubs() { return all('ram_clubs', 'select=*&order=id.asc'); },
    async saveClub(c) { await q('POST', 'ram_clubs', 'on_conflict=id', c, merge); },
    async members() { return all('ram_members', 'select=*&order=club_id.asc'); },
    async saveMember(m) { await q('POST', 'ram_members', 'on_conflict=club_id,user_id', m, merge); },
    async deleteMember(clubId, userId) { await q('DELETE', 'ram_members', 'club_id=eq.' + enc(clubId) + '&user_id=eq.' + enc(userId)); },
    async items(clubId) { return all('ram_items', 'select=*&order=rev.asc&club_id=eq.' + enc(clubId)); },
    async saveItems(clubId, rows) { if (rows.length) await q('POST', 'ram_items', 'on_conflict=club_id,coll,id', rows.map(r => Object.assign({ club_id: clubId }, r)), merge); }
  };
}

/* ---------------------------------------------------------------------
   Le service : clubs gardés en mémoire, écriture immédiate dans le stockage
   --------------------------------------------------------------------- */
function createRamClub(dataDir, opts = {}) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  const db = opts.backend || (url && key ? supabaseBackend(url, key) : fileBackend(dataDir));
  let clubs = null, members = null;                 // listes complètes (petites), chargées une fois
  const cache = new Map();                           // club_id → { items: Map, rev }
  let queue = Promise.resolve();                     // écritures une par une : jamais deux patchs mêlés
  const serial = fn => (queue = queue.then(fn, fn));
  /* appareils connectés en direct, par club : prévenus à chaque changement (comme une messagerie) */
  const listeners = new Map();                       // club_id → Set(fonction)
  const emit = (clubId, rev) => {
    const l = listeners.get(clubId); if (l) l.forEach(fn => { try { fn(rev); } catch (e) {} });
    changeHooks.forEach(fn => { try { fn(clubId); } catch (e) {} });
  };
  const changeHooks = [];                            // le serveur est prévenu de chaque changement (adhésions, progression)

  async function boot() { if (!clubs) { clubs = await db.clubs(); members = await db.members(); } }
  async function club(id) {
    await boot();
    if (!clubs.some(c => c.id === id)) return null;
    let c = cache.get(id);
    if (!c) {
      const rows = await db.items(id);
      c = { items: new Map(rows.map(r => [r.coll + '/' + r.id, { coll: r.coll, id: r.id, data: r.data, rev: +r.rev, del: !!r.deleted }])), rev: 0 };
      c.items.forEach(it => { c.rev = Math.max(c.rev, it.rev); lastRev = Math.max(lastRev, it.rev); });
      cache.set(id, c);
    }
    return c;
  }
  const memberOf = (clubId, userId) => members.find(m => m.club_id === clubId && m.user_id === userId) || null;
  function ctxOf(c, m) {
    const conf = (c.items.get('conf/main') || {}).data || {}, me = (c.items.get('member/' + m.key) || {}).data || {};
    const staff = m.role === 'bureau' || m.role === 'coach';
    const kids = []; c.items.forEach(it => { if (it.coll === 'member' && !it.del && it.data && it.data.parent === m.key) kids.push(it.id); });
    return { key: m.key, role: m.role, staff, bureau: m.role === 'bureau', valid: staff || (!!conf.season && me.valid === conf.season), kids };
  }
  async function write(clubId, c, list) {
    const rows = list.map(it => ({ coll: it.coll, id: it.id, data: it.data, rev: it.rev, deleted: it.del }));
    await db.saveItems(clubId, rows);
  }
  function put(c, coll, id, data) {
    if (data && typeof data === 'object') data.id = id;   // l'appli retrouve chaque élément par son id
    const it = { coll, id, data, rev: nextRev(), del: data == null }; c.items.set(coll + '/' + id, it); c.rev = Math.max(c.rev, it.rev); return it; }

  /* code d'entrée du club : sigle + 4 chiffres (« TPC-4821 ») */
  function newCode(short) {
    const s = String(short || 'CLUB').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'CLUB';
    for (;;) { const code = s + '-' + crypto.randomInt(1000, 10000); if (!clubs.some(c => c.code === code)) return code; }
  }
  const newId = () => crypto.randomBytes(8).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
  const profile = (who, extra) => Object.assign({ n: who.name || 'Adhérent', r: 'NC', team: '', fol: 0, g: who.g || 'H', bd: '', res: [], pres: [] }, extra);

  return {
    kind: db.kind,
    seasonOf,
    /* les clubs dont je suis membre */
    async myClubs(userId) {
      await boot();
      return members.filter(m => m.user_id === userId).map(m => { const c = clubs.find(x => x.id === m.club_id) || {}; return { id: m.club_id, name: c.name, code: m.role === 'bureau' ? c.code : undefined, role: m.role, key: m.key }; });
    },
    /* créer un club : le créateur est au bureau, deux groupes de discussion sont prêts */
    create(user, b) {
      return serial(async () => {
        await boot();
        const name = String(b.name || '').trim().slice(0, 60), short = String(b.short || '').trim().toUpperCase().slice(0, 4);
        if (name.length < 2) throw new Error('Indiquez le nom du club.');
        if (members.filter(m => m.user_id === user.id && m.role === 'bureau').length >= 5) throw new Error('Vous gérez déjà 5 clubs.');
        const id = newId(), code = newCode(short || name), now = Date.now(), season = seasonOf();
        const row = { id, code, name, created_by: user.id, created_at: now };
        if (b.clubId) row.club_id = b.clubId;   // club du référentiel commun (lib/clubs.js), choisi par le serveur
        await db.saveClub(row); clubs.push(row);
        const m = { club_id: id, user_id: user.id, key: 'u' + newId(), role: 'bureau', created_at: now };
        await db.saveMember(m); members.push(m);
        const c = { items: new Map(), rev: 0 }; cache.set(id, c);
        const list = [
          put(c, 'conf', 'main', { name, short: short || name.slice(0, 3).toUpperCase(), label: name, dark: true, accent: '#E0F50A', hot: '#F5104C', season,
            info: { courts: 0, pistes: 0, members: 0, joined: 1, house: '', secr: '', addr: '', shop: '', book: '', pay: '', code, mods: { actus: true, comm: true } }, form: [] }),
          put(c, 'chan', 'annonces', { g: 'club', name: 'Annonces', desc: 'Le club uniquement', ro: 1 }),
          put(c, 'chan', 'general', { g: 'club', name: 'Général', desc: 'Tous les adhérents' }),
          put(c, 'member', m.key, profile(user, { role: 'Bureau', valid: season }))
        ];
        await write(id, c, list);
        return { id, name, code, role: 'bureau', key: m.key };
      });
    },
    /* ---------- liens avec /RAM JA ---------- */
    /* noms des clubs (annuaire commun aux deux applis) */
    async clubNames() { await boot(); return clubs.map(c => c.name).filter(Boolean); },
    /* espaces /RAM Club et club du référentiel auquel chacun est relié */
    async spaces() { await boot(); return clubs.map(c => ({ id: c.id, name: c.name, club_id: c.club_id || null })); },
    /* le serveur est prévenu de chaque changement d'un club */
    onChange(fn) { changeHooks.push(fn); },
    /* adhérents d'un espace, tels que le référentiel des clubs les enregistre : rôle d'accès,
       adhésion validée pour la saison du club ou en attente (les enfants sans compte n'y sont pas) */
    async roster(id) {
      const c = await club(id); if (!c) return null;
      const season = ((c.items.get('conf/main') || {}).data || {}).season || seasonOf();
      return members.filter(m => m.club_id === id && m.user_id).map(m => ({ user_id: m.user_id, role: m.role, season, valid: ctxOf(c, m).valid }));
    },
    /* progression de chaque adhérent ayant un compte : compteurs, trophées, points, pour la saison du club */
    async progress(id) {
      const c = await club(id); if (!c) return null;
      const season = ((c.items.get('conf/main') || {}).data || {}).season || seasonOf();
      const mem = members.filter(m => m.club_id === id);
      const p = memberProgress(c.items, Object.fromEntries(mem.map(m => [m.key, m.role])));
      return mem.filter(m => m.user_id && p[m.key]).map(m => Object.assign({ user_id: m.user_id, season }, p[m.key]));
    },
    /* groupes de l'espace (entraînement, équipes) et compte de chaque adhérent (clé → compte) */
    async groupsOf(id) {
      const c = await club(id); if (!c) return null;
      const season = ((c.items.get('conf/main') || {}).data || {}).season || seasonOf(), groups = [];
      c.items.forEach(it => { if (it.coll === 'group' && !it.del && it.data) groups.push({ key: it.id, data: it.data }); });
      return { season, groups, users: Object.fromEntries(members.filter(m => m.club_id === id && m.user_id).map(m => [m.key, m.user_id])) };
    },
    linkClub(id, clubId) {
      return serial(async () => { await boot(); const c = clubs.find(x => x.id === id); if (!c || c.club_id === clubId) return; c.club_id = clubId; await db.saveClub(c); });
    },
    /* adhérents dont le nom ou la licence correspond, tous clubs confondus (pour la saisie des paires dans /RAM JA) :
       seulement nom, licence, classement padel et club ; jamais de coordonnées ; adhésions en attente exclues */
    async searchMembers(q, limit = 8) {
      await boot();
      const n = fold(q); if (n.length < 2) return [];
      const out = [];
      for (const row of clubs) {
        const c = await club(row.id); if (!c) continue;
        c.items.forEach(it => {
          if (it.coll !== 'member' || it.del || !it.data || it.data.req || out.length >= limit * 3) return;
          const d = it.data, name = String(d.n || ''), lic = String(d.lic || '');
          if (!(fold(name).includes(n) || (lic && lic.toUpperCase().startsWith(String(q).replace(/\s+/g, '').toUpperCase())))) return;
          out.push({ club: row.name, clubId: row.id, key: it.id, name, licence: lic, rank: d.pad ? String(d.pad) : '', ja: d._ja || null });
        });
      }
      return out.slice(0, limit);
    },
    /* rattacher (ou détacher) la fiche joueur /RAM JA d'un compte : écrit « _ja » dans son profil, dans chacun de ses clubs ;
       seul le serveur écrit ce champ (voir checkOp), personne ne peut s'attribuer les résultats d'un autre */
    linkPlayer(userId, playerId) {
      return serial(async () => {
        await boot();
        for (const m of members.filter(x => x.user_id === userId)) {
          const c = await club(m.club_id); if (!c) continue;
          const cur = c.items.get('member/' + m.key); if (!cur || cur.del || !cur.data) continue;
          const data = clone(cur.data); if (playerId) data._ja = playerId; else delete data._ja;
          if (JSON.stringify(data) === JSON.stringify(cur.data)) continue;
          const it = put(c, 'member', m.key, data);
          await write(m.club_id, c, [it]); emit(m.club_id, c.rev);
        }
      });
    },
    /* rejoindre avec le code du club : la demande attend la validation du bureau */
    join(user, codeIn) {
      return serial(async () => {
        await boot();
        const code = String(codeIn || '').trim().toUpperCase().replace(/\s+/g, '');
        const row = clubs.find(c => c.code === code);
        if (!row) throw new Error('Code inconnu : vérifiez-le auprès du bureau du club.');
        const had = memberOf(row.id, user.id);
        if (had) return { id: row.id, name: row.name, role: had.role, key: had.key };
        const c = await club(row.id);
        const m = { club_id: row.id, user_id: user.id, key: 'u' + newId(), role: 'mem', created_at: Date.now() };
        await db.saveMember(m); members.push(m);
        await write(row.id, c, [put(c, 'member', m.key, profile(user, { valid: '', req: 1, via: 'le code du club', mail: user.email || '' }))]);
        emit(row.id, c.rev);
        return { id: row.id, name: row.name, role: 'mem', key: m.key };
      });
    },
    /* état (ou changements depuis « since ») visible par ce membre */
    async sync(userId, clubId, since) {
      const c = await club(clubId); if (!c) return null;
      const m = memberOf(clubId, userId); if (!m) return null;
      const ctx = ctxOf(c, m), s = +since || 0, items = [];
      c.items.forEach(it => {
        if (it.rev <= s) return;
        if (it.del) items.push({ coll: it.coll, id: it.id, del: 1 });
        else if (readable(ctx, it.coll, it.id, it.data)) items.push({ coll: it.coll, id: it.id, data: it.data });
      });
      const out = { rev: c.rev, me: { key: m.key, role: m.role, valid: ctx.valid }, items };
      // score d'investissement de chaque adhérent, calculé ici une seule fois pour tout le monde
      // et compteurs d'actions recomptés ici (affichés sur les pages Trophées à la place de ceux de l'appareil)
      out.counts = deriveCounts(c.items);
      out.scores = clubScores(c.items, Object.fromEntries(members.filter(x => x.club_id === clubId).map(x => [x.key, x.role])));
      if (!s) {
        const row = clubs.find(x => x.id === clubId);
        out.club = { id: clubId, name: row.name, code: ctx.staff ? row.code : undefined };
        // rôles d'accès des adhérents (bureau, enseignant) et nombre d'abonnés de chacun
        out.roles = Object.fromEntries(members.filter(x => x.club_id === clubId).map(x => [x.key, x.role]));
        const fol = {}; c.items.forEach(it => { if (it.coll === 'prefs' && !it.del && it.data && Array.isArray(it.data.follow)) it.data.follow.forEach(k => { fol[k] = (fol[k] || 0) + 1; }); });
        out.fol = fol;
      }
      return out;
    },
    /* appliquer des opérations ; celles qui sont refusées sont renvoyées avec la raison */
    ops(userId, clubId, list) {
      return serial(async () => {
        const c = await club(clubId); if (!c) throw new Error('Club introuvable');
        const m = memberOf(clubId, userId); if (!m) throw new Error('Vous ne faites pas partie de ce club.');
        if (!Array.isArray(list) || list.length > 500) throw new Error('Trop de changements à la fois.');
        const ctx = ctxOf(c, m), done = [], rejected = [];
        for (const op of list) {
          try {
            const after = checkOp(c, ctx, op);
            if (after === null && op.op === 'del' && !(c.items.get(op.coll + '/' + op.id) || {}).data) continue;
            done.push(put(c, op.coll, op.id, op.op === 'del' ? null : after));
            if (op.coll === 'conf' && after && after.name) { const row = clubs.find(x => x.id === clubId); if (row && row.name !== after.name) { row.name = String(after.name).slice(0, 60); await db.saveClub(row); } }
          } catch (e) {
            rejected.push({ coll: op && op.coll, id: op && op.id, error: e.message });
            // journal (Render) : qui, quoi, pourquoi — les chemins modifiés, jamais le contenu
            console.warn(`/RAM Club refus · club ${clubId} · ${ctx.key} (${ctx.role}${ctx.valid ? '' : ', en attente'}) · ${op && op.op} ${op && op.coll}/${op && op.id} · ${e.message}` +
              (op && Array.isArray(op.patch) ? ' · ' + op.patch.slice(0, 6).map(x => x.t + ' ' + (x.p || []).join('.')).join(', ') : ''));
          }
        }
        if (done.length) { await write(clubId, c, done); emit(clubId, c.rev); }
        return { rev: c.rev, rejected };
      });
    },
    /* écouter les changements d'un club (connexion en direct) ; renvoie de quoi arrêter d'écouter */
    async listen(userId, clubId, fn) {
      await boot();
      if (!memberOf(clubId, userId)) return null;
      // un adhérent retiré du club est prévenu une dernière fois, puis n'écoute plus rien
      const f = rev => fn(memberOf(clubId, userId) ? rev : -1);
      if (!listeners.has(clubId)) listeners.set(clubId, new Set());
      listeners.get(clubId).add(f);
      return () => { const l = listeners.get(clubId); if (l) { l.delete(f); if (!l.size) listeners.delete(clubId); } };
    },
    /* le bureau donne un rôle d'accès : bureau, enseignant ou adhérent */
    setRole(userId, clubId, key, role) {
      return serial(async () => {
        await boot();
        const m = memberOf(clubId, userId);
        if (!m || m.role !== 'bureau') throw new Error('Réservé au bureau du club.');
        if (!ROLES.includes(role)) throw new Error('Rôle inconnu.');
        const t = members.find(x => x.club_id === clubId && x.key === key); if (!t) throw new Error('Adhérent introuvable.');
        if (t.role === 'bureau' && role !== 'bureau' && members.filter(x => x.club_id === clubId && x.role === 'bureau').length < 2) throw new Error('Le club doit garder au moins un membre du bureau.');
        t.role = role; await db.saveMember(t);
        const c = cache.get(clubId); emit(clubId, c ? c.rev : 0);
        return { key, role };
      });
    },
    /* refuser une demande ou retirer un adhérent (le bureau), ou quitter le club (soi-même) */
    remove(userId, clubId, key) {
      return serial(async () => {
        const c = await club(clubId); if (!c) throw new Error('Club introuvable');
        const m = memberOf(clubId, userId), t = members.find(x => x.club_id === clubId && x.key === key);
        if (!m || !t) throw new Error('Adhérent introuvable.');
        if (t !== m && m.role !== 'bureau') throw new Error('Réservé au bureau du club.');
        if (t.role === 'bureau' && members.filter(x => x.club_id === clubId && x.role === 'bureau').length < 2) throw new Error('Le club doit garder au moins un membre du bureau.');
        await db.deleteMember(clubId, t.user_id); members.splice(members.indexOf(t), 1);
        await write(clubId, c, [put(c, 'member', key, null), put(c, 'prefs', key, null)]);
        emit(clubId, c.rev);
        return { ok: true };
      });
    }
  };
}

module.exports = { createRamClub, applyPatch, selfOnly, checkOp, seasonOf, COLLS };
