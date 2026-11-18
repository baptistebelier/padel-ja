/* Joueurs fictifs : compléter un tableau pour simuler un tirage, sans aucune trace réelle ni clôture possible */
const test = require('node:test');
const assert = require('node:assert/strict');
const { E, act, seeded, freePort, until, serverReady, playAll } = require('./helpers');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

const clone = x => JSON.parse(JSON.stringify(x));
function tournoi(reelles, opts = {}) {
  const T = E.initialState(), rand = seeded(7);
  act(T, 'tournament/update', Object.assign({ name: 'Open de test', club: 'TC Essai', maxPairs: 8, category: 'P100' }, opts.fields || {}));
  for (let i = 0; i < reelles; i++) {
    const d = new Date(2026, 5, 1, 10, i).toISOString().slice(0, 16);
    act(T, 'pair/add', { p1: { last: 'DUPONT' + i, first: 'Ana', rank: String(800 + i * 10), licence: '1000' + i }, p2: { last: 'MARTIN' + i, first: 'Léa', rank: String(900 + i * 10), licence: '2000' + i }, registeredAt: d, wc: opts.wc && i === 0 });
  }
  return { T, rand };
}

test('compléter : seules les paires manquantes sont ajoutées, rien d’autre ne bouge', () => {
  const { T, rand } = tournoi(5, { wc: true });
  act(T, 'pair/withdraw', { id: T.pairs[2].id });   // un forfait : il ne compte pas dans le tableau
  const avant = clone(T);
  assert.equal(E.fictifsMissing(T), 8 - 4);
  act(T, 'pairs/fictifs', {}, rand);
  assert.equal(T.pairs.length, avant.pairs.length + 4, 'nombre exact de paires ajoutées');
  assert.deepEqual(T.pairs.slice(0, avant.pairs.length), avant.pairs, 'paires existantes identiques (ordre, wild-card, forfait, classements)');
  ['tournament', 'courts', 'display', 'draw', 'matches', 'poules'].forEach(k => assert.deepEqual(T[k], avant[k], k + ' inchangé'));
  const f = T.pairs.slice(avant.pairs.length);
  assert.ok(f.every(p => p.fictif && p.p1.fictif && p.p2.fictif && E.isFictif(p)), 'marquage dans les données de la paire et des joueurs');
  assert.ok(f.every(p => /FICTIF/.test(p.p1.last) && !p.p1.licence), 'noms génériques, sans licence');
  assert.equal(new Set(f.map(p => p.p1.last)).size, 4, 'noms tous différents');
  // tableau complet : le moteur refuse, et la mesure ne bouge plus
  assert.equal(E.fictifsMissing(T), 0);
  assert.throws(() => act(T, 'pairs/fictifs', {}, rand), /déjà complet/);
});

test('capacité non définie : celle de la sélection (16)', () => {
  const { T, rand } = tournoi(3);
  delete T.tournament.maxPairs;
  assert.equal(E.fictifsMissing(T), 13);
  act(T, 'pairs/fictifs', {}, rand);
  assert.equal(T.pairs.length, 16);
  assert.equal(E.selection(T).main.length, 16);
  assert.equal(T.tournament.maxPairs, undefined, 'le réglage n’est pas écrit');
});

test('liste d’attente déjà pleine : rien à ajouter, rien ne change', () => {
  const { T, rand } = tournoi(10);   // 10 inscrites pour 8 places
  const avant = clone(T);
  assert.equal(E.fictifsMissing(T), 0);
  assert.throws(() => act(T, 'pairs/fictifs', {}, rand));
  assert.deepEqual(T, avant);
});

test('une vraie inscription prend la place d’une fictive avant le tirage (dates et poids)', () => {
  for (const category of ['P100', 'P500']) {
    const { T, rand } = tournoi(4, { fields: { category } });
    act(T, 'pairs/fictifs', {}, rand);
    assert.equal(E.selection(T).main.length, 8);
    act(T, 'pair/add', { p1: { last: 'TARDIF', first: 'Zoé', rank: '5000' }, p2: { last: 'TARDIF', first: 'Max', rank: '5000' }, registeredAt: '2099-01-01T10:00' });
    const sel = E.selection(T);
    assert.ok(sel.main.some(p => p.p1.last === 'TARDIF'), category + ' : la vraie paire tardive est retenue');
    assert.equal(sel.main.filter(E.isFictif).length, 3, 'une fictive est passée en attente');
    assert.ok(sel.waiting.length === 1 && E.isFictif(sel.waiting[0]));
  }
});

test('le tirage et toute la simulation restent possibles', () => {
  const { T, rand } = tournoi(3);
  act(T, 'pairs/fictifs', {}, rand);
  act(T, 'draw/create', {}, rand);
  assert.ok(T.draw && T.draw.built && T.matches.length >= 7);
  playAll(T);
  const R = E.resolve(T);
  assert.ok(T.matches.every(m => R[m.id].staticBye || R[m.id].state === 'done'), 'tous les matchs peuvent être joués');
  assert.ok(E.finalResults(T, R).length === 8);
});

test('clôture refusée tant qu’il reste des fictifs, acceptée après retrait ; vraies paires intactes', () => {
  const { T, rand } = tournoi(3);
  const reelles = clone(T.pairs);
  act(T, 'pairs/fictifs', {}, rand);
  act(T, 'draw/create', {}, rand);
  playAll(T);
  assert.throws(() => act(T, 'tournament/setClosed', { closed: true }), /fictifs/);
  assert.ok(!T.tournament.closed);
  // retirer pendant le tirage : refusé, avec la marche à suivre
  assert.throws(() => act(T, 'pairs/fictifs/remove', {}), /annulez le tirage/);
  act(T, 'draw/reset', {});
  act(T, 'pairs/fictifs/remove', {});
  assert.equal(E.hasFictifs(T), false);
  assert.deepEqual(T.pairs.map(p => Object.assign({}, p, { tie: undefined })), reelles.map(p => Object.assign({}, p, { tie: undefined })), 'les vraies paires sont conservées à l’identique');
  act(T, 'tournament/setClosed', { closed: true });
  assert.ok(T.tournament.closed);
});

test('compatibilité : un ancien tournoi n’a aucun fictif ; le marquage survit à la sauvegarde et à la migration', () => {
  const { T, rand } = tournoi(2);
  assert.equal(E.hasFictifs(E.migrate(clone(T))), false);
  act(T, 'pairs/fictifs', {}, rand);
  const rel = E.migrate(clone(T));
  assert.equal(rel.pairs.filter(E.isFictif).length, 6);
  assert.equal(E.hasFictifs(rel), true);
});

/* ---------- serveur : clôture refusée par toutes les voies, aucune trace dans la base joueurs ---------- */
test('serveur : /close et tournament/setClosed refusés avec des fictifs ; une fois retirés, seuls les vrais joueurs sont enregistrés', async () => {
  const PORT = await freePort(), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fictifs-'));
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA });
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].forEach(k => delete env[k]);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'pipe' });
  try {
    const B = `http://127.0.0.1:${PORT}`;
    await serverReady(B);
    const r = await fetch(B + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'fic@exemple.test', password: 'motdepasse1', first: 'Fabienne', last: 'Test', club: 'TC Essai' }) });
    const H = { 'Content-Type': 'application/json', Cookie: [].concat(r.headers.getSetCookie()).map(c => c.split(';')[0]).filter(c => !/=$/.test(c)).join('; ') };
    const ja = (p, body, method) => fetch(B + p, body || method ? { method: method || 'POST', headers: H, body: body ? JSON.stringify(body) : undefined } : { headers: H }).then(async x => Object.assign(await x.json().catch(() => ({})), { status: x.status }));
    const { id: tid } = await ja('/api/tournaments', { name: 'Tournoi à fictifs' });
    const act = (type, payload) => ja(`/api/t/${tid}/action`, { type, payload });
    await act('tournament/update', { maxPairs: 4, club: 'TC Essai', category: 'P100' });
    await act('pair/add', { p1: { last: 'REELLE', first: 'Alice', rank: '700' }, p2: { last: 'VRAIE', first: 'Bea', rank: '800' } });
    await act('pair/add', { p1: { last: 'SERIEUX', first: 'Carl', rank: '900' }, p2: { last: 'REEL', first: 'Dan', rank: '950' } });
    assert.equal((await act('pairs/fictifs', {})).ok, true);
    const st = await ja(`/api/t/${tid}/export`);
    assert.equal(st.pairs.length, 4); assert.equal(st.pairs.filter(p => p.fictif).length, 2);
    assert.equal((await act('draw/create', {})).ok, true);
    // toutes les voies de clôture sont refusées
    const c1 = await ja(`/api/tournaments/${tid}/close`, {});
    assert.equal(c1.status, 409); assert.match(c1.error, /fictifs/);
    const c2 = await act('tournament/setClosed', { closed: true });
    assert.equal(c2.status, 400); assert.match(c2.error, /fictifs/);
    assert.equal((await ja('/api/club-players')).players.length, 0, 'aucune participation enregistrée');
    // retrait : d'abord refusé pendant le tirage, puis possible après son annulation
    assert.equal((await act('pairs/fictifs/remove', {})).status, 400);
    await act('draw/reset', {}); assert.equal((await act('pairs/fictifs/remove', {})).ok, true);
    assert.equal((await ja(`/api/t/${tid}/export`)).pairs.length, 2);
    // vraie suite : tirage, scores, clôture ; seuls les vrais joueurs entrent dans la base
    await act('draw/create', {});
    const st2 = await ja(`/api/t/${tid}/export`);
    for (const m of st2.matches) if (m.srcA && m.srcB) await act('match/winner', { id: m.id, team: 'A' }).catch(() => {});
    const c3 = await ja(`/api/tournaments/${tid}/close`, {});
    assert.equal(c3.status, 200, JSON.stringify(c3));
    const noms = (await ja('/api/club-players')).players.map(p => p.last);
    assert.ok(noms.length >= 2 && noms.every(n => !/FICTIF/i.test(n)), 'aucun fictif dans la base : ' + noms.join(','));
  } finally { srv.kill(); }
});
