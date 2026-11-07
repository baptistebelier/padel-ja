/* Tournoi interne : créé dans /RAM JA, publié sur /RAM Club, résultats saisis et confirmés par les joueurs */
const test = require('node:test');
const assert = require('node:assert/strict');
const { freePort, until, serverReady } = require('./helpers');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

test('tournoi interne : publication, participants du club, résultat d’un joueur confirmé par l’adversaire', async () => {
  const PORT = await freePort(), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'interne-'));
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA });
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].forEach(k => delete env[k]);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'pipe' });
  try {
    const B = `http://127.0.0.1:${PORT}`;
    await serverReady(B);
    const signup = async (email, first, club) => {
      const r = await fetch(B + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'motdepasse1', first, last: 'Test', club }) });
      const cookie = [].concat(r.headers.getSetCookie()).map(c => c.split(';')[0]).filter(c => !/=$/.test(c)).join('; ');
      const H = { 'Content-Type': 'application/json', Cookie: cookie };
      return (p, body) => fetch(B + p, body ? { method: 'POST', headers: H, body: JSON.stringify(body) } : { headers: H }).then(async x => Object.assign(await x.json().catch(() => ({})), { status: x.status }));
    };
    const bur = await signup('b@exemple.test', 'Bea', 'TC Interne'), a1 = await signup('a@exemple.test', 'Alix', ''), a2 = await signup('c@exemple.test', 'Cyril', ''), autre = await signup('z@exemple.test', 'Zoé', '');
    const space = await bur('/api/ram/clubs', { name: 'TC Interne', short: 'TCI' });
    const j1 = await a1('/api/ram/join', { code: space.code }), j2 = await a2('/api/ram/join', { code: space.code });
    const s0 = await bur(`/api/ram/c/${space.id}/sync?since=0`), season = s0.items.find(i => i.coll === 'conf').data.season;
    await bur(`/api/ram/c/${space.id}/ops`, { ops: [j1, j2].map(j => ({ coll: 'member', id: j.key, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }, { p: ['req'], t: 'unset' }] })) });

    // le bureau (juge-arbitre) crée le tournoi interne : la page /RAM JA est celle du tournoi interne
    const { id: tid } = await bur('/api/tournaments', { kind: 'interne', sport: 'Tennis', name: 'Interne d’hiver' });
    assert.ok(tid);
    const act = (type, payload) => bur(`/api/t/${tid}/action`, { type, payload });
    await act('int/setup', { club: 'TC Interne', regle: 'Deux sets gagnants, super tie-break au troisième.' });
    const mb = await bur(`/api/t/${tid}/membres`);
    assert.equal(mb.club, true);
    const k1 = mb.membres.find(m => /Alix/.test(m.n)).k, k2 = mb.membres.find(m => /Cyril/.test(m.n)).k;
    await act('int/player/add', { n: 'Alix Test', ks: [k1] });
    await act('int/player/add', { n: 'Cyril Test', ks: [k2] });
    assert.equal((await act('int/draw')).ok, true);

    // la publication arrive sur le mur du club
    const post = async () => (await a1(`/api/ram/c/${space.id}/sync?since=0`)).items.find(i => i.coll === 'post' && i.id === 'ja-' + tid && i.data.ja && i.data.ja.rounds && i.data.ja.rounds.length);
    const p = await until(post, { msg: 'tournoi interne jamais publié' });
    assert.equal(p.data.kind, 'jaint');
    assert.match(p.data.ja.regle, /super tie-break/);
    const fin = p.data.ja.rounds[0][0];

    // un étranger au tournoi ne saisit rien ; un joueur saisit, l'autre confirme
    assert.equal((await autre('/api/ja/interne', { tid, act: 'result', m: fin.id, w: 'moi', sc: '6-0 6-0' })).status, 400);
    assert.equal((await a1('/api/ja/interne', { tid, act: 'confirm', m: fin.id })).status, 400, 'rien à confirmer');
    assert.equal((await a1('/api/ja/interne', { tid, act: 'result', m: fin.id, w: 'moi', sc: '6-4 6-3' })).ok, true);
    assert.equal((await a1('/api/ja/interne', { tid, act: 'confirm', m: fin.id })).status, 400, 'pas sa propre saisie');
    assert.equal((await a2('/api/ja/interne', { tid, act: 'confirm', m: fin.id })).ok, true);
    const fini = await until(async () => { const x = await post(); return x && x.data.ja.champion ? x : null; }, { msg: 'vainqueur jamais publié' });
    const pa = fini.data.ja.players.find(x => x.ks.includes(k1));
    assert.equal(fini.data.ja.champion, pa.id);
    assert.equal(fini.data.ja.rounds[0][0].sc, '6-4 6-3');
  } finally {
    srv.kill();
  }
});
