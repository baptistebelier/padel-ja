/* =========================================================================
   RAM Club — score d'investissement calculé par le serveur
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
  const out = {};
  for (const k of Object.keys(mems)) {
    const s = stats[k] || {}, c = s.c || {};
    const v = { mem: mems[k], st: { k: Array.isArray(s.k) ? s.k : [] }, groups, comms, roles: roles || {} };
    let pts = 0;
    for (const [id, t] of Object.entries(TIERED)) pts += sumT(tierOf(t, +c[id] || 0));
    for (const [id, [r, ok]] of Object.entries(RARE)) if (ok(k, v) || v.st.k.includes('award:' + id)) pts += RPTS[r];
    out[k] = pts + Math.max(0, +c.ap || 0);
  }
  return out;
}

module.exports = { clubScores, TPTS, RPTS, TIERED, RARE };
