/* =========================================================================
   Test d'écran /Pista : compléter les inscriptions avec des joueurs fictifs (onglet Inscriptions)
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
  dataDir = mkdtempSync(join(tmpdir(), 'ram-fic-'));
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

test('Joueurs fictifs : compléter, étiqueter, empêcher la clôture, retirer', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const r = await ctx.request.post(JA + '/api/auth/signup', { data: { email: `fic-${Date.now()}@exemple.test`, password: 'essai-fic-1', first: 'Fab', last: 'Test' } });
  assert.equal(r.status(), 200);
  const tid = (await (await ctx.request.post(JA + '/api/tournaments', { data: { name: 'Tournoi à compléter' } })).json()).id;
  const act = (type, payload) => ctx.request.post(`${JA}/api/t/${tid}/action`, { data: { type, payload } });
  await act('tournament/update', { maxPairs: 8, category: 'P100' });
  for (const [a, b] of [['REELLE', 'VRAIE'], ['SERIEUX', 'REEL'], ['LAMBERT', 'ROY']]) await act('pair/add', { p1: { last: a, first: 'Ana', rank: '800' }, p2: { last: b, first: 'Léa', rank: '900' } });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(JA + '/t/' + tid);
  await page.waitForSelector('#nav [data-tab="inscriptions"]');
  await page.evaluate(() => document.querySelector('#nav [data-tab="inscriptions"]').click());
  await page.waitForSelector('#btnFictifs');
  // avant : bouton actif, explication courte ; aucun fictif, donc pas de bouton « Retirer »
  assert.equal(await page.locator('#btnFictifs').isDisabled(), false);
  assert.match(await page.textContent('#ficInfo'), /Ajoute 5 paires fictives/);
  assert.equal(await page.locator('#btnFictifsOut').isVisible(), false);
  const avant = await page.$$eval('#tblMain tr[data-id]', l => l.map(x => x.textContent.replace(/\s+/g, ' ')));
  assert.equal(avant.length, 3);
  // compléter : 5 paires fictives, étiquetées, les 3 vraies inchangées
  await page.click('#btnFictifs');
  await page.waitForFunction(() => document.querySelectorAll('#tblMain tr[data-id]').length === 8, null, { timeout: 8000 });
  assert.equal(await page.locator('#tblMain .fic-tag').count(), 5, 'une étiquette « Fictif » par paire fictive');
  assert.match(await page.textContent('#tblMain .fic-tag'), /^Fictif$/);
  const apres = await page.$$eval('#tblMain tr[data-id]', l => l.filter(x => !x.querySelector('.fic-tag')).map(x => x.textContent.replace(/\s+/g, ' ')));
  assert.equal(apres.length, 3);
  assert.deepEqual(apres.map(x => x.replace(/^\s*\d+\s*/, '')), avant.map(x => x.replace(/^\s*\d+\s*/, '')), 'les vraies paires sont affichées à l’identique');
  assert.equal(await page.locator('#btnFictifs').isDisabled(), true, 'tableau complet : bouton inactif');
  assert.match(await page.textContent('#ficInfo'), /Tableau complet \(8 paires\)/);
  assert.ok((await page.getAttribute('#btnFictifs', 'title')).length > 10, 'explication courte au survol');
  // lisible sur 360 px, sans débordement
  await page.setViewportSize({ width: 360, height: 760 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, 'pas de débordement à 360 px');
  assert.ok(await page.locator('#btnFictifs').boundingBox().then(b => b.height >= 40));
  await page.setViewportSize({ width: 1280, height: 800 });
  // tirage fait : la clôture est impossible et expliquée ; « Retirer » demande d'annuler le tirage
  await act('draw/create', {});
  await page.evaluate(() => document.querySelector('#nav [data-tab="tournoi"]').click());
  await page.waitForFunction(() => /joueurs fictifs/.test(document.getElementById('closeBox')?.textContent || ''), null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => document.getElementById('closeBtn').disabled), true, 'bouton Clôturer inactif');
  assert.match(await page.textContent('#closeBox'), /joueurs fictifs/);
  await page.evaluate(() => document.querySelector('#nav [data-tab="inscriptions"]').click());
  assert.equal(await page.locator('#btnFictifsOut').isDisabled(), true);
  assert.match(await page.textContent('#ficInfo'), /annulez le tirage/);
  // tirage annulé : retrait des fictifs seulement
  await act('draw/reset', {});
  await page.waitForFunction(() => !document.getElementById('btnFictifsOut').disabled, null, { timeout: 8000 });
  await page.click('#btnFictifsOut');
  await page.waitForFunction(() => document.querySelectorAll('#tblMain tr[data-id]').length === 3, null, { timeout: 8000 });
  assert.equal(await page.locator('.fic-tag').count(), 0);
  assert.equal(await page.locator('#btnFictifsOut').isVisible(), false);
  assert.deepEqual(errs, []);
  await ctx.close();
});
