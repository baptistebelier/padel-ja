/* =========================================================================
   /RAM Réservation — réserver un cours avec un enseignant depuis /RAM Club
   Le serveur calcule ce qui est libre et crée le cours : un adhérent ne peut pas écrire un cours lui-même.
   - creneaux : ses disponibilités, moins ses cours (tous clubs) et ses vacances ; les cours pris, sans aucun nom ;
   - reserver : un adhérent validé prend une plage libre ; confirmé tout de suite, l'enseignant est notifié
     (lib/pushnotif.js) et le cours arrive à son planning. Deux demandes en même temps passent l'une après l'autre ;
   - enseignants : ceux dont l'adhérent suit un groupe, ou chez qui il a un cours ou une formule (Mon espace).
   Pour l'instant, seules les formules individuelles : les collectifs à seuil sont une étape à part.
   ========================================================================= */
'use strict';
const crypto = require('crypto');
const REGLES = require('../club/regles.js');

const DAYS = 7, DELAI_MIN = 60;   // on réserve au moins une heure à l'avance
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const hMin = h => { const m = String(h || '').match(/(\d+) h(?: (\d+))?/); return m ? +m[1] * 60 + (+m[2] || 0) : 0; };
const hTxt = n => Math.floor(n / 60) + ' h' + (n % 60 ? ' ' + String(n % 60).padStart(2, '0') : '');
const durTxt = n => (n < 60 ? n + ' min' : hTxt(n));
/* maintenant, à l'heure du club */
function paris(now) {
  const s = (now || new Date()).toLocaleString('sv-SE', { timeZone: 'Europe/Paris' });
  return { d: s.slice(0, 10), m: +s.slice(11, 13) * 60 + +s.slice(14, 16) };
}
class Refus extends Error {}

function createReservation({ ram, store, coachTables, Formules, now }) {
  const locks = new Map();
  const serial = (id, fn) => { const p = (locks.get(id) || Promise.resolve()).then(fn, fn); locks.set(id, p.catch(() => {})); return p; };

  /* l'enseignant d'une clé dans un club, avec ses formules : null s'il n'enseigne pas ici */
  async function coachOf(clubId, key) {
    const m = await ram.memberByKey(clubId, key).catch(() => null);
    if (!m || !m.user_id) return null;
    const row = (await ram.myClubs(m.user_id)).find(c => c.id === clubId);
    if (!row || (row.role !== 'coach' && row.role !== 'bureau')) return null;
    return { user: m.user_id, key, offres: await Formules.get(store, m.user_id) };
  }
  /* jour par jour : ce qui est libre et ce qui est pris */
  async function jours(coach, de, n) {
    const fin = REGLES.addDays(de, n - 1), { seances } = await coachTables.planning(coach.user, de, fin), t = paris(now && now()), out = [];
    for (let i = 0; i < n; i++) {
      const d = REGLES.addDays(de, i),
        pris = seances.filter(s => s.date === d && !s.annule).map(s => [hMin(s.heure), hMin(s.heure) + (+s.minutes || 60)]).sort((a, b) => a[0] - b[0]);
      let libres = d < t.d ? [] : REGLES.plagesLibres(coach.offres.dispos, d, pris, coach.offres.conges, 0);
      if (d === t.d) libres = libres.map(p => Object.assign({}, p, { du: Math.max(p.du, Math.ceil((t.m + DELAI_MIN) / 30) * 30) })).filter(p => p.au > p.du);
      out.push({ d, libres, pris: pris.map(([du, au]) => ({ du, au })) });
    }
    return out;
  }
  const formulesOf = o => (o.formules || []).filter(f => +f.joueurs === 1).map(f => ({ id: f.id, nom: f.nom, sport: f.sport, duree: f.duree, prix: f.prix }));

  return {
    Refus,
    async creneaux(userId, clubId, key, de) {
      const me = await ram.memberCtx(userId, clubId);
      if (!me || !me.valid) throw new Refus('Adhésion pas encore validée.');
      if (!isDate(de)) throw new Refus('Date invalide.');
      const coach = await coachOf(clubId, key);
      if (!coach) throw new Refus('Cet enseignant n’est pas de ce club.');
      if (!(coach.offres.dispos || []).length) return { ouvert: false, formules: [], jours: [] };
      return { ouvert: true, formules: formulesOf(coach.offres), packs: !!(coach.offres.packs || []).length, jours: await jours(coach, de, DAYS) };
    },
    async reserver(userId, clubId, key, b) {
      const me = await ram.memberCtx(userId, clubId);
      if (!me || !me.valid) throw new Refus('Adhésion pas encore validée.');
      if (me.key === key) throw new Refus('Tu ne peux pas réserver un cours avec toi-même.');
      const d = String(b.d || ''), debut = Math.round(+b.t), objectif = String(b.objectif || '').trim().slice(0, 300);
      if (!isDate(d) || !Number.isFinite(debut)) throw new Refus('Créneau invalide.');
      if (objectif.length < 3) throw new Refus('Indique l’objectif de la séance.');
      return serial(clubId + '/' + key, async () => {
        const coach = await coachOf(clubId, key);
        if (!coach) throw new Refus('Cet enseignant n’est pas de ce club.');
        const f = (coach.offres.formules || []).find(x => x.id === b.formule && +x.joueurs === 1);
        if (!f) throw new Refus('Cette formule n’est pas réservable.');
        const [jour] = await jours(coach, d, 1);
        if (!jour.libres.some(p => debut >= p.du && debut + f.duree <= p.au)) throw new Refus('Ce créneau vient d’être pris. Choisis-en un autre.');
        const id = 'r' + crypto.randomBytes(6).toString('hex'), h = hTxt(debut), dur = durTxt(f.duree);
        const data = { type: 'train', name: f.nom, sport: f.sport, day: REGLES.dowOf(d), h, dur, defLoc: 'En salle', coach: key, once: d, cal: 'ram:' + id, mem: [me.key], ext: [],
          sub: `${d.split('-').reverse().join('/')} ${h} · ${dur}`, tarif: { mode: f.par === 'personne' ? 'eleve' : 'seance', prix: f.prix }, goal: objectif, at: Date.now() };
        const r = await ram.ops(coach.user, clubId, [{ coll: 'cours', id, op: 'put', data }]);
        if (r.rejected && r.rejected.length) throw new Error('Cours refusé : ' + r.rejected[0].error);
        return { id, d, h, dur };
      });
    },
    /* mes enseignants dans ce club : groupe, cours, ou formule achetée chez eux ; seulement ceux qui ouvrent la réservation */
    async enseignants(userId, clubId) {
      const me = await ram.memberCtx(userId, clubId);
      if (!me || !me.valid) return [];
      const mine = [me.key].concat(me.kids || []), au = await ram.audience(clubId);
      const lists = (await ram.itemsOf(clubId, 'group')).concat(await ram.itemsOf(clubId, 'cours')), eleves = await ram.itemsOf(clubId, 'eleve');
      const achats = eleves.filter(x => mine.includes(x.id)).flatMap(x => x.data.achats || []).map(a => a.ref), out = [];
      for (const k of Object.keys(au.role).filter(x => (au.role[x] === 'coach' || au.role[x] === 'bureau') && x !== me.key)) {
        const coach = await coachOf(clubId, k);
        if (!coach || !(coach.offres.dispos || []).length) continue;
        const o = coach.offres, siens = new Set([...(o.formules || []), ...(o.packs || []), ...(o.abos || [])].map(x => x.id));
        if (lists.some(x => x.data.coach === k && (x.data.mem || []).some(m => mine.includes(m))) || achats.some(r => siens.has(r))) out.push(k);
      }
      return out;
    }
  };
}
module.exports = { createReservation, paris };
