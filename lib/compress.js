/* =========================================================================
   /RAM — compression des réponses (brotli ou gzip), avec zlib intégré à Node (aucune dépendance)
   - Fichiers de l'appli (JS, CSS, HTML) : la version définitive (brotli qualité 11, gzip 9) est préparée EN ARRIÈRE-PLAN,
     un fichier à la fois, et gardée en mémoire tant que le fichier ne change pas. Au démarrage, `preparer` met en file
     tous les fichiers connus. Un visiteur n'attend jamais cette préparation : tant qu'un fichier n'est pas prêt, il reçoit
     une compression rapide, calculée à part et jamais gardée dans le cache définitif.
   - Réponses de l'API (JSON) : compressées à la volée, sans bloquer le serveur.
   Les images (PNG, WebP, polices WOFF2) sont déjà compressées : envoyées telles quelles.
   ========================================================================= */
'use strict';
const zlib = require('zlib');

const MIN = 1024;   // en dessous, la compression coûte plus qu'elle ne rapporte
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|manifest\+json)|image\/svg\+xml)/;
const MAX_ENTREES = 1500;

/* meilleur encodage accepté par l'appareil : brotli, sinon gzip, sinon rien */
function pick(req) {
  const ae = String((req && req.headers && req.headers['accept-encoding']) || '');
  return /\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gzip' : null;
}
/* niveaux : « max » = version définitive (arrière-plan) ; « rapide » = ce que reçoit un visiteur qui n'attend pas ;
   « api » = réponses JSON, compressées à chaque fois */
const BR_Q = { max: 11, rapide: 4, api: 5 }, GZ_N = { max: 9, rapide: 1, api: 6 };
const BR = (q, size) => ({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: q, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: size } });
function compress(enc, buf, niveau) {
  return new Promise((ok, ko) => {
    const done = (e, out) => (e ? ko(e) : ok(out));
    if (enc === 'br') zlib.brotliCompress(buf, BR(BR_Q[niveau] || 5, buf.length), done);
    else zlib.gzip(buf, { level: GZ_N[niveau] || 6 }, done);
  });
}

/* versions définitives : clé (chemin + empreinte) → { br, gzip } */
const final = new Map();
/* file de préparation : un seul travail à la fois ; { id, key, enc, buf } */
const file = [];
const dansFile = new Set();
let enCours = false;
let attentes = [];
const id = (key, enc) => enc + '|' + key;

function finir() { if (!enCours && !file.length) { const a = attentes; attentes = []; a.forEach(f => f()); } }
async function boucle() {
  if (enCours) return;
  enCours = true;
  try {
    while (file.length) {
      const j = file.shift();
      try {
        const out = await compress(j.enc, j.buf, 'max');
        let e = final.get(j.key);
        if (!e) { e = {}; final.set(j.key, e); if (final.size > MAX_ENTREES) final.delete(final.keys().next().value); }
        e[j.enc] = out;
      } catch (err) { /* ce fichier restera servi en compression rapide */ }
      dansFile.delete(id(j.key, j.enc));
      await new Promise(ok => setImmediate(ok));   // le serveur reprend la main entre deux fichiers
    }
  } finally { enCours = false; finir(); }
}
/* met un fichier en file (ou le passe devant s'il est demandé par un visiteur) */
function planifier(key, enc, buf, devant) {
  const k = id(key, enc);
  if (final.has(key) && final.get(key)[enc]) return;
  if (dansFile.has(k)) {
    if (devant) { const i = file.findIndex(j => j.key === key && j.enc === enc); if (i > 0) file.unshift(file.splice(i, 1)[0]); }
    return;
  }
  dansFile.add(k);
  const j = { key, enc, buf };
  if (devant) file.unshift(j); else file.push(j);
  boucle();
}

/* à appeler au démarrage pour chaque fichier connu : préparé en arrière-plan, un à la fois (brotli ; gzip si demandé plus tard) */
function preparer(key, body, type, encodages) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body == null ? '' : body));
  if (buf.length < MIN || !COMPRESSIBLE.test(String(type || ''))) return false;
  (encodages || ['br']).forEach(enc => planifier(key, enc, buf, false));
  return true;
}
/* résolue quand plus aucune préparation n'est en cours (tests, mesures) */
const reposee = () => new Promise(ok => { if (!enCours && !file.length) ok(); else attentes.push(ok); });

/* envoie un corps (texte ou octets), compressé si l'appareil l'accepte et que ça vaut la peine.
   key : pour un fichier, une clé stable (chemin + empreinte) → version définitive gardée en mémoire */
async function send(req, res, code, headers, body, key) {
  const type = String(headers['Content-Type'] || ''), buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body == null ? '' : body));
  const enc = buf.length >= MIN && COMPRESSIBLE.test(type) ? pick(req) : null;
  if (!enc) { res.writeHead(code, headers); return res.end(buf); }
  let out;
  try {
    if (key) {
      const e = final.get(key);
      if (e && e[enc]) out = e[enc];
      else { out = await compress(enc, buf, 'rapide'); planifier(key, enc, buf, true); }   // rapide pour ce visiteur, définitive en arrière-plan
    } else out = await compress(enc, buf, 'api');
  } catch (e) { res.writeHead(code, headers); return res.end(buf); }
  res.writeHead(code, Object.assign({}, headers, { 'Content-Encoding': enc, Vary: 'Accept-Encoding' }));
  res.end(out);
}

module.exports = { send, pick, preparer, reposee, _final: final };
