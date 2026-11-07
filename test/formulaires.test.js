/* Formulaires du club : qui les crée, qui répond, qui lit les réponses, anonymat, clôture */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRamClub } = require('../lib/ramclub');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ramform-'));
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const ram = createRamClub(DIR);
if (saved.url) process.env.SUPABASE_URL = saved.url;
if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;

const U = n => ({ id: 'F-' + n, name: n + ' Essai', email: n + '@exemple.test' });
const bureau = U('bureau'), coach = U('coach'), comm = U('comm'), adh = U('adh'), autre = U('autre');
let club, k = {};
const items = (s, coll) => s.items.filter(i => i.coll === coll);
const refus = r => r.rejected.length;
const QS = [{ id: 'q1', t: 'unique', q: 'Présent ?', o: ['Oui', 'Non'], req: true }, { id: 'q2', t: 'long', q: 'Remarques' }];

test('mise en place : bureau, enseignant, membre de commission, deux adhérents', async () => {
  club = await ram.create(bureau, { name: 'TC Formulaires', short: 'tcf' });
  k.b = club.key;
  for (const [n, u] of [['c', coach], ['m', comm], ['a', adh], ['o', autre]]) k[n] = (await ram.join(u, club.code)).key;
  const season = (items(await ram.sync(bureau.id, club.id, 0), 'conf')[0] || {}).data.season;
  await ram.ops(bureau.id, club.id, [k.c, k.m, k.a, k.o].map(x => ({ coll: 'member', id: x, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }] })).concat([{ coll: 'comm', id: 'cm1', op: 'put', data: { name: 'Fêtes', resp: k.b, mem: [k.b, k.m], req: [] } }]));
  await ram.setRole(bureau.id, club.id, k.c, 'coach');
});

test('créer : enseignant et membre de commission oui, simple adhérent non', async () => {
  assert.equal(refus(await ram.ops(coach.id, club.id, [{ coll: 'form', id: 'f1', op: 'put', data: { by: k.c, title: 'Stage de Noël', qs: QS } }])), 0);
  assert.equal(refus(await ram.ops(comm.id, club.id, [{ coll: 'form', id: 'f2', op: 'put', data: { by: k.m, title: 'Soirée', qs: QS, anon: true } }])), 0);
  assert.equal(refus(await ram.ops(adh.id, club.id, [{ coll: 'form', id: 'f3', op: 'put', data: { by: k.a, title: 'Pirate', qs: QS } }])), 1);
  assert.equal(refus(await ram.ops(coach.id, club.id, [{ coll: 'form', id: 'f4', op: 'put', data: { by: k.c, title: 'Vide', qs: [] } }])), 1, 'au moins une question');
});

test('répondre : une réponse par adhérent, à son nom, modifiable', async () => {
  assert.equal(refus(await ram.ops(adh.id, club.id, [{ coll: 'rep', id: 'f1.' + k.a, op: 'put', data: { f: 'f1', by: k.a, a: { q1: 'Oui', q2: 'Avec mon fils', zz: 'ignoré' } } }])), 0);
  assert.equal(refus(await ram.ops(adh.id, club.id, [{ coll: 'rep', id: 'f1.' + k.o, op: 'put', data: { f: 'f1', by: k.o, a: { q1: 'Non' } } }])), 1, 'pas au nom d’un autre');
  assert.equal(refus(await ram.ops(adh.id, club.id, [{ coll: 'rep', id: 'f1.x', op: 'put', data: { f: 'f1', by: k.a, a: { q1: 'Oui' } } }])), 1, 'identifiant imposé');
  assert.equal(refus(await ram.ops(adh.id, club.id, [{ coll: 'rep', id: 'f1.' + k.a, op: 'patch', patch: [{ p: ['a', 'q1'], t: 'set', v: 'Non' }] }])), 0, 'il change d’avis');
  await ram.ops(autre.id, club.id, [{ coll: 'rep', id: 'f1.' + k.o, op: 'put', data: { f: 'f1', by: k.o, a: { q1: 'Oui' } } }]);
});

test('lire les réponses : l’auteur et le bureau voient tout, chacun ne voit que la sienne', async () => {
  const deCoach = items(await ram.sync(coach.id, club.id, 0), 'rep');
  assert.equal(deCoach.length, 2);
  const a = deCoach.find(i => i.id === 'f1.' + k.a).data;
  assert.equal(a.a.q1, 'Non');
  assert.equal(a.a.zz, undefined, 'question inconnue retirée');
  assert.equal(items(await ram.sync(bureau.id, club.id, 0), 'rep').length, 2);
  const deAutre = items(await ram.sync(autre.id, club.id, 0), 'rep');
  assert.deepEqual(deAutre.map(i => i.id), ['f1.' + k.o]);
  assert.equal(items(await ram.sync(comm.id, club.id, 0), 'rep').length, 0, 'pas l’auteur de ce formulaire');
});

test('formulaire anonyme : l’auteur lit la réponse sans savoir qui l’a donnée', async () => {
  await ram.ops(adh.id, club.id, [{ coll: 'rep', id: 'f2.' + k.a, op: 'put', data: { f: 'f2', by: k.a, a: { q1: 'Oui' } } }]);
  const r = items(await ram.sync(comm.id, club.id, 0), 'rep').find(i => i.id.startsWith('f2.'));
  assert.equal(r.data.a.q1, 'Oui');
  assert.equal(r.data.by, undefined);
  const mien = items(await ram.sync(adh.id, club.id, 0), 'rep').find(i => i.id === 'f2.' + k.a);
  assert.equal(mien.data.by, k.a, 'sa propre réponse garde son nom');
});

test('clôture : plus de réponse après la date ou une fois clos ; seul l’auteur ou le bureau le modifie', async () => {
  assert.equal(refus(await ram.ops(adh.id, club.id, [{ coll: 'form', id: 'f1', op: 'patch', patch: [{ p: ['clos'], t: 'set', v: true }] }])), 1);
  assert.equal(refus(await ram.ops(coach.id, club.id, [{ coll: 'form', id: 'f1', op: 'patch', patch: [{ p: ['clos'], t: 'set', v: true }] }])), 0);
  assert.equal(refus(await ram.ops(comm.id, club.id, [{ coll: 'rep', id: 'f1.' + k.m, op: 'put', data: { f: 'f1', by: k.m, a: { q1: 'Oui' } } }])), 1, 'clos');
  await ram.ops(coach.id, club.id, [{ coll: 'form', id: 'f5', op: 'put', data: { by: k.c, title: 'Ancien', qs: QS, fin: '2020-01-01' } }]);
  assert.equal(refus(await ram.ops(adh.id, club.id, [{ coll: 'rep', id: 'f5.' + k.a, op: 'put', data: { f: 'f5', by: k.a, a: { q1: 'Oui' } } }])), 1, 'date passée');
});

test('formulaire réservé à une commission : seuls ses membres répondent', async () => {
  await ram.ops(comm.id, club.id, [{ coll: 'form', id: 'f6', op: 'put', data: { by: k.m, title: 'Bénévoles', qs: QS, cible: 'comm:cm1' } }]);
  assert.equal(refus(await ram.ops(adh.id, club.id, [{ coll: 'rep', id: 'f6.' + k.a, op: 'put', data: { f: 'f6', by: k.a, a: { q1: 'Oui' } } }])), 1);
  assert.equal(refus(await ram.ops(bureau.id, club.id, [{ coll: 'rep', id: 'f6.' + k.b, op: 'put', data: { f: 'f6', by: k.b, a: { q1: 'Oui' } } }])), 0);
});
