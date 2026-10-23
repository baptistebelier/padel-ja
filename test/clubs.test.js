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

    /* adhésions : club du compte (joueur, club de licence) et bureau de l'espace /RAM Club */
    const wait = () => new Promise(r => setTimeout(r, 1900));   // recopie différée des changements /RAM Club
    let mine = (await a('/api/me/clubs')).memberships;
    assert.ok(mine.some(x => x.clubId === ua.clubId && x.role === 'joueur' && x.source === 'compte' && x.licenceClub));
    assert.ok(mine.some(x => x.clubId === ua.clubId && x.role === 'bureau' && x.source === 'ramclub' && x.status === 'actif'));
    // Bruno demande à rejoindre : en attente jusqu'à la validation du bureau
    const space = (await a('/api/ram/clubs')).clubs[0];
    const joined = await b('/api/ram/join', { code: space.code });
    await wait();
    const pending = (await b('/api/me/clubs')).memberships.find(x => x.clubId === ua.clubId);
    assert.equal(pending.status, 'attente'); assert.equal(pending.role, 'adherent');
    const s = await a(`/api/ram/c/${space.id}/sync?since=0`);
    const item = s.items.find(i => i.coll === 'member' && i.id === joined.key);
    const season = (s.items.find(i => i.coll === 'conf').data || {}).season;
    await a(`/api/ram/c/${space.id}/ops`, { ops: [{ coll: 'member', id: joined.key, op: 'put', data: Object.assign({}, item.data, { valid: season, req: 0 }) }] });
    await wait();
    assert.equal((await b('/api/me/clubs')).memberships.find(x => x.clubId === ua.clubId).status, 'actif');
    // validé au club /RAM Club : son club /RAM JA devient celui-ci, et ne se change plus à la main
    const ub3 = (await b('/api/me')).user;
    assert.equal(ub3.clubId, ua.clubId);
    assert.equal((await b('/api/me/clubs')).managed.clubId, ua.clubId);
    await b('/api/me', { club: 'Autre club' });
    assert.equal((await b('/api/me')).user.clubId, ua.clubId);
    assert.equal((await b('/api/me/player')).linked.club, 'Chiquita Padel');
    // fiche du club : effectifs pour tous, liste nominative pour le bureau seulement
    const fiche = await a('/api/clubs/' + ua.clubId);
    assert.equal(fiche.counts.bureau, 1); assert.equal(fiche.counts.adherent, 1); assert.ok(fiche.bureau);
    assert.equal((await b('/api/clubs/' + ua.clubId + '/members')).error, 'Réservé au bureau du club.');
    const list = (await a('/api/clubs/' + ua.clubId + '/members')).members;
    assert.deepEqual(list.map(x => x.first).sort(), ['Alice', 'Bruno']);
    // quitter le club : l'adhésion /RAM Club disparaît
    await b(`/api/ram/c/${space.id}/remove`, { key: joined.key });
    await wait();
    // il garde son dernier club, et redevient libre de le changer
    const after = await b('/api/me/clubs');
    assert.equal(after.memberships.filter(x => x.clubId === ua.clubId && x.source === 'ramclub').length, 0);
    assert.equal(after.managed, null);
    await b('/api/me', { club: 'TC Les Tilleuls' });
    assert.equal((await b('/api/me')).user.club, 'TC Les Tilleuls');
  } finally { srv.kill(); }
});
