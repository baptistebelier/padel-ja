/* =========================================================================
   /RAM — référentiel des clubs, commun à /RAM JA et /RAM Club
   - Un club = une ligne (table clubs). Les comptes, fiches joueurs, tournois, participations
     et espaces /RAM Club y sont reliés par club_id.
   - Les noms saisis à la main (« Chiquita Padel », « CHIQUITA PADEL ») sont ramenés à une
     clé (« chiquitapadel ») ; chaque forme rencontrée est gardée comme alias du club.
   - Tout le référentiel est gardé en mémoire (quelques milliers de lignes au plus) :
     retrouver le club d'un texte ne coûte aucune requête.
   ========================================================================= */
'use strict';
const crypto = require('crypto');

/* clé d'un nom de club : sans accents, sans casse, sans espaces ni ponctuation */
const clubKey = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const cleanName = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 80);

function createClubs(store) {
  const byId = new Map(), byKey = new Map();        // id → club ; clé → id
  let ready = null;
  const load = () => (ready = ready || Promise.all([store.listClubs(), store.listClubAliases()]).then(([cl, al]) => {
    cl.forEach(c => byId.set(c.id, c));
    al.forEach(a => byKey.set(a.key, a.club_id));
    cl.forEach(c => { if (!byKey.has(c.name_key)) byKey.set(c.name_key, c.id); });
  }).catch(e => { ready = null; throw e; }));
  let queue = Promise.resolve();                     // créations une par une : jamais deux fois le même club
  const serial = fn => (queue = queue.then(fn, fn));

  const api = {
    clubKey,
    load,
    get: id => (id && byId.get(id)) || null,
    list: () => [...byId.values()],
    /* club d'un texte, sans rien créer (null si inconnu) */
    lookup(name) { const k = clubKey(name); return (k.length >= 2 && byId.get(byKey.get(k))) || null; },
    /* club d'un texte ; créé s'il n'existe pas encore (opts.by : compte à l'origine) */
    resolve(name, opts = {}) {
      const n = cleanName(name), k = clubKey(n);
      if (k.length < 2) return Promise.resolve(null);
      return load().then(() => api.lookup(n) || (opts.create === false ? null : serial(async () => {
        if (api.lookup(n)) return api.lookup(n);
        const now = Date.now();
        const c = { id: 'c' + crypto.randomBytes(8).toString('hex').slice(0, 12), name: n, name_key: k, short: null, city: null, sports: [], fft: null, logo: null,
          created_by: opts.by || null, created_at: now, updated_at: now };
        await store.saveClub(c);
        await store.saveClubAlias(k, c.id);
        byId.set(c.id, c); byKey.set(k, c.id);
        return c;
      })));
    },
    /* identifiant du club d'un texte (ou null) */
    async idOf(name, opts) { const c = await api.resolve(name, opts); return c ? c.id : null; },
    name: id => { const c = api.get(id); return c ? c.name : ''; },
    /* fusionner un club en double (from) dans le bon (to) : comptes, fiches, tournois, participations et
       noms connus passent au bon club ; sa fiche est complétée de ce qui lui manquait ; l'ancien est supprimé */
    merge(from, to) {
      return serial(async () => {
        await load();
        const a = byId.get(from), b = byId.get(to);
        if (!a || !b || from === to) throw new Error('Choisissez deux clubs différents du référentiel.');
        await store.mergeClubRefs(from, to);
        await store.saveClubAlias(a.name_key, to);
        const fill = {};
        for (const k of ['short', 'city', 'fft', 'logo', 'address', 'accent', 'tennis_courts', 'padel_courts'])
          if ((b[k] == null || b[k] === '') && a[k] != null && a[k] !== '') fill[k] = a[k];
        if ((!b.sports || !b.sports.length) && a.sports && a.sports.length) fill.sports = a.sports;
        if (Object.keys(fill).length) { const n = Object.assign({}, b, fill, { updated_at: Date.now() }); await store.saveClub(n); byId.set(to, n); }
        await store.deleteClub(from);
        byId.delete(from);
        for (const [k, id] of byKey) if (id === from) byKey.set(k, to);
        return byId.get(to);
      });
    },
    /* compléter la fiche d'un club (logo, adresse, terrains…) ; rien n'est écrit si rien ne change */
    async update(id, fields) {
      await load();
      const c = byId.get(id); if (!c) return null;
      const next = Object.assign({}, c, fields);
      if (Object.keys(fields).every(k => JSON.stringify(c[k] ?? null) === JSON.stringify(next[k] ?? null))) return c;
      next.updated_at = Date.now();
      await store.saveClub(next); byId.set(id, next);
      return next;
    }
  };
  return api;
}

/* les comptes et les tournois enregistrés reçoivent le club_id qui correspond à leur texte « club » :
   un compte crée le club s'il n'existe pas ; un tournoi en cours ne fait que le retrouver
   (le club d'un tournoi est créé à sa clôture, pour ne pas remplir la base de brouillons) */
function withClubLinks(store, clubs) {
  const saveUser = store.saveUser.bind(store), saveTournament = store.saveTournament.bind(store);
  store.saveUser = async u => {
    if (u && u.club !== undefined) u.club_id = String(u.club || '').trim() ? await clubs.idOf(u.club, { create: !u.guest, by: u.id }).catch(() => u.club_id || null) : null;
    return saveUser(u);
  };
  store.saveTournament = async t => {
    const tt = (t && t.state && t.state.tournament) || {};
    if (!tt.example) { const c = await clubs.resolve(tt.club, { create: false }).catch(() => undefined); if (c !== undefined) t.club_id = c ? c.id : null; }
    return saveTournament(t);
  };
  return store;
}

module.exports = { createClubs, withClubLinks, clubKey };
