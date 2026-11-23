/* écran TV relié par QR code : code de 4 lettres, secret de la TV, adresse remise une seule fois, expiration */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEcrans, LETTRES } = require('../lib/ecrans.js');

test('la TV reçoit un code, le téléphone le relie, la TV reçoit l’adresse une seule fois', () => {
  const E = createEcrans();
  const { code, s } = E.nouveau();
  assert.match(code, /^[A-Z]{4}$/);
  assert.ok([...code].every(c => LETTRES.includes(c)), 'ni I ni O');
  assert.deepEqual(Object.keys(E.etat(code, s)).sort(), ['attente', 'reste']);
  assert.equal(E.etat(code, 'mauvais-secret'), null, 'sans le secret de la TV, rien');
  assert.equal(E.lier('ZZZZ' === code ? 'YYYY' : 'ZZZZ', '/t/x/tv?k=1', 'X'), false, 'code inconnu');
  assert.equal(E.lier(code.toLowerCase(), '/t/abc/tv?k=cle', 'Open'), true, 'minuscules acceptées');
  assert.equal(E.lier(code, '/t/autre/tv?k=2', 'Autre'), false, 'déjà relié : pas de détournement');
  assert.deepEqual(E.etat(code, s), { url: '/t/abc/tv?k=cle', nom: 'Open' });
  assert.equal(E.etat(code, s), null, 'adresse remise une seule fois');
  assert.equal(E.taille(), 0);
});

test('un code non utilisé expire au bout de 15 minutes', () => {
  let t = 0;
  const E = createEcrans({ now: () => t });
  const { code, s } = E.nouveau();
  t = 14 * 60000;
  assert.ok(E.etat(code, s).attente);
  t = 16 * 60000;
  assert.equal(E.etat(code, s), null);
  assert.equal(E.lier(code, '/t/a/tv?k=b', 'A'), false);
});

test('codes tous différents', () => {
  const E = createEcrans();
  const l = Array.from({ length: 500 }, () => E.nouveau().code);
  assert.equal(new Set(l).size, 500);
});
