/* =========================================================================
   Adresses personnalisées des pages publiques de réservation : /reservation/<nom-du-coach>[/<club>]
   - le nom est proposé à partir du nom du coach (minuscules, sans accent, tirets) et choisi par l'enseignant ;
   - un nom ne désigne qu'un enseignant : la réservation d'un nom passe par un verrou, deux demandes en même temps sont jouées l'une après l'autre ;
   - quand l'enseignant change de nom, l'ancien reste à lui (personne d'autre ne peut le prendre) et redirige vers le nouveau ;
   - rangé sans nouvelle table : un registre global dans les réglages du serveur (store.getSetting / saveSetting, comme les références Shopify),
     et le nom courant dans les formules de l'enseignant (offres.nom).
   Registre : { noms: { [nom]: { u: compte, at } }, cur: { [compte]: nom } }.
   ========================================================================= */
'use strict';

const MIN = 3, MAX = 40;
/* noms qui ne peuvent pas désigner un enseignant : pages et chemins de l'appli, noms des applis, mots d'usage */
const RESERVES = new Set(['admin', 'administrateur', 'api', 'app', 'auth', 'club', 'clubs', 'coach', 'coachs', 'connexion', 'inscription', 'deconnexion', 'dojo', 'pista', 'buvette', 'ram', 'riseandmove', 'reservation', 'reservations', 'reserver', 'resa', 'agenda', 'annuler', 'i', 'r', 't', 'ja', 'demo', 'presentation', 'dashboard', 'profil', 'public', 'static', 'fonts', 'css', 'js', 'img', 'www', 'mail', 'support', 'aide', 'contact', 'null', 'undefined', 'test', 'tournoi', 'tournois', 'championnats', 'calendrier', 'joueurs', 'statistiques', 'mot-de-passe-oublie', 'reinitialiser', 'oauth', 'mcp']);

/* « Baptiste Bélier » → « baptiste-belier » */
function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, MAX).replace(/-+$/g, '');
}
/* contrôle d'un nom : renvoie un texte d'erreur, ou '' s'il est correct */
function erreur(slug) {
  if (typeof slug !== 'string' || !slug) return 'Choisis un nom pour ton adresse.';
  if (slug.length < MIN) return 'Au moins ' + MIN + ' caractères.';
  if (slug.length > MAX) return 'Au plus ' + MAX + ' caractères.';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return 'Seulement des lettres sans accent, des chiffres et des tirets (pas au début ni à la fin).';
  if (RESERVES.has(slug)) return 'Ce nom est réservé : choisis-en un autre.';
  return '';
}

function createNoms({ store }) {
  let chaine = Promise.resolve();
  const verrou = fn => { const p = chaine.then(fn, fn); chaine = p.catch(() => {}); return p; };
  const lire = async () => { const r = (await store.getSetting('resa-noms').catch(() => null)) || {}; return { noms: r.noms || {}, cur: r.cur || {} }; };
  /* une variante libre : nom, nom-2, nom-3… */
  const variante = (reg, base, uid) => { for (let i = 2; i < 1000; i++) { const s = (base.slice(0, MAX - String(i).length - 1) + '-' + i).replace(/-+/g, '-'); if (!reg.noms[s] && !RESERVES.has(s)) return s; } return ''; };
  return {
    slugify, erreur, RESERVES,
    /* le nom est-il libre pour cet enseignant ? { ok, libre, nom, erreur?, propose? } */
    async disponible(uid, brut) {
      const nom = slugify(brut), err = erreur(nom);
      if (err) return { ok: false, nom, erreur: err };
      const reg = await lire(), e = reg.noms[nom];
      if (!e || e.u === uid) return { ok: true, libre: true, nom, courant: reg.cur[uid] === nom };
      return { ok: true, libre: false, nom, erreur: 'Ce nom est déjà pris.', propose: variante(reg, nom, uid) };
    },
    /* la proposition de départ, d'après le nom du coach (une variante s'il est pris par un autre) */
    async proposer(uid, nomDuCoach) {
      const nom = slugify(nomDuCoach) || 'mon-coaching', reg = await lire();
      if (reg.cur[uid]) return reg.cur[uid];
      const base = erreur(nom) ? 'coach-' + (nom || 'rise') : nom;
      return !reg.noms[base] || reg.noms[base].u === uid ? base : variante(reg, base, uid);
    },
    /* réserver un nom pour cet enseignant : atomique ; renvoie { nom, ancien } ou lève une erreur (avec la variante proposée) */
    reserver(uid, brut) {
      return verrou(async () => {
        const nom = slugify(brut), err = erreur(nom);
        if (err) throw Object.assign(new Error(err), { code: 'invalide' });
        const reg = await lire(), e = reg.noms[nom];
        if (e && e.u !== uid) throw Object.assign(new Error('Ce nom est déjà pris.'), { code: 'pris', propose: variante(reg, nom, uid) });
        const ancien = reg.cur[uid] || '';
        if (!e) reg.noms[nom] = { u: uid, at: Date.now() };
        reg.cur[uid] = nom;
        await store.saveSetting('resa-noms', reg);
        return { nom, ancien };
      });
    },
    /* à qui est ce nom ? { u, courant } (courant : le nom actuel de cet enseignant, différent si le nom demandé est un ancien) ou null */
    async resoudre(brut) {
      const nom = String(brut || '').toLowerCase();
      if (erreur(nom)) return null;
      const reg = await lire(), e = reg.noms[nom];
      return e ? { u: e.u, nom, courant: reg.cur[e.u] || nom } : null;
    }
  };
}

module.exports = { createNoms, slugify, erreur, RESERVES, MIN, MAX };
