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

  /* chaque message est gardé pour le panneau de notifications : un téléphone éteint ou sans autorisation ne perd rien.
     Les 100 derniers par compte, 30 jours au plus ; écritures d'un même compte l'une après l'autre */
  const files = new Map();
  const cleBoite = u => 'notifs-' + u;
  function garde1(u, row) {
    const p = (files.get(u) || Promise.resolve()).then(async () => {
      const l = (await store.getSetting(cleBoite(u)).catch(() => null)) || [], lim = row.at - 30 * 864e5;
      await store.saveSetting(cleBoite(u), [row].concat(l.filter(x => x.at >= lim)).slice(0, 100));
    }).catch(e => log('Boîte de notifications : ' + e.message));
    files.set(u, p);
    return p;
  }
  async function garder(userIds, msg) {
    const at = Date.now(), m = { title: msg.title, body: msg.body, url: msg.url, tag: msg.tag, app: msg.app }, ids = [...new Set(userIds)];
    for (let i = 0; i < ids.length; i += 8) await Promise.all(ids.slice(i, i + 8).map(u => garde1(u, { id: 'n' + crypto.randomBytes(9).toString('hex'), at, msg: m })));
  }

  const api = {
    async publicKey() { return (await load()).pub; },
    /* ce que ce compte a reçu depuis ce moment */
    async boite(userId, since) { return ((await store.getSetting(cleBoite(userId)).catch(() => null)) || []).filter(x => x.at > since); },
    // app : « coach » pour l'appli /RAM Coach (noté en tête de ua), sinon /RAM Club
    async subscribe(userId, sub, ua, app) {
      if (!sub || !sub.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) throw new Error('Abonnement invalide');
      await store.savePushSub({ id: subId(sub.endpoint), user_id: userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, ua: ((app === 'coach' ? '[coach] ' : app === 'ja' ? '[ja] ' : '') + String(ua || '')).slice(0, 160), created_at: Date.now(), last_ok: null });
    },
    async unsubscribe(endpoint) { await store.deletePushSub(subId(endpoint)); },
    /* envoyer aux appareils d'un compte ; message : { title, body, url, tag, app }
       app « coach » (enseignement) : à l'appli /RAM Coach si le compte l'a, sinon à /RAM Club ; app « ja » : pareil avec /RAM JA ; sinon : à /RAM Club seulement */
    async send(userId, msg, known) {
      if (!known) await garder([userId], msg);
      const all = known || await store.listPushSubs(userId).catch(() => []), isCo = s => /^\[coach\]/.test(s.ua || ''), isJa = s => /^\[ja\]/.test(s.ua || '');
      const co = all.filter(isCo), ja = all.filter(isJa), cl = all.filter(s => !isCo(s) && !isJa(s));
      const subs = msg.app === 'coach' ? (co.length ? co : cl) : msg.app === 'ja' ? (ja.length ? ja : cl) : cl;
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
    },
    /* un message pour plusieurs comptes : leurs appareils lus en une seule requête ; un compte sans appareil ne coûte rien */
    async sendMany(userIds, msg) {
      await garder(userIds, msg);
      const subs = await store.listPushSubsOf(userIds), by = new Map();
      subs.forEach(s => { if (!by.has(s.user_id)) by.set(s.user_id, []); by.get(s.user_id).push(s); });
      let n = 0;
      for (const [uid, l] of by) n += await api.send(uid, msg, l);
      return n;
    }
  };
  return api;
}

/* le panneau de chaque appli : /RAM Coach, l'enseignement ; /RAM Club, tout sauf /RAM JA ; /RAM JA, le sien */
const pourAppli = (l, app) => l.filter(x => { const q = (x.msg || {}).app; return app === 'coach' ? q === 'coach' : app === 'ja' ? q === 'ja' : q !== 'ja'; }).map(x => ({ id: x.id, at: +x.at, title: x.msg.title, body: x.msg.body, url: x.msg.url }));

module.exports = { pourAppli, createWebPush, encrypt, newKeys, vapidHeader };
