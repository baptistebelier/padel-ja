/* Clôture : un tournoi interne alimente l'historique de ses joueurs (fiche personne), deux clôtures simultanées ne
   doublent rien, l'historique reste au juge-arbitre principal même clôturé par un adjoint, un tournoi supprimé emporte
   ses résultats ; chaque tournoi porte son sport et son type */
const test = require('node:test');
const assert = require('node:assert/strict');
const { freePort, until, serverReady } = require('./helpers');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

test('clôture d’un tournoi interne : historique sur les fiches, sans doublon, attribué au juge-arbitre principal', async () => {
  const PORT = await freePort(), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'cloture-'));
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA });
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].forEach(k => delete env[k]);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'pipe' });
  try {
    const B = `http://127.0.0.1:${PORT}`;
    await serverReady(B);
    const signup = async (email, first, club) => {
      const r = await fetch(B + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'motdepasse1', first, last: 'Test', club }) });
      const H = { 'Content-Type': 'application/json', Cookie: [].concat(r.headers.getSetCookie()).map(c => c.split(';')[0]).filter(c => !/=$/.test(c)).join('; ') };
      return (p, body, method) => fetch(B + p, body || method ? { method: method || 'POST', headers: H, body: body ? JSON.stringify(body) : undefined } : { headers: H }).then(async x => Object.assign(await x.json().catch(() => ({})), { status: x.status }));
    };
    const ja = await signup('ja@exemple.test', 'Jules', 'TC Clôture'), adj = await signup('adj@exemple.test', 'Ana', ''), a1 = await signup('a@exemple.test', 'Alix', ''), a2 = await signup('c@exemple.test', 'Cyril', '');
    const space = await ja('/api/ram/clubs', { name: 'TC Clôture', short: 'TCC' });
    const j1 = await a1('/api/ram/join', { code: space.code }), j2 = await a2('/api/ram/join', { code: space.code });
    const season = (await ja(`/api/ram/c/${space.id}/sync?since=0`)).items.find(i => i.coll === 'conf').data.season;
    await ja(`/api/ram/c/${space.id}/ops`, { ops: [j1, j2].map(j => ({ coll: 'member', id: j.key, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }, { p: ['req'], t: 'unset' }] })) });
    const { id: tid } = await ja('/api/tournaments', { kind: 'interne', sport: 'Tennis', name: 'Interne de clôture' });
    const act = (type, payload) => ja(`/api/t/${tid}/action`, { type, payload });
    await act('int/setup', { club: 'TC Clôture', format: 0 });
    const mb = await ja(`/api/t/${tid}/membres`);
    const k1 = mb.membres.find(m => /Alix/.test(m.n)).k, k2 = mb.membres.find(m => /Cyril/.test(m.n)).k;
    await act('int/player/add', { n: 'Alix Test', ks: [k1] }); await act('int/player/add', { n: 'Cyril Test', ks: [k2] });
    await act('int/draw');
    const st = await ja(`/api/t/${tid}/export`);
    const fin = st.int.tabs[0].rounds[0][0];
    await act('int/result', { m: fin.id, w: fin.a, sc: '6-2 6-3' });
    // type et sport dans la liste des tournois
    const liste = await until(async () => { const t = (await ja('/api/tournaments')).tournaments.find(x => x.id === tid); return t && t.type === 'interne' && t && t; });
    assert.equal(liste.sport, 'Tennis');
    // un adjoint clôture, deux fois en même temps
    await ja(`/api/t/${tid}/adjoints`, { email: 'adj@exemple.test' });
    const [r1, r2] = await Promise.all([adj(`/api/tournaments/${tid}/close`, {}), adj(`/api/tournaments/${tid}/close`, {})]);
    assert.ok(r1.ok && r2.ok, JSON.stringify([r1, r2]));
    // les deux joueurs ont leur résultat, une seule fois, attribué au juge-arbitre principal
    const fiche = async j => { const x = (await ja(`/api/ram/c/${space.id}/sync?since=0`)).items.find(i => i.coll === 'member' && i.id === j.key); return x && x.data._ja; };
    const f1 = await until(() => fiche(j1), { msg: 'fiche jamais reliée' }), f2 = await until(() => fiche(j2));
    const h1 = (await ja('/api/players/' + f1)).history, h2 = (await ja('/api/players/' + f2)).history;
    assert.equal(h1.length, 1, 'un seul résultat malgré deux clôtures simultanées'); assert.equal(h2.length, 1);
    assert.deepEqual([h1[0].place, h2[0].place].sort(), [1, 2]);
    assert.equal(h1[0].tournament, 'Interne de clôture');
    assert.equal(h1[0].mine, true, 'résultat attribué au juge-arbitre principal (owner), pas à l’adjoint');
    // le tournoi supprimé emporte ses résultats
    await ja(`/api/tournaments/${tid}`, null, 'DELETE');
    assert.equal((await ja('/api/players/' + f1)).history.length, 0);
  } finally { srv.kill(); }
});
