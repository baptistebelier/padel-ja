/* =========================================================================
   /RAM — mesures du serveur : pour chaque route, nombre d'appels, temps moyen et maximal,
   octets envoyés et erreurs. Lues par l'administrateur (/api/admin/mesures) ; une requête
   lente (plus d'une seconde) est notée dans le journal de Render.
   Rien de personnel : l'adresse est réduite à sa forme (« /api/ram/c/:id/sync »).
   ========================================================================= */
'use strict';

const START = Date.now();
let routes = new Map(), since = Date.now();

/* « /api/ram/c/soBOFb2NEd/sync » → « /api/ram/c/:id/sync » : un identifiant contient un chiffre ou fait plus de 16 caractères */
const shape = p => String(p).split('/').map(s => (s && (/\d/.test(s) || s.length > 16) && !/^v\d+$/.test(s) ? ':id' : s)).join('/');

function track(req, res, log) {
  const t0 = process.hrtime.bigint(), url = String(req.url || '').split('?')[0];
  // connexions en direct (SSE) : elles durent des heures, comptées à part
  if (/\/events$/.test(url)) { live++; res.on('close', () => { live--; }); return; }
  let bytes = 0;
  const end = res.end;
  res.end = function (chunk, ...rest) { if (chunk && typeof chunk !== 'function') bytes += Buffer.byteLength(chunk); return end.call(this, chunk, ...rest); };
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6, key = req.method + ' ' + (url.startsWith('/api/') || url === '/mcp' ? shape(url) : url.startsWith('/club/') || url.startsWith('/coach/') ? 'fichiers appli' : 'pages et fichiers');
    let r = routes.get(key);
    if (!r) { r = { n: 0, ms: 0, max: 0, bytes: 0, err: 0 }; routes.set(key, r); }
    r.n++; r.ms += ms; r.bytes += bytes; if (ms > r.max) r.max = ms; if (res.statusCode >= 500) r.err++;
    if (ms > 1000 && log) log(`lent : ${key} ${Math.round(ms)} ms (${res.statusCode})`);
  });
}
let live = 0;

/* résumé : routes triées par temps total passé, mémoire du serveur et connexions en direct */
function report(extra) {
  const list = [...routes.entries()].map(([route, r]) => ({ route, appels: r.n, moyenne_ms: Math.round(r.ms / r.n), max_ms: Math.round(r.max), ko_moyen: Math.round(r.bytes / r.n / 102.4) / 10, erreurs: r.err, total_s: Math.round(r.ms / 100) / 10 }))
    .sort((a, b) => b.total_s - a.total_s);
  const m = process.memoryUsage();
  return Object.assign({ depuis: new Date(since).toISOString(), serveur_lance: new Date(START).toISOString(), memoire_mo: Math.round(m.rss / 1048576), tas_mo: Math.round(m.heapUsed / 1048576), connexions_direct: live, routes: list }, extra || {});
}
function reset() { routes = new Map(); since = Date.now(); }

module.exports = { track, report, reset, shape };
