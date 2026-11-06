/* =========================================================================
   Sécurité commune aux trois applis
   - en-têtes envoyés avec chaque page : règle de contenu (scripts du site seulement, et les scripts
     écrits dans la page reconnus par leur empreinte), pas de devinette du type, intégration interdite
     ailleurs sauf pour les pages faites pour ça (écran TV, overlay, page de réservation)
   - nettoyage des textes reçus des appareils : rien de ce qu'un adhérent écrit ne peut devenir du code
     dans la page d'un autre (balise, gestionnaire d'événement, lien « javascript: »)
   ========================================================================= */
'use strict';
const crypto = require('crypto');

/* pages faites pour être intégrées dans un autre site (OBS, site du club, aperçu de l'éditeur) */
const INTEGRABLES = /(?:^|[\\/])(tv|overlay|reserver)\.html$/;
const cspCache = new Map();
function cspOf(file, html, extra = []) {
  const key = file + ':' + extra.length + ':' + html.length + ':' + crypto.createHash('md5').update(html).digest('base64');
  if (cspCache.has(key)) return cspCache.get(key);
  const hashes = extra.slice();   // scripts lancés par le fichier réuni (lib/bundle.js)
  for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    if (/\ssrc\s*=/i.test(m[1] || '')) continue;
    if (/type\s*=\s*["']?application\/(ld\+)?json/i.test(m[1] || '')) continue;
    // le navigateur lit les fins de ligne Windows (\r\n) comme \n : l'empreinte se calcule sur ce qu'il lit
    hashes.push(`'sha256-${crypto.createHash('sha256').update(m[2].replace(/\r\n?/g, '\n'), 'utf8').digest('base64')}'`);
  }
  // une page à l'ancienne avec des gestionnaires écrits dans le HTML (impression) : scripts écrits dans la page permis
  const handlers = /<[a-z][^>]*\son[a-z]+\s*=/i.test(html.replace(/<script[\s\S]*?<\/script>/gi, ''));
  const script = handlers ? "'self' 'unsafe-inline'" : ["'self'"].concat(hashes).join(' ');
  const csp = [
    "default-src 'self'",
    `script-src ${script}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    "connect-src 'self'",
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https:",
    `frame-ancestors ${INTEGRABLES.test(file) ? '*' : "'self'"}`
  ].join('; ');
  if (cspCache.size > 200) cspCache.clear();
  cspCache.set(key, csp);
  return csp;
}
/* en-têtes d'une page HTML */
function pageHeaders(file, data, extra) {
  const html = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
  const h = { 'Content-Security-Policy': cspOf(String(file), html, extra || []) };
  if (!INTEGRABLES.test(String(file))) h['X-Frame-Options'] = 'SAMEORIGIN';
  return h;
}
/* en-têtes de toutes les réponses */
const BASE = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(self)' };
function baseHeaders(res) { for (const [k, v] of Object.entries(BASE)) if (!res.getHeader(k)) res.setHeader(k, v); }

/* ---------------------------------------------------------------------
   Nettoyage d'un texte reçu d'un appareil. Le texte reste lisible (« <3 », « a > b », guillemets),
   seules les formes qui deviendraient du code sont désamorcées.
   --------------------------------------------------------------------- */
function cleanText(s) {
  if (typeof s !== 'string' || !/[<:=]/.test(s)) return s;
  return s
    // début de balise ou de commentaire HTML : « <script », « </div », « <!-- », « <svg/onload… »
    .replace(/<(?=[a-zA-Z/!?])/g, '&lt;')
    // gestionnaire d'événement glissé dans un attribut (« " onerror=… ») : le « = » est rendu inoffensif
    .replace(/(^|["'`\s/])(on[a-z]{3,})(\s*)=/gi, '$1$2$3&#61;')
    // liens qui exécutent du code
    .replace(/\b(javascript|vbscript)(\s*):/gi, '$1$2&#58;')
    .replace(/\bdata(\s*):(\s*)text\/html/gi, 'data$1&#58;$2text/html');
}
/* nettoie toutes les chaînes d'un contenu (objet, liste) ; les images en data:image restent intactes */
function cleanDeep(v, depth = 0) {
  if (typeof v === 'string') return /^data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=\s]*$/.test(v) ? v : cleanText(v);
  if (depth > 12 || !v || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(x => cleanDeep(x, depth + 1));
  const o = {};
  for (const [k, x] of Object.entries(v)) o[cleanText(k)] = cleanDeep(x, depth + 1);
  return o;
}

module.exports = { pageHeaders, baseHeaders, cleanText, cleanDeep, cspOf };
