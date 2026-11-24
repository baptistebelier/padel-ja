/* Programmation en agenda : un match posé à une heure ne commence pas avant, la programmation automatique efface l'heure */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../public/js/engine.js');
const { demoTournament } = require('./helpers.js');

test('heure posée sur l’agenda : arrondie à 5 min, respectée par les horaires, effacée par la programmation automatique', () => {
  const T = demoTournament({ fields: { dateStart: '2030-06-01', startTime: '09:00' } });
  if (!T.matches.some(m => m.court)) E.reduce(T, { type: 'schedule/auto' });
  const m = T.matches.find(x => x.court && !x.srcA && !x.srcB) || T.matches.find(x => x.court);
  const at = new Date('2030-06-01T15:32:00').getTime();
  E.reduce(T, { type: 'schedule/move', payload: { id: m.id, court: m.court, index: 99, at } });
  assert.equal(m.notBefore, new Date('2030-06-01T15:30:00').getTime(), 'arrondi au pas de 5 min');
  const tl = E.timeline(T);
  assert.ok(tl[m.id].start >= m.notBefore, 'ne commence pas avant l’heure posée');
  E.reduce(T, { type: 'schedule/move', payload: { id: m.id, court: m.court, index: 0, at: null } });
  assert.equal(m.notBefore, null, 'heure enlevée');
  E.reduce(T, { type: 'schedule/move', payload: { id: m.id, court: m.court, index: 0, at } });
  E.reduce(T, { type: 'schedule/move', payload: { id: m.id, court: null } });
  assert.equal(m.notBefore, null, 'retiré de l’agenda : plus d’heure');
  E.reduce(T, { type: 'schedule/move', payload: { id: m.id, court: T.courts[0].id, index: 0, at } });
  E.reduce(T, { type: 'schedule/auto' });
  assert.ok(T.matches.every(x => !x.notBefore), 'programmation automatique : heures effacées');
});
