/* Connecteur MCP /RAM : coach_supprimer_seance avec eleve_id — retire une séance de l'historique d'un élève.
   Le pack est recrédité (le décompte suit les séances faites), l'achat et ses paiements ne bougent pas, une séance de groupe ne perd que cet élève.
   Services créés SANS les variables SUPABASE_* (stockage local jetable). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-supp-'));
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const { createRamClub } = require('../lib/ramclub');
const { createStore } = require('../lib/store');
const { createMcp } = require('../lib/mcp');
const Formules = require('../lib/formules');
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

test('coach_supprimer_seance (un élève) : pack recrédité, achat et paiements intacts, séance de groupe retirée à cet élève seulement', async () => {
  me = { id: 'U7', email: 'coach7@test.fr', first: 'Sarah', last: 'Benali', pass_hash: 'h7' };
  await store.saveUser(me);
  await Formules.save(store, 'U7', { formules: [{ id: 'f1', nom: 'Cours individuel', sport: 'Padel', joueurs: 1, duree: 60, prix: 35 }], packs: [{ id: 'p1', formule: 'f1', nom: 'Pack 10 séances', seances: 10, prix: 300 }], abos: [] });
  const club = await ram.create({ id: 'U7', name: 'Sarah Benali' }, { name: 'TC Suppression séance', short: 'tcs' });
  const achat = { id: 'a1', t: 'pack', ref: 'p1', d: iso(-80), n: 10, nom: 'Pack 10 séances', prix: 300, pay: { ech: [{ s: 0, m: 150, ok: iso(-80) }, { s: 5, m: 150, ok: iso(-20) }] } };
  const ops = [{ coll: 'eleve', id: 'm1', op: 'put', data: { n: 'Mathieu Roux', sport: 'Padel', achats: [achat] } }, { coll: 'eleve', id: 'm2', op: 'put', data: { n: 'Léa Martin', sport: 'Padel', achats: [] } }];
  for (let i = 1; i <= 7; i++) {   // sept séances faites : il reste 3 séances sur le pack
    ops.push({ coll: 'group', id: 'h' + i, op: 'put', data: { type: 'train', name: 'Cours individuel', once: iso(-i * 3), day: 1, h: '18 h', dur: '1 h', sport: 'Padel', coach: club.key, mem: [], ext: ['m1'] } });
    ops.push({ coll: 'seance', id: 'h' + i + '.' + iso(-i * 3), op: 'put', data: { g: 'h' + i, d: iso(-i * 3), pres: { m1: 'P' } } });
  }
  // une séance de groupe (chaque semaine) faite hier, avec deux élèves
  const hier = iso(-1);
  ops.push({ coll: 'group', id: 'gg', op: 'put', data: { type: 'train', name: 'Duo du mardi', day: new Date(hier + 'T12:00:00').getDay(), h: '19 h', dur: '1 h', sport: 'Padel', coach: club.key, mem: [], ext: ['m1', 'm2'], from: iso(-30) } });
  ops.push({ coll: 'seance', id: 'gg.' + hier, op: 'put', data: { g: 'gg', d: hier, pres: { m1: 'P', m2: 'P' }, theme: 'Vitres' } });
  await ram.ops('U7', club.id, ops);
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
  const attendre = () => new Promise(r => setTimeout(r, 400));

  // sans meme_avec_appel : refusé (la séance a un appel)
  await assert.rejects(use('coach_supprimer_seance', { groupe_id: 'h1', date: iso(-3), eleve_id: 'm1' }), /appel/);
  // 1. séance individuelle faite : supprimée, le pack est recrédité (3 → 4 séances restantes)
  const r1 = await use('coach_supprimer_seance', { groupe_id: 'h1', date: iso(-3), eleve_id: 'm1', meme_avec_appel: true });
  assert.equal(r1.supprimee, true);
  assert.equal(r1.portee, 'tous les élèves', 'séance où il est seul : elle disparaît');
  assert.deepEqual(r1.recredit, [{ achat: 'Pack 10 séances', restantes_avant: 3, restantes_apres: 4 }], 'le pack est recrédité');
  await attendre();
  assert.equal(get('cours', 'h1') || get('group', 'h1'), undefined, 'le cours est supprimé');
  assert.equal(get('seance', 'h1.' + iso(-3)), undefined, 'sa séance aussi');
  assert.deepEqual(get('eleve', 'm1').achats, [achat], 'achat et paiements (dont celui déjà encaissé) intacts');
  assert.ok(get('group', 'h2') || get('cours', 'h2'), 'les autres séances ne bougent pas');
  // 2. séance de groupe : seul Mathieu en est retiré, Léa la garde avec sa présence
  const r2 = await use('coach_supprimer_seance', { groupe_id: 'gg', date: hier, eleve_id: 'm1', meme_avec_appel: true });
  assert.equal(r2.portee, 'cet élève seulement');
  await attendre();
  const s = get('seance', 'gg.' + hier);
  assert.ok(s, 'la séance de groupe existe encore');
  assert.deepEqual(s.pres, { m2: 'P' }, 'seule la présence de Mathieu part');
  assert.deepEqual(s.out, ['m1'], 'Mathieu est retiré de cette seule séance');
  assert.equal(s.theme, 'Vitres');
  assert.deepEqual(get('group', 'gg').ext, ['m1', 'm2'], 'le groupe garde ses deux élèves');
  assert.deepEqual(r2.recredit, [{ achat: 'Pack 10 séances', restantes_avant: 4, restantes_apres: 4 }], 'une séance de groupe ne décomptait pas ce pack : rien à recréditer');
  // un élève absent de la séance : refusé
  await assert.rejects(use('coach_supprimer_seance', { groupe_id: 'gg', date: hier, eleve_id: 'm1', meme_avec_appel: true }), /pas dans cette séance/);
  // sans eleve_id : la séance disparaît pour tous (comportement d'origine)
  const r3 = await use('coach_supprimer_seance', { groupe_id: 'gg', date: hier, meme_avec_appel: true });
  assert.equal(r3.portee, 'tous les élèves');
  await attendre();
  assert.equal(get('seance', 'gg.' + hier), undefined);
});
