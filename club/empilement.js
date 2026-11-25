/* /RAM — empilement.js : la règle des boîtes empilées, commune aux applis (règle de Baptiste, 25/11/2026).
   - Seule la boîte de premier niveau garde son ombre portée (elle se détache du fond de l'appli).
   - Une boîte posée dans une boîte perd son ombre, garde un trait noir et prend l'autre valeur de la même teinte.
   - Rien n'est jamais posé sur un fond identique ou trop proche du sien : bouton, étiquette, champ, vignette,
     en-tête… prend alors l'autre valeur.
   - Ombres : seules les boîtes principales (posées sur le fond de l'appli) et les boutons en ont une ; rien d'autre.
   Plutôt qu'une liste de classes (il y en a des dizaines), le moteur lit les couleurs réellement affichées, de haut en bas,
   et pose des attributs data-niv* que la feuille de style ci-dessous traduit. Chaque élément est décidé une fois, avant affichage.
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
    // éléments de données (jauges, barres, cases) : toujours un contour noir
    '[data-niv-donnee]{border:var(--bw,2px) solid var(--c-ink)!important;box-sizing:border-box}' +
    // pas de fondu quand le moteur change un fond ou retire une ombre : le changement ne doit pas se voir
    '[data-niv],[data-niv-boite],[data-niv-plat],[data-niv-donnee]{transition:none!important}';
  document.head.appendChild(css);

  const INTER = 'button, a, input, select, textarea, label, summary, [role="button"], [role="tab"], .btn';

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

  /* Chaque élément est décidé UNE SEULE FOIS, à son apparition, avant d'être affiché, puis ne bouge plus : ni le défilement,
     ni la barre de Safari qui se replie, ni un redimensionnement ne relancent le calcul (aucun clignotement possible).
     Seul le passage jour / nuit (une action de l'utilisateur) refait tout. */
  let gen = 1;
  const fait = new WeakMap(); // élément -> { gen, sous, boite }

  /* parcours de haut en bas : « dessous » = couleur sur laquelle l'élément est posé, « prof » = nombre de boîtes au-dessus */
  function visite(el, dessous, prof, parentR) {
    for (const x of el.children) {
      if (x.matches(cfg.ignore)) continue;
      const deja = fait.get(x);
      if (deja && deja.gen === gen) {
        visite(x, deja.sous, prof + (deja.boite ? 1 : 0), deja.r);
        continue;
      }
      if (!x.getClientRects().length) continue; // caché : décidé quand il apparaîtra
      const cs = getComputedStyle(x);
      if (x.hasAttribute('data-niv')) x.removeAttribute('data-niv'); // nouvelle décision (jour / nuit) : on relit le fond d'origine
      const o = { fond: x.hasAttribute('data-niv') ? null : getComputedStyle(x).backgroundColor, ombre: cs.boxShadow };
      if (x.hasAttribute('data-niv-boite') || x.hasAttribute('data-niv-plat') || x.hasAttribute('data-niv-donnee')) {
        x.removeAttribute('data-niv-boite');
        x.removeAttribute('data-niv-plat');
        x.removeAttribute('data-niv-donnee');
        o.ombre = getComputedStyle(x).boxShadow;
      }
      const fond = rgb(o.fond),
        ombre = o.ombre && o.ombre !== 'none';
      const inter = x.matches(INTER);
      const r = x.getBoundingClientRect();
      // tailles de mise en page (offsetWidth/Height) : elles ignorent les animations (échelle, glissement), contrairement au rectangle affiché
      const L = x.offsetWidth || r.width,
        H = x.offsetHeight || r.height;
      const grand = L >= 120 && H >= 40;
      const trait = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0;
      const neutre = !!fond && (!!ton(fond) || proche(fond, dessous));
      const etat = x.matches('[aria-current]:not([aria-current="false"]), [aria-selected="true"]'); // navigation choisie : pas une boîte
      // bandeau collé en haut d'une sous-boîte, sur toute sa largeur (en-tête) : il en fait partie
      const bandeau =
        prof > 0 &&
        !!parentR &&
        neutre &&
        L >= parentR.width - 6 &&
        Math.abs(r.top - parentR.top) <= 4 &&
        !proche(fond, dessous);
      // un élément cliquable de la taille d'une carte (ligne de séance, tuile, carte d'élève…) est une boîte ; un vrai bouton, non
      const carte = inter && H >= 52 && L >= 200;
      const boite =
        (!inter || carte) && grand && !etat && !bandeau && (ombre || (!!fond && trait) || (prof > 0 && neutre));
      const principale = boite && prof === 0;
      // élément de données (jauge pleine ou en cases, barre) : sans texte, fond coloré, plat et allongé ; pas le remplissage d'une jauge déjà bordée
      const pere = x.parentElement;
      const remplissage =
        !!pere &&
        pere.offsetHeight <= 30 &&
        (parseFloat(getComputedStyle(pere).borderTopWidth) > 0 || pere.hasAttribute('data-niv-donnee'));
      const plate = H >= 4 && H <= 28 && L >= 2.5 * H, // jauge, barre horizontale, case
        debout = L >= 4 && L <= 48 && H >= 2.5 * L; // barre verticale de graphique
      const donnee = !inter && !!fond && !x.textContent.trim() && (plate || debout) && !remplissage;

      let niv = null,
        sous = dessous;
      if (fond && !donnee) {
        if (principale) {
          // boîte principale, posée sur le fond de l'appli : on n'y touche pas
        } else if (bandeau) {
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
      // ombres, règle fixe : seules les boîtes principales et les boutons en ont une
      marque(x, 'data-niv-boite', boite && !principale ? '' : null);
      marque(x, 'data-niv-plat', ombre && !boite && !(inter && !carte) ? '' : null);
      marque(x, 'data-niv-donnee', donnee ? '' : null);
      fait.set(x, { gen, sous, boite, r });
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
    gen++;
    plus_tard();
  };

  /* l'écran vient d'être redessiné : on décide les nouveaux éléments tout de suite, avant que le navigateur ne les affiche */
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
  };

  function demarre() {
    new MutationObserver(tout_de_suite).observe(document.body, { childList: true, subtree: true, characterData: true });
    // jour / nuit : nouvelles couleurs, tout est redécidé
    new MutationObserver(retons).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class', 'data-theme', 'data-style']
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retons);
    // un onglet qui s'affiche sans redessin (élément jusque-là caché) : décidé après le toucher ; rien d'autre n'est recalculé
    addEventListener('click', plus_tard, true);
    plus_tard();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarre);
  else demarre();
  window.RamEmpilementPasse = passe;
})();
