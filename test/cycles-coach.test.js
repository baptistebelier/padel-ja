/* /RAM Coach — modèle des cycles, des remplaçants et des attributions (club/regles.js) :
   enseignant effectif, séances à planifier, une seule source de présence, attribution qui suit le groupe,
   états En cours / Utilisé / Terminé */
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../club/regles.js');

const OFFRES = {
  formules: [
    { id: 'ind', nom: 'Individuel', joueurs: 1, duree: 60, prix: 35, par: 'seance' },
    { id: 'col', nom: 'Collectif', joueurs: 4, duree: 90, prix: 25, par: 'personne' }
  ],
  packs: [{ id: 'p3', formule: 'ind', seances: 3, prix: 99 }],
  abos: [{ id: 'ab', nom: 'Academy', formule: 'col', periode: 'mois', duree: 1, prix: 80 }]
};

test('enseignant d’une séance : remplaçant, puis cycle, puis groupe ; un changement ne touche pas le passé', () => {
  const g = { coach: 'sarah', cycles: [{ id: 'c1', dates: ['2030-01-07', '2030-01-14', '2030-01-21', '2030-01-28'] }] };
  assert.equal(R.coachDe(g, '2030-01-14'), 'sarah', 'par défaut : l’enseignant du groupe');
  assert.equal(R.coachDe(g, '2030-02-04'), 'sarah', 'hors cycle');
  // le 15 : le cycle passe à Paul ; une séance a un remplaçant
  assert.equal(R.changeCoach(g.cycles[0], 'paul', '2030-01-15'), true);
  assert.equal(R.coachDe(g, '2030-01-14'), 'sarah', 'séance passée : inchangée');
  assert.equal(R.coachDe(g, '2030-01-21'), 'paul', 'séance à venir du cycle');
  assert.equal(R.coachDe(g, '2030-01-28', { coach: 'lea' }), 'lea', 'le remplaçant reste prioritaire');
  assert.equal(R.coachDe(g, '2030-02-04'), 'sarah', 'hors cycle : le groupe');
  // le groupe passe à Marc le 22 : le passé reste à Sarah, le cycle garde Paul
  R.changeCoach(g, 'marc', '2030-01-22');
  assert.equal(R.coachDe(g, '2030-01-07'), 'sarah');
  assert.equal(R.coachDe(g, '2030-01-21'), 'paul');
  assert.equal(R.coachDe(g, '2030-02-04'), 'marc');
  // deux changements le même jour : le premier enseignant reste celui des séances passées
  const c = { coach: 'a' };
  R.changeCoach(c, 'b', '2030-01-01');
  R.changeCoach(c, 'c', '2030-01-01');
  assert.deepEqual(c.coachH, [{ au: '2030-01-01', coach: 'a' }]);
  assert.equal(R.changeCoach(c, 'c', '2030-01-02'), false, 'rien ne change');
  // un cycle qui suivait le groupe
  const k = { id: 'k', dates: ['2030-03-01', '2030-03-08'] }, g2 = { coach: 's', cycles: [k] };
  R.changeCoach(k, 'p', '2030-03-01');
  assert.equal(R.coachDe(g2, '2030-03-01'), 's');
  assert.equal(R.coachDe(g2, '2030-03-08'), 'p');
  assert.equal(R.coupureDe('2030-03-05', false), '2030-03-04');
  assert.equal(R.coupureDe('2030-03-05', true), '2030-03-05', 'appel du jour déjà fait : la séance du jour garde l’ancien');
});

test('séances à planifier : N par pack ou cycle, datées ou non, identifiants compatibles', () => {
  const g = { id: 'g1', cancel: ['2030-01-08'], cycles: [{ id: 'c1', n: 5, dates: ['2030-01-01', '2030-01-08', '2030-01-15'], aplan: [{ theme: 'Lob' }] }] };
  const l = R.aPlanifier(g, g.cycles[0]);
  assert.deepEqual(l.map(x => [x.k, x.rang]), [['p1-c1', 1], ['p2-c1', 2], ['p3-c1', 3]], 'une annulée ne compte pas');
  assert.equal(l[0].theme, 'Lob');
  assert.deepEqual(R.planDe('g1.p2-c1'), { g: 'g1', rang: 2, c: 'c1' });
  assert.equal(R.planDe('g1.2030-01-01'), null);
  assert.equal(R.aPlanifier({ cycles: [] }, { id: 'x', dates: ['2030-01-01'] }).length, 0, 'cycle sans nombre : rien à planifier');
  // un groupe sans créneau : seulement ses dates posées
  assert.equal(R.trainOn({ libre: 1, day: 3 }, '2030-01-02'), false);
  assert.equal(R.trainOn({ libre: 1, day: 3, extra: ['2030-01-02'] }, '2030-01-02'), true);
});

test('présence : l’appel de /RAM Club compte comme celui de /RAM Coach', () => {
  const g = { att: { '2030-01-01': { a: true, b: false, c: true } } };
  assert.deepEqual(R.presDe(null, g, '2030-01-01'), { a: 'P', b: 'A', c: 'P' });
  assert.deepEqual(R.presDe({ pres: { c: 'E' } }, g, '2030-01-01'), { a: 'P', b: 'A', c: 'E' }, 'l’appel Coach prime');
  assert.deepEqual(R.presents(null, g, '2030-01-01'), ['a', 'c']);
  const cy = { cycles: [{ id: 'c', dates: ['2030-01-01'] }], att: g.att };
  assert.equal(R.cycleEtat(cy, cy.cycles[0], () => null, '2030-01-05').faites, 1, 'la jauge du cycle compte l’appel du Club');
});

test('attribution d’un groupe : elle suit le groupe, l’arrivée et le départ de l’élève', () => {
  const v = (d, gid, cy, n = 4) => ({ d, min: 90, n, gid, cy });
  const venues = [v('2030-01-01', 'g1', 'c1'), v('2030-01-08', 'g1', 'c1'), v('2030-01-08', 'g2', null), v('2030-01-15', 'g1', 'c1'), v('2030-01-22', 'g1', 'c2')];
  // pack individuel d'une heure : ne couvre pas les séances du collectif ; le pack du cycle, si
  const achats = [{ id: 'a', t: 'pack', ref: 'p3', d: '2030-01-01', n: 3, prix: 99 }, { id: 'b', t: 'pack', ref: 'p3', d: '2030-01-05', n: 10, prix: 200, cycle: 'g1:c1', groupe: 'g1' }];
  let c = R.couverture(achats, venues, OFFRES);
  assert.deepEqual(c.achats.map(x => [x.id, x.used]), [['a', 0], ['b', 3]], 'le cycle compte ses séances, même avant la date d’achat');
  // arrivée le 8, départ le 9 : une seule séance
  c = R.couverture([Object.assign({}, achats[1], { du: '2030-01-08', sortie: '2030-01-09' })], venues, OFFRES);
  assert.equal(c.achats[0].used, 1);
  // attribution du groupe (sans cycle) : toutes ses séances
  c = R.couverture([{ id: 'x', t: 'pack', d: '2030-01-01', n: 10, groupe: 'g1' }], venues, OFFRES);
  assert.equal(c.achats[0].used, 4);
  // venue sans groupe connu (ancien calcul) : règle de la formule, comme avant
  c = R.couverture([{ id: 'y', t: 'pack', ref: 'p3', d: '2030-01-01', n: 3, cycle: 'g1:c1' }], [{ d: '2030-01-02', min: 60, n: 1 }], OFFRES);
  assert.equal(c.achats[0].used, 1);
  // chiffre : les séances d'un groupe connu (g.id) vont à l'achat rattaché
  const g1 = { id: 'g1', dur: '1 h 30', cycles: [{ id: 'c1', dates: ['2030-01-01'] }] };
  const r = R.chiffre({ eleves: { e: { achats: [achats[1]] } }, seances: [{ g: g1, d: '2030-01-01', n: 4, presents: ['e'] }], offres: OFFRES, from: '2030-01-01', to: '2030-01-31' });
  assert.equal(r.nonCouvertes, 0);
});

test('états d’une attribution : en cours, utilisé, terminé ; abonnement à fréquence notée', () => {
  const T = '2030-06-01', pk = x => Object.assign({ t: 'pack', n: 3, d: '2030-01-01' }, x);
  assert.equal(R.etatAchat(pk({ used: 2 }), T), 'encours');
  assert.equal(R.etatAchat(pk({ used: 3 }), T), 'termine', 'consommé, payé en une fois');
  assert.equal(R.etatAchat(pk({ used: 3, pay: { ech: [{ s: 1, m: 50, ok: '2030-01-01' }, { s: 3, m: 49, ok: '' }] } }), T), 'utilise');
  assert.equal(R.etatAchat(pk({ used: 3, pay: { off: 1, ech: [{ s: 3, m: 49, ok: '' }] } }), T), 'termine', 'retiré de la liste');
  assert.equal(R.etatAchat(pk({ used: 1, sortie: '2030-02-01', pay: { ech: [{ s: 1, m: 50, ok: 'x' }, { s: 3, m: 49, ok: '' }] } }), T), 'termine', 'parti : la séance 3 n’est plus attendue');
  // abonnement : 4 semaines à 1 séance par semaine = 4 séances
  const ab = { t: 'abo', d: '2030-05-01', fin: '2030-05-28', freq: 1 };
  assert.equal(R.seancesAbo(ab), 4);
  assert.equal(R.seancesAbo({ t: 'abo', d: '2030-05-01', fin: '2030-05-28' }), Infinity, 'sans fréquence notée : comme avant');
  assert.equal(R.etatAchat(Object.assign({ used: 2 }, ab), '2030-05-15'), 'encours');
  assert.equal(R.etatAchat(Object.assign({ used: 4 }, ab), '2030-05-20'), 'utilise', 'au bout de ses séances avant la fin');
  assert.equal(R.etatAchat(Object.assign({ used: 1 }, ab), '2030-06-01'), 'termine', 'date de fin dépassée');
  const vs = ['2030-05-02', '2030-05-09', '2030-05-16', '2030-05-23', '2030-05-25'].map(d => ({ d, min: 90, n: 4 }));
  assert.equal(R.couverture([Object.assign({ id: 'z', ref: 'ab' }, ab)], vs, OFFRES).achats[0].used, 4, 'au plus 4 séances');
  assert.equal(R.couverture([{ id: 'z', t: 'abo', ref: 'ab', d: '2030-05-01', fin: '2030-05-28' }], vs, OFFRES).achats[0].used, 5);
  // étiquette « Abonné »
  assert.equal(R.aboEnCours([ab, pk({})], '2030-05-10'), ab);
  assert.equal(R.aboEnCours([ab], '2030-06-10'), null);
  assert.equal(R.aboEnCours([Object.assign({ sortie: '2030-05-05' }, ab)], '2030-05-10'), null);
});
