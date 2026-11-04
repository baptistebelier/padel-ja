/* /RAM Club — notifications sur le téléphone : les bonnes personnes sont prévenues, jamais l'auteur,
   et chacun peut couper un type de notification ou mettre un groupe en sourdine */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { createRamClub } = require('../lib/ramclub');
const { createNotifier } = require('../lib/pushnotif');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-notif-'));
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const ram = createRamClub(DIR);
if (saved.url) process.env.SUPABASE_URL = saved.url;
if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;

const sent = [];
createNotifier({ ram, push: { send: async (uid, msg) => { sent.push([uid, msg]); return 1; } } });
const settle = () => new Promise(r => setTimeout(r, 30));
const to = () => sent.map(x => x[0]).sort();
const item = (s, coll, id) => (s.items.find(i => i.coll === coll && i.id === id) || {}).data;

test('notifications : publications, groupes, commentaires, réglages', async () => {
  const club = await ram.create({ id: 'B', name: 'Hugo Martin' }, { name: 'TC Notif', short: 'TCN' });
  const keys = { B: (await ram.myClubs('B'))[0].key };
  for (const u of [{ id: 'A', name: 'Inès Faure' }, { id: 'C', name: 'Paul Girard' }, { id: 'D', name: 'Léa Roux' }]) {
    const j = await ram.join(u, club.code);
    keys[u.id] = j.key;
    const season = item(await ram.sync('B', club.id, 0), 'conf', 'main').season;
    // D reste en attente de validation : elle n'est pas prévenue
    if (u.id !== 'D') await ram.ops('B', club.id, [{ coll: 'member', id: j.key, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }, { p: ['req'], t: 'unset' }] }]);
  }
  await settle(); sent.length = 0;

  // publication du club : tous les adhérents validés, sauf son auteur
  await ram.ops('B', club.id, [{ coll: 'post', id: 'p1', op: 'put', data: { by: 'club', kind: 'news', title: 'Tournoi de Noël', d: '2026-12-20' } }]);
  await settle();
  assert.deepEqual(to(), ['A', 'C']);
  assert.match(sent[0][1].body, /Tournoi de Noël/);
  assert.match(sent[0][1].url, new RegExp('^#/post/p1\\?club=' + club.id));

  // Paul coupe « Le club » dans ses réglages : il n'est plus prévenu
  sent.length = 0;
  await ram.ops('C', club.id, [{ coll: 'prefs', id: keys.C, op: 'put', data: { nset: { club: false } } }]);
  await ram.ops('B', club.id, [{ coll: 'post', id: 'p2', op: 'put', data: { by: 'club', kind: 'news', title: 'Fermeture lundi' } }]);
  await settle();
  assert.deepEqual(to(), ['A']);

  // commentaire sur la publication d'Inès : elle seule est prévenue
  await ram.ops('A', club.id, [{ coll: 'post', id: 'p3', op: 'put', data: { by: keys.A, kind: 'photo', x: 'Belle partie' } }]);
  await settle(); sent.length = 0;
  await ram.ops('C', club.id, [{ coll: 'msg', id: 'm1', op: 'put', data: { ref: 'p:p3', by: keys.C, x: 'Bravo !', at: Date.now() } }]);
  await settle();
  assert.deepEqual(to(), ['A']);
  assert.match(sent[0][1].body, /Paul a commenté/);

  // message dans un groupe : ses membres seulement ; en sourdine, plus rien
  await ram.ops('B', club.id, [{ coll: 'group', id: 'g1', op: 'put', data: { type: 'train', name: 'Groupe ados', mem: [keys.A, keys.C] } },
    { coll: 'chan', id: 'g1', op: 'put', data: { g: 'train', name: 'Groupe ados' } }]);
  await settle(); sent.length = 0;
  await ram.ops('A', club.id, [{ coll: 'msg', id: 'm2', op: 'put', data: { ref: 'c:g1', by: keys.A, x: 'Qui joue samedi ?', at: Date.now() } }]);
  await settle();
  assert.deepEqual(to(), ['C']);
  sent.length = 0;
  await ram.ops('C', club.id, [{ coll: 'prefs', id: keys.C, op: 'put', data: { nset: { club: false }, mute: ['g1'] } }]);
  await ram.ops('A', club.id, [{ coll: 'msg', id: 'm3', op: 'put', data: { ref: 'c:g1', by: keys.A, x: 'Personne ?', at: Date.now() } }]);
  await settle();
  assert.deepEqual(to(), []);

  // tournoi /RAM JA publié par le serveur : l'inscrit est prévenu, puis de l'horaire de son match
  const ja = list => ({ by: 'club', kind: 'jatour', title: 'Open TCN', d: '2026-11-08', ja: { status: 'open', list } });
  await ram.serverPut(club.id, 'post', 'ja-t1', ja([]));
  await settle(); sent.length = 0;
  await ram.serverPut(club.id, 'post', 'ja-t1', ja([{ k1: keys.A, n1: 'Inès Faure', n2: 'Zoé Petit' }]));
  await settle();
  assert.deepEqual(to(), ['A']);
  assert.match(sent[0][1].body, /Inscrit au tournoi « Open TCN »/);
  sent.length = 0;
  const at = Date.UTC(2026, 10, 8, 13, 30);
  await ram.serverPut(club.id, 'post', 'ja-t1', ja([{ k1: keys.A, next: { at, court: 'Piste 2' } }]));
  await settle();
  assert.equal(sent.length, 1);
  assert.match(sent[0][1].body, /Ton match : 14 h 30 · Piste 2/);
});

test('pastilles : nouveautés de mes autres clubs depuis ma dernière visite', async () => {
  const c1 = await ram.create({ id: 'P1', name: 'Pia Dumas' }, { name: 'TC Un', short: 'TC1' });
  const c2 = await ram.create({ id: 'P2', name: 'Rémi Blanc' }, { name: 'Padel Deux', short: 'PD2' });
  const j = await ram.join({ id: 'Z', name: 'Zoé Morel' }, c2.code);
  await ram.join({ id: 'Z', name: 'Zoé Morel' }, c1.code);
  const season = item(await ram.sync('P2', c2.id, 0), 'conf', 'main').season;
  await ram.ops('P2', c2.id, [{ coll: 'member', id: j.key, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }, { p: ['req'], t: 'unset' }] }]);
  const t0 = Date.now() - 1000;
  await ram.ops('P2', c2.id, [{ coll: 'post', id: 'n1', op: 'put', data: { by: 'club', kind: 'news', title: 'Soirée padel', at: Date.now() } },
    { coll: 'post', id: 'n0', op: 'put', data: { by: 'club', kind: 'news', title: 'Ancienne', at: t0 - 5000 } },
    { coll: 'msg', id: 'mm', op: 'put', data: { ref: 'c:general', by: 'club', x: 'Bonjour', at: Date.now() } },
    { coll: 'chan', id: 'general', op: 'put', data: { g: 'club', name: 'Général' } }]);
  const b = await ram.badges('Z', { [c2.id]: t0 });
  assert.equal(b[c2.id], 2, 'une publication et un message depuis ma visite');
  assert.equal(b[c1.id], undefined, 'adhésion pas encore validée : rien');
});

test('/RAM Coach : réservation, inscrit de plus et annulation, prévenus dans l’appli Coach', async () => {
  const club = await ram.create({ id: 'K', name: 'Baptiste Coach' }, { name: 'Padel Résa', short: 'PR' });
  const key = (await ram.myClubs('K'))[0].key;
  await settle(); sent.length = 0;
  // posée par le serveur au nom de l'enseignant (Calendly) : il est prévenu quand même
  const g = { type: 'train', name: 'Cours individuel', once: '2026-11-05', h: '18 h 30', dur: '1 h', coach: key, mem: [], ext: ['e1'], cal: 'https://api.calendly.com/scheduled_events/E1' };
  await ram.ops('K', club.id, [{ coll: 'eleve', id: 'e1', op: 'put', data: { n: 'Nina Anglade' } }, { coll: 'group', id: 'gr', op: 'put', data: g }]);
  await settle();
  assert.deepEqual(sent.map(x => [x[0], x[1].app]), [['K', 'coach']]);
  assert.match(sent[0][1].body, /Nouvelle réservation : Cours individuel jeudi 5 novembre à 18 h 30 avec Nina/);
  sent.length = 0;
  await ram.ops('K', club.id, [{ coll: 'group', id: 'gr', op: 'patch', patch: [{ p: ['cancel'], t: 'add', v: '2026-11-05' }] }]);
  await settle();
  assert.match(sent[0][1].body, /Séance annulée/);
});

/* ---------- réservation : chaque notification du module, avec de vrais comptes ---------- */
async function clubCours(n) {
  const coach = 'CC' + n, club = await ram.create({ id: coach, name: 'Sarah Coach' }, { name: 'Club ' + n, short: 'C' + n });
  const key = (await ram.myClubs(coach))[0].key;
  await ram.ops(coach, club.id, [{ coll: 'conf', id: 'main', op: 'put', data: { name: 'Club ' + n, season: 'S' } }]);
  const j = await ram.join({ id: 'EE' + n, name: 'Nina Anglade' }, club.code);
  await ram.ops(coach, club.id, [{ coll: 'member', id: j.key, op: 'put', data: { n: 'Nina Anglade', valid: 'S' } }]);
  await settle(); sent.length = 0;
  return { coach, club, key, el: 'EE' + n, ek: j.key };
}
const D = '2031-03-04', D2 = '2031-03-11';
const dernier = () => sent.map(x => [x[0], x[1].app || 'club', x[1].body]);

test('absence : un élève l’annonce sur son cours réservé, l’enseignant est prévenu dans /RAM Coach', async () => {
  const { coach, club, key, el, ek } = await clubCours(1);
  await ram.ops(coach, club.id, [{ coll: 'cours', id: 'r1', op: 'put', data: { type: 'train', name: 'Cours individuel', once: D, h: '9 h', dur: '1 h', coach: key, mem: [ek], cal: 'ram:r1' } }], { client: true });
  await settle(); sent.length = 0;
  const r = await ram.ops(el, club.id, [{ coll: 'cours', id: 'r1', op: 'patch', patch: [{ p: ['resp', D, ek], t: 'set', v: 'no' }] }], { client: true });
  assert.deepEqual(r.rejected, [], 'le serveur accepte');
  await settle();
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], coach);
  assert.equal(sent[0][1].app, 'coach');
  assert.match(sent[0][1].body, /Nina sera absent : Cours individuel, .* à 9 h/);
  sent.length = 0;
  await ram.ops(el, club.id, [{ coll: 'cours', id: 'r1', op: 'patch', patch: [{ p: ['resp', D, ek], t: 'set', v: 'ok' }] }], { client: true });
  await settle();
  assert.match(sent[0][1].body, /Nina sera finalement là/);
});

test('absence : un élève ne répond que pour lui, sur son cours, et ne change rien d’autre', async () => {
  const { coach, club, key, el, ek } = await clubCours(2);
  await ram.ops(coach, club.id, [
    { coll: 'cours', id: 'r1', op: 'put', data: { type: 'train', name: 'A', once: D, h: '9 h', coach: key, mem: [ek] } },
    { coll: 'cours', id: 'r2', op: 'put', data: { type: 'train', name: 'B', once: D, h: '9 h', coach: key, mem: [] } }
  ]);
  const essai = async (id, patch) => (await ram.ops(el, club.id, [{ coll: 'cours', id, op: 'patch', patch }])).rejected.length;
  assert.equal(await essai('r2', [{ p: ['resp', D, ek], t: 'set', v: 'no' }]), 1, 'pas le cours d’un autre');
  assert.equal(await essai('r1', [{ p: ['resp', D, 'autre'], t: 'set', v: 'no' }]), 1, 'pas pour un autre élève');
  assert.equal(await essai('r1', [{ p: ['mem'], t: 'add', v: ek }]), 1, 'pas les participants');
  assert.equal(await essai('r1', [{ p: ['abs', D], t: 'add', v: ek }]), 0, 'sa propre absence');
});

test('absence sur un groupe, par un parent pour son enfant : l’enseignant est prévenu', async () => {
  const { coach, club, key, el, ek } = await clubCours(3);
  await ram.ops(coach, club.id, [
    { coll: 'member', id: 'kid3', op: 'put', data: { n: 'Léo Anglade', parent: ek, valid: 'S' } },
    { coll: 'group', id: 'g1', op: 'put', data: { type: 'train', name: 'Mini-tennis', day: 2, h: '17 h', dur: '1 h', coach: key, mem: ['kid3'] } }
  ]);
  await settle(); sent.length = 0;
  await ram.ops(el, club.id, [{ coll: 'group', id: 'g1', op: 'patch', patch: [{ p: ['abs', D], t: 'add', v: 'kid3' }] }]);
  await settle();
  assert.deepEqual(dernier().map(x => x.slice(0, 2)), [[coach, 'coach']]);
  assert.match(sent[0][1].body, /Léo sera absent : Mini-tennis/);
});

test('l’enseignant annule, rétablit, déplace, change le lieu : les élèves sont prévenus, pas lui', async () => {
  const { coach, club, key, el, ek } = await clubCours(4);
  const c = { type: 'train', name: 'Cours individuel', once: D, h: '9 h', dur: '1 h', coach: key, mem: [ek], cal: 'ram:r1' };
  await ram.ops(coach, club.id, [{ coll: 'cours', id: 'r1', op: 'put', data: c }, { coll: 'group', id: 'g1', op: 'put', data: { type: 'train', name: 'Collectif', day: 2, h: '17 h', dur: '1 h', coach: key, mem: [ek] } }], { client: true });
  await settle();
  const patch = async (coll, id, p) => { sent.length = 0; await ram.ops(coach, club.id, [{ coll, id, op: 'patch', patch: p }], { client: true }); await settle(); return dernier(); };
  let l = await patch('cours', 'r1', [{ p: ['cancel'], t: 'add', v: D }]);
  assert.deepEqual(l.map(x => x[0]), [el], 'l’élève seul');
  assert.match(l[0][2], /Cours annulé : Cours individuel/);
  l = await patch('cours', 'r1', [{ p: ['cancel'], t: 'rm', v: D }]);
  assert.match(l[0][2], /Cours rétabli/);
  l = await patch('cours', 'r1', [{ p: ['once'], t: 'set', v: D2 }, { p: ['h'], t: 'set', v: '10 h' }]);
  assert.match(l[0][2], /Cours déplacé : Cours individuel, .* à 10 h/);
  l = await patch('group', 'g1', [{ p: ['loc', D], t: 'set', v: 'Extérieur' }]);
  assert.match(l[0][2], /le cours aura lieu en extérieur/);
  l = await patch('group', 'g1', [{ p: ['cancel'], t: 'add', v: D }]);
  assert.match(l[0][2], /Cours annulé : Collectif/);
  l = await patch('group', 'g1', [{ p: ['skip'], t: 'add', v: D }, { p: ['extra'], t: 'add', v: D2 }]);
  assert.match(l[0][2], /Collectif : la séance du .* passe au /);
});

test('un cours posé par l’enseignant : l’élève est prévenu ; une date passée : personne', async () => {
  const { coach, club, key, el, ek } = await clubCours(5);
  await ram.ops(coach, club.id, [{ coll: 'cours', id: 'n1', op: 'put', data: { type: 'train', name: 'Cours duo', once: D, h: '9 h', coach: key, mem: [ek] } }], { client: true });
  await settle();
  assert.deepEqual(to(), [el]);
  assert.match(sent[0][1].body, /Nouveau cours : Cours duo/);
  sent.length = 0;
  await ram.ops(coach, club.id, [{ coll: 'cours', id: 'n1', op: 'patch', patch: [{ p: ['cancel'], t: 'add', v: '2020-01-01' }] }], { client: true });
  await settle();
  assert.equal(sent.length, 0);
});

test('réglage « Mes cours » coupé : l’élève n’est plus prévenu', async () => {
  const { coach, club, key, el, ek } = await clubCours(6);
  await ram.ops(coach, club.id, [{ coll: 'cours', id: 'r1', op: 'put', data: { type: 'train', name: 'Cours', once: D, h: '9 h', coach: key, mem: [ek] } }]);
  await ram.ops(el, club.id, [{ coll: 'prefs', id: ek, op: 'put', data: { nset: { resa: false } } }]);
  await settle(); sent.length = 0;
  await ram.ops(coach, club.id, [{ coll: 'cours', id: 'r1', op: 'patch', patch: [{ p: ['cancel'], t: 'add', v: D }] }], { client: true });
  await settle();
  assert.equal(sent.length, 0);
});

test('réservation : l’élève réserve, se retire, annule ; l’enseignant apprend qui, l’élève n’est pas prévenu de son propre geste', async () => {
  const { coach, club, key, el, ek } = await clubCours(7);
  const c = { type: 'train', name: 'Cours', once: D, h: '9 h', coach: key, mem: [ek], cal: 'ram:r1' };
  // écrit par le serveur au nom de l'enseignant (lib/reservation.js)
  await ram.ops(coach, club.id, [{ coll: 'cours', id: 'r1', op: 'put', data: c }]);
  await settle();
  assert.deepEqual(dernier().map(x => [x[0], x[1]]), [[coach, 'coach']]);
  assert.match(sent[0][1].body, /Nouvelle réservation : Cours .* avec Nina/);
  sent.length = 0;
  await ram.ops(coach, club.id, [{ coll: 'cours', id: 'r1', op: 'put', data: Object.assign({}, c, { cancel: [D], annulePar: ek }) }]);
  await settle();
  assert.deepEqual(dernier().map(x => x[0]), [coach], 'l’élève qui annule n’est pas prévenu');
  assert.match(sent[0][1].body, /Nina annule : Cours/);
});

test('collectif : l’enseignant voit arriver et partir les inscrits avant le minimum', async () => {
  const { coach, club, key, el, ek } = await clubCours(8);
  const nv = { mode: 'cours', sport: 'Padel', theme: 'Volée', time: '18 h', dur: '1 h 30', dates: [D], tiers: [{ id: 't1', places: 4, min: 3 }], ins: {} };
  await ram.ops(coach, club.id, [{ coll: 'post', id: 'pc', op: 'put', data: { by: key, kind: 'niveaux', nv, at: Date.now() } }]);
  await settle(); sent.length = 0;
  await ram.ops(el, club.id, [{ coll: 'post', id: 'pc', op: 'patch', patch: [{ p: ['nv', 'ins', D + '|t1'], t: 'add', v: ek }] }]);
  await settle();
  const c = sent.filter(x => x[1].app === 'coach');
  assert.equal(c.length, 1);
  assert.match(c[0][1].body, /Nina s'inscrit : Volée/);
  sent.length = 0;
  await ram.ops(el, club.id, [{ coll: 'post', id: 'pc', op: 'patch', patch: [{ p: ['nv', 'ins', D + '|t1'], t: 'rm', v: ek }] }]);
  await settle();
  assert.match(sent.filter(x => x[1].app === 'coach')[0][1].body, /Nina se désinscrit : Volée/);
});

test('présence confirmée : l’enseignant est prévenu ; événement et collectif modifiés : les inscrits aussi', async () => {
  const { coach, club, key, el, ek } = await clubCours(9);
  await ram.ops(coach, club.id, [
    { coll: 'cours', id: 'r1', op: 'put', data: { type: 'train', name: 'Cours', once: D, h: '9 h', coach: key, mem: [ek] } },
    { coll: 'post', id: 'ev', op: 'put', data: { by: 'club', kind: 'event', mur: false, title: 'Tournoi interne', d: D, h1: '10 h', h2: '12 h', date: 'mar. 4 mars · 10 h – 12 h', place: 'Club', myBy: { [ek]: 'yes' } } },
    { coll: 'post', id: 'pc', op: 'put', data: { by: key, kind: 'niveaux', mur: false, nv: { mode: 'cours', sport: 'Padel', theme: 'Volée', time: '18 h', dur: '1 h', dates: [D], tiers: [{ id: 't1', places: 4 }], ins: { [D + '|t1']: [ek] } } } }
  ]);
  await settle(); sent.length = 0;
  await ram.ops(el, club.id, [{ coll: 'cours', id: 'r1', op: 'patch', patch: [{ p: ['resp', D, ek], t: 'set', v: 'ok' }] }]);
  await settle();
  assert.deepEqual(dernier().map(x => x.slice(0, 2)), [[coach, 'coach']]);
  assert.match(sent[0][1].body, /Nina sera présent : Cours/);
  sent.length = 0;
  await ram.ops(coach, club.id, [{ coll: 'post', id: 'ev', op: 'patch', patch: [{ p: ['d'], t: 'set', v: D2 }, { p: ['date'], t: 'set', v: 'mar. 11 mars · 10 h – 12 h' }] }]);
  await settle();
  assert.deepEqual(to(), [el]);
  assert.match(sent[0][1].body, /Modifié : Tournoi interne, mar\. 11 mars/);
  sent.length = 0;
  await ram.ops(coach, club.id, [{ coll: 'post', id: 'pc', op: 'patch', patch: [{ p: ['nv', 'time'], t: 'set', v: '19 h' }] }]);
  await settle();
  assert.deepEqual(to(), [el]);
  assert.match(sent[0][1].body, /Modifié : Volée, .* à 19 h/);
});

