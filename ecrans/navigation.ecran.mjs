/* =========================================================================
   Tests d'écran /Pista : copie locale, demandes partagées, clics rapides, échec puis « Réessayer »
   Lancement : npm run test:ecrans (Playwright requis, voir CLAUDE.md)
   ========================================================================= */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const freePort = () => new Promise((ok, ko) => { const s = net.createServer(); s.on('error', ko); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
let JA, server, dataDir, browser;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ram-nav-'));
  const port = await freePort(); JA = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PORT: String(port), DATA_DIR: dataDir };
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].forEach(k => delete env[k]);
  server = spawn(process.execPath, [join(ROOT, 'server.js')], { env, stdio: 'ignore' });
  let exited = null; server.once('exit', c => { exited = c; });
  for (const t0 = Date.now(); ; await new Promise(r => setTimeout(r, 100))) {
    try { if ((await fetch(JA + '/')).ok) break; } catch (e) { /* pas encore prêt */ }
    if (exited !== null) throw new Error('le serveur s’est arrêté au démarrage (code ' + exited + ')');
    if (Date.now() - t0 > 30000) throw new Error('le serveur ne répond pas au bout de 30 s');
  }
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  if (server && server.exitCode == null) await new Promise(r => { server.once('exit', r); server.kill(); setTimeout(r, 3000); });
  try { rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (e) { /* temporaire */ }
});

const t = () => Date.now() + '-' + Math.floor(Math.random() * 1e6);
async function compte(ctx, prenom) {
  const r = await ctx.request.post(JA + '/api/auth/signup', { data: { email: `nav-${prenom}-${t()}@exemple.test`, password: 'essai-nav-1', first: prenom, last: 'Nav' } });
  assert.equal(r.status(), 200);
}
const creer = async (ctx, name) => { const r = await ctx.request.post(JA + '/api/tournaments', { data: { name } }); assert.equal(r.status(), 200); return (await r.json()).id; };
const ouvrir = async ctx => { const page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); return { page, errs }; };
/* ralentit les lectures de la liste des tournois : la demande reste « en route » pendant `ms` */
const ralentir = (page, ms, compteur) => page.route('**/api/tournaments', async route => {
  if (route.request().method() !== 'GET') return route.continue();
  if (compteur) compteur.n++;
  await new Promise(r => setTimeout(r, ms)); await route.continue().catch(() => {});
});

test('Copie locale : l’accueil se montre avant la réponse du réseau, et jamais avec les données d’un autre compte', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await compte(ctx, 'Alice');
  await creer(ctx, 'Tournoi secret d’Alice');
  const { page, errs } = await ouvrir(ctx);
  await page.goto(JA + '/dashboard');
  await page.waitForFunction(() => /secret d’Alice/.test(document.querySelector('#current')?.textContent || ''), null, { timeout: 8000 });
  // 2e visite, réseau lent : la copie s'affiche aussitôt, avant la réponse
  const lent = { n: 0 };
  await ralentir(page, 2500, lent);
  await page.reload({ waitUntil: 'commit' });
  await page.waitForFunction(() => /secret d’Alice/.test(document.querySelector('#current')?.textContent || ''), null, { timeout: 1800 });
  assert.equal(lent.n, 1, 'la demande du réseau est toujours en route : c’est bien la copie qui s’affiche');
  await page.waitForTimeout(2800);
  // autre compte sur le même navigateur : déconnexion, nouveau compte
  await page.unroute('**/api/tournaments');
  await page.goto(JA + '/deconnexion');
  await compte(ctx, 'Bruno');
  await ralentir(page, 2500);
  await page.goto(JA + '/dashboard', { waitUntil: 'commit' });
  await page.waitForTimeout(1500);
  const vu = await page.evaluate(() => document.body.innerText);
  assert.ok(!/secret d’Alice/.test(vu), 'rien d’Alice chez Bruno, même avant la réponse du réseau');
  await page.waitForTimeout(2500);
  const fin = await page.evaluate(() => document.querySelector('#current')?.textContent || '');
  assert.ok(/Tournoi d'exemple/.test(fin) && !/Alice/.test(fin), 'accueil de Bruno (tournoi d’exemple de son compte) : ' + fin);
  assert.ok(!(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('pja:copie:')).some(k => /Alice/.test(localStorage.getItem(k))))), 'plus aucune copie d’Alice');
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Demandes partagées : l’accueil ne demande chaque donnée qu’une fois', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await compte(ctx, 'Carla');
  await creer(ctx, 'Tournoi partagé');
  const { page } = await ouvrir(ctx);
  const reqs = [];
  page.on('request', q => { const p = new URL(q.url()).pathname; if (p.startsWith('/api/')) reqs.push(p); });
  await page.goto(JA + '/dashboard');
  await page.waitForFunction(() => document.querySelector('#current h2'), null, { timeout: 8000 });
  await page.waitForTimeout(1200);
  const n = p => reqs.filter(x => x === p).length;
  assert.equal(n('/api/tournaments'), 1, 'liste des tournois : une demande');
  assert.equal(n('/api/me'), 1, 'compte : une demande');
  await ctx.close();
});

test('Clics rapides : seule la dernière page demandée s’affiche, sans erreur ni reste de la précédente', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await compte(ctx, 'Denis');
  await creer(ctx, 'Tournoi rapide');
  const { page, errs } = await ouvrir(ctx);
  await page.goto(JA + '/dashboard');
  await page.waitForSelector('#current h2');
  // la page « Tournois » arrive lentement ; on clique tout de suite sur « Calendrier », puis « Accueil »
  await page.route('**/app', async route => { if (route.request().resourceType() === 'fetch') await new Promise(r => setTimeout(r, 1500)); await route.continue().catch(() => {}); });
  await page.click('.rail a[data-r="tournois"]');
  await page.click('.rail a[data-r="calendrier"]');
  await page.waitForSelector('#cal', { timeout: 8000 });
  await page.waitForTimeout(2200);   // la réponse tardive de « Tournois » arrive : elle ne doit rien changer
  assert.equal(new URL(page.url()).pathname, '/calendrier');
  assert.equal(await page.locator('#psRows, #psCols').count(), 0, 'rien de la page Tournois sur le calendrier');
  assert.equal(await page.locator('#cal').count(), 1);
  await page.click('.rail a[data-r="dashboard"]');
  await page.waitForSelector('#current h2');
  assert.equal(await page.locator('#cal').count(), 0);
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Échec puis Réessayer : message clair, bouton, données au second essai ; copie ancienne signalée', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await compte(ctx, 'Elsa');
  await creer(ctx, 'Tournoi de secours');
  const { page, errs } = await ouvrir(ctx);
  // 1) première visite sans copie, réseau en panne : le message et Réessayer, jamais une page vide
  await page.route('**/api/tournaments', route => (route.request().method() === 'GET' ? route.abort('failed') : route.continue()));
  await page.goto(JA + '/dashboard');
  await page.waitForSelector('#current [data-don-retry]', { timeout: 8000 });
  assert.match(await page.textContent('#current'), /n’ont pas pu être chargées/);
  // le réseau revient : Réessayer
  await page.unroute('**/api/tournaments');
  await page.click('#current [data-don-retry]');
  await page.waitForFunction(() => /Tournoi de secours/.test(document.querySelector('#current')?.textContent || ''), null, { timeout: 8000 });
  // 2) avec une copie à l'écran, le réseau tombe : la copie reste, avec un signal discret « peut-être anciennes »
  await page.route('**/api/tournaments', route => (route.request().method() === 'GET' ? route.abort('failed') : route.continue()));
  await page.reload();
  await page.waitForSelector('#donAncien', { timeout: 8000 });
  assert.match(await page.textContent('#current'), /Tournoi de secours/, 'la copie reste affichée');
  await page.unroute('**/api/tournaments');
  await page.click('#donAncien');
  await page.waitForFunction(() => !document.getElementById('donAncien'), null, { timeout: 8000 });
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('Session expirée : la page mène à la connexion', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await compte(ctx, 'Félix');
  const { page } = await ouvrir(ctx);
  await page.goto(JA + '/dashboard');
  await page.waitForSelector('#current h2');
  await ctx.clearCookies();   // la session expire pendant que la page est ouverte
  await page.evaluate(() => { Donnees.page('/api/tournaments', () => {}, '#current').relire(); });
  await page.waitForFunction(() => location.pathname.startsWith('/connexion'), null, { timeout: 8000 });
  await ctx.close();
});

test('Tournoi en cours ↔ Accueil : le retour à l’accueil depuis l’éditeur affiche la copie sans attendre', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await compte(ctx, 'Gaëlle');
  const id = await creer(ctx, 'Tournoi éditeur');
  const { page, errs } = await ouvrir(ctx);
  await page.goto(JA + '/dashboard');
  await page.waitForFunction(() => /Tournoi éditeur/.test(document.querySelector('#current')?.textContent || ''), null, { timeout: 8000 });
  await page.goto(JA + '/t/' + id);
  await page.waitForSelector('.rail a[data-r="dashboard"]');
  await ralentir(page, 2500);
  await page.click('.rail a[data-r="dashboard"]');
  await page.waitForURL(/\/dashboard$/);
  await page.waitForFunction(() => /Tournoi éditeur/.test(document.querySelector('#current')?.textContent || ''), null, { timeout: 1800 });
  assert.deepEqual(errs, []);
  await ctx.close();
});
