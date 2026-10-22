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
};
/* trophées rares : identifiant → [rareté, condition calculée sur les données du club] */
const RARE = {
  hello: [0, () => true],
  profil: [0, (k, v) => v.st.k.includes('profil')],
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
};

/* compteurs recalculés par le serveur à partir de ce qu'il stocke : les compteurs envoyés par
   les appareils (stats.c) ne servent plus au score, on ne peut donc pas les gonfler à la main.
   Chaque action n'existe qu'une fois dans les données (un like = une clé dans « likers »,
   un message = un élément « msg »…) : la retirer fait baisser le compteur. */
function deriveCounts(items) {
  const C = {}, at = k => C[k] || (C[k] = {}), inc = (k, stat, n = 1) => { if (k) { const c = at(k); c[stat] = (c[stat] || 0) + n; } };
  const days = {};   // clé → [[date, 'ok' | 'no'], …] pour la série de cours confirmés
  items.forEach(it => {
    if (it.del || !it.data) return;
    const d = it.data;
    switch (it.coll) {
      case 'post':
        (Array.isArray(d.likers) ? d.likers : []).forEach(k => inc(k, 'like'));
        Object.entries(d.myBy || {}).forEach(([k, v]) => {
          if (Array.isArray(d.opts)) { if (v !== null && v !== '') inc(k, 'poll'); return; }
          if (v !== 'yes') return;
          inc(k, d.kind === 'comm' ? 'comm-int' : d.stage ? 'stage' : 'evt');
        });
        (Array.isArray(d.vol) ? d.vol : []).forEach(k => inc(k, 'volu'));
        if (d.play && Array.isArray(d.play.in)) d.play.in.forEach(k => inc(k, 'play'));
        break;
      case 'msg': {
        const ref = String(d.ref || '');
        inc(d.by, ref.startsWith('c:') ? 'msg' : ref.startsWith('r:') ? 'live' : ref.startsWith('p:') ? 'com' : 'autre');
        Object.keys(d.reBy || {}).forEach(k => inc(k, 'react'));
        break;
      }
      case 'rec': Object.entries(d.conv || {}).forEach(([k, v]) => { if (v === 'ok') inc(k, 'team'); }); break;
      case 'group':
        Object.entries(d.resp || {}).forEach(([day, r]) => Object.entries(r || {}).forEach(([k, v]) => {
          if (v === 'ok') inc(k, 'train');
          if (v === 'ok' || v === 'no') (days[k] = days[k] || []).push([day, v]);
        }));
        break;
      case 'member':
        inc(it.id, 'palm', (Array.isArray(d.res) ? d.res.length : 0) + (Array.isArray(d.pres) ? d.pres.length : 0));
        inc(it.id, 'rank', +d._rk || 0);
        break;
      case 'prefs': {
        const f = Array.isArray(d.follow) ? new Set(d.follow.filter(k => k !== it.id)) : new Set();
        inc(it.id, 'follow', [...f].filter(k => { const m = items.get('member/' + k); return m && !m.del; }).length);
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
const ACTIONS = ['like', 'com', 'msg', 'react', 'evt', 'stage', 'volu', 'poll', 'team', 'play', 'train', 'live', 'palm', 'rank', 'follow', 'comm-int'];

const tierOf = (t, n) => t.filter(x => n >= x).length;
const sumT = n => TPTS.slice(0, n).reduce((a, b) => a + b, 0);

/* items : Map « coll/id » → { coll, id, data, del } ; roles : { clé → 'bureau' | 'coach' | 'mem' }
   renvoie { clé → score } pour chaque adhérent */
function clubScores(items, roles) {
  const groups = [], comms = [], mems = {}, stats = {};
  items.forEach(it => {
    if (it.del || !it.data) return;
    if (it.coll === 'group') groups.push(it.data);
    else if (it.coll === 'comm') comms.push(it.data);
    else if (it.coll === 'member') mems[it.id] = it.data;
    else if (it.coll === 'stats') stats[it.id] = it.data;
  });
  const counts = deriveCounts(items), out = {};
  for (const k of Object.keys(mems)) {
    const s = stats[k] || {}, c = counts[k] || {};
    const v = { mem: mems[k], st: { k: Array.isArray(s.k) ? s.k : [] }, groups, comms, roles: roles || {} };
    let pts = 0;
    for (const [id, t] of Object.entries(TIERED)) {
      // palier décerné par le club (« award:fidele:2 ») : il compte même si l'activité est plus basse
      const given = v.st.k.reduce((m, x) => { const p = String(x).split(':'); return p[0] === 'award' && p[1] === id && p[2] != null ? Math.max(m, +p[2] + 1) : m; }, 0);
      pts += sumT(Math.max(tierOf(t, +c[id] || 0), Math.min(4, given)));
    }
    for (const [id, [r, ok]] of Object.entries(RARE)) if (ok(k, v) || v.st.k.includes('award:' + id)) pts += RPTS[r];
    out[k] = pts + ACTIONS.reduce((a, x) => a + (c[x] || 0), 0);
  }
  return out;
}

module.exports = { clubScores, deriveCounts, TPTS, RPTS, TIERED, RARE };
