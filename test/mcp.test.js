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
const applyServerAction = (room, action) => { const m = Ani.isAnimation(room.row.state) ? Ani : Engine; m.reduce(room.row.state, action); };
const newTournament = async (owner, o) => { const state = o.animation ? Ani.initialState(o.animation) : Engine.initialState(); if (o.name) state.tournament.name = o.name; const row = { id: 'ja' + rooms.size, owner, state }; rooms.set(row.id, { row }); return row; };
const mcp = createMcp({ store, ram, Engine, Ani, getRoom: async id => rooms.get(id) || null, mainClubOf: async () => null,
  currentUser: async req => (req.headers['x-test'] ? me : null), readBody, json, redirect, newTournament, applyServerAction, accessFor: async () => ({ canCreate: true }) });
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
  // un groupe commence à sa première séance (jamais d'historique imaginaire) ; ses dates se règlent ensuite
  const ec = await w('coach_creer_groupe', { nom: 'École débutants', sport: 'Padel', jour: 'mercredi', heure: '14 h', debut: '2030-01-02' });
  // ---------- formules, groupes, séances et paiements ----------
  await w('coach_disponibilites', { periodes: [{ jour: 'lundi', du: '09:00', au: '12:00', lieu: 'Club' }], conges: [{ nom: 'Noël', du: '2030-12-24', au: '2030-12-31' }] });
  await w('coach_modifier_formules', { formules: [{ id: 'f1', nom: 'Individuel', joueurs: 1, duree: 60, prix: 35 }], packs: [{ id: 'p1', formule: 'f1', nom: 'Pack 4', seances: 4, prix: 120 }] });
  const dispo = await w('coach_disponibilites', {});
  assert.deepEqual([dispo.periodes[0].jour, dispo.conges[0].nom], ['lundi', 'Noël'], 'changer ses tarifs n’efface ni disponibilités ni vacances');
  const gr = await w('coach_creer_groupe', { nom: 'Pack du mardi', sport: 'Padel', jour: 'mardi', heure: '18 h', debut: '2030-01-01', eleves: ['kid1'] });
  const at = await w('coach_attribuer_formule', { produit: 'Pack 4', groupe_id: gr.groupe_id, date: '2030-01-01', reglement: 'plusieurs_fois', versements: 2, moyen: 'Virement' });
  assert.deepEqual([at.produit, at.attribue], ['Pack 4', ['Léo Martin']]);
  assert.deepEqual((await w('coach_attribuer_formule', { produit: 'Pack 4', eleves: ['Léo Martin'], date: '2030-01-01' })).deja, ['Léo Martin'], 'pas deux fois');
  await assert.rejects(w('coach_attribuer_formule', { produit: 'Inconnu', eleves: ['kid1'] }), /Produit inconnu/);
  const dus = (await w('coach_paiements', {})).a_regulariser.find(x => x.eleve_id === 'kid1');
  assert.deepEqual(dus.echeances.map(x => [x.numero, x.montant, x.regle_le]), [[1, 60, null], [2, 60, null]]);
  await w('coach_marquer_paye', { eleve: 'kid1', achat_id: dus.achat_id, echeance: 1, date: '2030-01-02' });
  assert.deepEqual((await w('coach_paiements', {})).a_regulariser.find(x => x.eleve_id === 'kid1').echeances[0].regle_le, '2030-01-02');
  await w('coach_marquer_paye', { eleve: 'kid1', achat_id: dus.achat_id });
  assert.equal((await w('coach_paiements', {})).a_regulariser.some(x => x.achat_id === dus.achat_id), false, 'tout est réglé');
  await w('coach_marquer_paye', { eleve: 'kid1', achat_id: dus.achat_id, echeance: 2, paye: false });
  assert.equal((await w('coach_paiements', {})).a_regulariser.some(x => x.achat_id === dus.achat_id), true, 'retour en arrière');
  assert.equal((await w('coach_marquer_paye', { eleve: 'kid1', groupe_id: gr.groupe_id, date: '2030-01-01' })).paye, true);
  // une séance : un élève en plus pour cette date, un autre noté absent, thème et appel
  const fiche = await w('coach_ajouter_eleve', { prenom: 'Ana', nom: 'Roy', email: 'ana@exemple.test' });
  const se = await w('coach_seance', { groupe_id: gr.groupe_id, date: '2030-01-01', ajouter: ['Ana Roy'], retirer: ['kid1'], theme: 'Volée', presents: ['Ana Roy'] });
  assert.deepEqual([se.theme, se.ajoutes, se.retires], ['Volée', ['Ana Roy'], ['Léo Martin']]);
  assert.equal(Object.values(se.appel).filter(v => v === 'E').length, 1, 'retiré de cette seule séance');
  await assert.rejects(w('coach_seance', { groupe_id: gr.groupe_id, date: '2030-01-02' }), /Pas de séance/);
  // un cours : ses élèves changent vraiment
  const co = await w('coach_creer_groupe', { nom: 'Cours seul', sport: 'Padel', date: '2030-02-01', heure: '10 h', eleves: ['kid1'] });
  await w('coach_seance', { groupe_id: co.groupe_id, date: '2030-02-01', ajouter: ['Ana Roy'], retirer: ['kid1'] });
  const cs = (await ram.itemsOf(club.id, 'cours')).find(x => x.id === co.groupe_id).data;
  assert.deepEqual([cs.mem, cs.ext.length], [[], 1]);
  assert.ok(fiche);
  assert.equal((await w('coach_annuler_seance', { groupe_id: co.groupe_id, date: '2030-02-01' })).annulee, true);
  assert.equal((await w('coach_annuler_seance', { groupe_id: co.groupe_id, date: '2030-02-01', retablir: true })).annulee, false);
  await w('coach_ajouter_au_groupe', { eleve_id: 'kid1', groupe_id: ec.groupe_id });
  assert.equal((await w('coach_retirer_du_groupe', { eleve_id: 'kid1', groupe_id: ec.groupe_id })).retire, true);
  await assert.rejects(w('coach_retirer_du_groupe', { eleve_id: 'kid1', groupe_id: ec.groupe_id }), /pas dans ce groupe/);
  const col = await w('coach_ouvrir_collectif', { mode: 'cours', sport: 'Padel', theme: 'Bandeja', date: '2030-03-01', heure: '18 h', groupes: [{ nom: 'Débutants', de: '1', a: '3', minimum: 2, maximum: 4 }] });
  const pc = (await ram.itemsOf(club.id, 'post')).find(x => x.id === col.publication).data;
  assert.deepEqual([pc.nv.tiers[0].nom, pc.nv.tiers[0].lo, pc.nv.tiers[0].places, pc.nv.tiers[0].max], ['Débutants', 1, 2, 4]);
  // un cycle : les séances déjà passées s'y rattachent, le compte ne dépend plus de la date de fin
  await w('coach_seance', { groupe_id: gr.groupe_id, date: '2030-01-08', presents: ['kid1'] });
  const cy = await w('coach_cycle', { groupe_id: gr.groupe_id, nom: 'Hiver', produit: 'Pack 4', ajouter_dates: ['2030-01-01', '2030-01-08', '2030-01-11', '2030-01-15'], seances_paiement: [2] });
  assert.equal(cy.cycles[0].taille_du_pack, 4);
  assert.deepEqual(cy.cycles[0].paiements_aux_seances, [2]);
  assert.deepEqual(cy.cycles[0].etat.seances.map(x => x.d), ['2030-01-01', '2030-01-08', '2030-01-11', '2030-01-15']);
  const gc = (await ram.itemsOf(club.id, 'group')).find(x => x.id === gr.groupe_id).data;
  assert.ok(gc.extra.includes('2030-01-11'), 'hors créneau : devient une séance du groupe');
  const cy2 = await w('coach_cycle', { groupe_id: gr.groupe_id, nom: 'Printemps', ajouter_dates: ['2030-01-15'] });
  assert.deepEqual(cy2.cycles.map(x => x.etat.seances.length), [3, 1], 'une séance n’est que dans un cycle');
  assert.equal((await w('coach_cycle', { groupe_id: gr.groupe_id })).cycles.length, 2);
  await assert.rejects(w('coach_cycle', { groupe_id: gr.groupe_id, cycle_id: 'rien', nom: 'x' }), /introuvable/);
  const parN = await w('coach_attribuer_formule', { produit: 'Pack 4', eleves: ['Ana Roy'], date: '2030-01-05', seances_paiement: [4], reglement: 'a_payer' });
  assert.equal(parN.attribue.length, 1);
  assert.deepEqual((await w('coach_paiements', {})).a_regulariser.find(x => x.eleve === 'Ana Roy').echeances.map(x => [x.a_la_seance, x.montant]), [[4, 120]], 'à la séance 4');
  await ram.ops('U1', club.id, [{ coll: 'eleve', id: 'kid1', op: 'put', data: { n: 'Léo Martin', lvl: 3, sport: 'Tennis', note: 'timide' } }]);   // la suite repart de sa fiche d'origine
  // ---------- séance déplacée, supprimée, bilan publié ----------
  const gm = await w('coach_creer_groupe', { nom: 'Mobile', sport: 'Padel', jour: 'lundi', heure: '18 h', debut: '2030-04-01', eleves: ['kid1'] });
  await w('coach_cycle', { groupe_id: gm.groupe_id, nom: 'C1', ajouter_dates: ['2030-04-01', '2030-04-08'] });
  await w('coach_seance', { groupe_id: gm.groupe_id, date: '2030-04-01', theme: 'Volée', presents: ['kid1'], lieu: 'Extérieur' });
  const mv = await w('coach_deplacer_seance', { groupe_id: gm.groupe_id, date: '2030-04-01', nouvelle_date: '2030-04-03' });
  assert.equal(mv.vers, '2030-04-03');
  const gr2 = () => ram.itemsOf(club.id, 'group').then(l => l.find(x => x.id === gm.groupe_id).data);
  assert.deepEqual((await gr2()).cycles[0].dates, ['2030-04-03', '2030-04-08'], 'le cycle suit la séance');
  const sm = await ram.itemsOf(club.id, 'seance');
  assert.equal(sm.find(x => x.id === gm.groupe_id + '.2030-04-03').data.theme, 'Volée');
  assert.ok(!sm.some(x => x.id === gm.groupe_id + '.2030-04-01'), 'plus rien à l’ancienne date');
  await assert.rejects(w('coach_deplacer_seance', { groupe_id: gm.groupe_id, date: '2030-04-03', nouvelle_date: '2030-04-08' }), /déjà une séance/);
  // l'heure d'une seule séance d'un groupe chaque semaine : les autres gardent celle du créneau
  assert.equal((await w('coach_deplacer_seance', { groupe_id: gm.groupe_id, date: '2030-04-03', nouvelle_date: '2030-04-03', heure: '19 h 30' })).heure, '19 h 30');
  assert.deepEqual((await gr2()).hr, { '2030-04-03': '19 h 30' });
  const plh = (await w('coach_planning', { du: '2030-04-01', au: '2030-04-09' })).seances.filter(x => x.groupe === 'Mobile');
  assert.deepEqual(plh.map(x => [x.date, x.heure]), [['2030-04-03', '19 h 30'], ['2030-04-08', '18 h']], 'seule cette séance change d’heure');
  await assert.rejects(w('coach_deplacer_seance', { groupe_id: gm.groupe_id, date: '2030-04-03', nouvelle_date: '2030-04-03', heure: '19 h 30' }), /rien à changer/);
  assert.equal((await w('coach_deplacer_seance', { groupe_id: gm.groupe_id, date: '2030-04-03', nouvelle_date: '2030-04-03', heure: '18 h' })).heure, '18 h');
  assert.deepEqual((await gr2()).hr || {}, {}, 'revenue à l’heure habituelle : plus rien de réglé');
  // la durée d'une seule séance
  assert.equal((await w('coach_deplacer_seance', { groupe_id: gm.groupe_id, date: '2030-04-03', nouvelle_date: '2030-04-03', duree: '1 h 30' })).duree, '1 h 30');
  assert.deepEqual((await gr2()).du, { '2030-04-03': '1 h 30' });
  const pld = (await w('coach_planning', { du: '2030-04-01', au: '2030-04-09' })).seances.filter(x => x.groupe === 'Mobile');
  assert.deepEqual(pld.map(x => [x.date, x.duree]), [['2030-04-03', '1 h 30'], ['2030-04-08', '1 h']], 'seule cette séance dure plus longtemps');
  await assert.rejects(w('coach_supprimer_seance', { groupe_id: gm.groupe_id, date: '2030-04-03' }), /appel/);
  await w('coach_supprimer_seance', { groupe_id: gm.groupe_id, date: '2030-04-08' });
  assert.deepEqual((await gr2()).cycles[0].dates, ['2030-04-03']);
  await assert.rejects(w('coach_seance', { groupe_id: gm.groupe_id, date: '2030-04-08' }), /Pas de séance/);
  await w('coach_bilan_brouillon', { groupe_id: gm.groupe_id, date: '2030-04-03', bilan_groupe: 'Bien', personnels: { kid1: 'Continue' } });
  assert.deepEqual((await w('coach_publier_bilan', { groupe_id: gm.groupe_id, date: '2030-04-03' })).commentaires_personnels, ['Léo Martin']);
  assert.equal((await ram.itemsOf(club.id, 'seance')).find(x => x.id === gm.groupe_id + '.2030-04-03').data.recap, 'Bien');
  assert.equal((await ram.itemsOf(club.id, 'brouillon')).length, 0, 'le brouillon est parti');
  assert.equal((await ram.itemsOf(club.id, 'suivi')).filter(x => x.data.k === 'bilan' && x.data.to === 'kid1').length, 1);
  const pc2 = await w('coach_modifier_groupe', { groupe_id: gm.groupe_id, tarif_mode: 'eleve', tarif_prix: 20, heure: '19 h', jour: 'mardi', lieu: 'Extérieur', nom: 'Mobile 2' });
  assert.deepEqual([pc2.groupe, pc2.tarif, pc2.creneau], ['Mobile 2', { mode: 'eleve', prix: 20 }, 'mardi 19 h · 1 h']);
  assert.equal((await ram.itemsOf(club.id, 'chan')).find(x => x.id === gm.groupe_id).data.name, 'Mobile 2', 'la discussion suit');
  await w('coach_modifier_groupe', { groupe_id: gm.groupe_id, jour: 'lundi' });
  assert.equal((await w('coach_message_groupe', { groupe_id: gm.groupe_id, texte: 'Salut' })).a.length, 1);
  // ---------- doublons : tout passe sur la fiche gardée ----------
  const d1 = await w('coach_ajouter_eleve', { prenom: 'Zoé', nom: 'Un', groupe_id: gm.groupe_id }), d2 = await w('coach_ajouter_eleve', { prenom: 'Zoé', nom: 'Deux' });
  await w('coach_noter_achats', { achats: [{ eleve: d1.eleve_id, produit: 'Pack 4', date: '2030-02-01' }, { eleve: d2.eleve_id, produit: 'Individuel', date: '2030-02-02' }] });
  await w('coach_seance', { groupe_id: gm.groupe_id, date: '2030-04-03', presents: [d1.eleve_id] });
  await w('coach_envoyer_message', { eleve_id: d1.eleve_id, texte: 'Coucou' });
  await w('coach_fusionner_eleves', { garder: d2.eleve_id, doublon: d1.eleve_id });
  const fich = (await ram.itemsOf(club.id, 'eleve')).map(x => x.id);
  assert.ok(fich.includes(d2.eleve_id) && !fich.includes(d1.eleve_id));
  assert.equal((await ram.itemsOf(club.id, 'eleve')).find(x => x.id === d2.eleve_id).data.achats.length, 2, 'aucun achat perdu');
  assert.ok((await gr2()).ext.includes(d2.eleve_id) && !(await gr2()).ext.includes(d1.eleve_id));
  assert.equal((await ram.itemsOf(club.id, 'seance')).find(x => x.id === gm.groupe_id + '.2030-04-03').data.pres[d2.eleve_id], 'P');
  assert.equal((await ram.itemsOf(club.id, 'suivi')).filter(x => x.data.to === d1.eleve_id).length, 0);
  await assert.rejects(w('coach_relier_fiche', { eleve_id: d2.eleve_id, compte: 'Personne' }), /introuvable/);
  // ---------- relier à un compte d'un autre club : le club qui compte est celui du compte /RAM ----------
  const clubB = await ram.create({ id: 'U5', name: 'Bureau B' }, { name: 'Padel B', short: 'pb' });
  const moiB = await ram.join({ id: 'U1', name: 'Sarah Benali', email: 'coach@test.fr' }, clubB.code);
  await ram.setRole('U5', clubB.id, moiB.key, 'coach');   // elle enseigne aussi dans le club B
  const ines = await ram.join({ id: 'U6', name: 'Inès Morel', email: 'ines@test.fr' }, clubB.code);
  const rel = await w('coach_relier_fiche', { club: club.id, eleve_id: d2.eleve_id, compte: 'Inès Morel' });
  assert.equal(rel.eleve_id, ines.key, 'relié au compte du club B');
  const fichesA = (await ram.itemsOf(club.id, 'eleve')).map(x => x.id);
  assert.ok(fichesA.includes(ines.key) && !fichesA.includes(d2.eleve_id), 'la fiche reste dans le club où les cours ont eu lieu, sous le compte');
  assert.ok((await gr2()).ext.includes(ines.key) && !(await gr2()).ext.includes(d2.eleve_id), 'le groupe suit');
  assert.equal((await ram.itemsOf(club.id, 'seance')).find(x => x.id === gm.groupe_id + '.2030-04-03').data.pres[ines.key], 'P', 'les présences suivent');
  // ---------- page publique, vacances, collectifs ----------
  const pg = await w('coach_page_reservation', { ouvrir: true });
  assert.equal(pg.page_ouverte, true); assert.ok(pg.lien_page.startsWith('/r/' + club.id));
  assert.equal((await w('coach_page_reservation', { ouvrir: false })).lien_page, null);
  await assert.rejects(w('coach_page_reservation', { adresses_ical: ['https://exemple.test/a.ics'] }), /Google/);
  assert.equal((await w('coach_vacances_club', { periodes: [{ nom: 'Noël', du: '2030-12-21', au: '2031-01-03' }] })).periodes.length, 1);
  assert.equal((await w('coach_disponibilites', {})).periodes.length, 1, 'les disponibilités restent');
  const col2 = await w('coach_ouvrir_collectif', { mode: 'cours', sport: 'Padel', date: '2031-03-01', heure: '18 h', groupes: [{ de: '1', a: '3', minimum: 2 }] });
  await w('coach_inscrire_collectif', { publication: col2.publication, date: '2031-03-01', groupe: 't1', eleve: 'kid1' });
  assert.deepEqual((await w('coach_collectifs', {})).collectifs.find(x => x.publication === col2.publication).dates[0].groupes[0].inscrits, ['Léo Martin']);
  await w('coach_inscrire_collectif', { publication: col2.publication, date: '2031-03-01', groupe: 't1', eleve: 'kid1', retirer: true });
  assert.deepEqual((await w('coach_collectifs', {})).collectifs.find(x => x.publication === col2.publication).dates[0].groupes[0].inscrits, []);
  // ---------- /RAM Club : mur (texte échappé), discussion, bar ----------
  const pub = await w('club_publier', { titre: 'Fermeture', texte: 'Le club <b>ferme</b>' });
  assert.equal((await ram.itemsOf(club.id, 'post')).find(x => x.id === pub.publication).data.body, 'Le club &lt;b&gt;ferme&lt;/b&gt;', 'jamais de code dans une publication');
  assert.equal((await w('club_ecrire_discussion', { discussion_id: gm.groupe_id, texte: 'Bonjour' })).envoye, true);
  assert.equal((await w('club_discussions', { discussion_id: gm.groupe_id })).discussions[0].derniers[0].texte, 'Bonjour');
  await assert.rejects(w('club_ecrire_discussion', { discussion_id: 'rien', texte: 'x' }), /introuvable/);
  assert.ok(Array.isArray((await w('club_bar', {})).reservations));
  assert.ok(Array.isArray((await w('club_adhesions', {})).a_valider));
  // ---------- /RAM JA : tournoi et animation du compte, jamais ceux d'un autre ----------
  const tj = await w('ja_creer_tournoi', { nom: 'Open MCP' });
  await w('ja_inscrire', { id: tj.id, joueur1: { prenom: 'A', nom: 'Un' }, joueur2: { prenom: 'B', nom: 'Deux' } });
  const ip = await w('ja_inscrits', { id: tj.id });
  assert.equal(ip.paires.length, 1);
  await assert.rejects(w('ja_inscrire', { id: tj.id, joueur1: { nom: 'Seul' } }), /paire/);
  await w('ja_retirer', { id: tj.id, inscrit_id: ip.paires[0].inscrit_id });
  assert.equal((await w('ja_inscrits', { id: tj.id })).paires.length, 0);
  assert.equal((await w('ja_matchs', { id: tj.id })).matchs.length, 0);
  await assert.rejects(w('ja_inscrire', { id: 't2', joueur1: { nom: 'X' }, joueur2: { nom: 'Y' } }), /introuvable/, 'le tournoi d’un autre compte');
  await assert.rejects(w('ja_matchs', { id: 't2' }), /introuvable/);
  const an = await w('ja_creer_tournoi', { nom: 'Americano', type: 'animation', format: 'americano' });
  for (const n of ['Ana', 'Ben', 'Cléo', 'Dan']) await w('ja_inscrire', { id: an.id, joueur1: { nom: n } });
  const mch = await w('ja_manche_suivante', { id: an.id });
  assert.equal(mch.matchs.length, 1);
  const pts = rooms.get(an.id).row.state.ani.scoring.points;
  await w('ja_saisir_score', { id: an.id, match_id: mch.matchs[0].match_id, score_a: pts - 1, score_b: 1 });
  assert.equal((await w('ja_matchs', { id: an.id })).matchs[0].score, (pts - 1) + '-1');
  const md = await w('coach_modifier_groupe', { groupe_id: ec.groupe_id, fin: '2030-01-23', retirer_dates: ['2030-01-09'], ajouter_dates: ['2030-01-11'] });
  assert.deepEqual([md.debut, md.fin, md.prochaines_seances], ['2030-01-02', '2030-01-23', ['2030-01-02', '2030-01-11', '2030-01-16', '2030-01-23']]);
  await assert.rejects(w('coach_modifier_groupe', { groupe_id: ec.groupe_id }), /Rien à modifier/);
  const va = await w('coach_modifier_groupe', { groupe_id: ec.groupe_id, periodes_sans_cours: [{ nom: 'Vacances', du: '2030-01-14', au: '2030-01-20' }] });
  assert.deepEqual(va.prochaines_seances, ['2030-01-02', '2030-01-11', '2030-01-23'], 'pas de séance pendant les vacances');
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
  // une semaine sur deux, et seulement les séances d'un élève parmi d'autres du même nom
  await w('coach_importer_seances', { seances: ['2026-09-29', '2026-10-13', '2026-10-27'].map(d => ({ date: d, heure: '12:00', nom: 'Midi test', eleves: ['kid1'] })).concat([{ date: '2026-10-06', heure: '12:00', nom: 'Midi test', eleves: ['nina@test.fr'] }]) });
  const mi = await w('coach_regrouper_seances', { nom_des_seances: 'Midi test', avec: 'kid1', en_cours: true });
  assert.deepEqual([mi.seances, mi.une_semaine_sur_deux, mi.semaines_sans_seance, mi.au], [3, true, 0, 'en cours']);
  // formules de l'enseignant (sur son compte) et achats notés dans la fiche des élèves, sans doublon
  const Formules = require('../lib/formules');
  const fo = await Formules.save(store, 'U1', { formules: [{ id: 'f1', nom: 'Cours individuel', joueurs: 1, duree: 60, prix: 35 }], packs: [{ id: 'p1', formule: 'f1', nom: 'Pack Découverte', seances: 3, prix: 99 }, { formule: 'inconnue', seances: 5 }], abos: [{ id: 'a1', nom: 'Academy', periode: '6 mois', prix: 600 }] });
  assert.deepEqual([fo.packs.length, fo.abos[0].periode], [1, '6 mois'], 'un pack sans formule existante est retiré');
  assert.equal((await use('coach_formules')).packs[0].prix_de_la_seance, 33);
  const ach = [{ eleve: 'jules@test.fr', produit: 'Pack Découverte', date: '2026-04-01' }, { eleve: 'kid1', produit: 'a1', date: '2026-09-01' }, { eleve: 'Personne', produit: 'p1', date: '2026-04-01' }, { eleve: 'kid1', produit: 'Rien', date: '2026-04-01' }];
  const na = await w('coach_noter_achats', { achats: ach });
  assert.deepEqual([na.notes, na.eleves_introuvables, na.produits_inconnus], [2, ['Personne'], ['Rien']]);
  assert.equal((await w('coach_noter_achats', { achats: ach.slice(0, 1) })).deja_notes, 1);
  await w('coach_envoyer_message', { eleve_id: 'kid1', texte: 'Pense à ta raquette' });
  await w('coach_bilan_brouillon', { groupe_id: g.groupe_id, date: '2026-11-17', bilan_groupe: 'Bandeja', personnels: { kid1: 'Bravo' } });
  await w('coach_niveau', { eleve_id: 'kid1', niveau: 4, sport: 'Padel' });
  await w('coach_grille_technique', { eleve_id: 'kid1', notes: { 'Coup droit': 3, Revers: 2 } });
  await w('coach_modifier_echelle', { sport: 'Tennis', niveaux: [{ nom: 'Mini' }, { nom: 'Ados' }] });
  const sync = await ram.sync('U1', club.id, 0), it = (c, i) => (sync.items.find(x => x.coll === c && x.id === i) || {}).data;
  assert.deepEqual(it('group', g.groupe_id).ext, [nv.eleve_id]);
  assert.ok(it('group', g.groupe_id).mem.includes('kid1'));
  assert.equal(it('cours', once.groupe_id).once, '2026-11-20');
  assert.equal(it('member', 'kid1').pl, 4, 'niveau recopié dans la fiche /RAM Club');
  assert.equal(it('eleve', 'kid1').tech.Revers, 2);
  assert.equal(it('brouillon', g.groupe_id + '.2026-11-17').recap, 'Bandeja');
  assert.equal(it('seance', g.groupe_id + '.2026-11-10').pres.kid1, 'P');
  assert.deepEqual(it('eleve', 'kid1').achats.map(h => [h.t, h.fin]), [['abo', '2027-02-28']]);
  assert.equal(it('eleve', nv.eleve_id).achats[0].n, 3);
  const cg = it('group', rg.groupe_id);
  assert.deepEqual([cg.day, cg.h, cg.extra, cg.skip, cg.to], [2, '19 h 30', ['2026-04-20'], ['2026-04-21'], '2026-04-28']);
  assert.ok(it('chan', rg.groupe_id), 'le groupe a sa discussion');
  assert.equal(Object.keys(it('seance', rg.groupe_id + '.2026-04-14').pres).length, 3, 'la venue ponctuelle reste dans l’historique');
  assert.equal(sync.items.filter(x => x.coll === 'cours' && x.data && x.data.name === 'Cycle test' && x.data.once).length, 0);
  assert.equal(it('chan', once.groupe_id), undefined, 'une séance ponctuelle n’a pas de discussion');
  const cours = sync.items.find(x => x.coll === 'cours' && x.data.once === '2026-03-18').data;
  assert.equal(Object.keys(it('seance', sync.items.find(x => x.data === cours).id + '.2026-03-18').pres).length, 2);
  assert.equal(sync.items.filter(x => x.coll === 'suivi' && x.data.to === 'kid1').length, 3);
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
