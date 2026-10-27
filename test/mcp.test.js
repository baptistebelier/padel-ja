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
const { createMcp, seal } = require('../lib/mcp');
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
  assert.ok(tools.filter(x => x.annotations.readOnlyHint).length >= 10 && tools.some(x => !x.annotations.readOnlyHint));
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
  // ---------- écriture /RAM Coach (accordée par défaut sur la page d'autorisation) ----------
  const names = (await rpc('tools/list')).tools.map(x => x.name);
  assert.ok(names.includes('coach_bilan_brouillon') && names.includes('coach_niveau'));
  const w = async (name, args) => { const r = await rpc('tools/call', { name, arguments: args }); if (r.isError) throw new Error(r.content[0].text); return JSON.parse(r.content[0].text); };
  const g = await w('coach_creer_groupe', { nom: 'Padel loisirs', sport: 'Padel', jour: 'mardi', heure: '19 h 30', duree: '90 min', places: 8, tarif_prix: 60 });
  const once = await w('coach_creer_groupe', { nom: 'Cours de Jules', sport: 'Padel', date: '2026-11-20', heure: '10:00' });
  assert.equal(once.creneau, '20/11/2026 10 h · 1 h');
  const nv = await w('coach_ajouter_eleve', { prenom: 'Jules', nom: 'Perrin', email: 'jules@test.fr', sport: 'Padel', groupe_id: g.groupe_id });
  assert.equal(nv.compte_ram_club, false);
  const linked = await w('coach_ajouter_eleve', { prenom: 'Léo', nom: 'Martin', groupe_id: g.groupe_id });
  assert.equal(linked.eleve_id, 'kid1', 'adhérent déjà dans /RAM Club : relié à son compte');
  // import d'une liste (une seule confirmation) : relie, complète ou crée, sans doublon
  const imp = await w('coach_importer_eleves', { eleves: [{ prenom: 'Léo', nom: 'Martin' }, { prenom: 'Jules', nom: 'Perrin', email: 'jules@test.fr', telephone: '0600000000' }, { prenom: 'Nina', nom: 'Anglade', email: 'nina@test.fr', note: 'Séance unique' }, { prenom: 'Nina', nom: 'Anglade' }] });
  assert.deepEqual([imp.eleves, imp.relie_au_compte, imp.complete, imp.cree], [3, 1, 1, 1]);
  // historique de séances : séance ponctuelle créée avec les présents, séance notée dans un groupe, pas de doublon
  const hist = [{ date: '2026-03-18', heure: '17:00', duree: '90 min', nom: 'Cours collectif', eleves: ['Nina Anglade', 'jules@test.fr', 'Inconnu Total'], tarif_prix: 84 }, { date: '2026-11-10', groupe_id: g.groupe_id, eleves: ['kid1'] }];
  const sh = await w('coach_importer_seances', { seances: hist });
  assert.deepEqual([sh.creees, sh.notees_dans_un_groupe, sh.eleves_introuvables], [1, 1, ['Inconnu Total']]);
  assert.equal((await w('coach_importer_seances', { seances: hist.slice(0, 1) })).deja_la, 1);
  // un cycle importé séance par séance (mardis, une séance déplacée au lundi, un mardi sans séance) devient un seul groupe
  const cyc = ['2026-04-07', '2026-04-14', '2026-04-20', '2026-04-28'].map(d => ({ date: d, heure: '19:30', duree: '90 min', nom: 'Cycle test', eleves: ['kid1', 'jules@test.fr'].concat(d === '2026-04-14' ? ['nina@test.fr'] : []) }));
  await w('coach_importer_seances', { seances: cyc });
  const rg = await w('coach_regrouper_seances', { nom_des_seances: 'Cycle test' });
  assert.deepEqual([rg.seances, rg.du, rg.au, rg.seances_deplacees, rg.semaines_sans_seance, rg.eleves.length], [4, '2026-04-07', '2026-04-28', 1, 1, 2]);
  await assert.rejects(w('coach_regrouper_seances', { nom_des_seances: 'Cycle test' }), /Aucune séance/);
  await w('coach_envoyer_message', { eleve_id: 'kid1', texte: 'Pense à ta raquette' });
  await w('coach_bilan_brouillon', { groupe_id: g.groupe_id, date: '2026-11-17', bilan_groupe: 'Bandeja', personnels: { kid1: 'Bravo' } });
  await w('coach_niveau', { eleve_id: 'kid1', niveau: 4, sport: 'Padel' });
  await w('coach_grille_technique', { eleve_id: 'kid1', notes: { 'Coup droit': 3, Revers: 2 } });
  await w('coach_modifier_echelle', { sport: 'Tennis', niveaux: [{ nom: 'Mini' }, { nom: 'Ados' }] });
  const sync = await ram.sync('U1', club.id, 0), it = (c, i) => (sync.items.find(x => x.coll === c && x.id === i) || {}).data;
  assert.deepEqual(it('group', g.groupe_id).ext, [nv.eleve_id]);
  assert.ok(it('group', g.groupe_id).mem.includes('kid1'));
  assert.equal(it('group', once.groupe_id).once, '2026-11-20');
  assert.equal(it('member', 'kid1').pl, 4, 'niveau recopié dans la fiche /RAM Club');
  assert.equal(it('eleve', 'kid1').tech.Revers, 2);
  assert.equal(it('brouillon', g.groupe_id + '.2026-11-17').recap, 'Bandeja');
  assert.equal(it('seance', g.groupe_id + '.2026-11-10').pres.kid1, 'P');
  const cg = it('group', rg.groupe_id);
  assert.deepEqual([cg.day, cg.h, cg.extra, cg.skip, cg.to], [2, '19 h 30', ['2026-04-20'], ['2026-04-21'], '2026-04-28']);
  assert.ok(it('chan', rg.groupe_id), 'le groupe a sa discussion');
  assert.equal(Object.keys(it('seance', rg.groupe_id + '.2026-04-14').pres).length, 3, 'la venue ponctuelle reste dans l’historique');
  assert.equal(sync.items.filter(x => x.coll === 'group' && x.data && x.data.name === 'Cycle test' && x.data.once).length, 0);
  assert.equal(it('chan', once.groupe_id), undefined, 'une séance ponctuelle n’a pas de discussion');
  const cours = sync.items.find(x => x.coll === 'group' && x.data.once === '2026-03-18').data;
  assert.equal(Object.keys(it('seance', sync.items.find(x => x.data === cours).id + '.2026-03-18').pres).length, 2);
  assert.equal(sync.items.filter(x => x.coll === 'suivi' && x.data.to === 'kid1').length, 1);
  assert.equal((await use('coach_echelles')).Tennis.levels.length, 2);
  // un brouillon reste invisible pour les adhérents
  const adh = await ram.join({ id: 'U3', name: 'Paul Adh' }, club.code);
  await ram.ops('U1', club.id, [{ coll: 'member', id: adh.key, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: (it('conf', 'main') || {}).season }] }]);
  assert.equal((await ram.sync('U3', club.id, 0)).items.some(x => x.coll === 'brouillon'), false);
  // accès accordé en lecture seule : pas d'outil d'écriture
  const q2 = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri, code_challenge: challenge, code_challenge_method: 'S256' });
  const tx2 = (await (await call('/oauth/authorize?' + q2, { headers: { 'x-test': '1' } })).text()).match(/name="tx" value="([^"]+)"/)[1];
  const back2 = new URL((await call('/oauth/authorize', { method: 'POST', headers: { 'x-test': '1', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ tx: tx2, decision: 'ok', ecriture: 'non' }) })).headers.get('location'));
  const ro = await (await tok({ grant_type: 'authorization_code', code: back2.searchParams.get('code'), client_id: reg.client_id, redirect_uri, code_verifier: verifier })).json();
  const roList = await (await call('/mcp', { method: 'POST', headers: { Authorization: 'Bearer ' + ro.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/list' }) })).json();
  assert.ok(roList.result.tools.every(x => x.annotations.readOnlyHint), 'lecture seule');
  // accès donné avant l'écriture (sans droits notés) : refusé, Claude redemande l'autorisation
  const old = seal('acc', { u: 'U1', c: reg.client_id, exp: Date.now() + 60000 });
  assert.equal((await call('/mcp', { method: 'POST', headers: { Authorization: 'Bearer ' + old, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' }) })).status, 401);
  const oldRef = seal('ref', { u: 'U1', c: reg.client_id, pw: require('crypto').createHash('sha256').update('h1').digest('base64url').slice(0, 12), exp: Date.now() + 60000 });
  assert.equal((await tok({ grant_type: 'refresh_token', refresh_token: oldRef })).status, 400);
  // changer son mot de passe coupe le renouvellement de l'accès
  assert.equal((await tok({ grant_type: 'refresh_token', refresh_token: t.refresh_token })).status, 200);
  me.pass_hash = 'h2'; await store.saveUser(me);
  assert.equal((await tok({ grant_type: 'refresh_token', refresh_token: t.refresh_token })).status, 400);
});
