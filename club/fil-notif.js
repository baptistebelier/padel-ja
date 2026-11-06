/* ---------- Notifications d'une même discussion : une seule, qui se remplace ----------
   Le serveur marque chaque message d'une discussion par son tag (« club-chan-g1 ») et son nom (fil : « Équipe 1 »).
   Le service worker (sw.js) regarde la notification encore affichée avec ce tag et la remplace :
   « 5 nouveaux messages dans Équipe 1 », puis le dernier message. Des messages rapprochés (moins de 2 min)
   ne font pas sonner le téléphone à chaque fois. Chargé aussi par les tests du serveur (module.exports). */
(function (root, f) {
  if (typeof module === 'object' && module.exports) module.exports = f();
  else root.FIL_NOTIF = f();
})(typeof self !== 'undefined' ? self : this, function () {
  const RAPPROCHES = 120000;
  /* prev : données de la notification affichée avec le même tag ({ n, at }) ou rien ; d : le message reçu
     → { body, data, renotify } à passer à showNotification */
  function filNotif(prev, d, now) {
    now = now || Date.now();
    const body = d.body || '',
      url = d.url || '';
    if (!d.fil || !d.tag) return { body, data: { url }, renotify: !!d.tag };
    const deja = (prev && +prev.n) || 0,
      recu = Math.max(1, +d.n || 1),
      n = deja + recu,
      dernier = recu > 1 ? '' : body,
      proche = deja > 0 && prev && prev.at && now - prev.at < RAPPROCHES;
    return {
      body: n > 1 ? `${n} nouveaux messages dans ${d.fil}` + (dernier ? '\n' + dernier : '') : body,
      data: { url, n, at: now },
      renotify: !proche
    };
  }
  return { filNotif, RAPPROCHES };
});
