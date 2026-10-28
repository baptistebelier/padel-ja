/* Règles communes de l'enseignement (club/regles.js) : les mêmes pour l'appli et le serveur */
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../club/regles.js');

const OFFRES = {
  formules: [
    { id: 'ind', nom: 'Individuel', joueurs: 1, duree: 60, prix: 35, par: 'seance' },
    { id: 'duo', nom: 'Duo', joueurs: 2, duree: 60, prix: 60, par: 'seance' },
    { id: 'col', nom: 'Collectif', joueurs: 4, duree: 90, prix: 25, par: 'personne' }
  ],
  packs: [{ id: 'p3', formule: 'ind', seances: 3, prix: 99 }],
  abos: [{ id: 'ab', nom: 'Academy', formule: 'col', periode: 'mois', duree: 1, prix: 80 }]
};

test('jours de cours : chaque semaine, cycle, vacances, séance déplacée, une semaine sur deux, ponctuelle', () => {
  const g = { day: 2, from: '2026-09-01', to: '2026-12-15', skip: ['2026-09-15'], extra: ['2026-09-17'], off: [{ du: '2026-10-20', au: '2026-11-02' }] };
  assert.equal(R.trainOn(g, '2026-09-08'), true, 'un mardi');
  assert.equal(R.trainOn(g, '2026-09-09'), false, 'un mercredi');
  assert.equal(R.trainOn(g, '2026-09-15'), false, 'séance retirée');
  assert.equal(R.trainOn(g, '2026-09-17'), true, 'séance ajoutée');
  assert.equal(R.trainOn(g, '2026-10-27'), false, 'vacances');
  assert.equal(R.trainOn(g, '2026-12-22'), false, 'après la fin du cycle');
  assert.equal(R.trainOn(Object.assign({}, g, { every: 2 }), '2026-09-08'), false, 'une semaine sur deux');
  assert.equal(R.trainOn({ once: '2026-11-05' }, '2026-11-05'), true);
  assert.equal(R.durMin('1 h 30'), 90);
  assert.equal(R.durMin('45 min'), 45);
});

test('formule correspondante : même format et même durée', () => {
  assert.equal(R.formuleDe(OFFRES, 1, 60).id, 'ind');
  assert.equal(R.formuleDe(OFFRES, 6, 90).id, 'col', 'collectif à 6 : formule collectif');
  assert.equal(R.formuleDe(OFFRES, 1, 90), null);
  assert.equal(R.prixEleve(OFFRES.formules[1], 2), 30, 'duo à la séance : partagé');
  assert.equal(R.prixEleve(OFFRES.formules[2], 4), 25, 'collectif par personne');
});

test('couverture : un pack se décompte avec les séances de sa formule, à partir de 14 jours avant l’achat', () => {
  const venues = [
    { d: '2026-09-01', min: 60, n: 1 }, // trop tôt (plus de 14 jours avant l'achat)
    { d: '2026-09-20', min: 60, n: 1 },
    { d: '2026-09-27', min: 90, n: 4 }, // pas la formule du pack
    { d: '2026-10-04', min: 60, n: 1 },
    { d: '2026-10-11', min: 60, n: 1 },
    { d: '2026-10-18', min: 60, n: 1 } // pack déjà utilisé : non couverte
  ];
  const c = R.couverture([{ id: 'a1', t: 'pack', ref: 'p3', d: '2026-10-01', n: 3, prix: 99 }], venues, OFFRES);
  assert.equal(c.achats[0].used, 3);
  assert.deepEqual(venues.map(v => c.couvre.has(v)), [false, true, false, true, true, false]);
});

test('chiffre d’affaires réel : encaissé, à encaisser, packs pas encore utilisés', () => {
  const g1 = { dur: '1 h', mem: ['e1'] }, gc = { dur: '1 h 30', mem: ['e2', 'e3', 'e4', 'e5'] }, gClub = { dur: '2 h', mem: ['e6'] };
  const eleves = {
    e1: { achats: [{ id: 'a', t: 'pack', ref: 'p3', d: '2026-10-01', n: 3, prix: 90 }] },          // pack payé 90 (remise)
    e2: { achats: [{ id: 'b', t: 'abo', ref: 'ab', d: '2026-10-01', fin: '2026-10-31' }] },          // abonnement : prix du produit
    e3: { achats: [{ id: 'c', t: 'seance', ref: 'col', d: '2026-09-15', prix: 25 }] }               // achat de septembre : hors période
  };
  const seances = [
    { g: g1, d: '2026-10-05', n: 1, presents: ['e1'] },
    { g: gc, d: '2026-10-07', n: 4, presents: ['e2', 'e3', 'e4'] },
    { g: gClub, d: '2026-10-08', n: 1, presents: ['e6'] } // aucune formule de 2 h : payé par le club, rien à encaisser
  ];
  const r = R.chiffre({ eleves, seances, offres: OFFRES, from: '2026-10-01', to: '2026-10-31' });
  assert.equal(r.encaisse, 170, 'pack 90 + abonnement 80');
  // e3 : sa séance à l'unité de septembre couvre le collectif du 7 octobre (14 jours de marge) ; e4 : rien → 25 €
  assert.equal(r.aEncaisser, 25);
  assert.equal(r.nonCouvertes, 1);
  assert.equal(r.prepaye, 60, 'pack de 3 : 2 séances dues à 30 €');
  assert.deepEqual(r.parMois, { '2026-10': 170 });
});
