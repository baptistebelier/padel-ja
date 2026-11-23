/* Réservation depuis /Buvette : ce qui est libre, sans aucun nom ; un cours confirmé tout de suite ; pas de doublon */
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

test('collectif complet dès le départ : chaque date au planning avec les élèves choisis, sans inscription', async () => {
  const { coach, club, key, d } = await monte(33);
  const j = await ram.join({ id: 'Z33', name: 'Joueur Z' }, club.code);
  await ram.ops(coach, club.id, [{ coll: 'member', id: j.key, op: 'put', data: { n: 'Joueur Z', valid: 'S', pl: 5 } }, { coll: 'eleve', id: 'f33', op: 'put', data: { n: 'Fiche Sans Compte' } }]);
  const d2 = REGLES.addDays(d, 7);
  const nv = { mode: 'cours', sport: 'Padel', theme: 'Groupe fermé', time: '18 h', dur: '1 h', dates: [d, d2], tiers: [], ins: {}, at: {}, complet: true, membres: [j.key, 'f33'], rec: { pas: 7, fin: d2, vac: true } };
  await ram.ops(coach, club.id, [{ coll: 'post', id: 'pf', op: 'put', data: { by: key, kind: 'niveaux', nv } }]);
  const cours = async () => (await ram.itemsOf(club.id, 'cours')).filter(c => c.data.nv === 'pf');
  for (let i = 0; i < 40 && (await cours()).length < 2; i++) await new Promise(r => setTimeout(r, 25));
  const l = await cours();
  assert.deepEqual(l.map(c => c.data.once).sort(), [d, d2], 'les deux dates, sans attendre d’inscription');
  assert.deepEqual(l[0].data.mem, [j.key]);
  assert.deepEqual(l[0].data.ext, ['f33'], 'la fiche sans compte est rangée à part');
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
  assert.deepEqual(c.formules.map(f => f.id), ['f1', 'f3'], 'toutes ses formules : individuel et duo');
  // une formule masquée n'est plus proposée ni réservable ; visible de nouveau, elle revient
  const o0 = await Formules.get(store, coach);
  await Formules.save(store, coach, Object.assign({}, o0, { formules: o0.formules.map(f => (f.id === 'f3' ? Object.assign({}, f, { masque: true }) : f)) }));
  assert.deepEqual((await resa.pubCreneaux(club.id, key, d)).formules.map(f => f.id), ['f1'], 'formule masquée : pas sur la page');
  await assert.rejects(resa.pubReserver(club.id, key, { d, t: 540, formule: 'f3', prenom: 'Léa', nom: 'Roy', email: 'lea22@exemple.test', tel: '06 00 00 00 00', objectif: 'Volée', accord: true }), /pas réservable/);
  await Formules.save(store, coach, o0);
  assert.equal(c.photo, false, 'pas de photo : la page garde les initiales');
  assert.equal(await resa.pubPhoto(club.id, key), null);
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

test('page publique : toutes ses formules, packs et abonnements ; photo du compte ; séance rattachée à l’abonnement ou au pack', async () => {
  const { coach, club, key, d } = await monte(23), d2 = REGLES.addDays(d, 7);
  await Formules.save(store, coach, {
    formules: [{ id: 'f1', nom: 'Cours individuel', sport: 'Padel', joueurs: 1, duree: 60, prix: 35 }, { id: 'f3', nom: 'Duo', sport: 'Padel', joueurs: 2, duree: 90, prix: 30, par: 'personne' }],
    packs: [{ id: 'p1', formule: 'f1', nom: 'Pack 5', seances: 5, prix: 150 }], abos: [{ id: 'a1', nom: 'Academy', formule: 'f1', periode: 'mois', duree: 1, prix: 120, parSemaine: 1 }],
    dispos: [{ jour: REGLES.dowOf(d), du: '09:00', au: '12:00', lieu: 'Club' }], page: club.id
  });
  store.getIdentity = async () => ({ avatar: 'data:image/png;base64,iVBORw0KGgo=' });
  const c = await resa.pubCreneaux(club.id, key, d);
  assert.deepEqual(c.formules.map(f => [f.id, f.duree]), [['f1', 60], ['f3', 90]]);
  assert.deepEqual([c.packs[0].duree, c.abos[0].duree], [60, 60], 'la durée suit la formule du pack et de l’abonnement');
  assert.equal(c.photo, true);
  const ph = await resa.pubPhoto(club.id, key);
  assert.equal(ph.mime, 'image/png');
  assert.ok(ph.buf.length > 4);
  const base = { d, formule: 'f3', prenom: 'Léa', nom: 'Roy', email: 'duo23@exemple.test', tel: '06 00 00 00 00', objectif: 'Volée', accord: true };
  const duo = await resa.pubReserver(club.id, key, Object.assign({}, base, { t: 540, partenaires: 'Marc' }));
  assert.equal(duo.dur, '1 h 30');
  const cours = async id => (await ram.itemsOf(club.id, 'cours')).find(x => x.id === id).data;
  assert.equal((await cours(duo.id)).tarif.mode, 'eleve');
  assert.match((await cours(duo.id)).goal, /avec : Marc/);
  await assert.rejects(resa.pubReserver(club.id, key, Object.assign({}, base, { t: 600, email: 'autre23@exemple.test' })), /pris/, 'la durée de 1 h 30 est comptée dans le créneau');
  const pack = await resa.pubReserver(club.id, key, Object.assign({}, base, { t: 660, type: 'p', formule: 'p1', email: 'pack23@exemple.test' }));
  assert.equal(pack.nom, 'Pack 5');
  assert.equal(pack.prix, 30, 'un cinquième du pack');
  const dec = await resa.pubReserver(club.id, key, Object.assign({}, base, { d: d2, t: 540, formule: 'f1', email: 'dec23@exemple.test', couvert: 'pack' }));
  assert.deepEqual([dec.couvert, dec.prix], ['pack', 0], 'pack en cours déclaré : rien à régler');
  assert.match((await cours(dec.id)).goal, /à vérifier/);
  const fiche = (await ram.itemsOf(club.id, 'eleve')).find(x => x.data.mail === 'dec23@exemple.test');
  await ram.ops(coach, club.id, [{ coll: 'eleve', id: fiche.id, op: 'put', data: Object.assign({}, fiche.data, { mail: 'abo23@exemple.test', achats: [{ id: 'h1', t: 'abo', ref: 'a1', d: '2020-01-01', fin: '2099-01-01', nom: 'Academy', prix: 120 }] }) }]);
  const sansPreuve = await resa.pubReserver(club.id, key, Object.assign({}, base, { d: d2, t: 660, formule: 'f1', email: 'abo23@exemple.test' }));
  assert.equal(sansPreuve.couvert, '', 'abonnement présent dans la fiche mais adresse non prouvée : non reconnu');
  const abo = await resa.pubReserver(club.id, key, Object.assign({}, base, { d: d2, t: 600, formule: 'f1', email: 'abo23@exemple.test', verifie: 'abo23@exemple.test' }));
  assert.deepEqual([abo.couvert, abo.prix], ['abo', 0], 'abonnement reconnu dans la fiche, sans rien déclarer');
  assert.equal((await cours(abo.id)).couvertVerifie, true);
  delete store.getIdentity;
});

test('lien d’inscription public : jeton, mêmes places et fourchettes que l’appli, concurrence, lien coupé, aucune donnée personnelle', async () => {
  const { coach, club, key, d } = await monte(24), TOK = 'jeton-secret-1234567890', passe = REGLES.addDays(paris().d, -3);
  const nv = (dates, plus) => ({ by: key, kind: 'niveaux', mur: false, likes: 0, com: [], at: Date.now(), nv: Object.assign({ mode: 'cours', sport: 'Padel', theme: 'Volée', body: '', time: '10 h', dur: '1 h', place: 'Salle', price: '10 €', dates, tiers: [{ id: 't1', lo: 3, hi: 5, places: 2, max: 3 }, { id: 't2', lo: 6, hi: 8, places: 2 }], ins: {}, at: {}, lien: { t: TOK } }, plus) });
  const put = (id, data) => ram.ops(coach, club.id, [{ coll: 'post', id, op: 'put', data }]);
  const lis = async id => (await ram.itemsOf(club.id, 'post')).find(x => x.id === id).data.nv;
  await put('pn1', nv([d]));
  await assert.rejects(resa.pubNv(club.id, 'pn1', 'faux'), /pas valable/);
  await assert.rejects(resa.pubNv(club.id, 'inconnue', TOK), /pas valable/);
  const info = await resa.pubNv(club.id, 'pn1', TOK);
  assert.deepEqual([info.etat, info.titre, info.dates[0].tiers.map(t => [t.id, t.cap, t.restant])], ['ouvert', 'Volée', [['t1', 3, 3], ['t2', 2, 2]]]);
  const moi = (n, niveau, plus) => Object.assign({ d, niveau, prenom: 'Léa', nom: 'Roy' + n, email: `lea${n}.nv@exemple.test`, tel: '06 00 00 00 00', accord: true }, plus);
  await assert.rejects(resa.pubNvInscrire(club.id, 'pn1', TOK, moi(0, 4, { site: 'x' })), /refusée/);
  await assert.rejects(resa.pubNvInscrire(club.id, 'pn1', TOK, moi(0, 4, { accord: false })), /accepter/);
  await assert.rejects(resa.pubNvInscrire(club.id, 'pn1', TOK, moi(0, 1)), /aucune fourchette/);
  await assert.rejects(resa.pubNvInscrire(club.id, 'pn1', TOK, moi(0, '')), /niveau/);
  await assert.rejects(resa.pubNvInscrire(club.id, 'pn1', 'faux', moi(0, 4)), /pas valable/);
  const a = await resa.pubNvInscrire(club.id, 'pn1', TOK, moi(1, 4));
  assert.equal(a.statut, 'in', 'minimum pas atteint : inscrit, pas encore validé');
  await assert.rejects(resa.pubNvInscrire(club.id, 'pn1', TOK, moi(1, 4)), /déjà inscrit/);
  assert.equal((await resa.pubNvInscrire(club.id, 'pn1', TOK, moi(2, 5))).statut, 'ok', 'la fourchette atteint son minimum : validée');
  assert.equal((await resa.pubNvInscrire(club.id, 'pn1', TOK, moi(3, 3))).statut, 'ok', 'jusqu’au maximum');
  assert.equal((await resa.pubNvInscrire(club.id, 'pn1', TOK, moi(4, 4))).statut, 'wait', 'au-delà du maximum : liste d’attente');
  assert.equal((await resa.pubNvInscrire(club.id, 'pn1', TOK, moi(5, 7))).statut, 'wait', 'l’autre fourchette passe en liste d’attente');
  // le recalage du collectif met la séance au planning avec ses inscrits
  await new Promise(r => setTimeout(r, 300));
  const cours = (await ram.itemsOf(club.id, 'cours')).find(x => x.data.nv === 'pn1');
  assert.ok(cours && cours.data.once === d && cours.data.mem.length === 3, 'séance au planning, 3 validés');
  const fiche = (await ram.itemsOf(club.id, 'eleve')).find(x => x.data.mail === 'lea1.nv@exemple.test');
  assert.match(fiche.data.note, /lien d’inscription/);
  assert.ok((await lis('pn1')).via[fiche.id], 'marqué comme inscrit par le lien');
  // rien de personnel ne sort de l'API publique
  const sortie = JSON.stringify(await resa.pubNv(club.id, 'pn1', TOK));
  assert.ok(!/exemple\.test|06 00|"k"|"mail"|"tel"|eleve/.test(sortie), 'aucun e-mail, téléphone ni clé interne (les prénoms et noms sont montrés aux participants, par choix)');
  assert.deepEqual((await resa.pubNv(club.id, 'pn1', TOK)).dates[0].tiers.map(t => [t.n, t.restant, t.complet]), [[3, 0, true], [1, 1, false]], 'places restantes par fourchette');
  // désinscription par le lien personnel
  const q = new URL('http://x' + a.annuler).searchParams;
  await assert.rejects(resa.pubNvDesinscrire(club.id, 'pn1', q.get('k'), d, 'faux'), /pas valable/);
  assert.deepEqual(await resa.pubNvDesinscrire(q.get('c'), q.get('p'), q.get('k'), q.get('d'), q.get('t')), { ok: true });
  assert.equal((await resa.pubNvDesinscrire(q.get('c'), q.get('p'), q.get('k'), q.get('d'), q.get('t'))).deja, true);
  assert.ok(!(await lis('pn1')).ins[d + '|t1'].includes(q.get('k')));
  // concurrence : trois personnes en même temps sur une fourchette de 2 places, ni doublon ni dépassement
  await put('pn2', nv([d]));
  const sts = await Promise.all([1, 2, 3].map(n => resa.pubNvInscrire(club.id, 'pn2', TOK, moi(10 + n, 7)).then(r => r.statut)));
  assert.deepEqual(sts.slice().sort(), ['in', 'ok', 'wait'], 'le premier avant le minimum, le deuxième le valide, le troisième dépasse les 2 places');
  assert.equal((await resa.pubNv(club.id, 'pn2', TOK)).dates[0].tiers[1].complet, true);
  assert.equal(new Set((await lis('pn2')).ins[d + '|t2']).size, 3);
  // lien coupé puis réactivé
  await put('pn3', nv([d], { lien: { t: TOK, off: true } }));
  assert.equal((await resa.pubNv(club.id, 'pn3', TOK)).etat, 'coupe');
  assert.equal(JSON.stringify(await resa.pubNv(club.id, 'pn3', TOK)).includes('Salle'), false, 'coupé : aucun détail');
  await assert.rejects(resa.pubNvInscrire(club.id, 'pn3', TOK, moi(20, 4)), /coupé/);
  await put('pn3', nv([d]));
  assert.equal((await resa.pubNvInscrire(club.id, 'pn3', TOK, moi(20, 4))).statut, 'in');
  // passée, annulée, sans lien, demande d'élève
  await put('pn4', nv([passe]));
  assert.equal((await resa.pubNv(club.id, 'pn4', TOK)).dates[0].etat, 'passe');
  await assert.rejects(resa.pubNvInscrire(club.id, 'pn4', TOK, moi(30, 4, { d: passe })), /passée/);
  await put('pn5', Object.assign(nv([d]), { arch: true }));
  assert.equal((await resa.pubNv(club.id, 'pn5', TOK)).etat, 'annule');
  await assert.rejects(resa.pubNvInscrire(club.id, 'pn5', TOK, moi(31, 4)), /annulée/);
  await put('pn6', nv([d], { lien: undefined }));
  await assert.rejects(resa.pubNv(club.id, 'pn6', TOK), /pas valable/);
  await put('pn7', nv([d], { demande: { par: 'x', formule: 'f3' } }));
  await assert.rejects(resa.pubNv(club.id, 'pn7', TOK), /pas valable/);
});

test('« Déjà élève ? » : lien à usage unique, compte sans mot de passe, adresse inconnue, achats de ses seules fiches, réservation rattachée', async () => {
  const Auth = require('../lib/auth.js'), { demanderAcces } = require('../lib/acces-resa.js');
  const { coach, club, key, d } = await monte(25), il = REGLES.addDays(paris().d, -10);
  await Formules.save(store, coach, Object.assign(await Formules.get(store, coach), { page: club.id, packs: [{ id: 'p1', formule: 'f1', nom: 'Pack 5', seances: 5, prix: 150 }] }));
  const fiche = (id, n, mail, plus) => ({ coll: 'eleve', id, op: 'put', data: Object.assign({ n, sport: 'Padel', parents: [], mail, tel: '06 11 11 11 11' }, plus) });
  await ram.ops(coach, club.id, [fiche('e1', 'Léa Roy', 'lea25@exemple.test', { achats: [{ id: 'h1', t: 'pack', ref: 'p1', n: 5, d: il, nom: 'Pack 5', prix: 150 }] }), fiche('e2', 'Tom Roy', 'lea25@exemple.test'), fiche('e3', 'Autre Personne', 'autre25@exemple.test', { achats: [{ id: 'h9', t: 'pack', ref: 'p1', n: 5, d: il, nom: 'Pack secret', prix: 150 }] })]);
  const users = new Map(), mails = [];
  const st = { getUserByEmail: async m => [...users.values()].find(u => u.email === m) || null, saveUser: async u => { users.set(u.id, u); }, saveIdentity: async () => {}, saveBilling: async () => {}, getIdentity: async () => null };
  const Mail2 = { send: async m => { mails.push(m); }, accesResaMail: require('../lib/mail.js').accesResaMail };
  const go = email => demanderAcces({ store: st, reservation: resa, Auth, Mail: Mail2, base: 'https://x.test', c: club.id, k: key, email });
  // adresse inconnue ou invalide : rien ne part, rien ne se crée
  assert.deepEqual([await go('inconnu25@exemple.test'), await go('pas une adresse'), await go('')], [{ envoye: false }, { envoye: false }, { envoye: false }]);
  assert.deepEqual([mails.length, users.size], [0, 0]);
  // élève connu de cet enseignant, sans compte : compte créé sans mot de passe, lien à usage unique et de courte durée
  assert.deepEqual(await go('Lea25@exemple.test'), { envoye: true });
  assert.equal(users.size, 1);
  const u = [...users.values()][0];
  assert.equal(u.pass_hash, null, 'aucun mot de passe tant que le lien n’est pas ouvert');
  assert.equal(u.plan, 'essai', 'aucun droit en plus');
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'lea25@exemple.test');
  const lien = mails[0].text.match(/reinitialiser\?t=([^&\s]+)&retour=([^\s]+)/), tok = decodeURIComponent(lien[1]);
  assert.equal(decodeURIComponent(lien[2]), `/r/${club.id}/${key}`, 'le lien ramène sur la page de réservation');
  const t = Auth.readResetToken(tok);
  assert.ok(t && Auth.resetMatches(u, t), 'lien valide');
  assert.equal(Auth.readResetToken(tok, Date.now() + 2 * 3600e3), null, 'expiré au bout d’une heure');
  u.pass_hash = await Auth.hashPasswordAsync('un-mot-de-passe');   // le mot de passe vient d'être créé par ce lien
  assert.equal(Auth.resetMatches(u, t), false, 'déjà utilisé : plus valable');
  // compte existant (avec mot de passe) : même lien, aucun doublon
  assert.deepEqual(await go('lea25@exemple.test'), { envoye: true });
  assert.deepEqual([users.size, mails.length], [1, 2]);
  // ce que la page connaît d'un élève connecté : ses fiches à son adresse, achats et séances restantes, rien d'une autre personne
  const moi = await resa.pubMoi(club.id, key, 'lea25@exemple.test');
  assert.deepEqual(moi.fiches.map(f => f.id).sort(), ['e1', 'e2'], 'plusieurs fiches pour une adresse : il choisit pour qui');
  const pack = moi.fiches.find(f => f.id === 'e1').achats[0];
  assert.deepEqual([pack.t, pack.restantes, pack.total, pack.encours], ['pack', 5, 5, true]);
  assert.ok(!/Autre Personne|Pack secret|autre25/.test(JSON.stringify(moi)), 'aucune donnée d’un autre élève');
  assert.deepEqual((await resa.pubMoi(club.id, key, 'autre25@exemple.test')).fiches.map(f => f.id), ['e3']);
  assert.deepEqual((await resa.pubMoi(club.id, key, 'inconnu25@exemple.test')).fiches, []);
  // réservation rattachée à la fiche choisie, décomptée du pack en cours ; l'adresse vérifiée vient du compte, pas du formulaire
  const base = { d, formule: 'f1', prenom: 'Léa', nom: 'Roy', email: 'lea25@exemple.test', tel: '06 11 11 11 11', objectif: 'Volée', accord: true };
  const r2 = await resa.pubReserver(club.id, key, Object.assign({}, base, { t: 540, verifie: 'lea25@exemple.test', fiche: 'e2' }));
  const coursDe = async id => (await ram.itemsOf(club.id, 'cours')).find(x => x.id === id).data;
  assert.deepEqual((await coursDe(r2.id)).ext, ['e2'], 'pour la fiche choisie');
  assert.equal(r2.couvert, '', 'cette fiche n’a ni pack ni abonnement');
  const r1 = await resa.pubReserver(club.id, key, Object.assign({}, base, { t: 600, verifie: 'lea25@exemple.test', fiche: 'e1' }));
  assert.deepEqual([r1.couvert, r1.prix, (await coursDe(r1.id)).ext], ['pack', 0, ['e1']], 'décomptée du pack en cours, rien à régler');
  assert.equal((await coursDe(r1.id)).couvertVerifie, true);
  await assert.rejects(resa.pubReserver(club.id, key, Object.assign({}, base, { t: 660, verifie: 'autre25@exemple.test', fiche: 'e1' })), /pas la tienne/);
  const r0 = await resa.pubReserver(club.id, key, Object.assign({}, base, { d: REGLES.addDays(d, 7), t: 540, fiche: 'e1' }));
  assert.equal(r0.couvert, '', 'sans compte connecté : la fiche demandée est ignorée, le pack n’est pas déduit');
});

test('adresse prouvée : lien de confirmation (usage unique, 1 h), session ou mot de passe ou nouveau mot de passe, sessions antérieures tombées, changement d’adresse', async () => {
  const Auth = require('../lib/auth.js'), A = require('../lib/acces-resa.js'), M = require('../lib/mail.js');
  const users = new Map(), ids = new Map(), mails = [];
  const st = { getUser: async id => users.get(id) || null, saveUser: async u => { users.set(u.id, u); }, getIdentity: async id => Object.assign({}, ids.get(id)), saveIdentity: async (id, v) => { ids.set(id, v); } };
  const Mail2 = { send: async m => { mails.push(m); }, confirmationMail: M.confirmationMail }, fake = { pubCreneaux: async () => ({ coach: 'Sarah' }) };
  const nouveau = async (id, mail, mdp) => { const u = { id, email: mail, name: 'Victime', pass_hash: await Auth.hashPasswordAsync(mdp), plan: 'essai', guest: false }; users.set(id, u); return u; };
  const demande = u => A.demanderConfirmation({ store: st, reservation: fake, Auth, Mail: Mail2, base: 'https://x.test', user: u, c: 'club1', k: 'cle1' });
  const lien = () => decodeURIComponent(mails.at(-1).text.match(/\?v=(\S+)/)[1]);
  const sessionValable = (token, u) => { const cookie = Auth.sessionCookie({ headers: {} }, token, 1), s = Auth.sessionOf({ headers: { cookie: String(cookie).split(';')[0] } }); return Auth.sessionMatches(s, u); };
  // un pirate crée un compte avec l'adresse d'un élève : connecté, mais l'adresse n'est pas prouvée
  const u = await nouveau('u1', 'victime@exemple.test', 'mot-du-pirate'), sessionPirate = Auth.makeToken('u1', 0, u.pass_hash);
  assert.equal(await A.adresseVerifiee(st, u), false);
  assert.deepEqual(await demande(u), { envoye: true });
  assert.equal(mails.at(-1).to, 'victime@exemple.test', 'le lien part à l’adresse du compte, jamais ailleurs');
  const tok = lien();
  assert.equal(Auth.readVerifToken(tok, Date.now() + 2 * 3600e3), null, 'expiré au bout d’une heure');
  // le vrai propriétaire ouvre le lien sans être connecté : il doit prouver qui il est
  assert.deepEqual(await A.confirmer({ store: st, Auth, token: tok }), { besoin: true, faux: false });
  assert.deepEqual(await A.confirmer({ store: st, Auth, token: tok, password: 'pas-le-bon' }), { besoin: true, faux: true });
  await assert.rejects(A.confirmer({ store: st, Auth, token: tok, nouveau: 'court' }), /8 caractères/);
  assert.equal(await A.adresseVerifiee(st, u), false, 'toujours rien de prouvé');
  assert.equal(sessionValable(sessionPirate, u), true);
  const r = await A.confirmer({ store: st, Auth, token: tok, nouveau: 'le-vrai-mot-de-passe' });
  assert.deepEqual([r.ok, r.nouvelleSession], [true, true]);
  assert.equal(await A.adresseVerifiee(st, u), true);
  assert.equal(sessionValable(sessionPirate, u), false, 'la session du pirate tombe quand le propriétaire choisit son mot de passe');
  assert.equal(await Auth.checkPasswordAsync('mot-du-pirate', u.pass_hash), false);
  assert.equal(sessionValable(Auth.makeToken('u1', 0, u.pass_hash), u), true);
  await assert.rejects(A.confirmer({ store: st, Auth, token: tok, nouveau: 'encore-un-autre' }), /déjà utilisé/, 'usage unique');
  assert.deepEqual(await demande(u), { envoye: false }, 'adresse déjà prouvée : rien à confirmer');
  // quelqu'un qui détient déjà le compte confirme avec sa session, ou avec son mot de passe, sans rien changer
  const v = await nouveau('u2', 'lea@exemple.test', 'son-mot-de-passe');
  await demande(v);
  const r2 = await A.confirmer({ store: st, Auth, token: lien(), sessionUser: { id: 'u2' } }), hash = v.pass_hash;
  assert.deepEqual([r2.ok, r2.nouvelleSession, v.pass_hash === hash, await A.adresseVerifiee(st, v)], [true, false, true, true]);
  const w = await nouveau('u3', 'tom@exemple.test', 'mot-de-passe-de-tom');
  await demande(w);
  const r3 = await A.confirmer({ store: st, Auth, token: lien(), password: 'mot-de-passe-de-tom' });
  assert.deepEqual([r3.ok, r3.nouvelleSession, await A.adresseVerifiee(st, w)], [true, true, true], 'mot de passe actuel : confirmé sans changement');
  // un changement d'adresse annule la preuve (et un lien en cours)
  const x = await nouveau('u4', 'ines@exemple.test', 'mot-de-passe-ines');
  await demande(x);
  const encours = lien();
  x.email = 'autre-adresse@exemple.test';
  await assert.rejects(A.confirmer({ store: st, Auth, token: encours, nouveau: 'quelque-chose-8' }), /expiré/, 'lien lié à l’ancienne adresse');
  await A.marquerVerifiee(st, x);
  assert.equal(await A.adresseVerifiee(st, x), true);
  x.email = 'ines.nouvelle@exemple.test';
  assert.equal(await A.adresseVerifiee(st, x), false, 'adresse changée : plus prouvée');
  // invités et comptes sans adresse : rien ne part
  assert.deepEqual(await demande({ id: 'g', guest: true, email: 'g@exemple.test' }), { envoye: false });
  assert.deepEqual(await demande(null), { envoye: false });
  // lecture ratée de l'identité : la preuve ne s'écrit pas par-dessus une identité vide
  const cassee = { getIdentity: async () => { throw new Error('base indisponible'); }, saveIdentity: async () => { throw new Error('ne doit pas écrire'); } };
  await assert.rejects(A.marquerVerifiee(cassee, u), /base indisponible/);
  assert.equal(await A.adresseVerifiee(cassee, u), false);
});

test('sans adresse prouvée, rien d’une fiche ne décompte un abonnement ou un pack (réservation par e-mail saisi)', async () => {
  const { coach, club, key, d } = await monte(26), il = REGLES.addDays(paris().d, -10);
  await Formules.save(store, coach, Object.assign(await Formules.get(store, coach), { page: club.id, abos: [{ id: 'a1', nom: 'Academy', formule: 'f1', periode: 'mois', duree: 1, prix: 120, parSemaine: 1 }] }));
  await ram.ops(coach, club.id, [{ coll: 'eleve', id: 'e1', op: 'put', data: { n: 'Léa Roy', sport: 'Padel', parents: [], mail: 'lea26@exemple.test', tel: '06 11 11 11 11', achats: [{ id: 'h1', t: 'abo', ref: 'a1', d: il, fin: '2099-01-01', nom: 'Academy', prix: 120 }] } }]);
  const base = { d, formule: 'f1', prenom: 'Pirate', nom: 'X', email: 'lea26@exemple.test', tel: '06 00 00 00 00', objectif: 'Volée', accord: true };
  const sans = await resa.pubReserver(club.id, key, Object.assign({}, base, { t: 540 }));
  assert.equal(sans.couvert, '', 'e-mail saisi seulement : l’abonnement n’est pas reconnu');
  const faux = await resa.pubReserver(club.id, key, Object.assign({}, base, { t: 600, fiche: 'e1' }));
  assert.equal(faux.couvert, '', 'une fiche demandée sans adresse prouvée est ignorée');
  const autre = await resa.pubReserver(club.id, key, Object.assign({}, base, { t: 660, verifie: 'quelquun@exemple.test' }));
  assert.equal(autre.couvert, '', 'adresse prouvée différente de celle du formulaire : pas d’abonnement reconnu');
  const preuve = await resa.pubReserver(club.id, key, Object.assign({}, base, { d: REGLES.addDays(d, 7), t: 540, verifie: 'lea26@exemple.test' }));
  assert.deepEqual([preuve.couvert, preuve.prix], ['abo', 0], 'adresse prouvée : abonnement reconnu');
});

test('liste des inscrits : prénom, nom et photo du compte /RAM, tous nommés, jamais une coordonnée ; fourchette choisie ; fiche prouvée', async () => {
  const { coach, club, key, d, a, b, ka } = await monte(27), TOK = 'jeton-liste-1234567890';
  const mailsAvatar = { [a]: 'data:image/png;base64,iVBORw0KGgo=' };
  store.getIdentity = async uid => ({ avatar: mailsAvatar[uid] || '' });
  const nvData = { by: key, kind: 'niveaux', mur: false, likes: 0, com: [], at: Date.now(), nv: { mode: 'cours', sport: 'Padel', theme: 'Volée', body: '', time: '10 h', dur: '1 h', place: 'Salle', price: '10 €', dates: [d], tiers: [{ id: 't1', lo: 3, hi: 5, places: 2, max: 4 }, { id: 't2', lo: 6, hi: 8, places: 2 }], ins: {}, at: {}, lien: { t: TOK } } };
  await ram.ops(coach, club.id, [{ coll: 'post', id: 'pl1', op: 'put', data: nvData }]);
  const lis = async () => (await ram.itemsOf(club.id, 'post')).find(x => x.id === 'pl1').data.nv;
  const moi = (n, plus) => Object.assign({ d, tier: 't1', prenom: 'Camille', nom: 'Public' + n, email: `cam${n}.liste@exemple.test`, tel: '06 55 55 55 5' + n, accord: true }, plus);
  // fourchette choisie directement, sans niveau
  assert.equal((await resa.pubNvInscrire(club.id, 'pl1', TOK, moi(1, { tier: 't2' }))).statut, 'in');
  assert.ok((await lis()).ins[d + '|t2'].length === 1 && !(await lis()).ins[d + '|t1'], 'inscrit dans la fourchette touchée');
  await assert.rejects(resa.pubNvInscrire(club.id, 'pl1', TOK, moi(9, { tier: 'inconnue' })), /fourchette/);
  await resa.pubNvInscrire(club.id, 'pl1', TOK, moi(2));
  // une fiche d'enfant : nommée comme les autres
  await ram.ops(coach, club.id, [{ coll: 'eleve', id: 'enf1', op: 'put', data: { n: 'Petit Enfant', sport: 'Padel', parents: ['x'], mail: 'enfant.liste@exemple.test', tel: '06 00 00 00 01' } }]);
  await resa.pubNvInscrire(club.id, 'pl1', TOK, moi(3, { email: 'enfant.liste@exemple.test', prenom: 'Petit', nom: 'Enfant' }));
  // un adhérent inscrit depuis l'appli (compte avec photo)
  await ram.ops(coach, club.id, [{ coll: 'post', id: 'pl1', op: 'patch', patch: [{ p: ['nv', 'ins', d + '|t1'], t: 'add', v: ka }, { p: ['nv', 'at', ka, d], t: 'set', v: Date.now() }] }]);
  const info = await resa.pubNv(club.id, 'pl1', TOK), t1 = info.dates[0].tiers[0], t2 = info.dates[0].tiers[1], sortie = JSON.stringify(info);
  assert.deepEqual(t2.inscrits.map(x => [x.nom || null, !!x.i]), [['Camille Public1', true]], 'nom et identifiant opaque');
  assert.ok(t1.inscrits.every(x => x.nom && x.i), 'tous nommés, avec un identifiant opaque');
  assert.ok(t1.inscrits.some(x => x.nom === 'Élève A27' && x.av === true), 'adhérent avec compte : nom et photo');
  assert.ok(t1.inscrits.some(x => x.nom === 'Petit Enfant'), 'liste d’attente et fiches d’enfant comprises');
  assert.equal(t1.n + t2.n, 4, 'tous comptent dans « N inscrits »');
  assert.ok(!/exemple\.test|06 55|06 00|"k"/.test(sortie), 'jamais d’e-mail, de téléphone');
  // la photo : par un identifiant opaque 
  const av = t1.inscrits.find(x => x.nom === 'Élève A27'), photo = await resa.pubNvAvatar(club.id, 'pl1', TOK, av.i);
  assert.equal(photo.mime, 'image/png');
  assert.equal(await resa.pubNvAvatar(club.id, 'pl1', TOK, 'inconnu'), null);
  await assert.rejects(resa.pubNvAvatar(club.id, 'pl1', 'faux', av.i), /pas valable/, 'mauvais jeton : rien');
  // adresse prouvée : l'inscription se rattache à la fiche choisie ; sans preuve la fiche demandée est ignorée (fiche à l'adresse saisie)
  await ram.ops(coach, club.id, [{ coll: 'eleve', id: 'ef1', op: 'put', data: { n: 'Léa Roy', sport: 'Padel', parents: [], mail: 'lea.liste@exemple.test', tel: '06 11 11 11 11' } }, { coll: 'eleve', id: 'ef2', op: 'put', data: { n: 'Tom Roy', sport: 'Padel', parents: [], mail: 'lea.liste@exemple.test', tel: '06 11 11 11 11' } }]);
  const sure = await resa.pubNvInscrire(club.id, 'pl1', TOK, moi(5, { email: 'lea.liste@exemple.test', verifie: 'lea.liste@exemple.test', fiche: 'ef2' }));
  assert.ok((await lis()).ins[d + '|t1'].includes('ef2') && !(await lis()).ins[d + '|t1'].includes('ef1'), 'rattachée à la fiche choisie');
  assert.equal(sure.statut === undefined, false);
  await assert.rejects(resa.pubNvInscrire(club.id, 'pl1', TOK, moi(6, { email: 'lea.liste@exemple.test', verifie: 'lea.liste@exemple.test', fiche: 'e3-pas-la-sienne' })), /pas la tienne/);
  await resa.pubNvInscrire(club.id, 'pl1', TOK, moi(7, { email: 'lea.liste@exemple.test', fiche: 'ef2', tier: 't2' }));
  assert.ok((await lis()).ins[d + '|t2'].includes('ef1'), 'sans adresse prouvée : fiche à l’adresse saisie, la fiche demandée est ignorée');
  // une fiche inconnue ou sans nom : jamais nommée (prudence)
  delete store.getIdentity;
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
  assert.deepEqual(await panne.verifier('https://calendar.google.com/a'), { ok: false, raison: 'injoignable' });
});

test('agenda relié : une adresse refusée par Google se voit au lieu de laisser tous les créneaux ouverts', async () => {
  const repond = (ok, status, corps) => Agenda.createAgenda({ fetchFn: async () => ({ ok, status, text: async () => corps }) });
  const u = 'https://calendar.google.com/calendar/ical/x/public/basic.ics';
  assert.deepEqual(await repond(false, 404, '<html>').verifier(u), { ok: false, raison: 'privee' }, 'agenda privé : adresse publique refusée');
  assert.deepEqual(await repond(true, 200, '<html>connexion</html>').verifier(u), { ok: false, raison: 'format' }, 'une page web n’est pas un agenda');
  const bon = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20260701T073000Z\r\nDTEND:20260701T083000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
  assert.deepEqual(await repond(true, 200, bon).verifier(u), { ok: true, evenements: 1 });
  const { clean } = require('../lib/formules');
  assert.equal(clean({ icals: [u, u] }).icals.length, 1, 'la même adresse deux fois : gardée une fois');
});

test('agenda relié : séries déplacées, plusieurs jours, mois et années', () => {
  const ics = ev => ['BEGIN:VCALENDAR', ...ev.flatMap(e => ['BEGIN:VEVENT', ...e, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
  const P = 'TZID=Europe/Paris';
  /* une date de la série déplacée : l'ancienne heure se libère, la nouvelle est prise */
  const deplace = ics([
    ['UID:a', `DTSTART;${P}:20261102T100000`, `DTEND;${P}:20261102T110000`, 'RRULE:FREQ=WEEKLY;BYDAY=MO'],
    ['UID:a', `RECURRENCE-ID;${P}:20261109T100000`, `DTSTART;${P}:20261109T150000`, `DTEND;${P}:20261109T160000`]
  ]);
  assert.deepEqual(Agenda.parseIcs(deplace, '2026-11-02', '2026-11-16'), [{ d: '2026-11-02', du: 600, au: 660 }, { d: '2026-11-16', du: 600, au: 660 }, { d: '2026-11-09', du: 900, au: 960 }]);
  /* une date annulée seule : rien ce jour-là */
  const annule = ics([
    ['UID:b', `DTSTART;${P}:20261102T100000`, `DTEND;${P}:20261102T110000`, 'RRULE:FREQ=WEEKLY'],
    ['UID:b', `RECURRENCE-ID;${P}:20261109T100000`, `DTSTART;${P}:20261109T100000`, `DTEND;${P}:20261109T110000`, 'STATUS:CANCELLED']
  ]);
  assert.deepEqual(Agenda.parseIcs(annule, '2026-11-09', '2026-11-09'), []);
  /* sur plusieurs jours : chacun est pris, jusqu'à l'heure de fin */
  assert.deepEqual(Agenda.parseIcs(ics([[`DTSTART;${P}:20261109T180000`, `DTEND;${P}:20261111T100000`]]), '2026-11-09', '2026-11-30'), [{ d: '2026-11-09', du: 1080, au: 1440 }, { d: '2026-11-10', du: 0, au: 1440 }, { d: '2026-11-11', du: 0, au: 600 }]);
  /* un jour sur deux semaines, comptées depuis le lundi : le lundi suivant un mercredi de départ n'en est pas */
  const deuxSemaines = ics([[`DTSTART;${P}:20261104T100000`, `DTEND;${P}:20261104T110000`, 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE']]);
  assert.deepEqual(Agenda.parseIcs(deuxSemaines, '2026-11-04', '2026-11-18').map(x => x.d), ['2026-11-04', '2026-11-16', '2026-11-18']);
  /* tous les mois : le même jour, le 2e mardi, le dernier vendredi ; tous les ans */
  const dates = (r, de, a) => Agenda.parseIcs(ics([[`DTSTART;${P}:${de}T100000`, `DTEND;${P}:${de}T110000`, r]]), '2026-11-01', a).map(x => x.d);
  assert.deepEqual(dates('RRULE:FREQ=MONTHLY', '20261015', '2027-01-31'), ['2026-11-15', '2026-12-15', '2027-01-15']);
  assert.deepEqual(dates('RRULE:FREQ=MONTHLY;BYDAY=2TU', '20261013', '2026-12-31'), ['2026-11-10', '2026-12-08']);
  assert.deepEqual(dates('RRULE:FREQ=MONTHLY;BYDAY=-1FR', '20261030', '2026-12-31'), ['2026-11-27', '2026-12-25']);
  assert.deepEqual(dates('RRULE:FREQ=YEARLY', '20241120', '2027-12-31'), ['2026-11-20', '2027-11-20']);
  /* une exception posée en date seule */
  assert.deepEqual(dates('RRULE:FREQ=WEEKLY\r\nEXDATE;VALUE=DATE:20261109', '20261102', '2026-11-16'), ['2026-11-02', '2026-11-16']);
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
  // le coach annule dans /Dojo
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

test('Calendly et /Buvette : une réservation Calendly bloque le créneau, son annulation le rend ; jamais deux cours au même moment', async () => {
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


test('date passée : refusée à l’élève (réservation) et à la page publique ; seul l’enseignant peut programmer dans le passé', async () => {
  const { coach, club, key, d, a } = await monte(91);
  await Formules.save(store, coach, Object.assign(await Formules.get(store, coach), { page: club.id }));
  const passe = REGLES.addDays(d, -14);   // même jour de la semaine que les disponibilités, deux semaines plus tôt
  await assert.rejects(resa.reserver(a, club.id, key, { d: passe, t: 540, formule: 'f1', objectif: 'Volée' }), /pris|invalide/, 'élève : date passée refusée');
  const b = { d: passe, t: 540, formule: 'f1', prenom: 'Léa', nom: 'Roy', email: 'lea91@exemple.test', tel: '06 00 00 00 00', objectif: 'Volée', accord: true };
  await assert.rejects(resa.pubReserver(club.id, key, b), /pris|invalide/, 'page publique : date passée refusée');
  const c = await resa.pubCreneaux(club.id, key, passe);
  assert.deepEqual(c.jours[0].libres, [], 'aucun créneau offert dans le passé');
});
