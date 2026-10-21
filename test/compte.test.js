/* Comptes : lien « mot de passe oublié » (valable 1 h, une seule fois) */
const test = require('node:test');
const assert = require('node:assert/strict');
const Auth = require('../lib/auth');
const Mail = require('../lib/mail');

const user = { id: 'u123', pass_hash: Auth.hashPassword('ancien-mot-de-passe') };

test('lien de réinitialisation : valable pour le bon compte', () => {
  const t = Auth.readResetToken(Auth.makeResetToken(user));
  assert.equal(t.userId, 'u123');
  assert.ok(Auth.resetMatches(user, t));
});

test('lien expiré après 1 heure', () => {
  const tok = Auth.makeResetToken(user, Date.now() - 2 * 3600e3);
  assert.equal(Auth.readResetToken(tok), null);
});

test('lien inutilisable une fois le mot de passe changé', () => {
  const t = Auth.readResetToken(Auth.makeResetToken(user));
  const after = Object.assign({}, user, { pass_hash: Auth.hashPassword('nouveau-mot-de-passe') });
  assert.equal(Auth.resetMatches(after, t), false);
});

test('lien falsifié ou de session refusé', () => {
  const tok = Auth.makeResetToken(user);
  assert.equal(Auth.readResetToken(tok.replace('u123', 'u999')), null);
  assert.equal(Auth.readResetToken(Auth.makeToken('u123')), null);
  assert.equal(Auth.readResetToken('n-importe-quoi'), null);
});

test('e-mails : objet, lien et prénom présents, prénom échappé', () => {
  const m = Mail.resetMail({ first: '<b>Baptiste</b>', link: 'https://ja.riseandmove.fr/reinitialiser?t=abc' });
  assert.match(m.html, /reinitialiser\?t=abc/);
  assert.ok(!m.html.includes('<b>Baptiste</b>'));
  assert.match(Mail.welcomeMail({ first: 'Baptiste', appUrl: 'https://ja.riseandmove.fr' }).text, /dashboard/);
});
