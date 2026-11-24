/* Notifications natives d'Apple (appli /Buvette de l'App Store) : jeton reconnu, message routé vers APNs, jeton périmé oublié */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs'), os = require('os'), path = require('path');
const { estJeton, charge, jwt, reglages } = require('../lib/apns');

const jetonOk = 'apns:' + 'ab12'.repeat(16);

test('APNs : jeton reconnu, charge utile et réglages', () => {
  assert.ok(estJeton(jetonOk));
  assert.ok(!estJeton('https://push.test/x'));
  assert.ok(!estJeton('apns:zz'));
  const c = JSON.parse(charge({ title: 'Club', body: 'Nouvelle publication', url: '#/post/p1', tag: 'post-p1' }));
  assert.equal(c.aps.alert.title, 'Club');
  assert.equal(c.data.url, '#/post/p1');
  assert.equal(reglages({}), null, 'sans clé : désactivé');
  assert.equal(reglages({ APNS_KEY: 'k', APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', APNS_SANDBOX: '1' }).host, 'https://api.sandbox.push.apple.com');
});

test('APNs : jeton d’accès ES256 vérifiable avec la clé publique', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const t = jwt({ key: privateKey.export({ type: 'pkcs8', format: 'pem' }), kid: 'ABC123', team: 'TEAM1' });
  const [h, p, s] = t.split('.');
  assert.equal(JSON.parse(Buffer.from(h, 'base64url')).kid, 'ABC123');
  assert.equal(JSON.parse(Buffer.from(p, 'base64url')).iss, 'TEAM1');
  assert.ok(crypto.verify('sha256', Buffer.from(h + '.' + p), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
});

test('APNs : un iPhone abonné reçoit par Apple, un jeton périmé est oublié', async () => {
  const { createStore } = require('../lib/store');
  const { createWebPush } = require('../lib/webpush');
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
  const store = createStore(fs.mkdtempSync(path.join(os.tmpdir(), 'ram-apns-')));
  if (saved.url) process.env.SUPABASE_URL = saved.url;
  if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;
  const envois = [];
  let reponse = { ok: true, gone: false };
  const push = createWebPush({ store, apns: { envoyer: async (e, m) => { envois.push([e, m.body]); return reponse; } } });
  await push.setCalme('U', { on: false });
  await push.subscribe('U', { endpoint: jetonOk }, 'iPhone', 'club');
  assert.equal(await push.send('U', { title: 'x', body: 'Nouvelle publication' }), 1);
  assert.deepEqual(envois, [[jetonOk, 'Nouvelle publication']]);
  reponse = { ok: false, gone: true };
  await push.send('U', { title: 'x', body: 'Encore' });
  assert.equal((await store.listPushSubs('U')).length, 0, 'jeton périmé supprimé');
});
