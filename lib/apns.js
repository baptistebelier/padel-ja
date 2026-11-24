'use strict';
/* Notifications natives d'Apple (APNs) pour l'appli /Buvette de l'App Store.
   Sans dépendance : HTTP/2 et signature ES256 de Node. Réglages (variables Render) :
   APNS_KEY (contenu du fichier .p8), APNS_KEY_ID, APNS_TEAM_ID, APNS_TOPIC (fr.riseandmove.buvette par défaut),
   APNS_SANDBOX=1 pour les essais compilés en développement (TestFlight et App Store utilisent la production). */
const http2 = require('node:http2');
const crypto = require('node:crypto');

const b64u = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const estJeton = e => /^apns:[0-9a-f]{32,200}$/i.test(String(e || ''));

function reglages(env = process.env) {
  const key = String(env.APNS_KEY || '').replace(/\\n/g, '\n').trim();
  if (!key || !env.APNS_KEY_ID || !env.APNS_TEAM_ID) return null;
  return { key, kid: env.APNS_KEY_ID, team: env.APNS_TEAM_ID, topic: env.APNS_TOPIC || 'fr.riseandmove.buvette', host: env.APNS_SANDBOX === '1' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com' };
}

/* jeton d'accès signé, valable une heure chez Apple : refait toutes les 50 minutes */
function jwt(r, now = Date.now()) {
  const h = b64u(JSON.stringify({ alg: 'ES256', kid: r.kid })), p = b64u(JSON.stringify({ iss: r.team, iat: Math.floor(now / 1000) }));
  const sig = crypto.sign('sha256', Buffer.from(h + '.' + p), { key: r.key, dsaEncoding: 'ieee-p1363' });
  return h + '.' + p + '.' + b64u(sig);
}

/* ce qu'Apple affiche : titre, texte, son ; l'adresse à ouvrir voyage dans data.url */
function charge(msg) {
  return JSON.stringify({ aps: { alert: { title: String(msg.title || '').slice(0, 120), body: String(msg.body || '').slice(0, 600) }, sound: 'default', 'thread-id': msg.tag ? String(msg.tag).slice(0, 64) : undefined }, data: { url: msg.url || '' } });
}

function createApns({ env = process.env, log = () => {} } = {}) {
  let session = null, jeton = null, jetonAt = 0;
  const conn = r => {
    if (session && !session.closed && !session.destroyed) return session;
    session = http2.connect(r.host);
    session.on('error', e => { log('APNs : ' + e.message); session = null; });
    session.on('goaway', () => { session = null; });
    session.unref();
    return session;
  };
  /* renvoie { ok, gone } : gone = jeton à oublier (appli supprimée, jeton invalide) */
  async function envoyer(endpoint, msg) {
    const r = reglages(env);
    if (!r) return { ok: false, gone: false, off: true };
    if (!jeton || Date.now() - jetonAt > 50 * 60e3) { jeton = jwt(r); jetonAt = Date.now(); }
    const device = String(endpoint).slice(5);
    return new Promise(resolve => {
      let req;
      try {
        req = conn(r).request({ ':method': 'POST', ':path': '/3/device/' + device, authorization: 'bearer ' + jeton, 'apns-topic': r.topic, 'apns-push-type': 'alert', 'apns-priority': msg.urgent ? '10' : '5', 'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400), 'content-type': 'application/json' });
      } catch (e) { log('APNs : ' + e.message); session = null; return resolve({ ok: false, gone: false }); }
      let status = 0, body = '';
      req.setTimeout(10e3, () => req.close(http2.constants.NGHTTP2_CANCEL));
      req.on('response', h => { status = h[':status']; });
      req.on('data', d => { body += d; });
      req.on('end', () => {
        const raison = (() => { try { return JSON.parse(body).reason || ''; } catch { return ''; } })();
        if (status !== 200 && status) log(`APNs refusé (${status} ${raison})`);
        resolve({ ok: status === 200, gone: status === 410 || raison === 'BadDeviceToken' || raison === 'Unregistered' });
      });
      req.on('error', e => { log('APNs : ' + e.message); resolve({ ok: false, gone: false }); });
      req.end(charge(msg));
    });
  }
  return { envoyer, actif: () => !!reglages(env) };
}

module.exports = { createApns, estJeton, charge, jwt, reglages };
