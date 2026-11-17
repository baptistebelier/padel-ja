/* Connecteur MCP /RAM : coach_programmer_seance — une séance créée pour un élève, rattachée à un achat en cours, avec le décompte des séances restantes.
   Services créés SANS les variables SUPABASE_* (stockage local jetable), comme les autres tests du connecteur. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-cyl-'));
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const { createRamClub } = require('../lib/ramclub');
const { createStore } = require('../lib/store');
const { createMcp } = require('../lib/mcp');
const Formules = require('../lib/formules');
const REGLES = require('../club/regles.js');
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
const iso = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

/* connexion OAuth d'un enseignant déjà créé (comme plus haut), renvoie l'appel d'outil */
async function connecte(club) {
  const redirect_uri = 'https://claude.ai/api/mcp/auth_callback';
  const reg = await (await call('/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: [redirect_uri] }) })).json();
  const verifier = crypto.randomBytes(32).toString('base64url'), challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri, code_challenge: challenge, code_challenge_method: 'S256', state: 'x', scope: 'ram.lecture' });
  const page = await (await call('/oauth/authorize?' + q, { headers: { 'x-test': '1' } })).text();
  const tx = page.match(/name="tx" value="([^"]+)"/)[1];
  const a1 = await call('/oauth/authorize', { method: 'POST', headers: { 'x-test': '1', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ tx, decision: 'ok' }) });
  const code = new URL(a1.headers.get('location')).searchParams.get('code');
  const t = await (await call('/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: reg.client_id, redirect_uri, code_verifier: verifier }) })).json();
  const use = async (name, args) => { const r = (await (await call('/mcp', { method: 'POST', headers: { Authorization: 'Bearer ' + t.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: Object.assign({ club: club.id }, args) } }) })).json()).result; if (r.isError) throw new Error(r.content[0].text); return JSON.parse(r.content[0].text); };
  const rows = () => JSON.parse(fs.readFileSync(path.join(DIR, 'ramclub', 'items-' + club.id.replace(/[^\w-]/g, '') + '.json'), 'utf8')).filter(x => !x.deleted);
  const get = (coll, id) => (rows().find(x => x.coll === coll && x.id === id) || {}).data;
  return { use, rows, get };
}


test('cycle sans récurrence : groupe à dates libres, N séances prévues, séances posées une à une, jauge faites / prévues, sans autre groupe', async () => {
  me = { id: 'U11', email: 'coach11@test.fr', first: 'Sarah', last: 'Benali', pass_hash: 'h11' };
  await store.saveUser(me);
  const club = await ram.create({ id: 'U11', name: 'Sarah Benali' }, { name: 'TC Libre', short: 'tcl' });
  await ram.ops('U11', club.id, [{ coll: 'eleve', id: 'm1', op: 'put', data: { n: 'Mathieu Roux', sport: 'Padel', achats: [] } }]);
  const { use, get, rows } = await connecte(club);
  // 1. le groupe sans créneau : ni jour ni date, avec l'élève ; une séance ponctuelle n'est pas créée
  const g = await use('coach_creer_groupe', { nom: 'Cycle 10 cours · Mathieu', sport: 'Padel', heure: '18 h', sans_recurrence: true, eleves: ['m1'] });
  assert.equal(g.sans_recurrence, true);
  await new Promise(r => setTimeout(r, 300));
  const grp = get('group', g.groupe_id);
  assert.equal(grp.libre, 1, 'groupe sans créneau (dates libres)');
  assert.equal(grp.once, undefined); assert.equal(grp.from, undefined);
  await assert.rejects(use('coach_creer_groupe', { nom: 'X', sport: 'Padel', heure: '18 h' }), /sans_recurrence/, 'sans jour ni date ni option : refusé comme avant');
  await assert.rejects(use('coach_creer_groupe', { nom: 'X', sport: 'Padel', heure: '18 h', sans_recurrence: true, jour: 'Lundi' }), /Sans récurrence/);
  // 2. le cycle : dix séances prévues, aucune date encore
  const c1 = await use('coach_cycle', { groupe_id: g.groupe_id, nom: 'Cycle automne', nombre_seances: 10 });
  const cy = c1.cycles[0];
  assert.equal(cy.taille_du_pack, 10); assert.equal(cy.etat.prevues, 10); assert.equal(cy.etat.faites, 0); assert.equal(cy.etat.posees, 0);
  // 3. deux séances posées une à une : une passée (faite : élève présent), une à venir
  await use('coach_cycle', { groupe_id: g.groupe_id, cycle_id: cy.cycle_id, ajouter_dates: [iso(-3)] });
  const c3 = await use('coach_cycle', { groupe_id: g.groupe_id, cycle_id: cy.cycle_id, ajouter_dates: [iso(4)] });
  assert.deepEqual(c3.cycles[0].etat.posees, 2);
  assert.equal(c3.cycles[0].etat.prevues, 10, 'le nombre prévu reste 10');
  assert.equal(c3.cycles[0].dates_a_poser, 8, 'huit dates restent à poser');
  await ram.ops('U11', club.id, [{ coll: 'seance', id: g.groupe_id + '.' + iso(-3), op: 'put', data: { g: g.groupe_id, d: iso(-3), pres: { m1: 'P' } } }]);
  const c4 = await use('coach_cycle', { groupe_id: g.groupe_id });
  assert.equal(c4.cycles[0].etat.faites, 1, 'une séance faite');
  assert.equal(c4.cycles[0].etat.prevues, 10, 'jauge : 1 faite sur 10 prévues');
  // 4. la séance posée (passée) est lue au planning comme celle du groupe ; les dates posées sont des séances du groupe, pas de récurrence
  const gg = get('group', g.groupe_id);
  assert.deepEqual((gg.extra || []).slice().sort(), [iso(-3), iso(4)].sort(), 'seules les dates posées existent');
  // 5. toujours un seul groupe pour cet élève : aucun groupe en plus n'a été créé par ces opérations
  await new Promise(r => setTimeout(r, 300));
  const deLui = rows().filter(x => (x.coll === 'group' || x.coll === 'cours') && (x.data.mem || []).concat(x.data.ext || []).includes('m1'));
  assert.equal(deLui.length, 1, 'un seul groupe pour cet élève : celui du cycle');
});
