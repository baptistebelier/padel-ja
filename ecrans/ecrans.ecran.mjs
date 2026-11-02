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
  // statistiques : calculées par le serveur, un achat noté apparaît dans « Encaissé » (onglet Paiements)
  await post(`/api/ram/c/${a.id}/ops`, { ops: [{ coll: 'eleve', id: 'e1', op: 'put', data: { n: 'Essai Élève', achats: [{ id: 'h1', t: 'seance', ref: 'f', d: today, prix: 42, nom: 'Séance' }] } }] });
  await page.evaluate(() => { S.stack.length = 0; S.tab = 'dash'; S.dashTab = 'pay'; render(); });
  await page.waitForResponse(r => r.url().includes('/api/coach/tableau') && r.ok(), { timeout: 8000 }).catch(() => {});
  await page.waitForSelector('.cotile b', { timeout: 8000 });
  await page.locator('.cotile', { hasText: 'Encaissé' }).filter({ hasText: '42 €' }).waitFor({ timeout: 8000 });
  assert.ok(urls.includes('/api/coach/tableau'), 'demandé au serveur');
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

test('JA : tournois par statut et création dans une fenêtre, la même depuis le calendrier', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/demo');
  await page.waitForTimeout(500);
  await page.goto(JA + '/app');
  await page.waitForSelector('.tboard .tcard', { timeout: 8000 });
  const cols = await page.$$eval('.tboard .tcol-h .eyebrow', l => l.map(x => x.textContent));
  assert.deepEqual(cols, ['À venir', 'En cours', 'Clôturés']);
  for (const url of ['/app', '/calendrier', '/dashboard']) {
    await page.goto(JA + url);
    await page.waitForTimeout(300);
    const y0 = await page.evaluate(() => scrollY);
    await page.click('.phead-act a[href$="#nouveau"]');
    await page.waitForSelector('dialog.nvdlg[open] .tpl');
    assert.equal(new URL(page.url()).pathname, url, 'reste sur la page');
    assert.equal(await page.evaluate(() => scrollY), y0, 'sans défilement');
    const onglets = await page.$$eval('.nvtabs button', l => l.map(x => x.textContent));
    assert.deepEqual(onglets, ['Modèles officiels', 'Mes modèles', 'Vierge', 'Animations']);
  }
  // créer une animation depuis la fenêtre, sur téléphone aussi sans débordement
  await page.click('.nvtabs button:nth-child(4)');
  assert.equal((await page.$$('.nvbody .tpl')).length, 4);
  await page.click('.nvbody .tpl');
  await page.fill('#nvName', 'Americano essai');
  await page.click('#nvForm button[type=submit]');
  await page.waitForURL(/\/t\//, { timeout: 8000 });
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Accès : compte créé depuis le Club, sans offre, puis essai à la première venue sur /RAM JA', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }), page = await ctx.newPage();
  await page.goto(JA + '/club/inscription');
  const r = await page.evaluate(async m => { const x = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: m, password: 'essai-club-1', first: 'Esther', last: 'Essai' }) }); return x.status; }, `club-${Date.now()}@exemple.test`);
  assert.equal(r, 200);
  const acces = async () => { const d = await (await ctx.request.get(JA + '/api/tournaments')).json(); return [(d.tournaments || []).length, d.access && d.access.state]; };
  const avant = await acces();
  assert.equal(avant[0], 0, 'pas de tournoi d’exemple au Club');
  await page.goto(JA + '/dashboard');
  await page.waitForTimeout(400);
  const apres = await acces();
  assert.equal(apres[0], 1, 'tournoi d’exemple à la première venue');
  await page.goto(JA + '/app');
  await page.waitForTimeout(300);
  assert.equal((await acces())[0], 1, 'une seule fois');
  await ctx.close();
});

test('Administration : liste courte, filtre par offre, fiche du compte, essai et suppression confirmée', async () => {
  const signup = async (ctx, email, first, last, referer) => { const r = await ctx.request.post(JA + '/api/auth/signup', { data: { email, password: 'essai-admin-1', first, last }, headers: referer ? { Referer: JA + '/club/inscription' } : {} }); assert.equal(r.status(), 200); };
  const autre = await browser.newContext(), mail = `membre-${Date.now()}@exemple.test`;
  await signup(autre, mail, 'Esther', 'Membre', true);
  await autre.close();
  // l'administrateur par défaut du serveur de test (données jetables)
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  page.on('dialog', d => d.accept());
  await signup(ctx, 'baptiste.belier@gmail.com', 'Admin', 'Essai');
  await page.goto(JA + '/admin');
  const ligne = page.locator('button.urow', { hasText: mail });
  await ligne.waitFor({ timeout: 8000 });
  assert.equal((await ligne.locator('span').allTextContents()).filter(Boolean).slice(0, 4).join('|'), `Membre|Esther|${mail}|Sans offre`);
  await page.selectOption('#ofilter', 'Sans offre');
  assert.equal(await page.locator('button.urow').count(), 1, 'filtre par offre');
  await ligne.click();
  await page.waitForSelector('#ufiche[open]');
  await page.click('#ufiche [data-essai]');
  await page.waitForSelector('#ufiche [data-sans]');
  await page.selectOption('#ofilter', 'Essai');
  assert.equal(await page.locator('button.urow', { hasText: mail }).count(), 1, 'essai attribué à la main');
  // suppression : refusée avec un mauvais e-mail, faite avec le bon
  await page.click('#ufiche .udel summary');
  await page.fill('#ufiche .udel input', 'faux@exemple.test');
  await page.click('#ufiche .udel button');
  await page.waitForTimeout(300);
  assert.ok(await page.locator('#ufiche[open]').count(), 'refusée');
  await page.fill('#ufiche .udel input', mail);
  await page.click('#ufiche .udel button');
  await page.waitForFunction(() => !document.querySelector('#ufiche').open);
  await page.selectOption('#ofilter', '');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('button.urow', { hasText: mail }).count(), 0, 'compte supprimé');
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Coach : Tableau de bord et Statistiques, planning en colonnes, un jour sur téléphone, clubs en sous-menu', async () => {
  for (const [w, cols] of [[1280, 7], [375, 1]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', x => errs.push(x.message));
    await page.goto(JA + '/club/coach.html');
    await page.waitForSelector('#tabs', { state: 'attached', timeout: 8000 });
    assert.deepEqual(await page.evaluate(() => TABBAR.slice(0, 2).map(t => t[2])), ['Tableau de bord', 'Statistiques']);
    assert.equal(await page.locator('.cotile').count(), 4, 'quatre petits chiffres');
    await page.evaluate(() => { S.tab = 'planning'; S.stack = []; render(); });
    await page.waitForSelector('.cowg');
    assert.equal(await page.locator('.cowj').count(), 7, 'les 7 jours, sur téléphone comme sur ordinateur');
    assert.ok(await page.locator('.cotopact [data-a="coNewSes"]').isVisible(), 'action en haut');
    const hauts = await page.$$eval('.cotopact .btn', l => [...new Set(l.map(x => Math.round(x.getBoundingClientRect().top)))]);
    assert.equal(hauts.length, 1, 'les 4 boutons sur une seule ligne');
    assert.ok(await page.$$eval('.cowb', l => l.every(x => x.getBoundingClientRect().width > 8)), 'des cours lisibles');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'pas de débordement');
    if (w < 500) {
      const s0 = await page.textContent('.coweek b');
      await page.click('.coweek [data-n="1"]');
      assert.notEqual(await page.textContent('.coweek b'), s0, 'flèche : semaine suivante');
      await page.evaluate(() => { S.pl.v = 'jour'; S.pl.j = TODAY; render(); });
      await page.waitForSelector('.cogrid');
      const j0 = await page.textContent('.coweek b');
      await page.evaluate(() => { const el = document.querySelector('#main .cogrid'), mk = (type, x) => { const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 }); el.dispatchEvent(new TouchEvent(type, { bubbles: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] })); }; mk('touchstart', 300); mk('touchend', 120); });
      await page.waitForFunction(j => document.querySelector('.coweek b').textContent !== j, j0, { timeout: 4000 });
      await page.evaluate(() => { S.pl.v = 'semaine'; S.pl.w = 0; render(); });
    }
    await page.evaluate(() => { S.tab = 'clubs'; render(); });
    await page.waitForFunction(() => document.querySelector('.seg [data-k="coClubTab"]'));
    assert.deepEqual(errs, []);
    await ctx.close();
  }
});

test('Coach : fiche élève en blocs, notes de 1 à 10 et toile, jauge du cycle, élève ponctuel, fiche enseignant', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html');
  await page.waitForFunction(() => typeof A !== 'undefined' && typeof coEleve === 'function' && typeof coDue === 'function');
  const large = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  // fiche élève : identité, actions juste en dessous, tuiles, groupes qui s'ouvrent
  await page.evaluate(() => { S.elTab = 'fiche'; A.open({ v: 'eleve', id: 'ines' }); });
  await page.waitForSelector('.coid');
  assert.equal(await page.locator('.coid + .cotools [data-a="coEditEl"]').count(), 1, 'actions sous la carte');
  assert.ok(await page.locator('.cotile').count() >= 3);
  assert.ok(await large(), 'fiche : pas de débordement');
  await page.click('.coid [data-a="coEditEl"]');
  await page.fill('#co-tel', '06 11 22 33 44');
  await page.click('#co-el .btn.full');
  await page.waitForSelector('.coid a[href="tel:0611223344"]');
  await page.click('.cobmain .item[data-v="cgroupe"]');
  await page.waitForSelector('.cocycb');
  // fiche groupe : un segment par séance, la case formule ouvre une fenêtre ou la page des formules
  assert.ok((await page.locator('.cocycb i').count()) > 0);
  assert.equal(await page.locator('.cotile-go').count(), 1);
  assert.ok(await large(), 'groupe : pas de débordement');
  // progression
  await page.evaluate(() => { S.elTab = 'prog'; A.open({ v: 'eleve', id: 'ines' }); });
  await page.waitForSelector('.cogauge');
  const t0 = await page.evaluate(() => TECH[coSport('ines')][0]);
  await page.locator('.cogauge').first().locator('button').nth(6).click();
  assert.equal(await page.evaluate(t => coEl('ines').tech[t], t0), 7);
  assert.equal(await page.locator('.cogauge').first().locator('button.on').count(), 7);
  assert.equal(await page.locator('.coradar .corv').count(), 1);
  assert.ok(await large(), 'progression : pas de débordement');
  // appel et élève ponctuel : dans la séance, ni dans le groupe ni dans les autres séances
  const r = await page.evaluate(() => {
    const g = GROUPS.find(x => x.id === 'padl'), d = coDates(g, isoIn(-40), TODAY).slice(-1)[0], cand = Object.keys(M).find(k => k !== 'club' && !coStu(g).includes(k) && coClubOf(M[k]) === coClubOf(g));
    return { id: g.id + '.' + d, cand, n: coStu(g).length };
  });
  await page.evaluate(id => A.open({ v: 'seance', id }), r.id);
  await page.waitForSelector('.pea svg');
  await page.click('[data-a="coPlus"]');
  await page.check(`#co-plus input[value="${r.cand}"]`);
  await page.click('#co-plus .btn.full');
  await page.waitForSelector(`[data-a="coPres"][data-k="${r.cand}"]`);
  assert.equal(await page.evaluate(() => coStu(GROUPS.find(x => x.id === 'padl')).length), r.n, 'le groupe ne change pas');
  await page.click(`[data-a="coPres"][data-k="${r.cand}"][data-s="P"]`);
  await page.waitForFunction(k => document.querySelector(`[data-a="coPres"][data-k="${k}"][data-s="P"].on`), r.cand);
  assert.ok(await large(), 'appel : pas de débordement');
  await page.click(`[data-a="coSesRm"][data-k="${r.cand}"]`);
  await page.waitForFunction(k => !document.querySelector(`[data-a="coPres"][data-k="${k}"]`), r.cand);
  // fiche enseignant : blocs et raccourci vers les groupes
  await page.evaluate(() => { M[ME()].pro = { on: true, dip: 'DE JEPS', since: '2015', tel: '06 00 00 00 00', mail: 'a@exemple.fr' }; A.open({ v: 'me' }); });
  await page.waitForSelector('.ptiles');
  await page.click('[data-a="proGroups"]');
  await page.click('[data-a="proGroupGo"]');
  await page.waitForSelector('.cocycb');
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Coach : statistiques sans chiffre d’affaires, paiements à régulariser, ensemble d’abonnements, vacances', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  page.on('dialog', d => d.accept());
  await page.goto(JA + '/club/coach.html');
  await page.waitForFunction(() => typeof A !== 'undefined' && typeof coPayTodo === 'function');
  const large = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  // statistiques : courbe du mois, autres périodes, aucun euro
  await page.evaluate(() => { S.dashP = 'mois'; S.dashTab = 'act'; A.tab({ t: 'dash' }); });
  await page.waitForSelector('.cocurve .cocur');
  const jours = await page.evaluate(() => { const [y, m] = TODAY.split('-').map(Number); return new Date(y, m, 0).getDate(); });
  assert.ok(await page.locator('.cocurve text', { hasText: String(jours) }).count(), 'l’axe montre tout le mois');
  assert.ok(!(await page.locator('#view, main, body').first().innerText()).includes('€'), 'aucun euro dans l’activité');
  assert.ok(await large());
  await page.click('[data-a="coDashP"][data-v="saison"]');
  await page.waitForSelector('.comonths');
  await page.locator('[data-a="coDashP"][data-v^="q:"]').first().click();
  await page.waitForSelector('.comonths');
  assert.ok(await large());
  // paiement : un pack en deux fois, échéance modifiable, rappel au tableau de bord, puis réglé
  const k = 'ines';
  await page.evaluate(k => { const e = coElGet(k); e.achats = [{ id: 'hx', t: 'pack', ref: 'p1', d: TODAY, nom: 'Pack essai', n: 3, prix: 90, pay: { ech: [{ s: 0, m: 30, ok: '' }, { s: 2, m: 60, ok: '' }] } }]; S.elTab = 'fiche'; A.open({ v: 'eleve', id: k }); }, k);
  await page.waitForSelector('.tag.copay.due');
  await page.click('.copayb');
  await page.waitForSelector('#co-pay');
  assert.equal(await page.locator('#co-pay .copech').count(), 2);
  await page.locator('#co-pay .co-es').nth(1).fill('3');
  await page.locator('#co-pay .co-eo').nth(0).check();
  await page.click('#co-pay .btn.full');
  await page.waitForSelector('.tag.copay.partiel');
  assert.equal(await page.evaluate(k => coEl(k).achats[0].pay.ech[1].s, k), 3);
  await page.evaluate(k => { coEl(k).achats[0].pay.ech[0].ok = ''; S.dashTab = 'pay'; A.tab({ t: 'dash' }); }, k);
  await page.waitForSelector('.tag.copay');
  assert.ok((await page.evaluate(() => coPayTodo().length)) >= 1, 'à régulariser');
  assert.ok(await large(), 'paiements : pas de débordement');
  await page.evaluate(() => A.tab({ t: 'today' }));
  await page.waitForFunction(() => document.body.innerText.includes('à régulariser'));
  // ensemble d'abonnements : une ligne, ses variantes à la demande
  await page.evaluate(() => { OFFRES.abos = [{ id: 'a1', nom: '1 fois par semaine', ens: 'Academy', periode: 'mois', duree: 6, prix: 120, parSemaine: 1 }, { id: 'a2', nom: '2 fois par semaine', ens: 'Academy', periode: 'mois', duree: 6, prix: 200, parSemaine: 2 }]; A.open({ v: 'formules' }); });
  await page.waitForSelector('.coens');
  assert.equal(await page.locator('.coens').count(), 1);
  assert.equal(await page.locator('.coens summary').innerText().then(t => /2 variantes/.test(t)), true);
  // vacances : une séance programmée est signalée, jamais retirée d'office ; le groupe choisit de suivre ou non
  const r = await page.evaluate(() => { const g = coGroups('', true).find(x => coIsGrp(x) && !coOver(x)), d = coDates(g, isoIn(1), isoIn(40))[0]; OFFRES.vacClubs = { [coClubOf(g)]: [{ nom: 'Noël', du: d, au: d }] }; OFFRES.conges = []; delete g.vacClub; A.open({ v: 'cgroupe', id: g.id }); return { id: g.id, d }; });
  await page.waitForSelector('[data-a="coVacFollow"]');
  assert.equal(await page.locator('[data-a="coVacClear"]').count(), 0, 'le groupe continue');
  await page.click('[data-a="coVacFollow"]');
  await page.waitForSelector('[data-a="coVacClear"]');
  assert.equal(await page.evaluate(r => coDates(grp(r.id), r.d, r.d).length, r), 1, 'pas retirée d’office');
  await page.click('[data-a="coVacClear"]');
  await page.waitForFunction(r => coDates(grp(r.id), r.d, r.d).length === 0, r);
  await page.evaluate(() => A.open({ v: 'me' }));
  await page.waitForSelector('[data-a="coVacCopy"]');
  await page.click('[data-a="coVacCopy"]');
  await page.waitForFunction(() => (OFFRES.conges || []).length === 1);
  assert.ok(await large(), 'profil : pas de débordement');
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Coach : le volet du menu suit le doigt, comme /RAM JA', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, hasTouch: true }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html');
  await page.waitForSelector('.cobar', { state: 'attached', timeout: 8000 });
  const touch = (type, x) => page.evaluate(([type, x]) => {
    const target = document.getElementById('main') || document.body, t = new Touch({ identifier: 1, target, clientX: x, clientY: 300 }), end = type === 'touchend';
    target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: end ? [] : [t], changedTouches: [t] }));
  }, [type, x]);
  const pos = () => page.evaluate(() => new DOMMatrix(getComputedStyle(document.getElementById('codrawer')).transform).m41);
  const ouvert = () => page.evaluate(() => document.getElementById('phone').classList.contains('drawer-open'));
  const w = await page.evaluate(() => { coDrawer(false); return document.getElementById('codrawer').offsetWidth; });
  // ouvrir : pendant le geste, le volet est exactement sous le doigt
  await touch('touchstart', 10);
  await touch('touchmove', 110);
  assert.equal(Math.round(await pos()), Math.round(-w + 100), 'suit le doigt');
  await touch('touchmove', 40);
  assert.equal(Math.round(await pos()), Math.round(-w + 30), 'revient avec le doigt');
  assert.equal(await ouvert(), false, 'pas encore ouvert');
  // un petit geste ne l'ouvre pas
  await touch('touchend', 40);
  assert.equal(await ouvert(), false);
  // un geste franc l'ouvre au relâcher
  await touch('touchstart', 10);
  await touch('touchmove', 200);
  await touch('touchend', 200);
  assert.equal(await ouvert(), true);
  // fermer : il suit aussi le doigt vers la gauche
  await touch('touchstart', 250);
  await touch('touchmove', 150);
  assert.equal(Math.round(await pos()), -100);
  await touch('touchend', 150);
  assert.equal(await ouvert(), false);
  // le bouton du menu fonctionne toujours
  await page.click('.cobar-btn');
  assert.equal(await ouvert(), true);
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Club : favoris avec du nouveau en tête, réglages d’une discussion, filtres de l’agenda, colonnes, Mes groupes', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(DEMO + '/index.html');
  await page.waitForFunction(() => typeof A !== 'undefined' && typeof favIsNew === 'function' && typeof cycleBar === 'function');
  // favoris : celui qui a du nouveau passe devant, avec le contour d'accent
  const ordre = await page.evaluate(() => {
    const [c1, c2] = chans.filter(c => chanOk(c)).slice(0, 2);
    c1.un = 0; c2.un = 2; c2.mute = false; c2.msgs.push({ by: 'club', x: 'Nouveau', at: Date.now() });
    S.favs = [{ v: 'chan', id: c1.id }, { v: 'chan', id: c2.id }];
    S.tab = 'home'; S.stack = []; render();
    const st = document.querySelectorAll('.stories .story[data-a="favGo"]');
    return { first: st[0].dataset.k, want: 'chan|' + c2.id, calm: st[0].querySelector('.ring').classList.contains('calm'), calm2: st[1].querySelector('.ring').classList.contains('calm'), c2: c2.id };
  });
  assert.ok(ordre.first.includes(ordre.c2), 'la nouveauté à gauche');
  assert.equal(ordre.calm, false, 'contour d’accent');
  assert.equal(ordre.calm2, true);
  // discussion : nom, règle, retrait à la main
  await page.evaluate(() => { S.role = 'admin'; S.stack = [{ v: 'chan', id: 'general' }]; render(); });
  await page.click('[data-a="chanCfg"]');
  await page.fill('#cc-n', 'Le grand salon');
  await page.selectOption('#cc-a', 'invite');
  assert.equal(await page.locator('#chan-cfg [data-a="chanWho"][aria-checked="true"]').count(), 0, 'sur invitation : personne');
  const k = await page.locator('#chan-cfg [data-a="chanWho"]').first().getAttribute('data-k');
  await page.locator('#chan-cfg [data-a="chanWho"]').first().click();
  assert.equal(await page.locator(`#chan-cfg [data-k="${k}"]`).getAttribute('aria-checked'), 'true', 'ajouté à la main');
  await page.click('#chan-cfg .btn.full');
  const r = await page.evaluate(k => { const c = chans.find(x => x.id === 'general'), o = chans.find(x => x.id === 'annonces'); return { name: c.name, acces: c.acces, plus: c.plus, autre: o.acces || '' }; }, k);
  assert.deepEqual(r, { name: 'Le grand salon', acces: 'invite', plus: [k], autre: '' }, 'seule cette discussion change');
  // agenda : les quatre vues occupent toute la largeur
  await page.evaluate(() => { S.tab = 'agenda'; S.stack = []; S.plan.scope = 'club'; S.plan.mode = 'week'; render(); });
  await page.waitForSelector('#plan .pllegend');
  const large = () => page.evaluate(() => { const m = document.getElementById('main').clientWidth, p = document.getElementById('plan').offsetWidth; return p >= m - 2; });
  assert.ok(await large(), 'semaine sur toute la largeur');
  assert.equal(await page.locator('.fbtn svg').evaluate(s => getComputedStyle(s).display !== 'none'), true, 'pictogramme des filtres');
  await page.evaluate(() => { S.plan.mode = 'list'; render(); });
  await page.waitForSelector('.plk .stack');
  assert.ok(await large(), 'liste sur toute la largeur');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.plk')).gridAutoFlow), 'column', 'en colonnes');
  await page.evaluate(() => { S.plan.mode = 'events'; render(); });
  await page.waitForSelector('.plk .plc');
  assert.ok(await page.locator('.plk .plc').count() >= 7, 'une colonne par jour, au moins sept');
  assert.ok(await page.evaluate(() => { const p = document.querySelector('.plk'); return p.scrollWidth > p.clientWidth || p.querySelectorAll('.plc').length * 242 <= p.clientWidth; }), 'les colonnes défilent');
  if (await page.locator('.plk .evc').count()) assert.ok(await page.evaluate(() => { const c = document.querySelector('.plk .evc'); return getComputedStyle(c.querySelector('.dblk')).display === 'none' && getComputedStyle(c.querySelector('.evp')).display !== 'none'; }), 'un picto à la place de la grosse date');
  assert.ok(await large(), 'rien ne déborde de la page');
  // filtres : la couleur reste visible, l'état actif a sa coche
  await page.click('[data-a="planFilters"]');
  const f = page.locator('.chip.plf', { hasText: 'Cours' });
  assert.equal(await f.getAttribute('aria-pressed'), 'true');
  assert.ok(await f.locator('svg').count() >= 2, 'pictogramme et coche');
  assert.notEqual(await f.evaluate(b => getComputedStyle(b).backgroundColor), await f.locator('.sq').evaluate(s => getComputedStyle(s).backgroundColor), 'le carré se distingue');
  await page.click('[data-a="close"]');
  // Mes groupes : plus de planning ni de création de stage
  const html = await page.evaluate(() => ecoleBody('manage'));
  assert.ok(!html.includes('Planning des cours'));
  assert.ok(!html.includes('Créer un stage'));
  assert.ok(html.includes('grpc') && html.includes('cocycb'), 'les groupes et leur jauge');
  // sur 360 px : rien ne déborde
  await page.setViewportSize({ width: 360, height: 780 });
  await page.evaluate(() => { S.plan.mode = 'events'; render(); });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Club : un cours d’un groupe dont je ne suis pas reste à l’agenda, sans sa discussion ni ses élèves', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(DEMO + '/index.html');
  await page.waitForFunction(() => typeof A !== 'undefined' && typeof planItems === 'function');
  const r = await page.evaluate(() => {
    S.role = 'member';
    const g = GROUPS.find(x => x.type === 'train' && !x.once && !x.mem.includes(ME()) && chans.some(c => c.id === x.id));
    if (!g) return null;
    const c = chans.find(x => x.id === g.id);
    let iso = TODAY;
    for (let i = 0; i < 14 && !trainOn(g, iso); i++) iso = isoIn(1, iso);
    S.plan.scope = 'club';
    const it = planItems(iso).find(x => x.id === g.id);
    return { ok: chanOk(c), v: it && it.v, id: g.id };
  });
  assert.ok(r, 'un groupe d’essai');
  assert.equal(r.ok, false, 'pas sa discussion');
  assert.equal(r.v, 'ginfo', 'le cours reste à l’agenda');
  await page.evaluate(id => A.open({ v: 'ginfo', id }), r.id);
  await page.waitForFunction(() => document.body.innerText.includes('réservées aux membres du groupe'));
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Club : Gérer le club sans cours individuels, cartes vides, en-tête de discussion, onglet Bar', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 780 } }), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/index.html');
  await page.waitForSelector('#tabs', { state: 'attached', timeout: 8000 });
  const liste = await page.evaluate(() => { GROUPS.push({ id: 'zc1', type: 'train', name: 'Cours individuel test', once: isoIn(1), mem: [], day: 1, h: '10 h', dur: '1 h', sub: 'x' }); const h = V.admin(); GROUPS.pop(); return h; });
  assert.ok(!liste.includes('Cours individuel test'), 'pas de cours individuel');
  // l'en-tête d'une discussion : ni sourdine ni cloche ; la sourdine est dans les réglages
  await page.evaluate(() => { S.stack = [{ v: 'chan', id: chans[0].id }]; render(); });
  await page.waitForSelector('#top [data-a="chanCfg"]');
  assert.equal(await page.locator('#top [data-a="mute"]').count(), 0);
  assert.equal(await page.locator('#top [data-a="notifs"]').evaluate(x => getComputedStyle(x).display), 'none');
  await page.click('#top [data-a="chanCfg"]');
  await page.waitForSelector('#sheet [data-a="mute"]');
  const m0 = await page.evaluate(() => !!chans[0].mute);
  await page.click('#sheet [data-a="mute"]');
  assert.equal(await page.evaluate(() => !!chans[0].mute), !m0);
  assert.equal(await page.getAttribute('#sheet [data-a="mute"]', 'aria-checked'), String(!m0));
  // cartes vides
  assert.ok(await page.evaluate(() => { const c = chans[0], l = c.msgs; c.msgs = []; S.stack = [{ v: 'chan', id: c.id }]; closeSheet(); render(); const ok = !!document.querySelector('.chat > .card > .empty'); c.msgs = l; return ok; }), 'aucun message : une carte');
  // onglet Bar : le trophée reste petit
  const haut = await page.evaluate(() => { const d = document.createElement('details'); d.className = 'more'; d.innerHTML = '<summary>' + ic('trophy') + 'x</summary>'; document.body.append(d); const h = d.querySelector('svg').getBoundingClientRect().height; d.remove(); return h; });
  assert.ok(haut <= 24, 'picto à sa taille');
  assert.deepEqual(errs, []);
  await page.close();
});

test('Coach : participants d’une séance, Mes groupes, Suivi, formule d’un groupe, cycle sans dates, périodes en une fois', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 780 } }), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html');
  await page.waitForSelector('#tabs', { state: 'attached', timeout: 8000 });
  const large = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  // navigation
  assert.deepEqual(await page.evaluate(() => TABBAR.map(t => t[2]).filter(t => /Suivi|Mes /.test(t))), ['Suivi', 'Mes groupes']);
  // participants
  const r = await page.evaluate(() => { const g = coGroups('', true).find(x => coIsGrp(x) && !coOver(x) && coStu(x).length), d = coDates(g, isoIn(-40), TODAY).slice(-1)[0], k = coStu(g)[0]; S.stack = [{ v: 'seance', id: g.id + '.' + d }]; render(); return { id: g.id + '.' + d, k, g: g.id }; });
  await page.waitForSelector('[data-a="coSesRm"]');
  assert.ok(await large(), 'la fiche tient à 360 px');
  await page.click(`[data-a="coSesRm"][data-k="${r.k}"]`);
  await page.waitForFunction(k => !document.querySelector(`[data-a="coSesRm"][data-k="${k}"]`), r.k);
  assert.ok(await page.evaluate(g => { const x = grp(g); return coStu(x).length > 0; }, r.g), 'il reste dans le groupe');
  await page.click('[data-a="coPlus"]');
  await page.waitForSelector('#co-plus');
  await page.check(`#co-plus input[value="${r.k}"]`);
  await page.click('#co-plus .btn.full');
  await page.waitForSelector(`[data-a="coSesRm"][data-k="${r.k}"]`);
  assert.equal(await page.evaluate(id => (sesGet(id).plus || []).length + (sesGet(id).out || []).length, r.id), 0, 'il revient, sans être compté en plus');
  // Mes groupes : le picto du groupe actif
  await page.evaluate(() => { S.stack = []; S.tab = 'clubs'; render(); });
  await page.waitForSelector('.cogon');
  assert.equal(await page.locator('.cofr .tg').count(), 0, 'plus d’interrupteur');
  assert.equal(await page.$eval('.cogon[aria-pressed="true"] svg', x => getComputedStyle(x).fill !== 'none'), true, 'plein');
  // la formule d'un groupe se choisit directement
  const gid = await page.evaluate(() => { const g = coGroups('', true).find(x => coIsGrp(x) && !coOver(x)); delete g.offre; g.cycles = []; OFFRES.packs = [{ id: 'p10', formule: OFFRES.formules[0] ? OFFRES.formules[0].id : '', nom: 'Pack 10', seances: 10, prix: 200 }]; S.stack = [{ v: 'cgroupe', id: g.id }]; render(); return g.id; });
  await page.click('[data-a="coGrpOf"]');
  await page.waitForSelector('#co-gof');
  await page.selectOption('#co-gof-o', 'pack:p10');
  await page.click('#co-gof .btn.full');
  await page.waitForFunction(id => grp(id).offre === 'pack:p10', gid);
  // cycle sans dates : la jauge compte le pack entier, aucune alerte, et une séance posée s'y ajoute
  const cy = await page.evaluate(id => { const g = grp(id); g.to = isoIn(-400); g.from = isoIn(-500); g.extra = []; g.cycles = [{ id: 'cz', nom: 'Pack', n: 10, offre: 'pack:p10', dates: [] }]; render(); return { txt: document.querySelector('#main').textContent, n: REGLES.cycleEtat(g, g.cycles[0], d => sesFind(g, d), TODAY).prevues }; }, gid);
  assert.equal(cy.n, 10);
  assert.ok(!/rattachées pour un pack/.test(cy.txt), 'pas de message d’erreur');
  assert.ok(await page.locator('.cocycb i.pose').count() >= 1, 'les séances à poser se voient');
  await page.evaluate(id => { const g = grp(id); g.extra = [isoIn(3)]; render(); }, gid);
  assert.equal(await page.evaluate(id => grp(id).cycles[0].dates.length, gid), 1, 'la séance posée entre dans le cycle');
  // périodes de travail
  await page.evaluate(() => { S.stack = []; S.tab = 'me'; OFFRES.dispos = []; render(); });
  await page.click('[data-a="coDispoAdd"]');
  await page.waitForSelector('#co-dispo');
  assert.ok(await large(), 'le formulaire tient à 360 px');
  await page.click('[data-a="coDiPlus"]');
  assert.equal(await page.locator('.codic').count(), 3);
  await page.click('#co-dispo > .btn.full');
  await page.waitForFunction(() => (OFFRES.dispos || []).length === 15, null, { timeout: 4000 });
  // Suivi
  await page.evaluate(() => { S.stack = []; S.tab = 'asuivi'; render(); });
  await page.waitForSelector('.cosuivit');
  assert.ok(/Bilans à écrire/.test(await page.textContent('#main')) && /Paiements à régulariser/.test(await page.textContent('#main')));
  assert.ok(await large(), 'le Suivi tient à 360 px');
  assert.deepEqual(errs, []);
  await page.close();
});

test('Coach : mes disponibilités, ce qui reste libre s’affiche au planning', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html');
  await page.waitForFunction(() => typeof A !== 'undefined' && typeof coDispoCard === 'function');
  await page.evaluate(() => { OFFRES.dispos = []; OFFRES.conges = []; A.open({ v: 'me' }); });
  await page.click('[data-a="coDispoAdd"]');
  const jour = await page.evaluate(() => new Date(isoIn(1).split('-').map(Number)[0], isoIn(1).split('-').map(Number)[1] - 1, isoIn(1).split('-').map(Number)[2]).getDay());
  await page.$$eval('.codij input', (l, j) => l.forEach(x => { x.checked = +x.value === j; }), jour);
  await page.click('.codic:nth-child(2) [data-a="coDiMoins"]');
  await page.fill('.codic .codid', '06:00');
  await page.fill('.codic .codia', '08:00');
  await page.fill('#co-di-l', 'Site test');
  await page.click('#co-dispo > .btn.full');
  await page.waitForSelector('[data-a="coDispoDel"]');
  await page.evaluate(() => { S.stack = []; S.pl.w = coDow(TODAY) === 0 ? 1 : 0; A.tab({ t: 'planning' }); });
  await page.waitForFunction(() => document.querySelector('.cowf') && /Libre 6 h – 8 h · Site test/.test(document.querySelector('.cowf').title));
  // en vacances : plus rien de libre
  await page.evaluate(() => { OFFRES.conges = [{ nom: 'Test', du: isoIn(0), au: isoIn(30) }]; render(true); });
  await page.waitForFunction(() => !document.querySelector('.cowf'));
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Coach : planning en vues jour et mois, ouvrir un collectif avec minimum et maximum', async () => {
  for (const w of [1280, 360]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', x => errs.push(x.message));
    await page.goto(JA + '/club/coach.html');
    await page.waitForSelector('#tabs', { state: 'attached', timeout: 8000 });
    await page.evaluate(() => { S.tab = 'planning'; S.stack = []; render(); });
    await page.waitForSelector('.cowg');
    const large = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
    await page.click('[data-a="coVue"][data-k="mois"]');
    await page.waitForSelector('.cogm');
    assert.ok((await page.locator('.comc').count()) % 7 === 0, 'des semaines entières');
    assert.equal(await page.$eval('.cogm', x => getComputedStyle(x).display), 'grid', 'la grille du mois a son style');
    assert.ok(await large(), 'mois sans débordement');
    const t0 = await page.textContent('.coweek b');
    await page.click('[data-a="coMois"][data-n="1"]');
    assert.notEqual(await page.textContent('.coweek b'), t0, 'mois suivant');
    await page.locator('.comc').nth(10).click();
    await page.waitForSelector('.cogrid');
    assert.ok(await large(), 'jour sans débordement');
    assert.equal(await page.$eval('.cogrid', x => getComputedStyle(x).position), 'relative', 'le quadrillage a son style');
    await page.click('[data-a="coJour"][data-n="1"]');
    await page.waitForSelector('.cogrid');
    await page.click('[data-a="coVue"][data-k="semaine"]');
    await page.waitForSelector('.cowg');
    await page.click('.cotopact [data-a="nvNew"]');
    await page.waitForSelector('#nv-form #nv-mx-0');
    await page.selectOption('#nv-pl-0', '2');
    await page.selectOption('#nv-mx-0', '4');
    await page.fill('#nv-no-0', 'Débutants');
    await page.fill('#nv-theme', 'Volée');
    await page.click('#nv-form > button:not([type=button])');
    await page.waitForFunction(() => !document.querySelector('#nv-form'));
    assert.equal(await page.evaluate(() => view().v), 'planning');
    const t = await page.evaluate(() => posts.find(p => p.kind === 'niveaux' && p.nv.theme === 'Volée').nv.tiers[0]);
    assert.equal(t.nom, 'Débutants');
    assert.equal(t.places, 2);
    assert.equal(t.max, 4);
    assert.deepEqual(errs, []);
    await ctx.close();
  }
});

test('Coach : chaque formulaire de tarif et d’achat s’ouvre, avec la référence Shopify au bon endroit', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html');
  await page.waitForSelector('#tabs', { state: 'attached', timeout: 8000 });
  for (const [f, form, sku] of [[() => A.coFoEdit({ id: OFFRES.formules[0].id }), '#co-fo', '#co-fv-sku'], [() => A.coPkEdit({ id: OFFRES.packs[0].id }), '#co-pk', '#co-kv-sku'], [() => A.coAbEdit({ id: OFFRES.abos[0].id }), '#co-ab', '#co-av-sku']]) {
    await page.evaluate(f);
    await page.waitForSelector(form + ' ' + sku);
    await page.evaluate(() => closeSheet());
  }
  const eleve = await page.evaluate(() => ELEVES[0].id);
  await page.evaluate(id => A.coAchat({ id }), eleve);
  await page.waitForSelector('#co-ac #co-ast');
  assert.equal(await page.locator('#co-ac [id$="-sku"]').count(), 0);
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Coach : un cycle reprend les séances déjà faites, le bon compte, et le paiement à un numéro de séance', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html');
  await page.waitForSelector('#tabs', { state: 'attached', timeout: 8000 });
  // un groupe à qui il reste un créneau en plus : 13 dates pour un pack de 10
  const r = await page.evaluate(() => {
    const g = GROUPS.find(x => x.type === 'train' && !x.once);
    for (let i = SEANCES.length - 1; i >= 0; i--) if (SEANCES[i].g === g.id) SEANCES.splice(i, 1);
    g.from = isoIn(-28); g.to = isoIn(56); delete g.cycles; g.skip = []; g.extra = []; g.off = []; g.cancel = []; g.every = 1;
    g.day = coDow(isoIn(-28));
    S.stack = [{ v: 'cgroupe', id: g.id }]; render();
    return { id: g.id, passees: coDates(g, g.from, TODAY).length, total: coDates(g, g.from, g.to).length };
  });
  await page.waitForSelector('[data-a="coPlan"][data-c="new"]');
  await page.click('[data-a="coPlan"][data-c="new"]');
  await page.waitForSelector('#co-plan #co-pl-pay');
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('#co-pl-dates .co-pd')].some(x => x.value <= TODAY)), 'les séances déjà passées sont proposées');
  await page.evaluate(() => { $('co-pl-n').value = 4; A.coPlanGen(); });
  await page.fill('#co-pl-nom', 'Hiver');
  await page.fill('#co-pl-pay', '2');
  await page.click('#co-plan > button:not([type=button])');
  await page.waitForFunction(() => !document.querySelector('#co-plan'));
  const g1 = await page.evaluate(id => { const g = grp(id), c = g.cycles[0]; return { nom: c.nom, n: c.dates.length, pay: c.pay, past: c.dates.filter(d => d <= TODAY).length }; }, r.id);
  assert.deepEqual([g1.nom, g1.n, g1.pay], ['Hiver', 4, [2]]);
  assert.ok(g1.past >= 1);
  // la jauge dit 0 sur 4, pas le total du créneau ; un appel fait passer la séance en faite
  await page.waitForFunction(() => /0 sur 4/.test(document.querySelector('.cocyct b').textContent), null, { timeout: 5000 });
  const faite = await page.evaluate(id => { const g = grp(id), d = g.cycles[0].dates[0], s = sesGet(g.id + '.' + d); s.pres = { x: 'P' }; render(true); return d; }, r.id);
  await page.waitForFunction(() => /1 sur 4/.test(document.querySelector('.cocyct b').textContent), null, { timeout: 5000 });
  // a posteriori : une séance se retire et se rattache depuis sa fiche
  await page.evaluate(([id, d]) => { S.stack = [{ v: 'seance', id: id + '.' + d }]; render(); }, [r.id, faite]);
  await page.waitForSelector('#co-s-cy');
  assert.match(await page.textContent('.card:has(#co-s-cy)'), /Séance 1 du cycle/);
  await page.selectOption('#co-s-cy', '');
  await page.waitForFunction(([id, d]) => !grp(id).cycles[0].dates.includes(d), [r.id, faite]);
  // le formulaire des séances du cycle la propose de nouveau
  await page.evaluate(id => { const g = grp(id); A.coCycleSeances({ id, c: g.cycles[0].id }); }, r.id);
  await page.waitForSelector('#co-cy-ses');
  await page.check('#cs-' + faite);
  await page.click('#co-cy-ses .btn.full');
  await page.waitForFunction(([id, d]) => grp(id).cycles[0].dates.includes(d), [r.id, faite]);
  // l'achat : le paiement à une seule séance précise
  await page.evaluate(() => A.coAchat({ id: ELEVES[0].id }));
  await page.waitForSelector('#co-ac #co-aps');
  assert.deepEqual(await page.evaluate(() => coPayPlan(100, [4])), [{ s: 4, m: 100, ok: '' }]);
  assert.deepEqual(await page.evaluate(() => coPayPlan(100, [1, 4, 8]).map(x => x.m)), [33.33, 33.33, 33.34]);
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Coach : mes outils de réservation ; élève : chercher des partenaires ; page publique sans compte', async () => {
  const cc = await browser.newContext({ viewport: { width: 1280, height: 900 } }), sc = await browser.newContext({ viewport: { width: 360, height: 780 } }), pub = await browser.newContext({ viewport: { width: 360, height: 780 } }), errs = [];
  const coachP = await cc.newPage(), page = await sc.newPage(), pp = await pub.newPage();
  for (const x of [coachP, page, pp]) x.on('pageerror', e => errs.push(e.message));
  const post = async (c, url, data) => (await c.request.post(JA + url, { data })).json(), t = Date.now();
  await post(cc, '/api/auth/signup', { email: `out-c-${t}@exemple.test`, password: 'essai-' + t, first: 'Sarah', last: 'Coach' });
  const club = await post(cc, '/api/ram/clubs', { name: 'Club Outils' });
  const now = new Date(), y = now.getFullYear(), saison = now.getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  await post(cc, '/api/coach/formules', { formules: { formules: [{ id: 'f1', nom: 'Cours individuel', sport: 'Padel', joueurs: 1, duree: 60, prix: 35 }, { id: 'f3', nom: 'Duo', sport: 'Padel', joueurs: 2, duree: 60, prix: 30, par: 'personne' }], packs: [{ id: 'p1', formule: 'f1', nom: 'Pack 5', seances: 5, prix: 160, url: 'https://boutique.exemple.test/pack' }], dispos: [0, 1, 2, 3, 4, 5, 6].map(jour => ({ jour, du: '09:00', au: '11:00' })) } });
  const code = club.code || (await (await cc.request.get(JA + '/api/ram/clubs')).json()).clubs.find(c => c.id === club.id).code;
  await post(sc, '/api/auth/signup', { email: `out-e-${t}@exemple.test`, password: 'essai-' + t, first: 'Ines', last: 'Eleve' });
  await post(sc, '/api/ram/join', { code });
  const mine = (await (await sc.request.get(JA + '/api/ram/clubs')).json()).clubs.find(c => c.id === club.id);
  await post(cc, `/api/ram/c/${club.id}/ops`, { ops: [{ coll: 'member', id: mine.key, op: 'put', data: { n: 'Ines Eleve', valid: saison, pl: 5 } }, { coll: 'member', id: club.key, op: 'put', data: { n: 'Sarah Coach', pro: { book: 'https://calendly.com/sarah/cours' } } }] });

  // le coach ouvre sa page publique
  await coachP.goto(JA + '/club/coach.html');
  await coachP.waitForFunction(() => window.RAM && RAM.live, null, { timeout: 15000 });
  await coachP.evaluate(() => { S.stack = []; A.tab({ t: 'me' }); });
  await coachP.waitForSelector('[data-a="coResaPage"]', { timeout: 8000 });
  assert.ok(await coachP.locator('[data-a="coAgendaLien"]').count());
  await coachP.click('[data-a="coResaPage"]');
  await coachP.waitForSelector('[data-a="coResaBloc"]', { timeout: 8000 });
  await coachP.waitForFunction(() => OFFRES.page === RAM.club);

  // l'élève : les deux façons de réserver, l'achat du pack, puis une demande
  await page.goto(JA + '/club/index.html');
  await page.waitForFunction(() => window.RAM && RAM.live, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const pro = await page.evaluate(k => { M[k].pro = { book: 'https://calendly.com/sarah/cours' }; PRO_OFF[k] = undefined; delete PRO_OFF[k]; return proBody(k); }, club.key);
  assert.match(pro, /Réserver sur Calendly/, 'le lien Calendly reste');
  await page.waitForFunction(k => proBody(k).includes('Réserver un cours'), club.key, { timeout: 8000 });
  const pro2 = await page.evaluate(k => proBody(k), club.key);
  assert.ok(/Réserver un cours/.test(pro2) && /Réserver sur Calendly/.test(pro2), 'les deux à côté');
  assert.match(pro2, /boutique\.exemple\.test\/pack/, 'acheter le pack');
  await page.evaluate(k => { S.resaW = 2; A.open({ v: 'resa', id: k }); }, club.key);
  await page.waitForSelector('.rsl', { timeout: 8000 });
  await page.locator('.rsl').first().click();
  await page.click('[data-a="resaAsk"]');
  await page.waitForSelector('#rs-ask');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'pas de débordement');
  await page.fill('#rs-at', 'Volée');
  await page.click('#rs-ask .btn.full');
  await page.waitForFunction(() => !document.querySelector('#rs-ask'), null, { timeout: 8000 });
  await page.waitForSelector('.rsdem', { timeout: 8000 });

  // sans compte : la page publique
  await pp.goto(JA + '/r/' + club.id + '/' + club.key);
  await pp.waitForSelector('#nx', { timeout: 8000 });
  await pp.click('#nx');   // la semaine suivante : forcément à venir
  await pp.waitForSelector('.slots button', { timeout: 8000 });
  assert.ok(await pp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'page publique sans débordement');
  await pp.locator('.slots button').first().click();
  await pp.fill('#p', 'Léa'); await pp.fill('#n', 'Roy'); await pp.fill('#t', '0600000000'); await pp.fill('#em', `lea-${t}@exemple.test`); await pp.fill('#o', 'Volée');
  await pp.check('#ac');
  await pp.click('#f .go');
  await pp.waitForFunction(() => /réservé/i.test(document.querySelector('h1').textContent), null, { timeout: 8000 });
  assert.deepEqual(errs, []);
  await cc.close(); await sc.close(); await pub.close();
});

test('Réservation : l’élève voit la semaine de l’enseignant, réserve, et la plage n’est plus libre', async () => {
  const cc = await browser.newContext(), sc = await browser.newContext({ viewport: { width: 360, height: 780 } }), page = await sc.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  const post = async (c, url, data) => (await c.request.post(JA + url, { data })).json(), t = Date.now();
  await post(cc, '/api/auth/signup', { email: `resa-c-${t}@exemple.test`, password: 'essai-' + t, first: 'Sarah', last: 'Coach' });
  const club = await post(cc, '/api/ram/clubs', { name: 'Club Résa' });
  const now = new Date(), y = now.getFullYear(), saison = now.getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;   // la saison du club à sa création
  await post(cc, '/api/coach/formules', { formules: { formules: [{ id: 'f1', nom: 'Cours individuel', sport: 'Padel', joueurs: 1, duree: 60, prix: 35 }], dispos: [0, 1, 2, 3, 4, 5, 6].map(jour => ({ jour, du: '09:00', au: '11:00' })) } });
  await post(sc, '/api/auth/signup', { email: `resa-e-${t}@exemple.test`, password: 'essai-' + t, first: 'Ines', last: 'Eleve' });
  const code = club.code || (await (await cc.request.get(JA + '/api/ram/clubs')).json()).clubs.find(c => c.id === club.id).code;
  await post(sc, '/api/ram/join', { code });
  const mine = (await (await sc.request.get(JA + '/api/ram/clubs')).json()).clubs.find(c => c.id === club.id);
  await post(cc, `/api/ram/c/${club.id}/ops`, { ops: [{ coll: 'member', id: mine.key, op: 'put', data: { n: 'Ines Eleve', valid: saison } }] });
  await page.goto(JA + '/club/index.html');
  await page.waitForFunction(() => window.RAM && RAM.live, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  // dans deux semaines : forcément à plus de 24 h, donc annulable
  await page.evaluate(k => { S.resaW = 2; A.open({ v: 'resa', id: k }); }, club.key);
  await page.waitForSelector('.rsl', { timeout: 8000 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'pas de débordement');
  const n0 = await page.locator('.rsl').count();
  const first = page.locator('.rsl').first(), d = await first.getAttribute('data-d');
  await first.click();
  await page.waitForSelector('#rs-go');
  await page.click('#rs-go .btn.full');
  assert.ok(await page.locator('#rs-go').count(), 'objectif obligatoire');
  await page.fill('#rs-o', 'Travailler la volée');
  await page.click('#rs-go .btn.full');
  await page.waitForFunction(() => !document.querySelector('#rs-go'));
  await page.waitForSelector('.rsp', { timeout: 8000 });
  assert.ok((await page.locator('.rsl').count()) < n0, 'la plage n’est plus libre');
  assert.match(await page.locator('.rsp').first().innerText(), /pris/);
  await page.waitForFunction(k => GROUPS.some(x => x.once && x.coach === k), club.key, { timeout: 8000 });   // le cours arrive dans son agenda
  // la liste d'attente, puis l'annulation par l'élève
  await page.click('.rsa');
  await page.waitForSelector('.rsa[aria-pressed="true"]', { timeout: 8000 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'pas de débordement avec la liste d’attente');
  page.on('dialog', x => x.accept());
  await page.click('[data-a="resaCancel"]');
  await page.waitForFunction(n => document.querySelectorAll('.rsl').length === n && !document.querySelector('[data-a="resaCancel"]'), n0, { timeout: 8000 });
  assert.deepEqual(errs, []);
  await cc.close();
  await sc.close();
});

