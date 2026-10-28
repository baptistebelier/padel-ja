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

test('confidentialité : cours particuliers, appels et tarifs ne vont qu’aux personnes concernées', async () => {
  const coach = { id: 'C2', name: 'Sarah Benali' }, eleve = { id: 'E2', name: 'Thomas Leroy' }, autre = { id: 'O2', name: 'Paul Martin' };
  const club = await ram.create(coach, { name: 'TC Privé', short: 'tcp' });
  const kC = club.key, kE = (await ram.join(eleve, club.code)).key, kO = (await ram.join(autre, club.code)).key;
  const season = item(await ram.sync(coach.id, club.id, 0), 'conf', 'main').season;
  await ram.ops(coach.id, club.id, [kE, kO].map(k => ({ coll: 'member', id: k, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }] })));
  await ram.ops(coach.id, club.id, [{ coll: 'member', id: 'kid2', op: 'put', data: { n: 'Léo Leroy', parent: kE } }]);
  const r = await ram.ops(coach.id, club.id, [
    { coll: 'group', id: 'gp', op: 'put', data: { type: 'train', name: 'Cours individuel', coach: kC, once: '2026-11-03', mem: ['kid2'], ext: [], goal: 'Bandeja', tarif: { mode: 'seance', prix: 35 }, cal: 'https://api.calendly.com/x' } },
    { coll: 'group', id: 'gg', op: 'put', data: { type: 'train', name: 'Groupe du mardi', coach: kC, day: 2, h: '18:00', mem: [kE], ext: [], tarif: { mode: 'seance', prix: 70 } } },
    { coll: 'seance', id: 'gg.2026-11-03', op: 'put', data: { g: 'gg', d: '2026-11-03', pres: { [kE]: 'P' } } },
    { coll: 'seance', id: 'gp.2026-11-03', op: 'put', data: { g: 'gp', d: '2026-11-03', pres: { kid2: 'P' } } }
  ]);
  assert.deepEqual(r.rejected, []);
  // un autre adhérent : voit le groupe du mardi (agenda, discussion), sans son tarif ; rien du cours particulier ni des appels
  const sO = await ram.sync(autre.id, club.id, 0);
  assert.equal(item(sO, 'group', 'gp'), undefined, 'cours particulier invisible');
  assert.equal(item(sO, 'group', 'gg').name, 'Groupe du mardi');
  assert.equal(item(sO, 'group', 'gg').tarif, undefined, 'tarif réservé à l’équipe');
  assert.equal(has(sO, 'seance'), false, 'appels invisibles');
  // l'élève (parent de kid2) : le cours de son enfant, l'appel de son groupe et celui de son enfant, sans tarif ni lien Calendly
  const sE = await ram.sync(eleve.id, club.id, 0);
  assert.equal(item(sE, 'group', 'gp').goal, 'Bandeja');
  assert.equal(item(sE, 'group', 'gp').tarif, undefined);
  assert.equal(item(sE, 'group', 'gp').cal, undefined);
  assert.deepEqual(sE.items.filter(i => i.coll === 'seance').map(i => i.id).sort(), ['gg.2026-11-03', 'gp.2026-11-03']);
  // l'enseignant : tout, tarifs compris
  const sC = await ram.sync(coach.id, club.id, 0);
  assert.equal(item(sC, 'group', 'gp').tarif.prix, 35);
  // l'élève modifie sa présence dans son groupe : le tarif, qu'il ne voit pas, reste intact
  await ram.ops(eleve.id, club.id, [{ coll: 'group', id: 'gg', op: 'patch', patch: [{ p: ['mem'], t: 'rm', v: kE }] }]);
  assert.equal(item(await ram.sync(coach.id, club.id, 0), 'group', 'gg').tarif.prix, 70);
});
