/* Réservation depuis /RAM Club : ce qui est libre, sans aucun nom ; un cours confirmé tout de suite ; pas de doublon */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-resa-'));
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const { createRamClub } = require('../lib/ramclub');
const { createCoachTables } = require('../lib/coach-tables');
const { createReservation, paris } = require('../lib/reservation');
const Formules = require('../lib/formules.js');
const REGLES = require('../club/regles.js');
const ram = createRamClub(DIR), coachTables = createCoachTables({ ram });
if (saved.url) process.env.SUPABASE_URL = saved.url;
if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;
const settings = {};
const store = { getCoachSetting: async (u, k) => (settings[u] || {})[k] || null, saveCoachSetting: async (u, k, v) => { (settings[u] = settings[u] || {})[k] = v; }, getAccount: async () => null };
const resa = createReservation({ ram, store, coachTables, Formules });

async function monte(n) {
  const coach = 'C' + n, club = await ram.create({ id: coach, name: 'Sarah Benali' }, { name: 'Club ' + n });
  const key = (await ram.myClubs(coach)).find(c => c.id === club.id).key, keys = {};
  await ram.ops(coach, club.id, [{ coll: 'conf', id: 'main', op: 'put', data: { name: 'Club ' + n, season: 'S' } }]);
  for (const id of ['A' + n, 'B' + n]) {
    await ram.join({ id, name: 'Élève ' + id }, club.code);
    keys[id] = (await ram.myClubs(id)).find(c => c.id === club.id).key;
    if (id[0] === 'A') await ram.ops(coach, club.id, [{ coll: 'member', id: keys[id], op: 'put', data: { n: 'Élève ' + id, valid: 'S' } }]);
  }
  const d = REGLES.addDays(paris().d, 7);
  await Formules.save(store, coach, {
    formules: [{ id: 'f1', nom: 'Cours individuel', sport: 'Padel', joueurs: 1, duree: 60, prix: 35 }, { id: 'f3', nom: 'Duo', sport: 'Padel', joueurs: 2, duree: 60, prix: 30 }],
    dispos: [{ jour: REGLES.dowOf(d), du: '09:00', au: '12:00', lieu: 'Club' }]
  });
  return { coach, club, key, d, a: 'A' + n, b: 'B' + n, ka: keys['A' + n] };
}

test('créneaux : les plages libres, les formules individuelles, les cours pris sans aucun nom', async () => {
  const { club, key, d, a } = await monte(1);
  const r = await resa.creneaux(a, club.id, key, d);
  assert.equal(r.ouvert, true);
  assert.deepEqual(r.formules.map(f => f.id), ['f1'], 'pas encore de collectif');
  assert.deepEqual(r.jours[0].libres, [{ du: 540, au: 720, lieu: 'Club' }]);
  assert.equal(r.jours.length, 7);
});

test('adhésion non validée, ou réserver avec soi-même : refusé', async () => {
  const { club, key, d, b, coach } = await monte(2);
  await assert.rejects(resa.creneaux(b, club.id, key, d), /validée/);
  await assert.rejects(resa.reserver(coach, club.id, key, { d, t: 540, formule: 'f1', objectif: 'Essai' }), /toi-même/);
});

test('réserver : confirmé tout de suite, à son planning, visible par l’élève ; la plage n’est plus libre', async () => {
  const { coach, club, key, d, a, ka } = await monte(3);
  await assert.rejects(resa.reserver(a, club.id, key, { d, t: 540, formule: 'f1', objectif: '' }), /objectif/);
  await assert.rejects(resa.reserver(a, club.id, key, { d, t: 540, formule: 'f3', objectif: 'Volée' }), /réservable/);
  await assert.rejects(resa.reserver(a, club.id, key, { d, t: 690, formule: 'f1', objectif: 'Volée' }), /pris/, 'dépasse la plage');
  const ok = await resa.reserver(a, club.id, key, { d, t: 570, formule: 'f1', objectif: 'Travailler la volée' });
  assert.equal(ok.h, '9 h 30');
  const planning = await coachTables.planning(coach, d, d);
  assert.equal(planning.seances.length, 1);
  assert.deepEqual(planning.seances[0].eleves, [ka]);
  assert.equal(planning.seances[0].minutes, 60);
  const moi = await ram.sync(a, club.id, 0), c = moi.items.find(i => i.coll === 'cours' && i.id === ok.id).data;
  assert.equal(c.once, d);
  assert.equal(c.tarif, undefined, 'le tarif reste à l’équipe');
  const r = await resa.creneaux(a, club.id, key, d);
  assert.deepEqual(r.jours[0].libres, [{ du: 540, au: 570, lieu: 'Club' }, { du: 630, au: 720, lieu: 'Club' }]);
  assert.deepEqual(r.jours[0].pris, [{ du: 570, au: 630 }]);
  assert.ok(!JSON.stringify(r).includes(ka), 'aucun élève nommé');
});

test('deux demandes en même temps : une seule passe', async () => {
  const { club, key, d, a } = await monte(4);
  const l = await Promise.allSettled([1, 2].map(() => resa.reserver(a, club.id, key, { d, t: 600, formule: 'f1', objectif: 'Bandeja' })));
  assert.equal(l.filter(x => x.status === 'fulfilled').length, 1);
  assert.match(l.find(x => x.status === 'rejected').reason.message, /pris/);
});

test('vacances de l’enseignant : plus rien de libre ; Mon espace : seulement mes enseignants', async () => {
  const { coach, club, key, d, a } = await monte(5);
  assert.deepEqual(await resa.enseignants(a, club.id), [], 'pas encore son enseignant');
  await resa.reserver(a, club.id, key, { d, t: 540, formule: 'f1', objectif: 'Service' });
  assert.deepEqual(await resa.enseignants(a, club.id), [key], 'un cours avec lui');
  await Formules.save(store, coach, Object.assign({}, await Formules.get(store, coach), { conges: [{ nom: 'Noël', du: d, au: d }] }));
  assert.deepEqual((await resa.creneaux(a, club.id, key, d)).jours[0].libres, []);
});
