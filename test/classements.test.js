/* Classements inter-clubs : activité moyenne des adhérents par club, résultats en tournoi par club */
const test = require('node:test');
const assert = require('node:assert/strict');
const { freePort } = require('./helpers');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

test('classement des clubs : activité des adhérents (clubs d’au moins 3 adhérents)', async () => {
  const PORT = await freePort(), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'classements-'));
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA });
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].forEach(k => delete env[k]);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'pipe' });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  try {
    const B = `http://127.0.0.1:${PORT}`;
    for (let i = 0; i < 50; i++) { try { await fetch(B + '/'); break; } catch (e) { await wait(100); } }
    const signup = async (email, first, club) => {
      const r = await fetch(B + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'motdepasse1', first, last: 'Test', club }) });
      const cookie = [].concat(r.headers.getSetCookie()).map(c => c.split(';')[0]).filter(c => !/=$/.test(c)).join('; ');
      const H = { 'Content-Type': 'application/json', Cookie: cookie };
      return (p, body) => fetch(B + p, body ? { method: 'POST', headers: H, body: JSON.stringify(body) } : { headers: H }).then(async x => Object.assign(await x.json().catch(() => ({})), { status: x.status }));
    };
    const bur = await signup('b@exemple.test', 'Bea', 'TC Rang');
    const space = await bur('/api/ram/clubs', { name: 'TC Rang', short: 'TCR' });
    const s0 = await bur(`/api/ram/c/${space.id}/sync?since=0`), season = s0.items.find(i => i.coll === 'conf').data.season;
    for (const [e, n] of [['m1@exemple.test', 'Max'], ['m2@exemple.test', 'Zoé']]) {
      const m = await signup(e, n, '');
      const j = await m('/api/ram/join', { code: space.code });
      await bur(`/api/ram/c/${space.id}/ops`, { ops: [{ coll: 'member', id: j.key, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }, { p: ['req'], t: 'unset' }] }] });
    }
    await wait(5000);   // progression recopiée 3 s après le dernier changement (le classement est ensuite gardé 10 min)
    const r = await bur('/api/ram/classements');
    assert.equal(r.season, season);
    const me = r.activity.find(c => c.name === 'TC Rang');
    assert.ok(me, JSON.stringify(r));
    assert.equal(me.members, 3);
    assert.ok(me.avg > 0);
    assert.ok(Array.isArray(r.tournaments));
    assert.equal((await fetch(B + '/api/ram/classements')).status, 401, 'réservé aux comptes connectés');
  } finally { srv.kill(); }
});
