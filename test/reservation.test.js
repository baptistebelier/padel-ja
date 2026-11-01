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
const envois = [], taches = { faites: [], handlers: {}, enqueue(kind, p, o) { this.faites.push({ kind, p, o }); }, on(k, fn) { this.handlers[k] = fn; } };
let horloge = null;
const resa = createReservation({ ram, store, coachTables, Formules, taches, push: { sendMany: async (uids, msg) => { envois.push({ uids, msg }); } }, now: () => horloge || new Date() });

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
  assert.ok(!JSON.stringify(r.jours).includes(ka), 'aucun élève nommé');
  assert.deepEqual(r.mes.map(x => x.id), [ok.id], 'seulement ses cours à lui');
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

/* ---------- annuler, enfant, liste d'attente, rappels, collectifs ---------- */
const pause = () => new Promise(r => setTimeout(r, 30));

test('annuler : jusqu’à 24 h avant, seulement son cours, et la plage redevient libre', async () => {
  const { coach, club, key, d, a, b } = await monte(10);
  const r = await resa.reserver(a, club.id, key, { d, t: 540, formule: 'f1', objectif: 'Volée' });
  await assert.rejects(resa.annuler(b, club.id, r.id), /validée/);
  horloge = new Date(d + 'T06:00:00Z');
  try { await assert.rejects(resa.annuler(a, club.id, r.id), /24 h/); } finally { horloge = null; }
  await resa.annuler(a, club.id, r.id);
  assert.deepEqual((await resa.creneaux(a, club.id, key, d)).jours[0].libres, [{ du: 540, au: 720, lieu: 'Club' }]);
  assert.equal((await coachTables.planning(coach, d, d)).seances[0].annule, true, 'reste affiché annulé au planning');
  assert.deepEqual(await resa.mes(a, club.id), []);
});

test('réserver pour son enfant : pour lui seulement, le cours est à l’enfant', async () => {
  const { coach, club, key, d, a, ka } = await monte(11);
  await ram.ops(coach, club.id, [{ coll: 'member', id: 'kid11', op: 'put', data: { n: 'Léo', parent: ka, valid: 'S', role: 'Jeune' } }]);
  await assert.rejects(resa.reserver(a, club.id, key, { d, t: 540, formule: 'f1', objectif: 'Volée', pour: key }), /enfant/);
  const r = await resa.reserver(a, club.id, key, { d, t: 540, formule: 'f1', objectif: 'Volée', pour: 'kid11' });
  assert.deepEqual((await coachTables.planning(coach, d, d)).seances[0].eleves, ['kid11']);
  assert.equal((await resa.mes(a, club.id))[0].pour, 'kid11');
  await resa.annuler(a, club.id, r.id);
});

test('liste d’attente : alerte quand la plage se libère, une seule fois, invisible des appareils', async () => {
  const { coach, club, key, d, a } = await monte(12);
  const c = 'V12';
  await ram.join({ id: c, name: 'Élève V' }, club.code);
  const kc = (await ram.myClubs(c)).find(x => x.id === club.id).key;
  await ram.ops(coach, club.id, [{ coll: 'member', id: kc, op: 'put', data: { n: 'Élève V', valid: 'S' } }]);
  const r = await resa.reserver(a, club.id, key, { d, t: 540, formule: 'f1', objectif: 'Volée' });
  assert.deepEqual(await resa.attendre(c, club.id, key, { d, du: 540, au: 600 }), { attente: true });
  assert.deepEqual((await resa.creneaux(c, club.id, key, d)).attente, [{ d, du: 540, au: 600 }]);
  for (const u of [c, coach]) assert.ok(!(await ram.sync(u, club.id, 0)).items.some(i => i.coll === 'attente'), 'jamais envoyée');
  envois.length = 0;
  await resa.annuler(a, club.id, r.id);
  await pause();
  const m = envois.filter(e => e.msg.tag.includes('attente'));
  assert.equal(m.length, 1);
  assert.deepEqual(m[0].uids, [c]);
  assert.match(m[0].msg.url, new RegExp('#/resa/' + key));
  assert.deepEqual((await resa.creneaux(c, club.id, key, d)).attente, [], 'l’alerte est partie : plus sur la liste');
  assert.deepEqual(await resa.attendre(c, club.id, key, { d, du: 540, au: 600 }), { attente: true });
  assert.deepEqual(await resa.attendre(c, club.id, key, { d, du: 540, au: 600 }), { attente: false }, 'le second appui l’en retire');
});

test('rappels : la veille et 2 h avant ; rien ne part si le cours est annulé', async () => {
  const { club, key, d, a } = await monte(13);
  taches.faites.length = 0;
  const r = await resa.reserver(a, club.id, key, { d, t: 570, formule: 'f1', objectif: 'Volée' });
  const l = taches.faites.filter(x => x.kind === 'resa-rappel');
  assert.deepEqual(l.map(x => x.p.quand), ['veille', '2h']);
  assert.ok(l[0].o.at < l[1].o.at);
  const heure = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date(l[1].o.at));
  assert.equal(heure, '07:30', '2 h avant 9 h 30, à l’heure de Paris');
  envois.length = 0;
  await taches.handlers['resa-rappel'](l[0].p);
  assert.equal(envois.length, 1);
  assert.match(envois[0].msg.body, /demain à 9 h 30/);
  await resa.annuler(a, club.id, r.id);
  envois.length = 0;
  await taches.handlers['resa-rappel'](l[1].p);
  assert.equal(envois.length, 0);
});

test('collectif : rien tant que le minimum n’est pas atteint, puis le cours suit les inscrits jusqu’au maximum', async () => {
  const { coach, club, key, d } = await monte(14);
  const post = ins => ({ by: key, kind: 'niveaux', at: Date.now(), nv: { mode: 'cours', sport: 'Padel', theme: 'Volée', time: '18 h', dur: '1 h 30', price: '15 €', dates: [d], tiers: [{ id: 't1', nom: 'Débutants', lo: 1, hi: 3, places: 2, max: 3 }, { id: 't2', lo: 4, hi: 6, places: 2 }], ins: { [d + '|t1']: ins, [d + '|t2']: ['z1'] }, at: {} } });
  const pose = async ins => { await ram.ops(coach, club.id, [{ coll: 'post', id: 'pc', op: 'put', data: post(ins) }]); await pause(); await pause(); };
  const seance = async () => (await coachTables.planning(coach, d, d)).seances[0];
  await pose(['a1']);
  assert.equal(await seance(), undefined, 'en attente : ni au planning, ni bloquant');
  await pose(['a1', 'a2']);
  let s = await seance();
  assert.deepEqual(s.eleves, ['a1', 'a2']);
  assert.equal(s.nom, 'Volée');
  assert.equal(s.tarif.prix, 15);
  await pose(['a1', 'a2', 'a3', 'a4']);
  assert.deepEqual((await seance()).eleves, ['a1', 'a2', 'a3'], 'le maximum');
  await pose(['a1']);
  assert.equal((await seance()).annule, true, 'sous le minimum : le cours saute');
  await pose(['a1', 'a5']);
  s = await seance();
  assert.equal(s.annule, false, 'de nouveau atteint : il revient');
  assert.deepEqual(s.eleves, ['a1', 'a5']);
});

test('fourchette : la première au minimum gagne, le maximum est lu partout', () => {
  const { nvValidated, nvValidatedOn } = require('../lib/ram-score');
  const nv = { dates: ['2030-01-01'], tiers: [{ id: 'a', places: 2, max: 3 }, { id: 'b', places: 1 }], ins: { '2030-01-01|a': ['x', 'y', 'z', 'w'], '2030-01-01|b': ['q'] }, at: { x: { '2030-01-01': 1 }, y: { '2030-01-01': 2 }, z: { '2030-01-01': 3 }, w: { '2030-01-01': 4 }, q: { '2030-01-01': 9 } } };
  assert.deepEqual(nvValidatedOn(nv, '2030-01-01'), ['x', 'y', 'z']);
  assert.deepEqual(nvValidated(nv), ['x', 'y', 'z']);
  assert.deepEqual(nvValidatedOn(nv, '2031-01-01'), []);
});
