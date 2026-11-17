/* Un cycle individuel (pack d'un seul élève) n'a plus de groupe : la migration range ses séances en cours particuliers
   rattachés à l'achat, sans rien perdre (séances, présences, heures, achat, paiements, décompte). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-cyc-ind-'));
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const { createRamClub } = require('../lib/ramclub');
const ram = createRamClub(DIR);
if (saved.url) process.env.SUPABASE_URL = saved.url;
if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;
const { cyclesIndividuelsSansGroupe, run } = require('../lib/migrations');
const R = require('../club/regles.js');

const item = (s, coll, id) => (s.items.find(i => i.coll === coll && i.id === id && !i.del) || {}).data;
const iso = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

test('cycle individuel : migration sans perte vers des cours rattachés à l’achat, décompte identique', async () => {
  const coach = { id: 'CI', name: 'Sarah Benali' }, eleve = { id: 'EI', name: 'Thomas Leroy' }, autre = { id: 'OI', name: 'Paul Martin' };
  const club = await ram.create(coach, { name: 'TC Individuel', short: 'tci' });
  const kC = club.key, kE = (await ram.join(eleve, club.code)).key, kO = (await ram.join(autre, club.code)).key;
  const d1 = iso(-20), d2 = iso(-10), d3 = iso(10), d4 = iso(-5);
  const pay = { ech: [{ s: 0, m: 150, ok: d1 }, { s: 5, m: 150, ok: '' }], moyen: 'Virement' };
  await ram.ops(coach.id, club.id, [
    // le groupe créé automatiquement pour le pack individuel de Thomas : un cycle de 10 séances, 3 datées
    { coll: 'group', id: 'gind', op: 'put', data: { type: 'train', name: 'Pack 10 · Thomas', libre: 1, coach: kC, sport: 'Padel', day: 1, h: '18 h', dur: '45 min', defLoc: 'En salle', mem: [kE], ext: [],
      extra: [d1, d2, d3], hr: { [d2]: '19 h 30' }, cancel: [d3], att: { [d1]: { [kE]: true } },
      cycles: [{ id: 'c1', nom: 'Pack 10', n: 10, dates: [d1, d2, d3] }], at: 1700000000000 } },
    { coll: 'eleve', id: kE, op: 'put', data: { n: 'Thomas Leroy', achats: [{ id: 'a1', t: 'pack', ref: 'p10', nom: 'Pack 10', d: d1, n: 10, prix: 300, cycle: 'gind:c1', groupe: 'gind', pay }] } },
    { coll: 'seance', id: 'gind.' + d1, op: 'put', data: { g: 'gind', d: d1, pres: { [kE]: 'P' }, recap: 'Bon service' } },
    { coll: 'seance', id: 'gind.' + d2, op: 'put', data: { g: 'gind', d: d2, pres: { [kE]: 'P' } } },
    // à laisser tel quel : un groupe sans créneau à deux élèves ; un cycle individuel dont une séance sans date a déjà son thème
    { coll: 'group', id: 'gduo', op: 'put', data: { type: 'train', name: 'Duo libre', libre: 1, coach: kC, mem: [kE, kO], ext: [], cycles: [{ id: 'c1', n: 5, dates: [] }] } },
    { coll: 'group', id: 'gthm', op: 'put', data: { type: 'train', name: 'Pack thème', libre: 1, coach: kC, mem: [kO], ext: [], cycles: [{ id: 'c9', n: 4, dates: [], aplan: [{ theme: 'Volée' }] }] } },
    { coll: 'eleve', id: kO, op: 'put', data: { n: 'Paul Martin', achats: [{ id: 'a9', t: 'pack', ref: 'p4', d: d1, n: 4, cycle: 'gthm:c9', groupe: 'gthm' }] } }
  ]);
  const OFFRES = { formules: [{ id: 'f1', joueurs: 1, duree: 60 }], packs: [{ id: 'p10', formule: 'f1', seances: 10 }, { id: 'p4', formule: 'f1', seances: 4 }] };

  const settings = {}, store = { getSetting: async k => settings[k], saveSetting: async (k, v) => { settings[k] = v; } };
  const logs = [];
  await run(store, [['cycles', () => cyclesIndividuelsSansGroupe(ram, m => logs.push(m))]]);
  await run(store, [['cycles', () => { throw new Error('ne doit pas repasser'); }]]);
  const s = await ram.sync(coach.id, club.id, 0);

  // le groupe individuel a disparu, un cours par date, rattaché à l'achat
  assert.equal(item(s, 'group', 'gind'), undefined);
  for (const d of [d1, d2, d3]) {
    const c = item(s, 'cours', 'gind_' + d);
    assert.ok(c, 'cours du ' + d);
    assert.equal(c.once, d); assert.equal(c.achat, 'a1'); assert.equal(c.couvert, 'pack'); assert.equal(c.tarif.prix, 0);
    assert.deepEqual(c.mem, [kE]);
  }
  assert.equal(item(s, 'cours', 'gind_' + d2).h, '19 h 30', 'l’heure du jour suit');
  assert.equal(item(s, 'cours', 'gind_' + d1).h, '18 h');
  assert.deepEqual(item(s, 'cours', 'gind_' + d3).cancel, [d3], 'la séance annulée reste annulée');
  assert.deepEqual(item(s, 'cours', 'gind_' + d1).att, { [d1]: { [kE]: true } }, 'l’appel du Club suit');
  // séances et présences conservées sous le nouvel identifiant, anciennes retirées
  assert.equal(item(s, 'seance', 'gind.' + d1), undefined);
  const s1 = item(s, 'seance', 'gind_' + d1 + '.' + d1);
  assert.equal(s1.g, 'gind_' + d1); assert.equal(s1.pres[kE], 'P'); assert.equal(s1.recap, 'Bon service');
  assert.equal(item(s, 'seance', 'gind_' + d2 + '.' + d2).pres[kE], 'P');
  // l'achat : plus de lien au groupe, prix et paiements intacts
  const a = item(s, 'eleve', kE).achats[0];
  assert.equal(a.cycle, undefined); assert.equal(a.groupe, undefined);
  assert.equal(a.prix, 300); assert.deepEqual(a.pay, pay); assert.equal(a.n, 10);
  // le décompte est le même qu'avant : 2 séances faites sur 10, y compris au format différent de la formule (45 min)
  const cours = Object.fromEntries(s.items.filter(i => i.coll === 'cours' && !i.del).map(i => [i.id, Object.assign({ id: i.id }, i.data)]));
  const seances = s.items.filter(i => i.coll === 'seance' && !i.del).map(i => i.data);
  const vs = R.venuesDe(kE, seances, Object.values(cours), iso(0));
  const cov = R.couverture(item(s, 'eleve', kE).achats, vs, OFFRES).achats[0];
  assert.equal(vs.length, 2); assert.equal(cov.used, 2);
  const dec = R.achatsDecomptables([cov], iso(0), R.progParAchat(Object.values(cours), iso(0)))[0];
  assert.equal(dec.restantes, 8); assert.equal(dec.programmees, 0, 'une séance annulée ou passée n’est pas « programmée »');
  // un autre achat ne prend pas les séances rattachées à celui-ci
  const deux = R.couverture([{ id: 'a0', t: 'pack', ref: 'p10', d: iso(-40), n: 10 }, item(s, 'eleve', kE).achats[0]], vs, OFFRES).achats;
  assert.equal(deux.find(x => x.id === 'a1').used, 2); assert.equal(deux.find(x => x.id === 'a0').used, 0);

  // laissés tels quels
  assert.equal(item(s, 'group', 'gduo').name, 'Duo libre');
  assert.equal(item(s, 'group', 'gthm').cycles[0].aplan[0].theme, 'Volée');
  assert.equal(item(s, 'eleve', kO).achats[0].cycle, 'gthm:c9');
  assert.equal(logs.length, 1); assert.match(logs[0], /1 cycle individuel sorti/); assert.match(logs[0], /1 laissé/);
});
