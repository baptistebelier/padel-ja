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
const OFFRES_T = { formules: [{ id: 'f1', joueurs: 1, duree: 60, sport: 'Padel', prix: 30 }], packs: [{ id: 'p3', formule: 'f1', seances: 2, prix: 60 }] };
const notifier = createNotifier({ ram, formules: async () => OFFRES_T, push: { send: async (uid, msg) => { sent.push([uid, msg]); return 1; } } });
const settle = () => notifier.calme();   // attend que tout soit parti : jamais un délai au jugé (Render est lent)
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

/* ---------- le reste du catalogue ---------- */
async function clubDeux(n) {
  const x = await clubCours(n), j = await ram.join({ id: 'FF' + n, name: 'Paul Roux' }, x.club.code);
  await ram.ops(x.coach, x.club.id, [{ coll: 'member', id: j.key, op: 'put', data: { n: 'Paul Roux', valid: 'S', pl: 5, r: '15/1' } }, { coll: 'member', id: x.ek, op: 'put', data: { n: 'Nina Anglade', valid: 'S', pl: 5, r: '15/1' } }]);
  await settle(); sent.length = 0;
  return Object.assign(x, { p: 'FF' + n, pk: j.key });
}
const ops = async (who, club, l, opts) => { const r = await ram.ops(who, club.id, l, opts); assert.deepEqual(r.rejected, []); await settle(); const out = sent.slice(); sent.length = 0; return out; };
const corps = l => l.map(x => x[1].body).join(' | ');

test('ciblage : une annonce réservée aux femmes ne va pas à tout le club', async () => {
  const { coach, club, el, p, ek, pk } = await clubDeux(20);
  await ops(coach, club, [{ coll: 'member', id: ek, op: 'patch', patch: [{ p: ['g'], t: 'set', v: 'F' }] }, { coll: 'member', id: pk, op: 'patch', patch: [{ p: ['g'], t: 'set', v: 'H' }] }]);
  const l = await ops(coach, club, [{ coll: 'post', id: 'a1', op: 'put', data: { by: 'club', kind: 'annonce', title: 'Soirée', rule: { gen: 'Femmes' } } }]);
  assert.deepEqual(l.map(x => x[0]).sort(), [el], 'pas ' + p);
});

test('abonnés : nouvel abonné, résultat publié, classement mis à jour', async () => {
  const { club, el, p, ek, pk } = await clubDeux(21);
  let l = await ops(el, club, [{ coll: 'member', id: ek, op: 'patch', patch: [{ p: ['fo'], t: 'add', v: pk }] }]);
  assert.deepEqual(l.map(x => x[0]), [p]);
  assert.match(corps(l), /Nina te suit/);
  l = await ops(p, club, [{ coll: 'post', id: 'r1', op: 'put', data: { by: pk, kind: 'perf', res: { w: 1, opp: 'Luc', or: '15', sc: '6-3 6-4', perf: true } } }]);
  assert.deepEqual(l.map(x => x[0]), [el]);
  assert.match(corps(l), /Paul gagne contre Luc : 6-3 6-4 · perf/);
  l = await ops(p, club, [{ coll: 'member', id: pk, op: 'patch', patch: [{ p: ['r'], t: 'set', v: '15' }] }]);
  assert.deepEqual(l.map(x => x[0]), [el]);
  assert.match(corps(l), /Nouveau classement de tennis pour Paul : 15/);
  assert.equal(l.length, 1, 'le tennis seulement');
  l = await ops(p, club, [{ coll: 'member', id: pk, op: 'patch', patch: [{ p: ['pl'], t: 'set', v: 6 }] }]);
  assert.equal(l.length, 1, 'le niveau seulement');
  assert.match(corps(l), /Nouveau niveau de padel pour Paul : 6/);
  l = await ops(p, club, [{ coll: 'member', id: pk, op: 'patch', patch: [{ p: ['pad'], t: 'set', v: 2840 }] }]);
  assert.equal(l.length, 1, 'le classement seulement');
  assert.match(corps(l), /Nouveau classement de padel pour Paul : n° 2840/);
});

test('parties : recherche à mon niveau, désistement, attente, place libérée, créneau déplacé', async () => {
  const { club, el, p, ek, pk } = await clubDeux(22);
  const y = { sport: 'Padel', date: 'lun. 3', d: D, time: '18 h', dur: '1 h', fmt: 'Double', lo: 3, hi: 7, places: 1, in: [], wait: [] };
  let l = await ops(p, club, [{ coll: 'post', id: 'pl', op: 'put', data: { by: pk, kind: 'play', play: y } }]);
  assert.deepEqual(l.map(x => x[0]), [el]);
  assert.match(corps(l), /Paul cherche des joueurs : padel/);
  l = await ops(el, club, [{ coll: 'post', id: 'pl', op: 'patch', patch: [{ p: ['play', 'in'], t: 'add', v: ek }] }]);
  assert.match(corps(l), /Nina rejoint ta partie/);
  // le créateur note un autre joueur en attente, puis Nina se retire : le premier en attente est prévenu
  await ops(p, club, [{ coll: 'post', id: 'pl', op: 'patch', patch: [{ p: ['play', 'wait'], t: 'add', v: pk }] }]);
  l = await ops(el, club, [{ coll: 'post', id: 'pl', op: 'patch', patch: [{ p: ['play', 'in'], t: 'rm', v: ek }] }]);
  assert.match(corps(l), /Nina se désiste/);
  assert.match(corps(l), /Une place s'est libérée/);
  await ops(el, club, [{ coll: 'post', id: 'pl', op: 'patch', patch: [{ p: ['play', 'wait'], t: 'add', v: ek }] }]);
  l = await ops(p, club, [{ coll: 'post', id: 'pl', op: 'patch', patch: [{ p: ['play', 'time'], t: 'set', v: '19 h' }] }]);
  assert.ok(l.some(x => x[0] === el && /déplace sa partie .* 19 h/.test(x[1].body)));
});

test('événement : l’organisateur voit les inscrits, place libérée, suppression', async () => {
  const { coach, club, el, p, ek, pk } = await clubDeux(23);
  await ops(coach, club, [{ coll: 'post', id: 'e1', op: 'put', data: { by: 'club', kind: 'event', mur: false, title: 'Tournoi interne', date: 'sam.', cap: 1, myBy: {} } }]);
  let l = await ops(el, club, [{ coll: 'post', id: 'e1', op: 'patch', patch: [{ p: ['myBy', ek], t: 'set', v: 'yes' }] }]);
  assert.deepEqual(l.map(x => x[0]), [coach], 'le bureau');
  assert.match(corps(l), /Nina s'inscrit à « Tournoi interne »/);
  await ops(p, club, [{ coll: 'post', id: 'e1', op: 'patch', patch: [{ p: ['myBy', pk], t: 'set', v: 'wait' }] }]);
  l = await ops(el, club, [{ coll: 'post', id: 'e1', op: 'patch', patch: [{ p: ['myBy', ek], t: 'set', v: null }] }]);
  assert.ok(l.some(x => x[0] === p && /Une place s'est libérée/.test(x[1].body)), corps(l));
  l = await ops(coach, club, [{ coll: 'post', id: 'e1', op: 'del' }]);
  assert.deepEqual(l.map(x => x[0]), [p]);
  assert.match(corps(l), /Annulé : Tournoi interne/);
});

test('nouveau collectif : les adhérents de la fourchette, pas les autres', async () => {
  const { coach, club, key, el, p, pk } = await clubDeux(24);
  await ops(coach, club, [{ coll: 'member', id: pk, op: 'patch', patch: [{ p: ['pl'], t: 'set', v: 1 }] }]);
  const l = await ops(coach, club, [{ coll: 'post', id: 'c1', op: 'put', data: { by: key, kind: 'niveaux', mur: false, nv: { mode: 'cours', sport: 'Padel', theme: 'Volée', time: '18 h', dates: [D], tiers: [{ id: 't1', lo: 4, hi: 7, places: 4 }], ins: {} } } }]);
  assert.deepEqual(l.map(x => x[0]), [el], 'pas ' + p);
  assert.match(corps(l), /Nouvelle séance collective : Volée/);
});

test('équipe créée avec ses joueurs et son capitaine : chacun est prévenu, même sans adhésion validée', async () => {
  const { coach, club, p, ek, pk } = await clubDeux(26);
  await ops(coach, club, [{ coll: 'member', id: ek, op: 'patch', patch: [{ p: ['valid'], t: 'unset' }] }]);
  const l = await ops(coach, club, [{ coll: 'group', id: 't9', op: 'put', data: { type: 'team', name: 'Équipe 2', cap: pk, mem: [ek, pk] } }]);
  assert.ok(l.some(x => /Tu es ajouté à Équipe 2/.test(x[1].body) && x[0] !== p), 'le joueur sans adhésion validée : ' + corps(l));
  assert.ok(l.some(x => x[0] === p && /Tu es capitaine : Équipe 2/.test(x[1].body)), corps(l));
});

test('équipe : capitaine nommé, réponse à la convocation, fin de rencontre', async () => {
  const { coach, club, el, p, ek, pk } = await clubDeux(25);
  await ops(coach, club, [{ coll: 'group', id: 't1', op: 'put', data: { type: 'team', name: 'Équipe 1', mem: [ek, pk] } }, { coll: 'rec', id: 'm1', op: 'put', data: { tid: 't1', opp: 'TC Tulle', st: 'soon' } }]);
  let l = await ops(coach, club, [{ coll: 'group', id: 't1', op: 'patch', patch: [{ p: ['cap'], t: 'set', v: pk }] }]);
  assert.deepEqual(l.map(x => x[0]), [p]);
  assert.match(corps(l), /Tu es capitaine : Équipe 1/);
  l = await ops(coach, club, [{ coll: 'rec', id: 'm1', op: 'patch', patch: [{ p: ['conv', ek], t: 'set', v: 'ok' }] }]);
  assert.ok(l.some(x => x[0] === p && /Nina est dispo contre TC Tulle/.test(x[1].body)), corps(l));
  await ops(coach, club, [{ coll: 'rec', id: 'm1', op: 'patch', patch: [{ p: ['st'], t: 'set', v: 'live' }] }]);
  l = await ops(coach, club, [{ coll: 'rec', id: 'm1', op: 'patch', patch: [{ p: ['st'], t: 'set', v: 'done' }] }]);
  assert.deepEqual(l.map(x => x[0]).sort(), [el, p].sort());
  assert.match(corps(l), /TC Tulle : fin de la rencontre/);
});

test('commission, adhésion, trophée, bar, signalement', async () => {
  const { coach, club, key, el, ek } = await clubDeux(26);
  await ops(coach, club, [{ coll: 'comm', id: 'c1', op: 'put', data: { name: 'Animation', resp: key, mem: [], req: [] } }]);
  let l = await ops(el, club, [{ coll: 'comm', id: 'c1', op: 'patch', patch: [{ p: ['req'], t: 'add', v: ek }] }]);
  assert.deepEqual(l.map(x => x[0]), [coach]);
  assert.match(corps(l), /Nina souhaite rejoindre : animation/);
  l = await ops(coach, club, [{ coll: 'comm', id: 'c1', op: 'patch', patch: [{ p: ['req'], t: 'rm', v: ek }] }]);
  assert.match(corps(l), /Ta demande n'est pas retenue/);
  await ops(coach, club, [{ coll: 'member', id: ek, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: '' }] }]);
  l = await ops(coach, club, [{ coll: 'member', id: ek, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: 'S' }] }]);
  assert.ok(l.some(x => x[0] === el && /adhésion est validée pour la saison S/.test(x[1].body)), corps(l));
  await ops(el, club, [{ coll: 'stats', id: ek, op: 'patch', patch: [{ p: ['x'], t: 'set', v: 1 }] }]);
  l = await ops(coach, club, [{ coll: 'stats', id: ek, op: 'patch', patch: [{ p: ['k'], t: 'add', v: 'award:invaincu' }] }]);
  assert.deepEqual(l.map(x => x[0]), [el]);
  assert.match(corps(l), /décerne un trophée/);
  l = await ops(el, club, [{ coll: 'report', id: 'r1', op: 'put', data: { kind: 'com', by: ek, author: key, excerpt: 'Propos déplacés' } }]);
  assert.deepEqual(l.map(x => x[0]), [coach]);
  assert.match(corps(l), /Signalement de Nina : Propos déplacés/);
  assert.equal((await ram.ops(el, club.id, [{ coll: 'report', id: 'r2', op: 'put', data: { kind: 'com', by: 'quelqu1', excerpt: 'x' } }])).rejected.length, 1, 'pas au nom d’un autre');
  await ops(coach, club, [{ coll: 'bar', id: 'b1', op: 'put', data: { name: 'Burger', resa: true, moments: ['midi'] } }]);
  await ops(el, club, [{ coll: 'order', id: 'o1', op: 'put', data: { by: ek, item: 'b1', date: '2031-03-04', moment: 'midi', qty: 1, st: 'ok' } }]);
  l = await ops(el, club, [{ coll: 'order', id: 'o1', op: 'patch', patch: [{ p: ['st'], t: 'set', v: 'annule' }] }]);
  assert.deepEqual(l.map(x => x[0]), [coach]);
  assert.match(corps(l), /Nina annule : 1 × Burger/);
});

test('appel : l’enseignant apprend qu’un paiement arrive et qu’un pack est terminé', async () => {
  const { coach, club, key, ek } = await clubDeux(27);
  await ops(coach, club, [
    { coll: 'group', id: 'g1', op: 'put', data: { type: 'train', name: 'Cours', day: 1, h: '9 h', dur: '1 h', sport: 'Padel', coach: key, mem: [ek], cycles: [{ id: 'c1', dates: ['2026-01-05', '2026-01-12'] }] } },
    { coll: 'eleve', id: ek, op: 'put', data: { n: 'Nina Anglade', achats: [
      { id: 'hc', t: 'pack', ref: 'p3', d: '2026-01-01', nom: 'Cycle', n: 10, prix: 200, cycle: 'g1:c1', pay: { ech: [{ s: 1, m: 100, ok: '2026-01-01' }, { s: 2, m: 100, ok: '' }] } }
    ] } }
  ]);
  let l = await ops(coach, club, [{ coll: 'seance', id: 'g1.2026-01-05', op: 'put', data: { g: 'g1', d: '2026-01-05', pres: { [ek]: 'P' } } }]);
  assert.equal(l.length, 0, 'la 1re échéance est déjà réglée');
  l = await ops(coach, club, [{ coll: 'seance', id: 'g1.2026-01-12', op: 'put', data: { g: 'g1', d: '2026-01-12', pres: { [ek]: 'P' } } }]);
  assert.deepEqual(l.map(x => [x[0], x[1].app]), [[coach, 'coach']]);
  assert.match(corps(l), /Nina : paiement attendu de 100 €, Cycle/);
});

test('la veille à 18 h : rappel du cours de groupe, résumé à l’enseignant ; un absent n’a pas de rappel', async () => {
  const { coach, club, key, el, p, ek, pk } = await clubDeux(28);
  const REGLES = require('../club/regles.js'), t = '2031-03-03', d = REGLES.addDays(t, 1);
  await ops(coach, club, [{ coll: 'group', id: 'g1', op: 'put', data: { type: 'train', name: 'Collectif', day: REGLES.dowOf(d), h: '17 h', dur: '1 h', coach: key, mem: [ek, pk], abs: { [d]: [pk] } } }]);
  await notifier.veille(t);
  const miens = sent.filter(x => x[1].tag.startsWith(club.id));
  assert.deepEqual(miens.filter(x => /Rappel/.test(x[1].body)).map(x => x[0]), [el], 'pas ' + p);
  assert.match(miens.find(x => x[0] === el)[1].body, /Rappel : Collectif avec Sarah, demain à 17 h/);
  const c = miens.find(x => x[0] === coach);
  assert.equal(c[1].app, 'coach');
  assert.match(c[1].body, /Demain : 1 séance, la première à 17 h/);
  assert.doesNotMatch(c[1].body, /bilan/, 'pas de rappel de bilan de séance');
  sent.length = 0;
  // cycles : objectifs à fixer la veille de la première séance, bilan à écrire le soir de la dernière
  await ops(coach, club, [
    { coll: 'group', id: 'g1', op: 'patch', patch: [{ p: ['cycles'], t: 'set', v: [{ id: 'c1', nom: 'Printemps', dates: [d, REGLES.addDays(d, 7)] }] }] },
    { coll: 'group', id: 'g2', op: 'put', data: { type: 'train', name: 'Ados', day: REGLES.dowOf(t), h: '18 h', dur: '1 h', coach: key, mem: [ek], cycles: [{ id: 'c2', nom: 'Hiver', dates: [REGLES.addDays(t, -7), t] }] } }
  ]);
  sent.length = 0;
  await notifier.veille(t);
  const c2 = sent.find(x => x[0] === coach && x[1].tag.startsWith(club.id));
  assert.match(c2[1].body, /Un cycle commence demain : objectifs à fixer/);
  assert.match(c2[1].body, /Cycle terminé : bilan de cycle à écrire/);
  sent.length = 0;
});

test('séance : nouveau thème, remplaçant, élève ajouté ou retiré de la séance : l’élève avec compte est prévenu', async () => {
  const { coach, club, key, el, p, ek, pk } = await clubDeux(29);
  const REGLES = require('../club/regles.js');
  await ops(coach, club, [{ coll: 'group', id: 'g1', op: 'put', data: { type: 'train', name: 'Collectif', day: REGLES.dowOf(D), h: '17 h', dur: '1 h', coach: key, mem: [ek] } }]);
  let l = await ops(coach, club, [{ coll: 'seance', id: 'g1.' + D, op: 'put', data: { g: 'g1', d: D, theme: 'Lob défensif' } }]);
  assert.deepEqual(l.map(x => x[0]), [el], 'l’élève, pas l’enseignant');
  assert.match(corps(l), /Collectif, .* : thème « Lob défensif »/);
  l = await ops(coach, club, [{ coll: 'seance', id: 'g1.' + D, op: 'patch', patch: [{ p: ['coach'], t: 'set', v: pk }] }]);
  assert.match(corps(l), /Paul remplace ton enseignant/);
  l = await ops(coach, club, [{ coll: 'seance', id: 'g1.' + D, op: 'patch', patch: [{ p: ['plus'], t: 'set', v: [pk] }] }]);
  assert.deepEqual(l.map(x => x[0]), [p]);
  assert.match(corps(l), /Tu es ajouté à la séance Collectif/);
  l = await ops(coach, club, [{ coll: 'seance', id: 'g1.' + D, op: 'patch', patch: [{ p: ['out'], t: 'set', v: [ek] }] }]);
  assert.deepEqual(l.map(x => x[0]), [el]);
  assert.match(corps(l), /Tu es retiré de la séance Collectif/);
  // une séance passée : personne
  l = await ops(coach, club, [{ coll: 'seance', id: 'g1.2020-01-07', op: 'put', data: { g: 'g1', d: '2020-01-07', theme: 'Vieux' } }]);
  assert.equal(l.length, 0);
  // la veille, le rappel nomme le remplaçant
  await ops(coach, club, [{ coll: 'seance', id: 'g1.' + D, op: 'patch', patch: [{ p: ['out'], t: 'set', v: [] }] }]);
  await notifier.veille(REGLES.addDays(D, -1));
  const r = sent.filter(x => x[1].tag.startsWith(club.id) && /Rappel/.test(x[1].body));
  assert.match(r.find(x => x[0] === el)[1].body, /avec Paul/);
  sent.length = 0;
});

test('cycle : nouvel enseignant, nouveau thème, bilan de fin de cycle : les élèves du groupe sont prévenus', async () => {
  const { coach, club, key, el, ek, pk } = await clubDeux(30);
  const g = c => ({ type: 'train', name: 'Collectif', day: 2, h: '17 h', dur: '1 h', coach: key, mem: [ek], cycles: [Object.assign({ id: 'c1', nom: 'Automne', dates: [D, D2] }, c)] });
  await ops(coach, club, [{ coll: 'group', id: 'g1', op: 'put', data: g({}) }]);
  let l = await ops(coach, club, [{ coll: 'group', id: 'g1', op: 'put', data: g({ coach: pk, coachH: [{ au: '2031-01-01', coach: '' }] }) }]);
  assert.deepEqual(l.map(x => x[0]), [el]);
  assert.match(corps(l), /Paul enseigne désormais le cycle « Automne »/);
  l = await ops(coach, club, [{ coll: 'group', id: 'g1', op: 'put', data: g({ coach: pk, theme: 'Jeu au filet' }) }]);
  assert.match(corps(l), /thème du cycle « Jeu au filet »/);
  l = await ops(coach, club, [{ coll: 'group', id: 'g1', op: 'put', data: g({ coach: pk, theme: 'Jeu au filet', bilan: 'Beaux progrès' }) }]);
  assert.match(corps(l), /bilan de fin de cycle « Automne »/);
});

test('appel fait depuis /RAM Club : il compte pour les paiements comme celui de /RAM Coach', async () => {
  const { coach, club, key, ek } = await clubDeux(31);
  await ops(coach, club, [
    { coll: 'group', id: 'g1', op: 'put', data: { type: 'train', name: 'Cours', day: 1, h: '9 h', dur: '1 h', sport: 'Padel', coach: key, mem: [ek], att: { '2026-01-05': { [ek]: true } }, cycles: [{ id: 'c1', dates: ['2026-01-05', '2026-01-12'] }] } },
    { coll: 'eleve', id: ek, op: 'put', data: { n: 'Nina Anglade', achats: [
      { id: 'hc', t: 'pack', ref: 'p3', d: '2026-01-01', nom: 'Cycle', n: 10, prix: 200, cycle: 'g1:c1', groupe: 'g1', pay: { ech: [{ s: 2, m: 100, ok: '' }] } }
    ] } }
  ]);
  // la séance du 5 n'a que l'appel du Club (g.att) ; celle du 12, l'appel écrit par le Club dans la séance
  const l = await ops(coach, club, [{ coll: 'seance', id: 'g1.2026-01-12', op: 'put', data: { g: 'g1', d: '2026-01-12', pres: { [ek]: 'P' } } }]);
  assert.match(corps(l), /Nina : paiement attendu de 100 €, Cycle/, 'les deux séances comptent');
});

