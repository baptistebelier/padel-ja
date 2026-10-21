/* Webhook Shopify de bout en bout : un vrai serveur Padel JA sur des données temporaires */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const SECRET = 'cle-de-test-webhook';
const PORT = 39000 + Math.floor(Math.random() * 900);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'padelja-webhook-'));
let srv;

test.before(async () => {
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA, SHOPIFY_WEBHOOK_SECRET: SECRET });
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].forEach(k => delete env[k]);
  srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) {
    try { await fetch(`http://127.0.0.1:${PORT}/`); return; } catch (e) { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error('serveur de test non démarré');
});
test.after(() => { srv && srv.kill(); });

const send = (body, sig, topic = 'orders/paid') => {
  const raw = Buffer.from(JSON.stringify(body));
  return fetch(`http://127.0.0.1:${PORT}/api/shopify/webhook`, { method: 'POST', body: raw,
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Topic': topic, 'X-Shopify-Hmac-Sha256': sig === undefined ? crypto.createHmac('sha256', SECRET).update(raw).digest('base64') : sig } });
};
const order = { id: 9001, name: '#9001', email: 'nouveau.club@exemple.test', customer: { first_name: 'Nina', last_name: 'Club' }, line_items: [{ sku: 'PJA-CLUB-AN', quantity: 1 }] };
const users = () => fs.readdirSync(path.join(DATA, 'users')).map(f => JSON.parse(fs.readFileSync(path.join(DATA, 'users', f), 'utf8')));

test('signature fausse : refusée, aucun compte créé', async () => {
  const r = await send(order, 'fausse-signature');
  assert.equal(r.status, 401);
  assert.equal(users().length, 0);
});

test('commande payée : compte créé, accès Club activé pour 1 an', async () => {
  const r = await send(order);
  assert.equal(r.status, 200);
  const u = users().find(x => x.email === 'nouveau.club@exemple.test');
  assert.ok(u, 'compte créé');
  assert.equal(u.plan, 'actif');
  assert.equal(u.pass_hash, null, 'mot de passe choisi par le client via l\'e-mail');
  const acc = JSON.parse(fs.readFileSync(path.join(DATA, 'modeles', u.id + '.json'), 'utf8'));
  assert.ok(acc.billing.until > Date.now() + 360 * 864e5);
  assert.deepEqual(acc.billing.orders, ['9001']);
});

test('même commande renvoyée par Shopify : rien ne change', async () => {
  const r = await send(order).then(x => x.json());
  assert.equal(r.reason, 'commande déjà traitée');
  assert.equal(users().length, 1);
});

test('autre événement Shopify : ignoré', async () => {
  const r = await send(order, undefined, 'orders/create').then(x => x.json());
  assert.equal(r.ignored, true);
});
