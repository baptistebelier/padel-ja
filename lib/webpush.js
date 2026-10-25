/* =========================================================================
   /RAM — notifications sur le téléphone, appli fermée (Web Push), sans dépendance npm
   - Clés VAPID : variables VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY si elles existent ; sinon une paire
     est créée au premier démarrage et gardée côté serveur (jamais dans le code ni chez les appareils).
   - Chiffrement du message « aes128gcm » (RFC 8291) et signature VAPID ES256 (RFC 8292), avec crypto.
   - Un abonnement expiré (le navigateur répond 404 ou 410) est supprimé.
   ========================================================================= */
'use strict';
const crypto = require('crypto');

const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/* paire de clés P-256 : publique « brute » (65 octets, base64url), privée en JWK */
function newKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([4]), unb64u(jwk.x), unb64u(jwk.y)]);
  return { pub: b64u(pub), priv: jwk.d, x: jwk.x, y: jwk.y };
}
function privateKeyOf(k) {
  return crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: k.priv, x: k.x, y: k.y }, format: 'jwk' });
}

/* signature VAPID : jeton JWT ES256 pour l'origine du service de notifications */
function vapidHeader(endpoint, k, subject) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key: privateKeyOf(k), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${k.pub}`;
}

/* chiffrement du message pour un abonnement (RFC 8291, un seul bloc) */
function encrypt(sub, text) {
  const uaPub = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const asPub = ecdh.getPublicKey(), shared = ecdh.computeSecret(uaPub);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32));
  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(text), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, ct]);
}

function createWebPush({ store, subject = 'mailto:contact@riseandmove.fr', log = () => {} }) {
  let keys = null, loading = null;
  // une seule paire de clés, même si plusieurs envois démarrent en même temps
  const load = () => keys ? Promise.resolve(keys) : (loading = loading || loadKeys().finally(() => { loading = null; }));
  async function loadKeys() {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      const pub = unb64u(process.env.VAPID_PUBLIC_KEY);
      keys = { pub: process.env.VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) };
      return keys;
    }
    // clés créées et gardées par le serveur (jamais envoyées aux appareils)
    const saved = await store.getSetting('vapid').catch(() => null);
    if (saved && saved.pub && saved.priv) return (keys = saved);
    keys = newKeys();
    await store.saveSetting('vapid', keys);
    return keys;
  }
  const subId = endpoint => 'ps' + crypto.createHash('sha1').update(endpoint).digest('hex').slice(0, 20);

  const api = {
    async publicKey() { return (await load()).pub; },
    async subscribe(userId, sub, ua) {
      if (!sub || !sub.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) throw new Error('Abonnement invalide');
      await store.savePushSub({ id: subId(sub.endpoint), user_id: userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, ua: String(ua || '').slice(0, 160), created_at: Date.now(), last_ok: null });
    },
    async unsubscribe(endpoint) { await store.deletePushSub(subId(endpoint)); },
    /* envoyer à tous les appareils d'un compte ; message : { title, body, url, tag } */
    async send(userId, msg) {
      const subs = await store.listPushSubs(userId).catch(() => []);
      if (!subs.length) return 0;
      const k = await load(), text = JSON.stringify(msg).slice(0, 3000);
      let n = 0;
      for (const s of subs) {
        try {
          const r = await fetch(s.endpoint, { method: 'POST', headers: { TTL: '86400', Urgency: 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
            Authorization: vapidHeader(s.endpoint, k, subject) }, body: encrypt({ keys: { p256dh: s.p256dh, auth: s.auth } }, text) });
          if (r.status === 404 || r.status === 410) await store.deletePushSub(s.id);   // abonnement expiré
          else if (r.ok) n++;
          else log(`Notification refusée (${r.status}) pour ${new URL(s.endpoint).host}`);
        } catch (e) { log('Notification : ' + e.message); }
      }
      return n;
    }
  };
  return api;
}

module.exports = { createWebPush, encrypt, newKeys, vapidHeader };
