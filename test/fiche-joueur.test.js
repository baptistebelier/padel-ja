/* Fiche joueur des comptes /RAM : créée à l'inscription, elle suit le profil (nom, licence, classement padel) */
const test = require('node:test');
const assert = require('node:assert');
const { freePort } = require('./helpers');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

test('compte /RAM : une fiche joueur par compte, qui suit le profil', async () => {
  const PORT = await freePort(), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fiche-joueur-'));
  // une fiche saisie par un juge-arbitre, avec une licence, à personne
  fs.writeFileSync(path.join(DATA, 'joueurs.json'), JSON.stringify([{ id: 'jref', licence: 'A123456', last: 'MARTIN', first: 'Paul', rank: '', name_key: 'martin|paul', search: 'martin paul a123456', created_by: 'ja', user_id: null }]));
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA });
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].forEach(k => delete env[k]);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'pipe' });
  const players = () => JSON.parse(fs.readFileSync(path.join(DATA, 'joueurs.json'), 'utf8'));
  try {
    const B = `http://127.0.0.1:${PORT}`;
    for (let i = 0; i < 50; i++) { try { await fetch(B + '/'); break; } catch (e) { await new Promise(r => setTimeout(r, 100)); } }
    const signup = async email => {
      const r = await fetch(B + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'motdepasse1', first: 'Paul', last: 'Martin' }) });
      assert.equal(r.status, 200);
      const cookie = [].concat(r.headers.getSetCookie()).map(c => c.split(';')[0]).filter(c => !/=$/.test(c)).join('; ');
      const H = { 'Content-Type': 'application/json', Cookie: cookie };
      return (p, body) => fetch(B + p, body ? { method: 'POST', headers: H, body: JSON.stringify(body) } : { headers: H }).then(x => x.json().then(j => Object.assign(j, { status: x.status })));
    };
    const a = await signup('a@exemple.test'), b = await signup('b@exemple.test');
    // homonymes : chacun sa fiche, la fiche du juge-arbitre leur est seulement proposée
    const fa = (await a('/api/me/player')).linked, fb = (await b('/api/me/player')).linked;
    assert.ok(fa && fb && fa.id !== fb.id && fa.id !== 'jref');
    assert.deepEqual((await a('/api/me/player')).candidates.map(p => p.id), ['jref']);
    // changer son nom puis son classement met la fiche à jour
    await a('/api/me', { first: 'Paulo', last: 'Martini' });
    await a('/api/me/player', { rank: '152' });
    const pa = players().find(p => p.id === fa.id);
    assert.equal(pa.last, 'MARTINI'); assert.equal(pa.first, 'Paulo'); assert.equal(pa.rank, '152'); assert.equal(pa.name_key, 'martini|paulo');
    // sa licence est celle de la fiche du juge-arbitre : le compte la reprend, sa fiche vide disparaît
    await b('/api/me/player', { licence: 'a123456' });
    assert.equal((await b('/api/me/player')).linked.id, 'jref');
    assert.equal(players().find(p => p.id === fb.id), undefined);
    // une fiche n'appartient qu'à un compte
    assert.equal((await a('/api/me/player', { player: 'jref' })).status, 409);
  } finally { srv.kill(); }
});
