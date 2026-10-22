/* =========================================================================
   /RAM JA — stockage
   - En local (PC du JA) : fichiers JSON dans data/
   - En ligne : Supabase (PostgreSQL), via son API REST, sans dépendance
     → activé dès que SUPABASE_URL et SUPABASE_SERVICE_KEY sont définies
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

/* ---------------------------------------------------------------------
   Stockage fichiers
   --------------------------------------------------------------------- */
function fileStore(dir) {
  const D = { users: path.join(dir, 'users'), tours: path.join(dir, 'tournois'), tpl: path.join(dir, 'modeles') };
  const FP = path.join(dir, 'joueurs.json'), FPA = path.join(dir, 'participations.json'), BK = path.join(dir, 'sauvegardes');
  Object.values(D).forEach(d => fs.mkdirSync(d, { recursive: true }));
  const safe = id => String(id).replace(/[^\w-]/g, '');
  const read = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
  const write = (f, o) => { fs.writeFileSync(f + '.tmp', JSON.stringify(o)); fs.renameSync(f + '.tmp', f); };
  const list = d => fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => read(path.join(d, f))).filter(Boolean);

  return {
    kind: 'fichiers',
    async getUserByEmail(email) { return list(D.users).find(u => u.email === email) || null; },
    async getUser(id) { return read(path.join(D.users, safe(id) + '.json')); },
    async saveUser(u) { write(path.join(D.users, safe(u.id) + '.json'), u); return u; },
    async deleteUser(id) { try { fs.unlinkSync(path.join(D.users, safe(id) + '.json')); } catch (e) {} },
    async listUsers() { return list(D.users); },

    async listTournaments(owner) {
      return list(D.tours).filter(t => t.owner === owner)
        .map(({ state, ...meta }) => Object.assign(meta, summary(state)))
        .sort((a, b) => b.updated_at - a.updated_at);
    },
    async getTournament(id) { return read(path.join(D.tours, safe(id) + '.json')); },
    async saveTournament(t) { write(path.join(D.tours, safe(t.id) + '.json'), t); return t; },
    async deleteTournament(id) { try { fs.unlinkSync(path.join(D.tours, safe(id) + '.json')); } catch (e) {} },
    async listAllTournaments() { return list(D.tours).map(({ state, ...meta }) => meta); },

    // sauvegardes : export complet de toutes les données, rangé dans data/sauvegardes
    async dumpAll() {
      return { users: list(D.users), tournaments: list(D.tours), templates: fs.readdirSync(D.tpl).filter(f => f.endsWith('.json')).map(f => ({ owner: f.slice(0, -5), data: read(path.join(D.tpl, f)) })),
        players: read(FP) || [], participations: read(FPA) || [] };
    },
    async putBackup(name, text) { fs.mkdirSync(BK, { recursive: true }); fs.writeFileSync(path.join(BK, safeName(name)), text); },
    async listBackups() { try { return fs.readdirSync(BK).filter(f => f.endsWith('.json')).map(f => ({ name: f, size: fs.statSync(path.join(BK, f)).size })).sort((a, b) => b.name.localeCompare(a.name)); } catch (e) { return []; } },
    async getBackup(name) { try { return fs.readFileSync(path.join(BK, safeName(name)), 'utf8'); } catch (e) { return null; } },
    async deleteBackup(name) { try { fs.unlinkSync(path.join(BK, safeName(name))); } catch (e) {} },

    async getAccount(owner) { return accountShape(read(path.join(D.tpl, safe(owner) + '.json'))); },
    async saveAccount(owner, acc) { write(path.join(D.tpl, safe(owner) + '.json'), acc); },

    // base de joueurs + participations
    async searchPlayers(q, limit) { const n = norm(q); return (read(FP) || []).filter(p => p.search.includes(n)).sort((a, b) => a.last.localeCompare(b.last)).slice(0, limit || 10); },
    async getPlayer(id) { return (read(FP) || []).find(p => p.id === id) || null; },
    async findPlayer(licence, nameKey) { const l = read(FP) || []; return (licence && l.find(p => p.licence === licence)) || l.find(p => p.name_key === nameKey) || null; },
    async savePlayer(p) { const l = (read(FP) || []).filter(x => x.id !== p.id); l.push(p); write(FP, l); return p; },
    async deletePlayer(id) { write(FP, (read(FP) || []).filter(x => x.id !== id)); write(FPA, (read(FPA) || []).filter(x => x.player_id !== id)); },
    async addParticipations(rows) { write(FPA, (read(FPA) || []).concat(rows)); },
    async deleteParticipationsForTournament(tid) { write(FPA, (read(FPA) || []).filter(x => x.tournament_id !== tid)); },
    async participationsOf(field, value) { return (read(FPA) || []).filter(x => x[field] === value); },
    async participationsOfPlayers(ids) { const set = new Set(ids); return (read(FPA) || []).filter(x => set.has(x.player_id)); },
    async getPlayers(ids) { const set = new Set(ids); return (read(FP) || []).filter(p => set.has(p.id)); },
    // RGPD : dates utiles pour supprimer les joueurs sans tournoi depuis 3 ans
    async playerActivity() {
      return { players: (read(FP) || []).map(p => ({ id: p.id, created_at: p.created_at, user_id: p.user_id || null })), parts: (read(FPA) || []).map(x => ({ player_id: x.player_id, closed_at: x.closed_at })) };
    }
  };
}

/* ---------------------------------------------------------------------
   Stockage Supabase (tables : users, tournaments, templates — cf. supabase.sql)
   --------------------------------------------------------------------- */
function supabaseStore(url, key) {
  // accepte « https://xxx.supabase.co » comme « https://xxx.supabase.co/rest/v1/ »
  const base = url.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '') + '/rest/v1/';
  // clé « service_role » (ancien format, JWT) ou « secret key » (nouveau format sb_secret_…)
  const H = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) H.Authorization = 'Bearer ' + key;
  async function q(method, table, query, body, extra) {
    const r = await fetch(base + table + (query ? '?' + query : ''), { method, headers: Object.assign({}, H, extra || {}), body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(`Supabase ${method} ${table} : ${r.status} ${await r.text()}`);
    const txt = await r.text();
    return txt ? JSON.parse(txt) : null;
  }
  const one = rows => (rows && rows[0]) || null;
  // Supabase Storage (fichiers) : même clé secrète que la base
  const sbase = base.replace(/\/rest\/v1\/$/, '/storage/v1/'), BUCKET = 'sauvegardes';
  async function storage(method, p, body, extra, raw) {
    const h = Object.assign({}, H, extra || {});
    const r = await fetch(sbase + p, { method, headers: h, body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
    if (!r.ok) throw new Error(`Supabase Storage ${method} ${p} : ${r.status} ${await r.text()}`);
    const txt = await r.text();
    return raw ? txt : (txt ? JSON.parse(txt) : null);
  }
  const upsert = (table, row) => q('POST', table, 'on_conflict=id', row, { Prefer: 'resolution=merge-duplicates,return=minimal' });
  const enc = encodeURIComponent;

  return {
    kind: 'supabase',
    async getUserByEmail(email) { return one(await q('GET', 'users', 'select=*&email=eq.' + enc(email))); },
    async getUser(id) { return one(await q('GET', 'users', 'select=*&id=eq.' + enc(id))); },
    async saveUser(u) { await upsert('users', u); return u; },
    async deleteUser(id) { await q('DELETE', 'users', 'id=eq.' + enc(id)); },
    async listUsers() { return q('GET', 'users', 'select=*'); },

    async listTournaments(owner) {
      const rows = await q('GET', 'tournaments', 'select=id,owner,key,pin,created_at,updated_at,summary&order=updated_at.desc&owner=eq.' + enc(owner));
      return rows.map(({ summary: s, ...meta }) => Object.assign(meta, s || {}));
    },
    async getTournament(id) { return one(await q('GET', 'tournaments', 'select=*&id=eq.' + enc(id))); },
    async saveTournament(t) { await upsert('tournaments', Object.assign({}, t, { summary: summary(t.state) })); return t; },
    async deleteTournament(id) { await q('DELETE', 'tournaments', 'id=eq.' + enc(id)); },
    async listAllTournaments() { return q('GET', 'tournaments', 'select=id,owner,created_at,updated_at,summary'); },

    // sauvegardes : export complet de toutes les tables, rangé dans un espace de stockage privé (bucket « sauvegardes »)
    async dumpAll() {
      const ORDER = { templates: 'owner', ram_members: 'club_id,user_id', ram_items: 'club_id,coll,id' };
      const all = async t => { const out = []; for (let o = 0; ; o += 1000) { const rows = await q('GET', t, 'select=*&order=' + (ORDER[t] || 'id').split(',').map(c => c + '.asc').join(','), null, { Range: o + '-' + (o + 999) }); out.push(...rows); if (rows.length < 1000) return out; } };
      const opt = t => all(t).catch(e => (/404|PGRST20|does not exist/.test(e.message) ? [] : Promise.reject(e)));
      // /RAM Club (clubs, adhérents, publications…) : dans la même sauvegarde
      return { users: await all('users'), tournaments: await all('tournaments'), templates: await all('templates'), players: await opt('players'), participations: await opt('participations'),
        ram_clubs: await opt('ram_clubs'), ram_members: await opt('ram_members'), ram_items: await opt('ram_items') };
    },
    async putBackup(name, text) {
      await storage('POST', 'bucket', { id: BUCKET, name: BUCKET, public: false }).catch(e => { if (!/409|already exists|Duplicate/i.test(e.message)) throw e; });
      await storage('POST', 'object/' + BUCKET + '/' + safeName(name), text, { 'Content-Type': 'application/json', 'x-upsert': 'true' });
    },
    async listBackups() {
      const rows = await storage('POST', 'object/list/' + BUCKET, { prefix: '', limit: 500, sortBy: { column: 'name', order: 'desc' } }).catch(() => []);
      return (rows || []).filter(o => /\.json$/.test(o.name)).map(o => ({ name: o.name, size: (o.metadata && o.metadata.size) || 0 }));
    },
    async getBackup(name) { return storage('GET', 'object/' + BUCKET + '/' + safeName(name), null, {}, true).catch(() => null); },
    async deleteBackup(name) { await storage('DELETE', 'object/' + BUCKET, { prefixes: [safeName(name)] }); },

    async getAccount(owner) { const r = one(await q('GET', 'templates', 'select=data&owner=eq.' + enc(owner))); return accountShape(r && r.data); },
    async saveAccount(owner, acc) { await q('POST', 'templates', 'on_conflict=owner', { owner, data: acc }, { Prefer: 'resolution=merge-duplicates,return=minimal' }); },

    // base de joueurs + participations (tables players, participations — cf. supabase-v2.sql)
    async searchPlayers(qs, limit) { return q('GET', 'players', 'select=*&order=last.asc&limit=' + (limit || 10) + '&search=ilike.' + enc('*' + norm(qs).replace(/[*,()]/g, '') + '*')); },
    async getPlayer(id) { return one(await q('GET', 'players', 'select=*&id=eq.' + enc(id))); },
    async findPlayer(licence, nameKey) {
      if (licence) { const p = one(await q('GET', 'players', 'select=*&licence=eq.' + enc(licence))); if (p) return p; }
      return one(await q('GET', 'players', 'select=*&name_key=eq.' + enc(nameKey)));
    },
    async savePlayer(p) { await upsert('players', p); return p; },
    async deletePlayer(id) { await q('DELETE', 'participations', 'player_id=eq.' + enc(id)); await q('DELETE', 'players', 'id=eq.' + enc(id)); },
    async addParticipations(rows) { if (rows.length) await q('POST', 'participations', '', rows, { Prefer: 'return=minimal' }); },
    async deleteParticipationsForTournament(tid) { await q('DELETE', 'participations', 'tournament_id=eq.' + enc(tid)); },
    async participationsOf(field, value) { return q('GET', 'participations', 'select=*&' + field + '=eq.' + enc(value)); },
    async participationsOfPlayers(ids) { return ids.length ? q('GET', 'participations', 'select=*&player_id=in.(' + ids.map(enc).join(',') + ')') : []; },
    async getPlayers(ids) { return ids.length ? q('GET', 'players', 'select=*&id=in.(' + ids.map(enc).join(',') + ')') : []; },
    // RGPD : dates utiles pour supprimer les joueurs sans tournoi depuis 3 ans
    async playerActivity() {
      const all = async (t, sel) => { const out = []; for (let o = 0; ; o += 1000) { const rows = await q('GET', t, 'select=' + sel + '&order=id.asc', null, { Range: o + '-' + (o + 999) }); out.push(...rows); if (rows.length < 1000) return out; } };
      return { players: await all('players', 'id,created_at,user_id'), parts: await all('participations', 'player_id,closed_at') };
    }
  };
}

/* nom de fichier de sauvegarde sûr (« padel-ja-2026-10-21.json ») */
function safeName(n) { return String(n).replace(/[^\w.-]/g, ''); }

/* texte normalisé pour la recherche (sans accents, minuscules) */
function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }

/* données du compte : modèles + réglages (club, terrains, logo, partenaires).
   Anciennes données = simple liste de modèles. */
function accountShape(d) {
  if (Array.isArray(d)) return { templates: d, profile: null, identity: null, billing: null };
  return { templates: (d && d.templates) || [], profile: (d && d.profile) || null, identity: (d && d.identity) || null, billing: (d && d.billing) || null };
}
function withAccountHelpers(st) {
  st.getTemplates = async owner => (await st.getAccount(owner)).templates;
  st.saveTemplates = async (owner, list) => { const a = await st.getAccount(owner); a.templates = list; await st.saveAccount(owner, a); };
  st.getProfile = async owner => (await st.getAccount(owner)).profile;
  // prénom / nom séparés : rangés avec les données du compte (pas de colonne dédiée dans la table users)
  st.getIdentity = async owner => (await st.getAccount(owner)).identity;
  st.saveIdentity = async (owner, identity) => { const a = await st.getAccount(owner); a.identity = identity; await st.saveAccount(owner, a); };
  // abonnement : date de fin d'accès payée ({ until, source, at })
  st.getBilling = async owner => (await st.getAccount(owner)).billing;
  st.saveBilling = async (owner, billing) => { const a = await st.getAccount(owner); a.billing = billing; await st.saveAccount(owner, a); };
  st.saveProfile = async (owner, profile) => { const a = await st.getAccount(owner); a.profile = profile; await st.saveAccount(owner, a); };
  return st;
}

/* résumé affiché dans le tableau de bord */
function summary(state) {
  if (!state) return {};
  const t = state.tournament || {};
  const done = (state.matches || []).filter(m => m.status === 'done').length;
  return { name: t.name, example: !!t.example, category: t.category, gender: t.gender, dateStart: t.dateStart, dateEnd: t.dateEnd, startTime: t.startTime, club: t.club, maxPairs: t.maxPairs,
    pairs: (state.pairs || []).filter(p => !p.withdrawn).length, matches: (state.matches || []).length, done,
    drawn: !!(state.draw && state.draw.built), closed: !!t.closed, closedAt: t.closedAt || null };
}

function createStore(dataDir) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (url && key) return withAccountHelpers(supabaseStore(url, key));
  return withAccountHelpers(fileStore(dataDir));
}

module.exports = { createStore, summary, norm };
