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
import net from 'node:net';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// port libre donné par le système (et non tiré au hasard dans une plage) : deux séries lancées en même temps
// ne tombent jamais sur le même serveur
const freePort = () => new Promise((ok, ko) => { const s = net.createServer(); s.on('error', ko); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
let PORT, JA;
let server, demoServer, DEMO, dataDir, browser;

/* ---------- démarrage : serveur JA (données jetables) + serveur statique pour la démo Club ---------- */
before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ram-ecrans-'));
  PORT = await freePort(); JA = `http://127.0.0.1:${PORT}`;
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: dataDir };
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].forEach(k => delete env[k]);
  server = spawn(process.execPath, [join(ROOT, 'server.js')], { env, stdio: 'ignore' });
  // prêt quand il répond, même lentement sur une machine chargée ; sinon on s'arrête net plutôt que d'échouer plus loin
  let exited = null;
  server.once('exit', c => { exited = c; });
  for (const t0 = Date.now(); ; await new Promise(r => setTimeout(r, 100))) {
    try { if ((await fetch(JA + '/')).ok) break; } catch (e) { /* pas encore prêt */ }
    if (exited !== null) throw new Error('le serveur /RAM JA s’est arrêté au démarrage (code ' + exited + ')');
    if (Date.now() - t0 > 30000) throw new Error('le serveur /RAM JA ne répond pas au bout de 30 s');
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
  // ouverture à froid : on quitte l'appli (plus de synchro en route) et on efface son cache sur l'appareil, sinon
  // l'appli rouvre depuis ce cache et la synchro suivante y ajoute le cours ancien (cas d'une machine chargée)
  await page.goto(JA + '/api/ram/clubs');
  await page.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('ram-cache'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
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
  assert.equal(await page.locator('[data-a="planMode"][data-m="list"]').count(), 0, 'plus de vue Liste');
  await page.evaluate(() => { S.plan.mode = 'events'; render(); });
  await page.waitForSelector('.plk .plc');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.plk')).gridAutoFlow), 'column', 'en colonnes');
  assert.ok(await page.locator('.plk .plc').count() >= 7, 'une colonne par jour, au moins sept');
  assert.ok(await page.evaluate(() => { const p = document.querySelector('.plk'); return p.scrollWidth > p.clientWidth || p.querySelectorAll('.plc').length * 242 <= p.clientWidth; }), 'les colonnes défilent');
  assert.ok(await large(), 'rien ne déborde de la page');
  // filtres : la couleur reste visible, l'état actif a sa coche
  await page.click('[data-a="planFilters"]');
  const f = page.locator('.chip.plf', { hasText: 'Tournois' });
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

test('Club : un cours d’un groupe dont je ne suis pas n’est pas dans l’agenda du club, sa fiche reste sans sa discussion ni ses élèves', async () => {
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
    return { ok: chanOk(c), present: !!it, id: g.id };
  });
  assert.ok(r, 'un groupe d’essai');
  assert.equal(r.ok, false, 'pas sa discussion');
  assert.equal(r.present, false, 'l’agenda du club ne montre que ce que le club organise');
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

test('Coach : toute la largeur sur ordinateur, club dans l’en-tête, chiffres sur la courbe', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html');
  await page.waitForFunction(() => typeof coGoogleSheet === 'function', null, { timeout: 8000 });
  for (const t of ['eleves', 'clubs', 'dash']) {
    await page.evaluate(x => { S.stack = []; A.tab({ t: x }); }, t);
    await page.waitForFunction(() => document.querySelector('#main > .pad'));
    const larg = await page.evaluate(() => [document.querySelector('#main > .pad').getBoundingClientRect().width, document.querySelector('#main').getBoundingClientRect().width]);
    assert.ok(larg[0] >= larg[1] - 2, t + ' : toute la largeur');
  }
  // plusieurs clubs : le choix est dans l'en-tête, plus de pastilles
  await page.evaluate(() => { CO_EXT.zz = { id: 'zz', name: 'Autre club' }; });
  for (const t of ['eleves', 'dash', 'planning']) {
    await page.evaluate(x => { S.stack = []; A.tab({ t: x }); }, t);
    await page.waitForSelector('#top .cotopclub select', { timeout: 5000 });
    assert.equal(await page.locator('#main [data-a="coClub"]').count(), 0, t);
  }
  await page.evaluate(() => { delete CO_EXT.zz; S.stack = []; A.tab({ t: 'dash' }); S.dashP = 'mois'; render(true); });
  await page.evaluate(() => document.querySelectorAll('.ram-splash').forEach(x => x.remove()));   // non connecté : l'écran de connexion
  const w = page.locator('.cocurvew');
  await w.waitFor({ timeout: 8000 });
  await w.scrollIntoViewIfNeeded();
  const b = await w.locator('svg').boundingBox();
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height / 2);
  assert.equal(await page.locator('.cotip').isVisible(), true);
  assert.match(await page.locator('.cotip').innerText(), /Le \d+[\s\S]*Ce mois[\s\S]*Mois dernier/);
  await page.mouse.move(5, 5);
  assert.equal(await page.locator('.cotip').isVisible(), false);
  assert.deepEqual(errs, []);
  await page.close();
});

test('Coach : le calendrier de paiement d’un pack, et les filtres du Suivi', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html');
  await page.waitForFunction(() => typeof coGoogleSheet === 'function', null, { timeout: 8000 });
  await page.evaluate(() => document.querySelectorAll('.ram-splash').forEach(x => x.remove()));
  // le plan du pack : ses séances et ses montants
  assert.deepEqual(await page.evaluate(() => REGLES.planPaiement(250, [1, 4, 7], [85, 85, 80]).map(x => [x.s, x.m])), [[1, 85], [4, 85], [7, 80]]);
  assert.deepEqual(await page.evaluate(() => REGLES.planPaiement(100, [1, 3], [85, 85]).map(x => x.m)), [50, 50], 'des montants faux : à parts égales');
  await page.evaluate(() => { const p = OFFRES.packs[0]; p.ech = [1, 4]; p.echm = [p.prix - 10, 10]; });
  const form = await page.evaluate(() => coKeRow(4, 10));
  assert.match(form, /value="4"/);
  assert.match(form, /value="10"/);
  // Suivi : les filtres des bilans et le filtre des paiements
  await page.evaluate(() => { S.stack = []; A.tab({ t: 'asuivi' }); });
  assert.equal(await page.locator('[data-a="coSuiviB"]').count(), 0, 'filtre des bilans replié, comme celui des paiements');
  await page.click('[data-a="coSuiviBO"]');
  await page.waitForSelector('[data-a="coSuiviB"][data-v="tout"]');
  const n = async () => page.locator('#main .colist').first().locator('.item').count();
  const a = await n();
  await page.click('[data-a="coSuiviB"][data-v="tout"]');
  await page.waitForSelector('[data-a="coSuiviB"][data-v="tout"][aria-pressed="true"]');
  assert.ok((await n()) >= a, 'tout confondu : au moins autant');
  assert.equal(await page.locator('[data-a="coSuiviP"]').count(), 0, 'filtres des paiements repliés');
  await page.click('[data-a="coSuiviPO"]');
  await page.click('[data-a="coSuiviP"][data-v="mois"]');
  await page.waitForSelector('[data-a="coSuiviP"][data-v="mois"][aria-pressed="true"]');
  assert.deepEqual(errs, []);
  await page.close();
});

test('Club : onglet Adhérents, accès depuis Le club, événement hors du mur puis promu', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 780 } }), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/index.html');
  await page.waitForSelector('#tabs', { state: 'attached', timeout: 8000 });
  await page.evaluate(() => document.querySelectorAll('.ram-splash').forEach(x => x.remove()));
  await page.evaluate(() => { S.role = 'admin'; A.goClub({ t: 'club' }); });
  const h = await page.textContent('#main');
  for (const x of ['Courts de tennis', 'Pistes de padel', 'Partenaires', 'Archives', 'Club-house']) assert.ok(h.includes(x), x);
  assert.ok(!h.includes('Demander une inscription'));
  assert.equal(await page.locator('#main [data-a="seg"][data-val="actus"]').count(), 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'pas de débordement');
  await page.click('[data-a="open"][data-v="actusl"]');
  await page.waitForFunction(() => view().v === 'actusl');
  await page.evaluate(() => { A.goClub({ t: 'comm' }); });
  await page.waitForFunction(() => view().v === 'comml');
  await page.evaluate(() => { S.stack = []; A.goClub({ t: 'adh' }); });
  await page.waitForSelector('#main .item');
  // créer un événement : il va à sa page, pas sur le mur ; Promouvoir le met sur le mur
  const id = await page.evaluate(() => { const p = { id: 'pzz', by: 'club', t: '', kind: 'event', mur: false, reg: 'int', title: 'Stage zz', d: isoIn(5), d2: '', h1: '9 h', h2: '12 h', date: 'x', place: 'y', body: 'z', likes: 0, com: [], yes: 0, maybe: 0, my: null, ins: [] }; posts.unshift(p); return p.id; });
  assert.ok(!(await page.evaluate(() => { S.tab = 'home'; S.stack = []; render(); return document.querySelector('#main').textContent; })).includes('Stage zz'), 'pas sur le mur');
  await page.evaluate(x => A.open({ v: 'post', id: x }), id);
  await page.waitForSelector('[data-a="promo"]');
  await page.click('[data-a="promo"]');
  assert.ok((await page.evaluate(() => { S.stack = []; S.tab = 'home'; render(); return document.querySelector('#main').textContent; })).includes('Stage zz'), 'promu sur le mur');
  assert.deepEqual(errs, []);
  await page.close();
});

test('Coach : relier Google Agenda, les trois états du réglage', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 780 } }), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html');
  await page.waitForFunction(() => typeof coGoogleSheet === 'function', null, { timeout: 8000 });
  assert.ok(await page.evaluate(() => coOutilsCard().includes('data-a="coGoogle"')));
  const texte = x => page.evaluate(v => { coGoogleSheet(v); const t = document.querySelector('#sheet').innerText; const larg = document.querySelector('#sheet').scrollWidth <= window.innerWidth; closeSheet(); return { t, larg }; }, x);
  assert.match((await texte({ dispo: false })).t, /pas encore activé/);
  const a = await texte({ dispo: true, compte: 'ram@projet.iam.gserviceaccount.com', cal: '' });
  assert.match(a.t, /ram@projet/);
  assert.ok(a.larg, 'rien ne dépasse à 360 px');
  const b = await texte({ dispo: true, compte: 'x', cal: 'a@group.calendar.google.com', seances: 2, erreur: 'Google Agenda répond 503' });
  assert.match(b.t, /2 séances/);
  assert.match(b.t, /503/);
  assert.deepEqual(errs, []);
  await page.close();
});

test('Coach : une adresse d’agenda refusée par Google n’est pas gardée, et un agenda illisible se voit', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 780 } }), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.route('**/api/coach/agenda-verifier', r => r.fulfill({ json: { ok: false, raison: 'privee' } }));
  await page.goto(JA + '/club/coach.html');
  await page.waitForFunction(() => typeof coCalTxt === 'function', null, { timeout: 8000 });
  await page.evaluate(() => { window.RAM = window.RAM || {}; RAM.live = true; OFFRES.icals = []; A.coIcalAdd(); });
  await page.fill('#co-ic', 'https://calendar.google.com/calendar/ical/x/public/basic.ics');
  await page.click('#co-ical button');
  await page.waitForFunction(() => document.querySelector('#co-ic-err').textContent.length > 0);
  assert.match(await page.textContent('#co-ic-err'), /Adresse secrète/);
  assert.equal(await page.evaluate(() => OFFRES.icals.length), 0, 'adresse non gardée');
  assert.ok(await page.evaluate(() => document.querySelector('#sheet').scrollWidth <= innerWidth), 'rien ne dépasse à 360 px');
  const carte = await page.evaluate(() => { closeSheet(); CO_CAL = [{ ok: false, raison: 'privee' }]; OFFRES.icals = ['https://calendar.google.com/a']; return coOutilsCard(); });
  assert.match(carte, /Agenda 1 illisible/);
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
  // créer un stage depuis /RAM Coach
  await coachP.evaluate(() => A.newPost({ k: 'stage' }));
  await coachP.waitForSelector('#adm-form[data-k="stage"]', { timeout: 8000 });
  await coachP.evaluate(() => { const v = (i, x) => { const e = document.getElementById(i); if (e) e.value = x; }; v('a-title', 'Stage de Noël'); v('a-d1', isoIn(10)); v('a-h1', '9 h'); v('a-h2', '12 h'); v('a-place', 'Club'); v('a-body', 'Pour tous'); document.getElementById('a-same') && (document.getElementById('a-same').checked = true); document.querySelector('#adm-form').requestSubmit(); });
  await coachP.waitForFunction(() => posts.some(p => p.title === 'Stage de Noël' && p.stage && p.mur === false) && view().v === 'post', null, { timeout: 8000, polling: 300 });
  await coachP.waitForSelector('[data-a="promo"]', { timeout: 8000 });
  assert.deepEqual(errs, [], 'stage créé sans erreur');
  await coachP.evaluate(() => { S.stack = []; A.tab({ t: 'me' }); });

  // l'élève : les deux façons de réserver, l'achat du pack, puis une demande
  await page.goto(JA + '/club/index.html');
  await page.waitForFunction(() => window.RAM && RAM.live, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const pro = await page.evaluate(k => { M[k].pro = { book: 'https://calendly.com/sarah/cours', tel: '06 12 34 56 78', mail: 'sarah@exemple.fr', web: 'https://exemple.fr/' }; PRO_OFF[k] = { formules: [], packs: [], abos: [], resa: false }; return proBook(k); }, club.key);
  assert.match(pro, /Réserver sur Calendly/, 'sans disponibilités : son outil, pour pouvoir réserver');
  await page.evaluate(k => { delete PRO_OFF[k]; proOffers(k); }, club.key);
  await page.waitForFunction(k => PRO_OFF[k] && PRO_OFF[k].resa, club.key, { timeout: 8000 });
  const pro1 = await page.evaluate(k => proBook(k), club.key);
  assert.ok(/data-v="resa"/.test(pro1) && !/calendly/i.test(pro1), 'avec disponibilités : la réservation de l’appli, plus Calendly');
  const pro2 = await page.evaluate(k => proBody(k), club.key);
  assert.ok(!/calendly/i.test(pro2), 'plus de Calendly dans la carte');
  assert.match(pro2, /boutique\.exemple\.test\/pack/, 'acheter le pack');
  // la carte repliée : le raccourci est là ; dépliée : contacts avant les groupes, tarifs repliés
  await page.evaluate(k => { const d = document.createElement('div'); d.id = 'zcarte'; d.innerHTML = profCard(k); document.querySelector('#app, main, body').append(d); d.scrollIntoView(); }, club.key);
  assert.ok(await page.locator('#zcarte .prof > summary .pres').isVisible(), 'réserver sans déplier');
  assert.equal(await page.locator('#zcarte .ptarifs').evaluate(x => x.open), false, 'tarifs repliés au début');
  await page.locator('#zcarte .prof > summary .grow').evaluate(x => x.click());
  assert.equal(await page.locator('#zcarte .prof').evaluate(x => x.open), true);
  assert.deepEqual(await page.locator('#zcarte .pbtn b').allInnerTexts(), ['Appeler', 'Écrire un mail', 'Site internet']);
  assert.ok(await page.locator('#zcarte .pbtn').first().evaluate(x => x.getBoundingClientRect().right <= innerWidth), 'les boutons tiennent');
  await page.locator('#zcarte .ptarifs > summary').evaluate(x => x.click());
  assert.equal(await page.locator('#zcarte .ptarifs').evaluate(x => x.open), true, 'les tarifs se déplient');
  await page.locator('#zcarte .prof').evaluate(x => { x.open = false; });
  await page.locator('#zcarte .prof > summary .pres').evaluate(x => x.click());
  await page.waitForFunction(() => view().v === 'resa', null, { timeout: 8000 });
  assert.equal(await page.locator('#zcarte .prof').evaluate(x => x.open).catch(() => false), false, 'réserver ne déplie pas la carte');
  await page.evaluate(() => { const d = document.querySelector('#zcarte'); if (d) d.remove(); });
  await page.evaluate(k => { S.resaM = 1; A.open({ v: 'resa', id: k }); }, club.key);
  await page.waitForSelector('.rsl', { timeout: 8000 });
  await page.locator('.rsl').first().click();
  await page.click('.rsgo');
  await page.click('[data-a="resaAsk"]');
  await page.waitForSelector('#rs-ask');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'pas de débordement');
  await page.fill('#rs-at', 'Volée');
  await page.click('#rs-ask .btn.full');
  await page.waitForFunction(() => !document.querySelector('#rs-ask'), null, { timeout: 8000 });
  await page.waitForSelector('.rsdem', { timeout: 8000 });

  // le bureau change le rôle d'un adhérent depuis son profil, tout en haut
  await coachP.goto(JA + '/club/index.html');
  await coachP.waitForFunction(() => window.RAM && RAM.live, null, { timeout: 30000, polling: 300 });
  await coachP.waitForFunction(k => M[k], mine.key, { timeout: 15000, polling: 300 });
  // le premier chargement du club peut ramener à l'accueil, même juste après l'ouverture du profil (club rechargé
  // quand le rôle connu de l'appareil n'est plus le bon) : on attend l'état réel, en rouvrant le profil et en refaisant
  // le geste tant que le rôle n'est pas vraiment changé, au lieu de cliquer une fois sur un bouton qui peut disparaître
  // (rouvre le profil s'il n'est plus affiché, puis renvoie le premier bouton de rôle)
  const ROUVRE = k => { if (!document.querySelector('[data-a="ramRole"]') && RAM.roles && RAM.roles[k]) A.member({ id: k }); return document.querySelector('[data-a="ramRole"]'); };
  const roleChange = (r, role, titre) => coachP.waitForFunction(([k, r, role, titre]) => {
    if (RAM.roles[k] === role && (M[k].role || '') === titre) return true;
    if (!document.querySelector('[data-a="ramRole"]') && RAM.roles && RAM.roles[k]) A.member({ id: k });
    const b = document.querySelector('[data-a="ramRole"][data-r="' + r + '"]');
    if (b && b.getAttribute('aria-pressed') !== 'true') b.click();
    return false;
  }, [mine.key, r, role, titre], { timeout: 30000, polling: 500 });
  await coachP.waitForFunction(ROUVRE, mine.key, { timeout: 15000, polling: 300 });
  await coachP.waitForFunction(k => { if (!document.querySelector('[data-a="ramRole"]') && RAM.roles && RAM.roles[k]) A.member({ id: k }); const c = document.querySelector('[data-a="ramRole"]'), p = c && c.closest('.card').previousElementSibling; return !!(p && p.classList.contains('phero')); }, mine.key, { timeout: 15000, polling: 300 });   // juste sous l’en-tête
  await roleChange('gerant', 'bureau', 'Gérant');
  await coachP.waitForFunction(k => { if (!document.querySelector('[data-a="ramRole"]') && RAM.roles && RAM.roles[k]) A.member({ id: k }); return document.querySelector('[data-a="ramRole"][data-r="gerant"]')?.getAttribute('aria-pressed') === 'true'; }, mine.key, { timeout: 15000, polling: 300 });
  await roleChange('mem', 'mem', '');

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
  // le mois prochain : forcément à plus de 24 h, donc annulable
  await page.evaluate(k => { S.resaM = 1; A.open({ v: 'resa', id: k }); }, club.key);
  await page.waitForSelector('.rsl', { timeout: 8000 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'pas de débordement');
  const n0 = await page.locator('.rsl').count();
  const first = page.locator('.rsl').first(), d = await first.getAttribute('data-d');
  await first.click();
  await page.click('.rsgo');
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

test('Coach : raccourcis en haut, carte commune, jour épinglé, paiements à supprimer', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
  page.on('pageerror', e => { throw e; });
  page.on('dialog', d => d.accept());
  await page.goto(JA + '/club/coach.html');
  await page.waitForFunction(() => typeof A !== 'undefined' && typeof coPayTodo === 'function');
  await page.evaluate(() => { document.querySelector('.ram-splash')?.remove(); A.tab({ t: 'today' }); });
  await page.waitForSelector('.coshort');
  assert.ok(await page.evaluate(() => { const r = document.querySelector('.coshort'), c = document.querySelector('.cotiles'); return r.compareDocumentPosition(c) & 4; }), 'raccourcis avant les chiffres');
  const short = await page.locator('.coshort').innerText();
  for (const x of ['stage', 'séance collective', 'animation', 'à un élève', 'à un groupe', 'contenu']) assert.ok(short.toLowerCase().includes(x), x);
  assert.ok(!short.includes('Statistiques'), 'plus de raccourci Statistiques');
  // un élève fictif avec un paiement dû : il se sélectionne et se retire, l'achat reste
  await page.evaluate(() => { const k = coStudents()[0], e = coElGet(k); e.achats = [{ id: 'hz', t: 'pack', ref: 'p1', d: TODAY, nom: 'Pack essai', n: 3, prix: 90, pay: { ech: [{ s: 0, m: 90, ok: '' }] } }]; window.kz = k; A.tab({ t: 'asuivi' }); });
  await page.click('[data-a="coSelModeP"]');
  const n0 = await page.evaluate(() => coPayTodo().length);
  assert.ok(n0 >= 1);
  await page.locator('[data-a="coPickP"][data-id*="hz"]').click();
  await page.click('[data-a="coPickDelP"]');
  await page.waitForFunction(n => coPayTodo().length === n - 1, n0);
  assert.equal(await page.evaluate(() => coEl(window.kz).achats[0].pay.off), 1);
  assert.equal(await page.evaluate(() => coEl(window.kz).achats.length), 1, 'l’achat reste');
  await page.close();
});

test('Club : agenda en cartes communes, l’étiquette du jour reste en haut puis change', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 640 } });
  page.on('pageerror', e => { throw e; });
  await page.goto(JA + '/club/index.html');
  await page.waitForFunction(() => typeof S !== 'undefined' && typeof planCard === 'function');
  await page.evaluate(() => { document.querySelector('.ram-splash')?.remove(); S.tab = 'agenda'; S.stack = []; S.plan.scope = 'me'; S.plan.mode = 'events'; S.plan.d = TODAY; render(); });
  await page.waitForSelector('.plc .evday');
  assert.equal(await page.locator('.dblk').count(), 0, 'plus de date dans les cartes');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'rien ne déborde à 360 px');
  const r = await page.evaluate(async () => {
    const m = document.getElementById('main'), days = [...document.querySelectorAll('.evday')];
    const second = days[1].closest('.plc'), top = () => m.getBoundingClientRect().top;
    m.scrollTop = second.offsetTop - m.offsetTop + 10;
    await new Promise(r => setTimeout(r, 350));
    const pos = el => el.getBoundingClientRect().top - top();
    const a = pos(days[1]), b = getComputedStyle(days[1]).position;
    m.scrollTop += 20;
    await new Promise(r => setTimeout(r, 100));
    return { a, b, c: pos(days[1]), h: document.getElementById('top').getBoundingClientRect().bottom - top() };
  });
  assert.equal(r.b, 'sticky');
  assert.ok(Math.abs(r.c - r.a) < 2, 'étiquette fixe au défilement');
  await page.close();
});

test('Coach : en paysage, les sections se rangent sur deux colonnes ; sur téléphone et au planning, non', async () => {
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  page.on('pageerror', e => { throw e; });
  await page.goto(JA + '/club/coach.html');
  await page.waitForFunction(() => typeof A !== 'undefined' && typeof coBento === 'function');
  await page.evaluate(() => { document.querySelector('.ram-splash')?.remove(); const e = coElGet(coStudents()[0]); e.achats = [{ id: 'hz', t: 'pack', ref: 'p1', d: TODAY, nom: 'Pack essai', n: 3, prix: 90, pay: { ech: [{ s: 0, m: 90, ok: '' }] } }]; A.tab({ t: 'asuivi' }); });
  await page.waitForSelector('.cobent .cocol .cosec');
  const c = await page.evaluate(() => [...document.querySelectorAll('.cobent .cocol')].map(x => [x.getBoundingClientRect().left, x.querySelectorAll('.cohd').length]));
  assert.ok(c[0][0] < c[1][0], 'côte à côte');
  assert.ok(c[0][1] >= 1 && c[1][1] >= 1, 'une section de chaque côté');
  await page.evaluate(() => A.tab({ t: 'planning' }));
  await page.waitForSelector('.covues');
  assert.equal(await page.locator('.cobent').count(), 0, 'le calendrier garde sa largeur');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.evaluate(() => A.tab({ t: 'asuivi' }));
  await page.waitForSelector('[data-a="coSuiviBO"]');
  assert.equal(await page.locator('.cobent').count(), 0, 'une colonne sur téléphone');
  await page.close();
});

test('Coach : un cycle reprend l’achat déjà noté du même produit au lieu d’en créer un second', async () => {
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  page.on('pageerror', e => { throw e; });
  await page.goto(JA + '/club/coach.html');
  await page.waitForFunction(() => typeof A !== 'undefined' && typeof coCycleAchats === 'function');
  const r = await page.evaluate(() => {
    document.querySelector('.ram-splash')?.remove();
    const g = coGroups('', true).find(x => coIsGrp(x) && coStu(x).length), k = coStu(g)[0], e = coElGet(k);
    OFFRES.packs = (OFFRES.packs || []).concat({ id: 'pz', formule: '', nom: 'Pack Z', seances: 10, prix: 270, ech: [1, 4, 7], echm: [90, 90, 90] });
    e.achats = [{ id: 'hold', t: 'pack', ref: 'pz', d: '2026-09-23', nom: 'Pack Z', n: 10, prix: 270, pay: { ech: [{ s: 0, m: 90, ok: '2026-09-23' }] } }];
    const c = { id: 'cz', offre: 'pack:pz', dates: ['2026-09-23'] };
    coCycleAchats(g, c);
    const proches = coEl(k).achats.filter(a => a.ref === 'pz'), loin = { id: 'cy', offre: 'pack:pz', dates: ['2027-03-01'] };
    const un = proches.length, lie = proches[0].cycle;
    coCycleAchats(g, loin);
    return { un, lie, cle: g.id + ':cz', deux: coEl(k).achats.filter(a => a.ref === 'pz').length };
  });
  assert.equal(r.un, 1, 'pas de doublon');
  assert.equal(r.lie, r.cle, 'l’achat existant est relié au cycle');
  assert.equal(r.deux, 2, 'un cycle bien plus tard reste un nouvel achat');
  await page.close();
});

test('Club : répondre à un commentaire, modifier sa recherche, glisser entre sections, profil, fiche partenaire', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(DEMO + '/index.html');
  await page.waitForFunction(() => typeof A !== 'undefined' && typeof playEdit === 'function', { polling: 300 });
  await page.evaluate(() => {
    document.querySelector('.ram-splash')?.remove();
    const k = Object.keys(M).find(x => x !== 'club' && x !== ME());
    window.kz = k;
    posts.unshift({ id: 'pz', by: ME(), t: 'x', kind: 'play', likes: 0, com: [{ by: k, x: 'Je suis dispo', t: 'x' }], play: { sport: 'Padel', date: fmtD(isoIn(3)), d: isoIn(3), time: '18 h', dur: '1 h 30', fmt: 'Double', lo: 3, hi: 5, places: 3, in: [k], wait: [] } });
    S.tab = 'home'; S.stack = []; render(); A.comments({ id: 'pz' });
  });
  // réponse : le menu la propose, le commentaire garde la citation
  await page.evaluate(() => A.mmenu({ ref: 'p:pz', i: '0' }));
  await page.click('.menu [data-a="reply"]');
  await page.waitForSelector('#com-form');
  assert.ok(await page.locator('#att .quote').isVisible(), 'citation au-dessus du champ');
  await page.fill('#com-input', 'Parfait');
  await page.click('#com-form .send');
  assert.equal(await page.evaluate(() => posts[0].com[1].rep.x), 'Je suis dispo');
  assert.ok(await page.locator('#com-list .quote').count(), 'la citation s’affiche');
  // modifier une recherche : formulaire rempli, inscrit conservé
  await page.evaluate(() => { closeSheet(); A.pmenu({ id: 'pz' }); });
  await page.click('.menu [data-a="pedit"]');
  await page.waitForSelector('#play-edit');
  assert.equal(await page.inputValue('#l-hi'), 'Niveau 5');
  await page.selectOption('#l-hi', 'Niveau 7');
  await page.selectOption('#a-h1', '20 h');
  await page.click('#play-edit .btn.full');
  assert.deepEqual(await page.evaluate(() => { const y = posts[0].play; return [y.hi, y.time, y.in.length]; }), [7, '20 h', 1]);
  // glisser : section suivante, précédente ; pas sur une page ouverte par-dessus
  const glisse = (de, a) => page.evaluate(([de, a]) => {
    const m = document.getElementById('main'), el = m.querySelector('.pad') || m;
    const t = x => new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 });
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t(de)], changedTouches: [t(de)] }));
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [t(a)] }));
    return S.tab;
  }, [de, a]);
  await page.evaluate(() => { S.tab = 'chans'; S.stack = []; closeSheet(); render(); });
  assert.equal(await glisse(300, 100), 'agenda');
  await page.evaluate(() => { S.tab = 'chans'; render(); });
  assert.equal(await glisse(100, 300), 'home');
  // profil : trophées au-dessus des onglets, chiffres qui mènent au palmarès, abonnés
  await page.evaluate(() => { S.tab = 'me'; S.stack = []; S.meTab = 'reglages'; render(); });
  assert.ok(await page.evaluate(() => document.querySelector('.stats + *').compareDocumentPosition(document.querySelector('.me-tabs')) & 4), 'avant les onglets');
  assert.equal(await page.locator('.stats svg').count(), 4);
  await page.click('.stats [data-a="palmGo"]');
  await page.waitForSelector('#palmares');
  assert.equal(await page.evaluate(() => S.meTab), 'jeu');
  assert.equal(await page.locator('.meshort .btn svg').count(), 2);
  await page.evaluate(k => { M[k].fo = [ME()]; const j = Object.keys(M).find(x => x !== 'club' && x !== ME() && x !== k); M[j].fo = [k]; A.folList({ id: k }); }, await page.evaluate(() => window.kz));
  await page.waitForSelector('#sheet .menu [data-a="member"]');
  // bandeau : le logo touché ouvre la fiche de ce partenaire, avec son site
  await page.evaluate(() => { closeSheet(); PARTNERS[0].url = 'https://exemple.fr'; S.tab = 'home'; S.stack = []; posts.unshift({ id: 'adz', by: 'club', t: 'x', kind: 'ad', likes: 0, com: [], partners: [PARTNERS[0].id], title: 'Nos partenaires' }); render(); });
  await page.evaluate(() => document.querySelector('.adi[data-v="partner"]').click());
  await page.waitForSelector('.pafiche');
  assert.equal(await page.getAttribute('.pafiche a.pbtn', 'href'), 'https://exemple.fr');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Club : le cadre de la carte des trophées reste dans chaque apparence, sur téléphone et ordinateur', async () => {
  for (const w of [360, 1280]) {
    const page = await browser.newPage({ viewport: { width: w, height: 800 } });
    await page.goto(DEMO + '/index.html');
    await page.waitForFunction(() => typeof A !== 'undefined' && typeof trophyCard === 'function', { polling: 300 });
    await page.evaluate(() => { document.querySelector('.ram-splash')?.remove(); S.tab = 'me'; S.stack = []; render(); });
    for (const st of ['epure', '', 'street']) {
      const r = await page.evaluate(st => { A.ustyle({ k: st }); const c = document.querySelector('.tcard'); return [1, 2, 3, 4, 5].map(n => { c.className = 'card tcard cf' + n; return getComputedStyle(c).boxShadow; }); }, st);
      ['200, 131, 75', '221, 227, 234', '242, 194, 48', '127, 227, 216', '111, 183, 255'].forEach((rgb, i) => assert.ok(r[i].includes(rgb), `largeur ${w}, style « ${st} », cadre ${i + 1} : ${r[i]}`));
    }
    await page.close();
  }
});

test('Club : la liste des commentaires ne défile pas sur le côté quand on glisse une bulle', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }), page = await ctx.newPage();
  await page.goto(DEMO + '/index.html');
  await page.waitForFunction(() => typeof A !== 'undefined', { polling: 300 });
  const r = await page.evaluate(async () => {
    document.querySelector('.ram-splash')?.remove();
    const k = Object.keys(M).find(x => x !== 'club' && x !== ME());
    posts.unshift({ id: 'pc', by: ME(), t: 'x', kind: 'annonce', title: 'x', body: 'x', likes: 0, com: [{ by: ME(), x: 'Quel match !!', t: 'x', re: { a: 1 } }, { by: k, x: 'Un score comme on aime', t: 'x' }] });
    S.tab = 'home'; S.stack = []; render(); A.comments({ id: 'pc' });
    const l = document.getElementById('com-list'), b = l.querySelector('.msg:not(.me) .bub'), t = x => new Touch({ identifier: 1, target: b, clientX: x, clientY: 500 });
    b.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t(100)], changedTouches: [t(100)] }));
    b.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [t(200)], changedTouches: [t(200)] }));
    const c = getComputedStyle(l), av = { ox: c.overflowX, y: c.overflowY, ta: getComputedStyle(b).touchAction, bulle: b.closest('.bubw').style.transform };
    l.scrollLeft = 40;
    return Object.assign(av, { w: l.getBoundingClientRect().width });
  });
  assert.equal(r.ox, 'hidden');
  assert.equal(r.y, 'auto', 'la liste défile toujours vers le bas');
  assert.equal(r.ta, 'pan-y');
  assert.ok(r.bulle.includes('translateX'), 'la bulle suit le doigt');
  assert.ok(r.w <= 390);
  await ctx.close();
});

test('Club : agenda du club réduit aux événements, sans vue Liste ; raccourcis de cours avec pictos', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(DEMO + '/index.html');
  await page.waitForFunction(() => typeof A !== 'undefined' && typeof CLUB_CATS !== 'undefined', { polling: 300 });
  const r = await page.evaluate(() => {
    document.querySelector('.ram-splash')?.remove();
    S.plan.scope = 'club'; S.plan.mode = 'list'; S.tab = 'agenda'; S.stack = []; render();
    const cats = new Set();
    for (let n = 0; n < 60; n++) planItems(isoIn(n)).forEach(i => cats.add(i.cat));
    return { cats: [...cats], mode: S.plan.mode, filtres: planCatsOf().map(x => x[0]) };
  });
  assert.equal(r.mode, 'events', 'une ancienne vue Liste retombe sur Événements');
  assert.deepEqual(r.filtres, ['ani', 'tour', 'eq']);
  assert.deepEqual(r.cats.filter(c => !['ani', 'tour', 'eq'].includes(c)), []);
  await page.evaluate(() => { const g = GROUPS.find(x => x.type === 'train' && !x.once); document.getElementById('main').insertAdjacentHTML('afterbegin', sessCard(g, TODAY, null, 1)); });
  assert.equal(await page.locator('.ecact svg').count(), 4);
  assert.ok(await page.locator('.ecact.del [d*="M4 7h16"]').count(), 'une corbeille pour supprimer');
  assert.ok(await page.evaluate(() => { const s = document.querySelector('.ecact svg').getBoundingClientRect().height, f = parseFloat(getComputedStyle(document.querySelector('.ecact')).fontSize); return s > f; }), 'picto plus gros que le texte');
  assert.ok(await page.evaluate(() => { const e = document.querySelector('.ecact.del'); return getComputedStyle(e).backgroundColor !== getComputedStyle(document.querySelector('.ecact:not(.go):not(.warn):not(.del)')).backgroundColor; }), 'code couleur');
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Club : revenir sur le mur par le glissement retrouve toute la page, à la même place', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(DEMO + '/index.html');
  await page.waitForFunction(() => typeof A !== 'undefined' && typeof repeint === 'function', { polling: 300 });
  const r = await page.evaluate(async () => {
    document.querySelector('.ram-splash')?.remove();
    S.tab = 'home'; S.stack = []; render();
    const m = document.getElementById('main'), attend = t => new Promise(x => setTimeout(x, t));
    await attend(100);
    m.scrollTop = 500;
    await attend(50);
    const h0 = m.scrollHeight, y0 = m.scrollTop;
    A.open({ v: 'post', id: posts.find(p => p.kind === 'event' || p.title).id });
    await attend(400);
    const el = m, t = x => new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 });
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t(10)], changedTouches: [t(10)] }));
    el.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [t(300)], changedTouches: [t(300)] }));
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [t(300)] }));
    await attend(700);
    const vus = [...m.querySelectorAll('.post')].map(p => p.getBoundingClientRect().height);
    return { stack: S.stack.length, h0, h1: m.scrollHeight, y0, y1: m.scrollTop, tr: m.style.transform, cl: m.className, plats: vus.filter(h => h < 10).length };
  });
  assert.equal(r.stack, 0, 'retour effectué');
  assert.equal(r.h1, r.h0, 'la page garde toute sa hauteur');
  assert.equal(r.y1, r.y0, 'à la même place');
  assert.equal(r.tr, '', 'plus de décalage ni de calque restant');
  assert.ok(!/swipe|pg-|sg-/.test(r.cl), r.cl);
  assert.equal(r.plats, 0);
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Club : collectif hors du mur et dans sa section, promu ; modifier un collectif et un résultat', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(DEMO + '/index.html');
  await page.waitForFunction(() => typeof A !== 'undefined' && typeof nvEdit === 'function', { polling: 300 });
  await page.evaluate(() => { document.querySelector('.ram-splash')?.remove(); S.role = 'coach'; S.tab = 'home'; S.stack = []; render(); A.nvNew({ m: 'cours' }); });
  await page.waitForSelector('#nv-form');
  await page.fill('#nv-theme', 'Jeu au filet');
  await page.selectOption('#a-h1', '19 h');
  await page.click('#nv-form > button:not([type=button])');
  await page.waitForFunction(() => view().v === 'post');
  const pid = await page.evaluate(() => view().id);
  assert.equal(await page.evaluate(id => posts.find(p => p.id === id).mur, pid), false, 'hors du mur');
  assert.ok(await page.locator('[data-a="promo"]').count(), 'bouton Promouvoir');
  assert.ok(!(await page.evaluate(id => { S.stack = []; S.tab = 'home'; render(); return !!document.querySelector('[data-a="pmenu"][data-id="' + id + '"]'); }, pid)), 'absent du mur');
  await page.evaluate(() => { S.tab = 'ecole'; S.ecTab = 'coll'; render(); });
  assert.ok(await page.locator('[data-a="pmenu"][data-id="' + pid + '"]').count(), 'dans la section Collectifs');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'rien ne déborde');
  // modifier : formulaire rempli, inscrits gardés sur la date déplacée
  await page.evaluate(id => { const p = posts.find(x => x.id === id), k = Object.keys(M).find(x => x !== 'club' && x !== ME()); p.nv.ins = { [p.nv.dates[0] + '|t1']: [k] }; A.pmenu({ id }); }, pid);
  await page.click('.menu [data-a="pedit"]');
  await page.waitForSelector('#nv-form');
  assert.equal(await page.inputValue('#nv-theme'), 'Jeu au filet');
  assert.equal(await page.inputValue('#a-h1'), '19 h');
  const d2 = await page.evaluate(() => isoIn(21));
  await page.fill('#a-d1', d2);
  await page.selectOption('#a-h1', '20 h');
  await page.click('#nv-form > button:not([type=button])');
  await page.waitForFunction(() => !document.querySelector('#nv-form'));
  const nv = await page.evaluate(id => posts.find(x => x.id === id).nv, pid);
  assert.equal(nv.time, '20 h');
  assert.deepEqual(nv.dates, [d2]);
  assert.equal(nv.ins[d2 + '|t1'].length, 1, 'l’inscrit suit la date');
  // promouvoir
  await page.evaluate(id => { S.stack = [{ v: 'post', id }]; render(); }, pid);
  await page.click('[data-a="promo"]');
  await page.evaluate(() => { S.stack = []; S.tab = 'home'; render(); });
  assert.ok(await page.locator('[data-a="pmenu"][data-id="' + pid + '"]').count(), 'sur le mur');
  // résultat de tennis
  const rid = await page.evaluate(() => { const r = { w: 1, opp: 'Paul', or: '15/2', sc: '6-3 6-4', ctx: 'Tournoi · Open', perf: false, fin: false }; M[ME()].res.unshift(r); posts.unshift({ id: 'prz', by: ME(), t: 'x', kind: 'perf', res: r, likes: 0, com: [] }); render(); A.pmenu({ id: 'prz' }); return 'prz'; });
  await page.click('.menu [data-a="pedit"]');
  await page.waitForSelector('#res-form');
  assert.equal(await page.inputValue('#r-opp'), 'Paul');
  assert.equal(await page.inputValue('#s2b'), '4');
  assert.equal(await page.inputValue('#r-name'), 'Open');
  await page.fill('#r-opp', 'Paul Martin');
  const n0 = await page.evaluate(() => M[ME()].res.length);
  await page.click('#res-form > button:not([type=button])');
  await page.waitForFunction(() => !document.querySelector('#res-form'));
  assert.deepEqual(await page.evaluate(id => [posts.find(x => x.id === id).res.opp, M[ME()].res[0].opp, M[ME()].res.length], rid), ['Paul Martin', 'Paul Martin', n0], 'corrigé sans doublon');
  // résultat de padel
  await page.evaluate(() => { const r = { place: '1er', cat: 'P100', pub: 'Adultes', age: '', d: isoIn(-3), club: 'Tulle', pid: null, ext: 'Julien' }; M[ME()].pres = [r]; posts.unshift({ id: 'ppz', by: ME(), t: 'x', kind: 'padel', sport: 'Padel', pres: r, likes: 0, com: [] }); render(); A.pmenu({ id: 'ppz' }); });
  await page.click('.menu [data-a="pedit"]');
  await page.waitForSelector('#pres-form');
  assert.equal(await page.inputValue('#pr-ext'), 'Julien');
  await page.selectOption('#pr-place', '2e');
  await page.click('#pres-form > button:not([type=button])');
  await page.waitForFunction(() => !document.querySelector('#pres-form'));
  assert.deepEqual(await page.evaluate(() => [posts[0].pres.place, M[ME()].pres.length]), ['2e', 1]);
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('JA : en paysage, les pages passent sur plusieurs colonnes ; sur téléphone, une seule', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const { page, errors } = await openPage(ctx, JA + '/demo');
  const colonnes = sel => page.evaluate(s => getComputedStyle(document.querySelector(s)).gridTemplateColumns.split(' ').length, sel);
  const large = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  for (const t of ['direct', 'diffusion']) {
    await page.locator('[data-tab="' + t + '"]').first().click();
    await page.waitForTimeout(250);
    assert.equal(await colonnes('#tab-' + t + ' .grid2'), 2, t);
    assert.ok(await large(), t + ' sans débordement');
    assert.ok(await page.evaluate(() => { const m = document.querySelector('main'); return m.scrollWidth <= m.clientWidth + 1; }), t + ' : rien ne dépasse');
  }
  const id = new URL(page.url()).pathname.split('/')[2];
  await page.goto(JA + '/joueurs');
  await page.waitForSelector('.g-2');
  assert.equal(await colonnes('.g-2'), 2, 'joueurs');
  await page.goto(JA + '/statistiques');
  await page.waitForSelector('.st-grid');
  assert.equal(await colonnes('.st-grid'), 3, 'statistiques');
  assert.ok(await large());
  await page.setViewportSize({ width: 390, height: 800 });
  assert.equal(await colonnes('.st-grid'), 1, 'statistiques sur téléphone');
  await page.goto(JA + '/t/' + id);
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('[data-tab="direct"]').click());
  await page.waitForTimeout(250);
  assert.equal(await colonnes('#tab-direct .grid2'), 1, 'éditeur sur téléphone');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('JA : le bouton pour activer les notifications, et le service worker les reçoit', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const { page, errors } = await openPage(ctx, JA + '/demo');
  await page.goto(JA + '/profil');
  await page.waitForSelector('#notifCard');
  // sans autorisation possible (navigateur de test), la carte explique pourquoi ; sinon, le bouton est là
  const refus = await page.evaluate(() => !('Notification' in window) || Notification.permission === 'denied');
  if (refus) assert.match(await page.locator('#notifTxt').innerText(), /bloquées|ne gère pas|écran d'accueil/);
  else assert.ok(await page.locator('#notifOn').isVisible(), 'bouton Activer');
  const sw = await page.evaluate(() => fetch('/sw.js').then(r => r.text()));
  assert.ok(sw.includes("addEventListener('push'") && sw.includes('notificationclick'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Coach : l’objectif de l’élève sur la carte et la séance ; le panneau garde ce que le serveur a reçu, sans doublon', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(JA + '/club/coach.html');
  await page.waitForFunction(() => typeof A !== 'undefined' && typeof coSesCard === 'function' && typeof window.ramNotifsMerge === 'function', { polling: 300 });
  const id = await page.evaluate(() => {
    document.querySelector('.ram-splash')?.remove();
    // la démo suit le vrai jour : on se place sur le prochain jour où l'enseignant a cours
    const x = coSessions(TODAY, isoIn(6), 'me', 1)[0];
    TODAY = x.d;
    x.g.goal = 'Améliorer ma volée';
    S.tab = 'today'; S.stack = []; render();
    A.tab({ t: 'today' });
    return sesKey(x.g, x.d);
  });
  await page.waitForSelector('.evl.cogoal');
  assert.match(await page.locator('.evl.cogoal').first().innerText(), /Objectif : Améliorer ma volée/);
  await page.evaluate(id => A.open({ v: 'seance', id }), id);
  await page.waitForSelector('.cogoalc');
  assert.match(await page.locator('.cogoalc').innerText(), /Améliorer ma volée/);
  const r = await page.evaluate(() => {
    const it = { id: 'x1', at: Date.now(), title: 'Club', body: 'Nouvelle réservation : Cours', url: '#/seance/g1.2031-01-01' };
    const a = window.ramNotifsMerge([it]), b = window.ramNotifsMerge([it]);
    // déjà notée par l'appareil, appli ouverte
    NOTIFS.unshift({ by: 'club', txt: 'x', n: 1, at: Date.now(), go: { v: 'seance', id: 'g2.2031-01-02' } });
    const c = window.ramNotifsMerge([{ id: 'x2', at: Date.now(), title: 'Club', body: 'y', url: '#/seance/g2.2031-01-02' }]);
    return { a, b, c, vu: NOTIFS.filter(n => n.id === 'srv-x1').length, coach: NOTIFS.find(n => n.id === 'srv-x1').coach, go: NOTIFS.find(n => n.id === 'srv-x1').go };
  });
  assert.deepEqual([r.a, r.b, r.c, r.vu, r.coach], [1, 0, 0, 1, 1]);
  assert.deepEqual(r.go, { v: 'seance', id: 'g1.2031-01-01' });
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Club : l’écran de réservation relit les créneaux : une plage annulée par l’enseignant redevient disponible', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } }), page = await ctx.newPage();
  await page.goto(DEMO + '/index.html');
  await page.waitForFunction(() => typeof resaLoad === 'function', { polling: 300 });
  const r = await page.evaluate(async () => {
    const appels = [], vrai = window.fetch;
    window.fetch = async u => { appels.push(String(u)); return { ok: true, json: async () => ({ ouvert: true, n: appels.length }) }; };
    window.RAM = window.RAM || { club: 'C' };
    const c1 = resaLoad('k', '2031-01-06');
    await new Promise(x => setTimeout(x, 20));
    const n1 = appels.length, frais = resaLoad('k', '2031-01-06');
    await new Promise(x => setTimeout(x, 20));
    const n2 = appels.length;
    frais.lu = 1; // lu il y a longtemps
    const vieux = resaLoad('k', '2031-01-06');
    await new Promise(x => setTimeout(x, 20));
    window.fetch = vrai;
    return { c1: !!c1.wait, n1, n2, n3: appels.length, gardé: !!vieux.ouvert };
  });
  assert.deepEqual(r, { c1: true, n1: 1, n2: 1, n3: 2, gardé: true }, 'relu une fois périmé, l’affichage restant en attendant');
  await ctx.close();
});

test('Club : profil en section Club, classement en trois choix, agenda sans épingle sur grand écran, pictos d’annulation', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(DEMO + '/index.html');
  await page.waitForFunction(() => typeof A !== 'undefined' && typeof A.rankMenu === 'function', { polling: 300 });
  await page.evaluate(() => { document.querySelector('.ram-splash')?.remove(); S.tab = 'me'; S.stack = []; S.meTab = 'jeu'; render(); });
  await page.waitForSelector('.meclub');
  assert.ok(await page.evaluate(() => { const c = document.querySelector('.meclub'); return !!c.querySelector('.tcard') && (document.querySelector('.stats').compareDocumentPosition(c) & 4) && (c.compareDocumentPosition(document.querySelector('.me-tabs')) & 4); }), 'entre les statistiques et les onglets, avec les trophées');
  assert.ok(await page.locator('.meclub [data-a="admin"] svg').count(), 'gestion en pictogramme');
  assert.equal(await page.locator('.phero ~ .btn[data-a="admin"]').count(), 0, 'plus de gros bouton');
  assert.equal(await page.locator('.meshort .btn').count(), 2, 'deux boutons');
  assert.equal(await page.locator('.meshort [data-k="play"]').count(), 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'rien ne déborde à 360 px');
  await page.click('[data-a="rankMenu"]');
  assert.equal(await page.locator('.menu [data-a="rank"]').count(), 3);
  // changer le niveau ne touche pas le classement, et le titre annonce le bon
  const r = await page.evaluate(() => { const me = M[ME()], pad = me.pad; A.rank({ k: 'niveau' }); const sel = document.getElementById('r-pl'); sel.value = sel.options[sel.selectedIndex === 3 ? 4 : 3].value; const pad2 = !!document.getElementById('r-pad'); document.getElementById('rank-form').requestSubmit(); return { pad, apres: me.pad, pad2, titre: posts[0].title, corps: posts[0].body }; });
  assert.equal(r.pad2, false, 'pas de champ classement');
  assert.equal(r.apres, r.pad);
  assert.match(r.titre, /^Nouveau niveau de padel <em>pour /);
  assert.match(r.corps, /→ niveau/);
  assert.ok(await page.evaluate(() => !!I.ban && !!I.undo && !!I.swap && !!I.star), 'pictos présents dans le Club');
  // agenda sur grand écran : la carte ne défile pas sur elle-même, le jour n'est pas épinglé
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.evaluate(() => { S.tab = 'agenda'; S.stack = []; S.plan.scope = 'me'; S.plan.mode = 'events'; render(); });
  await page.waitForSelector('.plk .evday');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.evday')).position), 'static');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.plk')).maxHeight), 'none');
  await page.setViewportSize({ width: 360, height: 780 });
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.evday')).position), 'sticky', 'épinglé sur téléphone');
  assert.deepEqual(errs, []);
  await ctx.close();
});


test('Club : section Club avec de vrais comptes, plusieurs clubs, club principal, code du club en bas', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } }), page = await ctx.newPage(), errs = [], t = Date.now();
  page.on('pageerror', e => errs.push(e.message));
  const post = async (url, data) => (await ctx.request.post(JA + url, { data })).json();
  await post('/api/auth/signup', { email: `multi-${t}@exemple.test`, password: 'essai-' + t, first: 'Nina', last: 'Multi' });
  const a = await post('/api/ram/clubs', { name: 'Club Alpha' }), b = await post('/api/ram/clubs', { name: 'Club Beta' });
  await page.goto(JA + '/club/index.html');
  await page.waitForFunction(() => window.RAM && RAM.live, null, { timeout: 30000, polling: 300 });
  const principal = (await (await ctx.request.get(JA + '/api/ram/clubs')).json()).clubs.find(c => c.main);
  const autre = [a, b].find(c => !principal || c.id !== principal.id);
  await page.evaluate(id => A.ramSwitch({ id }), autre.id);
  await page.waitForFunction(id => RAM.club === id && RAM.live, autre.id, { timeout: 30000, polling: 300 });
  // (le changement de club se termine en revenant à l'accueil : on rouvre le profil tant qu'il n'est pas affiché ;
  //  et c'est bien le club choisi qui reste ouvert, même si une synchronisation de l'ancien club était en route)
  await page.waitForFunction(id => { if (!document.querySelector('.meclub')) { document.querySelector('.ram-splash')?.remove(); S.tab = 'me'; S.stack = []; S.meTab = 'jeu'; render(); } return !!document.querySelector('.meclub') && RAM.code && RAM.club === id; }, autre.id, { timeout: 30000, polling: 500 });
  assert.match(await page.locator('.meclubh .h3').innerText(), new RegExp(autre.name || 'Club'));
  assert.equal(await page.locator('.meclub [data-a="ramClubs"] svg').count(), 1, 'changer de club, en pictogramme');
  assert.equal(await page.locator('.meclub [data-a="admin"] svg').count(), 1, 'gestion, en pictogramme');
  assert.equal(await page.locator('.meclubh .tag').count(), 0, 'pas encore principal');
  await page.click('.meclub [data-a="ramMain"]');
  await page.waitForSelector('.meclubh .tag', { timeout: 20000 });
  assert.match(await page.locator('.meclubh .tag').innerText(), /Club principal/i);
  assert.equal(await page.locator('.meclub [data-a="ramMain"]').count(), 0, 'le bouton disparaît');
  assert.equal(await page.locator('#sheet.open, #sheet .menu').count(), 0, 'pas de fenêtre ouverte en plus');
  // le code du club : plus en haut, juste au-dessus de la déconnexion
  await page.evaluate(() => { S.meTab = 'reglages'; render(); });
  await page.waitForSelector('.logout');
  assert.ok(await page.evaluate(() => { const l = document.querySelector('.logout'), c = [...document.querySelectorAll('.card')].find(x => /Code du club/.test(x.textContent)); return c && c.nextElementSibling === l && !!(document.querySelector('.phero').compareDocumentPosition(c) & 4); }), 'code du club au-dessus de la déconnexion');
  assert.deepEqual(errs, []);
  await ctx.close();
});

/* ---------- Notifications : essai, guide iPhone, heures calmes, suivi du bureau ---------- */
const ouvrirReglages = page => page.evaluate(() => { S.tab = 'me'; S.stack = []; S.meTab = 'reglages'; render(); });

test('Club : réglages des notifications, bouton d’essai et heures calmes (22 h à 7 h par défaut), lisibles sur 360 px', async () => {
  const ctx = await phone();
  const { page, errors } = await openPage(ctx, DEMO + '/index.html');
  await page.evaluate(() => document.getElementById('sheet')?.remove());
  await ouvrirReglages(page);
  await page.waitForSelector('[data-a="pushTest"]');
  assert.match(await page.locator('[data-a="pushTest"]').innerText(), /M'envoyer une notification d'essai/);
  assert.equal(await page.locator('[data-a="calmeOn"]').getAttribute('aria-checked'), 'true');
  assert.equal(await page.locator('#calme-de').inputValue(), '22');
  assert.equal(await page.locator('#calme-a').inputValue(), '7');
  assert.match(await page.locator('.calme-h').innerText(), /heure de Paris/);
  // tout texte du réglage fait au moins 12 px, rien ne déborde
  const petits = await page.evaluate(() => [...document.querySelectorAll('.calme-h, .calme-h *, [data-a="pushTest"]')].filter(e => parseFloat(getComputedStyle(e).fontSize) < 12).length);
  assert.equal(petits, 0);
  assert.ok(await overflow(page) <= 1, 'la page déborde');
  // régler : de 23 h à 6 h, gardé sur le téléphone ; couper : les heures disparaissent
  await page.selectOption('#calme-de', '23');
  await page.selectOption('#calme-a', '6');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('club-calme'))), { on: true, de: 23, a: 6 });
  await page.click('[data-a="calmeOn"]');
  await page.waitForFunction(() => !document.getElementById('calme-de'));
  assert.equal(await page.locator('[data-a="calmeOn"]').getAttribute('aria-checked'), 'false');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('club-calme')).on), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Club : essai sur un iPhone sans l’appli installée, guide pas à pas en pictos ; iOS trop ancien, la mise à jour d’abord', async () => {
  for (const [ios, ancien] of [['17_4', false], ['15_6', true]]) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true,
      userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS ${ios} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${ios.split('_')[0]}.0 Mobile/15E148 Safari/604.1` });
    const { page, errors } = await openPage(ctx, DEMO + '/index.html');
    await page.evaluate(() => { localStorage.setItem('club-install-later', '1'); document.getElementById('sheet')?.remove(); });
    await ouvrirReglages(page);
    await page.click('[data-a="pushTest"]');
    await page.waitForSelector('#sheet .ig-steps');
    const etapes = page.locator('#sheet .ig-steps li');
    assert.equal(await etapes.count(), ancien ? 5 : 4);
    assert.equal(await page.locator('#sheet .ig-steps li .ig-ic svg').count(), await etapes.count(), 'chaque étape a son picto SVG');
    const txt = await page.locator('#sheet .ig-steps').innerText();
    assert.match(txt, /Partager/);
    assert.match(txt, /Sur l'écran d'accueil/);
    assert.match(txt, /notification d'essai/);
    if (ancien) assert.match(txt, /Mise à jour logicielle.*iOS 15\.6.*16\.4/s);
    else assert.doesNotMatch(txt, /Mise à jour logicielle/);
    assert.doesNotMatch(txt, /\p{Extended_Pictographic}/u, 'pas d’emoji');
    assert.ok(await overflow(page) <= 1, 'le guide déborde');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('Club : le bureau voit combien d’adhérents reçoivent les notifications (démo, puis vrai compte)', async () => {
  const ctx = await phone();
  const { page, errors } = await openPage(ctx, DEMO + '/index.html');
  await page.evaluate(() => { document.getElementById('sheet')?.remove(); S.role = 'admin'; S.stack = [{ v: 'admin' }]; render(); });
  await page.waitForSelector('#adm-push');
  assert.match(await page.locator('#adm-push').innerText(), /\d+ adhérents reçoivent les notifications sur \d+/);
  assert.deepEqual(errors, []);
  await ctx.close();

  // vrai club : le compte qui le crée est au bureau ; personne n'a encore de téléphone abonné
  const c2 = await browser.newContext({ viewport: { width: 360, height: 780 } }), p2 = await c2.newPage(), errs = [], t = Date.now();
  p2.on('pageerror', e => errs.push(e.message));
  const post = async (url, data) => (await c2.request.post(JA + url, { data })).json();
  await post('/api/auth/signup', { email: `suivi-${t}@exemple.test`, password: 'essai-' + t, first: 'Bea', last: 'Bureau' });
  await post('/api/ram/clubs', { name: 'Club Suivi' });
  await p2.goto(JA + '/club/index.html');
  await p2.waitForFunction(() => window.RAM && RAM.live, null, { timeout: 15000, polling: 300 });
  await p2.waitForFunction(() => { if (!document.getElementById('adm-push')) { document.querySelector('.ram-splash')?.remove(); S.stack = [{ v: 'admin' }]; render(); } const e = document.getElementById('adm-push'); return e && /sur \d/.test(e.textContent); }, null, { timeout: 15000, polling: 500 });
  assert.match(await p2.locator('#adm-push').innerText(), /0 adhérent reçoit les notifications sur 1/);
  assert.deepEqual(errs, []);
  await c2.close();
});

test('Club : classement « Cette saison / Depuis toujours », nouveaux trophées, ne pas apparaître dans le classement', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(DEMO + '/index.html');
  await page.waitForFunction(() => typeof A !== 'undefined' && typeof A.boardMode === 'function' && typeof A.noRank === 'function', { polling: 300 });
  await page.evaluate(() => { document.querySelector('.ram-splash')?.remove(); S.tab = 'me'; S.stack = [{ v: 'trophies' }]; render(); });
  await page.waitForSelector('.board-mode');
  // deux choix, « Cette saison » par défaut
  assert.deepEqual(await page.locator('.board-mode .chip').allInnerTexts(), ['Cette saison', 'Depuis toujours']);
  assert.equal(await page.locator('.board-mode [data-k="saison"]').getAttribute('aria-pressed'), 'true');
  const pts = () => page.evaluate(() => [...document.querySelectorAll('.tboard .item')].map(b => [b.dataset.id, parseInt(b.querySelector(':scope > b:last-child').textContent, 10)]));
  const saison = await pts();
  assert.ok(saison.length >= 3, 'des adhérents au classement');
  await page.click('.board-mode [data-k="toujours"]');
  assert.equal(await page.locator('.board-mode [data-k="toujours"]').getAttribute('aria-pressed'), 'true');
  const toujours = await pts();
  // depuis toujours, l'historique des saisons passées s'ajoute : chacun a au moins autant de points
  const s = Object.fromEntries(saison);
  toujours.forEach(([k, p]) => { if (k in s) assert.ok(p >= s[k], `${k} : ${p} >= ${s[k]}`); });
  assert.notDeepEqual(toujours, saison, 'les deux classements diffèrent');
  // trophées du jeu réel dans la liste
  const txt = await page.textContent('#main');
  ['Toujours sur le court', 'Compétiteur', 'Habitué des tournois'].forEach(n => assert.ok(txt.includes(n), n));
  assert.match(txt, /Par jour, comptent au plus 20 messages/);
  // textes lisibles : 12 px au moins
  const tailles = await page.evaluate(() => [...document.querySelectorAll('.board-mode .chip, .tboard .item .small, .tboard .item b, .board-mode + p')].map(e => parseFloat(getComputedStyle(e).fontSize)));
  assert.ok(tailles.length && tailles.every(t => t >= 12), 'tailles : ' + tailles.join(', '));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'rien ne déborde à 360 px');
  // le profil, onglet Mes infos : l'interrupteur, puis je disparais du classement en gardant mes trophées
  const avant = await page.evaluate(() => gotList(ME()).length);
  await page.evaluate(() => { S.stack = []; S.meTab = 'infos'; render(); });
  const tg = page.locator('[data-a="noRank"]');
  assert.equal(await tg.getAttribute('aria-checked'), 'false');
  await tg.click();
  assert.equal(await page.locator('[data-a="noRank"]').getAttribute('aria-checked'), 'true');
  assert.equal(await page.evaluate(() => M[ME()].noRank), true);
  await page.evaluate(() => { S.stack = [{ v: 'trophies' }]; render(); });
  await page.waitForSelector('.board-mode');
  assert.ok(!(await pts()).some(([k]) => k === 'me'), 'absent du classement');
  assert.match(await page.textContent('#main'), /Tu n'apparais pas dans le classement/);
  assert.equal(await page.evaluate(() => gotList(ME()).length), avant, 'trophées gardés');
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Club servi : le serveur envoie les classements de la saison et retire celui qui ne veut pas y apparaître', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } }), page = await ctx.newPage(), errs = [], t = Date.now();
  page.on('pageerror', e => errs.push(e.message));
  const post = async (url, data) => (await ctx.request.post(JA + url, { data })).json();
  await post('/api/auth/signup', { email: `classement-${t}@exemple.test`, password: 'essai-' + t, first: 'Zoé', last: 'Classement' });
  const club = await post('/api/ram/clubs', { name: 'Club Saison' });
  await page.goto(JA + '/club/index.html');
  await page.waitForFunction(() => window.RAM && RAM.live && RAM.board, null, { timeout: 15000, polling: 300 });
  if (club && club.id) {
    await page.evaluate(id => (RAM.club === id ? null : A.ramSwitch({ id })), club.id);
    await page.waitForFunction(id => RAM.club === id && RAM.live && RAM.board, club.id, { timeout: 15000, polling: 300 });
  }
  const b = await page.evaluate(() => ({ season: RAM.board.season, moi: RAM.key in RAM.board.saison && RAM.key in RAM.board.toujours, profil: (RAM.profils || []).includes(RAM.key) }));
  assert.match(b.season, /^\d{4}-\d{4}$/);
  assert.ok(b.moi, 'je suis dans les deux classements');
  assert.equal(b.profil, false, 'profil pas encore complet');
  await page.waitForFunction(() => { if (!document.querySelector('[data-a="noRank"]')) { document.querySelector('.ram-splash')?.remove(); S.tab = 'me'; S.stack = []; S.meTab = 'infos'; render(); } return !!document.querySelector('[data-a="noRank"]'); }, null, { timeout: 15000, polling: 500 });
  await page.click('[data-a="noRank"]');
  // le choix part au serveur, qui renvoie des classements sans moi
  await page.waitForFunction(() => RAM.board && !(RAM.key in RAM.board.toujours) && !(RAM.key in RAM.board.saison), null, { timeout: 20000, polling: 500 });
  assert.deepEqual(errs, []);
  await ctx.close();
});

/* ---------- lisibilité : aucun texte sous 12 px, dans les trois applis ---------- */
// textes visibles plus petits que 12 px (un élément caché, un texte à 0 px ou réservé aux lecteurs d'écran ne compte pas)
const petitsTextes = page => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!(el instanceof HTMLElement) && !(el instanceof SVGTextElement)) continue;
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el), fs = parseFloat(cs.fontSize);
    if (!(fs > 0) || fs >= 11.95 || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || !el.getClientRects().length) continue;
    // texte d'un graphique mis à l'échelle : seule compte la taille réellement affichée
    if (el instanceof SVGTextElement && r.height >= 11) continue;
    const id = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : el.tagName.toLowerCase();
    out.push(`${fs}px ${id} « ${el.textContent.trim().slice(0, 24)} »`);
  }
  return [...new Set(out)].slice(0, 15);
});

test('Lisibilité : aucun texte sous 12 px dans /RAM Club, /RAM Coach et /RAM JA (téléphone et ordinateur)', async () => {
  const trop = [];
  for (const [w, h] of [[360, 780], [1280, 860]]) {
    const mob = w < 500;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob });
    const page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push(e.message));
    const note = async nom => { const p = await petitsTextes(page); if (p.length) trop.push(`${nom} (${w} px) : ${p.join(' ; ')}`); };
    // /RAM Club : chaque onglet, puis la page des trophées
    await page.goto(DEMO + '/index.html');
    await page.waitForFunction(() => typeof A !== 'undefined' && typeof trophyCard === 'function', null, { polling: 300 });
    for (const t of ['home', 'chans', 'agenda', 'ecole', 'club', 'me']) {
      await page.evaluate(t => { document.querySelector('.ram-splash')?.remove(); S.stack = []; S.tab = t; render(); }, t);
      await page.waitForTimeout(250);
      await note('Club ' + t);
    }
    await page.evaluate(() => { S.tab = 'me'; S.stack = []; render(); document.querySelector('.tcard')?.click(); });
    await page.waitForTimeout(300);
    await note('Club trophées');
    // /RAM Coach : chaque onglet du menu (planning compris), et les paiements
    await page.goto(JA + '/club/coach.html');
    await page.waitForFunction(() => typeof coGoogleSheet === 'function', null, { timeout: 8000 });
    for (const t of await page.evaluate(() => TABBAR.map(x => x[0]))) {
      await page.evaluate(t => { document.querySelectorAll('.ram-splash').forEach(x => x.remove()); S.stack = []; A.tab({ t }); }, t);
      await page.waitForTimeout(250);
      await note('Coach ' + t);
    }
    await page.evaluate(() => { S.dashTab = 'pay'; S.stack = []; A.tab({ t: 'dash' }); });
    await page.waitForTimeout(250);
    await note('Coach paiements');
    // /RAM JA : chaque section de l'éditeur, puis les pages du compte
    await page.goto(JA + '/demo');
    await page.waitForSelector('#nav [data-tab]', { state: 'attached' });
    for (const t of ['tournoi', 'inscriptions', 'tirage', 'tableaux', 'programmation', 'direct', 'diffusion']) {
      await page.evaluate(t => document.querySelector(`#nav [data-tab="${t}"]`).click(), t);
      await page.waitForTimeout(250);
      await note('JA ' + t);
    }
    for (const p of ['/dashboard', '/app', '/calendrier', '/joueurs', '/statistiques', '/profil']) {
      await page.goto(JA + p);
      await page.waitForTimeout(500);
      await note('JA ' + p);
    }
    assert.deepEqual(errs, [], `erreurs JavaScript (${w} px)`);
    await ctx.close();
  }
  assert.deepEqual(trop, [], 'des textes font moins de 12 px');
});

/* ---------- Agenda du club : promouvoir des événements sur le mur ; page d'un trophée : la jauge des paliers ---------- */
test('Club : le bureau promeut plusieurs événements de l’agenda sur le mur ; un adhérent n’a pas le bouton ; jauge des paliers d’un trophée', async () => {
  const ctx = await phone();
  const { page, errors } = await openPage(ctx, DEMO + '/index.html');
  await page.evaluate(() => { document.querySelector('.ram-splash')?.remove(); document.querySelectorAll('.back').forEach(b => b.remove()); S.tab = 'me'; S.stack = [{ v: 'troph', id: ME() + '|like' }]; render(); });
  await page.waitForSelector('.fpath .fp-st');
  assert.equal(await page.locator('.fpath .fp-st').count(), 5, 'départ et 4 paliers');
  assert.match(await page.textContent('.tp-now'), /encore \d+ pour le palier/);
  await page.evaluate(() => { S.role = 'admin'; S.tab = 'agenda'; S.stack = []; S.plan.scope = 'club'; S.plan.mode = 'events'; render(); });
  await page.waitForSelector('.promo-more');
  await page.locator('.promo-more').first().click();
  await page.click('[data-a="promoSelStart"]');
  await page.locator('.promo-w.sel:not(.on) [data-a="promoPick"]').first().click();
  assert.match(await page.textContent('.promo-bar'), /2 événements/);
  await page.click('[data-a="promoNext"]');
  await page.fill('#promo-m', 'Venez nombreux');
  await page.click('[data-a="promoGo"]');
  await page.waitForFunction(() => posts.some(p => p.kind === 'promo'));
  assert.equal(await page.evaluate(() => posts.find(p => p.kind === 'promo').ev.length), 2);
  assert.equal(await page.locator('.promo-l .card').count(), 2, 'les deux événements sur le mur');
  assert.ok(await overflow(page) <= 1, 'rien ne déborde');
  await page.evaluate(() => { S.role = 'mem'; S.tab = 'agenda'; render(); });
  assert.equal(await page.locator('.promo-more').count(), 0, 'pas pour un adhérent');
  assert.deepEqual(errors, []);
  await ctx.close();
});
