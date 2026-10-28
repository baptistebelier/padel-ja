/* =========================================================================
   /RAM — compression des réponses (brotli ou gzip), avec zlib intégré à Node (aucune dépendance)
   - Fichiers de l'appli (JS, CSS, HTML) : compressés une fois au niveau maximal, gardés en mémoire
     tant que le fichier ne change pas.
   - Réponses de l'API (JSON) : compressées à la volée, sans bloquer le serveur.
   Les images (PNG, WebP, polices WOFF2) sont déjà compressées : envoyées telles quelles.
   ========================================================================= */
'use strict';
const zlib = require('zlib');

const MIN = 1024;   // en dessous, la compression coûte plus qu'elle ne rapporte
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|manifest\+json)|image\/svg\+xml)/;

/* meilleur encodage accepté par l'appareil : brotli, sinon gzip, sinon rien */
function pick(req) {
  const ae = String((req && req.headers && req.headers['accept-encoding']) || '');
  return /\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gzip' : null;
}
const BR = (q, size) => ({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: q, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: size } });
function compress(enc, buf, level) {
  return new Promise((ok, ko) => {
    const done = (e, out) => (e ? ko(e) : ok(out));
    if (enc === 'br') zlib.brotliCompress(buf, BR(level === 'max' ? 11 : 5, buf.length), done);
    else zlib.gzip(buf, { level: level === 'max' ? 9 : 6 }, done);
  });
}

/* fichiers : clé (chemin + version) → { br, gzip } ; au plus 400 entrées */
const cache = new Map();
async function cached(key, enc, buf) {
  let e = cache.get(key);
  if (!e) { e = {}; cache.set(key, e); if (cache.size > 400) cache.delete(cache.keys().next().value); }
  if (!e[enc]) e[enc] = compress(enc, buf, 'max').catch(err => { delete e[enc]; throw err; });
  return e[enc];
}

/* envoie un corps (texte ou octets), compressé si l'appareil l'accepte et que ça vaut la peine.
   key : pour un fichier, une clé stable (chemin + date de modification) → compression gardée en mémoire */
async function send(req, res, code, headers, body, key) {
  const type = String(headers['Content-Type'] || ''), buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body == null ? '' : body));
  const enc = buf.length >= MIN && COMPRESSIBLE.test(type) ? pick(req) : null;
  if (!enc) { res.writeHead(code, headers); return res.end(buf); }
  let out;
  try { out = key ? await cached(key, enc, buf) : await compress(enc, buf); }
  catch (e) { res.writeHead(code, headers); return res.end(buf); }
  res.writeHead(code, Object.assign({}, headers, { 'Content-Encoding': enc, Vary: 'Accept-Encoding' }));
  res.end(out);
}

module.exports = { send, pick };
