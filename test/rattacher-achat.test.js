/* Rattacher une séance de l'historique d'un élève à un de ses achats : règles de décompte (ac), connecteur (coach_seance achat_id, coach_eleve)
   et notification. Services créés SANS les variables SUPABASE_* (stockage local jetable), comme les autres tests du connecteur. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-rat-'));
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const { createRamClub } = require('../lib/ramclub');
const { createStore } = require('../lib/store');
const { createMcp } = require('../lib/mcp');
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

test('règles : une séance rattachée (ac) se décompte de son achat : pack, cycle individuel, abonnement, achat complet, détachement', () => {
  const O = { formules: [{ id: 'f1', joueurs: 1, duree: 60 }], packs: [{ id: 'p1', formule: 'f1' }] };
  const v = (d, ac, min) => ({ d, min: min || 90, n: 1, ac });   // 90 min : n'est pas le format du pack (1 h)
  const pk = { id: 'a1', t: 'pack', ref: 'p1', d: iso(-40), n: 10, nom: 'Pack 10' }, ab = { id: 'a2', t: 'abo', ref: 'x', d: iso(-80), fin: iso(80), nom: 'Abo', pm: 4 };
  // pack : une séance d'un autre format, rattachée, compte dans le pack ; sans le lien, elle ne compte pour personne
  assert.equal(REGLES.couverture([pk], [v(iso(-5))], O).achats[0].used, 0, 'sans lien : le format ne correspond pas');
  assert.equal(REGLES.couverture([pk], [v(iso(-5), 'a1')], O).achats[0].used, 1);
  // détachée : retour à la règle par défaut
  assert.equal(REGLES.couverture([pk], [v(iso(-5), undefined, 60)], O).achats[0].used, 1, 'même format : la règle par défaut la prend');
  // rattachée à un autre achat : l'achat par défaut ne la prend plus
  const deux = REGLES.couverture([pk, ab], [v(iso(-5), 'a2', 60)], O).achats;
  assert.equal(deux.find(a => a.id === 'a1').used, 0); assert.equal(deux.find(a => a.id === 'a2').used, 1);
  // achat complet : 11/10, sans rien bloquer ; la séance reste couverte
  const plein = Array.from({ length: 11 }, (_, i) => v(iso(-30 + i), 'a1', 60));
  const c = REGLES.couverture([pk], plein, O);
  assert.equal(c.achats[0].used, 11); assert.equal(c.couvre.size, 11);
  assert.equal(REGLES.achatsDecomptables(c.achats, iso(0), {})[0], undefined, 'un pack complet n’a plus de séances restantes');
  // cycle individuel (un pack sans groupe), séance antérieure à la date d'achat : rattachée, elle compte quand même
  assert.equal(REGLES.couverture([Object.assign({}, pk, { d: iso(-3) })], [v(iso(-20), 'a1')], O).achats[0].used, 1);
  // abonnement : la séance compte dans le mois de sa date, même hors de ses dates
  const m = REGLES.couverture([ab], [v(iso(-5), 'a2'), v(iso(-200), 'a2')], O).achats[0];
  assert.equal(m.used, 2); assert.equal(m.parMois[iso(-200).slice(0, 7)], 1);
  // cours de plusieurs élèves : un achat par élève (achatPar), l'achat d'un autre élève est ignoré
  const g = { id: 'c', once: iso(-5), mem: [], ext: ['k1', 'k2'], dur: '1 h', achat: 'zz', achatPar: { k1: 'a1' } };
  assert.equal(REGLES.achatDe(g, 'k1'), 'a1'); assert.equal(REGLES.achatDe(g, 'k2'), 'zz');
  assert.equal(REGLES.venuesDe('k1', [{ g: 'c', d: iso(-5), pres: { k1: 'P' } }], [g], iso(0))[0].ac, 'a1');
  assert.equal(REGLES.couverture([{ id: 'b9', t: 'pack', ref: 'p1', d: iso(-40), n: 3 }], REGLES.venuesDe('k2', [{ g: 'c', d: iso(-5), pres: { k2: 'P' } }], [g], iso(0)), O).achats[0].used, 0, 'achat inconnu de cet élève : règle par défaut (un duo n’est pas le format du pack)');
  assert.deepEqual(REGLES.progParAchat([Object.assign({}, g, { once: iso(4) })], iso(0)), { zz: 1, a1: 1 });
});

test('coach_seance achat_id : rattache, détache, duo par élève ; coach_eleve indique l’achat de chaque séance', async () => {
  me = { id: 'U12', email: 'coach12@test.fr', first: 'Sarah', last: 'Benali', pass_hash: 'h12' };
  await store.saveUser(me);
  const club = await ram.create({ id: 'U12', name: 'Sarah Benali' }, { name: 'TC Rattache', short: 'tcr' });
  const d = iso(-6);
  await ram.ops('U12', club.id, [
    { coll: 'eleve', id: 'm1', op: 'put', data: { n: 'Mathieu Roux', sport: 'Padel', achats: [{ id: 'a1', t: 'pack', ref: 'p1', d: iso(-40), n: 10, nom: 'Pack 10' }, { id: 'a2', t: 'abo', ref: 'x', d: iso(-40), fin: iso(80), nom: 'Abo', pm: 4 }] } },
    { coll: 'eleve', id: 'm2', op: 'put', data: { n: 'Léa Duo', sport: 'Padel', achats: [{ id: 'b1', t: 'pack', ref: 'p1', d: iso(-40), n: 5, nom: 'Pack Léa' }] } },
    { coll: 'cours', id: 'c1', op: 'put', data: { type: 'train', name: 'Cours individuel', once: d, day: 1, h: '18 h', dur: '1 h', sport: 'Padel', coach: club.key, mem: [], ext: ['m1'] } },
    { coll: 'seance', id: 'c1.' + d, op: 'put', data: { g: 'c1', d, pres: { m1: 'P' } } },
    { coll: 'cours', id: 'c2', op: 'put', data: { type: 'train', name: 'Cours duo', once: d, day: 1, h: '19 h', dur: '1 h', sport: 'Padel', coach: club.key, mem: [], ext: ['m1', 'm2'] } },
    { coll: 'seance', id: 'c2.' + d, op: 'put', data: { g: 'c2', d, pres: { m1: 'P', m2: 'P' } } }
  ]);
  const { use, get } = await connecte(club);
  const r = await use('coach_seance', { groupe_id: 'c1', date: d, achat_id: 'a1' });
  assert.deepEqual(r.achat, { id: 'a1', nom: 'Pack 10' });
  assert.equal(get('cours', 'c1').achat, 'a1'); assert.equal(get('cours', 'c1').name, 'Cours individuel'); assert.equal(get('cours', 'c1').h, '18 h', 'nom, heure et durée gardés');
  const h = (await use('coach_eleve', { eleve_id: 'm1', club: club.id })).historique.find(x => x.groupe_id === 'c1');
  assert.deepEqual(h.achat, { id: 'a1', nom: 'Pack 10' });
  // changer d'achat (l'abonnement), puis détacher
  assert.equal((await use('coach_seance', { groupe_id: 'c1', date: d, achat_id: 'a2' })).achat.id, 'a2');
  assert.equal(get('cours', 'c1').achat, 'a2');
  assert.equal((await use('coach_seance', { groupe_id: 'c1', date: d, achat_id: 'aucun' })).achat, null);
  assert.equal(get('cours', 'c1').achat, undefined); assert.equal(get('cours', 'c1').name, 'Cours individuel');
  // un achat qui n'est pas à l'élève est refusé
  await assert.rejects(use('coach_seance', { groupe_id: 'c1', date: d, achat_id: 'b1' }), /introuvable/);
  // duo : eleve_id obligatoire, un achat par élève
  await assert.rejects(use('coach_seance', { groupe_id: 'c2', date: d, achat_id: 'a1' }), /eleve_id/);
  await use('coach_seance', { groupe_id: 'c2', date: d, achat_id: 'a1', eleve_id: 'm1' });
  await use('coach_seance', { groupe_id: 'c2', date: d, achat_id: 'b1', eleve_id: 'm2' });
  assert.deepEqual(get('cours', 'c2').achatPar, { m1: 'a1', m2: 'b1' });
  const h2 = (await use('coach_eleve', { eleve_id: 'm2', club: club.id })).historique.find(x => x.groupe_id === 'c2');
  assert.equal(h2.achat.id, 'b1');
  await use('coach_seance', { groupe_id: 'c2', date: d, achat_id: 'aucun', eleve_id: 'm1' });
  assert.deepEqual(get('cours', 'c2').achatPar, { m2: 'b1' });
});
