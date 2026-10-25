/* Juges-arbitres /RAM JA : titres (un pour le tennis, un pour le padel) et suggestions dans les tournois */
const test = require('node:test');
const assert = require('node:assert');
const { freePort } = require('./helpers');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

test('titres de juge-arbitre et juges-arbitres proposés', async () => {
  const PORT = await freePort(), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ja-'));
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA });
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].forEach(k => delete env[k]);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'pipe' });
  try {
    const B = `http://127.0.0.1:${PORT}`;
    for (let i = 0; i < 50; i++) { try { await fetch(B + '/'); break; } catch (e) { await new Promise(r => setTimeout(r, 100)); } }
    const signup = async (email, first, last) => {
      const r = await fetch(B + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'motdepasse1', first, last, club: 'TC Test' }) });
      const cookie = [].concat(r.headers.getSetCookie()).map(c => c.split(';')[0]).filter(c => !/=$/.test(c)).join('; ');
      const H = { 'Content-Type': 'application/json', Cookie: cookie };
      return (p, body) => fetch(B + p, body ? { method: 'POST', headers: H, body: JSON.stringify(body) } : { headers: H }).then(x => x.json());
    };
    const a = await signup('a@exemple.test', 'Alice', 'Martin'), b = await signup('b@exemple.test', 'Bruno', 'Petit');
    // sans titre ni vrai tournoi (seulement le tournoi d'exemple) : personne n'est proposé
    assert.deepEqual((await b('/api/referees')).referees, []);
    // titres : un par sport au plus, valeurs inconnues ignorées
    const me = (await a('/api/me', { jaTitles: ['jap2', 'JAT1', 'JAP3', 'XYZ'] })).user;
    assert.deepEqual(me.jaTitles, ['JAT1', 'JAP2']);
    const list = (await b('/api/referees?q=mart')).referees;
    assert.equal(list.length, 1);
    assert.deepEqual(list[0], { id: list[0].id, first: 'Alice', last: 'MARTIN', titles: ['JAT1', 'JAP2'], club: 'TC Test', sameClub: true });
    assert.equal(list[0].email, undefined);
    // retirer ses titres : plus proposé
    await a('/api/me', { jaTitles: [] });
    assert.deepEqual((await b('/api/referees')).referees, []);
  } finally { srv.kill(); }
});
