/* Heure de fin prévue : enregistrée dans un modèle, rendue par l'application du modèle */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../public/js/engine.js');
const { demoTournament } = require('./helpers.js');

test('heure de fin prévue : mémorisée par le modèle et rendue à l’application', () => {
  const T = demoTournament({ fields: { startTime: '18:30', endTime: '23:30' } });
  const tpl = E.templateFromState(T, 'Vendredi soir');
  assert.equal(tpl.fields.endTime, '23:30');
  const U = E.initialState();
  assert.equal(U.tournament.endTime, '');
  E.reduce(U, { type: 'template/apply', payload: { template: tpl } });
  assert.equal(U.tournament.endTime, '23:30');
});
