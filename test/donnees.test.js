/* /Pista : module de lectures communes (public/js/donnees.js)
   copie locale par compte, demande unique, échec puis « Réessayer », délai maximal, session expirée, clics rapides */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDonnees } = require('../public/js/donnees.js');

/* faux navigateur : stockage, horloge, réseau scriptable */
function monde(opts = {}) {
  const mem = new Map();
  const storage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); }, get length() { return mem.size; }, key: i => [...mem.keys()][i] };
  const horloge = { t: 1e12 };
  const m = { mem, storage, horloge, appels: [], location: { href: 'http://x.test/dashboard', origin: 'http://x.test' }, reponses: {} };
  // réponse d'une adresse : fonction (appel n°) → { status, body } | Error | 'pendu' ; par défaut 200 { tournaments: [] }
  m.fetch = (url, init) => {
    const chemin = String(url).split('?')[0];
    m.appels.push({ chemin, init });
    const r = m.reponses[chemin] ? m.reponses[chemin](m.appels.filter(a => a.chemin === chemin).length) : { status: 200, body: chemin === '/api/me' ? { user: { id: 'A' } } : { tournaments: [] } };
    if (r instanceof Error) return Promise.reject(r);
    if (r === 'pendu') return new Promise((ok, ko) => { if (init && init.signal) init.signal.addEventListener('abort', () => ko(Object.assign(new Error('abandon'), { name: 'AbortError' }))); });
    return Promise.resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, headers: { get: () => 'application/json' }, text: () => Promise.resolve(typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) });
  };
  m.D = createDonnees({ fetch: m.fetch, storage, location: m.location, now: () => horloge.t, wait: () => Promise.resolve(), delai: opts.delai });
  return m;
}
const tick = () => new Promise(r => setTimeout(r, 5));

test('copie locale : montrée à son compte, jamais à un autre', async () => {
  const m = monde();
  m.D.setUid('A');
  m.D.ranger('/api/tournaments', { tournaments: [{ id: 't1', name: 'Tournoi de A' }] });
  assert.equal(m.D.copie('/api/tournaments').data.tournaments[0].name, 'Tournoi de A');
  // changement de compte : la copie de A disparaît pour B (et du stockage)
  m.D.setUid('B');
  assert.equal(m.D.copie('/api/tournaments'), null, 'B ne voit rien de A');
  assert.deepEqual([...m.mem.keys()].filter(k => k.startsWith('pja:copie:')), [], 'rien de A ne reste dans le stockage');
  // retour de A : rien non plus (les copies ne survivent pas à un changement de compte)
  m.D.setUid('A');
  assert.equal(m.D.copie('/api/tournaments'), null);
});

test('copie locale : déconnexion et copie trop ancienne', async () => {
  const m = monde();
  m.D.setUid('A'); m.D.ranger('/api/tournaments', { tournaments: [{ id: 'x' }] });
  m.horloge.t += 25 * 3600e3;
  assert.equal(m.D.copie('/api/tournaments'), null, 'après 24 h la copie n’est plus montrée');
  m.D.ranger('/api/tournaments', { tournaments: [{ id: 'y' }] });
  m.D.setUid('');   // déconnexion
  assert.equal(m.D.copie('/api/tournaments'), null);
  assert.equal([...m.mem.keys()].filter(k => k.startsWith('pja:copie:')).length, 0);
  // sans compte connu, rien n'est rangé
  m.D.ranger('/api/tournaments', { tournaments: [] });
  assert.equal(m.mem.size, 0);
});

test('copie locale : la page montre la copie du compte, puis le réseau ; le compte réel l’emporte', async () => {
  const m = monde();
  m.D.setUid('A'); m.D.ranger('/api/tournaments', { tournaments: [{ id: 'a1', name: 'copie de A' }] });
  // la session est en réalité celle de B : /api/me répond B, la copie de A est écartée, le réseau est rendu
  m.reponses['/api/me'] = () => ({ status: 200, body: { user: { id: 'B' } } });
  m.reponses['/api/tournaments'] = () => ({ status: 200, body: { tournaments: [{ id: 'b1', name: 'réseau de B' }] } });
  const vus = [];
  const s = m.D.suivre('/api/tournaments', { rendre: (d, i) => vus.push([d.tournaments[0].name, i.copie]) });
  await s.fini;
  assert.deepEqual(vus[vus.length - 1], ['réseau de B', false], 'la dernière chose montrée vient du réseau');
  assert.ok(vus.every(v => v[0] !== 'copie de A'), 'la copie de A n’est jamais montrée à B');
  assert.equal(m.D.uid(), 'B');
  assert.equal(m.D.copie('/api/tournaments').data.tournaments[0].name, 'réseau de B', 'la copie rangée est celle de B');
  assert.ok(!m.mem.has('pja:copie:A:/api/tournaments'));
});

test('demande unique : cinq lecteurs, une seule demande ; une écriture la remet en cause', async () => {
  const m = monde();
  m.D.setUid('A');
  const lots = await Promise.all([1, 2, 3, 4, 5].map(() => m.D.lire('/api/tournaments')));
  assert.equal(lots.length, 5);
  assert.equal(m.appels.filter(a => a.chemin === '/api/tournaments').length, 1, 'une seule demande partagée');
  // très courte réutilisation
  await m.D.lire('/api/tournaments');
  assert.equal(m.appels.filter(a => a.chemin === '/api/tournaments').length, 1, 'réutilisée dans les 3 s');
  m.horloge.t += m.D.TTL + 1;
  await m.D.lire('/api/tournaments');
  assert.equal(m.appels.filter(a => a.chemin === '/api/tournaments').length, 2, 'relue après la courte réutilisation');
});

test('invalidation : créer, supprimer, clôturer ou rouvrir vide la copie et la mémoire', async () => {
  const m = monde();
  m.D.setUid('A');
  const f = m.D.enveloppe(m.fetch);
  m.D.ranger('/api/tournaments', { tournaments: [{ id: 'old' }] });
  await m.D.lire('/api/tournaments');
  const avant = m.appels.filter(a => a.chemin === '/api/tournaments').length;
  for (const [chemin, method] of [['/api/tournaments', 'POST'], ['/api/tournaments/t1', 'DELETE'], ['/api/tournaments/t1/close', 'POST'], ['/api/tournaments/t1/reopen', 'POST'], ['/api/t/t1/action', 'POST']]) {
    m.D.ranger('/api/tournaments', { tournaments: [{ id: 'old' }] });
    assert.ok(m.D.copie('/api/tournaments'), 'copie présente avant ' + method + ' ' + chemin);
    await f('http://x.test' + chemin, { method, body: '{}' });
    assert.equal(m.D.copie('/api/tournaments'), null, 'copie vidée par ' + method + ' ' + chemin);
  }
  await m.D.lire('/api/tournaments');
  assert.ok(m.appels.filter(a => a.chemin === '/api/tournaments').length > avant, 'la lecture suivante repart au réseau');
});

test('invalidation : une lecture partie avant une écriture ne range pas sa réponse périmée', async () => {
  const m = monde();
  m.D.setUid('A');
  let libere; m.reponses['/api/tournaments'] = () => 'tard';
  const r = m.fetch; m.D = createDonnees({ fetch: (u, i) => (String(u) === '/api/tournaments' ? new Promise(ok => { libere = () => ok({ ok: true, status: 200, headers: { get: () => '' }, text: () => Promise.resolve('{"tournaments":[{"id":"perime"}]}') }); }) : r(u, i)), storage: m.storage, location: m.location, now: () => m.horloge.t, wait: () => Promise.resolve() });
  m.D.setUid('A');
  const s = m.D.suivre('/api/tournaments', { rendre: () => {} });
  await tick();
  m.D.invalider();     // écriture pendant la lecture
  libere();
  await s.fini;
  assert.equal(m.D.copie('/api/tournaments'), null, 'la réponse arrivée après l’écriture n’est pas gardée');
});

test('échec puis Réessayer : une relance automatique, une erreur claire, une copie ancienne signalée', async () => {
  const m = monde();
  m.D.setUid('A');
  m.D.ranger('/api/tournaments', { tournaments: [{ id: 'c1', name: 'copie' }] });
  let ok = false;
  m.reponses['/api/tournaments'] = () => (ok ? { status: 200, body: { tournaments: [{ id: 'n1', name: 'frais' }] } } : new Error('réseau coupé'));
  const rendus = [], erreurs = [];
  const s = m.D.suivre('/api/tournaments', { rendre: (d, i) => rendus.push([d.tournaments[0].name, i.copie]), erreur: (e, i) => erreurs.push([e.message, i.copie]) });
  await s.fini;
  assert.equal(m.appels.filter(a => a.chemin === '/api/tournaments').length, 2, 'une relance automatique, pas plus');
  assert.deepEqual(rendus, [['copie', true]], 'la copie est montrée, jamais présentée comme fraîche');
  assert.deepEqual(erreurs, [['réseau coupé', true]], 'l’échec dit qu’une copie reste à l’écran');
  // Réessayer
  ok = true;
  await s.relire();
  assert.deepEqual(rendus[rendus.length - 1], ['frais', false]);
  assert.equal(erreurs.length, 1);
});

test('échec sans copie : erreur sans rien afficher de faux, puis Réessayer réussit', async () => {
  const m = monde();
  m.D.setUid('A');
  m.reponses['/api/tournaments'] = n => (n <= 2 ? { status: 503, body: { error: 'indisponible' } } : { status: 200, body: { tournaments: [{ id: 'z' }] } });
  const rendus = [], erreurs = [];
  const s = m.D.suivre('/api/tournaments', { rendre: d => rendus.push(d), erreur: (e, i) => erreurs.push([e.status, i.copie]) });
  await s.fini;
  assert.deepEqual(rendus, []);
  assert.deepEqual(erreurs, [[503, false]]);
  await s.relire();
  assert.equal(rendus.length, 1);
});

test('délai maximal : une demande qui ne répond pas est abandonnée puis signalée', async () => {
  const m = monde({ delai: 40 });
  m.D.setUid('A');
  m.reponses['/api/tournaments'] = () => 'pendu';
  const erreurs = [];
  const s = m.D.suivre('/api/tournaments', { rendre: () => assert.fail('rien à rendre'), erreur: e => erreurs.push(e.message) });
  await s.fini;
  assert.equal(erreurs.length, 1);
  assert.equal(m.appels.filter(a => a.chemin === '/api/tournaments').length, 2, 'une relance, elle aussi abandonnée');
});

test('session expirée : toujours la connexion, jamais une page vide', async () => {
  const m = monde();
  m.D.setUid('A');
  m.D.ranger('/api/tournaments', { tournaments: [{ id: 'copie' }] });
  m.reponses['/api/tournaments'] = () => ({ status: 401, body: { error: 'Connexion requise' } });
  const erreurs = [];
  const s = m.D.suivre('/api/tournaments', { rendre: () => {}, erreur: e => erreurs.push(e) });
  await s.fini;
  assert.equal(m.location.href, '/connexion');
  assert.deepEqual(erreurs, [], 'pas de message d’erreur : on part vers la connexion');
  // /api/me sans utilisateur : même chose, et plus aucune copie
  const m2 = monde(); m2.D.setUid('A'); m2.D.ranger('/api/tournaments', { tournaments: [] });
  m2.reponses['/api/me'] = () => ({ status: 200, body: { user: null } });
  await assert.rejects(m2.D.lire('/api/me'));
  assert.equal(m2.location.href, '/connexion');
  assert.equal(m2.D.copie('/api/tournaments'), null);
});

test('clics rapides : la réponse d’une page quittée ne touche pas la nouvelle', async () => {
  const m = monde();
  m.D.setUid('A');
  let libere; const retard = new Promise(r => { libere = r; });
  const base = m.fetch;
  m.D = createDonnees({ fetch: (u, i) => (String(u) === '/api/tournaments' ? retard.then(() => base(u, i)) : base(u, i)), storage: m.storage, location: m.location, now: () => m.horloge.t, wait: () => Promise.resolve() });
  m.D.setUid('A');
  const ancienne = [], nouvelle = [];
  const s1 = m.D.suivre('/api/tournaments', { rendre: d => ancienne.push(d) });
  await tick();
  m.D.nouvellePage();                       // un autre clic : la page change
  const s2 = m.D.suivre('/api/tournaments', { rendre: d => nouvelle.push(d) });
  libere();
  await Promise.all([s1.fini, s2.fini]);
  assert.equal(ancienne.length, 0, 'la page quittée ne reçoit rien');
  assert.equal(nouvelle.length, 1, 'la nouvelle page reçoit sa réponse');
});
