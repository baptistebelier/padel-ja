/* /RAM Club — trophées et classements : profil vérifié par le serveur, plafond quotidien par type d'action,
   classement par saison (septembre à août) en plus du total à vie, trophées du jeu réel,
   et choix de ne pas apparaître dans le classement */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { deriveCounts, memberProgress, clubScores, seasonScores, clubBoards, seasonRange, profilComplet, CAPS } = require('../lib/ram-score');

const mem = (id, data = {}) => [`member/${id}`, { coll: 'member', id, data }];
const msg = (id, by, day, ref = 'c:general') => [`msg/${id}`, { coll: 'msg', id, data: { ref, by, at: Date.parse(day + 'T12:00:00+02:00'), x: 'Salut' } }];
const fiche = { n: 'Léa Morin', g: 'F', bd: '1990-05-02' };

test("« Carte d'identité » : calculée sur le vrai profil, plus sur ce que déclare le téléphone", () => {
  const items = new Map([
    // a : le téléphone déclare « profil » mais rien n'est rempli
    mem('a', {}), ['stats/a', { coll: 'stats', id: 'a', data: { c: {}, k: ['profil'] } }],
    // b : nom, sexe, date de naissance et téléphone renseignés
    mem('b', fiche), ['prefs/b', { coll: 'prefs', id: 'b', data: { ct: { tel: ['phone', 'Téléphone', '06 12 34 56 78'], mail: ['mail', 'E-mail', ''] } } }],
    // c : profil rempli mais aucun moyen de contact
    mem('c', fiche),
  ]);
  const p = memberProgress(items, {});
  assert.equal(p.a.trophies.profil, undefined, 'le repère envoyé par le téléphone ne suffit plus');
  assert.equal(p.b.trophies.profil, 1);
  assert.equal(p.c.trophies.profil, undefined);
  assert.equal(profilComplet({ n: 'Lé', g: 'F', bd: '1990-05-02' }, { ct: { mail: 'lea@exemple.fr' } }), false, 'nom trop court');
  assert.equal(profilComplet({ ...fiche, bd: 'bientôt' }, { ct: { mail: 'lea@exemple.fr' } }), false, 'date de naissance invalide');
  // le bureau peut toujours le décerner
  items.set('stats/c', { coll: 'stats', id: 'c', data: { c: {}, k: ['award:profil'] } });
  assert.equal(memberProgress(items, {}).c.trophies.profil, 1);
});

test("plafond quotidien : même table de constantes au serveur et dans l'appli (club/trophees.js)", () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'club', 'trophees.js'), 'utf8').replace(/\s+/g, '');
  const app = Function('return ' + src.match(/constCAPS=(\{[^}]*\})/)[1])();
  assert.deepEqual(app, CAPS);
});

test('plafond quotidien : 20 messages comptés par jour au plus, le reste le lendemain', () => {
  assert.equal(CAPS.msg, 20);
  const l = [mem('a')];
  for (let i = 0; i < 25; i++) l.push(msg('m' + i, 'a', '2026-10-10'));
  for (let i = 0; i < 8; i++) l.push(msg('n' + i, 'a', '2026-10-11'));
  const items = new Map(l);
  assert.equal(deriveCounts(items).a.msg, 20 + 8);
  // les points suivent : bienvenue 20 + Pilier des groupes bronze 10 (20 messages) + 28 actions
  assert.equal(clubScores(items, {}).a, 20 + 10 + 28);
  // chaque type a son propre plafond : les commentaires ne mangent pas celui des messages
  for (let i = 0; i < 15; i++) items.set('msg/c' + i, msg('c' + i, 'a', '2026-10-10', 'p:post1')[1]);
  const c = deriveCounts(items).a;
  assert.equal(c.msg, 28); assert.equal(c.com, CAPS.com);
});

test('plafond quotidien : les likes et les réactions sont plafonnés au jour de la publication', () => {
  const posts = Array.from({ length: 40 }, (_, i) => [`post/p${i}`, { coll: 'post', id: `p${i}`, data: { by: 'b', at: Date.parse('2026-10-10T09:00:00Z'), likers: ['a'] } }]);
  const reacts = Array.from({ length: 35 }, (_, i) => [`msg/r${i}`, { coll: 'msg', id: `r${i}`, data: { ref: 'c:g', by: 'b', at: Date.parse('2026-10-10T09:00:00Z'), reBy: { a: 'ok' } } }]);
  const c = deriveCounts(new Map([mem('a'), mem('b'), ...posts, ...reacts]));
  assert.equal(c.a.like, CAPS.like); assert.equal(c.a.react, CAPS.react);
  // b, lui, a écrit 35 messages ce jour-là : seuls 20 comptent
  assert.equal(c.b.msg, CAPS.msg);
});

test('saison : de septembre à août, le classement repart, les trophées restent', () => {
  assert.deepEqual(seasonRange('2026-2027'), { from: '2026-09-01', to: '2027-08-31' });
  assert.equal(seasonRange(''), null);
  const l = [mem('a'), mem('b'), ['stats/a', { coll: 'stats', id: 'a', data: { c: {}, k: ['award:bureau'] } }]];
  // a : très actif la saison dernière (août 2026), rien depuis
  for (let i = 0; i < 20; i++) l.push(msg('old' + i, 'a', '2026-08-' + String(10 + (i % 10)).padStart(2, '0')));
  // b : 5 messages cette saison
  for (let i = 0; i < 5; i++) l.push(msg('new' + i, 'b', '2026-10-0' + (i + 1)));
  const items = new Map(l);
  const all = clubScores(items, {}), sea = seasonScores(items, '2026-2027');
  // depuis toujours : a garde tout (bienvenue 20 + Au bureau 300 + Pilier bronze 10 + 20 messages)
  assert.equal(all.a, 20 + 300 + 10 + 20);
  assert.equal(all.b, 20 + 5);
  // cette saison : a repart à zéro, b compte ses 5 messages ; les trophées rares et décernés n'y entrent pas
  assert.equal(sea.a, 0);
  assert.equal(sea.b, 5);
  // la saison passée, a avait atteint le bronze de « Pilier des groupes »
  assert.equal(seasonScores(items, '2025-2026').a, 10 + 20);
  // les trophées de a ne bougent pas
  assert.equal(memberProgress(items, {}).a.trophies.msg, 1);
});

test('jeu réel : séances /RAM Coach pointées, rencontres jouées, tournois /RAM JA terminés', () => {
  const items = new Map([
    mem('a'), mem('b'), mem('c'),
    // séances : a présent deux fois, absent une fois ; une séance à venir ne compte pas
    ['seance/g1.2026-10-01', { coll: 'seance', id: 'g1.2026-10-01', data: { g: 'g1', d: '2026-10-01', pres: { a: 'P', b: 'A' } } }],
    ['seance/g1.2026-10-08', { coll: 'seance', id: 'g1.2026-10-08', data: { g: 'g1', d: '2026-10-08', pres: { a: 'P', b: 'E' } } }],
    ['seance/g1.2026-10-15', { coll: 'seance', id: 'g1.2026-10-15', data: { g: 'g1', d: '2026-10-15', pres: { a: 'A' } } }],
    ['seance/g1.2099-01-01', { coll: 'seance', id: 'g1.2099-01-01', data: { g: 'g1', d: '2099-01-01', pres: { b: 'P' } } }],
    // rencontre terminée : a a joué un simple, c était titulaire du double ; b a perdu un match pas terminé
    ['rec/r1', { coll: 'rec', id: 'r1', data: { d: '2026-10-12', st: 'done', ms: [{ a: 'a', st: 'done', w: 0 }, { a: 'b', st: 'live' }, { an: 'Martin / Colin', st: 'done' }], lineup: { c: 'T', b: 'R' } } }],
    // rencontre à venir : personne ne l'a jouée
    ['rec/r2', { coll: 'rec', id: 'r2', data: { d: '2099-01-01', st: 'soon', ms: [{ a: 'a', st: 'soon' }], lineup: { a: 'T' } } }],
    // tournoi /RAM JA terminé (paire a / c), et un autre encore en cours
    ['post/t1', { coll: 'post', id: 't1', data: { by: 'club', kind: 'jatour', d: '2026-10-20', ja: { status: 'done', list: [{ k1: 'a', k2: 'c' }] } } }],
    ['post/t2', { coll: 'post', id: 't2', data: { by: 'club', kind: 'jatour', d: '2026-10-27', ja: { status: 'live', list: [{ k1: 'b' }] } } }],
  ]);
  const c = deriveCounts(items, { today: '2026-11-06' });
  assert.equal(c.a.pres, 2); assert.equal((c.b || {}).pres, undefined);
  assert.equal(c.a.match, 1); assert.equal(c.c.match, 1); assert.equal((c.b || {}).match, undefined);
  assert.equal(c.a.tourn, 1); assert.equal(c.c.tourn, 1); assert.equal((c.b || {}).tourn, undefined);
  const p = memberProgress(items, {});
  assert.equal(p.a.trophies.match, 1, 'Compétiteur bronze dès la première rencontre');
  assert.equal(p.a.trophies.tourn, 1, 'Habitué des tournois bronze dès le premier tournoi terminé');
  assert.equal(p.a.trophies.pres, undefined, 'Toujours sur le court : 5 séances pour le bronze');
});

test('« Ne pas apparaître dans le classement » : absent des classements, trophées gardés', () => {
  const items = new Map([mem('a', { noRank: true, photo: 'a.jpg' }), mem('b'), msg('m1', 'a', '2026-10-02'), msg('m2', 'b', '2026-10-02')]);
  const scores = clubScores(items, {}), b = clubBoards(items, scores, '2026-2027');
  assert.equal(b.season, '2026-2027');
  assert.deepEqual(Object.keys(b.saison), ['b']);
  assert.deepEqual(Object.keys(b.toujours), ['b']);
  assert.equal(memberProgress(items, {}).a.trophies.photo, 1, 'ses trophées restent');
  // il peut revenir dans le classement
  items.set('member/a', mem('a', { noRank: false })[1]);
  assert.deepEqual(Object.keys(clubBoards(items, clubScores(items, {}), '2026-2027').saison).sort(), ['a', 'b']);
});

test('synchronisation : classements de la saison et depuis toujours, profils vérifiés, sans les adhérents masqués', async () => {
  const { createRamClub } = require('../lib/ramclub');
  const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-troph-'));
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
  let ram;
  try { ram = createRamClub(DIR); } finally {
    if (saved.url) process.env.SUPABASE_URL = saved.url;
    if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;
  }
  const club = await ram.create({ id: 'B', name: 'Hugo Martin' }, { name: 'TC Saison', short: 'TCS' });
  const j = await ram.join({ id: 'A', name: 'Inès Faure' }, club.code);
  const s0 = await ram.sync('B', club.id, 0), season = s0.items.find(i => i.coll === 'conf' && i.id === 'main').data.season;
  await ram.ops('B', club.id, [{ coll: 'member', id: j.key, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }, { p: ['req'], t: 'unset' }] }]);
  const me = s0.me.key;
  assert.equal(s0.board.season, season);
  assert.ok(me in s0.board.saison && me in s0.board.toujours);
  // Inès complète son profil et choisit de ne pas apparaître dans le classement
  const r = await ram.ops('A', club.id, [
    { coll: 'member', id: j.key, op: 'patch', patch: [{ p: ['n'], t: 'set', v: 'Inès Faure' }, { p: ['g'], t: 'set', v: 'F' }, { p: ['bd'], t: 'set', v: '1992-03-04' }, { p: ['noRank'], t: 'set', v: true }] },
    { coll: 'prefs', id: j.key, op: 'patch', patch: [{ p: ['ct'], t: 'set', v: { mail: ['mail', 'E-mail', 'ines@exemple.fr'] } }] },
  ]);
  assert.deepEqual(r.rejected, []);
  const s1 = await ram.sync('B', club.id, 0);
  assert.ok(!(j.key in s1.board.saison) && !(j.key in s1.board.toujours), 'Inès a disparu des classements');
  assert.ok(me in s1.board.toujours);
  assert.ok(s1.profils.includes(j.key), 'profil complet vérifié par le serveur');
  assert.ok(!s1.profils.includes(me));
  // son score reste calculé (trophées gardés)
  assert.ok(s1.scores[j.key] >= 20 + 20);
});
