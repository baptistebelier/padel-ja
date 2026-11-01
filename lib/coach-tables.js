/* =========================================================================
   /RAM Coach — lecture du planning d'un enseignant, tous clubs confondus
   - En ligne : dans les vraies tables (supabase-coach.sql), sans charger aucun club en mémoire ;
     la base ne renvoie que les cours de la période, quel que soit l'historique.
   - En local et dans les tests : dans les éléments des clubs (fichiers).
   Les deux donnent la même chose ; la comparaison (verify) tourne au démarrage du serveur et note son
   résultat dans server_settings (clé « coach-verif », sans aucune donnée personnelle).
   Ces tables sont la référence pour les élèves, les cours et les séances ; les groupes restent dans ram_items
   (le Club s'en sert aussi), un déclencheur les y recopie. La comparaison contrôle que le serveur et les tables disent la même chose.
   ========================================================================= */
'use strict';
const REGLES = require('../club/regles.js');

const MAX_DAYS = 400;
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

/* une séance de la période pour un groupe ou un cours ; g : forme de l'appli (once, day, from, to, skip, extra…) */
function occurrences(g, clubId, from, to, sessionOf) {
  const out = [];
  for (let d = from; d <= to; d = REGLES.addDays(d, 1)) {
    if (!REGLES.trainOn(g, d)) continue;
    const s = sessionOf(g.id + '.' + d) || {}, t = g.tarif || {};
    out.push({ club: clubId, groupe: g.id, cours: !!g.once, nom: g.name || '', date: d, heure: g.h || '', duree: g.dur || '', minutes: REGLES.durMin(g.dur), sport: g.sport || '',
      annule: (g.cancel || []).includes(d), eleves: [...(g.mem || []), ...(g.ext || [])], theme: s.theme || '', appel: s.pres || {}, bilan: s.recap || '', tarif: { mode: t.mode || 'seance', prix: +t.prix || 0 } });
  }
  return out;
}
const sorted = l => l.sort((a, b) => a.date.localeCompare(b.date) || String(a.heure).localeCompare(String(b.heure)) || String(a.club + a.groupe).localeCompare(b.club + b.groupe));

/* ---------- depuis les éléments d'un club (local, tests, comparaison) ---------- */
function itemsSource(ram) {
  return {
    kind: 'elements',
    async planning(clubs, from, to) {
      const out = [];
      for (const c of clubs) {
        const ses = new Map((await ram.itemsOf(c.id, 'seance')).map(x => [x.id, x.data]));
        const list = (await ram.itemsOf(c.id, 'group')).filter(x => x.data.type === 'train').concat(await ram.itemsOf(c.id, 'cours'));
        for (const { id, data } of list) {
          if (data.old || data.coach !== c.key) continue;
          out.push(...occurrences(Object.assign({}, data, { id }), c.id, from, to, k => ses.get(k)));
        }
      }
      return sorted(out);
    },
    /* achats des élèves d'un club : { clé: { achats: [...] } } */
    async eleves(clubId) {
      const out = {};
      (await ram.itemsOf(clubId, 'eleve')).forEach(x => { if ((x.data.achats || []).length) out[x.id] = { achats: x.data.achats }; });
      return out;
    }
  };
}

/* ---------- depuis les vraies tables (PostgREST, même clé secrète que le reste du serveur) ---------- */
function tablesSource(url, key) {
  const base = url.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '') + '/rest/v1/';
  const H = { apikey: key }; if (key.startsWith('eyJ')) H.Authorization = 'Bearer ' + key;
  async function all(table, query) {
    const out = [];
    for (let o = 0; ; o += 1000) {
      const r = await fetch(base + table + '?' + query, { headers: Object.assign({ Range: o + '-' + (o + 999) }, H) });
      if (!r.ok) throw new Error(`Supabase GET ${table} : ${r.status} ${await r.text()}`);
      const rows = await r.json(); out.push(...rows);
      if (rows.length < 1000) return out;
    }
  }
  const safe = s => /^[\w.-]+$/.test(String(s));   // identifiants générés par le serveur : rien d'autre n'entre dans une requête
  return {
    kind: 'tables',
    async planning(clubs, from, to) {
      clubs = clubs.filter(c => safe(c.id) && safe(c.key));
      if (!clubs.length) return [];
      const ids = clubs.map(c => c.id).join(',');
      const mine = clubs.map(c => `and(club_id.eq.${c.id},coach_key.eq.${c.key})`).join(',');
      // les groupes, plus seulement les cours de la période : l'historique ne pèse rien
      const groups = await all('coach_groups', `select=club_id,id,kind,name,sport,once_date,day,h,dur,from_date,to_date,every,skip_dates,extra_dates,cancelled_dates,off_periods,created_ms,archived,tarif_mode,tarif_prix&archived=eq.false&order=club_id.asc,id.asc&and=(or(${mine}),or(once_date.is.null,and(once_date.gte.${from},once_date.lte.${to})))`);
      if (!groups.length) return [];
      const inscrits = await all('coach_group_students', `select=club_id,group_id,student_key,has_account,position&club_id=in.(${ids})&order=club_id.asc,group_id.asc,position.asc`);
      const sessions = await all('coach_sessions', `select=club_id,id,theme,details&club_id=in.(${ids})&session_date=gte.${from}&session_date=lte.${to}&order=club_id.asc,id.asc`);
      const appels = await all('coach_attendance', `select=club_id,session_id,student_key,status&club_id=in.(${ids})&session_date=gte.${from}&session_date=lte.${to}&order=club_id.asc,session_id.asc,student_key.asc`);
      const k = (c, i) => c + '/' + i, ses = new Map(sessions.map(s => [k(s.club_id, s.id), { theme: s.theme, pres: {}, recap: (s.details || {}).recap }])), mem = new Map();
      appels.forEach(a => { const s = ses.get(k(a.club_id, a.session_id)); if (s) s.pres[a.student_key] = a.status; });
      inscrits.forEach(x => { const q = k(x.club_id, x.group_id); if (!mem.has(q)) mem.set(q, { mem: [], ext: [] }); mem.get(q)[x.has_account ? 'mem' : 'ext'].push(x.student_key); });
      const out = [];
      for (const r of groups) {
        const l = mem.get(k(r.club_id, r.id)) || { mem: [], ext: [] };
        const g = { id: r.id, name: r.name, sport: r.sport, day: r.day, h: r.h, dur: r.dur, mem: l.mem, ext: l.ext, skip: r.skip_dates, extra: r.extra_dates, cancel: r.cancelled_dates, off: r.off_periods || undefined };
        if (r.once_date) g.once = r.once_date;
        if (r.from_date) g.from = r.from_date;
        if (r.to_date) g.to = r.to_date;
        if (r.every) g.every = r.every;
        if (r.created_ms) g.at = r.created_ms;
        if (r.tarif_mode || r.tarif_prix != null) g.tarif = { mode: r.tarif_mode, prix: r.tarif_prix };
        out.push(...occurrences(g, r.club_id, from, to, q => ses.get(k(r.club_id, q))));
      }
      return sorted(out);
    },
    async eleves(clubId) {
      if (!safe(clubId)) return {};
      const out = {}, rows = await all('coach_purchases', `select=student_id,id,kind,product_ref,name,purchased_on,ends_on,sessions_count,price,note&club_id=eq.${clubId}&order=student_id.asc,position.asc`);
      rows.forEach(r => {
        const a = { id: r.id, t: r.kind, ref: r.product_ref, d: r.purchased_on, nom: r.name };
        if (r.price != null) a.prix = +r.price;
        if (r.sessions_count != null) a.n = r.sessions_count;
        if (r.ends_on) a.fin = r.ends_on;
        if (r.note) a.note = r.note;
        (out[r.student_id] = out[r.student_id] || { achats: [] }).achats.push(a);
      });
      return out;
    }
  };
}

function createCoachTables({ ram, store, tables }) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  // les tables suivent le stockage des clubs : clubs en fichiers (local, tests), lecture dans les fichiers
  const items = itemsSource(ram), source = url && key && (ram.kind === 'supabase' || tables) ? tablesSource(url, key) : items;
  /* clubs où ce compte enseigne (bureau ou enseignant), avec sa clé dans chacun */
  const teaching = async (userId, all) => (await ram.myClubs(userId)).filter(c => all || c.role === 'bureau' || c.role === 'coach').map(c => ({ id: c.id, key: c.key, name: c.name }));
  const check = (from, to, days = MAX_DAYS) => {
    if (!isDate(from) || !isDate(to) || to < from) throw new Error('Période invalide (AAAA-MM-JJ).');
    if (to > REGLES.addDays(from, days)) throw new Error(`Période de ${days} jours au plus.`);
  };
  /* séances de la période et chiffre d'affaires réel (achats) de chaque période demandée, club par club :
     l'historique remonte au plus ancien achat, pour décompter les packs (même règle que l'appli : regles.js) */
  async function tableauOf(clubs, du, au, periodes, offres) {
    const seances = [], chiffres = periodes.map(() => ({ encaisse: 0, aEncaisser: 0, prepaye: 0, nonCouvertes: 0, parMois: {} }));
    for (const c of clubs) {
      const eleves = periodes.length ? await source.eleves(c.id) : {}, first = Object.values(eleves).reduce((m, e) => e.achats.reduce((m2, a) => (a.d && a.d < m2 ? a.d : m2), m), du);
      const start = periodes.length ? REGLES.addDays(first, -14) : du, fin = periodes.reduce((m, p) => (p[1] > m ? p[1] : m), au), rows = await source.planning([c], start, fin);
      seances.push(...rows.filter(x => x.date >= du && x.date <= au));
      const faites = rows.filter(x => !x.annule && Object.keys(x.appel).length).map(x => ({ g: { dur: x.duree, sport: x.sport }, d: x.date, n: x.eleves.length, presents: Object.keys(x.appel).filter(k => x.appel[k] === 'P') }));
      periodes.forEach(([from, to], i) => {
        const r = REGLES.chiffre({ eleves, seances: faites, offres, from, to }), t = chiffres[i];
        ['encaisse', 'aEncaisser', 'prepaye', 'nonCouvertes'].forEach(k => { t[k] = Math.round((t[k] + r[k]) * 100) / 100; });
        Object.keys(r.parMois).forEach(m => { t.parMois[m] = (t.parMois[m] || 0) + r.parMois[m]; });
      });
    }
    return { seances: sorted(seances), chiffres };
  }
  return {
    kind: source.kind,
    /* séances d'un enseignant sur une période, tous ses clubs (ou un seul) */
    async planning(userId, from, to, clubId, all) {
      check(from, to);
      const clubs = (await teaching(userId, all)).filter(c => !clubId || c.id === clubId);
      return { du: from, au: to, source: source.kind, clubs: clubs.map(c => ({ id: c.id, nom: c.name })), seances: await source.planning(clubs, from, to) };
    },
    /* tableau de bord d'un enseignant : séances de [du, au] et chiffre d'affaires de chaque période */
    async tableau(userId, du, au, periodes, offres, clubId, all) {
      check(du, au);
      periodes.forEach(p => check(p[0], p[1]));
      const clubs = (await teaching(userId, all)).filter(c => !clubId || c.id === clubId);
      return Object.assign({ du, au, source: source.kind, clubs: clubs.map(c => ({ id: c.id, nom: c.name })) }, await tableauOf(clubs, du, au, periodes, offres));
    },
    /* la même chose pour des clubs déjà choisis (connecteur : [{ id, key, name }]) */
    tableauClubs(clubs, du, au, periodes, offres) { check(du, au); return tableauOf(clubs, du, au, periodes, offres); },
    /* comparaison tables / éléments pour chaque enseignant de chaque club ; résultat sans donnée personnelle */
    async verify(today, log) {
      if (source === items) return null;
      const from = REGLES.addDays(today, -365), to = REGLES.addDays(today, 30), diffs = [];
      let n = 0, seances = 0, achats = 0;
      await ram.eachSpace(async id => {
        const au = await ram.audience(id); if (!au) return;
        // les achats d'un club : comparés une seule fois, quel que soit le nombre d'enseignants
        const [ea, eb] = await Promise.all([items.eleves(id), source.eleves(id)]), norm = e => JSON.stringify(Object.keys(e).sort().map(q => [q, e[q].achats.map(h => [h.id, h.t, h.ref, h.d, h.nom, +h.prix || 0, h.n || 0, h.fin || '', h.note || ''])]));
        achats += Object.values(ea).reduce((m, e) => m + e.achats.length, 0);
        if (norm(ea) !== norm(eb)) diffs.push({ club: id, seance: 'achats', cote: 'contenu' });
        for (const k of Object.keys(au.role).filter(x => au.role[x] === 'bureau' || au.role[x] === 'coach')) {
          n++;
          const [a, b] = await Promise.all([items.planning([{ id, key: k }], from, to), source.planning([{ id, key: k }], from, to)]);
          seances += a.length;
          const A = new Map(a.map(x => [x.groupe + '.' + x.date, JSON.stringify(x)])), B = new Map(b.map(x => [x.groupe + '.' + x.date, JSON.stringify(x)]));
          for (const q of new Set([...A.keys(), ...B.keys()])) if (A.get(q) !== B.get(q) && diffs.length < 20) diffs.push({ club: id, seance: q, cote: !A.has(q) ? 'tables seules' : !B.has(q) ? 'elements seuls' : 'contenu' });
        }
      });
      const res = { at: Date.now(), enseignants: n, seances, achats, ecarts: diffs.length, diffs };
      if (store) await store.saveSetting('coach-verif', res);
      if (log) log(`Coach : comparaison tables / éléments : ${seances} séances, ${diffs.length} écart${diffs.length > 1 ? 's' : ''}`);
      return res;
    }
  };
}

module.exports = { createCoachTables, itemsSource, occurrences };
