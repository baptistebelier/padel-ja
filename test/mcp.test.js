/* Connecteur MCP /RAM : OAuth (découverte, inscription, autorisation, code PKCE à usage unique, jetons)
   puis les outils de lecture sur un vrai club et un vrai tournoi. Lecture seule, mêmes droits que les applis. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-mcp-'));
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const { createRamClub } = require('../lib/ramclub');
const { createStore } = require('../lib/store');
const { createMcp } = require('../lib/mcp');
const Engine = require('../public/js/engine.js'), Ani = require('../public/js/animation.js');
const ram = createRamClub(DIR), store = createStore(DIR);
if (saved.url) process.env.SUPABASE_URL = saved.url;
if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;

const json = (res, code, obj, h) => { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json' }, h || {})); res.end(JSON.stringify(obj)); };
const redirect = (res, to) => { res.writeHead(302, { Location: to }); res.end(); };
const readBody = req => new Promise((ok, ko) => { let b = ''; req.on('data', d => (b += d)); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { ko(e); } }); });
const rooms = new Map();
let me = null;   // « session » de l'utilisateur dans le navigateur (cookie) : simulée par l'en-tête x-test
const mcp = createMcp({ store, ram, Engine, Ani, getRoom: async id => rooms.get(id) || null, mainClubOf: async () => null,
  currentUser: async req => (req.headers['x-test'] ? me : null), readBody, json, redirect });
const server = http.createServer(async (req, res) => { if (!(await mcp(req, res, new URL(req.url, 'http://x')))) { res.writeHead(404); res.end(); } });
let base;
const call = (p, o = {}) => fetch(base + p, Object.assign({ redirect: 'manual' }, o));

test.before(async () => { await new Promise(r => server.listen(0, r)); base = 'http://127.0.0.1:' + server.address().port; });
test.after(() => server.close());

test('connecteur MCP /RAM : OAuth avec le compte /RAM, puis lecture des tournois et du club', async () => {
  // le compte /RAM, son club (il en est au bureau et enseigne) et un tournoi /RAM JA
  me = { id: 'U1', email: 'coach@test.fr', first: 'Sarah', last: 'Benali', pass_hash: 'h1' };
  await store.saveUser(me);
  const club = await ram.create({ id: 'U1', name: 'Sarah Benali' }, { name: 'TC Essai', short: 'tce' });
  await ram.ops('U1', club.id, [
    { coll: 'member', id: 'kid1', op: 'put', data: { n: 'Léo Martin', parent: club.key } },
    { coll: 'group', id: 'g1', op: 'put', data: { type: 'train', name: 'Mini-tennis', day: new Date().getDay(), h: '17 h', dur: '1 h', sport: 'Tennis', coach: club.key, mem: ['kid1'], tarif: { mode: 'seance', prix: 40 } } },
    { coll: 'eleve', id: 'kid1', op: 'put', data: { n: 'Léo Martin', lvl: 3, sport: 'Tennis', note: 'timide' } },
    { coll: 'post', id: 'p1', op: 'put', data: { by: 'club', kind: 'annonce', title: 'Fête du club', at: Date.now() } }
  ]);
  const T = Engine.initialState(); Engine.reduce(T, { type: 'demo/load', payload: { n: 8 } });
  Engine.reduce(T, { type: 'tournament/update', payload: { name: 'Open d’essai' } });
  const row = { id: 't1', owner: 'U1', state: T, created_at: Date.now(), updated_at: Date.now() };
  await store.saveTournament(row);
  rooms.set('t1', { row });

  // découverte
  const pr = await (await call('/.well-known/oauth-protected-resource')).json();
  assert.equal(pr.resource, base + '/mcp');
  const as = await (await call('/.well-known/oauth-authorization-server')).json();
  assert.deepEqual(as.code_challenge_methods_supported, ['S256']);
  // sans jeton : 401 avec l'adresse des métadonnées
  const r401 = await call('/mcp', { method: 'POST', body: '{}' });
  assert.equal(r401.status, 401);
  assert.match(r401.headers.get('www-authenticate'), /resource_metadata=/);
  // inscription du client (Claude)
  const redirect_uri = 'https://claude.ai/api/mcp/auth_callback';
  const reg = await (await call('/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: [redirect_uri] }) })).json();
  assert.ok(reg.client_id);
  assert.equal((await call('/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['http://pirate.example/cb'] }) })).status, 400);
  // autorisation : non connecté → page de connexion /RAM ; connecté → page « Autoriser »
  const verifier = crypto.randomBytes(32).toString('base64url'), challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri, code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', scope: 'ram.lecture' });
  const a0 = await call('/oauth/authorize?' + q);
  assert.equal(a0.status, 302);
  assert.match(a0.headers.get('location'), /^\/connexion\?retour=%2Foauth%2Fauthorize/);
  const page = await (await call('/oauth/authorize?' + q, { headers: { 'x-test': '1' } })).text();
  assert.match(page, /Autoriser/);
  const tx = page.match(/name="tx" value="([^"]+)"/)[1];
  const a1 = await call('/oauth/authorize', { method: 'POST', headers: { 'x-test': '1', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ tx, decision: 'ok' }) });
  const back = new URL(a1.headers.get('location'));
  assert.equal(back.searchParams.get('state'), 'xyz');
  const code = back.searchParams.get('code');
  // jeton : PKCE vérifié, code à usage unique
  const tok = (body) => call('/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  assert.equal((await tok({ grant_type: 'authorization_code', code, client_id: reg.client_id, redirect_uri, code_verifier: 'faux' })).status, 400);
  const t = await (await tok({ grant_type: 'authorization_code', code, client_id: reg.client_id, redirect_uri, code_verifier: verifier })).json();
  assert.ok(t.access_token && t.refresh_token);
  assert.equal((await tok({ grant_type: 'authorization_code', code, client_id: reg.client_id, redirect_uri, code_verifier: verifier })).status, 400, 'code déjà utilisé');

  // MCP : initialisation, liste des outils (tous en lecture seule), appels
  const rpc = async (method, params, id = 1) => (await (await call('/mcp', { method: 'POST', headers: { Authorization: 'Bearer ' + t.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) })).json()).result;
  assert.equal((await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test' } })).serverInfo.name, 'ram');
  const tools = (await rpc('tools/list')).tools;
  assert.ok(tools.length >= 8 && tools.every(x => x.annotations.readOnlyHint));
  const use = async (name, args) => JSON.parse((await rpc('tools/call', { name, arguments: args || {} })).content[0].text);
  const acc = await use('ram_mon_compte');
  assert.equal(acc.clubs[0].nom, 'TC Essai');
  assert.equal(acc.clubs[0].role, 'bureau');
  assert.equal((await use('ja_tournois'))[0].nom, 'Open d’essai');
  assert.equal((await use('ja_tournoi', { id: 't1' })).paires.length, 8);
  assert.equal((await use('club_mur')).publications[0].titre, 'Fête du club');
  assert.equal((await use('coach_planning')).seances[0].groupe, 'Mini-tennis');
  const el = await use('coach_eleves');
  assert.equal(el.eleves[0].nom, 'Léo Martin');
  assert.equal((await use('coach_eleve', { eleve_id: 'kid1', club: club.id })).note_privee, 'timide');
  // un tournoi d'un autre compte reste invisible
  rooms.set('t2', { row: { id: 't2', owner: 'U2', state: T } });
  assert.equal((await rpc('tools/call', { name: 'ja_tournoi', arguments: { id: 't2' } })).isError, true);
  // changer son mot de passe coupe le renouvellement de l'accès
  assert.equal((await tok({ grant_type: 'refresh_token', refresh_token: t.refresh_token })).status, 200);
  me.pass_hash = 'h2'; await store.saveUser(me);
  assert.equal((await tok({ grant_type: 'refresh_token', refresh_token: t.refresh_token })).status, 400);
});
