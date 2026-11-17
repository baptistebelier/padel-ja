/* Connecteur MCP /RAM : coach_programmer_seance — une séance créée pour un élève, rattachée à un achat en cours, avec le décompte des séances restantes.
   Services créés SANS les variables SUPABASE_* (stockage local jetable), comme les autres tests du connecteur. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-prog-'));
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

test('règles : achats décomptables et séance d’élève rattachée à un achat (pur)', () => {
  const achats = [{ id: 'a1', t: 'pack', n: 10, used: 6, d: iso(-40), nom: 'Pack 10 séances' }, { id: 'a2', t: 'pack', n: 5, used: 5, d: iso(-90), nom: 'Pack fini' }];
  const l = REGLES.achatsDecomptables(achats, iso(0), { a1: 1 });
  assert.equal(l.length, 1, 'le pack consommé n’est plus proposé');
  assert.equal(l[0].restantes, 4);
  assert.equal(l[0].a_programmer, 3, 'une séance déjà programmée de moins à placer');
  assert.equal(l[0].libelle, 'Pack 10 séances, 4 restantes · 1 déjà programmée');
  const g = REGLES.seanceElevePlan({ date: iso(5), h: '18 h', dur: '1 h', mem: [], ext: ['m1'], coach: 'K', achat: l[0], prix: 35, theme: 'Bandeja' });
  assert.equal(g.achat, 'a1'); assert.equal(g.couvert, 'pack'); assert.equal(g.tarif.prix, 0, 'couverte : plus de prix à l’unité'); assert.equal(g.goal, 'Bandeja');
  assert.equal(REGLES.seanceElevePlan({ date: iso(5), h: '18 h', coach: 'K', prix: 35 }).tarif.prix, 35, 'sans achat : à payer à l’unité');
});

test('coach_programmer_seance : séance créée, rattachée au pack, séances restantes décomptées', async () => {
  me = { id: 'U8', email: 'coach8@test.fr', first: 'Sarah', last: 'Benali', pass_hash: 'h8' };
  await store.saveUser(me);
  await Formules.save(store, 'U8', { formules: [{ id: 'f1', nom: 'Cours individuel', sport: 'Padel', joueurs: 1, duree: 60, prix: 35 }], packs: [{ id: 'p1', formule: 'f1', nom: 'Pack 10 séances', seances: 10, prix: 300 }], abos: [] });
  const club = await ram.create({ id: 'U8', name: 'Sarah Benali' }, { name: 'TC Programme', short: 'tcp' });
  const achat = { id: 'a1', t: 'pack', ref: 'p1', d: iso(-60), n: 10, nom: 'Pack 10 séances', prix: 300, pay: { ech: [{ s: 0, m: 300, ok: iso(-60) }] } };
  const ops = [{ coll: 'eleve', id: 'm1', op: 'put', data: { n: 'Mathieu Roux', sport: 'Padel', achats: [achat] } }, { coll: 'eleve', id: 'm2', op: 'put', data: { n: 'Léa Sans Achat', sport: 'Padel', achats: [] } }];
  for (let i = 1; i <= 6; i++) {   // six séances déjà faites : le pack n'a plus que 4 séances
    ops.push({ coll: 'group', id: 'h' + i, op: 'put', data: { type: 'train', name: 'Cours individuel', once: iso(-i * 3), day: 1, h: '18 h', dur: '1 h', sport: 'Padel', coach: club.key, mem: [], ext: ['m1'] } });
    ops.push({ coll: 'seance', id: 'h' + i + '.' + iso(-i * 3), op: 'put', data: { g: 'h' + i, d: iso(-i * 3), pres: { m1: 'P' } } });
  }
  await ram.ops('U8', club.id, ops);
  // OAuth
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

  // 1. un seul achat compatible : présélectionné ; la séance est créée et rattachée
  const r1 = await use('coach_programmer_seance', { eleve: 'm1', date: iso(5), heure: '18 h', theme: 'Bandeja' });
  assert.equal(r1.cree, true);
  assert.equal(r1.achat.id, 'a1', 'achat présélectionné');
  assert.equal(r1.achat.restantes, 4, 'quatre séances restent sur le pack (six faites)');
  assert.equal(r1.achat.a_programmer_avant, 4);
  assert.equal(r1.achat.a_programmer_apres, 3, 'la séance programmée est décomptée des séances à placer');
  assert.equal(r1.a_payer_a_l_unite, false);
  await new Promise(r => setTimeout(r, 500));
  const g1 = get('cours', r1.groupe_id);
  assert.equal(g1.once, iso(5)); assert.equal(g1.achat, 'a1'); assert.equal(g1.couvert, 'pack'); assert.equal(g1.tarif.prix, 0); assert.equal(g1.goal, 'Bandeja'); assert.deepEqual(g1.ext, ['m1']);
  assert.deepEqual(get('eleve', 'm1').achats, [achat], 'l’achat lui-même n’est pas modifié');
  // 2. « aucun » : séance à payer à l'unité
  const r2 = await use('coach_programmer_seance', { eleve: 'm1', date: iso(6), heure: '19 h', achat_id: 'aucun', prix: 35 });
  assert.equal(r2.achat, null); assert.equal(r2.a_payer_a_l_unite, true);
  assert.equal(get('cours', r2.groupe_id).tarif.prix, 35); assert.equal(get('cours', r2.groupe_id).achat, undefined);
  // 3. une deuxième séance rattachée : il reste 2 séances à placer
  const r3 = await use('coach_programmer_seance', { eleve: 'm1', date: iso(8), heure: '18 h', achat_id: 'a1' });
  assert.equal(r3.achat.a_programmer_avant, 3); assert.equal(r3.achat.a_programmer_apres, 2);
  // 4. élève sans achat : attribuer un pack et créer la séance d'un coup
  const r4 = await use('coach_programmer_seance', { eleve: 'm2', date: iso(7), heure: '17 h', produit: 'p1', attribuer: true });
  assert.ok(r4.achat_cree, 'achat créé'); assert.equal(r4.achat.restantes, 10);
  assert.equal(get('eleve', 'm2').achats.length, 1); assert.equal(get('cours', r4.groupe_id).achat, r4.achat_cree.id);
  // un achat inexistant est refusé
  await assert.rejects(use('coach_programmer_seance', { eleve: 'm1', date: iso(9), heure: '18 h', achat_id: 'zzz' }), /n’est pas en cours/);
});

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

test('coach_programmer_seance : une séance passée est permise à l’enseignant, notée présente et décomptée du pack, sans rappel', async () => {
  me = { id: 'U9', email: 'coach9@test.fr', first: 'Sarah', last: 'Benali', pass_hash: 'h9' };
  await store.saveUser(me);
  await Formules.save(store, 'U9', { formules: [{ id: 'f1', nom: 'Cours individuel', sport: 'Padel', joueurs: 1, duree: 60, prix: 35 }], packs: [{ id: 'p1', formule: 'f1', nom: 'Pack 10 séances', seances: 10, prix: 300 }], abos: [] });
  const club = await ram.create({ id: 'U9', name: 'Sarah Benali' }, { name: 'TC Passé', short: 'tcq' });
  const achat = { id: 'a1', t: 'pack', ref: 'p1', d: iso(-60), n: 10, nom: 'Pack 10 séances', prix: 300, pay: { ech: [{ s: 0, m: 300, ok: iso(-60) }] } };
  await ram.ops('U9', club.id, [{ coll: 'eleve', id: 'm1', op: 'put', data: { n: 'Mathieu Roux', sport: 'Padel', achats: [achat] } }]);
  const { use, get } = await connecte(club);
  // le pack n'a encore servi à rien : dix séances restantes
  const r1 = await use('coach_programmer_seance', { eleve: 'm1', date: iso(-4), heure: '18 h 30', theme: 'Service' });
  assert.equal(r1.cree, true);
  assert.equal(r1.achat.id, 'a1');
  assert.equal(r1.achat.restantes, 10, 'avant la séance : dix restantes');
  await new Promise(r => setTimeout(r, 500));
  const seance = get('seance', r1.groupe_id + '.' + iso(-4));
  assert.ok(seance, 'la séance passée est enregistrée avec son appel');
  assert.deepEqual(seance.pres, { m1: 'P' }, 'l’élève y est noté présent');
  assert.equal(get('cours', r1.groupe_id).once, iso(-4));
  // elle compte : le pack passe à neuf séances restantes
  const apres = await use('coach_eleve', { eleve_id: 'm1' });
  const pack = JSON.stringify(apres);
  assert.ok(pack.includes(r1.groupe_id), 'visible dans l’historique de l’élève');
  const r2 = await use('coach_programmer_seance', { eleve: 'm1', date: iso(-2), heure: '10 h', achat_id: 'a1', present: false });
  assert.equal(r2.achat.restantes, 9, 'la première séance a été décomptée');
  await new Promise(r => setTimeout(r, 300));
  assert.equal(get('seance', r2.groupe_id + '.' + iso(-2)), undefined, 'present:false : pas d’appel, donc pas décomptée');
  // le planning de la semaine passée la montre
  const plan = await use('coach_planning', { du: iso(-6), au: iso(0) });
  assert.ok(JSON.stringify(plan).includes(iso(-4)) && JSON.stringify(plan).includes('Cours individuel'), 'le planning d’une semaine passée montre la séance');
});
