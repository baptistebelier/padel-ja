/* Notifications push : le message chiffré par le serveur se déchiffre comme sur le téléphone (RFC 8291) */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { encrypt, newKeys, vapidHeader } = require('../lib/webpush');

const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

test('chiffrement aes128gcm déchiffrable par le navigateur abonné', () => {
  // côté téléphone : sa paire de clés et son secret d'authentification
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
  const auth = crypto.randomBytes(16);
  const body = encrypt({ keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) } }, JSON.stringify({ title: 'TC Test', body: 'Ton match à 14 h 30' }));
  // déchiffrement, comme le fait le navigateur
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const shared = ua.computeSecret(asPub);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2, 'délimiteur de fin');
  assert.deepEqual(JSON.parse(plain.subarray(0, -1).toString()), { title: 'TC Test', body: 'Ton match à 14 h 30' });
});

test('signature VAPID vérifiable avec la clé publique', () => {
  const k = newKeys();
  const h = vapidHeader('https://fcm.googleapis.com/fcm/send/abc', k, 'mailto:contact@riseandmove.fr');
  const [, jwt, pub] = h.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(pub, k.pub);
  const [head, body, sig] = jwt.split('.');
  assert.equal(JSON.parse(Buffer.from(body, 'base64url')).aud, 'https://fcm.googleapis.com');
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: k.x, y: k.y }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from(head + '.' + body), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')));
});

test('appareils : l’enseignement va à l’appli /RAM Coach, le reste à /RAM Club', async () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const { createStore } = require('../lib/store');
  const { createWebPush } = require('../lib/webpush');
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
  const store = createStore(fs.mkdtempSync(path.join(os.tmpdir(), 'ram-push-')));
  if (saved.url) process.env.SUPABASE_URL = saved.url;
  if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;
  const push = createWebPush({ store }), hits = [], real = global.fetch;
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
  const sub = n => ({ endpoint: 'https://push.test/' + n, keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(crypto.randomBytes(16)) } });
  await push.subscribe('U', sub('club'), 'Chrome', 'club');
  await push.subscribe('U', sub('coach'), 'Chrome', 'coach');
  global.fetch = async url => { hits.push(url); return { ok: true, status: 201 }; };
  try {
    await push.send('U', { title: 'x', body: 'Nouvelle réservation', app: 'coach' }).catch(() => 0);
    await push.send('U', { title: 'x', body: 'Nouvelle publication' }).catch(() => 0);
  } finally { global.fetch = real; }
  assert.deepEqual(hits.map(u => u.split('/').pop()), ['coach', 'club']);
});

test('/RAM JA : l’abonnement est reconnu, et son message ne part pas sur les autres applis', async () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const { createStore } = require('../lib/store');
  const { createWebPush } = require('../lib/webpush');
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
  const store = createStore(fs.mkdtempSync(path.join(os.tmpdir(), 'ram-pushja-')));
  if (saved.url) process.env.SUPABASE_URL = saved.url;
  if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;
  const push = createWebPush({ store }), hits = [], real = global.fetch;
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
  const sub = n => ({ endpoint: 'https://push.test/' + n, keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(crypto.randomBytes(16)) } });
  global.fetch = async u => { hits.push(String(u).split('/').pop()); return { ok: true, status: 201 }; };
  try {
    await push.subscribe('U', sub('club'), 'Chrome', 'club');
    await push.send('U', { body: 'x', app: 'ja' });
    assert.deepEqual(hits, ['club'], 'sans appareil /RAM JA : sur /RAM Club');
    hits.length = 0;
    await push.subscribe('U', sub('ja'), 'Chrome', 'ja');
    await push.send('U', { body: 'x', app: 'ja' });
    assert.deepEqual(hits, ['ja']);
    hits.length = 0;
    await push.send('U', { body: 'x' });
    assert.deepEqual(hits, ['club'], 'un message du Club ne va pas sur /RAM JA');
  } finally { global.fetch = real; }
});
test('/RAM JA : message d’inscription, de retrait, tournoi complet', () => {
  const { avisInscription } = require('../lib/jaclub');
  assert.equal(avisInscription('T1', { name: 'Open' }, 'in', 'Nina A / Paul B', 3, 16).body, "Nina A / Paul B s'inscrit : Open");
  assert.equal(avisInscription('T1', { name: 'Open' }, 'in', 'A / B', 16, 16).body, "A / B s'inscrit : Open · complet (16/16)");
  const m = avisInscription('T1', { name: 'Open' }, 'out', 'A / B', 15, 16);
  assert.equal(m.body, 'A / B se retire : Open');
  assert.deepEqual([m.app, m.url], ['ja', '/t/T1']);
});

test('boîte de notifications : gardée même sans appareil, et par appli', async () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const { createStore } = require('../lib/store');
  const { createWebPush, pourAppli } = require('../lib/webpush');
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
  const store = createStore(fs.mkdtempSync(path.join(os.tmpdir(), 'ram-inbox-')));
  if (saved.url) process.env.SUPABASE_URL = saved.url;
  if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;
  const push = createWebPush({ store });
  await push.sendMany(['SANS'], { title: 'Club', body: 'Nouvelle réservation', url: '#/seance/r1.2031-01-01?club=C', app: 'coach' });
  await push.sendMany(['SANS'], { title: 'Club', body: 'Publication', url: '#/post/p1?club=C' });
  await push.sendMany(['SANS'], { title: '/RAM JA', body: 'Inscription', url: '/t/1', app: 'ja' });
  const l = await push.boite('SANS', 0);
  assert.equal(l.length, 3, 'un compte sans téléphone abonné les retrouve dans son panneau');
  assert.deepEqual(pourAppli(l, 'coach').map(x => x.body), ['Nouvelle réservation']);
  assert.deepEqual(pourAppli(l, 'club').map(x => x.body).sort(), ['Nouvelle réservation', 'Publication']);
  assert.deepEqual(pourAppli(l, 'ja').map(x => x.body), ['Inscription']);
  assert.equal((await push.boite('SANS', Date.now() + 1000)).length, 0, 'seulement ce qui est nouveau');
  assert.equal((await push.boite('AUTRE', 0)).length, 0, 'chacun les siennes');
});

