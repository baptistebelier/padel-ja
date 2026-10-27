/* =========================================================================
   /RAM Coach — échelles de niveaux de l'enseignant (une pour le padel, une pour le tennis)
   Rangées sur son compte /RAM (pas dans un club) : il les retrouve dans tous ses clubs, et le connecteur
   /RAM pour Claude peut les lire et les modifier. Autant de niveaux que voulu, chacun avec son nom,
   ses prérequis et ses attendus. Sans réglage : l'échelle par défaut ci-dessous.
   ========================================================================= */
'use strict';
const DEFAULTS = {
  Padel: {
    name: 'Échelle padel',
    levels: [
      { t: 'Découverte', pre: ['Aucun'], att: ['Tenir la raquette (prise continentale)', 'Échanger en coup droit à mi-court', 'Connaître le score'] },
      { t: 'Initiation', pre: ['Échanger en coup droit et revers à mi-court'], att: ['Servir à la cuillère dans le bon carré', 'Jouer après la vitre de fond (coup droit)', 'Volée de coup droit en bloc'] },
      { t: 'Débutant', pre: ['Servir dans le carré 7 fois sur 10'], att: ['Sortie de vitre de fond en coup droit et revers', 'Lob défensif depuis le fond', 'Se placer à deux : côte à côte'] },
      { t: 'Débutant confirmé', pre: ['Sortie de vitre de fond simple', 'Tenir un échange de 6 coups'], att: ['Bandeja de placement', 'Volées croisées en bloc', 'Retour de service croisé'] },
      { t: 'Intermédiaire', pre: ['Bandeja de placement', 'Monter au filet après un lob'], att: ['Sortie de double vitre', 'Víbora de placement', 'Transitions fond-filet à deux'] },
      { t: 'Intermédiaire confirmé', pre: ['Víbora de placement', 'Sortie de double vitre'], att: ['Smash par 3 (sortie de piste)', 'Chiquita', 'Varier le rythme au fond'] },
      { t: 'Avancé', pre: ['Tournois P25 / P100'], att: ['Smash par 4', 'Contre-vitre', 'Construire le point selon l’adversaire'] },
      { t: 'Compétition', pre: ['Victoires en P100'], att: ['Plan de jeu tenu sur un match', 'Variations de service', 'Gestion des points importants'] }
    ]
  },
  Tennis: {
    name: 'Échelle tennis',
    levels: [
      { t: 'Blanc', pre: ['Aucun'], att: ['Renvoyer la balle en mousse', 'Lancer et rattraper', 'Se déplacer en pas chassés'] },
      { t: 'Violet', pre: ['Échanger 5 balles sur terrain rouge'], att: ['Coup droit et revers en échange', 'Service par le bas', 'Compter les points'] },
      { t: 'Rouge', pre: ['Échanger 10 balles sur terrain rouge'], att: ['Service par le haut', 'Volée de coup droit', 'Matchs sur terrain rouge'] },
      { t: 'Orange', pre: ['Matchs gagnés sur terrain rouge'], att: ['Coups liftés', 'Montée au filet', 'Matchs sur terrain orange'] },
      { t: 'Vert', pre: ['Matchs gagnés sur terrain orange'], att: ['Service régulier', 'Construire le point', 'Premiers tournois en balle verte'] },
      { t: 'Adulte', pre: ['Balle jaune, terrain complet'], att: ['Classement 30/5 à 30/1', 'Jeu de double', 'Tactique de base'] },
      { t: 'Compétition', pre: ['Classé 30'], att: ['Classement 15/5 à 15/1', 'Plan de jeu', 'Gestion des points importants'] }
    ]
  }
};
const txt = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const lines = v => (Array.isArray(v) ? v : String(v || '').split('\n')).map(x => txt(x, 140)).filter(Boolean).slice(0, 12);
/* échelles reçues (de l'appli ou de Claude) : nettoyées, numérotées dans l'ordre (niveau 1, 2, 3…) */
function clean(src) {
  const out = {};
  ['Padel', 'Tennis'].forEach(sp => {
    const s = (src && src[sp]) || DEFAULTS[sp];
    const levels = (Array.isArray(s.levels) ? s.levels : []).slice(0, 30).map(l => ({ t: txt(l && l.t, 60) || 'Niveau', pre: lines(l && l.pre), att: lines(l && l.att) }));
    out[sp] = { name: txt(s.name, 60) || DEFAULTS[sp].name, levels: levels.length ? levels : DEFAULTS[sp].levels };
  });
  return out;
}
const number = sc => Object.fromEntries(Object.entries(sc).map(([sp, s]) => [sp, Object.assign({}, s, { levels: s.levels.map((l, i) => Object.assign({ n: i + 1 }, l)) })]));
async function get(store, userId) {
  const a = await store.getAccount(userId).catch(() => null);
  return number(clean(a && a.coachScales));
}
async function save(store, userId, src) {
  const a = await store.getAccount(userId);
  a.coachScales = clean(src);
  await store.saveAccount(userId, a);
  return number(a.coachScales);
}
module.exports = { DEFAULTS, clean, get, save };
