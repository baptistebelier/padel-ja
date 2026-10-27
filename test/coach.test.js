/* /RAM Coach : fiches élèves, séances et suivi rangés dans l'espace du club.
   Les fiches restent à l'équipe pédagogique ; le suivi d'un élève n'est lu que par lui, ses parents
   et ses enseignants ; seul l'enseignant ouvre la conversation, l'élève répond ensuite. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-coach-'));
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const { createRamClub } = require('../lib/ramclub');
const ram = createRamClub(DIR);
if (saved.url) process.env.SUPABASE_URL = saved.url;
if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;

const item = (s, coll, id) => (s.items.find(i => i.coll === coll && i.id === id) || {}).data;
const has = (s, coll) => s.items.some(i => i.coll === coll && !i.del);

test('suivi /RAM Coach : enseignant, élève, parent et autres adhérents', async () => {
  const coach = { id: 'C', name: 'Sarah Benali' }, eleve = { id: 'E', name: 'Thomas Leroy' }, autre = { id: 'O', name: 'Paul Martin' };
  const club = await ram.create(coach, { name: 'TC Coach', short: 'tcc' });
  const kC = club.key, kE = (await ram.join(eleve, club.code)).key, kO = (await ram.join(autre, club.code)).key;
  const season = item(await ram.sync(coach.id, club.id, 0), 'conf', 'main').season;
  await ram.ops(coach.id, club.id, [kE, kO].map(k => ({ coll: 'member', id: k, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }] })));
  await ram.ops(coach.id, club.id, [{ coll: 'member', id: 'kid1', op: 'put', data: { n: 'Léo Leroy', parent: kE } }]);

  // l'élève ne commence pas la conversation
  let r = await ram.ops(eleve.id, club.id, [{ coll: 'suivi', id: 's0', op: 'put', data: { to: kE, by: kE, k: 'msg', txt: 'Bonjour' } }]);
  assert.match(r.rejected[0].error, /enseignant/);
  // l'enseignant tient la fiche, la séance et écrit à l'élève et à son enfant
  r = await ram.ops(coach.id, club.id, [
    { coll: 'eleve', id: kE, op: 'put', data: { n: 'Thomas Leroy', lvl: 4, note: 'épaule fragile' } },
    { coll: 'seance', id: 'g1.2026-11-02', op: 'put', data: { g: 'g1', d: '2026-11-02', theme: 'Bandeja', pres: { [kE]: 'P' }, recap: 'Bonne séance' } },
    { coll: 'suivi', id: 's1', op: 'put', data: { to: kE, by: kC, k: 'bilan', ses: 'g1.2026-11-02', txt: 'Bravo' } },
    { coll: 'suivi', id: 's2', op: 'put', data: { to: 'kid1', by: kC, k: 'msg', txt: 'Pense à ta raquette' } }
  ]);
  assert.deepEqual(r.rejected, []);
  // l'élève répond (texte, vidéo) ; il n'écrit ni au nom d'un autre, ni de bilan, ni dans une fiche
  r = await ram.ops(eleve.id, club.id, [
    { coll: 'suivi', id: 's3', op: 'put', data: { to: kE, by: kE, k: 'msg', txt: 'Merci !' } },
    { coll: 'suivi', id: 's4', op: 'put', data: { to: kE, by: kE, k: 'video', url: 'https://youtu.be/x', txt: 'Ma bandeja ?' } },
    { coll: 'suivi', id: 's5', op: 'put', data: { to: 'kid1', by: kE, k: 'msg', txt: 'Il l’aura (parent)' } }
  ]);
  assert.deepEqual(r.rejected, []);
  r = await ram.ops(eleve.id, club.id, [
    { coll: 'suivi', id: 's6', op: 'put', data: { to: kO, by: kE, k: 'msg', txt: 'Salut' } },
    { coll: 'suivi', id: 's7', op: 'put', data: { to: kE, by: kE, k: 'bilan', txt: 'Je me note 10' } },
    { coll: 'eleve', id: kE, op: 'patch', patch: [{ p: ['lvl'], t: 'set', v: 8 }] },
    { coll: 'suivi', id: 's1', op: 'patch', patch: [{ p: ['txt'], t: 'set', v: 'modifié' }] }
  ]);
  assert.equal(r.rejected.length, 4, JSON.stringify(r.rejected));

  // lecture : l'élève voit son suivi et celui de son enfant, la séance, mais pas les fiches
  const sE = await ram.sync(eleve.id, club.id, 0);
  assert.deepEqual(sE.items.filter(i => i.coll === 'suivi').map(i => i.id).sort(), ['s1', 's2', 's3', 's4', 's5']);
  assert.equal(has(sE, 'eleve'), false, 'fiche privée');
  assert.equal(item(sE, 'seance', 'g1.2026-11-02').recap, 'Bonne séance');
  // un autre adhérent ne voit rien du suivi
  const sO = await ram.sync(autre.id, club.id, 0);
  assert.equal(has(sO, 'suivi'), false);
  assert.equal(has(sO, 'eleve'), false);
  // l'enseignant voit tout
  const sC = await ram.sync(coach.id, club.id, 0);
  assert.equal(item(sC, 'eleve', kE).note, 'épaule fragile');
  assert.equal(sC.items.filter(i => i.coll === 'suivi').length, 5);
});
