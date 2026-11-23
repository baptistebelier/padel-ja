/* Formules, packs et variantes masqués sur la page publique de réservation */
const test = require('node:test');
const assert = require('node:assert/strict');
const Formules = require('../lib/formules');

test('masque : gardé seulement s’il vaut vrai, sur les formules, les packs et les variantes', () => {
  const o = Formules.clean({
    formules: [{ id: 'f1', nom: 'Cours', joueurs: 1, duree: 60, prix: 35, masque: true }, { id: 'f2', nom: 'Duo', joueurs: 2, duree: 60, prix: 30, masque: 'oui' }],
    packs: [{ id: 'p1', formule: 'f1', seances: 5, prix: 150, masque: true }],
    abos: [{ id: 'a1', nom: '6 mois', ens: 'Academy', formule: 'f1', prix: 99, masque: true }, { id: 'a2', nom: '12 mois', ens: 'Academy', formule: 'f1', prix: 89, masque: false }]
  });
  assert.equal(o.formules[0].masque, true);
  assert.equal('masque' in o.formules[1], false);
  assert.equal(o.packs[0].masque, true);
  assert.deepEqual(o.abos.map(a => !!a.masque), [true, false]);
});
