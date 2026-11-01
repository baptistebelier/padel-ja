/* =========================================================================
   Tests d'écran : /RAM JA et /RAM Club dans un vrai navigateur (Chromium)
   - chaque écran s'ouvre sans erreur JavaScript
   - rien ne déborde sur la largeur d'un petit téléphone (360 px)
   - le zoom n'est jamais bloqué
   Lancement : npm run test:ecrans
   (une fois : npm i --no-save playwright && npx playwright install chromium)
   Ces tests ne sont PAS dans test/ : Render lance test/ et n'a pas de navigateur.
   ========================================================================= */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFile } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3900 + Math.floor(Math.random() * 90);
const JA = `http://127.0.0.1:${PORT}`;
let server, demoServer, DEMO, dataDir, browser;

/* ---------- démarrage : serveur JA (données jetables) + serveur statique pour la démo Club ---------- */
before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ram-ecrans-'));
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: dataDir };
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].forEach(k => delete env[k]);
  server = spawn(process.execPath, [join(ROOT, 'server.js')], { env, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(JA + '/')).ok) break; } catch (e) { /* pas encore prêt */ }
    await new Promise(r => setTimeout(r, 100));
  }

  // la démo Club telle que GitHub Pages la sert : fichiers statiques, sans serveur /RAM
  const CLUB = join(ROOT, 'club');
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
  demoServer = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(CLUB, rel));
    if (!file.startsWith(CLUB)) { res.writeHead(403); return res.end(); }
    readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise(r => demoServer.listen(0, '127.0.0.1', r));
  DEMO = `http://127.0.0.1:${demoServer.address().port}`;

  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  // on attend l'arrêt du serveur avant d'effacer ses fichiers (sinon il peut encore écrire pendant l'effacement)
  if (server && server.exitCode == null) await new Promise(r => { server.once('exit', r); server.kill(); setTimeout(r, 3000); });
  demoServer?.close();
  try { rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (e) { /* dossier temporaire : sans conséquence */ }
});

/* ---------- outils ---------- */
// erreurs JS de la page ; les ressources externes (polices Google…) ne comptent pas
async function openPage(ctx, url) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('JS : ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const loc = m.location()?.url || '';
    if (/fonts\.(googleapis|gstatic)\.com/.test(loc) || /Failed to load resource/.test(m.text()) && !loc.startsWith('http://127.0.0.1')) return;
    errors.push('console : ' + m.text());
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  return { page, errors };
}

const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function assertZoomAllowed(page) {
  const vp = await page.evaluate(() => document.querySelector('meta[name=viewport]')?.content || '');
  assert.doesNotMatch(vp, /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/, 'le zoom est bloqué : ' + vp);
}

const phone = () => browser.newContext({ viewport: { width: 360, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

/* ---------- /RAM Club (démo) ---------- */
test('Club : chaque onglet s’ouvre sans erreur et sans débordement sur 360 px', async () => {
  const ctx = await phone();
  const { page, errors } = await openPage(ctx, DEMO + '/index.html');
  await assertZoomAllowed(page);
  await page.waitForSelector('#tabs button[data-t]');
  for (const t of ['home', 'chans', 'agenda', 'ecole', 'club', 'me']) {
    await page.click(`#tabs button[data-t="${t}"]`);
    await page.waitForTimeout(400);
    const txt = await page.textContent('#main');
    assert.ok(txt && txt.trim().length > 20, `onglet ${t} vide`);
    assert.ok(await overflow(page) <= 1, `onglet ${t} : la page déborde horizontalement`);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Club : servi par le serveur /RAM, la page s’ouvre sans erreur', async () => {
  const ctx = await phone();
  const { page, errors } = await openPage(ctx, JA + '/club/');
  await assertZoomAllowed(page);
  assert.deepEqual(errors, []);
  // sans compte connecté, l'adresse de base est la présentation ; /demo ouvre l'appli de démonstration
  assert.ok(await page.$('.nav a[href="connexion"]'), 'présentation avec le bouton « Se connecter »');
  const demo = await openPage(ctx, JA + '/club/demo');
  assert.ok(await demo.page.$('#tabs'), 'la démo ouvre l’appli');
  assert.deepEqual(demo.errors, []);
  await ctx.close();
});

/* ---------- /RAM JA ---------- */
test('JA : la page d’accueil s’ouvre sans erreur, sur ordinateur et téléphone', async () => {
  for (const ctx of [await browser.newContext({ viewport: { width: 1366, height: 860 } }), await phone()]) {
    const { page, errors } = await openPage(ctx, JA + '/');
    assert.ok(await overflow(page) <= 1, 'la page d’accueil déborde horizontalement');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('JA : démo, chaque onglet de l’éditeur, TV, overlay et impression sans erreur', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const { page, errors } = await openPage(ctx, JA + '/demo');
  const id = new URL(page.url()).pathname.split('/')[2];
  assert.ok(id, 'la démo n’a pas créé de tournoi');
  for (const t of ['tournoi', 'inscriptions', 'tirage', 'tableaux', 'programmation', 'direct', 'diffusion']) {
    await page.locator(`[data-tab="${t}"]`).first().click();
    await page.waitForTimeout(300);
  }
  assert.deepEqual(errors, [], 'éditeur');
  for (const v of ['tv', 'overlay', 'print', 'remote']) {
    const o = await openPage(ctx, `${JA}/t/${id}/${v}`);
    assert.deepEqual(o.errors, [], v);
  }
  await ctx.close();
});

test('JA : l’éditeur sur téléphone ne déborde pas et sa barre d’onglets a des libellés', async () => {
  const desk = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const { page } = await openPage(desk, JA + '/demo');
  const url = page.url();
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true, storageState: await desk.storageState() });
  const m = await openPage(ctx, url);
  await assertZoomAllowed(m.page);
  assert.ok(await overflow(m.page) <= 1, 'l’éditeur déborde horizontalement sur téléphone');
  const empty = await m.page.evaluate(() => [...document.querySelectorAll('[data-tab]')]
    .filter(b => b.offsetParent && b.getBoundingClientRect().bottom > window.innerHeight - 120)
    .filter(b => !b.innerText.trim()).length);
  assert.equal(empty, 0, 'barre du bas : des onglets n’ont pas de libellé visible');
  assert.deepEqual(m.errors, []);
  await desk.close(); await ctx.close();
});

test('JA : animation americano (page du juge-arbitre, TV, saisie des joueurs) sans erreur ni débordement', async () => {
  const desk = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const { page } = await openPage(desk, JA + '/demo');
  // une animation de 8 joueurs, première manche lancée
  const id = await page.evaluate(async () => {
    const d = await fetch('/api/tournaments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'animation', format: 'americano', name: 'Americano test' }) }).then(r => r.json());
    const act = (type, payload) => fetch('/api/t/' + d.id + '/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, payload }) });
    for (let i = 1; i <= 8; i++) await act('ani/player/add', { name: 'Joueur ' + i });
    await act('ani/round/next', {});
    return d.id;
  });
  assert.ok(id, 'animation non créée');
  const info = await page.evaluate(async id => fetch('/api/t/' + id + '/info').then(r => r.json()), id);
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true, storageState: await desk.storageState() });
  for (const [c, url] of [[desk, `${JA}/t/${id}`], [ctx, `${JA}/t/${id}`], [desk, `${JA}/t/${id}/tv?k=${info.key}`], [ctx, `${JA}/t/${id}/remote?pin=${info.pin}`]]) {
    const o = await openPage(c, url);
    await o.page.waitForSelector('.an-m, .tvm', { timeout: 5000 }).catch(async () => assert.fail(url + ' : ' + (await o.page.evaluate(() => document.body.innerText.slice(0, 200))) + ' ' + o.errors.join(' ')));
    assert.ok(await overflow(o.page) <= 1, url + ' déborde horizontalement');
    assert.deepEqual(o.errors, [], url);
  }
  await desk.close(); await ctx.close();
});

test('Coach : la saisie du thème n’est jamais effacée quand un autre club change (connexion directe unique)', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } }), page = await ctx.newPage(), errs = [];
  const urls = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('request', r => urls.push(new URL(r.url()).pathname));
  const post = async (url, data) => (await ctx.request.post(JA + url, { data })).json();
  await post('/api/auth/signup', { email: `coach-${Date.now()}@exemple.test`, password: 'essai-' + Date.now(), first: 'Essai', last: 'Coach' });
  const a = await post('/api/ram/clubs', { name: 'Club Essai A' }), b = await post('/api/ram/clubs', { name: 'Club Essai B' });
  await post('/api/ram/main', { id: a.id });
  const today = new Date().toISOString().slice(0, 10), gid = 'gessai';
  await post(`/api/ram/c/${a.id}/ops`, { ops: [{ coll: 'cours', id: gid, op: 'put', data: { type: 'train', name: 'Cours essai', sport: 'Padel', coach: a.key, once: today, h: '18 h', dur: '1 h', mem: [], ext: [], day: new Date().getDay() } }] });
  await page.goto(`${JA}/club/coach.html`);   // sous /club/ : la vraie synchro (sous /coach/ en local : la démo)
  await page.waitForFunction(() => window.RAM && RAM.live, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const club = await page.evaluate(() => RAM.club), other = club === a.id ? b : a;
  assert.ok(urls.includes('/api/ram/events'), 'connexion directe unique ouverte');
  assert.ok(!urls.some(u => u.startsWith('/api/ram/c/') && u.endsWith('/events')), 'plus de connexion par club');
  await page.evaluate(id => { S.stack.push({ v: 'seance', id }); render(); }, `${gid}.${today}`);
  await page.waitForSelector('#co-th');
  await page.fill('#co-th', 'Bandeja lente');
  await page.focus('#co-th');
  // un autre de mes clubs change : l'événement arrive en direct, l'appli relit ce club
  await post(`/api/ram/c/${other.id}/ops`, { ops: [{ coll: 'post', id: 'pe' + Date.now(), op: 'put', data: { by: other.key, kind: 'txt', body: 'essai', at: Date.now() } }] });
  await page.waitForTimeout(1500);
  assert.equal(await page.inputValue('#co-th'), 'Bandeja lente', 'le texte reste');
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'co-th', 'le champ garde la main');
  // sortie du champ sans valider : le redessin en attente garde le texte
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForTimeout(600);
  assert.equal(await page.inputValue('#co-th'), 'Bandeja lente', 'le texte survit au redessin');
  // tableau de bord : calculé par le serveur, un achat noté apparaît dans « Encaissé »
  await post(`/api/ram/c/${a.id}/ops`, { ops: [{ coll: 'eleve', id: 'e1', op: 'put', data: { n: 'Essai Élève', achats: [{ id: 'h1', t: 'seance', ref: 'f', d: today, prix: 42, nom: 'Séance' }] } }] });
  await page.evaluate(() => { S.stack.length = 0; S.tab = 'dash'; render(); });
  await page.waitForResponse(r => r.url().includes('/api/coach/tableau') && r.ok(), { timeout: 8000 }).catch(() => {});
  await page.waitForSelector('.codash', { timeout: 8000 });
  assert.ok(urls.includes('/api/coach/tableau'), 'demandé au serveur');
  assert.match(await page.textContent('.codash'), /42\s*€/, 'encaissé calculé par le serveur');
  // ouverture allégée : un cours ancien n'est pas là au départ, il arrive quand un écran a besoin de l'historique, et rien n'est perdu
  const vieux = new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 10);
  await post(`/api/ram/c/${a.id}/ops`, { ops: [{ coll: 'cours', id: 'gvieux', op: 'put', data: { type: 'train', name: 'Cours ancien', sport: 'Padel', coach: a.key, once: vieux, h: '9 h', dur: '1 h', mem: [], ext: ['e1'], day: 1 } }, { coll: 'seance', id: `gvieux.${vieux}`, op: 'put', data: { g: 'gvieux', d: vieux, pres: { e1: 'P' } } }] });
  await page.goto(`${JA}/club/coach.html`);
  await page.waitForFunction(() => window.RAM && RAM.live, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const has = () => page.evaluate(() => GROUPS.some(g => g.id === 'gvieux') && SEANCES.some(s => s.g === 'gvieux'));
  assert.equal(await has(), false, 'pas d’historique à l’ouverture');
  await page.evaluate(() => { S.tab = 'eleves'; render(); });
  await page.waitForFunction(() => GROUPS.some(g => g.id === 'gvieux') && SEANCES.some(s => s.g === 'gvieux'), null, { timeout: 8000 });
  await page.waitForTimeout(1200);   // la synchro repasse : elle ne doit rien supprimer ni renvoyer
  const sync = await (await ctx.request.get(`${JA}/api/ram/c/${a.id}/sync?since=0`)).json();
  assert.ok(sync.items.some(i => i.coll === 'cours' && i.id === 'gvieux'), 'le cours ancien est toujours sur le serveur');
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('JA en direct : un écran TV qui reçoit des différences retrouve exactement l’état complet', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/demo');
  await page.waitForTimeout(800);
  const base = new URL(page.url()).pathname.replace('/t/', '/api/t/');
  const seen = await page.evaluate(async b => {
    const open = q => new Promise(ok => { const box = { msgs: [] }, es = new EventSource(b + '/events' + q); box.es = es; es.onmessage = ev => { box.msgs.push(JSON.parse(ev.data)); if (box.msgs.length === 1) ok(box); }; });
    const [d, f] = await Promise.all([open('?diff=1'), open('')]);
    const send = (type, payload) => fetch(b + '/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, payload }) });
    for (const name of ['Essai 1', 'Essai 2', 'Essai 3']) await send('court/add', { name });
    await send('tournament/update', { name: 'Tournoi diffusé' });
    await new Promise(r => setTimeout(r, 500));
    [d, f].forEach(x => x.es.close());
    let s = d.msgs[0].state, rev = d.msgs[0].rev, suite = true;
    d.msgs.slice(1).forEach(m => { if (m.patch) { if (m.base !== rev) suite = false; s = Engine.applyDiff(s, m.patch); } else s = m.state; rev = m.rev; });
    return { patches: d.msgs.filter(m => m.patch).length, suite, same: JSON.stringify(s) === JSON.stringify(f.msgs[f.msgs.length - 1].state), last: rev, lastFull: f.msgs[f.msgs.length - 1].rev, tailleD: JSON.stringify(d.msgs.slice(1)).length, tailleF: JSON.stringify(f.msgs.slice(1)).length, nom: s.tournament.name };
  }, base);
  assert.ok(seen.patches >= 3, 'des différences reçues : ' + seen.patches);
  assert.ok(seen.suite, 'aucune différence manquée');
  assert.equal(seen.last, seen.lastFull);
  assert.equal(seen.nom, 'Tournoi diffusé');
  assert.ok(seen.same, 'même état que le flux complet');
  assert.ok(seen.tailleD * 3 < seen.tailleF, `${seen.tailleD} contre ${seen.tailleF} octets`);
  // l'éditeur lui-même reste à jour avec ce mode
  await page.waitForFunction(() => window.App && App.connected && App.rev >= 5, null, { timeout: 5000 });
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Club et Coach servis : un seul fichier de scripts, tout l’écran fonctionne, et le fichier est gardé pour le hors-ligne', async () => {
  for (const [page0, onglet] of [['/club/demo', 'home'], ['/club/coach.html', 'planning']]) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } }), page = await ctx.newPage(), errs = [], js = [];
    page.on('pageerror', x => errs.push(x.message));
    page.on('response', r => { const p = new URL(r.url()).pathname; if (p.endsWith('.js') && !p.endsWith('sw.js')) js.push(p); });
    await page.goto(JA + page0);
    await page.waitForSelector('#tabs', { timeout: 8000 });
    await page.waitForTimeout(600);
    assert.ok(js.some(p => /\/b-[0-9a-f]{16}\.js$/.test(p)), 'fichier réuni servi');
    assert.ok(js.length <= 3, 'peu de fichiers : ' + js.join(' '));
    await page.evaluate(t => { S.tab = t; render(); }, onglet);
    const garde = await page.evaluate(async () => { await navigator.serviceWorker.ready; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) if (new URL(r.url).pathname.split('/').pop().startsWith('b-')) return true; return false; });
    assert.ok(garde, 'service worker installé avec le fichier réuni');
    assert.deepEqual(errs, []);
    await ctx.close();
  }
});

test('Cache sur l’appareil : deuxième ouverture sans tout retélécharger, nouveautés reçues, effacé à la déconnexion', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } }), page = await ctx.newPage(), errs = [], syncs = [];
  page.on('pageerror', x => errs.push(x.message));
  page.on('request', r => { if (r.url().includes('/sync?')) syncs.push(new URL(r.url()).searchParams.get('since')); });
  const post = async (url, data) => (await ctx.request.post(JA + url, { data })).json();
  await post('/api/auth/signup', { email: `cache-${Date.now()}@exemple.test`, password: 'essai-' + Date.now(), first: 'Essai', last: 'Cache' });
  const a = await post('/api/ram/clubs', { name: 'Club Cache' });
  await post(`/api/ram/c/${a.id}/ops`, { ops: [{ coll: 'post', id: 'p1', op: 'put', data: { by: a.key, kind: 'txt', body: 'avant', at: Date.now() } }] });
  await page.goto(JA + '/club/');
  await page.waitForFunction(() => window.RAM && RAM.live, null, { timeout: 15000 });
  assert.ok(syncs.includes('0'), 'première ouverture : tout');
  await page.waitForTimeout(5000);   // écriture du cache
  const lire = () => page.evaluate(() => new Promise(ok => { const q = indexedDB.open('ram-cache', 1); q.onupgradeneeded = () => q.result.createObjectStore('clubs'); q.onsuccess = () => { const db = q.result, g = db.transaction('clubs').objectStore('clubs').getAll(); g.onsuccess = () => { db.close(); ok(g.result.length); }; }; }));
  assert.equal(await lire(), 1, 'état gardé sur l’appareil');
  // une nouveauté arrive pendant que l'appli est fermée
  await page.goto('about:blank');
  await post(`/api/ram/c/${a.id}/ops`, { ops: [{ coll: 'post', id: 'p2', op: 'put', data: { by: a.key, kind: 'txt', body: 'pendant', at: Date.now() } }] });
  syncs.length = 0;
  await page.goto(JA + '/club/');
  await page.waitForFunction(() => window.RAM && RAM.live && posts.some(p => p.id === 'p1') && posts.some(p => p.id === 'p2'), null, { timeout: 10000 });
  assert.ok(syncs.length && !syncs.includes('0'), 'deuxième ouverture : seulement les nouveautés : ' + syncs.join(','));
  // rien n'a été renvoyé ni effacé côté serveur
  const s = await (await ctx.request.get(`${JA}/api/ram/c/${a.id}/sync?since=0`)).json();
  assert.deepEqual(s.items.filter(i => i.coll === 'post').map(i => i.id).sort(), ['p1', 'p2']);
  await page.evaluate(() => RAM.cacheClear());
  assert.equal(await lire(), 0, 'effacé');
  assert.deepEqual(errs, []);
  await ctx.close();
});

