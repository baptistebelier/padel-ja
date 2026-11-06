/* =========================================================================
   /RAM Club — score d'investissement calculé par le serveur
   Une seule source de vérité : le serveur calcule le score de chaque adhérent à
   partir des données du club qu'il stocke (compteurs, trophées décernés, profil,
   groupes, commissions, rôles) et l'envoie à tous les appareils. Ainsi tout le
   monde voit le même nombre de points, quel que soit le compte qui regarde.
   Les paliers et les valeurs doivent rester identiques à club/trophees.js
   (un test le vérifie).
   ========================================================================= */
'use strict';

const TPTS = [10, 25, 60, 150];   // points par palier (bronze, argent, or, platine)
const RPTS = [20, 60, 150, 300];  // points des trophées rares selon leur rareté
/* trophées à paliers : identifiant → seuils */
const TIERED = {
  like: [10, 100, 400, 1000], com: [5, 50, 200, 500], msg: [20, 250, 1000, 3000], react: [10, 100, 400, 1000],
  evt: [1, 5, 15, 30], volu: [1, 3, 8, 15], stage: [1, 3, 6, 10], train: [5, 25, 60, 120], streak: [4, 10, 20, 40],
  team: [1, 5, 15, 40], live: [5, 50, 200, 500], palm: [1, 10, 30, 75], rank: [1, 3, 6, 10], poll: [1, 10, 25, 50],
  follow: [3, 15, 40, 100], fidele: [1, 3, 5, 10],
  // jeu réel : séances /RAM Coach pointées « présent », rencontres par équipe jouées, tournois /RAM JA terminés
  pres: [5, 20, 50, 100], match: [1, 5, 15, 30], tourn: [1, 3, 8, 15],
};
/* trophées rares : identifiant → [rareté, condition calculée sur les données du club] */
const RARE = {
  hello: [0, () => true],
  profil: [0, (k, v) => profilComplet(v.mem, v.prefs)],
  photo: [0, (k, v) => !!v.mem.photo],
  famille: [1, (k, v) => (v.mem.kids || []).length > 0],
  finale: [1, (k, v) => (v.mem.res || []).some(r => r && r.fin) || (v.mem.pres || []).some(r => r && (r.place === '1er' || r.place === '2e'))],
  titre: [2, (k, v) => (v.mem.res || []).some(r => r && r.fin && r.w) || (v.mem.pres || []).some(r => r && r.place === '1er')],
  comm: [2, (k, v) => v.comms.some(c => (c.mem || []).includes(k))],
  cap: [2, (k, v) => v.groups.some(g => g.cap === k)],
  coach: [2, (k, v) => v.groups.some(g => g.coach === k)],
  champion: [3, () => false],
  invaincu: [3, () => false],
  bureau: [3, (k, v) => v.roles[k] === 'bureau'],
  roi: [2, (k, v) => v.kings.has(k)],
};
/* plafond quotidien par type d'action : au-delà, l'action reste visible mais ne compte plus
   (ni pour le trophée ni pour les points) jusqu'au lendemain. Seules les actions datées sont plafonnées
   au jour près ; les actions sans date partagent un seul plafond. */
const CAPS = { msg: 20, com: 10, live: 30, react: 30, like: 30, poll: 10 };

/* jour (AAAA-MM-JJ, heure de Paris) d'un instant en millisecondes */
const PARIS = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
const DAY = /^\d{4}-\d{2}-\d{2}/;
const dayOf = at => (+at > 0 ? PARIS.format(new Date(+at)) : '');
const dateOf = d => (d && DAY.test(String(d)) ? String(d).slice(0, 10) : '');
/* saison « 2026-2027 » → du 1er septembre 2026 au 31 août 2027 */
function seasonRange(season) {
  const y = parseInt(season, 10);
  return y ? { from: y + '-09-01', to: (y + 1) + '-08-31' } : null;
}

/* « Carte d'identité » : vérifiée par le serveur sur le vrai profil (nom, sexe, date de naissance)
   et un moyen de contact (téléphone ou e-mail) enregistré dans les réglages de l'adhérent.
   Ce que le téléphone déclare (« profil » dans stats.k) ne compte plus. */
function profilComplet(mem, prefs) {
  if (!mem) return false;
  const ct = (prefs && prefs.ct) || {}, val = x => String((Array.isArray(x) ? x[2] : x) || '').trim();
  return String(mem.n || '').trim().length >= 3 && ['H', 'F'].includes(mem.g) && !!dateOf(mem.bd) && !!(val(ct.tel) || val(ct.mail));
}

/* vainqueurs d'une animation montée-descente /RAM JA terminée (trophée « Roi du terrain ») */
const isKingPost = d => d && d.kind === 'jatour' && d.ja && d.ja.ani && d.ja.status === 'done' && /^Mont/.test(String(d.ja.fmt || ''));

/* publications par niveaux (enseignants) : pour chaque date, la première fourchette complète est validée ;
   renvoie les inscrits validés (même calcul que l'appli, club/ui/10-niveaux.js) */
/* validés d'une date : la première fourchette à atteindre son minimum (places), jusqu'à son maximum (max, sinon places) */
function nvValidatedOn(nv, d) {
  let win = [], best = Infinity;
  for (const t of (nv && nv.tiers) || []) {
    const l = (nv.ins && Array.isArray(nv.ins[d + '|' + t.id]) ? nv.ins[d + '|' + t.id] : [])
      .map((k, i) => [k, (nv.at && nv.at[k] && nv.at[k][d]) || 1e15 + i]).sort((a, b) => a[1] - b[1]);
    const n = +t.places || 0;
    if (n > 0 && l.length >= n && l[n - 1][1] < best) { best = l[n - 1][1]; win = l.slice(0, Math.max(n, +t.max || 0)).map(x => x[0]); }
  }
  return win;
}
function nvValidated(nv) {
  if (!nv || !Array.isArray(nv.tiers) || !Array.isArray(nv.dates)) return [];
  return nv.dates.flatMap(d => nvValidatedOn(nv, d));
}

/* compteurs recalculés par le serveur à partir de ce qu'il stocke : les compteurs envoyés par
   les appareils (stats.c) ne servent plus au score, on ne peut donc pas les gonfler à la main.
   Chaque action n'existe qu'une fois dans les données (un like = une clé dans « likers »,
   un message = un élément « msg »…) : la retirer fait baisser le compteur. */
function deriveCounts(items, opts = {}) {
  const range = opts.range || null, caps = opts.caps || CAPS, today = opts.today || dayOf(Date.now());
  const C = {}, at = k => C[k] || (C[k] = {}), used = new Map();
  /* une action compte pour sa date : hors de la saison demandée (range), elle ne compte pas, et sans date
     elle ne compte que dans le total à vie ; au-delà du plafond du jour (caps), elle ne compte plus */
  const inc = (k, stat, day, n = 1) => {
    if (!k) return;
    if (range && (!day || day < range.from || day > range.to)) return;
    if (caps[stat] && n > 0) {
      const u = k + '|' + stat + '|' + (day || '-'), done = used.get(u) || 0;
      n = Math.min(n, caps[stat] - done);
      if (n <= 0) return;
      used.set(u, done + n);
    }
    const c = at(k); c[stat] = (c[stat] || 0) + n;
  };
  const inRange = day => !range || (day >= range.from && day <= range.to);
  const days = {};   // clé → [[date, 'ok' | 'no'], …] pour la série de cours confirmés
  items.forEach(it => {
    if (it.del || !it.data) return;
    const d = it.data;
    switch (it.coll) {
      case 'post': {
        // une action sur une publication prend la date de son événement, sinon celle de la publication
        const pd = dateOf(d.d) || dayOf(d.at);
        (Array.isArray(d.likers) ? d.likers : []).forEach(k => inc(k, 'like', pd));
        Object.entries(d.myBy || {}).forEach(([k, v]) => {
          if (Array.isArray(d.opts)) { if (v !== null && v !== '') inc(k, 'poll', pd); return; }
          if (v !== 'yes') return;
          inc(k, d.kind === 'comm' ? 'comm-int' : d.stage ? 'stage' : 'evt', pd);
        });
        (Array.isArray(d.vol) ? d.vol : []).forEach(k => inc(k, 'volu', pd));
        if (d.play && Array.isArray(d.play.in)) d.play.in.forEach(k => inc(k, 'play', pd));
        // partie par niveaux validée : une partie jouée ; séance collective validée : un cours
        if (d.kind === 'niveaux' && d.nv && Array.isArray(d.nv.tiers) && Array.isArray(d.nv.dates))
          d.nv.dates.forEach(nd => nvValidatedOn(d.nv, nd).forEach(k => inc(k, d.nv.mode === 'cours' ? 'train' : 'play', dateOf(nd) || pd)));
        // tournoi /RAM JA terminé : une ligne de palmarès et un tournoi terminé pour chaque adhérent qui l'a joué
        if (d.kind === 'jatour' && d.ja && d.ja.status === 'done' && Array.isArray(d.ja.list))
          new Set(d.ja.list.flatMap(x => [x.k1, x.k2]).filter(Boolean)).forEach(k => { inc(k, 'palm', pd); inc(k, 'tourn', pd); });
        break;
      }
      case 'msg': {
        const ref = String(d.ref || ''), md = dayOf(d.at);
        inc(d.by, ref.startsWith('c:') ? 'msg' : ref.startsWith('r:') ? 'live' : ref.startsWith('p:') ? 'com' : 'autre', md);
        Object.keys(d.reBy || {}).forEach(k => inc(k, 'react', md));
        break;
      }
      case 'rec': {
        const rd = dateOf(d.d);
        Object.entries(d.conv || {}).forEach(([k, v]) => { if (v === 'ok') inc(k, 'team', rd); });
        // rencontre par équipe terminée : jouée par les joueurs de ses matchs terminés et par ses titulaires
        if (d.st === 'done' && rd && rd <= today) {
          const pl = new Set();
          (Array.isArray(d.ms) ? d.ms : []).forEach(m => { if (m && typeof m.a === 'string' && m.st === 'done') pl.add(m.a); });
          Object.entries(d.lineup || {}).forEach(([k, v]) => { if (v === 'T') pl.add(k); });
          pl.forEach(k => inc(k, 'match', rd));
        }
        break;
      }
      case 'seance': {
        // séance /RAM Coach passée : l'enseignant a fait l'appel et pointé l'adhérent présent
        const sd = dateOf(d.d);
        if (sd && sd <= today) Object.entries(d.pres || {}).forEach(([k, v]) => { if (v === 'P') inc(k, 'pres', sd); });
        break;
      }
      case 'group': case 'cours':
        Object.entries(d.resp || {}).forEach(([day, r]) => Object.entries(r || {}).forEach(([k, v]) => {
          if (v === 'ok') inc(k, 'train', dateOf(day));
          if ((v === 'ok' || v === 'no') && inRange(dateOf(day))) (days[k] = days[k] || []).push([day, v]);
        }));
        break;
      case 'member':
        inc(it.id, 'palm', '', (Array.isArray(d.res) ? d.res.length : 0) + (Array.isArray(d.pres) ? d.pres.length : 0));
        inc(it.id, 'rank', '', +d._rk || 0);
        break;
      case 'prefs': {
        const f = Array.isArray(d.follow) ? new Set(d.follow.filter(k => k !== it.id)) : new Set();
        inc(it.id, 'follow', '', [...f].filter(k => { const m = items.get('member/' + k); return m && !m.del; }).length);
        break;
      }
    }
  });
  // plus longue série de cours confirmés sans absence, dans l'ordre des dates
  for (const [k, l] of Object.entries(days)) {
    l.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
    let cur = 0, best = 0;
    for (const [, v] of l) { cur = v === 'ok' ? cur + 1 : 0; best = Math.max(best, cur); }
    at(k).streak = best;
  }
  return C;
}
/* un point par action, comme dans l'appli (les séries et les trophées décernés n'en donnent pas) */
const ACTIONS = ['like', 'com', 'msg', 'react', 'evt', 'stage', 'volu', 'poll', 'team', 'play', 'train', 'live', 'palm', 'rank', 'follow', 'comm-int', 'pres', 'match', 'tourn'];

const tierOf = (t, n) => t.filter(x => n >= x).length;
const sumT = n => TPTS.slice(0, n).reduce((a, b) => a + b, 0);

/* items : Map « coll/id » → { coll, id, data, del } ; roles : { clé → 'bureau' | 'coach' | 'mem' }
   renvoie pour chaque adhérent { counts, trophies: { id → palier (1 à 4) ou 1 pour un rare }, points } */
function memberProgress(items, roles, opts = {}) {
  const groups = [], comms = [], mems = {}, stats = {}, prefs = {}, kings = new Set();
  items.forEach(it => {
    if (it.del || !it.data) return;
    if (it.coll === 'post' && isKingPost(it.data)) (((it.data.ja.results || [])[0] || {}).k || []).forEach(k => kings.add(k));
    if (it.coll === 'group' || it.coll === 'cours') groups.push(it.data);
    else if (it.coll === 'comm') comms.push(it.data);
    else if (it.coll === 'member') mems[it.id] = it.data;
    else if (it.coll === 'stats') stats[it.id] = it.data;
    else if (it.coll === 'prefs') prefs[it.id] = it.data;
  });
  const counts = opts.counts || deriveCounts(items), out = {};
  for (const k of Object.keys(mems)) {
    const s = stats[k] || {}, c = counts[k] || {};
    const v = { mem: mems[k], prefs: prefs[k], st: { k: Array.isArray(s.k) ? s.k : [] }, groups, comms, roles: roles || {}, kings };
    let pts = 0;
    const trophies = {};
    for (const [id, t] of Object.entries(TIERED)) {
      // palier décerné par le club (« award:fidele:2 ») : il compte même si l'activité est plus basse
      const given = v.st.k.reduce((m, x) => { const p = String(x).split(':'); return p[0] === 'award' && p[1] === id && p[2] != null ? Math.max(m, +p[2] + 1) : m; }, 0);
      const n = Math.max(tierOf(t, +c[id] || 0), Math.min(4, given));
      if (n) trophies[id] = n;
      pts += sumT(n);
    }
    for (const [id, [r, ok]] of Object.entries(RARE)) if (ok(k, v) || v.st.k.includes('award:' + id)) { trophies[id] = 1; pts += RPTS[r]; }
    out[k] = { counts: c, trophies, points: pts + ACTIONS.reduce((a, x) => a + (c[x] || 0), 0) };
  }
  return out;
}
/* score d'investissement de chaque adhérent, depuis toujours : { clé → points } */
function clubScores(items, roles, counts) {
  const p = memberProgress(items, roles, { counts }), out = {};
  for (const k of Object.keys(p)) out[k] = p[k].points;
  return out;
}
/* points de la saison (« 2026-2027 ») : seules comptent les actions datées de la saison, plafonnées par jour,
   et les paliers que cette activité atteint. Les trophées rares et ceux décernés par le club restent acquis
   pour toujours (total à vie) mais n'entrent pas dans le classement de la saison, qui repart à zéro. */
function seasonScores(items, season, opts = {}) {
  const range = seasonRange(season), out = {};
  if (!range) return out;
  const counts = deriveCounts(items, { range, today: opts.today });
  items.forEach(it => {
    if (it.coll !== 'member' || it.del || !it.data) return;
    const c = counts[it.id] || {};
    let pts = ACTIONS.reduce((a, x) => a + (c[x] || 0), 0);
    for (const [id, t] of Object.entries(TIERED)) pts += sumT(tierOf(t, +c[id] || 0));
    out[it.id] = pts;
  });
  return out;
}
/* classements du club, « Cette saison » et « Depuis toujours » : les adhérents qui ont choisi de ne pas
   y apparaître (« noRank » dans leur profil) en sont retirés ; ils gardent leurs trophées et leur score */
function clubBoards(items, scores, season, opts = {}) {
  const hidden = new Set();
  items.forEach(it => { if (it.coll === 'member' && !it.del && it.data && it.data.noRank === true) hidden.add(it.id); });
  const keep = o => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !hidden.has(k)));
  return { season: season || '', saison: keep(seasonScores(items, season, opts)), toujours: keep(scores) };
}

/* points bar : la fidélité du bar (boisson, verre offert…), distincte du score d'investissement.
   Gagnés seulement en consommant au bar avec l'appli : une réservation que le bureau a marquée « servie »
   rapporte un point par euro (arrondi à l'euro inférieur), sur le prix repris de la carte par le serveur.
   Dépensés en bons d'échange (« redeem ») ; un bon annulé rend ses points.
   Réglages du club (bureau) : points par euro (1 à 10) et remise à zéro à chaque saison
   (seules comptent alors les commandes et les bons depuis le 1er septembre). */
const BAR_RULES = { perEuro: 1 };
function barRules(items) {
  const conf = ((items.get('conf/main') || {}).data) || {}, info = conf.info || {};
  const rate = Math.min(10, Math.max(1, parseInt(info.barRate, 10) || 1)), y = parseInt(conf.season, 10);
  return info.barReset === true && y ? { perEuro: rate, from: y + '-09-01', season: conf.season } : { perEuro: rate };
}
const euros = p => { const m = String(p || '').replace(',', '.').match(/\d+(\.\d+)?/); return m ? +m[0] : 0; };
function walletOf(items, key, rules = BAR_RULES) {
  let earned = 0, spent = 0;
  const from = rules.from || '', dayOf = at => (+at ? new Date(+at).toISOString().slice(0, 10) : '');
  items.forEach(it => {
    if (it.del || !it.data || it.data.by !== key) return;
    const d = it.data;
    if (it.coll === 'order' && d.st === 'servi' && (!from || String(d.date || '') >= from)) earned += Math.floor(euros(d.price) * (+d.qty || 1) * (rules.perEuro || 1));
    if (it.coll === 'redeem' && d.st !== 'annule' && (!from || !d.at || dayOf(d.at) >= from)) spent += +d.pts || 0;
  });
  return { earned, spent, balance: earned - spent };
}

module.exports = { clubScores, seasonScores, clubBoards, seasonRange, profilComplet, CAPS, ACTIONS, memberProgress, deriveCounts, nvValidated, nvValidatedOn, BAR_RULES, barRules, walletOf, TPTS, RPTS, TIERED, RARE };
