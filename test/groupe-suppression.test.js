/* Connecteur MCP /RAM : coach_supprimer_groupe ne retire que le groupe.
   Les formules et achats, les paiements, les séances effectuées (présences, bilans) et l'historique restent intacts ; les séances à venir
   sans appel ni bilan partent avec le groupe ; les séances gardées reçoivent le nom et l'heure du groupe.
   Les services sont créés SANS les variables SUPABASE_* (stockage local jetable), comme les autres tests du connecteur. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-grp-'));
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
let me = null;
const mcp = createMcp({ store, ram, Engine, Ani, getRoom: async () => null, mainClubOf: async () => null,
  currentUser: async req => (req.headers['x-test'] ? me : null), readBody, json, redirect, newTournament: async () => ({}), applyServerAction: () => {}, accessFor: async () => ({ canCreate: true }) });
const server = http.createServer(async (req, res) => { if (!(await mcp(req, res, new URL(req.url, 'http://x')))) { res.writeHead(404); res.end(); } });
let base;
const call = (p, o = {}) => fetch(base + p, Object.assign({ redirect: 'manual' }, o));
test.before(async () => { await new Promise(r => server.listen(0, r)); base = 'http://127.0.0.1:' + server.address().port; });
test.after(() => server.close());

const iso = n => { const d = new Date(Date.now() + n * 864e5); return d.toISOString().slice(0, 10); };

test('coach_supprimer_groupe : seul le groupe disparaît ; formules, paiements, séances effectuées et historique restent', async () => {
  me = { id: 'U9', email: 'coach9@test.fr', first: 'Sarah', last: 'Benali', pass_hash: 'h9' };
  await store.saveUser(me);
  const club = await ram.create({ id: 'U9', name: 'Sarah Benali' }, { name: 'TC Suppression', short: 'tcs' });
  const passee = iso(-7), future = iso(7), futureAppel = iso(14);
  const achat = { id: 'a1', t: 'pack', ref: 'p1', d: iso(-30), n: 10, nom: 'Pack 10 séances', prix: 300, groupe: 'g1', cycle: 'g1:c1', pay: { ech: [{ s: 0, m: 150, ok: '2026-10-01' }, { s: 5, m: 150, ok: '' }] } };
  await ram.ops('U9', club.id, [
    { coll: 'group', id: 'g1', op: 'put', data: { type: 'train', name: 'Cycle individuel Mathieu', day: new Date().getDay(), h: '18 h', dur: '1 h', sport: 'Padel', coach: club.key, mem: ['m1'], libre: true, cycles: [{ id: 'c1', nom: 'Cycle', dates: [passee, future] }] } },
    { coll: 'group', id: 'g2', op: 'put', data: { type: 'train', name: 'Padel loisirs', day: new Date().getDay(), h: '19 h', dur: '1 h', sport: 'Padel', coach: club.key, mem: ['m1'] } },
    { coll: 'eleve', id: 'm1', op: 'put', data: { n: 'Mathieu Roux', sport: 'Padel', achats: [achat] } },
    { coll: 'seance', id: 'g1.' + passee, op: 'put', data: { g: 'g1', d: passee, pres: { m1: 'P' }, recap: 'Bonne séance', theme: 'Bandeja' } },
    { coll: 'seance', id: 'g1.' + future, op: 'put', data: { g: 'g1', d: future, theme: 'Vitres' } },
    { coll: 'seance', id: 'g1.' + futureAppel, op: 'put', data: { g: 'g1', d: futureAppel, pres: { m1: 'P' } } },
    { coll: 'seance', id: 'g2.' + passee, op: 'put', data: { g: 'g2', d: passee, pres: { m1: 'P' } } }
  ]);
  // autorisation OAuth puis appel de l'outil
  const redirect_uri = 'https://claude.ai/api/mcp/auth_callback';
  const reg = await (await call('/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: [redirect_uri] }) })).json();
  const verifier = crypto.randomBytes(32).toString('base64url'), challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri, code_challenge: challenge, code_challenge_method: 'S256', state: 'x', scope: 'ram.lecture' });
  const page = await (await call('/oauth/authorize?' + q, { headers: { 'x-test': '1' } })).text();
  const tx = page.match(/name="tx" value="([^"]+)"/)[1];
  const a1 = await call('/oauth/authorize', { method: 'POST', headers: { 'x-test': '1', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ tx, decision: 'ok' }) });
  const code = new URL(a1.headers.get('location')).searchParams.get('code');
  const t = await (await call('/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: reg.client_id, redirect_uri, code_verifier: verifier }) })).json();
  const rpc = async (method, params) => (await (await call('/mcp', { method: 'POST', headers: { Authorization: 'Bearer ' + t.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json()).result;
  assert.ok((await rpc('tools/list')).tools.some(x => x.name === 'coach_supprimer_groupe'), 'l’outil existe');
  const r = await rpc('tools/call', { name: 'coach_supprimer_groupe', arguments: { groupe_id: 'g1', club: club.id } });
  assert.ok(!r.isError, r.isError && r.content[0].text);
  const out = JSON.parse(r.content[0].text);
  assert.equal(out.supprime, true);
  assert.equal(out.seances_a_venir_retirees, 1, 'la séance à venir sans appel part avec le groupe');
  assert.equal(out.seances_gardees, 2, 'la séance passée et celle à venir avec appel sont gardées');

  // état du club après suppression (stockage local : une ligne par élément)
  const rows = JSON.parse(fs.readFileSync(path.join(DIR, 'ramclub', 'items-' + club.id.replace(/[^\w-]/g, '') + '.json'), 'utf8')).filter(x => !x.deleted);
  const get = (coll, id) => (rows.find(x => x.coll === coll && x.id === id) || {}).data;
  assert.equal(get('group', 'g1'), undefined, 'le groupe est supprimé');
  assert.ok(get('group', 'g2'), 'les autres groupes ne bougent pas');
  // formules, achats et paiements : strictement identiques
  assert.deepEqual(get('eleve', 'm1').achats, [achat], 'formules et paiements intacts');
  // séance effectuée : présences, bilan et thème intacts, nom et heure du groupe recopiés
  const p = get('seance', 'g1.' + passee);
  assert.deepEqual(p.pres, { m1: 'P' });
  assert.equal(p.recap, 'Bonne séance');
  assert.equal(p.theme, 'Bandeja');
  assert.equal(p.gnom, 'Cycle individuel Mathieu');
  assert.equal(p.gh, '18 h');
  // séance à venir sans appel ni bilan : retirée ; avec appel : gardée
  assert.equal(get('seance', 'g1.' + future), undefined);
  assert.deepEqual(get('seance', 'g1.' + futureAppel).pres, { m1: 'P' });
  // les séances des autres groupes ne sont pas touchées
  assert.deepEqual(get('seance', 'g2.' + passee), { g: 'g2', d: passee, pres: { m1: 'P' }, id: 'g2.' + passee });
});
