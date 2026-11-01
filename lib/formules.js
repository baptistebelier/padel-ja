/* =========================================================================
   /RAM Coach — formules, packs et abonnements de l'enseignant
   Rangés sur son compte /RAM (pas dans un club), comme ses échelles de niveaux : les mêmes dans tous
   ses clubs. Ils s'affichent dans /RAM Coach, sur sa fiche enseignant de /RAM Club, et serviront à la
   prise de rendez-vous. Une formule : un nombre de joueurs, une durée, un prix (la séance, ou par
   personne). Un pack : plusieurs séances d'une formule, à un prix d'ensemble. Un abonnement : un prix
   par période, avec ou sans formule et nombre de séances par semaine.
   ========================================================================= */
'use strict';
const crypto = require('crypto');
const PERIODES = ['mois', 'trimestre', '6 mois', 'an'];
const txt = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const num = (v, lo, hi, def) => { const n = Math.round(parseFloat(String(v).replace(',', '.')) * 100) / 100; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
const id = (v, p) => (/^[a-z0-9_-]{1,24}$/i.test(String(v || '')) ? String(v) : p + crypto.randomBytes(4).toString('hex'));
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
const periodes = l => (Array.isArray(l) ? l : []).slice(0, 40).filter(o => o && /^\d{4}-\d{2}-\d{2}$/.test(o.du) && /^\d{4}-\d{2}-\d{2}$/.test(o.au) && o.du <= o.au).map(o => ({ nom: txt(o.nom, 60), du: o.du, au: o.au }));
/* ce que voit un adhérent sur la fiche de l'enseignant : ni ses vacances, ni ses réglages de paiement */
const publicOf = o => ({ formules: o.formules, packs: o.packs.map(({ ech, ...p }) => p), abos: o.abos.map(({ moyen, ...a }) => a), resa: (o.dispos || []).length > 0 });
/* formules reçues (de l'appli ou de Claude) : nettoyées ; un pack ou un abonnement sans formule existante perd son lien */
function clean(src) {
  const s = src || {};
  const formules = (Array.isArray(s.formules) ? s.formules : []).slice(0, 30).map(f => ({
    id: id(f.id, 'f'), nom: txt(f.nom, 60) || 'Formule', sport: f.sport === 'Tennis' ? 'Tennis' : 'Padel',
    joueurs: num(f.joueurs, 1, 12, 1), duree: num(f.duree, 15, 300, 60), prix: num(f.prix, 0, 100000, 0), par: f.par === 'personne' ? 'personne' : 'seance'
  }));
  const has = x => formules.some(f => f.id === x);
  const packs = (Array.isArray(s.packs) ? s.packs : []).slice(0, 60).filter(p => has(p.formule)).map(p => ({
    id: id(p.id, 'p'), formule: p.formule, nom: txt(p.nom, 60), seances: num(p.seances, 2, 200, 5), prix: num(p.prix, 0, 100000, 0),
    ...(Array.isArray(p.ech) && p.ech.length ? { ech: p.ech.slice(0, 12).map(n => num(n, 0, 200, 1)) } : {})
  }));
  const abos = (Array.isArray(s.abos) ? s.abos : []).slice(0, 30).map(a => ({
    id: id(a.id, 'a'), nom: txt(a.nom, 60) || 'Abonnement', formule: has(a.formule) ? a.formule : '', periode: PERIODES.includes(a.periode) ? a.periode : 'mois',
    duree: num(a.duree, 1, 36, 1), prix: num(a.prix, 0, 100000, 0), parSemaine: num(a.parSemaine, 0, 14, 0),
    ...(txt(a.ens, 60) ? { ens: txt(a.ens, 60) } : {}), ...(txt(a.moyen, 60) ? { moyen: txt(a.moyen, 60) } : {})
  }));
  const out = { formules, packs, abos }, conges = periodes(s.conges), vac = {};
  Object.keys(s.vacClubs || {}).slice(0, 20).forEach(k => { const l = periodes(s.vacClubs[k]); if (l.length && /^[\w.-]+$/.test(k)) vac[k] = l; });
  const dispos = (Array.isArray(s.dispos) ? s.dispos : []).slice(0, 60).filter(x => x && Number.isInteger(+x.jour) && +x.jour >= 0 && +x.jour <= 6 && HEURE.test(x.du) && HEURE.test(x.au) && x.du < x.au).map(x => ({ jour: +x.jour, du: x.du, au: x.au, ...(txt(x.lieu, 60) ? { lieu: txt(x.lieu, 60) } : {}) }));
  if (dispos.length) out.dispos = dispos;   // périodes de travail de l'enseignant, pour la réservation
  if (conges.length) out.conges = conges;   // vacances de l'enseignant
  if (Object.keys(vac).length) out.vacClubs = vac;   // vacances de chaque club, telles que l'enseignant les a réglées
  return out;
}
async function get(store, userId) {
  const own = await store.getCoachSetting(userId, 'offers').catch(() => null);
  if (own) return clean(own);
  const a = await store.getAccount(userId).catch(() => null);   // pas encore enregistrées à part
  return clean(a && a.coachOffers);
}
async function save(store, userId, src) {
  const offers = clean(src);
  await store.saveCoachSetting(userId, 'offers', offers);
  return offers;
}
module.exports = { PERIODES, clean, get, save, publicOf };
