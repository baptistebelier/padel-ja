/* =========================================================================
   /RAM — notifications sur le téléphone, appli fermée (Web Push), sans dépendance npm
   - Clés VAPID : variables VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY si elles existent ; sinon une paire
     est créée au premier démarrage et gardée côté serveur (jamais dans le code ni chez les appareils).
   - Chiffrement du message « aes128gcm » (RFC 8291) et signature VAPID ES256 (RFC 8292), avec crypto.
   - Un abonnement expiré (le navigateur répond 404 ou 410) est supprimé.
   - Heures calmes (22 h à 7 h par défaut, heure de Paris, réglables par chacun) : le téléphone ne sonne pas ;
     les messages attendent et partent au réveil, regroupés. Une urgence (msg.urgent) passe quand même.
     La cloche de l'appli reçoit tout, tout de suite.
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

/* ---------- heures calmes ---------- */
const CALME = { on: true, de: 22, a: 7 };
const heure = (v, d) => (v !== '' && v != null && Number.isInteger(+v) && +v >= 0 && +v <= 23 ? +v : d);
const calmeOf = c => ({ on: !(c && c.on === false), de: heure(c && c.de, CALME.de), a: heure(c && c.a, CALME.a) });
const minParis = t => { const [h, m] = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t)).split(':'); return (+h % 24) * 60 + +m; };
/* ce moment tombe-t-il dans les heures calmes de ce réglage ? (22 h → 7 h passe minuit) */
function enCalme(c, t = Date.now()) {
  c = calmeOf(c);
  if (!c.on || c.de === c.a) return false;
  const m = minParis(t), d = c.de * 60, a = c.a * 60;
  return d < a ? m >= d && m < a : m >= d || m < a;
}
/* le prochain réveil (fin des heures calmes, à Paris) après ce moment */
function reveilApres(c, t = Date.now()) {
  c = calmeOf(c);
  const delta = ((c.a * 60 - minParis(t)) + 1440) % 1440 || 1440;
  return t - (t % 60000) + delta * 60000;
}
const nomAppli = app => (app === 'coach' ? '/RAM Coach' : app === 'ja' ? '/RAM JA' : '/RAM Club');
const court = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
/* les messages retenus pendant les heures calmes → ce qui part au réveil :
   une discussion ne compte qu'une fois (« 5 nouveaux messages dans Équipe 1 ») ; plusieurs sujets : un seul résumé par appli */
function regrouper(list) {
  const parApp = new Map();
  list.forEach((x, i) => {
    const m = x.msg || x, app = m.app || '';
    if (!parApp.has(app)) parApp.set(app, new Map());
    const parTag = parApp.get(app), k = m.tag || '#' + i, prev = parTag.get(k);
    parTag.delete(k);   // le plus récent passe en dernier
    parTag.set(k, { msg: m, n: (prev ? prev.n : 0) + 1 });
  });
  const out = [];
  for (const [app, parTag] of parApp) {
    const l = [...parTag.values()].map(({ msg, n }) => (msg.fil && n > 1 ? Object.assign({}, msg, { body: `${n} nouveaux messages dans ${msg.fil}`, n }) : msg));
    if (l.length === 1) { out.push(l[0]); continue; }
    const titres = new Set(l.map(m => m.title)), clubs = new Set(l.map(m => (String(m.url || '').match(/[?&]club=([\w-]+)/) || [])[1]));
    const total = [...parTag.values()].reduce((s, x) => s + x.n, 0), cl = clubs.size === 1 ? [...clubs][0] : '';
    out.push(Object.assign({ title: titres.size === 1 ? [...titres][0] : nomAppli(app), body: court(`${total} notifications pendant les heures calmes : ` + l.map(m => m.body).join(' · '), 240),
      url: '#/notifs' + (cl ? '?club=' + cl : ''), tag: 'reveil' }, app ? { app } : {}));
  }
  return out;
}
const isCo = s => /^\[coach\]/.test(s.ua || ''), isJa = s => /^\[ja\]/.test(s.ua || '');

function createWebPush({ store, subject = 'mailto:contact@riseandmove.fr', log = () => {}, planifier = null }) {
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

  /* heures calmes de chaque compte : gardées 5 minutes en mémoire (un envoi à 300 adhérents ne relit pas 300 réglages) */
  const calmes = new Map(), cleCalme = u => 'calme-' + u;
  async function calme(u) {
    const c = calmes.get(u);
    if (c && c.t > Date.now() - 300e3) return c.v;
    const v = calmeOf(await store.getSetting(cleCalme(u)).catch(() => null));
    calmes.set(u, { v, t: Date.now() });
    return v;
  }
  /* messages retenus pendant les heures calmes : 200 au plus par compte, écritures d'un compte l'une après l'autre */
  const attentes = new Map(), cleAttente = u => 'attente-' + u;
  function tour(u, fn) {
    const p = (attentes.get(u) || Promise.resolve()).then(fn);
    attentes.set(u, p.catch(() => {}));
    return p;
  }
  const retenir = (u, msg) => tour(u, async () => {
    const l = (await store.getSetting(cleAttente(u)).catch(() => null)) || [];
    await store.saveSetting(cleAttente(u), l.concat({ at: Date.now(), msg }).slice(-200));
  });
  const reprendre = u => tour(u, async () => {
    const l = (await store.getSetting(cleAttente(u)).catch(() => null)) || [];
    if (l.length) await store.saveSetting(cleAttente(u), []);
    return l;
  });

  /* l'envoi lui-même, aux appareils de la bonne appli
     app « coach » (enseignement) : à l'appli /RAM Coach si le compte l'a, sinon à /RAM Club ; app « ja » : pareil avec /RAM JA ; sinon : à /RAM Club seulement */
  async function envoyer(userId, msg, known) {
    const all = known || await store.listPushSubs(userId).catch(() => []);
    const co = all.filter(isCo), ja = all.filter(isJa), cl = all.filter(s => !isCo(s) && !isJa(s));
    const subs = msg.app === 'coach' ? (co.length ? co : cl) : msg.app === 'ja' ? (ja.length ? ja : cl) : cl;
    if (!subs.length) return 0;
    const k = await load(), text = JSON.stringify(msg).slice(0, 3000);
    let n = 0;
    for (const s of subs) {
      try {
        const r = await fetch(s.endpoint, { method: 'POST', headers: { TTL: '86400', Urgency: msg.urgent ? 'high' : 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
          Authorization: vapidHeader(s.endpoint, k, subject) }, body: encrypt({ keys: { p256dh: s.p256dh, auth: s.auth } }, text) });
        if (r.status === 404 || r.status === 410) await store.deletePushSub(s.id);   // abonnement expiré
        else if (r.ok) n++;
        else log(`Notification refusée (${r.status}) pour ${new URL(s.endpoint).host}`);
      } catch (e) { log('Notification : ' + e.message); }
    }
    return n;
  }
  /* retirer du panneau les messages d'un sujet (tag) : une alerte devenue sans objet (agenda de nouveau lisible…) */
  function retire1(u, tag) {
    const p = (files.get(u) || Promise.resolve()).then(async () => {
      const l = (await store.getSetting(cleBoite(u)).catch(() => null)) || [], reste = l.filter(x => !x.msg || x.msg.tag !== tag);
      if (reste.length !== l.length) await store.saveSetting(cleBoite(u), reste);
    }).catch(e => log('Boîte de notifications : ' + e.message));
    files.set(u, p);
    return p;
  }

  const api = {
    retirer: (userId, tag) => retire1(userId, tag),
    async publicKey() { return (await load()).pub; },
    /* ce que ce compte a reçu depuis ce moment */
    async boite(userId, since) { return ((await store.getSetting(cleBoite(userId)).catch(() => null)) || []).filter(x => x.at > since); },
    // app : « coach » pour l'appli /RAM Coach (noté en tête de ua), sinon /RAM Club
    async subscribe(userId, sub, ua, app) {
      if (!sub || !sub.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) throw new Error('Abonnement invalide');
      await store.savePushSub({ id: subId(sub.endpoint), user_id: userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, ua: ((app === 'coach' ? '[coach] ' : app === 'ja' ? '[ja] ' : '') + String(ua || '')).slice(0, 160), created_at: Date.now(), last_ok: null });
    },
    async unsubscribe(endpoint) { await store.deletePushSub(subId(endpoint)); },
    /* envoyer aux appareils d'un compte ; message : { title, body, url, tag, app, urgent, fil }
       pendant ses heures calmes rien ne sonne : le message attend le réveil (sauf urgence) ; la cloche l'a déjà */
    async send(userId, msg, known) {
      if (!known) await garder([userId], msg);
      if (!msg.urgent) {
        const c = await calme(userId);
        if (enCalme(c)) {
          const all = known || await store.listPushSubs(userId).catch(() => []);
          if (!all.length) return 0;   // aucun appareil : rien à garder
          await retenir(userId, msg);
          if (planifier) await planifier(userId, reveilApres(c));
          return 0;
        }
      }
      return envoyer(userId, msg, known);
    },
    /* un message pour plusieurs comptes : leurs appareils lus en une seule requête ; un compte sans appareil ne coûte rien */
    async sendMany(userIds, msg) {
      await garder(userIds, msg);
      const subs = await store.listPushSubsOf(userIds), by = new Map();
      subs.forEach(s => { if (!by.has(s.user_id)) by.set(s.user_id, []); by.get(s.user_id).push(s); });
      let n = 0;
      for (const [uid, l] of by) n += await api.send(uid, msg, l);
      return n;
    },
    /* au réveil : ce qui a attendu part d'un coup, regroupé ; encore dans les heures calmes (réglage changé) : plus tard */
    async reveil(userId) {
      const c = await calme(userId);
      if (enCalme(c)) { if (planifier) await planifier(userId, reveilApres(c)); return 0; }
      const l = await reprendre(userId);
      let n = 0;
      for (const msg of regrouper(l)) n += await envoyer(userId, msg);
      return n;
    },
    /* les heures calmes d'un compte : lire, changer (hors des nouvelles heures calmes, ce qui attend part tout de suite) */
    calme,
    async setCalme(userId, c) {
      const v = calmeOf(Object.assign({}, await calme(userId), c));   // un réglage partiel garde le reste
      await store.saveSetting(cleCalme(userId), v);
      calmes.set(userId, { v, t: Date.now() });
      if (!enCalme(v)) await api.reveil(userId);
      return v;
    },
    async attente(userId) { return (await store.getSetting(cleAttente(userId)).catch(() => null)) || []; },
    /* notification d'essai : à cet appareil seulement (ou à tous ceux du compte), jamais retenue ni gardée dans la cloche */
    async essai(userId, endpoint, app) {
      const all = await store.listPushSubs(userId).catch(() => []), ici = endpoint ? all.filter(s => s.endpoint === endpoint) : all;
      if (!ici.length) return { n: 0, appareils: all.length };
      let n = 0;
      for (const s of ici) {
        const a = isCo(s) ? 'coach' : isJa(s) ? 'ja' : '';
        n += await envoyer(userId, Object.assign({ title: nomAppli(a), body: 'Notification d’essai : tout fonctionne, tu seras prévenu sur cet appareil.', url: '#/me', tag: 'essai', urgent: true }, a ? { app: a } : {}), [s]);
      }
      return { n, appareils: all.length };
    },
    /* parmi ces comptes, ceux qui ont au moins un appareil abonné à /RAM Club */
    async abonnes(userIds) {
      const ids = [...new Set(userIds)];
      const subs = ids.length ? await store.listPushSubsOf(ids).catch(() => []) : [];
      return new Set(subs.filter(s => !isCo(s) && !isJa(s)).map(s => s.user_id));
    }
  };

  return api;
}

/* le panneau de chaque appli : /RAM Coach, l'enseignement ; /RAM Club, tout sauf /RAM JA ; /RAM JA, le sien */
const pourAppli = (l, app) => l.filter(x => { const q = (x.msg || {}).app; return app === 'coach' ? q === 'coach' : app === 'ja' ? q === 'ja' : q !== 'ja'; }).map(x => ({ id: x.id, at: +x.at, title: x.msg.title, body: x.msg.body, url: x.msg.url }));

module.exports = { pourAppli, createWebPush, encrypt, newKeys, vapidHeader, enCalme, reveilApres, regrouper, calmeOf, CALME };
