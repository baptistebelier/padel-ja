/* Réglages : modèles, terrains mémorisés (noms + logos), profil du compte */
const test = require('node:test');
const assert = require('node:assert/strict');
const { E, act } = require('./helpers');

const fresh = () => E.initialState();

test('modèle avec terrains génériques : les noms déjà donnés (naming) sont conservés', () => {
  const T = fresh();
  act(T, 'court/update', { id: T.courts[0].id, fields: { name: 'Court Intersport', logo: 'data:image/png;base64,AAA' } });
  const tpl = E.templateFromState(T, 'Mon format');
  tpl.courts = [{ name: 'Terrain 1', start: '09:00' }, { name: 'Terrain 2', start: '09:00' }];
  act(T, 'template/apply', { template: tpl });
  assert.equal(T.courts[0].name, 'Court Intersport');
  assert.equal(T.courts[0].logo, 'data:image/png;base64,AAA', 'le logo du partenaire suit le nom');
});

test('modèle avec de vrais noms de terrains : ils remplacent les noms actuels', () => {
  const T = fresh();
  const tpl = E.templateFromState(T, 'Club');
  tpl.courts = [{ name: 'Central', start: '10:00', logo: '' }];
  act(T, 'template/apply', { template: tpl });
  assert.deepEqual(T.courts.map(c => c.name), ['Central']);
  assert.equal(T.courts[0].start, '10:00');
});

test('réglages du compte : mémorisés puis réappliqués (terrains, logos, couleurs)', () => {
  const T = fresh();
  act(T, 'tournament/update', { club: 'Padel Club Brive', logoLight: 'data:image/png;base64,LL' });
  act(T, 'court/update', { id: T.courts[0].id, fields: { name: 'Court Leclerc', logo: 'data:image/png;base64,CL' } });
  const profile = E.profileFromState(T);
  const U = fresh();
  act(U, 'profile/apply', { profile });
  assert.equal(U.tournament.club, 'Padel Club Brive');
  assert.equal(U.tournament.logoLight, 'data:image/png;base64,LL');
  assert.equal(U.courts[0].name, 'Court Leclerc');
  assert.equal(U.courts[0].logo, 'data:image/png;base64,CL');
});

test('un modèle ne s\'applique pas après le tirage', () => {
  const T = fresh();
  act(T, 'demo/load', { n: 8 }, () => 0.5);
  act(T, 'draw/create', {}, () => 0.5);
  assert.throws(() => act(T, 'template/apply', { template: E.templateFromState(T, 'x') }), /tirage/);
});

test('action inconnue : erreur explicite (pas de modification silencieuse)', () => {
  assert.throws(() => act(fresh(), 'nimporte/quoi'), /Action inconnue/);
});
