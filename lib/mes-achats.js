/* =========================================================================
   /RAM Club : un élève voit ses propres achats (packs, abonnement, reste à payer)
   Les fiches élèves restent réservées à l'équipe pédagogique (ramclub.js readable) : cette lecture n'en renvoie
   qu'un résumé, et seulement pour le compte connecté et ses enfants. Ni la note de l'enseignant, ni le prix,
   ni le moyen de paiement, ni rien d'autre de la fiche. Calcul : regles.js resumeAchats, le même que /RAM Coach.
   ========================================================================= */
'use strict';
const REGLES = require('../club/regles.js');

const auj = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

/* ram : lib/ramclub.js ; formules(userId) : formules, packs et abonnements d'un enseignant (lib/formules.js) */
function createMesAchats({ ram, formules, today = auj }) {
  /* les offres des enseignants de l'élève, réunies : leurs identifiants sont distincts */
  async function offresDe(au, keys, groupes) {
    const coachs = new Set();
    groupes.forEach(g => {
      if (![...(g.mem || []), ...(g.ext || [])].some(k => keys.includes(k))) return;
      if (g.coach) coachs.add(g.coach);
      (g.cycles || []).forEach(c => c.coach && coachs.add(c.coach));
    });
    const out = { formules: [], packs: [], abos: [] };
    for (const c of coachs) {
      const uid = au.user[c];
      if (!uid || !formules) continue;
      const o = (await formules(uid).catch(() => null)) || {};
      ['formules', 'packs', 'abos'].forEach(q => Array.isArray(o[q]) && out[q].push(...o[q]));
    }
    return out;
  }
  /* { eleves: [{ key, nom, achats: [...], termines }] } ; null : club inconnu ou compte hors du club */
  return async function mesAchats(userId, clubId) {
    const ctx = await ram.memberCtx(userId, clubId);
    if (!ctx) return null;
    const au = await ram.audience(clubId);
    if (!au) return null;
    const keys = [ctx.key, ...(ctx.kids || [])], t = today();
    const avec = keys.filter(k => ((au.get('eleve', k) || {}).achats || []).length);
    if (!avec.length) return { eleves: [] };
    const groupes = (await ram.itemsOf(clubId, 'group')).concat(await ram.itemsOf(clubId, 'cours')).map(x => Object.assign({}, x.data, { id: x.id }));
    const seances = au.list('seance'), offres = await offresDe(au, avec, groupes);
    const eleves = avec.map(k => {
      const r = REGLES.resumeAchats(k, au.get('eleve', k).achats, seances, groupes, offres, t), m = au.get('member', k) || {};
      return { key: k, nom: String(m.n || m.name || '').split(' ')[0], achats: r.achats, termines: r.termines };
    }).filter(e => e.achats.length || e.termines);
    return { eleves };
  };
}

module.exports = { createMesAchats };
