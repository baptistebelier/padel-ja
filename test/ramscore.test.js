/* Score d'investissement RAM Club calculé par le serveur */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { clubScores, TPTS, RPTS, TIERED, RARE } = require('../lib/ram-score');

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
    ['stats/a', { coll: 'stats', id: 'a', data: { c: { like: 10, ap: 5 }, k: ['profil'] } }],
    ['group/g', { coll: 'group', id: 'g', data: { cap: 'b' } }],
  ]);
  const s = clubScores(items, { a: 'bureau', b: 'mem' });
  // a : like bronze 10 + bienvenue 20 + profil 20 + photo 20 + bureau 300 + 5 actions
  assert.strictEqual(s.a, 10 + 20 + 20 + 20 + 300 + 5);
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
