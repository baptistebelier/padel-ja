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
const resa = createReservation({ ram, store, coachTables, Formules, taches, Mail: require('../lib/mail.js'), push: { sendMany: async (uids, msg) => { envois.push({ uids, msg }); } }, now: () => horloge || new Date() });

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
/* ce qui suit un changement part en arrière-plan : on attend le résultat (jusqu'à 5 s), quelle que soit la vitesse de la machine */
const attend = async f => { for (let i = 0; i < 250; i++) { const v = await f(); if (v) return v; await new Promise(r => setTimeout(r, 20)); } return f(); };

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
  await attend(() => envois.some(e => e.msg.tag.includes('attente')));
  const m = envois.filter(e => e.msg.tag.includes('attente'));
  assert.equal(m.length, 1);
  assert.deepEqual(m[0].uids, [c]);
  assert.match(m[0].msg.url, new RegExp('#/resa/' + key));
  assert.deepEqual(await attend(async () => { const l = (await resa.creneaux(c, club.id, key, d)).attente; return l.length ? null : l; }), [], 'l’alerte est partie : plus sur la liste');
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

test('rappels : un élève annoncé absent n’en reçoit pas ; un cours déplacé a ses nouveaux rappels', async () => {
  const { coach, club, key, d, a, ka } = await monte(30);
  taches.faites.length = 0;
  const r = await resa.reserver(a, club.id, key, { d, t: 570, formule: 'f1', objectif: 'Volée' });
  const l = taches.faites.filter(x => x.kind === 'resa-rappel');
  const rep = await ram.ops(a, club.id, [{ coll: 'cours', id: r.id, op: 'patch', patch: [{ p: ['resp', d, ka], t: 'set', v: 'no' }] }]);
  assert.deepEqual(rep.rejected, []);
  envois.length = 0;
  await taches.handlers['resa-rappel'](l[0].p);
  assert.equal(envois.length, 0, 'pas de rappel à un absent');
  taches.faites.length = 0;
  await ram.ops(coach, club.id, [{ coll: 'cours', id: r.id, op: 'patch', patch: [{ p: ['h'], t: 'set', v: '11 h' }] }]);
  await new Promise(x => setTimeout(x, 30));
  const n = taches.faites.filter(x => x.kind === 'resa-rappel');
  assert.deepEqual(n.map(x => x.p.h), ['11 h', '11 h'], 'les rappels suivent le cours');
});

test('collectif modifié : le cours change d’heure, une date retirée ne reste pas au planning', async () => {
  const { coach, club, key, d } = await monte(32);
  const j = await Promise.all(['X', 'Y'].map(async n => { const r = await ram.join({ id: n + '32', name: 'Joueur ' + n }, club.code); await ram.ops(coach, club.id, [{ coll: 'member', id: r.key, op: 'put', data: { n: 'Joueur ' + n, valid: 'S', pl: 5 } }]); return r.key; }));
  const nv = { mode: 'cours', sport: 'Padel', theme: 'Volée', time: '18 h', dur: '1 h', dates: [d], tiers: [{ id: 't1', lo: 1, hi: 10, places: 2 }], ins: { [d + '|t1']: j }, at: {} };
  await ram.ops(coach, club.id, [{ coll: 'post', id: 'pm', op: 'put', data: { by: key, kind: 'niveaux', nv } }]);
  const cours = async () => (await ram.itemsOf(club.id, 'cours')).filter(c => c.data.nv === 'pm');
  for (let i = 0; i < 40 && !(await cours()).length; i++) await new Promise(r => setTimeout(r, 25));
  assert.equal((await cours()).length, 1);
  await ram.ops(coach, club.id, [{ coll: 'post', id: 'pm', op: 'patch', patch: [{ p: ['nv', 'time'], t: 'set', v: '19 h' }] }]);
  for (let i = 0; i < 40 && (await cours())[0].data.h !== '19 h'; i++) await new Promise(r => setTimeout(r, 25));
  assert.equal((await cours())[0].data.h, '19 h');
  const d2 = REGLES.addDays(d, 7);
  await ram.ops(coach, club.id, [{ coll: 'post', id: 'pm', op: 'patch', patch: [{ p: ['nv', 'dates'], t: 'set', v: [d2] }, { p: ['nv', 'ins'], t: 'set', v: { [d2 + '|t1']: j } }] }]);
  for (let i = 0; i < 40 && !(await cours()).some(c => (c.data.cancel || []).includes(d)); i++) await new Promise(r => setTimeout(r, 25));
  const l = await cours();
  assert.ok(l.find(c => c.data.once === d).data.cancel.includes(d), 'l’ancienne date est annulée');
  assert.ok(l.find(c => c.data.once === d2), 'la nouvelle est au planning');
});

test('annuler : l’élève qui annule est noté, pour dire à l’enseignant de qui ça vient', async () => {
  const { club, key, d, a, ka } = await monte(31);
  const r = await resa.reserver(a, club.id, key, { d, t: 570, formule: 'f1', objectif: 'Volée' });
  await resa.annuler(a, club.id, r.id);
  const x = (await ram.itemsOf(club.id, 'cours')).find(c => c.id === r.id);
  assert.equal(x.data.annulePar, ka);
});

test('collectif : rien tant que le minimum n’est pas atteint, puis le cours suit les inscrits jusqu’au maximum', async () => {
  const { coach, club, key, d } = await monte(14);
  const post = ins => ({ by: key, kind: 'niveaux', at: Date.now(), nv: { mode: 'cours', sport: 'Padel', theme: 'Volée', time: '18 h', dur: '1 h 30', price: '15 €', dates: [d], tiers: [{ id: 't1', nom: 'Débutants', lo: 1, hi: 3, places: 2, max: 3 }, { id: 't2', lo: 4, hi: 6, places: 2 }], ins: { [d + '|t1']: ins, [d + '|t2']: ['z1'] }, at: {} } });
  const seance = async () => (await coachTables.planning(coach, d, d)).seances[0];
  const pose = async (ins, pret) => { await ram.ops(coach, club.id, [{ coll: 'post', id: 'pc', op: 'put', data: post(ins) }]); if (pret) await attend(async () => { const x = await seance(); return x && pret(x); }); else { await repos(); await repos(); } };
  await pose(['a1']);
  assert.equal(await seance(), undefined, 'en attente : ni au planning, ni bloquant');
  await pose(['a1', 'a2'], x => x.eleves.length === 2);
  let s = await seance();
  assert.deepEqual(s.eleves, ['a1', 'a2']);
  assert.equal(s.nom, 'Volée');
  assert.equal(s.tarif.prix, 15);
  await pose(['a1', 'a2', 'a3', 'a4'], x => x.eleves.length === 3);
  assert.deepEqual((await seance()).eleves, ['a1', 'a2', 'a3'], 'le maximum');
  await pose(['a1'], x => x.annule);
  assert.equal((await seance()).annule, true, 'sous le minimum : le cours saute');
  await pose(['a1', 'a5'], x => !x.annule && x.eleves.includes('a5'));
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

/* ---------- demandes d'élèves, boutique, page publique, agendas ---------- */
const Agenda = require('../lib/agenda');
test('demande d’élève : son niveau prévenu, aucun cours avant le minimum, puis au planning', async () => {
  const { coach, club, key, d, a, ka } = await monte(20);
  const v = 'V20';
  await ram.join({ id: v, name: 'Élève V' }, club.code);
  const kv = (await ram.myClubs(v)).find(x => x.id === club.id).key;
  await ram.ops(coach, club.id, [{ coll: 'member', id: kv, op: 'put', data: { n: 'Élève V', valid: 'S', pl: 5 } }]);
  await assert.rejects(resa.demander(a, club.id, key, { d, t: 540, formule: 'f3' }), /niveau/);
  await ram.ops(coach, club.id, [{ coll: 'member', id: ka, op: 'put', data: { n: 'Élève', valid: 'S', pl: 4 } }]);
  await assert.rejects(resa.demander(a, club.id, key, { d, t: 540, formule: 'f1' }), /proposable/);
  envois.length = 0;
  const r = await resa.demander(a, club.id, key, { d, t: 540, formule: 'f3', mode: 'partie', theme: 'Volée' });
  const m = envois.find(e => /de ton niveau/.test(e.msg.body));
  assert.deepEqual(m.uids, [v]);
  assert.ok(envois.some(e => e.msg.app === 'coach' && /Demande d'élève/.test(e.msg.body)));
  await repos();
  assert.deepEqual((await coachTables.planning(coach, d, d)).seances, [], 'pas au planning tant que le groupe n’est pas complet');
  assert.equal((await resa.creneaux(a, club.id, key, d)).jours[0].libres[0].du, 540, 'rien de bloqué');
  const p = (await ram.itemsOf(club.id, 'post')).find(x => x.id === r.id).data;
  assert.equal(p.by, key);
  assert.deepEqual([p.nv.tiers[0].lo, p.nv.tiers[0].hi], [3, 5]);
  p.nv.ins[d + '|t1'].push(kv);
  await ram.ops(coach, club.id, [{ coll: 'post', id: r.id, op: 'put', data: p }]);
  const s = await attend(async () => (await coachTables.planning(coach, d, d)).seances[0]);
  assert.deepEqual(s.eleves, [ka, kv]);
});

test('boutique : la commande payée note l’achat une seule fois, élève connu ou nouvelle fiche', async () => {
  const { coach, club, key } = await monte(21);
  store.getSetting = async k => (settings.__ || {})[k] || null;
  store.saveSetting = async (k, v) => { (settings.__ = settings.__ || {})[k] = v; };
  store.getUserByEmail = async () => null;
  const o = await Formules.get(store, coach);
  await Formules.save(store, coach, Object.assign(o, { packs: [{ id: 'p21', formule: 'f1', nom: 'Pack 5', seances: 5, prix: 160, sku: 'pack-21' }] }));
  assert.equal(Formules.publicOf(await Formules.get(store, coach)).packs[0].sku, undefined, 'la référence reste privée');
  const cmd = { id: 'o21', email: 'lea@exemple.test', first: 'Léa', last: 'Roy', d: '2026-11-02', lignes: [{ sku: 'PACK-21', qty: 1, prix: 150 }, { sku: 'RIEN', qty: 1 }] };
  envois.length = 0;
  assert.deepEqual((await resa.achatShopify(cmd)).map(x => x.notes), [1]);
  assert.deepEqual(await resa.achatShopify(cmd), [], 'renvoyée par Shopify : rien de plus');
  const f = (await ram.itemsOf(club.id, 'eleve')).find(x => x.data.mail === 'lea@exemple.test');
  assert.equal(f.data.achats.length, 1);
  assert.equal(f.data.achats[0].n, 5);
  assert.equal(f.data.achats[0].prix, 150);
  assert.equal(f.data.achats[0].pay.ech[0].ok, '2026-11-02', 'payé');
  assert.ok(envois.some(e => e.msg.app === 'coach' && /Léa Roy a acheté Pack 5/.test(e.msg.body)));
  assert.ok(key);
  delete store.getSetting; delete store.saveSetting; delete store.getUserByEmail;
});

test('page publique : fermée par défaut, questionnaire, cours confirmé, annulation par le lien', async () => {
  const { coach, club, key, d } = await monte(22);
  await assert.rejects(resa.pubCreneaux(club.id, key, d), /pas ouverte/);
  await Formules.save(store, coach, Object.assign(await Formules.get(store, coach), { page: club.id }));
  const c = await resa.pubCreneaux(club.id, key, d);
  assert.deepEqual(c.formules.map(f => f.id), ['f1']);
  assert.equal(JSON.stringify(c).includes('pris'), false);
  const b = { d, t: 540, formule: 'f1', prenom: 'Léa', nom: 'Roy', email: 'lea22@exemple.test', tel: '06 00 00 00 00', objectif: 'Volée', accord: true };
  await assert.rejects(resa.pubReserver(club.id, key, Object.assign({}, b, { site: 'x' })), /refusée/);
  await assert.rejects(resa.pubReserver(club.id, key, Object.assign({}, b, { accord: false })), /accepter/);
  await assert.rejects(resa.pubReserver(club.id, key, Object.assign({}, b, { email: 'non' })), /e-mail/);
  const r = await resa.pubReserver(club.id, key, b);
  const s = (await coachTables.planning(coach, d, d)).seances[0];
  assert.equal(s.eleves.length, 1);
  assert.equal((await ram.itemsOf(club.id, 'eleve')).find(x => x.id === s.eleves[0]).data.tel, b.tel);
  await assert.rejects(resa.pubReserver(club.id, key, b), /pris/);
  const q = new URL('http://x' + r.annuler).searchParams;
  await assert.rejects(resa.pubAnnuler(club.id, r.id, 'faux'), /valable/);
  await resa.pubAnnuler(q.get('c'), q.get('id'), q.get('t'));
  assert.equal((await coachTables.planning(coach, d, d)).seances[0].annule, true);
});

test('agenda : les cours confirmés vers Google, et ce qui est posé chez Google n’est plus réservable', async () => {
  const ics = Agenda.toIcs([{ club: 'c', groupe: 'g', date: '2026-07-01', heure: '9 h 30', minutes: 60, nom: 'Cours, duo' }, { club: 'c', groupe: 'g2', date: '2026-07-02', heure: '9 h', minutes: 60, nom: 'Annulé', annule: true }]);
  assert.match(ics, /DTSTART:20260701T073000Z/, 'été : Paris à UTC+2');
  assert.ok(ics.includes('SUMMARY:Cours\\, duo'));
  assert.ok(!ics.includes('Annulé'));
  const src = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART:20260701T073000Z', 'DTEND:20260701T083000Z', 'SUMMARY:Secret', 'END:VEVENT', 'BEGIN:VEVENT', 'DTSTART;TZID=Europe/Paris:20260706T180000', 'DTEND;TZID=Europe/Paris:20260706T190000', 'RRULE:FREQ=WEEKLY;COUNT=2', 'EXDATE;TZID=Europe/Paris:20260713T180000', 'END:VEVENT', 'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20260702', 'DTEND;VALUE=DATE:20260703', 'END:VEVENT', 'BEGIN:VEVENT', 'DTSTART:20260703T100000Z', 'DTEND:20260703T110000Z', 'STATUS:CANCELLED', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  assert.deepEqual(Agenda.parseIcs(src, '2026-07-01', '2026-07-31'), [{ d: '2026-07-01', du: 570, au: 630 }, { d: '2026-07-06', du: 1080, au: 1140 }]);
  assert.equal(Agenda.okIcal('http://calendar.google.com/x'), null);
  assert.equal(Agenda.okIcal('https://169.254.169.254/x'), null);
  assert.ok(Agenda.okIcal('webcal://calendar.google.com/calendar/ical/x/basic.ics'));
  assert.equal(Agenda.lireLien(Agenda.lienIcs('U1').slice(8)), 'U1');
  assert.equal(Agenda.lireLien('U1-' + 'a'.repeat(24) + '.ics'), null);
  const a = Agenda.createAgenda({ fetchFn: async () => ({ ok: true, text: async () => src }) });
  assert.equal((await a.occupe(['https://calendar.google.com/a'], '2026-07-01', '2026-07-01')).length, 1);
  const panne = Agenda.createAgenda({ fetchFn: async () => { throw new Error('panne'); } });
  assert.deepEqual(await panne.occupe(['https://calendar.google.com/a'], '2026-07-01', '2026-07-31'), [], 'injoignable : la réservation continue');
});

test('page publique : l’élève sans compte reçoit un e-mail si l’enseignant annule ou déplace ; pas s’il annule lui-même', async () => {
  const { coach, club, key, d } = await monte(33);
  await ram.ops(coach, club.id, [
    { coll: 'eleve', id: 'ex', op: 'put', data: { n: 'Léa Martin', mail: 'lea@exemple.fr' } },
    { coll: 'cours', id: 'rp', op: 'put', data: { type: 'train', name: 'Cours', once: d, h: '10 h', dur: '1 h', coach: key, mem: [], ext: ['ex'], cal: 'ram:rp' } }
  ]);
  await new Promise(r => setTimeout(r, 30));
  const mails = () => taches.faites.filter(x => x.kind === 'mail');
  taches.faites.length = 0;
  await ram.ops(coach, club.id, [{ coll: 'cours', id: 'rp', op: 'patch', patch: [{ p: ['h'], t: 'set', v: '11 h' }] }]);
  await new Promise(r => setTimeout(r, 30));
  assert.equal(mails().length, 1);
  assert.equal(mails()[0].p.to, 'lea@exemple.fr');
  assert.match(mails()[0].p.subject, /Cours déplacé : .* à 11 h/);
  taches.faites.length = 0;
  await ram.ops(coach, club.id, [{ coll: 'cours', id: 'rp', op: 'patch', patch: [{ p: ['cancel'], t: 'add', v: d }] }]);
  await new Promise(r => setTimeout(r, 30));
  assert.match(mails()[0].p.subject, /Cours annulé/);
  taches.faites.length = 0;
  await ram.ops(coach, club.id, [{ coll: 'cours', id: 'rp', op: 'patch', patch: [{ p: ['cancel'], t: 'set', v: [] }, { p: ['annulePar'], t: 'set', v: 'ex' }] }]);
  await ram.ops(coach, club.id, [{ coll: 'cours', id: 'rp', op: 'patch', patch: [{ p: ['cancel'], t: 'add', v: d }] }]);
  await new Promise(r => setTimeout(r, 30));
  assert.equal(mails().length, 0, 'il a annulé lui-même');
});

/* ---------- le parcours complet, avec les vraies notifications ---------- */
const { createNotifier } = require('../lib/pushnotif');
const recus = [];
createNotifier({ ram, push: { send: async (uid, msg) => { recus.push([uid, msg]); return 1; } } });
const repos = () => new Promise(r => setTimeout(r, 40));
const libre = async (club, key, a, d, t) => (await resa.creneaux(a, club.id, key, d)).jours[0].libres.some(p => t >= p.du && t + 60 <= p.au);

test('parcours : l’élève réserve, le coach est prévenu avec l’objectif ; il annule, l’élève est prévenu, le créneau est de nouveau réservable', async () => {
  const { coach, club, key, d, a, ka } = await monte(40);
  assert.equal(await libre(club, key, a, d, 570), true);
  await repos();
  recus.length = 0;
  const r = await resa.reserver(a, club.id, key, { d, t: 570, formule: 'f1', objectif: 'Améliorer ma volée' });
  await repos();
  const c = recus.find(x => x[0] === coach);
  assert.ok(c, 'le coach est prévenu');
  assert.equal(c[1].app, 'coach');
  assert.match(c[1].body, /Nouvelle réservation : Cours individuel .* avec .*Objectif : Améliorer ma volée/);
  assert.deepEqual(recus.filter(x => x[0] === a).map(x => x[1].body), [], 'l’élève n’est pas notifié de son propre geste');
  assert.equal(await libre(club, key, a, d, 570), false, 'pris');
  const it = (await ram.itemsOf(club.id, 'cours')).find(x => x.id === r.id);
  assert.equal(it.data.goal, 'Améliorer ma volée');
  // le coach annule dans /RAM Coach
  recus.length = 0;
  await ram.ops(coach, club.id, [{ coll: 'cours', id: r.id, op: 'patch', patch: [{ p: ['cancel'], t: 'add', v: d }] }], { client: true });
  await repos();
  assert.deepEqual(recus.map(x => [x[0], x[1].body]).filter(x => x[0] !== a), [], 'l’élève, pas le coach');
  assert.match(recus[0][1].body, /Cours annulé : Cours individuel/);
  assert.equal(await libre(club, key, a, d, 570), true, 'le créneau est libre de nouveau');
  const r2 = await resa.reserver(a, club.id, key, { d, t: 570, formule: 'f1', objectif: 'Deuxième essai' });
  assert.notEqual(r2.id, r.id, 'et se réserve');
  await repos();
  // le coach déplace le nouveau cours : l'élève est prévenu, l'ancien créneau se libère
  recus.length = 0;
  await ram.ops(coach, club.id, [{ coll: 'cours', id: r2.id, op: 'patch', patch: [{ p: ['h'], t: 'set', v: '11 h' }] }], { client: true });
  await repos();
  assert.deepEqual(recus.map(x => x[0]), [a]);
  assert.match(recus[0][1].body, /Cours déplacé : Cours individuel, .* à 11 h/);
  assert.equal(await libre(club, key, a, d, 570), true);
  assert.equal(await libre(club, key, a, d, 660), false);
  // l'élève annule : le coach apprend qui
  recus.length = 0;
  await resa.annuler(a, club.id, r2.id);
  await repos();
  assert.deepEqual(recus.map(x => x[0]), [coach]);
  assert.match(recus[0][1].body, /Élève annule : Cours individuel/);
  assert.equal(await libre(club, key, a, d, 660), true);
  void ka;
});

test('Calendly et /RAM Club : une réservation Calendly bloque le créneau, son annulation le rend ; jamais deux cours au même moment', async () => {
  const { coach, club, key, d, a, ka } = await monte(41);
  const g = { type: 'train', name: 'Cours Academy', once: d, h: '9 h', dur: '1 h', coach: key, mem: [ka], cal: 'https://api.calendly.com/scheduled_events/E1', day: REGLES.dowOf(d) };
  await ram.ops(coach, club.id, [{ coll: 'cours', id: 'gcal', op: 'put', data: g }]);
  assert.equal(await libre(club, key, a, d, 540), false, 'pris par Calendly');
  await assert.rejects(resa.reserver(a, club.id, key, { d, t: 540, formule: 'f1', objectif: 'Volée' }), /vient d’être pris/);
  assert.equal(await libre(club, key, a, d, 600), true, 'l’heure suivante reste libre');
  const r = await resa.reserver(a, club.id, key, { d, t: 600, formule: 'f1', objectif: 'Volée' });
  // ce qui part vers Google (et que Calendly lit) : le cours /RAM, pas la réservation Calendly (Calendly l'écrit lui-même)
  const { seances } = await coachTables.pourAgenda(coach, d, d);
  assert.deepEqual(seances.map(s => s.groupe), [r.id]);
  await ram.ops(coach, club.id, [{ coll: 'cours', id: 'gcal', op: 'patch', patch: [{ p: ['cancel'], t: 'add', v: d }] }]);
  assert.equal(await libre(club, key, a, d, 540), true, 'annulée : le créneau revient');
});

