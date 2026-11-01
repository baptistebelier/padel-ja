/* =========================================================================
   /RAM Coach — lecture du planning d'un enseignant, tous clubs confondus
   - En ligne : dans les vraies tables (supabase-coach.sql), sans charger aucun club en mémoire ;
     la base ne renvoie que les cours de la période, quel que soit l'historique.
   - En local et dans les tests : dans les éléments des clubs (fichiers).
   Les deux donnent la même chose ; la comparaison (verify) tourne au démarrage du serveur et note son
   résultat dans server_settings (clé « coach-verif », sans aucune donnée personnelle).
   Pendant la transition, ram_items reste la référence : un déclencheur recopie chaque écriture dans les tables.
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
    const s = sessionOf(g.id + '.' + d) || {};
    out.push({ club: clubId, groupe: g.id, cours: !!g.once, nom: g.name || '', date: d, heure: g.h || '', duree: g.dur || '', minutes: REGLES.durMin(g.dur), sport: g.sport || '',
      annule: (g.cancel || []).includes(d), eleves: [...(g.mem || []), ...(g.ext || [])], theme: s.theme || '', appel: s.pres || {} });
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
      const groups = await all('coach_groups', `select=club_id,id,kind,name,sport,once_date,day,h,dur,from_date,to_date,every,skip_dates,extra_dates,cancelled_dates,off_periods,created_ms,archived&archived=eq.false&order=club_id.asc,id.asc&and=(or(${mine}),or(once_date.is.null,and(once_date.gte.${from},once_date.lte.${to})))`);
      if (!groups.length) return [];
      const inscrits = await all('coach_group_students', `select=club_id,group_id,student_key,has_account,position&club_id=in.(${ids})&order=club_id.asc,group_id.asc,position.asc`);
      const sessions = await all('coach_sessions', `select=club_id,id,theme&club_id=in.(${ids})&session_date=gte.${from}&session_date=lte.${to}&order=club_id.asc,id.asc`);
      const appels = await all('coach_attendance', `select=club_id,session_id,student_key,status&club_id=in.(${ids})&session_date=gte.${from}&session_date=lte.${to}&order=club_id.asc,session_id.asc,student_key.asc`);
      const k = (c, i) => c + '/' + i, ses = new Map(sessions.map(s => [k(s.club_id, s.id), { theme: s.theme, pres: {} }])), mem = new Map();
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
        out.push(...occurrences(g, r.club_id, from, to, q => ses.get(k(r.club_id, q))));
      }
      return sorted(out);
    }
  };
}

function createCoachTables({ ram, store }) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  const items = itemsSource(ram), source = url && key ? tablesSource(url, key) : items;
  /* clubs où ce compte enseigne (bureau ou enseignant), avec sa clé dans chacun */
  const teaching = async userId => (await ram.myClubs(userId)).filter(c => c.role === 'bureau' || c.role === 'coach').map(c => ({ id: c.id, key: c.key, name: c.name }));
  return {
    kind: source.kind,
    /* séances d'un enseignant sur une période, tous ses clubs (ou un seul) */
    async planning(userId, from, to, clubId) {
      if (!isDate(from) || !isDate(to) || to < from) throw new Error('Période invalide (AAAA-MM-JJ).');
      if (to > REGLES.addDays(from, MAX_DAYS)) throw new Error(`Période de ${MAX_DAYS} jours au plus.`);
      const clubs = (await teaching(userId)).filter(c => !clubId || c.id === clubId);
      return { du: from, au: to, source: source.kind, clubs: clubs.map(c => ({ id: c.id, nom: c.name })), seances: await source.planning(clubs, from, to) };
    },
    /* comparaison tables / éléments pour chaque enseignant de chaque club ; résultat sans donnée personnelle */
    async verify(today, log) {
      if (source === items) return null;
      const from = REGLES.addDays(today, -365), to = REGLES.addDays(today, 30), diffs = [];
      let n = 0, seances = 0;
      await ram.eachSpace(async id => {
        const au = await ram.audience(id); if (!au) return;
        for (const k of Object.keys(au.role).filter(x => au.role[x] === 'bureau' || au.role[x] === 'coach')) {
          n++;
          const [a, b] = await Promise.all([items.planning([{ id, key: k }], from, to), source.planning([{ id, key: k }], from, to)]);
          seances += a.length;
          const A = new Map(a.map(x => [x.groupe + '.' + x.date, JSON.stringify(x)])), B = new Map(b.map(x => [x.groupe + '.' + x.date, JSON.stringify(x)]));
          for (const q of new Set([...A.keys(), ...B.keys()])) if (A.get(q) !== B.get(q) && diffs.length < 20) diffs.push({ club: id, seance: q, cote: !A.has(q) ? 'tables seules' : !B.has(q) ? 'elements seuls' : 'contenu' });
        }
      });
      const res = { at: Date.now(), enseignants: n, seances, ecarts: diffs.length, diffs };
      if (store) await store.saveSetting('coach-verif', res);
      if (log) log(`Coach : comparaison tables / éléments : ${seances} séances, ${diffs.length} écart${diffs.length > 1 ? 's' : ''}`);
      return res;
    }
  };
}

module.exports = { createCoachTables, itemsSource, occurrences };
