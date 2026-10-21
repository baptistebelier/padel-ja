/* RGPD : durée de conservation de la base de joueurs (3 ans après le dernier tournoi) */
const test = require('node:test');
const assert = require('node:assert/strict');
const { stalePlayers, YEARS } = require('../lib/retention');

const Y = 365.25 * 864e5, now = Date.parse('2026-10-21');

test('un joueur sans tournoi depuis plus de 3 ans est supprimé, les autres restent', () => {
  const players = [{ id: 'ancien', created_at: now - 6 * Y }, { id: 'actif', created_at: now - 6 * Y }, { id: 'nouveau', created_at: now - 864e5 }, { id: 'sans-tournoi', created_at: now - 4 * Y }];
  const parts = [{ player_id: 'ancien', closed_at: now - 3.2 * Y }, { player_id: 'actif', closed_at: now - 5 * Y }, { player_id: 'actif', closed_at: now - 0.5 * Y }];
  assert.equal(YEARS, 3);
  assert.deepEqual(stalePlayers({ players, parts }, now).sort(), ['ancien', 'sans-tournoi']);
});
