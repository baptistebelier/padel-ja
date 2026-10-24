/* Fiches joueurs /RAM JA nourries par /RAM Club : profil sportif du compte, fiche des enfants sans compte */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

test('profil sportif recopié sur la fiche ; un enfant sans compte reçoit sa fiche', async () => {
  const PORT = 39300 + Math.floor(Math.random() * 90), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fiches-'));
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA });
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].forEach(k => delete env[k]);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'pipe' });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  try {
    const B = `http://127.0.0.1:${PORT}`;
    for (let i = 0; i < 50; i++) { try { await fetch(B + '/'); break; } catch (e) { await wait(100); } }
    const r = await fetch(B + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@exemple.test', password: 'motdepasse1', first: 'Anna', last: 'Test' }) });
    const H = { 'Content-Type': 'application/json', Cookie: [].concat(r.headers.getSetCookie()).map(c => c.split(';')[0]).filter(c => !/=$/.test(c)).join('; ') };
    const api = (p, body) => fetch(B + p, body ? { method: 'POST', headers: H, body: JSON.stringify(body) } : { headers: H }).then(x => x.json());
    const club = await api('/api/ram/clubs', { name: 'TC Fiches', short: 'TCF' });
    // profil du club : femme, née en 1990, niveau padel 6, 15/2 en tennis, n° 1234 au classement padel
    await api(`/api/ram/c/${club.id}/ops`, { ops: [{ coll: 'member', id: club.key, op: 'patch', patch: [{ p: ['g'], t: 'set', v: 'F' }, { p: ['bd'], t: 'set', v: '1990-05-04' }, { p: ['pl'], t: 'set', v: 6 }, { p: ['r'], t: 'set', v: '15/2' }, { p: ['pad'], t: 'set', v: 1234 }] }] });
    // et un enfant sans compte
    await api(`/api/ram/c/${club.id}/ops`, { ops: [{ coll: 'member', id: 'kid1', op: 'put', data: { n: 'Léo Test', parent: club.key, g: 'H', bd: '2014-02-01', r: 'NC', res: [] } }] });
    await wait(3800);
    const me = (await api('/api/me/player')).linked;
    assert.deepEqual([me.sex, me.birthYear, me.padelLevel, me.tennisRank, me.rank], ['F', 1990, 6, '15/2', '1234']);
    const kid = (await api(`/api/ram/c/${club.id}/sync?since=0`)).items.find(i => i.coll === 'member' && i.id === 'kid1');
    assert.ok(kid.data._ja, 'la fiche de l’enfant est reliée à son profil du club');
    const fiche = (await api('/api/players/' + kid.data._ja)).player;
    assert.deepEqual([fiche.first, fiche.last, fiche.sex, fiche.birthYear, fiche.club], ['Léo', 'TEST', 'H', 2014, 'TC Fiches']);
  } finally { srv.kill(); }
});
