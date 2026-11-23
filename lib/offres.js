/* =========================================================================
   Offres payantes des trois applis (décidées par Baptiste le 23/11/2026)
   - /Pista : Gratuit (1 tournoi offert, sans limite de durée), Pass 15 € (un tournoi), Pro 15 €/mois ou 150 €/an
     → droits calculés par lib/access.js, ventes par lib/shopify.js
   - /Dojo : Gratuit (30 élèves, 3 groupes, 2 formules, sans réservation en ligne ni suivi des élèves),
     Pro 15 €/mois ou 150 €/an (tout illimité) ; offert aux enseignants d'un club en /Buvette Club +
   - /Buvette : Découverte (50 adhérents validés au plus, toutes les fonctions), Club 19 €/mois, Club + 29 €/mois
   Les limites s'appliquent à tous, y compris aux comptes déjà inscrits.
   Contrôle unique : garde(), appelé par lib/ramclub.js pour chaque opération (applis et connecteur Claude),
   plus la sauvegarde des formules de l'enseignant et sa page de réservation.
   ========================================================================= */
'use strict';
const DAY = 864e5, GRACE_DAYS = 7;
const LIMITES = { dojo: { eleves: 30, groupes: 3, formules: 2 }, buvette: { adherents: 50 } };
// pages d'achat des offres (Shopify), réglables dans Render ; la boutique /RAM en attendant
const BOUTIQUE = { dojo: process.env.SHOP_DOJO_URL || 'https://riseandmove.fr', buvette: process.env.SHOP_BUVETTE_URL || 'https://riseandmove.fr' };
const NIVEAUX = { decouverte: 'Découverte', club: 'Club', clubplus: 'Club +' };

class Limite extends Error {}

/* /Dojo Pro payé (abonnement en cours, 7 jours de grâce) */
const dojoPaye = (billing, now = Date.now()) => !!(billing && billing.dojo && now < +billing.dojo.until + GRACE_DAYS * DAY);
/* l'offre /Buvette d'un club, d'après sa configuration (écrite par le serveur seulement) */
function niveauClub(conf, now = Date.now()) {
  const o = conf && conf.offre;
  return o && NIVEAUX[o.niveau] && o.niveau !== 'decouverte' && now < +o.until + GRACE_DAYS * DAY ? o.niveau : 'decouverte';
}
/* adhérents validés pour la saison en cours */
function adherents(items, conf) {
  let n = 0;
  if (!conf || !conf.season) return 0;
  items.forEach(it => { if (it.coll === 'member' && !it.del && it.data && it.data.valid === conf.season) n++; });
  return n;
}
/* élèves (fiches ou comptes) des groupes d'entraînement et des cours d'un enseignant (clé), et ses groupes */
function parcEnseignant(items, key) {
  const eleves = new Set(), groupes = new Set();
  items.forEach(it => {
    if (it.del || !it.data || it.data.coach !== key || it.data.old) return;
    if (it.coll === 'group' && it.data.type === 'train') groupes.add(it.id);
    if ((it.coll === 'group' && it.data.type === 'train') || (it.coll === 'cours' && !it.data.nv)) [...(it.data.mem || []), ...(it.data.ext || [])].forEach(k => eleves.add(k));
  });
  return { eleves, groupes };
}
const enMap = l => { const m = new Map(); l.forEach(x => m.set(x.coll + '/' + x.id, { coll: x.coll, id: x.id, data: x.data })); return m; };

function createOffres({ store, ram, log = () => {} }) {
  /* l'enseignant a-t-il /Dojo Pro : payé, ou offert par un de ses clubs en Club + */
  async function dojoPro(userId, now = Date.now()) {
    if (dojoPaye(await store.getBilling(userId).catch(() => null), now)) return true;
    for (const c of await ram.myClubs(userId)) {
      if (c.role !== 'coach' && c.role !== 'bureau') continue;
      const conf = ((await ram.itemsOf(c.id, 'conf')).find(x => x.id === 'main') || {}).data;
      if (niveauClub(conf, now) === 'clubplus') return true;
    }
    return false;
  }
  /* son parc dans tous ses clubs : le club en cours avec l'opération appliquée, les autres tels qu'enregistrés */
  async function parcTotal(userId, clubId, courant) {
    const eleves = new Set(), groupes = new Set();
    for (const c of await ram.myClubs(userId)) {
      if (c.role !== 'coach' && c.role !== 'bureau') continue;
      const items = c.id === clubId ? courant : enMap([...(await ram.itemsOf(c.id, 'group')).map(x => ({ coll: 'group', ...x })), ...(await ram.itemsOf(c.id, 'cours')).map(x => ({ coll: 'cours', ...x }))]);
      const p = parcEnseignant(items, c.key);
      p.eleves.forEach(k => eleves.add(c.id + '/' + k)); p.groupes.forEach(g => groupes.add(c.id + '/' + g));
    }
    return { eleves: eleves.size, groupes: groupes.size };
  }

  async function garde({ userId, clubId, ctx, op, before, after, club }) {
    const conf = (club.items.get('conf/main') || {}).data || {};
    // l'offre du club ne s'écrit que par le serveur, après un paiement : l'appli la garde telle quelle
    if (op.coll === 'conf' && after) { if (before && before.offre) after.offre = before.offre; else delete after.offre; }
    // /Buvette Découverte : 50 adhérents validés au plus
    if (op.coll === 'member' && after && conf.season && after.valid === conf.season && (before || {}).valid !== conf.season && niveauClub(conf) === 'decouverte') {
      if (adherents(club.items, conf) >= LIMITES.buvette.adherents)
        throw new Limite(`Offre Découverte : ${LIMITES.buvette.adherents} adhérents au plus. Passe à l’offre Club pour en valider d’autres.`);
    }
    // /Dojo gratuit : ce que fait un enseignant (pas le bureau du club, qui gère /Buvette)
    if (ctx.role !== 'coach' || ctx.sup) return;
    if (op.coll === 'suivi' && after && !before && after.by === ctx.key && !(await dojoPro(userId)))
      throw new Limite('Le suivi des élèves (exercices, vidéos, analyses) fait partie de /Dojo Pro.');
    if ((op.coll === 'group' || op.coll === 'cours') && after && after.coach === ctx.key) {
      const avant = club.items, apres = new Map(avant);
      apres.set(op.coll + '/' + op.id, { coll: op.coll, id: op.id, data: after });
      const [a, b] = await Promise.all([parcTotal(userId, clubId, avant), parcTotal(userId, clubId, apres)]);
      if ((b.groupes > a.groupes && b.groupes > LIMITES.dojo.groupes) || (b.eleves > a.eleves && b.eleves > LIMITES.dojo.eleves)) {
        if (await dojoPro(userId)) return;
        throw new Limite(b.groupes > a.groupes && b.groupes > LIMITES.dojo.groupes
          ? `/Dojo gratuit : ${LIMITES.dojo.groupes} groupes au plus. Passe à /Dojo Pro pour en créer d’autres.`
          : `/Dojo gratuit : ${LIMITES.dojo.eleves} élèves au plus. Passe à /Dojo Pro pour en ajouter d’autres.`);
      }
    }
  }

  /* formules de l'enseignant : 2 au plus en gratuit (packs et abonnements compris) ; un compte déjà au-delà garde les siennes,
     mais n'en ajoute pas */
  async function gardeFormules(userId, avant, apres) {
    if (apres > avant && apres > LIMITES.dojo.formules && !(await dojoPro(userId))) throw new Limite(`/Dojo gratuit : ${LIMITES.dojo.formules} formules au plus (packs et abonnements compris). Passe à /Dojo Pro pour en proposer d’autres.`);
  }

  /* ce que l'appli affiche : offre, compteurs et limites */
  async function etatDojo(userId) {
    const billing = await store.getBilling(userId).catch(() => null), pro = await dojoPro(userId), paye = dojoPaye(billing);
    const p = await parcTotal(userId, null, new Map());
    return { offre: pro ? 'pro' : 'gratuit', paye, offertParClub: pro && !paye, until: paye ? +billing.dojo.until : 0, eleves: p.eleves, groupes: p.groupes, limites: LIMITES.dojo, boutique: BOUTIQUE.dojo };
  }
  async function etatClub(clubId) {
    const items = enMap((await ram.itemsOf(clubId, 'member')).map(x => ({ coll: 'member', ...x })));
    const conf = ((await ram.itemsOf(clubId, 'conf')).find(x => x.id === 'main') || {}).data || {};
    const niveau = niveauClub(conf);
    return { niveau, nom: NIVEAUX[niveau], until: niveau !== 'decouverte' ? +conf.offre.until : 0, adherents: adherents(items, conf), limites: LIMITES.buvette, boutique: BOUTIQUE.buvette };
  }
  return { garde, gardeFormules, dojoPro, etatDojo, etatClub };
}

module.exports = { createOffres, LIMITES, NIVEAUX, Limite, dojoPaye, niveauClub, adherents, parcEnseignant, GRACE_DAYS };
