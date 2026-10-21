/* Garde-fous : prénom / nom / initiales, et erreurs déjà rencontrées dans le code */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { splitName, initials } = require('../lib/names');

test('initiales : prénom + nom (« Baptiste Belier » → BB, et non BT)', () => {
  assert.equal(initials('Baptiste', 'Belier'), 'BB');
  assert.equal(initials(' baptiste ', ' belier '), 'BB');
  assert.equal(initials('', '', 'juge@club.fr'), 'JU');
});

test('ancien champ « nom et prénom » : découpé sur les espaces', () => {
  assert.deepEqual(splitName({ name: 'Baptiste Belier' }), { first: 'Baptiste', last: 'Belier' });
  assert.deepEqual(splitName({ name: '  Jean   De La Fontaine ' }), { first: 'Jean', last: 'De La Fontaine' });
  assert.deepEqual(splitName({ name: 'Bastien' }), { first: 'Bastien', last: '' });
  assert.deepEqual(splitName({ first: 'Marie', last: 'Curie', name: 'x y' }), { first: 'Marie', last: 'Curie' });
});

// le bug « BT » venait d'un \s perdu dans une expression régulière (/s+/ au lieu de /\s+/) :
// on vérifie qu'aucun fichier du logiciel ne contient ce genre d'expression cassée
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { if (!/^(img|fonts|data|node_modules|\.git)$/.test(f)) walk(p); }
    else if (/\.(js|html)$/.test(f)) files.push(p);
  }
})(path.join(__dirname, '..', 'public'));
files.push(path.join(__dirname, '..', 'server.js'), ...fs.readdirSync(path.join(__dirname, '..', 'lib')).map(f => path.join(__dirname, '..', 'lib', f)));

test('aucune expression régulière avec un \\s, \\d ou \\w perdu', () => {
  const bad = [];
  const re = /(split|replace|test|match)\(\/(\[\^?[sdw][^\]]*\]|[sdw])[+*]?\//g;
  files.forEach(f => fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
    if (re.test(l)) bad.push(`${path.relative(path.join(__dirname, '..'), f)}:${i + 1}  ${l.trim().slice(0, 90)}`);
    re.lastIndex = 0;
  }));
  assert.deepEqual(bad, [], 'expressions suspectes :\n' + bad.join('\n'));
});

test('aucun emoji dans l\'interface (pictogrammes maison uniquement)', () => {
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/u;
  const bad = [];
  files.forEach(f => fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (emoji.test(l)) bad.push(`${path.basename(f)}:${i + 1}`); }));
  assert.deepEqual(bad, [], 'emojis trouvés : ' + bad.join(', '));
});

test('tous les scripts du logiciel sont du JavaScript valide', () => {
  const { execFileSync } = require('child_process');
  files.filter(f => f.endsWith('.js')).forEach(f => {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }), path.basename(f));
  });
});

test('compte /RAM : session partagée sur riseandmove.fr, cookie simple en local', () => {
  const Auth = require('../lib/auth');
  const req = h => ({ headers: { host: h, 'x-forwarded-proto': 'https' } });
  const ja = Auth.sessionCookie(req('ja.riseandmove.fr'), 'jeton');
  assert.ok(Array.isArray(ja) && ja.length === 2, 'ancien cookie effacé + cookie commun');
  assert.match(ja[1], /Domain=\.riseandmove\.fr/);
  assert.match(ja[0], /Max-Age=0/);
  assert.match(Auth.sessionCookie(req('club.riseandmove.fr'), 'jeton')[1], /Domain=\.riseandmove\.fr/);
  const local = Auth.sessionCookie({ headers: { host: 'localhost:3737' } }, 'jeton');
  assert.equal(typeof local, 'string');
  assert.ok(!/Domain=/.test(local));
  assert.ok(Auth.sessionCookie(req('ja.riseandmove.fr'), null).every(c => /Max-Age=0/.test(c)), 'déconnexion : les deux effacés');
  assert.equal(typeof Auth.sessionCookie(req('evil-riseandmove.fr'), 'x'), 'string', 'un autre domaine ne reçoit pas le cookie commun');
});
