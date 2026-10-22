/* Score d'investissement RAM Club calculé par le serveur */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { clubScores, deriveCounts, TPTS, RPTS, TIERED, RARE } = require('../lib/ram-score');
const { checkOp } = require('../lib/ramclub');

test('barèmes du serveur identiques à ceux de l\'appli (club/trophees.js)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'club', 'trophees.js'), 'utf8');
  assert.deepStrictEqual(JSON.parse(src.match(/TPTS=(\[[^\]]*\])/)[1]), TPTS);
  assert.deepStrictEqual(JSON.parse(src.match(/RPTS=(\[[^\]]*\])/)[1]), RPTS);
  const tiered = {}; for (const m of src.matchAll(/\{id:'(\w+)'[^}]*?t:(\[[\d,]+\])/g)) tiered[m[1]] = JSON.parse(m[2]);
  assert.deepStrictEqual(tiered, TIERED);
  const rares = {}; for (const m of src.matchAll(/\{id:'(\w+)'[^{}]*?,r:(\d)/g)) rares[m[1]] = +m[2];
  assert.deepStrictEqual(rares, Object.fromEntries(Object.entries(RARE).map(([k, [r]]) => [k, r])));
});

test('même score pour tout le monde, trophée « Au bureau » compris', () => {
  const items = new Map([
    ['member/a', { coll: 'member', id: 'a', data: { photo: 'x.jpg' } }],
    ['member/b', { coll: 'member', id: 'b', data: {} }],
    ['stats/a', { coll: 'stats', id: 'a', data: { c: {}, k: ['profil'] } }],
    ['group/g', { coll: 'group', id: 'g', data: { cap: 'b' } }],
  ]);
  const s = clubScores(items, { a: 'bureau', b: 'mem' });
  // a : bienvenue 20 + profil 20 + photo 20 + bureau 300
  assert.strictEqual(s.a, 20 + 20 + 20 + 300);
  // b : bienvenue 20 + capitaine 150
  assert.strictEqual(s.b, 20 + 150);
});

test('trophée décerné par le club : compté une seule fois, élément supprimé ignoré', () => {
  const items = new Map([
    ['member/a', { coll: 'member', id: 'a', data: {} }],
    ['stats/a', { coll: 'stats', id: 'a', data: { c: {}, k: ['award:champion', 'award:champion'] } }],
    ['group/old', { coll: 'group', id: 'old', data: null, del: true }],
  ]);
  assert.strictEqual(clubScores(items, {}).a, 20 + 300);
});

test("anti-triche : les compteurs envoyés par l'appareil sont ignorés, le serveur recompte les actions", () => {
  const posts = Array.from({ length: 12 }, (_, i) => [`post/p${i}`, { coll: 'post', id: `p${i}`, data: { by: 'b', likers: ['a'] } }]);
  const items = new Map([
    ['member/a', { coll: 'member', id: 'a', data: {} }],
    ['member/b', { coll: 'member', id: 'b', data: {} }],
    // compteurs gonflés à la main : 5000 likes et 9999 points d'action
    ['stats/a', { coll: 'stats', id: 'a', data: { c: { like: 5000, msg: 5000, ap: 9999 }, k: [] } }],
    ...posts,
    ['msg/m1', { coll: 'msg', id: 'm1', data: { ref: 'c:general', by: 'a', reBy: { b: 'ok' } } }],
  ]);
  const c = deriveCounts(items);
  assert.strictEqual(c.a.like, 12); assert.strictEqual(c.a.msg, 1); assert.strictEqual(c.b.react, 1);
  // a : bienvenue 20 + Supporter bronze 10 (12 likes) + 13 actions
  assert.strictEqual(clubScores(items, {}).a, 20 + 10 + 13);
});

test('anti-triche : un adhérent ne peut pas se décerner un trophée, le bureau oui', () => {
  const club = { items: new Map([['stats/a', { coll: 'stats', id: 'a', data: { c: {}, k: [] } }]]) };
  const op = { coll: 'stats', id: 'a', op: 'patch', patch: [{ t: 'add', p: ['k'], v: 'award:bureau' }] };
  assert.throws(() => checkOp(club, { key: 'a', valid: true, staff: false }, op), /seul le club/);
  assert.deepStrictEqual(checkOp(club, { key: 'z', valid: true, staff: true, bureau: true }, op).k, ['award:bureau']);
});

test('anti-triche : classement compté par le serveur, une fois par jour, compteur non modifiable', () => {
  const club = { items: new Map([['member/a', { coll: 'member', id: 'a', data: { r: '30' } }]]) };
  const ctx = { key: 'a', valid: true, staff: false };
  const a1 = checkOp(club, ctx, { coll: 'member', id: 'a', op: 'patch', patch: [{ t: 'set', p: ['r'], v: '15/4' }] });
  assert.strictEqual(a1._rk, 1);
  club.items.set('member/a', { coll: 'member', id: 'a', data: a1 });
  // deuxième changement le même jour et tentative d'écrire le compteur : rien ne bouge
  const a2 = checkOp(club, ctx, { coll: 'member', id: 'a', op: 'patch', patch: [{ t: 'set', p: ['r'], v: '15/2' }, { t: 'set', p: ['_rk'], v: 99 }] });
  assert.strictEqual(a2._rk, 1);
});
