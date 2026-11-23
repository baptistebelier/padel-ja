/* Vacances scolaires (zones A, B, C) lues dans les données ouvertes de l'Éducation nationale */
const test = require('node:test');
const assert = require('node:assert/strict');
const { lire, annees, periodes } = require('../lib/vacances-scolaires');

test('années scolaires : celle en cours et la suivante', () => {
  assert.deepEqual(annees(Date.parse('2026-11-23T12:00:00Z')), ['2026-2027', '2027-2028']);
  assert.deepEqual(annees(Date.parse('2027-03-01T12:00:00Z')), ['2026-2027', '2027-2028']);
});

test('lecture : jours de Paris, la reprise devient la veille, une période par nom, sans les ponts', () => {
  const l = lire([
    { description: 'Vacances de Noël', start_date: '2026-12-18T23:00:00+00:00', end_date: '2027-01-03T23:00:00+00:00' },
    { description: 'Vacances de Noël', start_date: '2026-12-18T23:00:00+00:00', end_date: '2027-01-03T23:00:00+00:00' },
    { description: 'Vacances de la Toussaint', start_date: '2026-10-16T22:00:00+00:00', end_date: '2026-11-01T23:00:00+00:00' },
    { description: "Pont de l'Ascension", start_date: '2027-05-06T22:00:00+00:00', end_date: '2027-05-06T22:00:00+00:00' }
  ]);
  assert.deepEqual(l, [
    { nom: 'Vacances de la Toussaint', du: '2026-10-17', au: '2026-11-01' },
    { nom: 'Vacances de Noël', du: '2026-12-19', au: '2027-01-03' }
  ]);
});

test('lecture sur le site : les périodes passées sont laissées, le résultat est gardé en mémoire', async () => {
  let appels = 0;
  const get = async () => { appels++; return { ok: true, json: async () => ({ results: [
    { description: 'Vacances de la Toussaint', start_date: '2026-10-16T22:00:00+00:00', end_date: '2026-11-01T23:00:00+00:00' },
    { description: "Vacances d'Hiver", start_date: '2027-02-12T23:00:00+00:00', end_date: '2027-02-28T23:00:00+00:00' }
  ] }) }; };
  const now = Date.parse('2026-11-23T12:00:00Z');
  assert.deepEqual(await periodes('A', now, get), [{ nom: "Vacances d'Hiver", du: '2027-02-13', au: '2027-02-28' }]);
  await periodes('A', now + 1000, get);
  assert.equal(appels, 1);
});
