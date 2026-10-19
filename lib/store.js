/* =========================================================================
   PADEL JA — stockage
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

    async getAccount(owner) { return accountShape(read(path.join(D.tpl, safe(owner) + '.json'))); },
    async saveAccount(owner, acc) { write(path.join(D.tpl, safe(owner) + '.json'), acc); }
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

    async getAccount(owner) { const r = one(await q('GET', 'templates', 'select=data&owner=eq.' + enc(owner))); return accountShape(r && r.data); },
    async saveAccount(owner, acc) { await q('POST', 'templates', 'on_conflict=owner', { owner, data: acc }, { Prefer: 'resolution=merge-duplicates,return=minimal' }); }
  };
}

/* données du compte : modèles + réglages (club, terrains, logo, partenaires).
   Anciennes données = simple liste de modèles. */
function accountShape(d) {
  if (Array.isArray(d)) return { templates: d, profile: null };
  return { templates: (d && d.templates) || [], profile: (d && d.profile) || null };
}
function withAccountHelpers(st) {
  st.getTemplates = async owner => (await st.getAccount(owner)).templates;
  st.saveTemplates = async (owner, list) => { const a = await st.getAccount(owner); a.templates = list; await st.saveAccount(owner, a); };
  st.getProfile = async owner => (await st.getAccount(owner)).profile;
  st.saveProfile = async (owner, profile) => { const a = await st.getAccount(owner); a.profile = profile; await st.saveAccount(owner, a); };
  return st;
}

/* résumé affiché dans le tableau de bord */
function summary(state) {
  if (!state) return {};
  const t = state.tournament || {};
  const done = (state.matches || []).filter(m => m.status === 'done').length;
  return { name: t.name, category: t.category, gender: t.gender, dateStart: t.dateStart, club: t.club,
    pairs: (state.pairs || []).filter(p => !p.withdrawn).length, matches: (state.matches || []).length, done,
    drawn: !!(state.draw && state.draw.built) };
}

function createStore(dataDir) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (url && key) return withAccountHelpers(supabaseStore(url, key));
  return withAccountHelpers(fileStore(dataDir));
}

module.exports = { createStore, summary };
