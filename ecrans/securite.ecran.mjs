/* =========================================================================
   Tests d'écran : la règle de contenu (Content-Security-Policy) ne bloque rien d'utile
   - chaque page des trois applis s'ouvre sans violation de la règle ni erreur JavaScript
   - les en-têtes de sécurité sont bien envoyés
   Lancement : node --test --test-timeout=90000 ecrans/securite.ecran.mjs
   ========================================================================= */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4100 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let server, dataDir, browser;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ram-secu-'));
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: dataDir };
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].forEach(k => delete env[k]);
  server = spawn(process.execPath, [join(ROOT, 'server.js')], { env, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(B + '/')).ok) break; } catch (e) { /* pas encore prêt */ }
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch();
});
after(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
  try { rmSync(dataDir, { recursive: true, force: true }); } catch (e) { /* rien */ }
});

const PAGES = ['/', '/demo', '/connexion', '/connecteur', '/mot-de-passe-oublie', '/club/demo', '/club/connexion', '/club/presentation', '/club/coach.html', '/club/coach-presentation.html'];
// pages /RAM JA d'un compte connecté (compte de démonstration ouvert par /demo)
const CONNECTE = ['/app', '/dashboard', '/calendrier', '/joueurs', '/statistiques', '/profil', '/tv', '/overlay', '/remote', '/r/essai'];

test('en-têtes de sécurité envoyés avec les pages et les réponses', async () => {
  const r = await fetch(B + '/club/demo');
  assert.match(r.headers.get('content-security-policy') || '', /script-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
  const j = await fetch(B + '/api/ram/clubs');
  assert.equal(j.headers.get('x-content-type-options'), 'nosniff');
});

for (const url of PAGES.concat(CONNECTE)) {
  test(`règle de contenu : ${url} s'ouvre sans rien de bloqué`, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
    const page = await ctx.newPage(), errs = [], viol = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) viol.push(m.text().slice(0, 200)); });
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error('Refused to run: ' + e.violatedDirective + ' ' + e.blockedURI)));
    if (CONNECTE.includes(url)) { await page.goto(B + '/demo'); await page.waitForTimeout(600); }
    const r = await page.goto(B + url);
    assert.ok(r && r.status() < 400, `${url} répond`);
    await page.waitForTimeout(1500);
    // les polices Google sont permises ; une coupure réseau dans l'environnement de test n'est pas une violation
    assert.deepEqual(viol, [], `${url} : rien de bloqué par la règle de contenu`);
    assert.deepEqual(errs, [], `${url} : aucune erreur JavaScript`);
    await ctx.close();
  });
}
