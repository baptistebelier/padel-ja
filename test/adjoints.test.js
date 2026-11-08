/* Juges-arbitres adjoints : invités par e-mail, mêmes droits que le juge-arbitre principal,
   sauf supprimer le tournoi et choisir les adjoints */
const test = require('node:test');
const assert = require('node:assert');
const { freePort, serverReady } = require('./helpers');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

test('juge-arbitre adjoint : invitation, droits et limites', async () => {
  const PORT = await freePort(), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ja-'));
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA });
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].forEach(k => delete env[k]);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'pipe' });
  try {
    const B = `http://127.0.0.1:${PORT}`;
    await serverReady(B);
    const signup = async (email, first, last) => {
      const r = await fetch(B + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'motdepasse1', first, last, club: 'TC Test' }) });
      const cookie = [].concat(r.headers.getSetCookie()).map(c => c.split(';')[0]).filter(c => !/=$/.test(c)).join('; ');
      const H = { 'Content-Type': 'application/json', Cookie: cookie };
      return (p, body, method) => fetch(B + p, body || method ? { method: method || 'POST', headers: H, body: body ? JSON.stringify(body) : undefined } : { headers: H, redirect: 'manual' });
    };
    const j = r => r.json();
    const prin = await signup('prin@exemple.test', 'Paul', 'Principal'), adj = await signup('adj@exemple.test', 'Ana', 'Adjointe'), autre = await signup('autre@exemple.test', 'Olga', 'Autre');
    const { id } = await prin('/api/tournaments', { name: 'Open d’hiver' }).then(j);
    assert.ok(id);
    // avant l'invitation : ni éditeur ni gestion pour l'adjointe
    assert.ok([401, 403].includes((await adj('/api/t/' + id + '/adjoints')).status));
    // invitation (adresse invalide refusée, majuscules ramenées)
    assert.equal((await prin('/api/t/' + id + '/adjoints', { email: 'pas-un-mail' })).status, 400);
    const inv = await prin('/api/t/' + id + '/adjoints', { email: 'ADJ@exemple.test' }).then(j);
    assert.deepEqual(inv, { proprio: true, adjoints: ['adj@exemple.test'] });
    // l'adjointe : le tournoi dans sa liste, marqué ; l'éditeur s'ouvre ; niveau juge-arbitre
    const liste = (await adj('/api/tournaments').then(j)).tournaments;
    const t = liste.find(x => x.id === id);
    assert.ok(t && t.adjoint === true, 'tournoi partagé dans la liste');
    assert.equal((await adj('/t/' + id)).status, 200);
    const info = await adj('/api/t/' + id + '/info').then(j);
    assert.equal(info.level, 'owner');
    assert.equal(info.proprio, false);
    assert.equal(info.adjoint, true);
    // elle ne choisit pas les adjoints et ne supprime pas le tournoi
    assert.equal((await adj('/api/t/' + id + '/adjoints', { email: 'autre@exemple.test' })).status, 403);
    assert.equal((await adj('/api/tournaments/' + id, null, 'DELETE')).status, 403);
    assert.deepEqual(await adj('/api/t/' + id + '/adjoints').then(j), { proprio: false, adjoints: ['adj@exemple.test'] });
    // un autre compte : rien
    assert.ok(!(await autre('/api/tournaments').then(j)).tournaments.some(x => x.id === id));
    assert.notEqual((await autre('/t/' + id)).status, 200);
    // retrait : l'accès disparaît
    await prin('/api/t/' + id + '/adjoints', { email: 'adj@exemple.test', remove: true });
    assert.ok(!(await adj('/api/tournaments').then(j)).tournaments.some(x => x.id === id));
    assert.notEqual((await adj('/t/' + id)).status, 200);
  } finally { srv.kill(); }
});
