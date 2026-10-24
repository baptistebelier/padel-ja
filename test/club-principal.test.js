/* Plusieurs clubs sur /RAM Club : un club principal (celui de la licence, repris par /RAM JA) et des clubs secondaires */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

test('club principal choisi parmi ses clubs, repris par le compte et la fiche joueur', async () => {
  const PORT = 39400 + Math.floor(Math.random() * 90), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'principal-'));
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA });
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].forEach(k => delete env[k]);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'pipe' });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  try {
    const B = `http://127.0.0.1:${PORT}`;
    for (let i = 0; i < 50; i++) { try { await fetch(B + '/'); break; } catch (e) { await wait(100); } }
    const r = await fetch(B + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'p@exemple.test', password: 'motdepasse1', first: 'Paul', last: 'Test' }) });
    const H = { 'Content-Type': 'application/json', Cookie: [].concat(r.headers.getSetCookie()).map(c => c.split(';')[0]).filter(c => !/=$/.test(c)).join('; ') };
    const api = (p, body) => fetch(B + p, body ? { method: 'POST', headers: H, body: JSON.stringify(body) } : { headers: H }).then(x => x.json());
    // un club de tennis puis un club de padel
    const tennis = await api('/api/ram/clubs', { name: 'TC Les Tilleuls', short: 'TCT' });
    await wait(1800);
    const padel = await api('/api/ram/clubs', { name: 'Padel Club Azur', short: 'PCA' });
    await wait(1800);
    let list = (await api('/api/ram/clubs')).clubs;
    assert.equal(list.length, 2);
    assert.equal(list.filter(c => c.main).length, 1, 'un seul club principal');
    // choisir le club de tennis comme principal : le compte et la fiche joueur suivent
    assert.equal((await api('/api/ram/main', { id: tennis.id })).ok, true);
    list = (await api('/api/ram/clubs')).clubs;
    assert.equal(list.find(c => c.main).id, tennis.id);
    assert.equal((await api('/api/me')).user.club, 'TC Les Tilleuls');
    assert.equal((await api('/api/me/player')).linked.club, 'TC Les Tilleuls');
    // puis le club de padel
    await api('/api/ram/main', { id: padel.id });
    assert.equal((await api('/api/me')).user.club, 'Padel Club Azur');
    assert.equal((await api('/api/me/clubs')).managed.club, 'Padel Club Azur');
    // un club dont on n'est pas membre : refusé
    assert.ok((await api('/api/ram/main', { id: 'inconnu' })).error);
  } finally { srv.kill(); }
});
