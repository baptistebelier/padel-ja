/* /RAM JA — écran d'accueil au logo, comme /RAM Club, mais seulement quand l'appli est ouverte
   depuis l'écran d'accueil du téléphone (appli installée) : une fois par lancement, court (0,6 s),
   puis fondu. Dans un navigateur ordinaire, rien ne s'affiche.
   Chargé dans le <head> de chaque page de l'appli, avant tout le reste, pour couvrir le premier affichage. */
(function () {
  var installed = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  if (!installed) return;
  try {
    if (sessionStorage.getItem('ja-splash')) return;   // déjà montré pendant ce lancement
    sessionStorage.setItem('ja-splash', '1');
  } catch (e) { return; }
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var css = document.createElement('style');
  css.textContent = '.ja-splash{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:#0B0B0B;transition:opacity .35s ease,visibility .35s}' +
    '.ja-splash img{width:min(62%,280px);height:auto;transform:rotate(-2deg)' + (calm ? '' : ';animation:ja-in .5s cubic-bezier(.2,.9,.3,1.2) both') + '}' +
    '.ja-splash.out{opacity:0;visibility:hidden}' +
    '@keyframes ja-in{from{opacity:0;transform:rotate(-6deg) scale(.86)}to{opacity:1;transform:rotate(-2deg) scale(1)}}';
  var d = document.createElement('div');
  d.className = 'ja-splash';
  d.setAttribute('aria-hidden', 'true');
  d.innerHTML = '<img src="/img/ja-ram-rouge-blanc.png" alt="">';
  document.documentElement.appendChild(css);
  document.documentElement.appendChild(d);
  var start = Date.now(), done = false;
  function hide() {
    if (done) return;
    done = true;
    setTimeout(function () {
      d.classList.add('out');
      setTimeout(function () { d.remove(); css.remove(); }, 400);
    }, Math.max(0, 600 - (Date.now() - start)));
  }
  if (document.readyState === 'complete') hide(); else window.addEventListener('load', hide);
  setTimeout(hide, 2500);   // jamais bloqué : la page reste utilisable même si un élément tarde à charger
})();
