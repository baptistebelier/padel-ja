/* /RAM — empilement.js : la règle des boîtes empilées, commune aux applis (règle de Baptiste, 25/11/2026).
   - Seule la boîte de premier niveau garde son ombre portée (elle se détache du fond de l'appli).
   - Une boîte posée dans une boîte perd son ombre, garde un trait noir et prend l'autre valeur de la même teinte.
   - Rien n'est jamais posé sur un fond identique ou trop proche du sien : bouton, étiquette, champ, vignette,
     en-tête… prend alors l'autre valeur.
   - Dans une boîte, les pastilles (étiquettes, avatars, vignettes) n'ont plus d'ombre ; les boutons gardent la leur.
   Plutôt qu'une liste de classes (il y en a des dizaines), le moteur lit les couleurs réellement affichées, de haut en bas,
   et pose des attributs data-niv* que la feuille de style ci-dessous traduit. Il repasse à chaque changement de l'écran.
   Les deux valeurs : A = fond de carte, B = fond de carte mélangé à 16 % avec la couleur du texte (plus clair la nuit,
   plus foncé le jour). Réglages par appli : window.RamEmpilement = { racines, ignore } avant le chargement. */
(function () {
  'use strict';
  if (window.__ramEmpilement) return;
  window.__ramEmpilement = true;
  const cfg = Object.assign(
    { racines: '#main, .sheet', ignore: '#tabs, #subnav, .seg.haut, .rl, .tabs, .rbot' },
    window.RamEmpilement || {}
  );

  const css = document.createElement('style');
  css.textContent =
    ':root{--niv-a:var(--c-surface);--niv-b:color-mix(in srgb,var(--c-surface) 84%,var(--c-text));--c-surface-sub:var(--niv-b)}' +
    '[data-niv="a"]{background-color:var(--niv-a)!important}' +
    '[data-niv="b"]{background-color:var(--niv-b)!important}' +
    '[data-niv="t"]{background-color:transparent!important}' +
    '[data-niv-boite]{box-shadow:none!important;border:var(--bw,2px) solid var(--c-ink)!important}' +
    '[data-niv-plat]{box-shadow:none!important}' +
    // pas de fondu quand le moteur change un fond ou retire une ombre : le changement ne doit pas se voir
    '[data-niv],[data-niv-boite],[data-niv-plat]{transition:none!important}';
  document.head.appendChild(css);

  const INTER = 'button, a, input, select, textarea, label, summary, [role="button"], [role="tab"], .btn';
  const orig = new WeakMap(); // fond et ombre d'origine, avant nos attributs

  /* couleurs : « rgb(…) », « rgba(…) » ou « color(srgb …) » ramenés à [r, g, b, alpha] */
  function rgb(s) {
    if (!s || s === 'transparent') return null;
    let m = s.match(/^rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
      return p[3] === 0 ? null : [p[0], p[1], p[2]];
    }
    m = s.match(/^color\(srgb ([^)]+)\)/);
    if (m) {
      const p = m[1]
        .split(/[\s/]+/)
        .filter(Boolean)
        .map(Number);
      return p[3] === 0 ? null : [p[0] * 255, p[1] * 255, p[2] * 255];
    }
    return null;
  }
  const proche = (a, b) =>
    !!a && !!b && Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) < 20;

  let A = null,
    B = null;
  function tons() {
    const p = document.createElement('div');
    p.__ramSonde = true;
    p.style.cssText = 'position:absolute;width:1px;height:1px;left:-9px;top:-9px;background:var(--niv-a)';
    document.body.appendChild(p);
    A = rgb(getComputedStyle(p).backgroundColor);
    p.style.background = 'var(--niv-b)';
    B = rgb(getComputedStyle(p).backgroundColor);
    p.remove();
  }
  const ton = c => (proche(c, A) ? 'a' : proche(c, B) ? 'b' : null);
  const autre = t => (t === 'a' ? 'b' : 'a');
  const couleur = t => (t === 'a' ? A : B);

  function marque(el, nom, v) {
    if (v == null) {
      if (el.hasAttribute(nom)) el.removeAttribute(nom);
    } else if (el.getAttribute(nom) !== v) el.setAttribute(nom, v);
  }

  /* parcours de haut en bas : « dessous » = couleur sur laquelle l'élément est posé, « prof » = nombre de boîtes au-dessus */
  function visite(el, dessous, prof, parentR) {
    for (const x of el.children) {
      if (x.matches(cfg.ignore)) continue;
      if (!x.getClientRects().length) continue; // caché
      let o = orig.get(x);
      const cs = getComputedStyle(x);
      if (
        !o ||
        (!x.hasAttribute('data-niv') && !x.hasAttribute('data-niv-boite') && !x.hasAttribute('data-niv-plat'))
      ) {
        o = { fond: cs.backgroundColor, ombre: cs.boxShadow };
        orig.set(x, o);
      }
      const fond = rgb(o.fond),
        ombre = o.ombre && o.ombre !== 'none';
      const inter = x.matches(INTER);
      const r = x.getBoundingClientRect();
      const grand = r.width >= 120 && r.height >= 40;
      const trait = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0;
      // un élément cliquable de la taille d'une carte (ligne de séance, carte d'élève…) est une boîte ; un vrai bouton, non
      const carte = inter && r.height >= 52 && r.width >= 200;
      const boite = (!inter || carte) && grand && (ombre || (fond && trait));

      let niv = null,
        sous = dessous;
      if (fond) {
        if (prof === 0 && boite) {
          // boîte de premier niveau : on n'y touche pas
        } else if (
          !boite &&
          prof > 0 &&
          parentR &&
          r.width >= parentR.width - 6 &&
          Math.abs(r.top - parentR.top) <= 4 &&
          ton(fond) &&
          !proche(fond, dessous)
        ) {
          // bandeau collé en haut d'une sous-boîte, sur toute sa largeur (en-tête, cliquable ou non) : il en fait partie, il prend son fond
          niv = 't';
        } else if (proche(fond, dessous)) {
          const t = ton(dessous);
          niv = t ? autre(t) : 'b';
        } else if (prof > 0 && boite && ton(fond) && ton(fond) === ton(dessous)) {
          niv = autre(ton(dessous));
        }
        sous = niv === 't' ? dessous : niv ? couleur(niv) : fond;
      }
      marque(x, 'data-niv', niv);
      marque(x, 'data-niv-boite', boite && prof > 0 ? '' : null);
      marque(x, 'data-niv-plat', !boite && !inter && ombre && prof > 0 ? '' : null);
      visite(x, sous, prof + (boite ? 1 : 0), r);
    }
  }

  let prevu = 0;
  function passe() {
    prevu = 0;
    if (!A) tons();
    document.querySelectorAll(cfg.racines).forEach(rac => {
      if (!rac.getClientRects().length) return;
      const cs = getComputedStyle(rac);
      let d = rgb(cs.backgroundColor);
      for (let p = rac.parentElement; !d && p; p = p.parentElement) d = rgb(getComputedStyle(p).backgroundColor);
      visite(rac, d || [255, 255, 255], 0, rac.getBoundingClientRect());
    });
  }
  const plus_tard = () => {
    if (!prevu) prevu = requestAnimationFrame(passe);
  };
  const retons = () => {
    A = B = null;
    plus_tard();
  };

  /* l'écran vient d'être redessiné : on passe tout de suite, avant que le navigateur ne l'affiche (sinon il montre une
     image sans la règle puis une avec : clignotement), et une seconde fois à l'image suivante, une fois la mise en page posée */
  let encours = false;
  const tout_de_suite = recs => {
    if (
      encours ||
      recs.every(r => r.target === document.body && [...r.addedNodes, ...r.removedNodes].every(n => n.__ramSonde))
    )
      return;
    encours = true;
    try {
      passe();
    } finally {
      encours = false;
    }
    plus_tard();
  };

  function demarre() {
    new MutationObserver(tout_de_suite).observe(document.body, { childList: true, subtree: true, characterData: true });
    // jour / nuit : nouvelles couleurs
    new MutationObserver(retons).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class', 'data-theme', 'data-style']
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retons);
    addEventListener('resize', plus_tard);
    plus_tard();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarre);
  else demarre();
  window.RamEmpilementPasse = passe;
})();
