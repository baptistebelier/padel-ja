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
  // nouvelle organisation (14/11/2026) : 5 rubriques en bas, « Moi » derrière l'avatar de l'en-tête
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#tabs button[data-t]')].map(b => b.dataset.t)), ['home', 'agenda', 'jouer', 'chans', 'club'], 'les 5 rubriques');
  assert.equal(await page.textContent('#tabs button[data-t="chans"]').then(t => t.replace(/\d+/g, '').trim()), 'Messages', '« Groupes » devient « Messages »');
  assert.equal(await page.locator('#addfab:visible').count(), 0, 'plus de bouton + flottant');
  assert.ok(await page.locator('#top .bvpub').isVisible(), 'Publier dans l’en-tête de l’Accueil');
  for (const t of ['home', 'agenda', 'jouer', 'chans', 'club', 'me']) {
    await page.click(t === 'me' ? '#top .bvme' : `#tabs button[data-t="${t}"]`);
    await page.waitForTimeout(400);
    const txt = await page.textContent('#main');
    assert.ok(txt && txt.trim().length > 20, `onglet ${t} vide`);
    assert.ok(await overflow(page) <= 1, `onglet ${t} : la page déborde horizontalement`);
  }
  assert.equal(await page.evaluate(() => view().v), 'me', 'l’avatar ouvre Moi');
  assert.ok(await page.locator('#top [data-a="back"]').isVisible(), 'Moi se referme par le retour');
  // les anciennes adresses mènent à leur nouvelle place
  assert.deepEqual(await page.evaluate(() => { S.stack = []; S.ecTab = 'mine'; A.tab({ t: 'ecole' }); const a = S.tab; A.goClub({ t: 'teams' }); return [a, S.tab, S.jouTab]; }), ['agenda', 'jouer', 'equipes']);
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
  await page.goto(`${JA}/club/coach.html?ui=1`);   // sous /club/ : la vraie synchro (sous /coach/ en local : la démo)
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
  await page.goto(`${JA}/club/coach.html?ui=1`);
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
  for (const [page0, onglet] of [['/club/demo', 'home'], ['/club/coach.html?ui=1', 'planning']]) {
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
  // intercalaires À venir / En cours / Clôturés au-dessus de la liste, une ligne par tournoi
  await page.waitForSelector('#psCols [data-c]', { timeout: 8000 });
  const cols = await page.$$eval('#psCols [data-c]', l => l.map(x => x.textContent.split(' · ')[0].trim()));
  assert.deepEqual(cols, ['À venir', 'En cours', 'Clôturés']);
  await page.click('#psCols [data-c="live"]');
  await page.waitForSelector('#psRows .ps-trow', { timeout: 8000 });
  for (const url of ['/app', '/calendrier', '/dashboard']) {
    await page.goto(JA + url);
    await page.waitForTimeout(300);
    const y0 = await page.evaluate(() => scrollY);
    await page.click('.phead-act a[href$="#nouveau"]');
    await page.waitForSelector('dialog.nvdlg[open] .tpl');
    assert.equal(new URL(page.url()).pathname, url, 'reste sur la page');
    assert.equal(await page.evaluate(() => scrollY), y0, 'sans défilement');
    const onglets = await page.$$eval('.nvtabs button', l => l.map(x => x.textContent));
    assert.deepEqual(onglets, ['Officiels', 'Mes modèles', 'Vierge', 'Animations', 'Interne']);
    // le premier modèle est présélectionné (en citron) et son nom est déjà proposé
    assert.equal(await page.locator('.nvbody .tpl.cur').count(), 1, 'un modèle présélectionné');
    assert.ok((await page.inputValue('#nvName')).length > 0, 'nom proposé');
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
    await page.goto(JA + '/club/coach.html?ui=1');
    await page.waitForSelector('#tabs', { state: 'attached', timeout: 8000 });
    assert.deepEqual(await page.evaluate(() => TABBAR.slice(0, 2).map(t => t[2])), ['Accueil', 'Stats'], 'libellés courts du menu (refonte)');
    assert.equal(await page.locator('.cotile').count(), 4, 'quatre petits chiffres');
    await page.evaluate(() => { S.tab = 'planning'; S.stack = []; S.pl.v = 'semaine'; render(); });
    await page.waitForSelector('.cowg');
    assert.equal(await page.locator('.cowj').count(), 7, 'les 7 jours, sur téléphone comme sur ordinateur');
    assert.ok(await page.locator(w > 1000 ? '.topact [data-a="coNewSes"]' : '#top [data-a="coNewSes"]').isVisible(), 'action en haut (dans l’en-tête sur grand écran)');
    const hauts = await page.$$eval('.cotopact .btn', l => [...new Set(l.map(x => Math.round(x.getBoundingClientRect().top)))]);
    // grand écran (contrôle du designer) : Groupe, Collectif et Historique passent dans « … » de l’en-tête
    if (w > 1000) assert.ok(await page.locator('.topact [data-a="coPlMore"]').isVisible(), 'autres actions dans « … »');
    else assert.ok(await page.locator('#top [data-a="coPlMore"]').isVisible() && hauts.length === 0, 'téléphone : « + » et « … » dans l’en-tête, plus de rangée de boutons');
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
  await page.goto(JA + '/club/coach.html?ui=1');
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
  await page.goto(JA + '/club/coach.html?ui=1');
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
  await page.click('[data-a="coDashP"][data-v="tcur"]');
  await page.waitForSelector('.comonths');
  await page.click('[data-a="coDashAutre"]');
  await page.locator('#sheet [data-a="coDashP"][data-v^="q:"]').first().click();
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
  await page.goto(JA + '/club/coach.html?ui=1');
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
  // refonte : « Plus », dans la barre du bas, ouvre aussi le volet
  await page.click('#tabs .coplus');
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
  // agenda : les vues occupent toute leur colonne ; sur grand écran, le mois et les filtres sont toujours visibles à droite (refonte)
  await page.evaluate(() => { S.tab = 'agenda'; S.stack = []; S.plan.scope = 'club'; S.plan.mode = 'week'; render(); });
  await page.waitForSelector('#plan .pllegend');
  const large = () => page.evaluate(() => { const b = document.querySelector('.bento2 .bmain'), m = b ? b.clientWidth : document.getElementById('main').clientWidth, p = document.getElementById('plan').offsetWidth; return p >= m - 2; });
  assert.ok(await large(), 'semaine sur toute la largeur');
  assert.equal(await page.locator('.bside .calf .chip.plf').first().isVisible(), true, 'filtres toujours visibles à droite');
  assert.equal(await page.locator('[data-a="planMode"][data-m="list"]').count(), 0, 'plus de vue Liste');
  await page.evaluate(() => { S.plan.mode = 'events'; render(); });
  await page.waitForSelector('.plk .plc');
  // refonte : sur grand écran, une liste verticale (la date, puis ses cartes), le mois et les filtres à droite
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.plk')).flexDirection), 'column', 'en liste');
  assert.ok(await page.locator('.plk .plc').count() >= 7, 'un bloc par jour, au moins sept');
  assert.ok(await page.evaluate(() => document.querySelectorAll('.bside .calm .cmd.today').length === 1), 'le mois, avec aujourd’hui');
  assert.ok(await large(), 'rien ne déborde de la page');
  // filtres (dans la colonne de droite sur grand écran) : la couleur reste visible, l'état actif a sa coche
  const f = page.locator('.bside .chip.plf', { hasText: 'Tournois' });
  assert.equal(await f.getAttribute('aria-pressed'), 'true');
  assert.ok(await f.locator('svg').count() >= 2, 'pictogramme et coche');
  assert.notEqual(await f.evaluate(b => getComputedStyle(b).backgroundColor), await f.locator('.sq').evaluate(s => getComputedStyle(s).backgroundColor), 'le carré se distingue');
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
  await page.goto(JA + '/club/coach.html?ui=1');
  await page.waitForFunction(() => typeof coGoogleSheet === 'function', null, { timeout: 8000 });
  for (const t of ['eleves', 'clubs', 'dash']) {
    await page.evaluate(x => { S.stack = []; A.tab({ t: x }); }, t);
    // refonte : la page peut être en deux colonnes (.cobento)
    await page.waitForFunction(() => document.querySelector('#main > .pad, #main > .cobento'));
    const larg = await page.evaluate(() => [document.querySelector('#main > .pad, #main > .cobento').getBoundingClientRect().width, document.querySelector('#main').getBoundingClientRect().width]);
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
  await page.goto(JA + '/club/coach.html?ui=1');
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
  await page.evaluate(() => { S.stack = []; OFFRES.rappelBilans = true; A.tab({ t: 'asuivi' }); });
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
  // Club en tuiles (nouvelle organisation) : les chiffres en tête, puis une tuile par page
  for (const x of ['courts', 'pistes', 'Bar et repas', 'École', 'Adhérents', 'Tarifs et horaires', 'Partenaires', 'Archives', 'Club-house']) assert.ok(h.includes(x), x);
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
  await page.goto(JA + '/club/coach.html?ui=1');
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
  await page.goto(JA + '/club/coach.html?ui=1');
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
  await page.goto(JA + '/club/coach.html?ui=1');
  await page.waitForSelector('#tabs', { state: 'attached', timeout: 8000 });
  const large = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  // navigation
  assert.deepEqual(await page.evaluate(() => TABBAR.map(t => t[2]).filter(t => /Suivi|Groupes/.test(t))), ['Suivi', 'Groupes'], 'libellés courts du menu (refonte)');
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
  await page.goto(JA + '/club/coach.html?ui=1');
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
    await page.goto(JA + '/club/coach.html?ui=1');
    await page.waitForSelector('#tabs', { state: 'attached', timeout: 8000 });
    await page.evaluate(() => { S.tab = 'planning'; S.stack = []; S.pl.v = 'semaine'; render(); });
    await page.waitForSelector('.cowg');
    const large = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
    await page.click('[data-a="coVue"][data-k="mois"]');
    await page.waitForSelector('.cogm');
    assert.ok((await page.locator('.comc').count()) % 7 === 0, 'des semaines entières');
    assert.equal(await page.$eval('.cogm', x => getComputedStyle(x).display), 'grid', 'la grille du mois a son style');
    assert.ok(await large(), 'mois sans débordement');
    const t0 = await page.textContent('.coweek b, .coplnav span');
    await page.click('[data-a="coMois"][data-n="1"]');
    assert.notEqual(await page.textContent('.coweek b, .coplnav span'), t0, 'mois suivant');
    await page.locator('.comc').nth(10).click();
    await page.waitForSelector('.cogrid');
    assert.ok(await large(), 'jour sans débordement');
    assert.equal(await page.$eval('.cogrid', x => getComputedStyle(x).position), 'relative', 'le quadrillage a son style');
    await page.click('[data-a="coJour"][data-n="1"]');
    await page.waitForSelector('.cogrid');
    await page.click('[data-a="coVue"][data-k="semaine"]');
    await page.waitForSelector('.cowg');
    if (await page.locator('.cotopact [data-a="nvNew"]').count()) await page.click('.cotopact [data-a="nvNew"]');
    else { await page.click('#top [data-a="coPlMore"]'); await page.click('#layer [data-a="nvNew"]'); }
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
  await page.goto(JA + '/club/coach.html?ui=1');
  await page.waitForSelector('#tabs', { state: 'attached', timeout: 8000 });
  for (const [f, form, sku] of [[() => A.coFoEdit({ id: OFFRES.formules[0].id }), '#co-fo', '#co-fv-sku'], [() => A.coPkEdit({ id: OFFRES.packs[0].id }), '#co-pk', '#co-kv-sku'], [() => A.coAbEdit({ id: OFFRES.abos[0].id }), '#co-ab', '.coabv .coabvs summary']]) {
    await page.evaluate(f);
    await page.waitForSelector(form + ' ' + sku);
    if (form === '#co-ab') assert.equal(await page.locator('#co-ab .coabv .co-avs').count(), 1, 'la référence Shopify de chaque variante');
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
  await page.goto(JA + '/club/coach.html?ui=1');
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
  await coachP.goto(JA + '/club/coach.html?ui=1');
  await coachP.waitForFunction(() => window.RAM && RAM.live, null, { timeout: 15000 });
  await coachP.evaluate(() => { S.stack = []; A.tab({ t: 'me' }); });
  await coachP.waitForSelector('[data-a="coResaPage"]', { timeout: 8000 });
  assert.ok(await coachP.locator('[data-a="coAgendaLien"]').count());
  await coachP.click('[data-a="coResaPage"]');
  await coachP.waitForSelector('[data-a="coResaBloc"]', { timeout: 8000 });
  await coachP.waitForFunction(() => OFFRES.page === RAM.club);
  assert.match(await coachP.locator('a:has-text("Page de réservation")').first().getAttribute('href'), /\/r\/[^/]+\/[^/]+$/, 'Dojo : bouton vers sa page publique, dans les réglages');  // créer un stage depuis /RAM Coach
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
  assert.match(pro2, /href="[^"]*\/r\/[^"/]+\/[^"/]+"[^>]*>[\s\S]{0,1500}Page de réservation/, 'Buvette : bouton vers la page publique de l’enseignant');
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
  // ordinateur : formules (durée visible), calendrier du mois, horaires et récapitulatif côte à côte
  await pp.setViewportSize({ width: 1280, height: 900 });
  await pp.waitForSelector('#nx', { timeout: 8000 });
  assert.ok(await pp.locator('.fo').count() >= 1 && /durée\s*\d+ (h|min)/i.test((await pp.locator('.fo').first().innerText()).replace(/\n/g, ' ')), 'la durée de chaque formule est visible');
  await pp.click('#nx');   // le mois suivant : forcément à venir
  await pp.waitForSelector('.slot', { timeout: 8000 });
  assert.ok(await pp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'page publique sans débordement (ordinateur)');
  assert.ok(await pp.evaluate(() => { const a = document.querySelector('section[aria-label="Horaires"]').getBoundingClientRect(), b = document.querySelector('.r-card[aria-label="Votre cours"]').getBoundingClientRect(); return b.top >= a.bottom - 1 && Math.abs(a.left - b.left) < 4; }), 'récapitulatif sous les horaires, dans la colonne de droite');
  await pp.locator('.slot').first().click();
  assert.equal(await pp.locator('.slot[aria-pressed=true]').count(), 1);
  // téléphone : bande de jours, barre du bas fixe, pas de débordement
  await pp.setViewportSize({ width: 360, height: 780 });
  assert.ok(await pp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'page publique sans débordement (téléphone)');
  assert.ok(await pp.locator('.bas').isVisible() && !(await pp.locator('.steps').isVisible()), 'téléphone : barre du bas, pas de pastilles d’étapes');
  await pp.click('.bas [data-a=suite]');
  await pp.waitForSelector('#f', { timeout: 8000 });
  assert.ok(await pp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'formulaire sans débordement (téléphone)');
  await pp.fill('#p', 'Léa'); await pp.fill('#n', 'Roy'); await pp.fill('#t', '0600000000'); await pp.fill('#em', `lea-${t}@exemple.test`); await pp.fill('#o', 'Volée');
  await pp.click('[data-niv=Loisir]');
  await pp.check('#ac', { force: true });
  await pp.click('#go');
  await pp.waitForFunction(() => /réservé/i.test(document.querySelector('main h2').textContent), null, { timeout: 8000 });
  assert.ok(await pp.locator('#ag').isVisible() && /annuler/.test(await pp.locator('a[href*="annuler"]').getAttribute('href')), 'agenda et lien d’annulation');
  assert.deepEqual(errs, []);
  await cc.close(); await sc.close(); await pub.close();
});

test('Page publique : filtres de formules combinés, compteur, effacement, état vide, intercalaires collés, parcours simulé (360, 390 et 1280 px)', async () => {
  // l'API publique est simulée : aucune réservation réelle, des formules de tous les types
  const FO = [{ id: 'f1', nom: 'Cours individuel', sport: 'Padel', joueurs: 1, duree: 60, prix: 35, par: 'seance' }, { id: 'f2', nom: 'Cours individuel 1 h 30', sport: 'Padel', joueurs: 1, duree: 90, prix: 50, par: 'seance' },
    { id: 'f3', nom: 'Cours duo', sport: 'Padel', joueurs: 2, duree: 60, prix: 30, par: 'personne' }, { id: 'f4', nom: 'Collectif à 4', sport: 'Padel', joueurs: 4, duree: 90, prix: 25, par: 'personne' },
    { id: 'f5', nom: 'Cours de tennis', sport: 'Tennis', joueurs: 1, duree: 60, prix: 40, par: 'seance' }, { id: 'f6', nom: 'Partie dirigée', sport: 'Padel', joueurs: 3, duree: 90, prix: 5, par: 'personne' }];
  const PK = [{ id: 'p1', nom: 'Pack Perfectionnement', formule: 'f1', seances: 5, prix: 160, duree: 60 }, { id: 'p2', nom: 'Cycle duo', formule: 'f3', seances: 10, prix: 270, duree: 60 }];
  const AB = [{ id: 'a1', nom: 'Academy Training (6 mois)', formule: 'f1', periode: 'mois', engagement: 6, prix: 99, parSemaine: 1, parMois: 4, duree: 60 }];
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const requetes = [];
  const ouvre = async vp => {
    const ctx = await browser.newContext({ viewport: vp }), p = await ctx.newPage(), errs = [];
    p.on('pageerror', x => errs.push(x.message));
    await p.route('**/api/public/resa/creneaux*', r => {
      const u = new URL(r.request().url()), de = u.searchParams.get('de'), n = +u.searchParams.get('n'), t0 = iso(new Date()), jours = [];
      for (let i = 0; i < n; i++) { const d = iso(new Date(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8) + i)); jours.push({ d, libres: d > t0 ? [{ du: 540, au: 660 }, { du: 930, au: 1080 }] : [] }); }
      r.fulfill({ json: { coach: 'Sarah Test', club: 'Club Essai', photo: true, formules: FO, packs: PK, abos: AB, jours } });
    });
    await p.route('**/api/public/resa/photo*', r => r.fulfill({ status: 404, body: '' }));   // photo illisible : retour aux initiales
    await p.route('**/api/public/resa/reserver', r => { requetes.push(r.request().postDataJSON()); r.fulfill({ json: { id: 'r1', d: requetes.at(-1).d, h: '9 h', dur: '1 h', nom: 'Cours individuel', mail: requetes.at(-1).email, coach: 'Sarah', couvert: '', prix: 35, annuler: '/r/annuler?c=x&id=r1&t=z' } }); });
    await p.goto(JA + '/r/club-essai/cle-essai');
    await p.waitForSelector('.fo', { timeout: 10000 });
    return { ctx, p, errs };
  };
  const sans = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const compte = p => p.locator('.cmpt').innerText();
  for (const vp of [{ width: 360, height: 780 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    const { ctx, p, errs } = await ouvre(vp), w = vp.width;
    assert.ok(await sans(p), 'pas de débordement à ' + w);
    assert.equal(await p.locator('.crest').innerText(), 'ST', 'photo illisible : les initiales');
    // la maquette Dojo : fond à motifs, marges latérales de 10 px sur téléphone
    assert.ok(await p.evaluate(() => getComputedStyle(document.querySelector('.motif'), '::before').maskImage !== 'none'), 'fond à motifs du Dojo');
    if (w < 700) assert.equal(await p.evaluate(() => Math.round(document.querySelector('.r-card').getBoundingClientRect().left)), 10, 'marge latérale de 10 px');
    // intercalaires de type : collés à la carte du dessous (écart 0), un seul actif
    assert.deepEqual(await p.locator('.seg > button').evaluateAll(l => l.map(x => x.firstChild.textContent)), ['Tout', 'À la séance', 'Pack', 'Abonnement']);
    const ecart = await p.evaluate(() => document.querySelector('.r-card[aria-label="Formules"]').getBoundingClientRect().top - document.querySelector('.seg').getBoundingClientRect().bottom);
    assert.ok(ecart <= 0 && ecart >= -3, 'intercalaires collés à la carte : ' + ecart);
    assert.match(await compte(p), /^6 sur 9 formules$/i);
    // seuls les filtres utiles (deux valeurs réelles au moins) : personnes, durée, séances, sport
    assert.deepEqual(await p.locator('select[data-fl]').evaluateAll(l => l.map(x => x.id)), ['fl-j', 'fl-d', 'fl-s', 'fl-sp']);
    assert.equal(await p.locator('[data-fl-clear]').count(), 1, 'le type choisi se retire avec « Tout effacer »');
    assert.deepEqual(errs, []);
    await ctx.close();
  }
  const { ctx, p, errs } = await ouvre({ width: 390, height: 844 });
  await p.locator('.seg button[data-v=""]').click();
  assert.match(await compte(p), /^9 sur 9 formules$/i);
  assert.equal(await p.locator('[data-fl-clear]').count(), 0);
  await p.selectOption('#fl-j', '2');
  assert.match(await compte(p), /^2 sur 9/i);
  assert.equal(await p.locator('.fo').count(), 2, 'duo : la formule et le pack');
  assert.equal(await p.locator('#fl-d option[value="90"]').isDisabled(), true, 'une valeur sans résultat est signalée (0) et refusée');
  assert.match(await p.locator('#fl-d option[value="90"]').innerText(), /\(0\)/);
  assert.ok(await p.locator('.seg button[data-v=a]').isDisabled(), 'type sans résultat désactivé, son compteur à 0');
  await p.selectOption('#fl-s', '10');
  assert.match(await compte(p), /^1 sur 9/i);
  await p.selectOption('#fl-s', '');
  await p.selectOption('#fl-j', '');
  await p.selectOption('#fl-sp', 'Tennis');
  assert.match(await compte(p), /^1 sur 9/i);
  await p.click('[data-fl-clear]');
  assert.match(await compte(p), /^9 sur 9/i);
  assert.equal(await p.locator('[data-fl-clear]').count(), 0, 'effacé : plus de bouton');
  // état vide : combinaison sans résultat (forcée, l'appli ne la propose pas)
  await p.evaluate(() => { const s = document.getElementById('fl-d'), o = new Option('9 h', '540'); s.add(o); s.value = '540'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForSelector('.vide');
  assert.match(await p.locator('.vide').innerText(), /Aucune formule ne correspond/);
  await p.click('.vide [data-fl-clear]');
  assert.equal(await p.locator('.vide').count(), 0);
  assert.match(await compte(p), /^9 sur 9/i);
  // choix masqué par un filtre : signalé
  await p.locator('.seg button[data-v=p]').click();
  assert.match(await p.locator('.info').innerText(), /masqué/);
  assert.ok(await sans(p), 'sans débordement avec filtres');
  await ctx.close();
  // parcours simulé jusqu'au bout, sur téléphone puis à l'ordinateur
  for (const vp of [{ width: 360, height: 780 }, { width: 1280, height: 900 }]) {
    const o = await ouvre(vp);
    await o.p.locator('.fo').first().click();
    await o.p.locator('.slot').first().click();
    await o.p.locator('[data-a=suite]:visible').first().click();
    await o.p.waitForSelector('#f');
    assert.ok(await sans(o.p), 'formulaire sans débordement à ' + vp.width);
    await o.p.fill('#p', 'Camille'); await o.p.fill('#n', 'Durand'); await o.p.fill('#t', '0612345678'); await o.p.fill('#em', 'camille@exemple.test'); await o.p.fill('#o', 'Bandeja');
    await o.p.check('#ac', { force: true });
    await o.p.click('#go');
    await o.p.waitForFunction(() => /réservé/i.test(document.querySelector('main h2').textContent), null, { timeout: 8000 });
    assert.ok(await o.p.locator('#ag').isVisible() && await sans(o.p), 'confirmation à ' + vp.width);
    assert.equal(requetes.at(-1).formule, 'f1');
    assert.deepEqual(o.errs, []);
    await o.ctx.close();
  }
  assert.deepEqual(errs, []);
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
  await page.goto(JA + '/club/coach.html?ui=1');
  await page.waitForFunction(() => typeof A !== 'undefined' && typeof coPayTodo === 'function');
  await page.evaluate(() => { document.querySelector('.ram-splash')?.remove(); A.tab({ t: 'today' }); });
  // refonte : trois raccourcis et « Plus », avant les chiffres ; les autres raccourcis dans « Plus »
  await page.waitForSelector('.coshort3');
  assert.ok(await page.evaluate(() => { const r = document.querySelector('.coshort3'), c = document.querySelector('.cotiles'); return r.compareDocumentPosition(c) & 4; }), 'raccourcis avant les chiffres');
  const trois = (await page.locator('.coshort3').textContent()).toLowerCase();
  for (const x of ['séance collective', 'à un groupe', 'contenu', 'plus']) assert.ok(trois.includes(x), x);
  await page.click('.coshort3 [data-a="coShortMore"]');
  const short = (await page.locator('#sheet').textContent()).toLowerCase();
  for (const x of ['stage', 'animation', 'à un élève', 'formulaires']) assert.ok(short.includes(x), x);
  assert.ok(!short.includes('statistiques'), 'plus de raccourci Statistiques');
  await page.evaluate(() => closeSheet());
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
  await page.goto(JA + '/club/coach.html?ui=1');
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
  await page.evaluate(() => (OFFRES.rappelBilans = true, A.tab({ t: 'asuivi' })));
  await page.waitForSelector('[data-a="coSuiviBO"]');
  assert.equal(await page.locator('.cobent').count(), 0, 'une colonne sur téléphone');
  await page.close();
});

test('Coach : un cycle reprend l’achat déjà noté du même produit au lieu d’en créer un second', async () => {
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  page.on('pageerror', e => { throw e; });
  await page.goto(JA + '/club/coach.html?ui=1');
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
  // l'ordre des 5 rubriques : Accueil, Agenda, Jouer, Messages, Club
  await page.evaluate(() => { S.tab = 'chans'; S.stack = []; closeSheet(); render(); });
  assert.equal(await glisse(300, 100), 'club');
  await page.evaluate(() => { S.tab = 'chans'; render(); });
  assert.equal(await glisse(100, 300), 'jouer');
  // Moi (nouvelle organisation) : en-tête compact une seule fois, adhésion, points du bar et trophées séparés, liste des pages
  await page.evaluate(() => { S.tab = 'home'; S.stack = [{ v: 'me' }]; render(); });
  assert.equal(await page.locator('#main .bvmoih').count(), 1, 'en-tête compact');
  assert.ok(await page.locator('#main .bvadh').isVisible(), 'carte Adhésion');
  assert.deepEqual(await page.locator('#main .bvcpt .bvc span').allInnerTexts().then(l => l.map(t => t.split('·')[0].trim().toUpperCase())), ['POINTS', 'TROPHÉES'], 'deux compteurs séparés');
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#main .bvmenu b')].map(b => b.textContent)), ['Mon jeu', 'Mon suivi', 'Ma famille', 'Mes infos', 'Mes trophées', 'Réglages']);
  assert.equal(await page.evaluate(() => document.getElementById('main').textContent.includes('Investissement')), false, '« Investissement » devient « Trophées »');
  // l'ancien sous-onglet Réglages ouvre sa page ; les chiffres ouvrent Mon jeu et son palmarès
  await page.evaluate(() => { S.tab = 'me'; S.stack = []; S.meTab = 'reglages'; render(); });
  assert.deepEqual(await page.evaluate(() => [view().v, view().id]), ['moi', 'reglages']);
  await page.evaluate(() => { S.stack = [{ v: 'me' }]; render(); });
  await page.click('.bvchif [data-a="bvMoi"]');
  await page.waitForSelector('#palmares');
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
    // la carte des trophées vit sur la fiche d'un adhérent (Moi a ses deux compteurs)
    await page.evaluate(() => { document.querySelector('.ram-splash')?.remove(); S.tab = 'home'; S.stack = [{ v: 'member', id: Object.keys(M).find(k => k !== 'club' && k !== ME() && !isMinor(k)) }]; render(); });
    for (const st of ['epure', '', 'street']) {
      const r = await page.evaluate(st => { A.ustyle({ k: st }); const c = document.querySelector('.tcard'), mc = !!c.closest('.bpr .meclub') && innerWidth >= 1024; return [1, 2, 3, 4, 5].map(n => { c.className = 'card tcard cf' + n; return mc ? 'meclub:' + getComputedStyle(c).boxShadow : getComputedStyle(c).boxShadow; }); }, st);
      // profil sur grand écran (contrôle du designer) : la carte Investissement n'a plus de filet de couleur, son titre est intégré
      ['200, 131, 75', '142, 153, 166', '242, 194, 48', '127, 227, 216', '111, 183, 255'].forEach((rgb, i) => assert.ok(r[i].startsWith('meclub:') ? r[i] === 'meclub:none' : r[i].includes(rgb), `largeur ${w}, style « ${st} », cadre ${i + 1} : ${r[i]}`));
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
  // refonte (vue enseignant) : l'appel en principal, extérieur et annulation en secondaire, supprimer dans le menu « … »
  assert.equal(await page.locator('.ecacts [data-a="appel"]').count(), 1, 'faire l’appel');
  assert.equal(await page.locator('.ecacts [data-a="loc"]').count(), 1, 'salle ou extérieur');
  assert.equal(await page.locator('.ecacts [data-a="cancelCourse"]').count(), 1, 'annuler');
  assert.equal(await page.locator('.ecacts [data-a="delCourse"]').count(), 0, 'supprimer n’est plus en vue');
  assert.equal(await page.locator('.ecpres .ecn > span').count(), 3, 'présences annoncées en trois compteurs');
  await page.click('.ecacts [data-a="seMenu"]');
  assert.equal(await page.locator('#sheet [data-a="delCourse"] svg').count(), 1, 'supprimer dans le menu, avec sa corbeille');
  await page.evaluate(() => closeSheet());
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

test('Club : Mon espace montre mes séances et ce qui reste à payer (360 px)', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(DEMO + '/index.html');
  await page.waitForFunction(() => typeof A !== 'undefined' && typeof mesAchatsCarte === 'function', { polling: 300 });
  await page.evaluate(() => {
    document.querySelector('.ram-splash')?.remove();
    const k = ME(), g = GROUPS.find(x => x.type === 'train') || GROUPS[0];
    SEANCES.push({ g: g.id, d: isoIn(-7), pres: { [k]: 'P' } });
    ELEVES.push({ id: k, n: name(k), note: 'note privée', achats: [{ id: 'hx', t: 'pack', ref: 'p1', d: isoIn(-10), nom: 'Pack Perfectionnement', n: 5, prix: 150, pay: { moyen: 'Chèque', ech: [{ s: 0, m: 75, ok: '' }, { s: 3, m: 75, ok: '' }] } }] });
    S.tab = 'ecole'; S.ecTab = 'perso'; S.stack = []; render();
  });
  await page.waitForSelector('.mesach');
  const txt = await page.locator('.mesach').innerText();
  assert.match(txt, /Mes séances et paiements/);
  assert.match(txt, /Pack Perfectionnement/);
  assert.match(txt, /[1-4] sur 5 séances faites · encore [1-4]/);
  assert.match(txt, /À payer maintenant : 75/);
  assert.match(txt, /Reste à régler plus tard|À payer : 75/i);
  assert.ok(!/note privée|Chèque|150/.test(txt), 'ni la note, ni le moyen, ni le prix');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'rien ne déborde');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.mesach *')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).length), 0, 'aucun texte sous 12 px');
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
    // Direct : la page elle-même en bento (terrains à gauche, repos et à suivre à droite) ; TV : ses deux cartes
    assert.equal(await colonnes(t === 'direct' ? '#tab-direct' : '#tab-' + t + ' .grid2'), 2, t);
    assert.ok(await large(), t + ' sans débordement');
    assert.ok(await page.evaluate(() => { const m = document.querySelector('main'); return m.scrollWidth <= m.clientWidth + 1; }), t + ' : rien ne dépasse');
  }
  const id = new URL(page.url()).pathname.split('/')[2];
  await page.goto(JA + '/joueurs');
  await page.waitForSelector('.g-2');
  assert.equal(await colonnes('.g-2'), 2, 'joueurs');
  await page.goto(JA + '/statistiques');
  await page.waitForSelector('.st-grid');
  // bento de la maquette : barres et Top 10 à gauche, catégories et export à droite
  assert.equal(await colonnes('.st-grid'), 2, 'statistiques');
  assert.ok(await large());
  await page.setViewportSize({ width: 390, height: 800 });
  assert.equal(await colonnes('.st-grid'), 1, 'statistiques sur téléphone');
  await page.goto(JA + '/t/' + id);
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('[data-tab="direct"]').click());
  await page.waitForTimeout(250);
  assert.equal(await colonnes('#tab-direct'), 1, 'éditeur sur téléphone');
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
  await page.goto(JA + '/club/coach.html?ui=1');
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
  // Moi : la carte du club, avec la gestion en pictogramme ; puis Mon jeu
  await page.evaluate(() => { document.querySelector('.ram-splash')?.remove(); S.tab = 'home'; S.stack = [{ v: 'me' }]; render(); });
  await page.waitForSelector('.bvclubm');
  assert.ok(await page.evaluate(() => !!(document.querySelector('.bvcpt').compareDocumentPosition(document.querySelector('.bvclubm')) & 4)), 'après les points et les trophées');
  assert.ok(await page.locator('.bvclubm [data-a="admin"] svg').count(), 'gestion en pictogramme');
  assert.equal(await page.locator('#main .btn[data-a="admin"]').count(), 0, 'plus de gros bouton');
  await page.evaluate(() => { S.tab = 'me'; S.stack = []; S.meTab = 'jeu'; render(); });
  await page.waitForSelector('.meshort');
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
  //  le profil doit rester affiché quatre vérifications de suite (environ 2 s) : le retour à l'accueil de fin de changement est passé
  // Moi : la carte du club ouvert (nouvelle organisation)
  await page.waitForFunction(id => { if (!document.querySelector('.bvclubm')) { document.querySelector('.ram-splash')?.remove(); S.tab = 'home'; S.stack = [{ v: 'me' }]; render(); } const ok = !!document.querySelector('.bvclubm') && RAM.code && RAM.club === id; window.__stable = ok ? (window.__stable || 0) + 1 : 0; return window.__stable >= 4; }, autre.id, { timeout: 30000, polling: 500 });
  assert.match(await page.locator('.bvclubm .bvcn').innerText(), new RegExp(autre.name || 'Club'));
  assert.equal(await page.locator('.bvclubm [data-a="ramClubs"] svg').count(), 1, 'changer de club, en pictogramme');
  assert.equal(await page.locator('.bvclubm [data-a="admin"] svg').count(), 1, 'gestion, en pictogramme');
  assert.equal(await page.locator('.bvclubm .tag').count(), 0, 'pas encore principal');
  await page.click('.bvclubm [data-a="ramMain"]');
  await page.waitForSelector('.bvclubm .tag', { timeout: 20000 });
  assert.match(await page.locator('.bvclubm .tag').innerText(), /Club principal/i);
  assert.equal(await page.locator('.bvclubm [data-a="ramMain"]').count(), 0, 'le bouton disparaît');
  assert.equal(await page.locator('#sheet.open, #sheet .menu').count(), 0, 'pas de fenêtre ouverte en plus');
  assert.ok(await page.locator('#main .logout').isVisible(), 'la déconnexion en bas de Moi');
  // le code du club : en dernier dans les Réglages
  await page.evaluate(() => { S.tab = 'me'; S.stack = []; S.meTab = 'reglages'; render(); });
  await page.waitForFunction(() => [...document.querySelectorAll('#main .card')].some(x => /Code du club/.test(x.textContent)));
  assert.ok(await page.evaluate(() => { const c = [...document.querySelectorAll('#main .card')].find(x => /Code du club/.test(x.textContent)); return c && !c.nextElementSibling; }), 'code du club en dernier dans les réglages');
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
    await page.goto(JA + '/club/coach.html?ui=1');
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

/* ---------- /Pista sur le socle (seul style) : chaque écran s'ouvre, rien ne déborde à 360 px, aucun texte sous 12 px ---------- */
test('JA : style du socle (ds.css + pista.css) sans erreur, sans débordement à 360 px ni texte sous 12 px ; plus de bascule ?ds', async () => {
  const desk = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const d = await openPage(desk, JA + '/demo');
  const id = new URL(d.page.url()).pathname.split('/')[2];
  // tirage fait, un match joué et un en cours : tableaux, programmation et direct ont du contenu
  await d.page.evaluate(async id => {
    const act = (type, payload) => fetch('/api/t/' + id + '/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, payload }) });
    await act('draw/create', {});
    const ms = (await fetch('/api/t/' + id + '/export').then(r => r.json())).matches || [];
    if (ms[0]) await act('match/manual', { id: ms[0].id, sets: [[6, 3], [6, 4]] });
    if (ms[1]) await act('match/start', { id: ms[1].id });
  }, id);
  const tel = await browser.newContext({ viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true, storageState: await desk.storageState() });
  const pb = [];
  for (const [ctx, nom] of [[desk, 'ordinateur'], [tel, 'téléphone']]) {
    const first = await openPage(ctx, JA + '/dashboard');
    assert.ok(await first.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--c-ink').trim() !== ''), 'ds.css est chargé');
    assert.ok(await first.page.evaluate(() => [...document.styleSheets].some(s => /\/css\/pista\.css/.test(s.href || ''))), 'pista.css est chargé');
    await first.page.close();
    for (const p of ['/dashboard', '/app', '/calendrier', '/joueurs', '/statistiques', '/profil', '/t/' + id]) {
      const o = await openPage(ctx, JA + p);
      await assertZoomAllowed(o.page);
      const vues = p.startsWith('/t/') ? ['tournoi', 'inscriptions', 'tirage', 'tableaux', 'programmation', 'direct', 'diffusion'] : [''];
      for (const v of vues) {
        if (v) { await o.page.evaluate(v => document.querySelector(`#nav [data-tab="${v}"]`).click(), v); await o.page.waitForTimeout(250); }
        const quoi = `${nom} ${p}${v ? ' › ' + v : ''}`;
        if (await overflow(o.page) > 1) pb.push(quoi + ' déborde horizontalement');
        const petits = await petitsTextes(o.page);
        if (petits.length) pb.push(quoi + ' : textes sous 12 px : ' + petits.join(' ; '));
      }
      if (nom === 'téléphone') {
        // barre du bas à 5 entrées, toutes avec un libellé visible
        const bas = await o.page.evaluate(() => [...document.querySelectorAll('.ps-bottom .r-rail__it')].filter(b => b.offsetParent).map(b => b.innerText.trim()));
        assert.equal(bas.length, 5, p + ' : barre du bas à 5 entrées');
        assert.ok(bas.every(Boolean), 'barre du bas : chaque entrée a un libellé');
        if (p.startsWith('/t/')) {
          // sélecteur « Section ▾ » : il ouvre la fenêtre du bas, une ligne choisie change de section
          await o.page.click('#psSec');
          assert.equal(await o.page.locator('#psSecs [data-sec-tab]').count(), 7, 'les 7 sections du tournoi');
          await o.page.click('#psSecs [data-sec-tab="tableaux"]');
          assert.ok(await o.page.evaluate(() => document.getElementById('psSecs').hidden && document.getElementById('tab-tableaux').classList.contains('on')), 'la section choisie s’ouvre');
          assert.match(await o.page.textContent('#psSec'), /Tableaux/);
        }
      }
      if (o.errors.length) pb.push(`${nom} ${p} : ${o.errors.join(' ; ')}`);
      await o.page.close();
    }
  }
  assert.deepEqual(pb, []);
  // ?ds=0 ne ramène plus l'ancien style : le socle reste, les anciennes feuilles ne se chargent plus
  const back = await openPage(tel, JA + '/dashboard?ds=0');
  assert.ok(await back.page.evaluate(() => [...document.styleSheets].some(s => /\/club\/ds\.css/.test(s.href || ''))), 'le socle reste chargé');
  assert.ok(!(await back.page.evaluate(() => [...document.styleSheets].some(s => /\/css\/(neo|street|shell)\.css/.test(s.href || '')))), 'les anciennes feuilles ne reviennent pas');
  assert.equal(await back.page.locator('.ps-bottom').count(), 1, 'barre du bas au téléphone');
  assert.deepEqual(back.errors, []);
  await desk.close(); await tel.close();
});

/* ---------- /Pista : saisir un score dans le panneau de droite, « +1 jeu » et « +1 set », menu « … » des matchs ---------- */
test('JA : Saisir un score (panneau), +1 jeu et +1 set ; menu « … » d’une carte de match ; fiche en bento', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const { page, errors } = await openPage(ctx, JA + '/demo');
  const id = new URL(page.url()).pathname.split('/')[2];
  const mid = await page.evaluate(async id => {
    const act = (type, payload) => fetch('/api/t/' + id + '/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, payload }) });
    await act('draw/create', {}); await act('schedule/auto', {});
    const m = ((await fetch('/api/t/' + id + '/export').then(r => r.json())).matches || []).find(x => x.court);
    await act('match/start', { id: m.id });
    return m.id;
  }, id);
  await page.reload(); await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('#nav [data-tab="direct"]').click());
  await page.click(`#liveList [data-o="${mid}"]`);
  await page.waitForSelector('#modal.ps-side .ps-grid');
  // panneau collé à droite, sans voile
  const box = await page.evaluate(() => { const r = document.getElementById('modalBox').getBoundingClientRect(); return { right: Math.max(0, Math.round(document.documentElement.clientWidth - r.right)), bg: getComputedStyle(document.getElementById('modal')).backgroundColor }; });
  assert.equal(box.right, 0, 'panneau à droite');
  assert.match(box.bg, /rgba\(0, 0, 0, 0\)|transparent/, 'pas de voile');
  await page.click('[data-gm="A"]'); await page.waitForTimeout(400);
  await page.click('[data-st1="A"]'); await page.waitForTimeout(400);
  const sets = await page.evaluate(id => fetch(location.pathname.replace(/\/$/, '').replace(/^\/t\//, '/api/t/') + '/export').then(r => r.json()).then(s => s.matches.find(m => m.id === id).points.length), mid);
  assert.ok(sets >= 16, '+1 jeu puis +1 set ajoutent les points du set');
  assert.ok(await page.locator('.ps-set.w').count() >= 1, 'le set gagné est en citron');
  await page.evaluate(() => { const b = document.querySelector('#modalBox [data-close]'); if (b && !document.getElementById('modal').hidden) b.click(); });
  // menu « … » d'une carte de match de la programmation
  await page.evaluate(() => document.querySelector('#nav [data-tab="programmation"]').click());
  const more = page.locator('#sched [data-more]').first();
  if (await more.count()) { await more.click(); assert.ok(await page.locator('.ps-pop [role=menuitem]').count() >= 1, 'menu « … » ouvert'); await page.keyboard.press('Escape'); }
  // fiche : intercalaires du socle et colonne de droite
  await page.evaluate(() => document.querySelector('#nav [data-tab="tournoi"]').click());
  assert.ok(await page.locator('#tsecTabs.r-itabs [aria-selected="true"]').count() === 1, 'un intercalaire actif');
  assert.ok(await page.locator('.ps-fside .ps-reg input[name=psReg]').count() === 3, 'Inscriptions sur /Buvette');
  assert.deepEqual(errors, []);
  await ctx.close();
});

/* ---------- Les trois applis : l'en-tête reste en haut après un défilement, fond opaque ; les intercalaires défilent avec leur carte ---------- */
test('Trois applis : en-tête fixe et opaque après un défilement, intercalaires non collants', async () => {
  // couleur calculée sans transparence : rgb(...), rgba(..., 1) ou color(srgb ...) sans « / alpha » inférieur à 1
  const opaque = c => c !== 'transparent' && !/rgba\([^)]*,\s*0?\.\d+\)|rgba\([^)]*,\s*0\)|\/\s*0?\.\d+\)|\/\s*0\)/.test(c);
  const verifier = async (page, sel, scroller, quoi) => {
    await page.evaluate(([s]) => { const el = s ? document.querySelector(s) : document.scrollingElement; el.scrollTop = 900; }, [scroller]);
    await page.waitForTimeout(500);
    const r = await page.evaluate(h => { const el = document.querySelector(h); if (!el) return null; const b = el.getBoundingClientRect(), cs = getComputedStyle(el); return { top: b.top, bas: b.bottom, bg: cs.backgroundColor, vis: cs.visibility !== 'hidden' && cs.display !== 'none' && b.height > 0 }; }, sel);
    assert.ok(r && r.vis, quoi + ' : en-tête présent');
    assert.ok(r.top <= 1 && r.bas > 20, quoi + ' : en-tête visible en haut après le défilement (haut à ' + r.top + ' px)');
    assert.ok(opaque(r.bg), quoi + ' : fond opaque (' + r.bg + ')');
    // la carte ne se voit pas à travers : l'élément au milieu de l'en-tête appartient à l'en-tête
    const dessus = await page.evaluate(h => { const el = document.querySelector(h), b = el.getBoundingClientRect(), x = document.elementFromPoint(b.left + b.width / 2, b.top + Math.min(b.height - 4, 30)); return !!x && el.contains(x); }, sel);
    assert.ok(dessus, quoi + ' : en-tête au premier plan');
  };
  // /Pista : pages du compte (en-tête de page) et éditeur (barre du haut), sur ordinateur et téléphone
  for (const [w, h] of [[1440, 900], [360, 760]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 700 });
    const { page, errors } = await openPage(ctx, JA + '/demo');
    await page.goto(JA + '/app'); await page.waitForTimeout(600);
    await page.evaluate(() => { const s = document.createElement('div'); s.style.height = '2400px'; document.querySelector('main').appendChild(s); });
    await verifier(page, '.phead', null, '/Pista ' + w + ' › Mes tournois');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#psCols')).position), 'relative', 'intercalaires non collants');
    await page.goBack(); await page.waitForTimeout(800);
    await page.evaluate(() => { const s = document.createElement('div'); s.style.height = '2400px'; document.querySelector('main').appendChild(s); });
    await verifier(page, w < 700 ? '.appbar' : '.top', null, '/Pista ' + w + ' › éditeur');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  // /Buvette (démo) et /Dojo : la barre du haut ne se retire plus au défilement
  for (const [url, pc] of [[DEMO + '/index.html', false], [JA + '/club/coach.html?ui=1', false], [DEMO + '/index.html', true], [JA + '/club/coach.html?ui=1', true]]) {
    const ctx = pc ? await browser.newContext({ viewport: { width: 1440, height: 900 } }) : await phone();
    const { page, errors } = await openPage(ctx, url);
    await page.waitForSelector('#top', { state: 'attached', timeout: 10000 });
    await page.evaluate(() => { document.querySelector('.ram-splash')?.remove(); const s = document.createElement('div'); s.style.height = '2400px'; document.getElementById('main').appendChild(s); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { const m = document.getElementById('main'); m.scrollTop = 300; m.dispatchEvent(new Event('scroll')); m.scrollTop = 900; m.dispatchEvent(new Event('scroll')); });
    await verifier(page, '#top', '#main', (url.includes('coach') ? '/Dojo' : '/Buvette') + (pc ? ' ordinateur' : ' téléphone'));
    assert.ok(!(await page.evaluate(() => document.getElementById('top').classList.contains('hide'))), 'en-tête jamais retiré');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
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

/* ---------- Stage : tarif, intervenant extérieur, déroulé dépliable sur le mur et dans l'agenda ---------- */
test('Club : un stage avec tarif, intervenant et déroulé ; le déroulé se déplie sur sa carte', async () => {
  const ctx = await phone();
  const { page, errors } = await openPage(ctx, DEMO + '/index.html');
  await page.evaluate(() => { document.querySelector('.ram-splash')?.remove(); document.querySelectorAll('.back').forEach(b => b.remove()); S.role = 'admin'; render(); A.newPost({ k: 'stage' }); });
  await page.waitForSelector('#ev-prix-p');
  await page.fill('#a-title', 'Stage essai');
  await page.fill('#a-place', 'Court 1');
  await page.fill('#a-body', 'Technique');
  await page.check('#ev-prix-p');
  await page.fill('#ev-prix-m', '30');
  await page.selectOption('#ev-ens', 'autre');
  await page.fill('#ev-ens-nom', 'Jean Dupont');
  await page.click('[data-a="dlAdd"]');
  await page.locator('#dl-list .dl-t').last().fill('Sur le terrain');
  await page.click('[data-a="dlAdd"]');
  await page.locator('#dl-list .dl-t').last().fill('Déjeuner au club-house');
  assert.ok(await page.evaluate(() => document.querySelector('#sheet').scrollWidth <= innerWidth + 1), 'le formulaire tient sur 360 px');
  await page.click('#adm-form > button.btn.full');
  const p = await page.waitForFunction(() => posts.find(x => x.title === 'Stage essai')).then(h => h.jsonValue());
  assert.equal(p.prix, '30');
  assert.equal(p.ensNom, 'Jean Dupont');
  assert.equal(p.dl.length, 2);
  await page.evaluate(() => { S.tab = 'agenda'; S.stack = []; S.plan.scope = 'club'; S.plan.mode = 'events'; S.dlOpen = []; render(); });
  const card = page.locator('.evx', { hasText: 'Stage essai' });
  assert.match(await card.textContent(), /30 €/);
  assert.match(await card.textContent(), /Avec Jean Dupont/);
  await card.locator('.dl-tog').click();
  assert.equal(await card.locator('.dl-f li').count(), 2);
  assert.equal(await card.locator('.dl-f').isHidden(), false, 'déplié');
  assert.equal(await page.evaluate(() => view().v), 'agenda', 'déplier n’ouvre pas la fiche');
  assert.deepEqual(errors, []);
  await ctx.close();
});

/* ---------- Formulaires : créer, répondre, résultats, promotion ---------- */
test('Club : formulaire créé par le bureau, réponse d’un adhérent, résultats et promotion sur le mur', async () => {
  const ctx = await phone();
  const { page, errors } = await openPage(ctx, DEMO + '/index.html');
  await page.evaluate(() => { document.querySelector('.ram-splash')?.remove(); document.querySelectorAll('.back').forEach(b => b.remove()); S.role = 'admin'; S.tab = 'club'; S.stack = [{ v: 'forms' }]; render(); });
  await page.click('[data-a="formNew"]');
  await page.fill('#fq-title', 'Essai');
  await page.locator('.fq-row .fq-q').first().fill('Ton nom');
  await page.click('[data-a="fqAdd"]');
  await page.locator('.fq-row').last().locator('.fq-t').selectOption('unique');
  await page.locator('.fq-row').last().locator('.fq-q').fill('Créneau');
  await page.locator('.fq-row').last().locator('.fq-o').fill('Matin\nSoir');
  assert.ok(await page.evaluate(() => document.querySelector('#sheet').scrollWidth <= innerWidth + 1), 'tient sur 360 px');
  await page.click('#fq-edit > button:not([type=button])');
  await page.waitForSelector('[data-a="formPromo"]');
  const id = await page.evaluate(() => QFORMS[0].id);
  await page.evaluate(id => { S.stack = [{ v: 'forms' }, { v: 'form', id }]; render(); }, id);
  await page.click('#fq-form > button');
  assert.equal(await page.evaluate(id => QREPS.some(r => r.f === id), id), false, 'question obligatoire');
  await page.fill('#fa-' + await page.evaluate(() => QFORMS[0].qs[0].id), 'Inès');
  await page.locator('.fq-opts input[type=radio]').last().check();
  await page.click('#fq-form > button');
  assert.equal(await page.evaluate(id => QREPS.filter(r => r.f === id).length, id), 1);
  await page.evaluate(id => { S.stack = [{ v: 'forms' }, { v: 'formres', id }]; render(); }, id);
  assert.match(await page.textContent('#main'), /1 réponse/);
  await page.click('[data-a="formPromo"]');
  assert.ok(await page.evaluate(() => posts.some(p => p.kind === 'formp')));
  assert.ok(await overflow(page) <= 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('JA : panneau « Tournoi en cours » quand plusieurs tournois se jouent, on passe de l’un à l’autre', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/demo');
  await page.waitForTimeout(400);
  // deux tournois internes commencés (participants inscrits)
  const ids = await page.evaluate(async () => {
    const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
    const out = [];
    for (const name of ['Interne simple messieurs', 'Interne simple dames']) {
      const { id } = await post('/api/tournaments', { kind: 'interne', sport: 'Tennis', name });
      for (let i = 1; i <= 4; i++) await post('/api/t/' + id + '/action', { type: 'int/player/add', payload: { n: 'Joueur ' + i, ks: ['k' + i] } });
      out.push(id);
    }
    return out;
  });
  // la liste des tournois est enregistrée juste après les modifications : on attend qu'elle les montre
  for (let i = 0; i < 60; i++) { const n = await page.evaluate(() => fetch('/api/tournaments').then(r => r.json()).then(d => d.tournaments.filter(t => t.kind === 'interne' && t.players).length)); if (n >= 2) break; await page.waitForTimeout(250); }
  await page.goto(JA + '/t/' + ids[0]);
  await page.waitForSelector('details.enc summary', { timeout: 8000 });
  assert.match(await page.textContent('details.enc summary'), /Interne simple messieurs/);
  await page.click('details.enc summary');
  const noms = await page.$$eval('.enc-l a b', l => l.map(x => x.textContent));
  assert.ok(noms.includes('Interne simple dames') && noms.includes('Interne simple messieurs'), noms.join(', '));
  await page.click('.enc-l a:not([aria-current])');
  await page.waitForURL(new RegExp('/t/' + ids[1]));
  await page.waitForSelector('details.enc summary');
  assert.match(await page.textContent('details.enc summary'), /Interne simple dames/);
  // sur le tableau de bord aussi
  await page.goto(JA + '/dashboard');
  await page.waitForSelector('[data-encours] details.enc', { timeout: 8000 });
  // un 3e et un 4e tournoi en cours ; le 4e est clôturé puis rouvert : la liste suit, sans recharger la page
  const [c, d] = await page.evaluate(async () => {
    const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(r => r.json());
    const out = [];
    for (const name of ['Interne double mixte', 'Interne jeunes']) {
      const { id } = await post('/api/tournaments', { kind: 'interne', sport: 'Tennis', name });
      for (let i = 1; i <= 4; i++) await post('/api/t/' + id + '/action', { type: 'int/player/add', payload: { n: 'Joueur ' + i, ks: ['k' + i] } });
      out.push(id);
    }
    return out;
  });
  for (let i = 0; i < 60; i++) { const n = await page.evaluate(() => fetch('/api/tournaments').then(r => r.json()).then(x => x.tournaments.filter(t => t.kind === 'interne' && t.players && !t.closed).length)); if (n >= 4) break; await page.waitForTimeout(250); }
  await page.goto(JA + '/t/' + ids[0]);
  await page.waitForSelector('details.enc summary');
  await page.click('details.enc summary');
  await page.waitForFunction(() => document.querySelectorAll('.enc-l a').length === 4, null, { timeout: 8000 });
  // la liste a exactement la largeur du bouton, sans coins arrondis ajoutés
  const tailles = await page.evaluate(() => { const s = document.querySelector('details.enc summary').getBoundingClientRect(), l = document.querySelector('.enc-l').getBoundingClientRect(); return { s: Math.round(s.width), l: Math.round(l.width), r: getComputedStyle(document.querySelector('.enc-l')).borderTopLeftRadius, rs: getComputedStyle(document.querySelector('details.enc summary')).borderTopLeftRadius }; });
  assert.ok(Math.abs(tailles.s - tailles.l) <= 1, 'largeur de la liste = largeur du bouton : ' + JSON.stringify(tailles));
  assert.equal(tailles.r, tailles.rs, 'mêmes coins que le bouton');
  await page.evaluate(id => fetch('/api/tournaments/' + id + '/close', { method: 'POST' }), d);
  await page.click('details.enc summary'); await page.click('details.enc summary');   // refermer, rouvrir : relu
  await page.waitForFunction(() => document.querySelectorAll('.enc-l a').length === 3, null, { timeout: 8000 });
  await page.evaluate(id => fetch('/api/tournaments/' + id + '/reopen', { method: 'POST' }), d);
  await page.click('details.enc summary'); await page.click('details.enc summary');
  await page.waitForFunction(() => document.querySelectorAll('.enc-l a').length === 4, null, { timeout: 8000 });
  // sur un tournoi clôturé (ouvert depuis Mes tournois) : les tournois clôturés, et le menu marque « Tournois »
  await page.evaluate(async ([x, y]) => { await fetch('/api/tournaments/' + x + '/close', { method: 'POST' }); await fetch('/api/tournaments/' + y + '/close', { method: 'POST' }); }, [c, d]);
  await page.goto(JA + '/t/' + c);
  await page.waitForSelector('details.enc summary', { timeout: 8000 });
  assert.match(await page.textContent('details.enc summary'), /2 tournois clôturés/);
  // (le lien porte aussi la classe du socle r-rail__it) : « Tournois » marqué, « En cours » non
  assert.ok(await page.evaluate(() => document.querySelector('.rail a[data-r="tournois"]').classList.contains('on') && !document.querySelector('.rail a[data-r="encours"]').classList.contains('on')), 'le menu marque « Tournois »');
  // « En cours » ne mène jamais à un tournoi clôturé
  await page.goto(JA + '/en-cours');
  const vers = new URL(page.url()).pathname.split('/')[2];
  assert.ok(ids.includes(vers), 'En cours ouvre un tournoi non terminé');
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('JA : tournoi interne en tableaux successifs, sections et qualifiés, sans erreur ni débordement', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/demo');
  await page.waitForTimeout(400);
  const id = await page.evaluate(async () => {
    const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
    const { id } = await post('/api/tournaments', { kind: 'interne', sport: 'Tennis', name: 'Interne par séries' });
    const cl = ['NC', '40', '30/5', '30/4', '30/3', '30/2', '30/1', 'NC', '40', '30/4', '30', '15/5', '15/4', '15/1'];
    for (let i = 0; i < cl.length; i++) await post('/api/t/' + id + '/action', { type: 'int/player/add', payload: { n: 'Joueur ' + (i + 1), ks: ['k' + i], cl: cl[i] } });
    await post('/api/t/' + id + '/action', { type: 'int/setup', payload: { struct: [{ max: '30/1', q: 3 }], format: 4 } });
    await post('/api/t/' + id + '/action', { type: 'int/draw', payload: {} });
    return id;
  });
  await page.goto(JA + '/t/' + id);
  await page.waitForSelector('.in-sec h4', { timeout: 8000 });
  assert.equal((await page.$$('.in-sec')).length, 3, 'trois sections au tableau 1');
  assert.ok((await page.textContent('#app')).includes('Qualifié 1 du tableau 1'), 'places des qualifiés au tableau final');
  assert.match(await page.textContent('#app'), /Format 4/);
  if (process.env.CAPTURE) { await page.screenshot({ path: process.env.CAPTURE, fullPage: true }); await page.locator('#app section.card').nth(1).screenshot({ path: process.env.CAPTURE.replace('.png', '-final.png') }); }   // capture à la demande
  // un score impossible est refusé, avec le format
  await page.click('.in-sec button.ab-s[data-m]');
  await page.fill('.in-modal input[name=sc]', '6-3 3-6 7-5');
  await page.check('.in-modal input[name=w]');
  await page.click('.in-modal button.btn');
  await page.waitForSelector('.toast');
  assert.match(await page.textContent('.toast'), /impossible au format 4/);
  assert.deepEqual(errs, []);
  const cookies = await ctx.cookies();
  await ctx.close();
  // même compte sur un téléphone de 360 px
  const tel = await phone();
  await tel.addCookies(cookies);
  const p2 = await tel.newPage();
  await p2.goto(JA + '/t/' + id);
  await p2.waitForSelector('.in-sec h4', { timeout: 8000 });
  assert.ok(await overflow(p2) <= 1, 'pas de débordement sur 360 px');
  await tel.close();
});

test('JA : tournoi interne en poules programmées, puis TMC, sans erreur', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/demo');
  await page.waitForTimeout(400);
  const ids = await page.evaluate(async () => {
    const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
    const out = [];
    for (const [name, setup] of [['Interne en poules', { mode: 'poules', pcfg: { n: 2, q: 1 }, prog: true, terrains: ['Court 1', 'Court 2'] }], ['Interne TMC', { mode: 'tmc' }]]) {
      const { id } = await post('/api/tournaments', { kind: 'interne', sport: 'Tennis', name });
      for (let i = 0; i < 8; i++) await post('/api/t/' + id + '/action', { type: 'int/player/add', payload: { n: 'Joueur ' + (i + 1), ks: ['k' + i], cl: ['15', '15/1', '30', '30/1', '30/2', '40', 'NC', 'NC'][i] } });
      await post('/api/t/' + id + '/action', { type: 'int/setup', payload: setup });
      await post('/api/t/' + id + '/action', { type: 'int/draw', payload: {} });
      out.push(id);
    }
    return out;
  });
  await page.goto(JA + '/t/' + ids[0]);
  await page.waitForSelector('#tab-tableaux .in-poule', { timeout: 8000 });
  assert.equal((await page.$$('#tab-tableaux .in-poule')).length, 2);
  // programmer un match de poule depuis sa fenêtre
  await page.click('#tab-tableaux .in-pm button');
  await page.fill('.in-modal input[name=d]', '2030-05-11');
  await page.fill('.in-modal input[name=h]', '10:00');
  await page.fill('.in-modal input[name=c]', 'Court 1');
  await page.click('#in-pg button.btn');
  await page.click('#nav button[data-tab="programme"]');
  await page.waitForSelector('#tab-programme .in-pg', { timeout: 8000 });
  assert.match(await page.textContent('#app'), /Programme des matchs/);
  assert.match(await page.textContent('#app'), /10h00/);
  await page.goto(JA + '/t/' + ids[1]);
  await page.waitForSelector('.ab', { timeout: 8000 });
  assert.match(await page.textContent('#app'), /Places 5 à 8/);
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('JA : tournoi interne dans « En cours », composition à la main d’un tableau vierge, aucun pictogramme géant', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/demo');
  await page.waitForTimeout(400);
  const id = await page.evaluate(async () => {
    const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
    const { id } = await post('/api/tournaments', { kind: 'interne', sport: 'Tennis', name: 'Interne recopié de MOJA' });
    for (let i = 0; i < 6; i++) await post('/api/t/' + id + '/action', { type: 'int/player/add', payload: { n: 'Joueur ' + (i + 1), ks: ['k' + i], cl: ['15', '15/1', '30', '30/1', '40', 'NC'][i] } });
    return id;
  });
  await page.goto(JA + '/t/' + id + '#tirage');
  await page.waitForSelector('#in-vierge', { timeout: 8000 });
  assert.equal(await page.getAttribute('body', 'data-page'), 'encours', 'la section « En cours » du menu');
  assert.equal(await page.textContent('#nav button.on .lg'), 'Tirage et composition');
  await page.click('#in-vierge');
  await page.waitForSelector('#tab-tirage select[data-line="0"]', { timeout: 8000 });
  assert.match(await page.textContent('#tab-tirage'), /n’est placé dans aucun tableau/);
  // ligne 1 : le joueur 1 ; puis vérifier qu'il apparaît dans l'arbre
  await page.selectOption('#tab-tirage select[data-line="0"]', 'j1');
  await page.waitForFunction(() => document.querySelector('#tab-tirage select[data-line="0"]').value === 'j1');
  await page.click('#nav button[data-tab="tableaux"]');
  assert.match(await page.textContent('#tab-tableaux'), /Joueur 1/);
  // pas de pictogramme démesuré, ici comme sur le tableau de bord
  for (const u of ['/t/' + id, '/dashboard']) {
    await page.goto(JA + u); await page.waitForTimeout(900);
    const gros = await page.evaluate(() => [...document.querySelectorAll('svg')].filter(s => { const r = s.getBoundingClientRect(); return r.width > 64 || r.height > 64; }).length);
    assert.equal(gros, 0, 'pictogramme géant sur ' + u);
  }
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('JA : tournoi interne lancé avec un seul tableau à sections, joueur inscrit en cours, tableau suivant tiré ensuite', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/demo');
  await page.waitForTimeout(400);
  const id = await page.evaluate(async () => {
    const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
    const { id } = await post('/api/tournaments', { kind: 'interne', sport: 'Tennis', name: 'Interne progressif' });
    const cl = ['NC', 'NC', '40', '40', '30/5', '30/5', '30/4', '30/4', '30/3', '30/3'];
    for (let i = 0; i < cl.length; i++) await post('/api/t/' + id + '/action', { type: 'int/player/add', payload: { n: 'Joueur ' + (i + 1), ks: ['k' + i], cl: cl[i] } });
    await post('/api/t/' + id + '/action', { type: 'int/setup', payload: { struct: [{ max: '30/3', q: 4 }] } });
    return id;
  });
  await page.goto(JA + '/t/' + id + '#tirage');
  await page.waitForSelector('[data-tabdraw="auto"]', { timeout: 8000 });
  await page.click('[data-tabdraw="auto"]');
  await page.waitForFunction(() => /Prochain tableau · non publié/.test(document.querySelector('#tab-tirage').textContent), null, { timeout: 8000 });
  // inscrire un joueur classé au-dessus pendant que le tableau 1 se joue
  await page.click('#nav button[data-tab="participants"]');
  assert.match(await page.textContent('#tab-participants'), /classés 30\/2 ou mieux/);
  await page.fill('#in-add input[name=a]', 'Nouveau Venu');
  await page.selectOption('#in-add select[name=cl]', '15/4');
  await page.click('#in-add button.btn');
  await page.waitForFunction(() => document.querySelector('#tab-participants').textContent.includes('Nouveau Venu'), null, { timeout: 8000 });
  // le tableau final (les 4 qualifiés et le nouveau venu) se tire depuis le Tirage
  await page.click('#nav button[data-tab="tirage"]');
  await page.click('#tab-tirage [data-tabdraw="auto"]');
  await page.waitForFunction(() => !document.querySelector('#tab-tirage [data-tabdraw]'), null, { timeout: 8000 });
  await page.click('#nav button[data-tab="tableaux"]');
  assert.match(await page.textContent('#tab-tableaux'), /Tableau final/);
  assert.match(await page.textContent('#tab-tableaux'), /Nouveau Venu/);
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Coach : réglages d’un cycle, remplaçant, séances à planifier, Abonné et états, attribution qui suit le groupe, discussion supprimée', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html?ui=1');
  await page.waitForSelector('#tabs', { state: 'attached', timeout: 8000 });
  // un groupe avec un cycle de 6 séances dont 2 seulement ont une date
  const r = await page.evaluate(() => {
    const g = GROUPS.find(x => x.type === 'train' && !x.once && coIsMe(x.coach));
    const d1 = isoIn(-7), d2 = isoIn(7);
    // un groupe sans créneau (comme un pack individuel) : seules ses dates posées existent
    g.libre = 1; g.extra = []; g.skip = [];
    g.cycles = [{ id: 'cz', nom: 'Hiver', n: 6, dates: [d1, d2], offre: 'pack:p2' }];
    coDateOn(g, d1); coDateOn(g, d2);
    const autre = Object.keys(M).find(k => k !== 'club' && k !== g.coach && M[k].n);
    S.stack = [{ v: 'cgroupe', id: g.id }]; render();
    return { id: g.id, coach: g.coach, autre, d1, d2 };
  });
  console.log('DBG', JSON.stringify(r), errs, await page.evaluate(() => [view(), (document.querySelector('#view, main, body').innerText || '').slice(0, 1500)]));
  await page.waitForSelector('.coplan [data-v="seance"]');
  assert.equal(await page.locator('.coplan [data-v="seance"]').count(), 4, '4 séances à planifier');
  // réglages du cycle : un autre enseignant, un thème, un bilan ; la séance passée garde son enseignant
  await page.click(`[data-a="coCycleCfg"][data-c="cz"]`);
  await page.waitForSelector('#co-cyc');
  await page.evaluate(k => { const s = $('co-cy-co'); s.insertAdjacentHTML('beforeend', `<option value="${k}">x</option>`); s.value = k; }, r.autre);
  await page.fill('#co-cy-th', 'Jeu au filet');
  await page.fill('#co-cy-bi', 'Beaux progrès au filet');
  await page.click('#co-cyc .btn.full');
  const eff = await page.evaluate(x => { const g = grp(x.id); return [REGLES.coachDe(g, x.d1), REGLES.coachDe(g, x.d2), g.cycles[0].theme, g.cycles[0].bilan]; }, r);
  assert.deepEqual(eff, [r.coach, r.autre, 'Jeu au filet', 'Beaux progrès au filet']);
  // remplaçant sur la séance à venir : prioritaire même si le cycle change ensuite
  await page.evaluate(x => { S.stack = [{ v: 'seance', id: x.id + '.' + x.d2 }]; render(); }, r);
  await page.waitForSelector('#co-rp');
  await page.evaluate(k => { const s = $('co-rp'); s.insertAdjacentHTML('beforeend', `<option value="${k}">x</option>`); s.value = k; s.dispatchEvent(new Event('change', { bubbles: true })); }, r.coach);
  assert.equal(await page.evaluate(x => REGLES.coachDe(grp(x.id), x.d2, sesFind(grp(x.id), x.d2)), r), r.coach);
  // une séance à planifier : sa fiche, puis une date ; elle apparaît au planning
  const dp = await page.evaluate(x => { S.stack = [{ v: 'seance', id: x.id + '.p1-cz' }]; render(); return isoIn(14); }, r);
  await page.waitForSelector('#co-aplan');
  await page.fill('#co-ap-t', 'Smash');
  await page.fill('#co-ap-d', dp);
  await page.click('#co-aplan .btn.full');
  const pl = await page.evaluate(([x, d]) => { const g = grp(x.id); return { dans: g.cycles[0].dates.includes(d), theme: (sesFind(g, d) || {}).theme, plan: REGLES.aPlanifier(g, g.cycles[0]).length, planning: coSessions(d, d, 'me', 1).some(s => s.g === g) }; }, [r, dp]);
  assert.deepEqual(pl, { dans: true, theme: 'Smash', plan: 3, planning: true });
  // appel depuis /RAM Club (g.att) : compté par la jauge et les présences de Coach
  const club = await page.evaluate(x => { const g = grp(x.id), k = g.mem[0]; delete (sesFind(g, x.d1) || {}).pres; g.att = { [x.d1]: { [k]: true } }; return { faites: REGLES.cycleEtat(g, g.cycles[0], coCycleSes(g), TODAY).faites, venue: coVenues(k).some(v => v.d === x.d1 && v.gid === g.id) }; }, r);
  assert.deepEqual(club, { faites: 1, venue: true });
  // abonnement en cours : étiquette « Abonné », fréquence enregistrée ; états des attributions
  const ab = await page.evaluate(x => {
    const g = grp(x.id), k = g.mem[0], e = coElGet(k);
    e.achats = [{ id: 'hab', t: 'abo', ref: 'a1', d: isoIn(-10), fin: isoIn(60), nom: 'Academy', freq: 1 }, { id: 'hpk', t: 'pack', ref: 'p1', d: isoIn(-300), n: 1, nom: 'Vieux pack' }];
    S.elTab = 'fiche'; S.stack = [{ v: 'eleve', id: k }]; render();
    return k;
  }, r);
  await page.waitForSelector('.coabocard .tag.coabo');
  assert.match(await page.textContent('.coabocard'), /4 séances par mois/, 'ancienne fréquence par semaine convertie');
  assert.ok(await page.locator('.coabocard .coabsg .coabs i').count() === 4, 'jauge du mois sectionnée en 4');
  assert.match(await page.textContent('.coabocard .coabsg'), /\d\/4 ce mois-ci/);
  assert.ok(await page.locator('.tag.coetat').count() >= 2, 'états affichés');
  await page.click('.coabocard [data-a="coFreq"]');
  await page.fill('#co-fq', '2');
  await page.click('#co-freq .btn.full');
  assert.equal(await page.evaluate(k => coEl(k).achats.find(a => a.id === 'hab').pm, ab), 2);
  // attribution du groupe : un élève qui arrive la reçoit, un élève qui part la garde arrêtée
  const att = await page.evaluate(x => {
    const g = grp(x.id), c = g.cycles[0];
    coCycleAchats(g, c);
    const k = g.mem[0], nouveau = ELEVES.find(e => !M[e.id]) || { id: 'e1' };
    g.ext = (g.ext || []).filter(y => y !== nouveau.id);
    coGrpJoin(g, nouveau.id);
    const a = coEl(nouveau.id).achats.find(h => h.cycle === g.id + ':cz');
    coGrpLeave(g, k);
    return { du: a.du === TODAY, groupe: a.groupe === g.id, sortie: coEl(k).achats.find(h => h.cycle === g.id + ':cz').sortie === TODAY };
  }, r);
  assert.deepEqual(att, { du: true, groupe: true, sortie: true });
  // discussion du groupe : supprimée depuis Coach, puis recréée
  await page.evaluate(x => { S.stack = [{ v: 'cgroupe', id: x.id }]; if (!chans.some(c => c.id === x.id)) A.coChanNew({ id: x.id }); render(); }, r);
  await page.click(`[data-a="coChanDel"][data-id="${r.id}"]`);
  await page.click(`[data-a="coChanDelOk"][data-id="${r.id}"]`);
  assert.equal(await page.evaluate(id => chans.some(c => c.id === id), r.id), false);
  await page.waitForSelector(`[data-a="coChanNew"][data-id="${r.id}"]`);
  await page.click(`[data-a="coChanNew"][data-id="${r.id}"]`);
  assert.equal(await page.evaluate(id => chans.some(c => c.id === id), r.id), true);
  // sur iPad en portrait et sur téléphone : rien ne déborde
  for (const w of [768, 360]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.evaluate(x => { S.stack = [{ v: 'cgroupe', id: x.id }]; render(); }, r);
    assert.ok((await overflow(page)) <= 1, 'débordement à ' + w + ' px');
  }
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Club : l’appel de l’enseignant s’écrit dans la séance, comme dans /RAM Coach', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(DEMO + '/index.html');
  await page.waitForFunction(() => typeof A !== 'undefined' && typeof appelNote === 'function');
  const r = await page.evaluate(() => {
    const g = GROUPS.find(x => x.type === 'train' && !x.once && x.mem.length), k = g.mem[0], d = TODAY;
    A.att({ id: g.id, d, u: k, s: '1' });
    const p1 = (sesDu(g, d) || {}).pres[k], a1 = g.att[d][k];
    A.att({ id: g.id, d, u: k, s: '1' });
    return { p1, a1, p2: ((sesDu(g, d) || {}).pres || {})[k], a2: g.att[d][k] };
  });
  assert.deepEqual(r, { p1: 'P', a1: true, p2: undefined, a2: undefined });
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Coach : une séance change de date et d’heure, seule, sans toucher aux autres du groupe', async () => {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } }), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html?ui=1');
  await page.waitForSelector('#tabs', { state: 'attached', timeout: 8000 });
  const r = await page.evaluate(() => {
    const g = coGroups('', true).find(x => coIsGrp(x) && !coOver(x) && !x.once && x.h && x.h !== '20 h 15'), l = coDates(g, isoIn(1), isoIn(60));
    S.stack = [{ v: 'seance', id: g.id + '.' + l[0] }]; render();
    return { g: g.id, d: l[0], d2: l[1], h: g.h };
  });
  await page.click('[data-a="coMove"]');
  await page.waitForSelector('#co-move #co-mv-h');
  assert.equal(await page.$eval('#co-mv-h', x => x.value), r.h, 'l’heure actuelle est choisie');
  await page.selectOption('#co-mv-h', '20 h 15');
  await page.click('#co-move .btn.full');
  await page.waitForFunction(r => (grp(r.g).hr || {})[r.d] === '20 h 15', r);
  assert.equal(await page.evaluate(r => hAt(grp(r.g), r.d2), r), r.h, 'la séance suivante garde l’heure du groupe');
  assert.equal(await page.evaluate(r => grp(r.g).h, r), r.h, 'le créneau du groupe ne change pas');
  assert.match(await page.textContent('#main'), /20 h 15/, 'la séance affiche sa nouvelle heure');
  // date et heure ensemble : l'heure suit la séance à sa nouvelle date
  const d3 = await page.evaluate(r => { for (let i = 1; i < 7; i++) { const x = isoIn(i, r.d); if (!coDates(grp(r.g), x, x).length) return x; } }, r);
  await page.click('[data-a="coMove"]');
  await page.waitForSelector('#co-move #co-mv-d');
  assert.equal(await page.$eval('#co-mv-h', x => x.value), '20 h 15');
  await page.fill('#co-mv-d', d3);
  await page.selectOption('#co-mv-h', '9 h 45');
  await page.click('#co-move .btn.full');
  await page.waitForFunction(([r, d3]) => (grp(r.g).hr || {})[d3] === '9 h 45', [r, d3]);
  assert.equal(await page.evaluate(r => (grp(r.g).hr || {})[r.d], r), undefined, 'plus rien à l’ancienne date');
  // le planning de la semaine montre la séance à sa nouvelle heure
  const pl = await page.evaluate(([r, d3]) => coSessions(d3, d3, 'me', 1).filter(x => x.g.id === r.g).map(x => hAt(x.g, x.d)), [r, d3]);
  assert.deepEqual(pl, ['9 h 45']);
  assert.deepEqual(errs, []);
  await page.close();
});

test('Coach : un abonnement et ses variantes, dans une seule fenêtre', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 780 } }), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html?ui=1');
  await page.waitForSelector('#tabs', { state: 'attached', timeout: 8000 });
  await page.evaluate(() => { OFFRES.abos = [{ id: 'a1', nom: 'Academy', periode: 'mois', duree: 6, prix: 120, parSemaine: 1 }]; A.open({ v: 'formules' }); A.coAbEdit({ id: 'a1' }); });
  await page.waitForSelector('#co-ab #co-avl .coabv');
  assert.equal(await page.locator('#co-avl .coabv').count(), 1, 'un abonnement simple : une variante');
  await page.click('[data-a="coAbVAdd"]');
  const v2 = page.locator('#co-avl .coabv').nth(1);
  await v2.locator('.co-avn').fill('2 fois par semaine');
  await v2.locator('.co-avw').fill('2');
  await v2.locator('.co-avp').fill('200');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'la fenêtre tient à 360 px');
  await page.click('#co-ab .cotools .btn:not(.ghost)');
  await page.waitForSelector('.coens');
  const l = await page.evaluate(() => OFFRES.abos.map(a => [a.id === 'a1', a.nom, a.ens, a.prix, a.parMois]));
  assert.deepEqual(l, [[true, '4 séances par mois', 'Academy', 120, 4], [false, '2 fois par semaine', 'Academy', 200, 2]], 'la première garde son identifiant (achats des élèves), libellé tout fait');
  // l'ensemble s'ouvre en entier, une variante se retire : il redevient un abonnement simple
  await page.evaluate(() => A.coAbEdit({ id: OFFRES.abos[1].id }));
  await page.waitForSelector('#co-avl .coabv');
  assert.equal(await page.locator('#co-avl .coabv').count(), 2);
  assert.equal(await page.inputValue('#co-an'), 'Academy');
  await page.locator('#co-avl .coabv').nth(1).locator('[data-a="coAbVDel"]').click();
  await page.click('#co-ab .cotools .btn:not(.ghost)');
  await page.waitForFunction(() => OFFRES.abos.length === 1);
  assert.deepEqual(await page.evaluate(() => [OFFRES.abos[0].id, OFFRES.abos[0].nom, OFFRES.abos[0].ens]), ['a1', 'Academy', '']);
  assert.deepEqual(errs, []);
  await page.close();
});

test('Coach : renommer un groupe, objectifs et bilans de cycle sans rappel de bilan de séance, formules en cours à sélectionner, premiers pas cochés à la main', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 780 } }), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html?ui=1');
  await page.waitForSelector('#tabs', { state: 'attached', timeout: 8000 });
  const large = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  // renommer un groupe : sa discussion suit
  const gid = await page.evaluate(() => { const g = coGroups('', true).find(x => coIsGrp(x) && !x.once && chans.some(c => c.id === x.id)) || coGroups('', true).find(x => coIsGrp(x) && !x.once); A.open({ v: 'cgroupe', id: g.id }); return g.id; });
  await page.click('[data-a="coGrpEdit"]');
  await page.waitForSelector('#co-grp #co-gname');
  await page.fill('#co-gname', 'Les Volées du jeudi');
  await page.click('#co-grp .btn.full');
  await page.waitForFunction(id => grp(id).name === 'Les Volées du jeudi', gid);
  assert.ok(await page.evaluate(id => { const c = chans.find(x => x.id === id); return !c || c.name === 'Les Volées du jeudi'; }, gid), 'la discussion porte le nouveau nom');
  // pas de rappel de bilan de séance par défaut ; un cycle qui commence demande ses objectifs, un cycle fini son bilan
  const r = await page.evaluate(id => {
    delete OFFRES.rappelBilans;
    const g = grp(id), l = coDates(g, isoIn(-60), isoIn(60)), pas = l.filter(d => d < TODAY), fut = l.filter(d => d > TODAY);
    g.cycles = [{ id: 'cy1', nom: 'Automne', dates: pas.slice(-3) }, { id: 'cy2', nom: 'Hiver', dates: fut.slice(0, 3) }];
    S.stack = []; A.tab({ t: 'asuivi' });
    return { pas: pas.length, fut: fut.length };
  }, gid);
  assert.ok(r.pas >= 3 && r.fut >= 3);
  await page.waitForSelector('[data-a="coCycleCfg"][data-c="cy1"]');
  assert.equal(await page.locator('[data-a="coCycleCfg"][data-c="cy2"]').count(), 1, 'objectifs à fixer');
  assert.equal(await page.evaluate(() => coBilansTodo(30).length), 0, 'aucun bilan de séance réclamé');
  assert.equal(await page.locator('[data-a="coRappelBil"][aria-pressed="false"]').count(), 1, 'l’option des rappels est là, coupée');
  await page.click('[data-a="coCycleCfg"][data-c="cy2"]');
  await page.waitForSelector('#co-cyc #co-cy-ob');
  await page.fill('#co-cy-ob', 'Monter au filet après le service');
  await page.click('#co-cyc .btn.full');
  await page.waitForFunction(id => (grp(id).cycles.find(c => c.id === 'cy2') || {}).obj === 'Monter au filet après le service', gid);
  await page.waitForFunction(() => !document.querySelector('[data-a="coCycleCfg"][data-c="cy2"]'));
  await page.click('[data-a="coRappelBil"]');
  await page.waitForSelector('[data-a="coRappelBil"][aria-pressed="true"]');
  assert.equal(await page.evaluate(() => OFFRES.rappelBilans), true);
  // formules en cours : étiquettes sous les infos, sélection pour valider le paiement ou supprimer
  const k = await page.evaluate(() => {
    const e = coElGet(coStudents()[0]);
    e.achats = [{ id: 'f1', t: 'pack', ref: 'p1', d: TODAY, nom: 'Pack A', n: 5, prix: 100, pay: { ech: [{ s: 0, m: 100, ok: '' }] } }, { id: 'f2', t: 'pack', ref: 'p1', d: TODAY, nom: 'Pack B', n: 5, prix: 100 }];
    S.stack = []; S.dashTab = 'pay'; A.tab({ t: 'dash' });
    return e.id;
  });
  await page.waitForSelector('[data-a="coSelModeF"]');
  assert.equal(await page.locator('.item .grow .cotags .copay').count() > 0, true, 'les étiquettes sont sous les infos');
  await page.click('[data-a="coSelModeF"]');
  await page.click(`[data-a="coPickF"][data-id="${k}|f1"]`);
  await page.click('[data-a="coPickOkF"]');
  await page.waitForFunction(k => coEl(k).achats.find(a => a.id === 'f1').pay.ech[0].ok === TODAY, k);
  await page.click('[data-a="coSelModeF"]');
  await page.click(`[data-a="coPickF"][data-id="${k}|f2"]`);
  await page.click('[data-a="coPickDelF"]');
  await page.click('[data-a="coPickDelFOk"]');
  await page.waitForFunction(k => !coEl(k).achats.some(a => a.id === 'f2'), k);
  assert.ok(await large(), 'pas de débordement');
  // premiers pas : la case se coche à la main
  await page.evaluate(() => { delete OFFRES.setup; S.stack = []; A.tab({ t: 'today' }); });
  const tick = page.locator('.card.setup .chk[data-a="coSetupTick"]').first();
  if (await tick.count()) {
    const i = await tick.getAttribute('data-i');
    await tick.click();
    await page.waitForFunction(i => (OFFRES.setup || []).includes(+i), i);
    assert.equal(await page.locator('.cosheet, #sheet.on').count(), 0, 'la case ne déclenche pas l’ouverture de l’étape');
  }
  assert.deepEqual(errs, []);
  await page.close();
});

test('Coach : statistiques — séances réalisées, heures, élèves, nouveaux élèves, sur le mois, le mois dernier, le trimestre ou la saison', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 780 } }), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html?ui=1');
  await page.waitForSelector('#tabs', { state: 'attached', timeout: 8000 });
  // un élève qui prend son tout premier cours ce mois-ci
  const k = await page.evaluate(() => {
    const x = coSessions(TODAY.slice(0, 8) + '01', TODAY).filter(s => !isCx(s.g, s.d))[0], s = sesGet(sesKey(x.g, x.d));
    s.pres = Object.assign({}, s.pres, { nouveau1: 'P' });
    S.stack = []; S.dashTab = 'act'; S.dashP = 'mois'; A.tab({ t: 'dash' }); render(true);
    return 'nouveau1';
  });
  await page.waitForSelector('[data-a="coDashP"][data-v="mprec"]');
  assert.deepEqual(await page.$$eval('[data-a="coDashP"]', l => l.map(b => b.dataset.v)), ['mois', 'mprec', 'tcur', 'saison'], 'les quatre filtres');
  const tuiles = () => page.$$eval('#main .cotiles .cotile', l => l.slice(0, 4).map(t => t.innerText.replace(/\s+/g, ' ').trim()));
  const t1 = await tuiles();
  assert.match(t1[0], /SÉANCES? RÉALISÉES?/i);
  assert.match(t1[1], /HEURES D’ENSEIGNEMENT/i);
  assert.match(t1[2], /PRIS DES COURS/i);
  assert.match(t1[3], /^1 NOUVEL ÉLÈVE/i, 'son tout premier cours est ce mois-ci');
  assert.equal(await page.locator(`#main [data-a="open"][data-v="eleve"][data-id="${k}"]`).count() > 0, true, 'il est dans la liste des nouveaux');
  // le mois dernier : il n'y est pas ; les chiffres suivent la période
  await page.click('[data-a="coDashP"][data-v="mprec"]');
  await page.waitForSelector('[data-a="coDashP"][data-v="mprec"][aria-pressed="true"]');
  const t2 = await tuiles();
  assert.match(t2[3], /^0 NOUVEL ÉLÈVE/i);
  const n = await page.evaluate(() => { const [a, b] = coPeriod('mprec'); return coSessions(a, b).filter(x => !isCx(x.g, x.d)).length; });
  assert.equal(parseInt(t2[0], 10), n, 'les séances du mois dernier');
  await page.click('[data-a="coDashP"][data-v="tcur"]');
  await page.waitForSelector('[data-a="coDashP"][data-v="tcur"][aria-pressed="true"]');
  await page.click('[data-a="coDashP"][data-v="saison"]');
  await page.waitForSelector('[data-a="coDashP"][data-v="saison"][aria-pressed="true"]');
  assert.match((await tuiles())[3], /^1 NOUVEL ÉLÈVE/i);
  // les autres périodes dans un menu
  await page.click('[data-a="coDashAutre"]');
  await page.click('#sheet [data-a="coDashP"][data-v="an"]');
  await page.waitForSelector('[data-a="coDashAutre"][aria-pressed="true"]');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'pas de débordement à 360 px');
  assert.deepEqual(errs, []);
  await page.close();
});

test('Coach : durée d’une séance ou de tout son cycle ; thèmes sans propositions ; sous-menu jamais replié ; filet contre l’écran blanc', async () => {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } }), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html?ui=1');
  await page.waitForSelector('#tabs', { state: 'attached', timeout: 8000 });
  const r = await page.evaluate(() => {
    const g = coGroups('', true).find(x => coIsGrp(x) && !coOver(x) && !x.once && x.dur && x.dur !== '1 h 45'), l = coDates(g, isoIn(1), isoIn(60));
    g.cycles = [{ id: 'cd', nom: 'Printemps', dates: l.slice(0, 3) }];
    delete g.du;
    S.stack = [{ v: 'seance', id: g.id + '.' + l[0] }]; render();
    return { g: g.id, d: l[0], d2: l[1], d4: l[3], dur: g.dur };
  });
  // thèmes : aucune liste de propositions
  assert.equal(await page.locator('#co-th[list], datalist').count(), 0, 'pas de propositions de thème');
  assert.equal(await page.getAttribute('#co-th', 'autocomplete'), 'off');
  // cette séance seulement
  await page.click('[data-a="coMove"]');
  await page.waitForSelector('#co-move #co-mv-du');
  assert.equal(await page.$eval('#co-mv-du', x => x.value), r.dur, 'la durée actuelle est choisie');
  await page.selectOption('#co-mv-du', '1 h 45');
  await page.click('#co-move .btn.full');
  await page.waitForFunction(r => durAt(grp(r.g), r.d) === '1 h 45', r);
  assert.equal(await page.evaluate(r => durAt(grp(r.g), r.d2), r), r.dur, 'les autres séances gardent leur durée');
  assert.match(await page.textContent('#main'), /1 h 45/);
  // tout le cycle
  await page.click('[data-a="coMove"]');
  await page.waitForSelector('#co-move #co-mv-cy');
  await page.selectOption('#co-mv-du', '45 min');
  await page.check('#co-mv-cy');
  await page.click('#co-move .btn.full');
  await page.waitForFunction(r => grp(r.g).cycles[0].dur === '45 min', r);
  assert.deepEqual(await page.evaluate(r => [durAt(grp(r.g), r.d), durAt(grp(r.g), r.d2), durAt(grp(r.g), r.d4)], r), ['45 min', '45 min', r.dur], 'tout le cycle, et rien d’autre');
  // le planning de la semaine dessine la séance avec sa durée
  assert.equal(await page.evaluate(r => coSessions(r.d, r.d, 'me', 1).filter(x => x.g.id === r.g).map(x => durMin(durAt(x.g, x.d)))[0], r), 45);
  // sous-menu : plus de bouton pour le replier
  await page.evaluate(() => { S.stack = []; A.tab({ t: 'eleves' }); });
  await page.waitForTimeout(300);
  assert.equal(await page.locator('[data-a="subFold"]').count(), 0, 'le sous-menu ne se replie pas');
  assert.deepEqual(errs, []);
  await page.close();
  // filet : une appli qui ne démarre pas propose de se recharger au lieu de rester blanche
  const p2 = await browser.newPage({ viewport: { width: 360, height: 760 } });
  await p2.route(/\/(b-[0-9a-f]{16}|app\/8-demarrage)\.js$/, rt => rt.abort());
  await p2.goto(JA + '/club/demo');
  await p2.waitForSelector('[role="alert"] button', { timeout: 15000 });
  assert.match(await p2.textContent('[role="alert"]'), /n’a pas pu démarrer/);
  await p2.close();
});

/* ---------- /Dojo : nouvelle organisation, à l'essai derrière ?ui=2 ---------- */
test('Dojo ?ui=2 : 5 rubriques partout, Statistiques en sous-onglet, Réglages hors du menu, choix mémorisé', async () => {
  for (const w of [1440, 1194, 360]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 820 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', x => errs.push(x.message));
    await page.goto(JA + '/club/coach.html?ui=2');
    await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
    assert.deepEqual(await page.$$eval('#tabs button[data-t]', l => l.map(b => b.dataset.t)), ['today', 'planning', 'eleves', 'clubs', 'msgs'], 'les 5 rubriques');
    assert.equal(await page.locator('#tabs button[data-t="clubs"]').isVisible(), true, 'Groupes visible');
    assert.equal(await page.locator('#tabs .coplus').count(), 0, 'plus de « Plus »');
    await page.click('.u2sous button[data-t="dash"]');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => S.tab), 'dash', 'Statistiques depuis le sous-onglet');
    assert.equal(await page.getAttribute('#tabs button[data-t="today"]', 'aria-current'), 'page', 'Aujourd’hui reste allumé');
    assert.equal(await page.locator('#main [data-k="dashTab"]').count(), 0, 'plus d’intercalaire Paiements (activité seule)');
    await page.click(w > 1000 ? '.rbot button[data-t="me"]' : '#top .u2gear');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => S.tab), 'me', 'Réglages');
    await page.evaluate(() => { S.tab = 'eleves'; S.stack = []; render(); });
    assert.equal(await page.locator('[aria-label="Formules et tarifs"], [aria-label="Échelles techniques"]').count(), 0, 'sous-menu Élèves sans doublons');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'pas de débordement');
    // ?ui=1 revient à l'ancienne organisation en secours, et ce choix reste sur l'appareil
    await page.goto(JA + '/club/coach.html?ui=1');
    await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
    assert.equal(await page.evaluate(() => TABBAR.length), 8, 'ancienne organisation');
    await page.goto(JA + '/club/coach.html');
    await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.ui), '1', 'secours mémorisé');
    // sur un appareil neuf, la nouvelle organisation s'affiche sans rien ajouter à l'adresse
    const neuf = await browser.newPage({ viewport: { width: w, height: 820 } });
    await neuf.goto(JA + '/club/coach.html');
    await neuf.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
    assert.equal(await neuf.evaluate(() => document.documentElement.dataset.ui), '2', 'nouvelle organisation par défaut');
    await neuf.close();
    assert.deepEqual(errs, []);
    await ctx.close();
  }
});

test('Dojo ?ui=2 : Aujourd’hui (prochaine séance et appel, semaine, À faire, mois) et « Nouveau » à quatre choix', async () => {
  for (const w of [1440, 360]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 820 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', x => errs.push(x.message));
    await page.goto(JA + '/club/coach.html?ui=2');
    await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
    await page.evaluate(() => { S.tab = 'today'; S.stack = []; render(); });
    assert.equal(await page.locator('#main .cotiles, #main .coshort3').count(), 0, 'plus de petits chiffres ni de raccourcis');
    assert.ok(await page.locator('#main .u2mois').isVisible(), 'le mois en chiffres');
    if (await page.locator('#main .u2next').count()) assert.ok(await page.locator('.u2next [data-v="seance"]').isVisible(), 'Faire l’appel en un clic');
    await page.click('#top [data-a="u2New"]');
    await page.waitForSelector('.u2new');
    assert.deepEqual(await page.$$eval('.u2new > button', l => l.map(b => b.dataset.a)), ['coNewSes', 'coNewGrp', 'nvNew', 'coPdPick'], 'quatre choix, dont la partie dirigée');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'pas de débordement');
    // partie dirigée déjà complète : placée dans l'agenda sans joueur, sans recherche
    await page.click('.u2new > [data-a="coPdPick"]');
    await page.waitForSelector('.u2new [data-a="coNewSes"][data-pd="1"]');
    assert.equal(await page.locator('.u2new [data-a="nvNew"][data-m="partie"]').count(), 1, 'chercher des joueurs reste possible');
    await page.click('.u2new [data-a="coNewSes"][data-pd="1"]');
    await page.waitForSelector('#co-sesnew[data-pd="1"]');
    const n0 = await page.evaluate(() => GROUPS.length);
    await page.click('#co-sesnew button.btn.full');
    await page.waitForFunction(n => GROUPS.length === n + 1, n0);
    const g = await page.evaluate(() => GROUPS[GROUPS.length - 1]);
    assert.equal(g.name, 'Partie dirigée');
    assert.equal(g.pd, 1);
    assert.ok(g.once && !g.mem.length, 'une date, aucun joueur obligatoire');
    assert.equal(g.tarif.mode, 'eleve', 'prix par joueur');
    assert.deepEqual(errs, []);
    await ctx.close();
  }
});

test('Dojo ?ui=2 : la séance garde l’appel en vue et range ses actions dans « Modifier la séance »', async () => {
  for (const w of [1440, 360]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 820 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', x => errs.push(x.message));
    await page.goto(JA + '/club/coach.html?ui=2');
    await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
    const ok = await page.evaluate(() => { const x = coSessions(isoIn(-30), isoIn(30), 'me', 1).filter(x => !isCx(x.g, x.d)).pop(); if (!x) return false; S.tab = 'planning'; S.stack = [{ v: 'seance', id: sesKey(x.g, x.d) }]; render(); return true; });
    if (ok) {
      assert.equal(await page.locator('#main .coacts, #main #co-rp').count(), 0, 'plus de grille d’actions ni de remplaçant dans la fiche');
      await page.click('[data-a="u2Mod"]');
      await page.waitForSelector('#layer .coacts');
      assert.ok(await page.locator('#layer [data-a="cancelCourse"]').count() === 1, 'annuler dans le menu');
      assert.ok(await page.locator('#layer [data-a="coMove"]').count() === 1, 'date, heure, durée dans le menu');
    }
    assert.deepEqual(errs, []);
    await ctx.close();
  }
});

test('Dojo ?ui=2 : À encaisser dans Élèves, pastilles de formule, « Noter un achat » en quelques champs', async () => {
  for (const w of [1440, 360]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 820 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', x => errs.push(x.message));
    await page.goto(JA + '/club/coach.html?ui=2');
    await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
    const k = await page.evaluate(() => { const e = ELEVES.find(x => coInClub(x)); if (!e) return null; e.achats = (e.achats || []).concat([{ id: 'essai-du', t: 'pack', ref: (OFFRES.packs[0] || {}).id, nom: 'Pack essai', n: 5, d: isoIn(-20), prix: 100, pay: { ech: [{ s: 0, m: 40, ok: '' }] } }]); S.tab = 'eleves'; S.elF = 'pay'; S.stack = []; render(); return e.id; });
    if (k) {
      assert.ok(await page.locator('[data-a="coElF"][data-v="pay"]').count() === 1, 'entrée À encaisser');
      assert.ok((await page.textContent('#main .u2enc')).includes('40'), 'le montant dû apparaît');
      await page.evaluate(id => { S.elF = 'all'; render(); A.coAchat({ id }); }, k);
      await page.waitForSelector('#co-ac .u2opt');
      assert.equal(await page.locator('#co-ac .u2opt #co-ax').count(), 1, 'le prix différent est replié');
      // un pack pour un seul élève ne crée plus de groupe : l'achat porte le cycle, les séances sont des cours rattachés
      assert.equal(await page.locator('#co-aplf').count(), 0, 'plus de case « séances à planifier »');
      const apres = await page.evaluate(id => {
        const avant = GROUPS.length, op = [...document.querySelectorAll('#co-ao option')].find(o => /^pack/.test(o.value));
        if (!op) return null;
        $('co-ao').value = op.value;
        const e = coEl(id), n0 = (e.achats || []).length;
        $('co-ac').requestSubmit();
        return { groupes: GROUPS.length - avant, achats: coEl(id).achats.length - n0, lie: coEl(id).achats.slice(n0).some(a => a.cycle || a.groupe) };
      }, k);
      if (apres && apres.achats) { assert.equal(apres.groupes, 0, 'aucun groupe créé'); assert.equal(apres.lie, false, 'achat sans lien à un groupe'); }
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'pas de débordement');
    assert.deepEqual(errs, []);
    await ctx.close();
  }
});

test('Dojo ?ui=2 : groupe sans tarif affiché, formule demandée groupe par groupe, « Nouveau cycle »', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 820 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html?ui=2');
  await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
  const id = await page.evaluate(() => { const g = coGroups('', true).find(g => coIsGrp(g) && !coOver(g)); if (!g) return null; delete g.offre; (g.cycles || []).forEach(c => delete c.offre); S.tab = 'clubs'; S.grTab = 'formule'; S.stack = [{ v: 'cgroupe', id: g.id }]; render(); return g.id; });
  if (id) {
    assert.equal(await page.locator('#main .u2fo [data-a="coGrpOf"]').count(), 1, 'formule à choisir');
    assert.ok(!(await page.textContent('#main')).includes('Tarif à renseigner'), 'plus de tarif du groupe');
    assert.ok((await page.textContent('#main')).includes('Nouveau cycle'), 'Nouveau cycle');
    await page.evaluate(g => A.coGrpEdit({ id: g }), id);
    assert.equal(await page.locator('#layer #co-prix').isVisible(), false, 'tarif caché dans Modifier');
    await page.evaluate(() => { closeSheet(); S.tab = 'today'; S.stack = []; render(); });
    assert.ok((await page.textContent('#main .cobside')).includes('Formule à choisir'), 'rappel dans À faire');
  }
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Dojo ?ui=2 : liste des élèves en une colonne avec aperçu à droite, fiche ouverte depuis l’aperçu, onglets Séances et Échanges', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 820 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html?ui=2');
  await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
  await page.evaluate(() => { S.tab = 'eleves'; S.elF = 'all'; S.stack = []; render(); });
  assert.equal(await page.locator('#main .coprev').count(), 1, 'l’aperçu de l’élève choisi à droite');
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector('#main .cobm .colist')).gridTemplateColumns.split(' ').length);
  assert.equal(cols, 1, 'une seule colonne de liste');
  await page.click('#main .item[data-v="eleve"] >> nth=1');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => view().v), 'eleves', 'un clic choisit l’élève, sans quitter la liste');
  await page.click('#main .coprev [data-a="coOpenEl"]');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => view().v), 'eleve', '« Ouvrir la fiche » : la fiche');
  assert.ok(await page.locator('[data-k="elTab"][data-val="histo"]').first().textContent().then(t => t.includes('Séances')), 'onglet Séances');
  assert.ok(await page.locator('[data-k="elTab"][data-val="suivi"]').first().textContent().then(t => t.includes('Échanges')), 'onglet Échanges');
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Dojo ?ui=2 : Messages sur grand écran, la conversation ouverte à côté de la liste, et on y répond', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 820 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html?ui=2');
  await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
  await page.evaluate(() => { S.tab = 'msgs'; S.msTab = 'eleves'; S.stack = []; render(); });
  if (await page.locator('.u2split').count()) {
    assert.ok(await page.locator('.u2split .splitchat .schb').isVisible(), 'la conversation à droite');
    if (await page.locator('#u2dm-in').count()) {
      await page.fill('#u2dm-in', 'Message d’essai');
      await page.click('#u2dm .send');
      await page.waitForTimeout(300);
      assert.ok((await page.textContent('.u2split .schb')).includes('Message d’essai'), 'le message apparaît');
      assert.equal(await page.evaluate(() => S.stack.length), 0, 'on reste sur la page Messages');
    }
  }
  assert.deepEqual(errs, []);
  await ctx.close();
});

/* ---------- liste déroulante maison (club/liste.js) : même largeur et même style que la boîte d'où elle part ---------- */
test('Liste déroulante : largeur et style de la boîte, choix pris en compte, Échap la referme', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const { page, errors } = await openPage(ctx, JA + '/demo');
  const id = new URL(page.url()).pathname.split('/')[2];
  await page.goto(`${JA}/t/${id}`);
  await page.waitForTimeout(600);
  const sel = page.locator('select:visible').first();
  await sel.click();
  const box = page.locator('.rl');
  await box.waitFor();
  const m = await page.evaluate(() => {
    const s = [...document.querySelectorAll('select')].find(e => e.offsetParent), b = document.querySelector('.rl');
    const a = s.getBoundingClientRect(), c = b.getBoundingClientRect(), x = getComputedStyle(s), y = getComputedStyle(b);
    return { w: [a.width, c.width], l: [a.left, c.left], radius: [x.borderRadius, y.borderRadius], font: [x.fontFamily, y.fontFamily], border: [x.borderTopWidth, y.borderTopWidth] };
  });
  for (const k of ['w', 'l', 'radius', 'font', 'border']) assert.equal(m[k][0], m[k][1], 'la liste doit reprendre : ' + k);
  const avant = await sel.inputValue();
  await box.locator('button[data-i]:not([aria-selected="true"])').first().click();
  assert.notEqual(await sel.inputValue(), avant, 'le choix change la valeur du select');
  await sel.click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.rl:visible').count(), 0, 'Échap referme la liste');
  assert.deepEqual(errors, []);
  await ctx.close();
});

/* ---------- Dojo, Aujourd'hui : l'appel sur la carte de la séance ; intercalaires collés sur téléphone ; onglet Abonnés ---------- */
test('Dojo Aujourd’hui : appel direct sur la carte (Présent / Absent enregistrés aussitôt), intercalaires de classeur sur téléphone, onglet Abonnés', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html');
  await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
  await page.evaluate(() => { S.tab = 'today'; S.stack = []; render(); });
  // une carte par séance du jour, avec l'élève, son nom et ses deux raccourcis
  const n = await page.evaluate(() => coSessions(TODAY, TODAY, 'me', 1).length);
  assert.equal(await page.locator('#main .u2ap').count(), n, 'une carte par séance du jour');
  assert.equal(await page.locator('#main .u2apr').first().locator('[data-a="coPres"]').count(), 2, 'Présent et Absent');
  assert.equal(await page.locator('#main .u2ap [data-v="seance"]').first().isVisible(), true, 'toucher la carte ouvre la séance');
  assert.equal(await page.locator('#main .u2ap [data-a="coOpenChan"]').first().isVisible(), true, 'Écrire au groupe reste sur la carte');
  assert.equal(await page.locator('#main [data-a="coNewGrpMsg"]').count(), 0, 'plus de gros bouton Écrire au groupe');
  // un clic enregistre aussitôt, par la même action que la page de la séance
  const cible = await page.evaluate(() => { const b = document.querySelector('.u2ap .u2apb button[data-s="A"]'); return { id: b.dataset.id, k: b.dataset.k }; });
  await page.locator(`.u2ap .u2apb button[data-s="A"][data-k="${cible.k}"]`).first().click();
  assert.equal(await page.evaluate(c => (sesGet(c.id).pres || {})[c.k], cible), 'A', 'absence enregistrée');
  assert.equal(await page.locator(`.u2ap .u2apb button.on.A[data-k="${cible.k}"]`).count() > 0, true, 'retour visuel sur le bouton');
  // intercalaires : collés à la carte, avec le dessin de l'ordinateur (onglet actif à liseré citron, pas de bandeau segmenté)
  const seg = await page.evaluate(() => { const s = document.querySelector('#main > .seg.u2sous'), b = s.querySelector('button[aria-selected="true"]'), c = document.querySelector('#main .card').getBoundingClientRect(), r = b.getBoundingClientRect(), cs = getComputedStyle(s); return { ecart: Math.abs(c.top - r.bottom), fond: cs.backgroundColor, borderBottom: getComputedStyle(b).borderBottomWidth }; });
  assert.ok(seg.ecart <= 2, 'intercalaire collé au haut de la carte : ' + seg.ecart);
  assert.equal(seg.fond, 'rgba(0, 0, 0, 0)', 'plus de bandeau coloré derrière les onglets');
  assert.equal(seg.borderBottom, '0px', 'onglet sans trait dessous');
  // Élèves : quatrième onglet « Abonnés », avec son compteur, qui liste les abonnés
  await page.evaluate(() => { const e = coEl(ELEVES[0].id); e.achats = [{ id: 'ab-test', t: 'abo', ref: 'x', d: isoIn(-10), nom: 'Abonnement', prix: 40 }]; S.tab = 'eleves'; S.stack = []; S.elF = 'all'; render(); });
  const tab = page.locator('#main .seg [data-v="abo"], #subnav .seg [data-v="abo"]').first();
  assert.equal((await tab.textContent()).replace(/\d+/g, '').trim(), 'Abonnés', 'onglet Abonnés');
  assert.equal(await tab.locator('.cnt').textContent(), '1', 'compteur');
  await tab.click();
  assert.equal(await page.locator('#main .colist .item[data-v="eleve"]').count(), 1, 'un seul abonné listé');
  // « En activité » : un pack en cours ; l'ordre des onglets est Tous, En activité, Abonnés, Sans compte, À encaisser
  await page.evaluate(() => { const e = coEl(ELEVES[1].id); e.achats = [{ id: 'pk-test', t: 'pack', ref: 'p1', d: isoIn(-5), n: 5, nom: 'Pack', prix: 100 }]; S.elF = 'all'; render(); });
  const ordre = await page.evaluate(() => [...document.querySelectorAll('#main .seg [role="tab"], #subnav .seg [role="tab"]')].map(b => b.getAttribute('aria-label')));
  assert.deepEqual(ordre, ['Tous les élèves', 'En activité', 'Abonnés', 'Sans compte', 'À encaisser'], 'ordre des onglets');
  await page.locator('#main .seg [data-v="act"], #subnav .seg [data-v="act"]').first().click();
  assert.equal(await page.locator('#main .colist .item[data-v="eleve"]').count(), 1, 'un seul élève en activité (le pack en cours)');
  assert.deepEqual(errs, []);
  await ctx.close();
});

/* ---------- Dojo : séance orpheline (groupe disparu) : lisible, ouvrable, supprimable ---------- */
test('Dojo : une séance dont le groupe a disparu s’ouvre en lecture (date, heure, thème, présence) et se supprime ; la suppression d’un groupe garde sa trace', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html');
  await page.waitForFunction(() => typeof S !== 'undefined' && typeof coGroups === 'function', null, { timeout: 8000 });
  await page.waitForTimeout(1500);
  const k = await page.evaluate(() => {
    document.querySelector('.ram-splash')?.remove();
    const k = ELEVES[0].id, d = isoIn(-5);
    SEANCES.push({ id: 'orph.' + d, g: 'orph', d, gnom: 'Cycle d’entraînement individuel', gh: '18 h', gdur: '1 h 30', theme: 'Volée / Bandeja', pres: { [k]: 'P' } });
    S.tab = 'eleves'; S.elTab = 'histo'; S.stack = [{ v: 'eleve', id: k }]; render();
    return k;
  });
  // la carte de l'historique porte le nom gardé ; un toucher ouvre la séance en lecture
  assert.ok((await page.locator('#main .u2hs', { hasText: 'Cycle d’entraînement individuel' }).count()) >= 1, 'nom gardé dans l’historique');
  await page.evaluate(k => { A.open({ v: 'seance', id: 'orph.' + isoIn(-5) }); }, k);
  await page.waitForTimeout(300);
  const txt = await page.locator('#main').textContent();
  assert.ok(!/introuvable/i.test(txt), 'plus de « Séance introuvable »');
  for (const mot of ['Volée / Bandeja', 'Cycle d’entraînement individuel', '18 h', '1 h 30', 'Présent']) assert.ok(txt.includes(mot), 'la vue montre : ' + mot);
  // suppression depuis la page : retour à la fiche, bandeau, annulation possible
  await page.locator('#main [data-a="u2SesDel"]').click();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => SEANCES.some(s => s.id.startsWith('orph.'))), false, 'séance supprimée');
  assert.equal(await page.evaluate(() => view().v), 'eleve', 'retour à la fiche de l’élève');
  await page.locator('#u2undo button').click();
  assert.equal(await page.evaluate(() => SEANCES.some(s => s.id.startsWith('orph.'))), true, 'annuler la rétablit');
  // supprimer un groupe laisse une trace autonome complète sur ses séances gardées
  const r = await page.evaluate(() => {
    const g = coGroups('', true).find(g => coIsGrp(g) && !coOver(g)), d = isoIn(-4), id = g.id + '.' + d;
    sesGet(id).pres = { [coStu(g)[0]]: 'P' };
    A.coGrpDelOk({ id: g.id });
    const s = SEANCES.find(x => x.id === id);
    return { nom: g.name, gnom: s.gnom, gh: s.gh, gdur: s.gdur, groupe: !!grp(g.id) };
  });
  assert.equal(r.groupe, false);
  assert.deepEqual([r.gnom, !!r.gh, !!r.gdur], [r.nom, true, true], 'nom, heure et durée gardés sur la séance');
  assert.deepEqual(errs, []);
  await ctx.close();
});

/* ---------- Dojo : supprimer une séance de l'historique d'un élève (glissement, corbeille, annulation) ---------- */
test('Historique d’un élève : glissement vers la gauche pour supprimer, défilement vertical libre, annulation, corbeille au survol et clavier sur ordinateur', async () => {
  const preparer = async page => page.evaluate(() => {
    document.querySelector('.ram-splash')?.remove();
    const k = ELEVES[0].id;
    for (const [i, d] of [[1, isoIn(-3)], [2, isoIn(-6)]]) {
      GROUPS.push({ id: 'gsw' + i, type: 'train', name: 'Cours test ' + i, once: d, day: 1, h: '18 h', dur: '1 h', sport: 'Padel', coach: ME(), mem: M[k] ? [k] : [], ext: M[k] ? [] : [k] });
      SEANCES.push({ id: 'gsw' + i + '.' + d, g: 'gsw' + i, d, pres: { [k]: 'P' } });
    }
    S.tab = 'eleves'; S.elTab = 'histo'; S.stack = [{ v: 'eleve', id: k }]; render();
    return { k, n: SEANCES.length, g: GROUPS.length };
  });
  // ---- téléphone : toucher réel (CDP)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html');
  await page.waitForFunction(() => typeof S !== 'undefined' && typeof coGroups === 'function', null, { timeout: 8000 });
  await page.waitForTimeout(1500);
  const base = await preparer(page);
  const cdp = await ctx.newCDPSession(page);
  const geste = async (x0, y0, x1, y1, pas = 6) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= pas; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / pas, y: y0 + ((y1 - y0) * i) / pas }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
  };
  const centre = async n => { const b = await page.locator('#main .u2sw > .u2hs').nth(n).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width }; };
  await page.evaluate(() => { const m = document.getElementById('main'), e = document.querySelector('#main .u2sw'); m.scrollTop += e.getBoundingClientRect().top - 220; });   // les cartes hors de la barre du bas
  await page.waitForTimeout(300);
  assert.ok((await page.locator('#main .u2sw').count()) >= 2, 'des séances à supprimer');
  // défilement vertical : le geste ne doit rien ouvrir
  let c = await centre(0);
  await geste(c.x, c.y, c.x - 6, c.y - 60);
  assert.equal(await page.locator('#main .u2sw.open').count(), 0, 'un geste vertical n’ouvre pas la corbeille');
  // glissement moyen : la corbeille apparaît, une seule carte ouverte à la fois
  c = await centre(0);
  await geste(c.x + 60, c.y, c.x - 20, c.y + 4);
  assert.equal(await page.locator('#main .u2sw.open').count(), 1, 'la corbeille est révélée');
  c = await centre(1);
  await geste(c.x + 60, c.y, c.x - 20, c.y + 4);
  assert.equal(await page.locator('#main .u2sw.open').count(), 1, 'un seul élément ouvert à la fois');
  // toucher la corbeille : suppression, bandeau, annulation
  await page.locator('#main .u2sw.open .u2swd').tap();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => SEANCES.length), base.n - 1, 'séance supprimée');
  assert.equal(await page.locator('#u2undo').isVisible(), true, 'bandeau « Annuler »');
  await page.locator('#u2undo button').tap();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => [SEANCES.length, GROUPS.length]).then(a => a.join()), [base.n, base.g].join(), 'annuler rétablit la séance et son cours');
  // glissement long et complet : suppression directe
  c = await centre(1);
  await geste(c.x + c.w / 2 - 10, c.y, c.x - c.w / 2 + 5, c.y + 3);
  assert.equal(await page.evaluate(() => SEANCES.length), base.n - 1, 'un long glissement supprime directement');
  assert.deepEqual(errs, []);
  await ctx.close();
  // ---- ordinateur : corbeille au survol, suppression au clavier
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }), dp = await dctx.newPage();
  await dp.goto(JA + '/club/coach.html');
  await dp.waitForFunction(() => typeof S !== 'undefined' && typeof coGroups === 'function', null, { timeout: 8000 });
  await dp.waitForTimeout(1500);
  const b2 = await preparer(dp);
  const carte = dp.locator('#main .u2sw > .u2hs', { hasText: 'Cours test 1' }).first(), corbeille = dp.locator('#main .u2sw', { hasText: 'Cours test 1' }).first().locator('.u2swd');
  assert.equal(await corbeille.evaluate(e => getComputedStyle(e).opacity), '0', 'corbeille cachée au repos');
  await carte.hover();
  await dp.waitForTimeout(350);
  assert.equal(await corbeille.evaluate(e => getComputedStyle(e).opacity), '1', 'corbeille visible au survol');
  await carte.focus();
  await dp.keyboard.press('Delete');
  await dp.waitForTimeout(300);
  assert.equal(await dp.evaluate(() => SEANCES.length), b2.n - 1, 'Suppr supprime la séance au clavier');
  await dctx.close();
});

/* ---------- Dojo : programmer une séance depuis la fiche d'un élève, rattachée à un achat ---------- */
test('Dojo : « Programmer une séance » sur la fiche élève, achat présélectionné, séance rattachée et décomptée, achat attribué si besoin (390 et 1280 px)', async () => {
  for (const largeur of [390, 1280]) {
    const ctx = await browser.newContext(largeur < 700 ? { viewport: { width: largeur, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: largeur, height: 860 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', x => errs.push(x.message));
    await page.goto(JA + '/club/coach.html');
    await page.waitForFunction(() => typeof S !== 'undefined' && typeof coGroups === 'function', null, { timeout: 8000 });
    await page.waitForTimeout(1200);
    const ids = await page.evaluate(() => {
      document.querySelector('.ram-splash')?.remove();
      const [a, b] = [ELEVES[0].id, ELEVES[1].id];
      OFFRES.formules.push({ id: 'ftest', nom: 'Cours individuel test', sport: 'Padel', joueurs: 1, duree: 75, prix: 40, par: 'seance' });
      OFFRES.packs.push({ id: 'ptest', formule: 'ftest', nom: 'Pack test 10 séances', seances: 10, prix: 350 });
      coEl(a).achats = [{ id: 'a-prog', t: 'pack', ref: 'ptest', d: isoIn(-30), n: 10, nom: 'Pack test 10 séances', prix: 350, pay: { ech: [{ s: 0, m: 350, ok: isoIn(-30) }] } }];
      coEl(b).achats = [];
      S.tab = 'eleves'; S.elTab = 'fiche'; S.stack = [{ v: 'eleve', id: a }]; render();
      return { a, b };
    });
    // le bouton est bien visible près de « Modifier la fiche »
    assert.equal(await page.locator('#main [data-a="u2Prog"]').isVisible(), true, 'bouton Programmer une séance');
    await page.locator('#main [data-a="u2Prog"]').click();
    await page.waitForSelector('#u2-prog');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${largeur} px : le panneau ne déborde pas`);
    assert.equal(await page.inputValue('#co-pa'), 'a-prog', 'achat compatible présélectionné');
    assert.ok((await page.locator('#co-pa option:checked').textContent()).includes('restante'), 'séances restantes affichées');
    // la formule préremplit durée, sport et prix
    await page.evaluate(() => { const f = document.getElementById('co-pf'); f.value = 'f:ftest'; f.dispatchEvent(new Event('change', { bubbles: true })); });
    assert.equal(await page.inputValue('#co-pdu'), '1 h 15', 'durée de la formule');
    await page.fill('#co-pd', await page.evaluate(() => isoIn(4)));
    await page.fill('#co-pt', 'Bandeja');
    await page.locator('#u2-prog .btn').click();
    await page.waitForTimeout(300);
    const r = await page.evaluate(ids => { const g = GROUPS.find(x => x.achat === 'a-prog'); const dispo = REGLES.achatsDecomptables(coPacks(ids.a), TODAY, REGLES.progParAchat(GROUPS, TODAY))[0]; return { g: g && { once: g.once, prix: g.tarif.prix, couvert: g.couvert, goal: g.goal, dur: g.dur, mem: g.mem.concat(g.ext) }, prog: dispo && dispo.programmees, aprog: dispo && dispo.a_programmer, restantes: dispo && dispo.restantes }; }, ids);
    assert.ok(r.g, 'séance créée au planning, rattachée à l’achat');
    assert.deepEqual([r.g.prix, r.g.couvert, r.g.goal, r.g.dur], [0, 'pack', 'Bandeja', '1 h 15'], 'couverte par le pack, thème et durée');
    assert.deepEqual(r.g.mem, [ids.a], 'avec l’élève');
    assert.equal(r.prog, 1, 'une séance programmée sur le pack'); assert.equal(r.aprog, r.restantes - 1, 'séances à placer décomptées');
    // élève sans achat : attribuer le pack choisi et créer la séance d'un coup
    await page.waitForSelector('#u2-prog', { state: 'detached', timeout: 4000 });   // la première feuille est refermée
    await page.evaluate(b => { S.stack = [{ v: 'eleve', id: b }]; render(); }, ids.b);
    await page.locator('#main [data-a="u2Prog"]').click();
    await page.waitForSelector('#u2-prog');
    await page.evaluate(() => { const f = document.getElementById('co-pf'); f.value = 'p:ptest'; f.dispatchEvent(new Event('change', { bubbles: true })); });
    assert.ok((await page.inputValue('#co-pa')).startsWith('new:'), 'Attribuer le pack proposé et présélectionné');
    await page.fill('#co-pd', await page.evaluate(() => isoIn(5)));
    await page.locator('#u2-prog .btn').click();
    await page.waitForTimeout(300);
    const r2 = await page.evaluate(b => { const e = coEl(b); const g = GROUPS.find(x => x.achat && e.achats.some(a => a.id === x.achat)); return { achats: e.achats.map(a => a.t + ':' + a.n), couvert: g && g.couvert, actif: coEnActivite(b) }; }, ids.b);
    const dbg = await page.evaluate(() => JSON.stringify({ feuille: !!document.getElementById('u2-prog'), achat: document.getElementById('co-pa') && document.getElementById('co-pa').value, date: document.getElementById('co-pd') && document.getElementById('co-pd').value, toast: (document.querySelector('.toast') || {}).textContent }));
    assert.deepEqual(r2.achats, ['pack:10'], largeur + ' px : achat créé ' + dbg);
    assert.equal(r2.couvert, 'pack', 'séance rattachée au nouvel achat');
    assert.equal(r2.actif, true, 'l’élève passe En activité');
    assert.deepEqual(errs, []);
    await ctx.close();
  }
});

/* ---------- Dojo : programmer une séance dans le passé (enseignant) : appel noté présent, décompté du pack, visible au planning d'une semaine passée ---------- */
test('Dojo : « Programmer une séance » accepte une date passée, propose de noter l’élève présent, décompte le pack et apparaît dans la semaine passée (390 et 1280 px)', async () => {
  for (const largeur of [390, 1280]) {
    const ctx = await browser.newContext(largeur < 700 ? { viewport: { width: largeur, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: largeur, height: 860 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', x => errs.push(x.message));
    // horloge fixée à 10 h : la séance proposée par défaut (18 h) est toujours à venir, quelle que soit l'heure du test
    const h10 = new Date(); h10.setHours(10, 0, 0, 0);
    await page.clock.setFixedTime(h10);
    await page.goto(JA + '/club/coach.html');
    await page.waitForFunction(() => typeof S !== 'undefined' && typeof coGroups === 'function', null, { timeout: 8000 });
    await page.waitForTimeout(1200);
    const a = await page.evaluate(() => {
      document.querySelector('.ram-splash')?.remove();
      const a = ELEVES[0].id;
      OFFRES.formules.push({ id: 'ftest', nom: 'Cours individuel test', sport: 'Padel', joueurs: 1, duree: 60, prix: 40, par: 'seance' });
      OFFRES.packs.push({ id: 'ptest', formule: 'ftest', nom: 'Pack test 10 séances', seances: 10, prix: 350 });
      coEl(a).achats = [{ id: 'a-pas', t: 'pack', ref: 'ptest', d: isoIn(-30), n: 10, nom: 'Pack test 10 séances', prix: 350, pay: { ech: [{ s: 0, m: 350, ok: isoIn(-30) }] } }];
      S.tab = 'eleves'; S.elTab = 'fiche'; S.stack = [{ v: 'eleve', id: a }]; render();
      return a;
    });
    const restantes = () => page.evaluate(a => { const l = REGLES.achatsDecomptables(coPacks(a), TODAY, REGLES.progParAchat(GROUPS, TODAY)); return l[0] ? l[0].restantes : null; }, a);
    const avant = await restantes();
    await page.locator('#main [data-a="u2Prog"]').click();
    await page.waitForSelector('#u2-prog');
    assert.equal(await page.locator('#co-pfw').isVisible(), false, 'date du jour à venir : pas de case « déjà faite »');
    const passe = await page.evaluate(() => isoIn(-5));
    await page.fill('#co-pd', passe);
    await page.locator('#co-pd').dispatchEvent('change');
    assert.equal(await page.locator('#co-pfw').isVisible(), true, 'date passée : la case apparaît');
    assert.equal(await page.isChecked('#co-pfait'), true, 'cochée par défaut : élève noté présent');
    await page.fill('#co-pt', 'Service', { timeout: 5000 });
    await page.locator('#u2-prog .btn').click({ timeout: 5000 });
    await page.waitForSelector('#u2-prog', { state: 'detached', timeout: 4000 });
    const r = await page.evaluate(({ a, passe }) => { const g = GROUPS.find(x => x.once === passe && x.achat === 'a-pas'); const s = g && SEANCES.find(x => x.id === g.id + '.' + passe); return { g: !!g, pres: s && s.pres && s.pres[a] }; }, { a, passe });
    assert.ok(r.g, 'séance passée créée'); assert.equal(r.pres, 'P', 'élève noté présent');
    assert.equal(await restantes(), avant - 1, 'décomptée du pack comme une séance faite');
    await page.evaluate(passe => { S.tab = 'planning'; S.stack = []; S.pl = Object.assign({}, S.pl, { v: '', w: Math.floor((Date.parse(passe) - Date.parse(monday(0))) / (7 * 864e5)) }); render(); }, passe);
    await page.waitForTimeout(300);
    assert.ok(await page.locator('#main .cowb').filter({ hasText: 'Cours individuel' }).count() >= 1, 'un bloc de séance est affiché dans la semaine passée');
    assert.deepEqual(errs, []);
    await ctx.close();
  }
});

/* ---------- Dojo : cycle sans récurrence (dates libres) : rythme proposé par défaut pour un groupe sans créneau, N séances prévues, dates posées une à une ---------- */
test('Dojo : « Séances » d’un groupe sans créneau propose « Sans récurrence », aucune date inventée, le nombre prévu est gardé et la jauge compte les séances faites (390 et 1280 px)', async () => {
  for (const largeur of [390, 1280]) {
    const ctx = await browser.newContext(largeur < 700 ? { viewport: { width: largeur, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: largeur, height: 860 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', x => errs.push(x.message));
    await page.goto(JA + '/club/coach.html');
    await page.waitForFunction(() => typeof S !== 'undefined' && typeof coGroups === 'function', null, { timeout: 8000 });
    await page.waitForTimeout(1200);
    const gid = await page.evaluate(() => {
      document.querySelector('.ram-splash')?.remove();
      const k = ELEVES[0].id;
      GROUPS.push({ id: 'glibre1', type: 'train', libre: 1, name: 'Cycle libre test', sport: 'Padel', day: 1, h: '18 h', dur: '1 h', coach: ME(), mem: M[k] ? [k] : [], ext: M[k] ? [] : [k], sub: 'Séances à planifier · 1 h', at: Date.now() });
      S.tab = 'groupes'; S.stack = [{ v: 'cgroupe', id: 'glibre1' }]; render();
      A.coPlan({ id: 'glibre1', c: 'new' });
      return 'glibre1';
    });
    await page.waitForSelector('#co-plan');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, largeur + ' px : le panneau ne déborde pas');
    assert.equal(await page.inputValue('#co-pl-r'), '0', 'rythme « sans récurrence » par défaut pour un groupe sans créneau');
    assert.equal(await page.locator('#co-pl-dates .co-pd').count(), 0, 'aucune date inventée');
    assert.equal(await page.isChecked('#co-pl-c'), false, 'le groupe ne s’arrête pas à sa dernière date');
    // dix séances prévues, deux dates posées une à une
    await page.fill('#co-pl-n', '10');
    await page.locator('#co-plan [data-a="coPlanAdd"]').click();
    await page.locator('#co-plan [data-a="coPlanAdd"]').click();
    assert.equal(await page.locator('#co-pl-dates .co-pd').count(), 2, 'deux dates posées');
    await page.locator('#co-plan .btn:not(.ghost):not(.sm)').last().click();
    await page.waitForSelector('#co-plan', { state: 'detached', timeout: 4000 });
    const r = await page.evaluate(gid => { const g = grp(gid), c = g.cycles[0], E = REGLES.cycleEtat(g, c, d => sesFind(g, d), TODAY); return { n: c.n, dates: c.dates.length, prevues: E.prevues, faites: E.faites, to: g.to, libre: g.libre }; }, gid);
    assert.deepEqual([r.n, r.dates, r.prevues, r.faites, r.to, r.libre], [10, 2, 10, 0, undefined, 1], 'dix séances prévues, deux dates, groupe jamais clos');
    // rouvrir le cycle : le nombre prévu (10) est repris, pas le nombre de dates (2)
    await page.evaluate(gid => A.coPlan({ id: gid, c: grp(gid).cycles[0].id }), gid);
    await page.waitForSelector('#co-plan');
    assert.equal(await page.inputValue('#co-pl-n'), '10', 'nombre prévu repris à la modification');
    assert.deepEqual(errs, []);
    await ctx.close();
  }
});

/* ---------- Dojo : pas de logo de club dans l'en-tête ; sélecteur de club en bouton picto sur téléphone ---------- */
test('Dojo : plus de logo de club dans l’en-tête (gardé dans /Buvette), sélecteur de club en bouton carré à picto sur téléphone qui ouvre la liste maison', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html');
  await page.waitForFunction(() => typeof S !== 'undefined' && typeof coGroups === 'function', null, { timeout: 8000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { document.querySelector('.ram-splash')?.remove(); club().logoD = club().logoL = 'img/favicon.png'; CO_EXT.c2 = { name: 'TC Brive', key: ME(), chans: new Set() }; S.tab = 'planning'; S.stack = []; S.coClub = 'all'; render(); });
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#top .toplogo').count(), 0, 'pas de logo de club dans l’en-tête de /Dojo');
  const m = await page.evaluate(() => { const b = document.querySelector('.cotopclub').getBoundingClientRect(), i = [...document.querySelectorAll('#top .ib')].find(e => e.offsetWidth).getBoundingClientRect(); return { w: b.width, h: b.height, iw: i.width, ih: i.height, haut: document.getElementById('top').offsetHeight, icone: !!document.querySelector('.cotopclub .cotc-i svg') }; });
  assert.deepEqual([m.w, m.h], [m.iw, m.ih], 'bouton carré de la taille des autres boutons');
  assert.equal(m.icone, true, 'picto de club');
  assert.ok(m.haut < 100, 'l’en-tête tient sur une seule rangée (' + m.haut + ' px)');
  // le toucher ouvre la liste maison, sous le bouton, sans donner le focus au select natif
  const b = await page.locator('.cotopclub').boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.rl:visible').count(), 1, 'la liste maison s’ouvre');
  assert.ok((await page.locator('.rl').boundingBox()).width >= 200, 'liste assez large pour les noms de club');
  assert.notEqual(await page.evaluate(() => document.activeElement && document.activeElement.tagName), 'SELECT');
  await page.locator('.rl button[data-i]').nth(1).tap();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.cotopclub .cotc-d').count(), 1, 'pastille quand un club précis est filtré');
  // /Buvette garde le logo de son club
  const bv = await ctx.newPage();
  await bv.goto(JA + '/club/index.html');
  await bv.waitForFunction(() => typeof S !== 'undefined' && typeof club === 'function', null, { timeout: 8000 });
  await bv.waitForTimeout(2500);   // la première visite peut recharger la page une fois (service worker)
  await bv.waitForFunction(() => typeof S !== 'undefined' && typeof club === 'function', null, { timeout: 8000 });
  await bv.evaluate(() => { document.querySelector('.ram-splash')?.remove(); club().logoD = club().logoL = 'img/favicon.png'; S.tab = 'home'; S.stack = []; render(); });
  assert.equal(await bv.locator('#top .toplogo').count(), 1, 'le logo du club reste dans /Buvette');
  assert.deepEqual(errs, []);
  await ctx.close();
});

/* ---------- sur-titres : pas de surlignage ni d'inclinaison, contraste suffisant, jour et nuit, même en style « street » ---------- */
test('Sur-titres et étiquettes de titre : sans fond coloré ni inclinaison, contraste d’au moins 4,5:1, jour et nuit (/Dojo et /Buvette)', async () => {
  for (const mode of ['jour', 'nuit']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), errs = [];
    await ctx.addInitScript(m => { try { localStorage.setItem('club-mode', m); } catch (e) { /* rien */ } }, mode);
    for (const [url, vues] of [['/club/coach.html', [s => { const g = coGroups('', true).find(g => coIsGrp(g) && !coOver(g)); S.tab = 'today'; S.stack = [{ v: 'seance', id: g.id + '.' + TODAY }]; }, () => { S.tab = 'today'; S.stack = []; }, () => { S.tab = 'eleves'; S.stack = [{ v: 'eleve', id: ELEVES[0].id }]; S.elTab = 'fiche'; }]], ['/club/index.html', [() => { S.tab = 'home'; S.stack = []; }, () => { S.tab = 'agenda'; S.stack = []; }]]]) {
      const page = await ctx.newPage();
      page.on('pageerror', x => errs.push(x.message));
      await page.goto(JA + url);
      await page.waitForFunction(() => typeof S !== 'undefined' && typeof render === 'function', null, { timeout: 8000 });
      await page.waitForTimeout(1500);
      await page.evaluate(() => { document.querySelector('.ram-splash')?.remove(); document.documentElement.dataset.style = 'street'; });
      for (const [i, vue] of vues.entries()) {
        await page.evaluate(`(${vue})(); render(true)`);
        await page.waitForTimeout(350);
        const mal = await page.evaluate(() => {
          const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
          // les couleurs mélangées (color-mix) sont rendues « color(srgb 0.9 0.5 0.6) » : composantes de 0 à 1
          const rgba = s => { const m = s.match(/[\d.]+/g).map(Number), k = /^color\(/.test(s) ? 255 : 1; return { c: m.slice(0, 3).map(v => v * k), a: m.length > 3 ? m[3] : 1 }; };
          const fond = el => { for (let e = el; e; e = e.parentElement) { const b = rgba(getComputedStyle(e).backgroundColor); if (b.a > .9) return b.c; } return [255, 255, 255]; };
          const out = [];
          document.querySelectorAll('.kicker, .coey, .segt span, .top h1 .sub, .cohd > span, .evl.cotheme').forEach(el => {
            if (!el.getClientRects().length || !el.textContent.trim()) return;
            const cs = getComputedStyle(el), t = rgba(cs.color), f = fond(el), mix = t.c.map((v, k) => v * t.a + f[k] * (1 - t.a)), r = (Math.max(lum(mix), lum(f)) + .05) / (Math.min(lum(mix), lum(f)) + .05), bg = rgba(cs.backgroundColor);
            const nom = el.className.toString().split(' ')[0] + ' « ' + el.textContent.trim().slice(0, 24) + ' »';
            if (cs.transform !== 'none') out.push(nom + ' : inclinée');
            if (bg.a > 0.05) out.push(nom + ' : fond coloré ' + cs.backgroundColor);
            if (r < 4.5) out.push(nom + ' : contraste ' + r.toFixed(1));
          });
          return out;
        });
        assert.deepEqual(mal, [], `${url} vue ${i} (${mode})`);
      }
      await page.close();
    }
    assert.deepEqual(errs, []);
    await ctx.close();
  }
});

/* ---------- Dojo : objectifs et compétences (élève, groupe) ; lecture seule dans /Buvette ---------- */
test('Objectifs et compétences : créés dans /Dojo (élève, groupe), validés d’un toucher, progression, lecture seule dans /Buvette', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html');
  await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
  const k = await page.evaluate(() => { const g = coGroups('', true).find(g => coIsGrp(g) && !coOver(g)); window.__g = g.id; S.tab = 'eleves'; S.elTab = 'fiche'; S.stack = [{ v: 'eleve', id: ELEVES[0].id }]; render(); return ELEVES[0].id; });
  // création : un objectif et trois compétences, par la feuille
  await page.locator('#main [data-a="u2ObjEdit"]').first().click();
  await page.fill('#u2o-nom', 'Maîtriser la bandeja');
  await page.fill('#u2o-cs .objer input', 'Placement');
  for (const nom of ['Frappe plate', 'Retombée']) { await page.click('[data-a="u2CompAdd"]'); await page.locator('#u2o-cs .objer input').last().fill(nom); }
  // réordonner (la dernière monte d'un cran), puis enregistrer
  await page.locator('#u2o-cs .objer').last().locator('[data-a="u2CompMv"][data-s="-1"]').click();
  await page.click('#u2-obj .btn:not(.ghost)');
  assert.deepEqual(await page.evaluate(() => OBJECTIFS[0].comps.map(c => c.nom)), ['Placement', 'Retombée', 'Frappe plate'], 'ordre des compétences');
  assert.equal(await page.locator('#main .objp').first().textContent(), '0/3', 'progression 0/3');
  // un toucher valide, un second dévalide, avec retour visuel
  const comp = page.locator('#main .objc').first();
  await comp.click();
  assert.equal(await page.locator('#main .objc.on').count(), 1, 'compétence validée');
  assert.equal(await page.locator('#main .objp').first().textContent(), '1/3', 'progression 1/3');
  assert.equal(await page.evaluate(([o, k]) => REGLES.objProgres(OBJECTIFS[0], [k]).ok, [0, k]), 1);
  // objectif de groupe : validation élève par élève
  await page.evaluate(() => { S.tab = 'clubs'; S.grTab = 'eleves'; S.stack = [{ v: 'cgroupe', id: window.__g }]; render(); });
  await page.locator('#main [data-a="u2ObjEdit"][data-g]').click();
  await page.fill('#u2o-nom', 'Jeu de vitres');
  await page.fill('#u2o-cs .objer input', 'Sortie de vitre');
  await page.click('#u2-obj .btn:not(.ghost)');
  const chips = await page.locator('#main .objs').count();
  assert.ok(chips >= 1, 'une pastille par élève');
  await page.locator('#main .objs').first().click();
  assert.equal(await page.locator('#main .objs.on').count(), 1, 'un seul élève validé');
  assert.equal(await page.evaluate(() => { const o = OBJECTIFS.find(x => x.g); return REGLES.objProgres(o, coStu(grp(window.__g))).ok; }), 1, 'les autres élèves ne sont pas validés');
  // /Buvette : l'élève les voit en lecture seule
  const bv = await ctx.newPage();
  await bv.goto(JA + '/club/index.html');
  await bv.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
  const html = await bv.evaluate(() => { OBJECTIFS.push({ id: 'oT', to: ME(), nom: 'Servir plus fort', ord: 0, comps: [{ id: 'c1', nom: 'Lancer de balle' }, { id: 'c2', nom: 'Jeu de jambes' }], ok: { c1: { [ME()]: TODAY } } }); return objMes(ME()); });
  assert.ok(html.includes('Servir plus fort') && html.includes('1/2'), 'objectif et progression visibles');
  assert.ok(!html.includes('data-a='), 'lecture seule : aucune action');
  assert.deepEqual(errs, []);
  await ctx.close();
});

/* ---------- Dojo : supprimer un groupe (le groupe seul) ---------- */
test('Dojo : « Supprimer le groupe » demande confirmation, retire le groupe seul et garde formules, séances effectuées et historique', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html');
  await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
  const av = await page.evaluate(() => {
    const g = coGroups('', true).find(g => coIsGrp(g) && !coOver(g)), k = coStu(g)[0], e = coEl(k);
    e.achats = [{ id: 'a-supp', t: 'pack', ref: 'p1', d: isoIn(-20), n: 5, nom: 'Pack', prix: 100 }];
    const passee = isoIn(-3), future = isoIn(5);
    sesGet(g.id + '.' + passee).pres = { [k]: 'P' };
    sesGet(g.id + '.' + future).theme = 'À venir';
    S.tab = 'clubs'; S.grTab = 'reglages'; S.stack = [{ v: 'cgroupe', id: g.id }]; render();
    return { id: g.id, name: g.name, k, passee, future, nGroupes: GROUPS.length };
  });
  await page.locator('#main [data-a="coGrpDel"]').click();
  const msg = await page.locator('#layer').textContent();
  assert.ok(/Supprimé/.test(msg) && /Gardé/.test(msg) && /formules/.test(msg) && /paiements/.test(msg), 'la confirmation dit ce qui part et ce qui reste');
  assert.equal(await page.evaluate(id => !!grp(id), av.id), true, 'rien n’est supprimé avant la confirmation');
  await page.locator('#layer [data-a="coGrpDelOk"]').click();
  await page.waitForTimeout(300);
  const r = await page.evaluate(a => ({ groupe: !!grp(a.id), n: GROUPS.length, achats: coEl(a.k).achats.map(x => x.id), passee: sesFind({ id: a.id, _club: undefined }, a.passee) || SEANCES.find(s => s.id === a.id + '.' + a.passee), future: !!SEANCES.find(s => s.id === a.id + '.' + a.future), vue: view().v }), av);
  assert.equal(r.groupe, false, 'le groupe est supprimé');
  assert.equal(r.n, av.nGroupes - 1, 'un seul groupe en moins');
  assert.deepEqual(r.achats, ['a-supp'], 'formules intactes');
  assert.equal(r.passee.pres[av.k], 'P', 'présences intactes');
  assert.equal(r.passee.gnom, av.name, 'la séance effectuée garde le nom du groupe');
  assert.equal(r.future, false, 'séance à venir sans appel retirée');
  assert.notEqual(r.vue, 'cgroupe', 'retour hors de la fiche supprimée');
  // l'historique de l'élève affiche encore la séance, avec le nom du groupe
  await page.evaluate(a => { S.tab = 'eleves'; S.elTab = 'histo'; S.stack = [{ v: 'eleve', id: a.k }]; render(); }, av);
  assert.ok((await page.locator('#main .u2hl').textContent()).includes(av.name), 'séance passée visible dans la fiche de l’élève');
  assert.deepEqual(errs, []);
  await ctx.close();
});

/* ---------- liste déroulante au toucher (iPhone) : toujours la nôtre, jamais la liste native, jamais de focus sur le select ---------- */
test('Liste déroulante tactile : un toucher ouvre notre panneau, le select natif ne reçoit ni toucher ni focus, valeur synchronisée', async () => {
  const desk = await browser.newContext({ viewport: { width: 1366, height: 860 } }), dp = await desk.newPage();
  await dp.goto(JA + '/demo');
  await dp.waitForTimeout(800);
  const url = dp.url();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await desk.storageState() }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(url);
  await page.waitForTimeout(900);
  assert.equal(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), true, 'émulation tactile');
  // le select natif ne reçoit plus le toucher
  const n = await page.evaluate(() => [...document.querySelectorAll('select')].filter(s => s.offsetParent && !s.dataset.natif).length);
  assert.ok(n > 0, 'des listes à tester');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('select')].filter(s => s.offsetParent && !s.dataset.natif && getComputedStyle(s).pointerEvents !== 'none').length), 0, 'pointer-events: none sur chaque select géré');
  for (let i = 0; i < Math.min(n, 3); i++) {
    const s = page.locator('select:visible:not([data-natif])').nth(i);
    await s.scrollIntoViewIfNeeded();
    const b = await s.boundingBox();
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.rl:visible').count(), 1, `liste ${i} : notre panneau s’ouvre`);
    assert.notEqual(await page.evaluate(() => document.activeElement && document.activeElement.tagName), 'SELECT', `liste ${i} : le select natif n’a pas le focus`);
    const avant = await s.inputValue();
    const choix = page.locator('.rl button[data-i]:not([aria-selected="true"]):not([disabled])').first();
    if (await choix.count()) {
      const cb = await choix.boundingBox();
      await page.touchscreen.tap(cb.x + cb.width / 2, cb.y + cb.height / 2);
      await page.waitForTimeout(250);
      assert.notEqual(await s.inputValue(), avant, `liste ${i} : la valeur du select suit le choix`);
    } else await page.keyboard.press('Escape');
    assert.equal(await page.locator('.rl:visible').count(), 0, `liste ${i} : refermée`);
  }
  assert.deepEqual(errs, []);
  await ctx.close(); await desk.close();
});

/* ---------- intercalaires : sur tous les écrans, collés au haut du contenu qui suit, jamais sur une bande rouge ; gouttière commune ---------- */
test('Intercalaires : collés au contenu (écart nul) à 390 et 1280 px, aucune bande rouge ou bordeaux, gouttière de 10 px sur téléphone', async () => {
  const ECRANS = [['/club/coach.html', ['today', 'dash', 'eleves', 'clubs', 'msgs', 'asuivi']], ['/club/index.html', ['agenda', 'jouer', 'chans']]];
  for (const largeur of [390, 1280]) {
    const ctx = await browser.newContext(largeur < 700 ? { viewport: { width: largeur, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: largeur, height: 860 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', x => errs.push(x.message));
    for (const [url, tabs] of ECRANS) {
      await page.goto(JA + url);
      await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
      await page.waitForFunction(() => typeof S !== 'undefined' && typeof render === 'function', null, { timeout: 8000 }).catch(() => { throw new Error(`${url} à ${largeur} px : l’appli ne démarre pas (${page.url()})`); });
      await page.waitForTimeout(1200);
      await page.evaluate(() => document.querySelector('.ram-splash')?.remove());
      for (const t of tabs) {
        await page.evaluate(t => { S.tab = t; S.stack = []; render(true); }, t);
        await page.waitForTimeout(350);
        const l = await page.evaluate(() => [...document.querySelectorAll('#main > .seg')].filter(s => s.getBoundingClientRect().height).map(s => {
          const b = s.querySelector('button[aria-selected="true"]') || s.querySelector('button'), r = b.getBoundingClientRect(), cs = getComputedStyle(s);
          let nx = s.nextElementSibling; while (nx && !nx.getBoundingClientRect().height) nx = nx.nextElementSibling;
          const m = cs.backgroundColor.match(/[\d.]+/g).map(Number), rouge = (m[3] === undefined || m[3] > 0.5) && m[0] > m[1] + 25 && m[0] > m[2] + 15;
          return { ecart: nx ? nx.getBoundingClientRect().top - r.bottom : null, rouge, segL: s.getBoundingClientRect().left, cardL: nx ? nx.getBoundingClientRect().left + (nx.classList.contains('bvbox') ? 0 : parseFloat(getComputedStyle(nx).paddingLeft)) : null };
        }));
        for (const s of l) {
          assert.ok(s.ecart !== null && Math.abs(s.ecart) <= 2, `${url} ${t} à ${largeur} px : l’intercalaire touche le contenu (écart ${s.ecart})`);
          assert.equal(s.rouge, false, `${url} ${t} à ${largeur} px : plus de bande rouge ou bordeaux`);
          if (largeur < 700) assert.ok(Math.abs(s.segL - 10) <= 1 && Math.abs(s.cardL - 10) <= 1, `${url} ${t} : gouttière de 10 px (onglets ${s.segL}, cartes ${s.cardL})`);
        }
      }
    }
    assert.deepEqual(errs, []);
    await ctx.close();
  }
});

/* ---------- interrupteurs (ds.css, .tg) : bouton entièrement dans la piste, mêmes marges des deux côtés, dans les deux positions ---------- */
test('Interrupteur : le bouton reste dans la piste, marges égales à gauche (éteint) et à droite (allumé), centré, jour et nuit', async () => {
  for (const mode of ['jour', 'nuit']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', x => errs.push(x.message));
    await ctx.addInitScript(m => { try { localStorage.setItem('club-mode', m); } catch (e) { /* rien */ } }, mode);
    await page.goto(JA + '/club/index.html');
    await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
    const r = await page.evaluate(() => {
      const host = document.createElement('div');
      host.innerHTML = '<button class="tg" role="switch" aria-checked="false" id="tg-off"></button><button class="tg" role="switch" aria-checked="true" id="tg-on"></button>';
      document.getElementById('main').append(host);
      const mesure = id => {
        const el = document.getElementById(id), b = getComputedStyle(el, '::before'), a = getComputedStyle(el, '::after'), px = v => parseFloat(v);
        const tx = new DOMMatrix(a.transform === 'none' ? undefined : a.transform).m41, bw = px(b.borderTopWidth);
        return { trackW: px(b.width), trackH: px(b.height), trackTop: px(b.top), border: bw, knobW: px(a.width), knobH: px(a.height), knobLeft: px(a.left) + tx, knobTop: px(a.top), box: a.boxSizing, boxT: b.boxSizing, h: el.offsetHeight, w: el.offsetWidth };
      };
      return { off: mesure('tg-off'), on: mesure('tg-on') };
    });
    for (const [pos, m] of Object.entries(r)) {
      assert.equal(m.box, 'border-box', `${mode} ${pos} : bouton en border-box`);
      assert.equal(m.boxT, 'border-box', `${mode} ${pos} : piste en border-box`);
      assert.ok(m.knobLeft >= m.border + 2 && m.knobLeft + m.knobW <= m.trackW - m.border - 2, `${mode} ${pos} : le bouton tient dans la piste (${m.knobLeft}→${m.knobLeft + m.knobW} sur ${m.trackW})`);
      assert.equal(m.knobTop - m.trackTop - m.border, m.trackTop + m.trackH - m.border - (m.knobTop + m.knobH), `${mode} ${pos} : bouton centré en hauteur`);
    }
    const gauche = r.off.knobLeft - r.off.border, droite = r.on.trackW - r.on.border - (r.on.knobLeft + r.on.knobW);
    assert.equal(gauche, droite, `${mode} : même marge intérieure des deux côtés (${gauche} / ${droite})`);
    assert.deepEqual(errs, []);
    await ctx.close();
  }
});

/* ---------- en-tête sur deux rangées (iPhone, zone sûre) : le contenu commence toujours sous lui, dans /Dojo et /Buvette ---------- */
test('En-tête sur deux rangées à 390 px avec zone sûre : le contenu commence sous lui (Dojo et Buvette), y compris après un changement de page', async () => {
  for (const [url, pages] of [['/club/coach.html', ['planning', 'eleves', 'today']], ['/club/index.html', ['home', 'agenda', 'jouer']]]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', x => errs.push(x.message));
    await page.goto(JA + url);
    await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
    await page.evaluate(() => document.querySelector('.ram-splash')?.remove());
    // zone sûre de l'iPhone (47 px) simulée, et un en-tête que le titre et un sélecteur de club font passer sur deux rangées
    await page.addStyleTag({ content: '.top { padding-top: 57px !important; } .cotopclub select { width: 190px; }' });
    for (const t of pages) {
      await page.evaluate(t => { S.tab = t; S.stack = []; render(true); }, t);
      await page.evaluate(() => { const top = document.getElementById('top'); if (!top.querySelector('.test-large')) { const l = document.createElement('span'); l.className = 'test-large'; l.style.cssText = 'flex:0 0 330px;height:44px'; (top.querySelector('h1') || top.firstChild).after(l); } });   // un en-tête qui passe sur deux rangées
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => {
        const top = document.getElementById('top'), m = document.getElementById('main'), hb = top.getBoundingClientRect().bottom;
        const first = [...m.children].find(e => !e.matches('.seg-out') && e.getBoundingClientRect().height > 0);
        return { hb, ft: first.getBoundingClientRect().top, h: top.offsetHeight, rows: top.querySelectorAll('.ib, .cotopclub').length };
      });
      assert.ok(r.ft >= r.hb - 1, `${url} ${t} : le contenu (${Math.round(r.ft)}) commence sous l’en-tête (${Math.round(r.hb)})`);
      assert.ok(r.h > 100, `${url} ${t} : l’en-tête fait bien deux rangées (${r.h} px)`);
    }
    assert.deepEqual(errs, []);
    await ctx.close();
  }
});

/* ---------- Dojo : fiches élève et groupe, historique en cartes empilées, planning, intercalaires ---------- */
test('Dojo : planning en Semaine, intercalaire collé à sa carte, fiche élève en une carte, fiche de groupe avec cycle et élèves en tête', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html');
  await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
  // Aujourd'hui : l'intercalaire touche le haut de sa carte (écart de 2 px au plus, le trait de la carte passe dessous)
  const ecart = await page.evaluate(() => { const t = document.querySelector('.u2sous button[aria-selected="true"]').getBoundingClientRect(), c = document.querySelector('#main .card').getBoundingClientRect(); return Math.abs(c.top - t.bottom); });
  assert.ok(ecart <= 2, 'intercalaire collé à la carte : ' + ecart);
  // planning : Semaine par défaut, sur téléphone aussi
  const tel = await browser.newContext({ viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true }), p2 = await tel.newPage();
  await p2.goto(JA + '/club/coach.html');
  await p2.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
  await p2.evaluate(() => { S.tab = 'planning'; S.stack = []; render(); });
  assert.equal(await p2.locator('.u2vue [aria-selected="true"]').textContent(), 'Semaine', 'Semaine par défaut sur téléphone');
  await tel.close();
  // fiche élève : une carte, onglets dedans ; l'historique en cartes empilées avec date et heure
  await page.evaluate(() => { S.tab = 'eleves'; S.stack = [{ v: 'eleve', id: ELEVES[0].id }]; S.elTab = 'fiche'; render(); });
  assert.equal(await page.locator('#main .u2boite .u2itabs button').count(), 4, 'quatre onglets sur la boîte 2');
  assert.equal(await page.locator('#main .u2fiche .u2itabs').count(), 0, 'les intercalaires ne sont plus dans la carte d’identité');
  assert.ok(await page.locator('#main .u2fb .cohd, #main .u2fb .card').count() > 0, 'des sous-cartes sous les onglets');
  await page.evaluate(() => { S.elTab = 'histo'; render(); });
  if (await page.locator('.u2hs').count()) assert.ok((await page.locator('.u2hs .u2hd').first().textContent()).match(/\d/), 'date et heure dans l’encart');
  // fiche de groupe : cycle et élèves visibles dès l'ouverture, actions de programmation
  await page.evaluate(() => { const g = coGroups('', true).find(g => coIsGrp(g) && !coOver(g)); S.tab = 'clubs'; S.stack = [{ v: 'cgroupe', id: g.id }]; render(); });
  assert.ok(await page.locator('#main .u2gh [data-a="coPlan"]').isVisible(), 'programmer un cycle');
  assert.ok(await page.locator('#main .u2gh [data-a="coOffAdd"]').isVisible(), 'périodes sans cours');
  await page.evaluate(() => { S.grTab = 'eleves'; render(); });
  const y = await page.evaluate(() => { const e = [...document.querySelectorAll('#main .u2gb .calh b')].find(b => /Élèves/.test(b.textContent)); return e ? e.getBoundingClientRect().top : 99999; });
  assert.ok(y < 800, 'la liste des élèves est visible sans défiler : ' + y);
  assert.ok(await page.locator('#main [data-a="coAdd"]').count() > 0 && await page.locator('#main [data-a="coRm"]').count() > 0, 'ajout et retrait d’élève');
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Dojo : fiche de groupe en deux boîtes (identité + intercalaires collés), chaque onglet s’ouvre, l’onglet reste en mémoire, à 390 et 1280 px', async () => {
  const ONG = ['seances', 'eleves', 'formule', 'discussion', 'reglages'];
  for (const w of [390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', x => errs.push(x.message));
    await page.goto(JA + '/club/coach.html');
    await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
    await page.evaluate(() => { try { localStorage.removeItem('coach-groupe-onglet'); } catch (e) {} const g = coGroups('', true).find(g => coIsGrp(g) && !coOver(g)); window.__gid = g.id; delete S.grTab; S.tab = 'clubs'; S.stack = [{ v: 'cgroupe', id: g.id }]; render(); });
    assert.equal(await page.locator('#main .pad.u2g > *').count(), 2, w + ' : deux boîtes seulement');
    assert.equal(await page.locator('#main .u2gh [data-a="coPlan"], #main .u2gh [data-a="coOffAdd"], #main .u2gh [data-a="coGrpEdit"]').count(), 3, w + ' : actions principales dans l’identité');
    assert.equal(await page.locator('#main .u2boite .u2itabs button').count(), 5, w + ' : cinq onglets');
    for (const k of ONG) {
      await page.locator('#main .u2itabs [data-k="' + k + '"]').click();
      const m = await page.evaluate(k => {
        const t = document.querySelector('#main .u2itabs [aria-selected="true"]'), b = document.querySelector('#main .u2gb'), cs = getComputedStyle(b);
        const tabs = document.querySelector('#main .u2itabs');
        return { sel: t && t.dataset.k, ecart: Math.round((b.getBoundingClientRect().top + parseFloat(cs.borderTopWidth) - t.getBoundingClientRect().bottom) * 10) / 10, txt: b.textContent.trim().length, mask: getComputedStyle(tabs).maskImage, debord: document.documentElement.scrollWidth - innerWidth, cut: tabs.scrollWidth - tabs.clientWidth };
      }, k);
      assert.equal(m.sel, k, w + ' : onglet ' + k + ' choisi');
      assert.ok(Math.abs(m.ecart) <= 1, w + ' : intercalaires collés à 0 px (' + k + ') : ' + m.ecart);
      assert.ok(m.txt > 0, w + ' : contenu de ' + k);
      assert.equal(m.mask, 'none', w + ' : pas de fondu');
      assert.ok(m.debord <= 0, w + ' : pas de débordement horizontal (' + k + ') : ' + m.debord);
      assert.ok(m.cut <= 0, w + ' : intercalaires entièrement visibles : ' + m.cut);
    }
    // contenu retrouvé dans l'onglet qui le porte
    const contenu = { seances: '[data-a="coPlan"]', eleves: '[data-a="coAdd"]', formule: '[data-a="coGrpOf"]', discussion: '[data-a="coChanNew"], [data-a="coChanDel"], [data-a="open"][data-v="chan"]', reglages: '[data-a="coGrpDel"]' };
    for (const k of ONG) {
      await page.locator('#main .u2itabs [data-k="' + k + '"]').click();
      assert.ok(await page.locator('#main .u2gb ' + contenu[k].split(', ').join(', #main .u2gb ')).count() > 0, w + ' : ' + k + ' porte ' + contenu[k]);
    }
    // mémoire : on quitte la page puis on y revient, l'onglet choisi est resté
    await page.locator('#main .u2itabs [data-k="formule"]').click();
    await page.evaluate(() => { S.stack = []; S.tab = 'today'; render(); S.tab = 'clubs'; S.stack = [{ v: 'cgroupe', id: window.__gid }]; render(); });
    assert.equal(await page.locator('#main .u2itabs [aria-selected="true"]').getAttribute('data-k'), 'formule', w + ' : onglet gardé en mémoire');
    assert.equal(await page.evaluate(() => localStorage.getItem('coach-groupe-onglet')), 'formule', w + ' : mémorisé sur l’appareil');
    assert.deepEqual(errs, [], w + ' : aucune erreur');
    await ctx.close();
  }
});

test('/Buvette Agenda : colonne mini-calendrier à 360 px comme avant, calendrier un peu plus large, carte affichée sans changer de page (3 colonnes ou à la place du mini-calendrier), Fermer ; inchangé sur iPad portrait et téléphone', async () => {
  // largeurs mesurées avant le lot I (e122a31) : calendrier (bmain) et colonne mini-calendrier (bside)
  const AVANT = { 1024: 210, 1180: 350, 1280: 350, 1366: 350, 1600: 350 };
  for (const w of [1024, 1180, 1280, 1366, 1600]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', x => errs.push(x.message));
    await page.goto(JA + '/club/index.html');
    await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
    for (const mode of ['week', 'day', 'events']) {
      await page.evaluate(m => { S.tab = 'agenda'; S.stack = []; S.plan.scope = 'club'; S.plan.mode = m; S.plan.sel = null; render(true); }, mode);
      const larg = () => page.evaluate(() => { const r = s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().width) : 0; }; return { cal: r('#main .bmain'), side: r('#agside'), carte: r('#agcard'), pan: r('.agpan'), debord: document.documentElement.scrollWidth - innerWidth }; });
      const l0 = await larg();
      assert.equal(l0.side, 360, w + ' ' + mode + ' : colonne mini-calendrier inchangée (360 px)');
      if (w >= 1180) assert.ok(l0.cal >= AVANT[w] + 40 && l0.cal <= AVANT[w] + 80, w + ' ' + mode + ' : calendrier de 40 à 80 px plus large : ' + l0.cal + ' contre ' + AVANT[w]);
      else assert.ok(l0.cal >= AVANT[w], w + ' ' + mode + ' : calendrier pas plus étroit : ' + l0.cal);
      const trois = w >= 1540;
      assert.equal(await page.locator('#main .bvag > #agcard').count(), trois ? 1 : 0, w + ' : 3e colonne seulement si la carte est lisible');
      if (trois) assert.ok(l0.carte >= 300, w + ' : carte lisible (' + l0.carte + ' px)');
      await page.locator('#plan [data-a="open"][data-id]').first().click();
      const r = await page.evaluate(() => ({ pile: S.stack.length, tab: S.tab, sel: document.querySelectorAll('#plan .agsel').length, txt: ((document.querySelector('#agcard .agcarte, .agpan .agcarte') || {}).textContent || '').trim().length, cal: document.querySelectorAll('#agside .calm').length }));
      const l1 = await larg();
      assert.equal(r.pile, 0, w + ' ' + mode + ' : on reste dans l’agenda');
      assert.ok(r.txt > 10, w + ' ' + mode + ' : la carte est affichée');
      assert.ok(r.sel >= 1, w + ' ' + mode + ' : bloc marqué sélectionné');
      assert.equal(l1.cal, l0.cal, w + ' ' + mode + ' : le calendrier ne change pas de largeur');
      assert.ok(l1.debord <= 0, w + ' : pas de débordement horizontal : ' + l1.debord);
      if (!trois) {
        assert.equal(l1.pan, 360, w + ' ' + mode + ' : la carte prend la largeur de la colonne mini-calendrier');
        assert.equal(r.cal, 0, w + ' ' + mode + ' : mini-calendrier remplacé par la carte');
        const bt = await page.locator('.agclose').boundingBox();
        assert.ok(bt.width >= 44 && bt.height >= 44, w + ' : Fermer d’au moins 44 px (' + bt.width + 'x' + bt.height + ')');
        await page.locator('.agclose').click();
        const l2 = await larg();
        assert.equal(await page.locator('#agside .calm').count(), 1, w + ' ' + mode + ' : Fermer ramène le mini-calendrier');
        assert.equal(await page.locator('#agside .calf').count(), 1, w + ' ' + mode + ' : et les filtres');
        assert.equal(l2.cal, l0.cal);
        assert.equal(l2.side, 360);
      }
    }
    assert.deepEqual(errs, [], w + ' : aucune erreur');
    await ctx.close();
  }
  for (const w of [390, 820]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 } }), page = await ctx.newPage();
    await page.goto(JA + '/club/index.html');
    await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
    await page.evaluate(() => { S.tab = 'agenda'; S.stack = []; S.plan.scope = 'club'; S.plan.mode = 'events'; S.plan.sel = null; render(true); });
    assert.equal(await page.locator('#agcard, #agside').count(), 0, w + ' : pas de colonne de carte');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, true, w + ' : pas de débordement');
    await page.locator('#plan [data-a="open"][data-id]').first().click();
    assert.equal(await page.evaluate(() => S.stack.length), 1, w + ' : le clic ouvre la publication');
    await ctx.close();
  }
});

test('/Buvette Jouer : à 1280 px chaque partie a sa carte à fond opaque ; sur téléphone une seule boîte', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/index.html');
  await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
  const fond = async () => page.evaluate(() => [...document.querySelectorAll('#main .bvbox .bvpar, #main .bvbox .post, #main .bvbox .lis')].map(e => getComputedStyle(e).backgroundColor));
  for (const [tab, onglet] of [['jouer', 'parties'], ['jouer', 'resultats'], ['chans', 'club'], ['chans', 'train'], ['chans', 'team']]) {
    await page.evaluate(([t, o]) => { S.stack = []; S.tab = t; if (t === 'jouer') S.jouTab = o; else S.chanTab = o; render(true); }, [tab, onglet]);
    const l = await fond();
    if (tab === 'jouer' && onglet === 'parties') assert.ok(l.length >= 1, 'des parties à l’écran');
    l.forEach(c => assert.ok(!/rgba\(.*, 0\)$/.test(c), tab + '/' + onglet + ' : fond opaque ' + c));
  }
  await page.setViewportSize({ width: 390, height: 800 });
  await page.evaluate(() => { S.stack = []; S.tab = 'jouer'; S.jouTab = 'parties'; render(true); });
  assert.equal(await page.locator('#main > .bvbox').count(), 1, 'téléphone : une seule boîte');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#main .bvbox .bvpar')).boxShadow), 'none', 'téléphone : parties en lignes, inchangé');
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Discussions : réaction pleine surface et coches (envoyé, reçu, lu en bleu fixe), dans /Buvette et /Dojo', async () => {
  for (const url of ['/club/index.html', '/club/coach.html']) {
    const ctx = await browser.newContext({ viewport: { width: 700, height: 900 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', x => errs.push(x.message));
    await page.goto(JA + url);
    await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
    const r = await page.evaluate(() => {
      const m = { by: ME(), x: 'Salut', t: '10:00', at: 4000, _id: 'm1', re: { '👍': 1 }, my: '👍' };
      const h = msgRow(m, 0, '', 'c:g1', false);
      const d = document.createElement('div');
      d.className = 'chat';
      d.style.cssText = 'position:fixed;top:60px;left:10px;width:400px;z-index:9999;background:#fff';
      d.innerHTML = h;
      document.body.append(d);
      const box = d.querySelector('.reacts:not(.big)'), on = d.querySelector('.react.on'), cs = getComputedStyle(box), a = box.getBoundingClientRect(), b = on.getBoundingClientRect();
      const bw = parseFloat(cs.borderTopWidth), out = { pad: cs.paddingTop + cs.paddingLeft, dh: Math.round(a.height - 2 * bw - b.height), dw: Math.round(a.width - 2 * bw - b.width), fond: getComputedStyle(on).backgroundColor, boite: cs.backgroundColor };
      d.remove();
      // coches
      const sv = window.RAM;
      window.RAM = { live: true, base: new Set(['msg/m1', 'msg/m2']), reads: { g1: 5000 } };
      const t = (id, at, rd) => { window.RAM.reads.g1 = rd; const e = document.createElement('div'); e.className = 'chat'; e.innerHTML = `<div class="bub"><time>${msgTicks({ _id: id, at }, 'c:g1')}</time></div>`; document.body.append(e); const i = e.querySelector('.tk'); const o = { rd: i.classList.contains('rd'), n: i.querySelectorAll('path').length, col: getComputedStyle(i).color, lbl: i.getAttribute('aria-label') }; e.remove(); return o; };
      const envoye = t('absent', 4000, 5000), recu = t('m2', 4000, 3000), lu = t('m1', 4000, 5000);
      window.RAM = sv;
      return { out, envoye, recu, lu };
    });
    assert.equal(r.out.pad, '0px0px', url + ' : pas de marge entre la boîte et la réaction');
    assert.equal(r.out.dh, 0, url + ' : la réaction remplit toute la hauteur de la boîte');
    assert.equal(r.out.dw, 0, url + ' : la réaction remplit toute la largeur de la boîte');
    assert.notEqual(r.out.fond, 'rgba(0, 0, 0, 0)', url + ' : fond d’accent plein');
    assert.equal(r.envoye.lbl, 'Envoyé', url + ' : V simple, envoyé'); assert.equal(r.envoye.rd, false);
    assert.equal(r.recu.lbl, 'Reçu', url + ' : double V, reçu'); assert.equal(r.recu.rd, false);
    assert.equal(r.lu.rd, true, url + ' : lu');
    assert.equal(r.lu.col, 'rgb(47, 155, 255)', url + ' : double V bleu fixe');
    assert.notEqual(r.recu.col, 'rgb(47, 155, 255)', url + ' : reçu, pas bleu');
    assert.deepEqual(errs, [], url);
    await ctx.close();
  }
});

test('Publication d’un tournoi /RAM JA : bandeau comme les autres événements, aucun picto démesuré, hauteur raisonnable, à 390 et 1280 px', async () => {
  for (const w of [390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', x => errs.push(x.message));
    await page.goto(JA + '/club/index.html');
    await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
    for (const reg of ['ext', 'app']) {
      await page.evaluate(reg => {
        for (let i = posts.length - 1; i >= 0; i--) if (posts[i].id === 'jatest') posts.splice(i, 1);
        posts.unshift({ id: 'jatest', by: 'club', kind: 'jatour', at: Date.now(), t: 'À l’instant', likes: 0, com: [], title: 'P100 SOIRÉE', d: isoIn(16), place: 'Chiquita Padel', sport: 'Padel',
          ja: { tid: 't1', cat: 'P100', gender: 'Messieurs', time: '18:30', address: '', jaName: 'JA', jaTitle: '', deadline: '', max: 16, reg, where: reg === 'ext' ? 'https://exemple.invalid/inscription' : '', open: reg === 'app', status: 'open', count: 2, list: [], results: [], prize: '', direct: null, tv: '' } });
        S.tab = 'home'; S.stack = [{ v: 'post', id: 'jatest' }]; render(true);
      }, reg);
      const m = await page.evaluate(() => {
        const c = document.querySelector('#main .post, #main .feed') || document.getElementById('main'), r = e => e.getBoundingClientRect();
        const gros = [...c.querySelectorAll('svg')].filter(s => r(s).width > 60 || r(s).height > 60).length;
        return { gros, h: Math.round(r(c).height), poster: !!c.querySelector('.poster .big'), txt: c.textContent.includes('P100 SOIRÉE'), debord: document.documentElement.scrollWidth - innerWidth, acces: reg => 0 };
      });
      assert.equal(m.gros, 0, w + ' ' + reg + ' : aucun picto démesuré');
      assert.ok(m.poster && m.txt, w + ' ' + reg + ' : bandeau d’événement');
      assert.ok(m.h < 700, w + ' ' + reg + ' : hauteur de carte raisonnable (' + m.h + ' px)');
      assert.ok(m.debord <= 0, w + ' ' + reg + ' : pas de débordement');
      if (reg === 'ext') assert.equal(await page.locator('#main a[href^="https://exemple.invalid"]').count(), 1, w + ' : le lien d’inscription reste accessible');
      else assert.equal(await page.locator('#main [data-a="jaIn"]').count() >= 1, true, w + ' : bouton d’inscription');
    }
    assert.deepEqual(errs, [], w + ' : aucune erreur');
    await ctx.close();
  }
});

test('Noms de domaine : l’appli se reconnaît par son nom (ancien ou nouveau) et ses liens restent dans la même famille de noms', async () => {
  const port = new URL(JA).port;
  const CAS = [['club', '/demo', 'club', 'https://ja.riseandmove.fr'], ['buvette', '/demo', 'club', 'https://pista.riseandmove.fr'], ['coach', '/demo', 'coach', 'https://ja.riseandmove.fr'], ['dojo', '/demo', 'coach', 'https://pista.riseandmove.fr']];
  for (const [label, chemin, app, versJa] of CAS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', x => errs.push(x.message));
    await page.goto(`http://${label}.localhost:${port}${chemin}`);
    await page.waitForSelector('#tabs button[data-t], .rbot button', { timeout: 8000 });
    const r = await page.evaluate(() => ({ app: RAM_NOMS.appOf(location.hostname), ja: RAM_NOMS.urlDepuis('ja', location.hostname), coach: RAM_NOMS.urlDepuis('coach', location.hostname), club: RAM_NOMS.urlDepuis('club', location.hostname), titre: document.title }));
    assert.equal(r.app, app, label + ' : appli reconnue');
    assert.equal(r.ja, versJa, label + ' : lien vers /Pista dans la même famille');
    assert.equal(r.club, label === 'dojo' || label === 'buvette' ? 'https://buvette.riseandmove.fr' : 'https://club.riseandmove.fr');
    assert.equal(r.coach, label === 'dojo' || label === 'buvette' ? 'https://dojo.riseandmove.fr' : 'https://coach.riseandmove.fr');
    if (app === 'coach') assert.match(r.titre, /Coach|Dojo/, label + ' : /Dojo ouvert');
    assert.deepEqual(errs, [], label + ' : aucune erreur');
    await ctx.close();
  }
  // la page de connexion suit aussi le nom
  const ctx = await browser.newContext(), page = await ctx.newPage();
  await page.goto(`http://dojo.localhost:${port}/connexion`);
  assert.match(await page.title(), /Coach/, 'connexion aux couleurs de /Dojo sur dojo.');
  await ctx.close();
});

test('Abonnés : compteur « 2/4 ce mois-ci » sur la fiche élève, dans l’onglet Abonnés (alerte au-delà) et dans les achats de /Buvette', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 820 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/coach.html?ui=2');
  await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
  const k = await page.evaluate(() => {
    const e = ELEVES.find(x => coInClub(x));
    if (!e) return null;
    const mois = isoIn(0).slice(0, 7), g = GROUPS.find(x => coStu(x).includes(e.id)) || GROUPS[0];
    // 5 séances ce mois-ci (dates fixes dans le mois courant, passées ou non : la couverture ne compte que les séances faites)
    e.achats = [{ id: 'hmois', t: 'abo', ref: 'a1', d: mois + '-01', fin: isoIn(60), nom: 'Abo mensuel', pm: 4 }];
    S.tab = 'eleves'; S.elF = 'abo'; S.stack = []; render();
    return e.id;
  });
  if (k) {
    assert.ok(await page.locator('#main .item .coabm').count() >= 1, 'compteur dans l’onglet Abonnés');
    assert.match(await page.textContent('#main .item .coabm'), /\d+\/4 ce mois-ci/);
    await page.evaluate(id => A.open({ v: 'eleve', id }), k);
    await page.waitForSelector('.coabocard .coabsg');
    assert.match(await page.textContent('.coabocard'), /4 séances par mois/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'pas de débordement à 360 px');
  }
  assert.deepEqual(errs, []);
  await ctx.close();
  // /Buvette : « 5/4 ce mois-ci », jauge en couleur d'alerte au-delà du quota
  const c2 = await phone();
  const { page: p2, errors } = await openPage(c2, DEMO + '/index.html');
  await p2.waitForSelector('#tabs button[data-t]');
  const h = await p2.evaluate(() => ({
    ok: mesAchatLigne({ t: 'abo', nom: 'Abo', used: 3, n: 0, etat: 'encours', fin: '2030-12-31', mois: { fait: 2, quota: 4, depasse: false } }),
    over: mesAchatLigne({ t: 'abo', nom: 'Abo', used: 6, n: 0, etat: 'encours', fin: '2030-12-31', mois: { fait: 5, quota: 4, depasse: true } })
  }));
  assert.match(h.ok, /2\/4 ce mois-ci/); assert.doesNotMatch(h.ok, /depasse/);
  assert.match(h.over, /5\/4 ce mois-ci/); assert.match(h.over, /mesach-bar depasse/);
  assert.deepEqual(errors, []);
  await c2.close();
});

test('Dojo : séance de l’historique d’un élève, « Rattacher » à un de ses achats (Ses achats / Groupes), décompte mis à jour, détachement', async () => {
  for (const w of [1280, 360]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 820 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', x => errs.push(x.message));
    await page.goto(JA + '/club/coach.html?ui=2');
    await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
    const r = await page.evaluate(() => {
      const e = ELEVES.find(x => coInClub(x));
      if (!e) return null;
      const d = isoIn(-4), gid = 'grat1';
      e.achats = [{ id: 'ra1', t: 'pack', ref: 'zz', d: isoIn(-30), n: 10, nom: 'Pack 10 séances' }, { id: 'ra2', t: 'pack', ref: 'zz', d: isoIn(-30), n: 1, nom: 'Pack 1 séance' }];
      GROUPS.push({ id: gid, type: 'train', name: 'Cours individuel', once: d, day: 1, h: '18 h', dur: '1 h 30', sport: 'Padel', coach: ME(), mem: M[e.id] ? [e.id] : [], ext: M[e.id] ? [] : [e.id], at: Date.now() });
      SEANCES.push({ id: gid + '.' + d, g: gid, d, pres: { [e.id]: 'P' } });
      S.tab = 'eleves'; S.stack = [{ v: 'seance', id: gid + '.' + d }]; render();
      return { k: e.id, gid };
    });
    if (r) {
      await page.waitForSelector('#co-s-att #co-s-ac');
      const opts = await page.evaluate(() => [...document.querySelectorAll('#co-s-ac optgroup')].map(g => [g.label, [...g.children].map(o => o.textContent)]));
      assert.equal(opts[0][0], 'Ses achats', 'première famille : ses achats');
      assert.ok(opts[0][1].some(t => /Pack 10 séances · \d+\/10/.test(t)), 'avec leur décompte');
      await page.selectOption('#co-s-ac', 'a|' + r.k + '|ra2');
      await page.click('#co-s-att .btn');
      assert.equal(await page.evaluate(g => grp(g).achat, r.gid), 'ra2', 'lien séance → achat posé');
      assert.equal(await page.evaluate(k => coPacks(k).find(a => a.id === 'ra2').used, r.k), 1, 'la séance compte dans ce pack');
      // le pack 1 séance est complet : toujours proposé, marqué « complet »
      await page.evaluate(() => render());
      assert.ok((await page.locator('#co-s-ac option:checked').textContent()).includes('complet'), 'achat complet marqué');
      // un autre rattachement la fait passer à 11/10 sans rien bloquer ; changement d'achat
      await page.selectOption('#co-s-ac', 'a|' + r.k + '|ra1');
      await page.click('#co-s-att .btn');
      assert.equal(await page.evaluate(r => coVenues(r.k).find(v => v.gid === r.gid).ac, r), 'ra1', 'la séance porte le lien vers ce pack');
      assert.ok(await page.evaluate(k => coPacks(k).find(a => a.id === 'ra1').used, r.k) >= 1);
      assert.equal(await page.evaluate(k => coPacks(k).find(a => a.id === 'ra2').used, r.k), 0, 'plus décomptée de l’ancien');
      // détacher : retour à la règle par défaut
      await page.evaluate(() => render());
      await page.selectOption('#co-s-ac', '');
      await page.click('#co-s-att .btn');
      assert.equal(await page.evaluate(g => grp(g).achat, r.gid), undefined);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'pas de débordement');
    }
    assert.deepEqual(errs, []);
    await ctx.close();
  }
});

test('Dojo : fiche élève en deux boîtes (identité / intercalaires collés au haut de la boîte 2), cadre Abonné à jauge sectionnée, à 390, 820 et 1280 px', async () => {
  for (const [w, mobile] of [[390, true], [820, false], [1280, false]]) {
    const ctx = await browser.newContext(mobile ? { viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: w, height: 900 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', x => errs.push(x.message));
    await page.goto(JA + '/club/coach.html?ui=2');
    await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
    await page.evaluate(() => { const e = ELEVES.find(x => coInClub(x)); e.achats = [{ id: 'hab2', t: 'abo', ref: 'a1', d: isoIn(-5), fin: isoIn(60), nom: 'Abo mensuel', pm: 4 }]; S.tab = 'eleves'; S.elTab = 'fiche'; S.stack = [{ v: 'eleve', id: e.id }]; render(true); });
    await page.waitForSelector('#main .u2boite .u2fb');
    for (const t of ['fiche', 'histo', 'prog', 'suivi']) {
      await page.evaluate(t => { S.elTab = t; render(true); }, t);
      const m = await page.evaluate(() => {
        const r = e => e.getBoundingClientRect(), pad = document.querySelector('#main > .pad'), c1 = document.querySelector('#main .u2fiche'), box = document.querySelector('#main .u2boite'), b2 = box.querySelector('.u2fb'), tabs = box.querySelector('.u2itabs'), on = tabs.querySelector('[aria-selected="true"]');
        return {
          deuxCartes: c1 !== b2 && !c1.contains(b2) && !c1.contains(tabs) && c1.matches('.card') && b2.matches('.card'),
          tabsDansCarte: !!tabs.closest('.u2fiche'),
          ecartOnglet: r(b2).top + parseFloat(getComputedStyle(b2).borderTopWidth) - r(on).bottom,
          ecartBoites: r(box).top - r(c1).bottom, gap: parseFloat(getComputedStyle(pad).rowGap),
          g1: r(c1).left, g2: r(b2).left, d1: innerWidth - r(c1).right, d2: innerWidth - r(b2).right,
          debord: document.documentElement.scrollWidth > innerWidth + 1,
          identite: !!c1.querySelector('.u2fp') && !!c1.querySelector('.u2fa [data-a="u2Prog"]')
        };
      });
      assert.equal(m.deuxCartes, true, w + ' ' + t + ' : deux cartes distinctes');
      assert.equal(m.tabsDansCarte, false, w + ' ' + t + ' : intercalaires hors de la boîte 1');
      assert.ok(Math.abs(m.ecartOnglet) < 0.5, w + ' ' + t + ' : écart nul entre l’intercalaire et la boîte 2 (' + m.ecartOnglet + ')');
      assert.ok(Math.abs(m.ecartBoites - m.gap) <= 1, w + ' ' + t + ' : espacement normal entre cartes (' + m.ecartBoites + ' pour ' + m.gap + ')');
      assert.equal(m.identite, true, w + ' : identité et boutons dans la boîte 1');
      assert.equal(m.debord, false, w + ' ' + t + ' : pas de débordement');
      if (w === 390) for (const v of [m.g1, m.g2, m.d1, m.d2]) assert.ok(Math.abs(v - 10) <= 1, 'marge mobile de 10 px (' + v + ')');
    }
    // cadre Abonné : dans la boîte 2, jauge à 4 segments, texte avec le mois, alerte au-delà
    await page.evaluate(() => { S.elTab = 'fiche'; render(true); });
    assert.equal(await page.locator('#main .u2fb .coabocard .coabs i').count(), 4, w + ' : 4 segments');
    assert.match(await page.textContent('#main .u2fb .coabocard .coabsg'), /\d\/4 ce mois-ci/);
    assert.equal(await page.locator('#main .u2fiche .coabocard').count(), 0, 'le cadre est dans la boîte 2');
    if (w === 390) {
      const h = await page.evaluate(() => ({ ok: coAboSegs({ fait: 2, quota: 4, depasse: false }), over: coAboSegs({ fait: 5, quota: 4, depasse: true }), none: coAboSegs(null) }));
      assert.equal((h.ok.match(/<i class="on">/g) || []).length, 2); assert.match(h.ok, /2\/4 ce mois-ci/); assert.doesNotMatch(h.ok, /depasse/);
      assert.equal((h.over.match(/<i class="on">/g) || []).length, 4); assert.match(h.over, /5\/4 ce mois-ci/); assert.match(h.over, /coabsg depasse/);
      assert.match(h.ok, /(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)/); assert.equal(h.none, '');
      // sans abonnement en cours : aucun cadre
      await page.evaluate(() => { coEl(S.stack[0].id).achats = []; render(true); });
      assert.equal(await page.locator('#main .coabocard').count(), 0, 'pas de cadre sans abonnement');
    }
    assert.deepEqual(errs, []);
    await ctx.close();
  }
});

test('Dojo : page Élèves en une seule boîte sous ses intercalaires (écart 0, tous les intercalaires dans la largeur), fiche : intercalaires entiers, Élèves allumé dans la barre du bas, jauge sans quota noté', async () => {
  for (const [w, mobile] of [[390, true], [820, false], [1280, false]]) {
    const ctx = await browser.newContext(mobile ? { viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: w, height: 900 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', x => errs.push(x.message));
    await page.goto(JA + '/club/coach.html?ui=2');
    await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
    await page.evaluate(() => document.querySelector('.ram-splash')?.remove());
    await page.evaluate(() => { S.tab = 'eleves'; S.elF = 'all'; S.stack = []; render(true); });
    await page.waitForSelector('#main .u2elbox');
    const m = await page.evaluate(() => {
      const r = e => e.getBoundingClientRect(), main = document.getElementById('main'), box = main.querySelector('.u2elbox'), seg = document.querySelector('#main > .seg, #subnav > .seg'),
        on = seg.querySelector('[aria-selected="true"]'), kids = [...box.children].map(c => c.className);
      const tabs = [...seg.querySelectorAll(':scope > button')].filter(b => r(b).width > 0);
      return {
        cartes: main.querySelectorAll('.card:not(.u2elbox):not(.coprev)').length, kids, deborde: seg.scrollWidth > seg.clientWidth + 1,
        coupes: tabs.filter(b => r(b).right > r(seg).right + 1 || r(b).left < r(seg).left - 1).length, nTabs: tabs.length,
        abo: !!seg.querySelector('[data-v="abo"]'), ecart: r(box).top + parseFloat(getComputedStyle(box).borderTopWidth) - r(on).bottom,
        recherche: r(box.querySelector('.cosearch')).top < r(box.querySelector('.cohd')).top && r(box.querySelector('.cohd')).top < r(box.querySelector('.item')).top,
        debord: document.documentElement.scrollWidth > innerWidth + 1, hautSeg: r(seg).width
      };
    });
    assert.equal(m.cartes, 0, w + ' : aucune autre carte que la boîte (recherche et liste dedans)');
    assert.equal(m.recherche, true, w + ' : recherche, puis titre, puis liste dans la boîte');
    assert.equal(m.abo, true, w + ' : onglet Abonnés présent');
    assert.equal(m.debord, false, w + ' : pas de débordement');
    if (w < 1000) {
      assert.equal(m.deborde, false, w + ' : intercalaires sans défilement (' + m.nTabs + ')');
      assert.equal(m.coupes, 0, w + ' : aucun intercalaire coupé');
      assert.ok(Math.abs(m.ecart) < 0.5, w + ' : écart nul entre l’intercalaire et la boîte (' + m.ecart + ')');
    }
    // la boîte suit l'intercalaire choisi
    await page.click('#main > .seg [data-v="abo"], #subnav > .seg [data-v="abo"]');
    assert.ok(await page.locator('#main .u2elbox .cosearch').count() === 1, w + ' : Abonnés : même boîte, recherche en tête');
    // fiche ouverte depuis le Planning : intercalaires entiers, Élèves allumé, jauge d'un abonnement sans quota noté
    await page.evaluate(() => { const e = ELEVES.find(x => coInClub(x)); e.achats = [{ id: 'hsq', t: 'abo', ref: 'a1', d: isoIn(-5), fin: isoIn(60), nom: 'Academy Performance individuel (6 mois)' }]; S.tab = 'planning'; S.elTab = 'fiche'; S.stack = [{ v: 'eleve', id: e.id }]; render(true); });
    await page.waitForSelector('#main .u2boite .u2itabs');
    const f = await page.evaluate(() => {
      const r = e => e.getBoundingClientRect(), t = document.querySelector('#main .u2itabs'), bs = [...t.querySelectorAll('button')];
      return { coupes: bs.filter(b => r(b).right > r(t).right + 1 || r(b).left < r(t).left - 1).length, deborde: t.scrollWidth > t.clientWidth + 1,
        courant: [...document.querySelectorAll('#tabs button[data-t][aria-current]')].map(b => b.dataset.t), segs: document.querySelectorAll('#main .coabocard .coabs i').length, txt: document.querySelector('#main .coabocard .coabsg').textContent };
    });
    if (w < 1000) { assert.equal(f.coupes, 0, w + ' : intercalaires de la fiche entiers'); assert.equal(f.deborde, false); assert.deepEqual(f.courant, ['eleves'], 'barre du bas : Élèves allumé sur une fiche'); }
    assert.equal(f.segs, 4, w + ' : abonnement sans quota noté : 4 segments (défaut)');
    assert.match(f.txt, /0\/4 ce mois-ci/);
    assert.deepEqual(errs, []);
    await ctx.close();
  }
});

test('Dojo : Messages (intercalaire collé aux deux onglets, « + » d’en-tête à deux choix), Planning (plus de « … », vues en intercalaires), Réglages (quatre intercalaires, Historique), aucun fondu sur les intercalaires', async () => {
  for (const [w, mobile] of [[390, true], [1280, false]]) {
    const ctx = await browser.newContext(mobile ? { viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: w, height: 900 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', x => errs.push(x.message));
    await page.goto(JA + '/club/coach.html?ui=2');
    await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
    await page.evaluate(() => document.querySelector('.ram-splash')?.remove());
    // l'écart entre le bas de l'intercalaire choisi et le haut de la boîte qui suit (bordure comprise), quand les intercalaires sont en rangée
    const ecart = () => page.evaluate(() => {
      const seg = document.querySelector('#main > .seg'); if (!seg) return { aucun: true };
      const r = e => e.getBoundingClientRect(), sr = r(seg), on = seg.querySelector('[aria-selected="true"]');
      if (sr.height > 90) return { colonne: true };
      let nx = seg.nextElementSibling; while (nx && !r(nx).height) nx = nx.nextElementSibling;
      const box = nx && (nx.matches('.card') ? nx : nx.querySelector(':scope > .card, :scope > .cobento .card'));
      return { e: box ? r(box).top + parseFloat(getComputedStyle(box).borderTopWidth) - r(on).bottom : null, mask: getComputedStyle(seg).maskImage || getComputedStyle(seg).webkitMaskImage, nb: seg.querySelectorAll(':scope > button').length };
    });
    // Messages : les deux onglets, « + » dans l'en-tête
    for (const t of ['eleves', 'groupes']) {
      await page.evaluate(t => { S.tab = 'msgs'; S.msTab = t; S.stack = []; render(true); }, t);
      const e = await ecart();
      if (!e.colonne && !e.aucun) { assert.ok(e.e !== null && Math.abs(e.e) < 0.5, w + ' Messages ' + t + ' : écart nul (' + e.e + ')'); assert.ok(!e.mask || e.mask === 'none', 'aucun fondu'); }
      assert.equal(await page.locator('#main [data-a="coNewMsg"]').count(), 0, w + ' : plus de grand bouton « Nouveau message » dans la page');
      assert.equal(await page.locator('#top .u2msgnew').count(), 1, w + ' : « + » dans l’en-tête');
    }
    assert.equal(await page.locator('#top .u2msgnew').getAttribute('aria-label'), 'Nouveau message');
    await page.click('#top .u2msgnew');
    assert.equal(await page.locator('#layer .menu button').count(), 2, w + ' : deux choix');
    assert.match(await page.textContent('#layer .menu'), /Écrire à un élève[\s\S]*Écrire à un groupe/);
    await page.click('#layer [data-a="coNewMsg"]');
    assert.ok(await page.locator('#layer [data-a="coOpenDm"]').count() > 0, w + ' : « Écrire à un élève » mène à la liste des élèves');
    await page.evaluate(() => closeSheet());
    // Planning : pas de « … », Jour / Semaine / Mois en intercalaires collés à la boîte
    for (const v of ['jour', 'semaine', 'mois']) {
      await page.evaluate(v => { S.tab = 'planning'; S.stack = []; S.pl.v = v; render(true); }, v);
      assert.equal(await page.locator('#top [data-a="coPlMore"], #main [data-a="coPlMore"]').count(), 0, w + ' : plus de « … » au Planning');
      assert.equal(await page.locator('#main .covue').count(), 0, 'plus de pastilles Jour / Semaine / Mois séparées');
      const e = await ecart();
      assert.equal(e.nb, 3, w + ' Planning ' + v + ' : trois intercalaires');
      assert.ok(e.e !== null && Math.abs(e.e) < 0.5, w + ' Planning ' + v + ' : écart nul (' + e.e + ')');
      assert.ok(!e.mask || e.mask === 'none');
    }
    // Réglages : quatre intercalaires, historique des séances dedans
    await page.evaluate(() => { S.tab = 'me'; S.stack = []; S.meTab = 'profil'; render(true); });
    let e = await ecart();
    assert.equal(e.nb, 4, w + ' Réglages : quatre intercalaires'); assert.ok(Math.abs(e.e) < 0.5, w + ' Réglages : écart nul (' + e.e + ')');
    assert.equal(await page.locator('#main .u2regl').count(), 0, 'la petite boîte « Réglages » a disparu');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, w + ' : pas de débordement');
    await page.click('#main [data-a="u2MeTab"][data-k="histo"]');
    assert.ok(await page.locator('#main .u2mebox').count() === 1 && /séance/i.test(await page.textContent('#main .u2mebox')), w + ' : Réglages > Historique');
    assert.equal(await page.evaluate(() => { try { return localStorage.getItem('coach-reglages-onglet'); } catch (x) { return 'histo'; } }), 'histo', 'dernier intercalaire retenu');
    await page.click('#main [data-a="u2MeTab"][data-k="offres"]');
    assert.match(await page.textContent('#main .u2mebox'), /Formules et tarifs[\s\S]*Échelles techniques/);
    await page.click('#main [data-a="u2MeTab"][data-k="agenda"]');
    assert.match(await page.textContent('#main .u2mebox'), /Calendly/);
    // aucun fondu : Aujourd'hui, Élèves (390 px)
    if (w === 390) for (const t of ['today', 'eleves']) {
      await page.evaluate(t => { S.tab = t; S.stack = []; render(true); }, t);
      const m = await page.evaluate(() => { const s = document.querySelector('#main > .seg'); const c = getComputedStyle(s); return c.maskImage || c.webkitMaskImage || 'none'; });
      assert.ok(m === 'none', t + ' : mask-image calculé « none » (' + m + ')');
    }
    assert.deepEqual(errs, []);
    await ctx.close();
  }
});

test('Buvette : une seule boîte sous les intercalaires (Agenda, Jouer, Messages), écart 0 à 390 et 1280 px, intercalaires entiers sans fondu', async () => {
  for (const [w, mobile] of [[390, true], [1280, false]]) {
    const ctx = await browser.newContext(mobile ? { viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: w, height: 900 } }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', x => errs.push(x.message));
    await page.goto(JA + '/club/index.html');
    await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
    await page.waitForTimeout(1000);
    await page.evaluate(() => document.querySelector('.ram-splash')?.remove());
    const ETATS = [['agenda', "S.tab='agenda'; S.plan.scope='me'"], ['agenda du club', "S.tab='agenda'; S.plan.scope='club'"], ['parties', "S.tab='jouer'; S.jouTab='parties'"], ['équipes', "S.tab='jouer'; S.jouTab='equipes'"], ['résultats', "S.tab='jouer'; S.jouTab='resultats'"], ['messages club', "S.tab='chans'; S.chanTab='club'"], ['messages entraînements', "S.tab='chans'; S.chanTab='train'"], ['messages équipes', "S.tab='chans'; S.chanTab='team'"]];
    for (const [nom, code] of ETATS) {
      await page.evaluate(c => { S.stack = []; eval(c); render(true); }, code);
      await page.waitForSelector('#main .card.bvbox', { timeout: 5000 });
      const m = await page.evaluate(() => {
        const r = e => e.getBoundingClientRect(), main = document.getElementById('main'), seg = document.querySelector('#main > .seg, #subnav > .seg'), box = main.querySelector('.card.bvbox'), on = seg.querySelector('[aria-selected="true"]'), c = getComputedStyle(seg);
        return { colonne: r(seg).height > 90, e: r(box).top + parseFloat(getComputedStyle(box).borderTopWidth) - r(on).bottom, mask: c.maskImage || c.webkitMaskImage || 'none',
          deborde: seg.scrollWidth > seg.clientWidth + 1, coupes: [...seg.querySelectorAll(':scope > button')].filter(b => r(b).right > r(seg).right + 1).length,
          autres: [...main.children].filter(x => !x.matches('.seg, .bvbox, .bvag, .seg-out') && r(x).height > 0 && !x.matches('.segt')).length,
          cartes: box.querySelectorAll('.card:not(.bvbox)').length > -1, gauche: r(box).left, debord: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      assert.equal(m.autres, 0, w + ' ' + nom + ' : tout le contenu est dans la boîte');
      assert.equal(m.debord, false, w + ' ' + nom + ' : pas de débordement');
      assert.ok(m.mask === 'none', w + ' ' + nom + ' : aucun fondu (' + m.mask + ')');
      if (!m.colonne) {
        assert.ok(Math.abs(m.e) < 0.5, w + ' ' + nom + ' : écart nul entre l’intercalaire et la boîte (' + m.e + ')');
        assert.equal(m.deborde, false, w + ' ' + nom + ' : intercalaires sans défilement'); assert.equal(m.coupes, 0, w + ' ' + nom + ' : aucun intercalaire coupé');
      }
      if (w === 390) assert.ok(Math.abs(m.gauche - 10) <= 1, nom + ' : gouttière de 10 px (' + m.gauche + ')');
    }
    // Messages : « Créer un groupe de discussion » en tête de boîte, l'aide en petit texte à la fin
    await page.evaluate(() => { S.stack = []; S.tab = 'chans'; S.chanTab = 'club'; render(true); });
    await page.waitForSelector('#main .card.bvbox');
    const ordre = await page.evaluate(() => [...document.querySelector('#main .card.bvbox').children].map(x => x.matches('.btn') ? 'action' : x.matches('.lis') ? 'liste' : x.matches('.bvaide') ? 'aide' : 'autre').filter(x => x !== 'autre').join(','));
    if (w === 390) assert.match(ordre, /^action,liste,aide$|^liste,aide$/, w + ' : ordre action, liste, aide (' + ordre + ')');
    assert.deepEqual(errs, []);
    await ctx.close();
  }
});

test('Buvette, Trophées : la tuile active est le dernier palier atteint, les paliers verrouillés gardent leur cadre, le prochain dit ce qu’il reste, trophées à paliers dans une seule boîte', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', x => errs.push(x.message));
  await page.goto(JA + '/club/index.html');
  await page.waitForSelector('#tabs button[data-t]', { timeout: 8000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => document.querySelector('.ram-splash')?.remove());
  for (const [pts, actif, suivant] of [[796, 'Argent', 'Or'], [0, 'Sans cadre', 'Bronze'], [20000, 'Légende', null]]) {
    await page.evaluate(p => { const me = ME(); XP[me] = 0; XP[me] = p - score(me); S.stack = [{ v: 'trophies', id: me }]; render(true); }, pts);
    await page.waitForSelector('.fpath .fp-st');
    const r = await page.evaluate(() => {
      const p = document.querySelector('.fpath'), st = [...p.querySelectorAll('.fp-st')], nom = e => e.querySelector('.fp-card b').textContent;
      return { now: st.filter(e => e.classList.contains('now')).map(nom), nxt: st.filter(e => e.classList.contains('nxt')).map(nom), reste: st.map(e => (e.querySelector('.fp-reste') || {}).textContent || ''),
        plat: (() => { const e = st.find(x => nom(x) === 'Platine'); return { lock: e.classList.contains('lock'), cadenas: !!e.querySelector('.fp-lock'), cadre: !!e.querySelector('.av.fr4'), filtre: getComputedStyle(e.querySelector('.av')).filter }; })(),
        box: document.querySelectorAll('.tbox').length, kick: (document.querySelector('.tbox .kicker') || {}).textContent };
    });
    assert.deepEqual(r.now, [actif], pts + ' pts : tuile active = ' + actif);
    if (suivant) { assert.deepEqual(r.nxt, [suivant]); assert.ok(r.reste.some(t => /^encore \d+ pts$/.test(t)), 'encore N pts sous le prochain palier'); } else assert.deepEqual(r.nxt, []);
    assert.ok(r.plat.cadre, 'le cadre Platine est dessiné');
    if (pts < 2500) { assert.ok(r.plat.lock && r.plat.cadenas, 'Platine : verrouillé, avec cadenas'); assert.equal(r.plat.filtre, 'none', 'Platine : photo en couleurs, pas de noir et blanc'); }
    assert.equal(r.box, 1, 'une seule boîte pour les trophées à paliers'); assert.match(r.kick, /Trophées à paliers/);
  }
  assert.deepEqual(errs, []);
  await ctx.close();
});
