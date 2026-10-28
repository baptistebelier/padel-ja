/* ---------- Service worker de l'appli du club : hors connexion + notifications push ----------
   Changer VERSION à chaque mise en ligne : l'ancien cache est supprimé à l'activation. */
const VERSION = '2026-10-28-mur1';
/* /RAM Coach (coach.html) enregistre ce même fichier avec « ?app=coach » : sa page et ses fichiers à lui */
const APP = new URL(location.href).searchParams.get('app') === 'coach' ? 'coach' : 'club';
const SHELL = APP === 'coach' ? 'coach.html' : 'index.html';
const CACHE = 'appli-' + APP + '-' + VERSION;
/* Fichiers de l'appli mis en cache dès l'installation */
const CORE = [
  'index.html',
  'app.css',
  'ram.css',
  'ram-sync.js',
  'img/ram-club-blanc.png',
  'img/ram-club-noir.png',
  'img/favicon.png',
  'icon-192.png',
  'logo.js',
  'regles.js',
  'data.js',
  'ui/1-briques.js',
  'ui/2-publications.js',
  'ui/3-rencontres.js',
  'ui/4-agenda.js',
  'ui/5-club.js',
  'ui/6-profil.js',
  'ui/7-ecole.js',
  'ui/8-ecrans.js',
  'ui/9-bar.js',
  'ui/10-niveaux.js',
  'ui/11-tournois.js',
  'ui/12-aide.js',
  'ui/13-suivi.js',
  'sons.js',
  'trophees.js',
  'app/1-affichage.js',
  'app/2-couleurs.js',
  'app/3-direct.js',
  'app/4-formulaires.js',
  'app/5-actions.js',
  'app/6-gestes.js',
  'app/7-enregistrement.js',
  'app/8-demarrage.js',
  'app/9-bar.js',
  'app/10-niveaux.js',
  'app/11-tournois.js',
  'app/12-finitions.js',
  'app/13-favoris.js',
  'app/14-discussions.js',
  'app/15-bandeaux.js',
  'app/16-suivi.js',
  'manifest.webmanifest',
  'icon-180.png',
  'icon-512.png'
];
if (APP === 'coach')
  CORE.splice(
    0,
    CORE.length,
    ...CORE.map(f =>
      f === 'index.html'
        ? 'coach.html'
        : f === 'manifest.webmanifest'
          ? 'coach.webmanifest'
          : /^icon-/.test(f)
            ? 'coach-v2-' + f
            : f.replace('ram-club-', 'coach-v2-logo-')
    ),
    'coach/coach.css',
    'coach/1-donnees.js',
    'coach/2-ecrans.js',
    'coach/3-actions.js',
    'coach/4-finitions.js',
    'coach/5-formules.js',
    'coach/6-groupes.js',
    'img/coach-v2-favicon.png'
  );

self.addEventListener('install', e => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then(c => c.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.filter(k => k.startsWith('appli-' + APP + '-') && k !== CACHE).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

/* index.html (et toute navigation) : réseau d'abord, cache en secours.
   css, js, icônes, polices : cache d'abord, réseau sinon (et on garde la réponse pour la prochaine fois). */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  /* données du club (API du serveur) : jamais en cache, toujours fraîches */
  if (new URL(req.url).pathname.includes('/api/')) return;
  /* images des clubs (/medias/…) : gardées un an par le navigateur lui-même, pas dans le cache de l'appli
     (vidé à chaque mise à jour) */
  if (new URL(req.url).pathname.startsWith('/medias/')) return;
  const url = new URL(req.url),
    page = req.mode === 'navigate' || url.pathname.endsWith('/' + SHELL) || url.pathname.endsWith('/');
  if (page) {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok && res.headers.get('X-Club-Page') === 'appli') {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(SHELL, copy));
          }
          return res;
        })
        .catch(() => caches.match(SHELL, { ignoreSearch: true }))
    );
    return;
  }
  const asset = url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!asset) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: url.origin === location.origin }).then(
      hit =>
        hit ||
        fetch(req).then(res => {
          if (res.ok || res.type === 'opaque') {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
    )
  );
});

/* ---------- Notifications push ----------
   Le serveur envoie un JSON : {"title":"…","body":"…","url":"#/rec/r1","tag":"direct-r1"}
   url = écran à ouvrir dans l'appli (voir openFromUrl dans app/8-demarrage.js). */
self.addEventListener('push', e => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch (_) {
    d = { body: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    self.registration.showNotification(d.title || (APP === 'coach' ? '/RAM Coach' : '/RAM Club'), {
      body: d.body || '',
      icon: APP === 'coach' ? 'coach-v2-icon-180.png' : 'icon-180.png',
      badge: APP === 'coach' ? 'coach-v2-icon-180.png' : 'icon-180.png',
      tag: d.tag,
      data: { url: d.url || '' },
      renotify: !!d.tag
    })
  );
});

/* Toucher la notification : on remet l'appli au premier plan (ou on l'ouvre) sur le bon écran */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const win = list.find(c => c.url.startsWith(self.registration.scope));
      if (win) {
        win.postMessage({ type: 'open', url: target });
        return win.focus();
      }
      return self.clients.openWindow(
        new URL(SHELL + (target.startsWith('#') ? target : ''), self.registration.scope).href
      );
    })
  );
});
