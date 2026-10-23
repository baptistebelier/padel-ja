/* Référentiel des clubs commun à /RAM JA et /RAM Club : un club = une ligne, retrouvé quelle que soit l'écriture */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const { createClubs, clubKey } = require('../lib/clubs.js');

test('clé de club : accents, casse, espaces et ponctuation ignorés', () => {
  assert.equal(clubKey('Chiquita Padel'), 'chiquitapadel');
  assert.equal(clubKey('  CHIQUITA-padel '), 'chiquitapadel');
  assert.equal(clubKey('Padel Club Démo'), clubKey('padel club demo'));
});

test('référentiel : un nom déjà connu ne crée pas de doublon, même saisi deux fois en même temps', async () => {
  const saved = [], aliases = [];
  const store = { listClubs: async () => [], listClubAliases: async () => [], saveClub: async c => { saved.push(c); }, saveClubAlias: async (key, id) => { aliases.push({ key, id }); } };
  const clubs = createClubs(store);
  const [a, b] = await Promise.all([clubs.resolve('Chiquita Padel', { by: 'u1' }), clubs.resolve('CHIQUITA PADEL')]);
  assert.equal(a.id, b.id);
  assert.equal(saved.length, 1);
  assert.equal(a.name, 'Chiquita Padel');
  assert.equal(clubs.lookup('chiquita  padel').id, a.id);
  assert.equal(await clubs.resolve('Inconnu FC', { create: false }), null);
  assert.equal(await clubs.resolve(' '), null);
});

test('API : comptes, fiches joueurs et espace /RAM Club reliés au même club', async () => {
  const PORT = 39700 + Math.floor(Math.random() * 90), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'clubs-'));
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA });
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].forEach(k => delete env[k]);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'pipe' });
  try {
    const B = `http://127.0.0.1:${PORT}`;
    for (let i = 0; i < 50; i++) { try { await fetch(B + '/'); break; } catch (e) { await new Promise(r => setTimeout(r, 100)); } }
    const signup = async (email, first, club) => {
      const r = await fetch(B + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'motdepasse1', first, last: 'Test', club }) });
      assert.equal(r.status, 200);
      const cookie = [].concat(r.headers.getSetCookie()).map(c => c.split(';')[0]).filter(c => !/=$/.test(c)).join('; ');
      const H = { 'Content-Type': 'application/json', Cookie: cookie };
      return (p, body) => fetch(B + p, body ? { method: 'POST', headers: H, body: JSON.stringify(body) } : { headers: H }).then(x => x.json());
    };
    const a = await signup('a@exemple.test', 'Alice', 'Chiquita Padel'), b = await signup('b@exemple.test', 'Bruno', 'CHIQUITA  padel');
    const ua = (await a('/api/me')).user, ub = (await b('/api/me')).user;
    assert.ok(ua.clubId); assert.equal(ub.clubId, ua.clubId);
    // la fiche joueur du compte porte son club
    const fa = (await a('/api/me/player')).linked;
    assert.equal(fa.clubId, ua.clubId); assert.equal(fa.club, 'Chiquita Padel');
    // changer de club
    await b('/api/me', { club: 'TC Les Tilleuls' });
    const ub2 = (await b('/api/me')).user;
    assert.notEqual(ub2.clubId, ua.clubId);
    assert.equal((await b('/api/me/player')).linked.club, 'TC Les Tilleuls');
    // l'espace /RAM Club du même nom est relié au même club, et l'annuaire le signale
    await a('/api/ram/clubs', { name: 'Chiquita padel', short: 'CHQ' });
    const dir = (await a('/api/clubs-directory')).clubs;
    const chq = dir.find(c => c.id === ua.clubId);
    assert.ok(chq && chq.ramClub);
    assert.equal(dir.filter(c => /chiquita/i.test(c.name)).length, 1);
  } finally { srv.kill(); }
});
