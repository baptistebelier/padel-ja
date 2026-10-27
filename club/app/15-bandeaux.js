/* /RAM Club — app/15-bandeaux.js : la frise des bandeaux partenaires.
   Les logos entrent par la droite, depuis l'extérieur du bandeau, et défilent vers la gauche sans trou :
   la suite de logos est répétée jusqu'à couvrir toute la largeur, puis doublée pour boucler.
   Chaque bandeau garde son horloge : un nouvel affichage de la page reprend la frise où elle en était. */

const AD_SPEED = 60; // pixels par seconde
const AD_T0 = {}; // bandeau → heure de sa première apparition

function adFit(sec) {
  const adw = sec.querySelector('.adw'),
    tr = sec.querySelector('.track');
  if (!adw || !tr || tr.dataset.fit) return;
  const W = adw.clientWidth;
  if (!W) return;
  // on attend les logos : leur largeur fixe celle de la suite
  const imgs = [...tr.querySelectorAll('img')];
  if (imgs.some(i => !i.complete)) {
    if (!tr.dataset.wait) {
      tr.dataset.wait = '1';
      Promise.all(imgs.map(i => (i.complete ? 0 : new Promise(r => (i.onload = i.onerror = r))))).then(() =>
        adFit(sec)
      );
    }
    return;
  }
  // les logos d'origine (la page les écrit deux fois, pour le cas où ce script ne tourne pas)
  const base = [...tr.children].slice(0, Math.max(1, tr.children.length / 2)).map(b => b.outerHTML);
  let n = 1,
    G = 0;
  // une suite assez longue pour couvrir la largeur du bandeau
  for (; n <= 30; n++) {
    const group = base.join('').repeat(n);
    tr.innerHTML = group + group;
    const kids = tr.children,
      half = kids.length / 2;
    G = kids[half].offsetLeft - kids[0].offsetLeft;
    if (G >= W) break;
  }
  // seule la première suite reste accessible au clavier
  [...tr.children].forEach((b, i) => {
    if (i >= base.length) {
      b.tabIndex = -1;
      b.setAttribute('aria-hidden', 'true');
    }
  });
  tr.dataset.fit = '1';
  tr.style.setProperty('--adw', W + 'px');
  tr.style.setProperty('--adg', G + 'px');
  const id = sec.dataset.ad || 'ad',
    now = performance.now();
  if (AD_T0[id] == null) AD_T0[id] = now;
  const t = (now - AD_T0[id]) / 1000,
    tIn = W / AD_SPEED,
    tLoop = G / AD_SPEED;
  // entrée depuis la droite, puis boucle sans fin ; on reprend au bon moment
  tr.style.animation =
    t < tIn
      ? `adin ${tIn}s linear ${-t}s, admarq ${tLoop}s linear ${tIn - t}s infinite`
      : `admarq ${tLoop}s linear ${-((t - tIn) % tLoop)}s infinite`;
}
const adFitAll = () => document.querySelectorAll('.adband').forEach(adFit);
new MutationObserver(() => requestAnimationFrame(adFitAll)).observe(document.body, { childList: true, subtree: true });
let adRz = 0;
addEventListener('resize', () => {
  clearTimeout(adRz);
  adRz = setTimeout(() => {
    document.querySelectorAll('.adband .track[data-fit]').forEach(tr => delete tr.dataset.fit);
    adFitAll();
  }, 200);
});
