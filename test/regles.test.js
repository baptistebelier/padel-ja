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

test('paiements : un achat sans échéances est réglé ; avec, seul ce qui est payé est encaissé, le reste à encaisser', () => {
  const eleves = { a: { achats: [{ id: 'h', t: 'pack', ref: 'p', d: '2026-10-01', n: 5, prix: 100, pay: { ech: [{ s: 1, m: 40, ok: '2026-10-02' }, { s: 3, m: 60, ok: '' }] } }, { id: 'i', t: 'pack', ref: 'p', d: '2026-10-05', n: 5, prix: 50 }] } };
  const r = R.chiffre({ eleves, seances: [], offres: { formules: [], packs: [], abos: [] }, from: '2026-10-01', to: '2026-10-31' });
  assert.equal(r.encaisse, 90);
  assert.equal(r.aEncaisser, 60);
  assert.equal(r.parMois['2026-10'], 90);
});

test('disponibilités : les cours et les vacances retirent du temps, les plages trop courtes ne comptent pas', () => {
  // 2026-11-02 est un lundi
  const dispos = [{ jour: 1, du: '09:00', au: '12:00', lieu: 'Club' }, { jour: 1, du: '14:00', au: '15:00' }, { jour: 2, du: '09:00', au: '10:00' }];
  assert.deepEqual(R.plagesLibres(dispos, '2026-11-02', [], [], 60), [{ du: 540, au: 720, lieu: 'Club' }, { du: 840, au: 900, lieu: '' }]);
  assert.deepEqual(R.plagesLibres(dispos, '2026-11-02', [[600, 660]], [], 60), [{ du: 540, au: 600, lieu: 'Club' }, { du: 660, au: 720, lieu: 'Club' }, { du: 840, au: 900, lieu: '' }]);
  assert.deepEqual(R.plagesLibres(dispos, '2026-11-02', [[570, 690]], [], 60), [{ du: 840, au: 900, lieu: '' }], 'moins d’une heure de chaque côté');
  assert.deepEqual(R.plagesLibres(dispos, '2026-11-02', [], [{ du: '2026-11-01', au: '2026-11-03' }], 60), [], 'en vacances');
});
test('disponibilités : gardées sur le compte, jamais montrées aux adhérents', () => {
  const F = require('../lib/formules.js');
  const o = F.clean({ dispos: [{ jour: 1, du: '09:00', au: '12:00', lieu: 'Club' }, { jour: 9, du: '09:00', au: '12:00' }, { jour: 1, du: '12:00', au: '09:00' }], conges: [{ nom: 'Noël', du: '2026-12-20', au: '2026-12-30' }] });
  assert.deepEqual(o.dispos, [{ jour: 1, du: '09:00', au: '12:00', lieu: 'Club' }]);
  const p = F.publicOf(o);
  assert.equal(p.dispos, undefined);
  assert.equal(p.conges, undefined);
});


test('cycle : ses séances et elles seules, faite seulement avec quelqu’un de présent', () => {
  const g = { day: 2, cancel: ['2030-01-15'], cycles: [{ id: 'a', nom: 'Pack', n: 10, dates: ['2030-01-08', '2030-01-01', '2030-01-15', '2030-01-22', '2030-01-29'] }] };
  const ses = { '2030-01-01': { pres: { x: 'P', y: 'A' } }, '2030-01-08': { pres: { y: 'A' } } };
  const E = R.cycleEtat(g, g.cycles[0], d => ses[d], '2030-01-22');
  assert.deepEqual(E.seances.map(x => [x.etat, x.num]), [['done', 1], ['vide', 2], ['cx', 0], ['now', 3], ['next', 4]]);
  assert.deepEqual([E.prevues, E.posees, E.sansDate, E.faites, E.aVerifier, E.aVenir], [10, 4, 6, 1, 1, 2], 'un pack de 10 compte 10 séances, datées ou non');
  // les séances posées ensuite entrent dans le cycle, jamais avant son début, jamais une séance retirée à la main
  const ou = R.cycleOuvert(g);
  assert.equal(ou.id, 'a');
  assert.deepEqual(R.cycleAjouts(g, ou, ['2030-02-05', '2029-12-01', '2030-02-12'], '2030-01-22'), ['2030-02-05', '2030-02-12']);
  assert.deepEqual(R.cycleAjouts(Object.assign({}, g), Object.assign({}, ou, { sans: ['2030-02-05'] }), ['2030-02-05', '2030-02-12'], '2030-01-22'), ['2030-02-12']);
  assert.equal(R.cycleAjouts(g, Object.assign({}, ou, { n: 4 }), ['2030-02-05'], '2030-01-22').length, 0, 'pack complet');
  assert.equal(R.cycleOuvert({ cycles: [{ id: 'z', n: 2, dates: ['2030-01-01', '2030-01-08'] }] }), null);
  assert.equal(R.cycleCourant({ cycles: [{ id: 'v', n: 10 }] }, '2030-01-01').id, 'v', 'un cycle sans aucune date existe déjà');
  assert.equal(R.cycleDe(g, '2030-01-08').id, 'a');
  assert.equal(R.cycleDe(g, '2030-02-05'), null);
  const deux = { cycles: [{ id: 'b', dates: ['2030-03-01'] }, { id: 'a', dates: ['2030-01-01'] }] };
  assert.equal(R.cycleCourant(deux, '2029-12-01').id, 'a', 'le premier qui a encore une séance à venir');
  assert.equal(R.cycleCourant(deux, '2030-02-01').id, 'b');
  assert.equal(R.cycleCourant(deux, '2031-01-01').id, 'b', 'tout est passé : le dernier');
  assert.equal(R.cycleCourant({}, '2030-01-01'), null);
});

test('planPaiement : les montants du pack s’ils font le prix, sinon à parts égales', () => {
  const { planPaiement } = require('../club/regles.js');
  assert.deepEqual(planPaiement(250, [1, 4, 7], [85, 85, 80]).map(x => x.m), [85, 85, 80]);
  assert.deepEqual(planPaiement(100, [1, 3], [85, 85]).map(x => x.m), [50, 50]);
  assert.deepEqual(planPaiement(100, [1, 4, 7]).map(x => x.s), [1, 4, 7]);
  const Formules = require('../lib/formules.js');
  const c = Formules.clean({ formules: [{ id: 'f', nom: 'F', joueurs: 1, duree: 60, prix: 30 }], packs: [{ id: 'p', formule: 'f', seances: 10, prix: 250, ech: [1, 4, 7], echm: [85, 85, 80] }, { id: 'q', formule: 'f', seances: 5, prix: 100, ech: [1, 3], echm: [50] }] });
  assert.deepEqual(c.packs[0].echm, [85, 85, 80]);
  assert.equal(c.packs[1].echm, undefined, 'pas autant de montants que de paiements');
  assert.equal(Formules.publicOf(c).packs[0].echm, undefined, 'pas sur la fiche publique');
});

test('replanAchat : recale ce qui reste à payer, jamais ce qui est réglé', () => {
  const { replanAchat } = require('../club/regles.js');
  const pk = { ech: [1, 4, 7], echm: [85, 85, 80] };
  assert.deepEqual(replanAchat({ prix: 250, pay: { ech: [{ s: 0, m: 250, ok: '' }] } }, pk).map(x => [x.s, x.m]), [[1, 85], [4, 85], [7, 80]]);
  const r = replanAchat({ prix: 250, pay: { ech: [{ s: 1, m: 85, ok: '2026-10-01' }, { s: 5, m: 165, ok: '' }] } }, pk);
  assert.deepEqual(r.map(x => [x.s, x.m, x.ok]), [[1, 85, '2026-10-01'], [4, 85, ''], [7, 80, '']]);
  const autre = replanAchat({ prix: 250, pay: { ech: [{ s: 1, m: 100, ok: '2026-10-01' }, { s: 5, m: 150, ok: '' }] } }, pk);
  assert.deepEqual(autre.map(x => [x.s, x.m]), [[1, 100], [4, 75], [7, 75]], 'réglé autrement : le reste est partagé');
  assert.equal(replanAchat({ prix: 250, pay: { ech: [{ s: 1, m: 250, ok: '2026-10-01' }] } }, pk), null, 'tout réglé');
  assert.equal(replanAchat({ prix: 250, pay: { ech: [{ s: 1, m: 85, ok: '' }, { s: 4, m: 85, ok: '' }, { s: 7, m: 80, ok: '' }] } }, pk), null, 'déjà bon');
  assert.equal(replanAchat({ prix: 250 }, pk), null, 'payé en une fois, sans calendrier');
});

test('chiffre : un paiement retiré de la liste ne compte plus dans ce qui reste à encaisser', () => {
  const { chiffre } = require('../club/regles.js');
  const achat = off => ({ id: 'h', t: 'pack', d: '2026-10-01', n: 3, prix: 90, pay: Object.assign({ ech: [{ s: 1, m: 90, ok: '' }] }, off ? { off: 1 } : {}) });
  const f = off => chiffre({ eleves: { a: { achats: [achat(off)] } }, seances: [], offres: { formules: [], packs: [], abos: [] }, from: '2026-10-01', to: '2026-10-31' }).aEncaisser;
  assert.equal(f(false), 90);
  assert.equal(f(true), 0);
});
