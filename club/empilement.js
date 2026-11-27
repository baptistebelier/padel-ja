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
    {
      // zones traitées : /Buvette et /Dojo (#main, .sheet), /Pista (main, fenêtres .modal-box) ; navigation et intercalaires laissés de côté
      racines: '#main, .sheet, main, .modal-box, dialog[open]',
      ignore: '#tabs, #subnav, .seg.haut, .rl, .tabs, .rbot, .rail, .r-rail, .r-itabs, .tsec-tabs, .ps-side'
    },
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
    // navigation active ou survolée (menus, sous-menus, barre du bas, élément choisi dans une liste) : fond coloré seul,
    // ni trait noir ni ombre ; ce sont des sections, pas des boutons. Intercalaires et contour de focus au clavier gardés.
    '@media (hover:hover){:root :is(#tabs button, .tabs button, .rbot button, #subnav :is(button, a), #main > .seg:not(.haut) button, .colist .item, .cofr, .cobm .item, .r-row, .r-rail__it, .r-sub__it, .ps-side :is(button, a)):not([data-onglet]):hover{box-shadow:none!important;outline:none!important;border-color:transparent!important}}' +
    ':root :is(#tabs button, .tabs button, .rbot button, #subnav :is(button, a), #main > .seg:not(.haut) button, .colist .item, .cofr, .cobm .item, .r-row, .r-rail__it, .r-sub__it, .ps-side :is(button, a)):not([data-onglet]):is([aria-current]:not([aria-current="false"]),[aria-selected="true"],[aria-pressed="true"],.on,.sel,.active,:has(> [aria-current]:not([aria-current="false"]))){box-shadow:none!important;outline:none!important;border-color:transparent!important}' +
    // jour en cours d'un calendrier (colonne, en-tête, case) : c'est aussi une section active, fond coloré seul
    ':root :is(.today,[aria-current="date"]):not(.btn){box-shadow:none!important;outline:none!important;border-color:transparent!important}' +
    ':root :is(.tabs,.rbot) button[aria-current="page"]::before{box-shadow:none!important}' +
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
    !!a && !!b && Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) < 12; // écart sous lequel deux fonds se confondent (la sous-boîte de nuit est à environ 14)

  let A = null,
    B = null;
  function tons() {
    const p = document.createElement('div');
    p.__ramSonde = true;
    p.style.cssText = 'position:absolute;width:1px;height:1px;left:-9px;top:-9px;background:var(--niv-a)';
    document.body.appendChild(p);
    A = rgb(getComputedStyle(p).backgroundColor);
    // mode nuit (fond de carte sombre) : les sous-boîtes partent dans le très foncé, pas dans le gris clair (Baptiste, 26/11) ;
    // mode jour : un gris un cran plus foncé que la carte (mélange avec la couleur du texte)
    const nuit = A && A[0] * 0.3 + A[1] * 0.59 + A[2] * 0.11 < 110,
      voulu = nuit ? 'color-mix(in srgb, var(--c-surface) 62%, #000)' : '',
      st = document.documentElement.style;
    if (st.getPropertyValue('--niv-b') !== voulu)
      voulu ? st.setProperty('--niv-b', voulu) : st.removeProperty('--niv-b');
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
      const carte = inter && H >= 52 && L >= 96;
      const boite =
        (!inter || carte) &&
        grand &&
        !etat &&
        !bandeau &&
        (ombre || (!!fond && trait) || (prof > 0 && (neutre || (carte && !!fond))));
      const principale = boite && prof === 0;
      // élément de données (jauge pleine ou en cases, barre) : sans texte, fond coloré, plat et allongé ; pas le remplissage d'une jauge déjà bordée
      const pere = x.parentElement;
      const remplissage =
        !!pere &&
        pere.offsetHeight <= 30 &&
        (parseFloat(getComputedStyle(pere).borderTopWidth) > 0 || pere.hasAttribute('data-niv-donnee'));
      const plate = H >= 4 && H <= 28 && L >= 2.5 * H, // jauge, barre horizontale, case
        debout = L >= 4 && L <= 96 && H >= 1.5 * L; // barre verticale de graphique
      const donnee = !inter && !!fond && !x.textContent.trim() && (plate || debout) && !remplissage;

      let niv = null,
        sous = dessous;
      if (fond) {
        if (principale) {
          // boîte principale, posée sur le fond de l'appli : on n'y touche pas
        } else if (bandeau && !donnee) {
          niv = 't';
        } else if (proche(fond, dessous) && ton(fond)) {
          // seulement les fonds neutres (carte, sous-boîte) : une couleur d'accent sur la même couleur (point rouge sur sa ligne) reste telle quelle
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
      (recs.length &&
        recs.every(r => r.target === document.body && [...r.addedNodes, ...r.removedNodes].every(n => n.__ramSonde)))
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
    // un onglet qui s'affiche sans redessin (élément jusque-là caché) : décidé juste après le toucher, une fois que l'appli a
    // réagi (écoute en fin de propagation) et avant l'affichage ; rien d'autre n'est recalculé
    addEventListener('click', () => queueMicrotask(() => tout_de_suite([])));
    plus_tard();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarre);
  else demarre();
  window.RamEmpilementPasse = passe;
})();

/* =========================================================================
   Intercalaires (règle de Baptiste, 26/11/2026), communs aux trois applis, quelle que soit leur classe
   (.seg.haut et .r-itabs de /Dojo, .seg de /Buvette sur téléphone, .tsec-tabs de /Pista…) :
   - l'intercalaire actif a le fond de la boîte à laquelle il est collé ; les autres sont un peu plus foncés ;
   - contour noir toujours, actif ou non ; petit liseré de la couleur de l'appli en haut de l'actif ;
   - chacun a un pictogramme et un titre ; à partir de 4 intercalaires, seul le pictogramme des inactifs reste,
     le titre ne s'affiche que sur l'actif ;
   - on touche un pictogramme pour l'ouvrir, ou on glisse le doigt d'un intercalaire à l'autre.
   ========================================================================= */
(function () {
  'use strict';
  if (window.__ramOnglets) return;
  window.__ramOnglets = true;
  const BARRES = '.seg.haut, .r-itabs, .tsec-tabs, .ps-itabs, #main > .seg, .bar-tabs:not(.me-tabs)';
  const HORS = '#subnav, #tabs, .tabs, .rbot, .rail, .r-rail';
  const ACTIF = ':is([aria-selected="true"], [aria-current]:not([aria-current="false"]), .on, .cur)';
  const css = document.createElement('style');
  css.textContent =
    '[data-onglet]{display:inline-flex!important;align-items:center;gap:8px;background:color-mix(in srgb,var(--ong-fond,var(--c-surface)) 82%,#000)!important;' +
    'color:var(--c-text)!important;border:var(--bw,2px) solid var(--c-ink)!important;border-bottom:0!important;box-shadow:none!important;transition:none!important}' +
    '[data-onglet]' +
    ACTIF +
    '{background:var(--ong-fond,var(--c-surface))!important;box-shadow:inset 0 4px 0 var(--ong-lisere,var(--c-lime,var(--accent)))!important}' +
    '[data-onglet]>svg{width:18px;height:18px;flex:none}' +
    '[data-onglet] .lb{display:inline!important}' +
    '[data-compact]>[data-onglet]:not(' +
    ACTIF +
    ') .lb{display:none!important}' +
    '[data-compact]>[data-onglet]:not(' +
    ACTIF +
    '){padding-left:12px!important;padding-right:12px!important;flex:none!important}' +
    '[data-onglets]{touch-action:pan-y}';
  document.head.appendChild(css);

  /* pictogrammes selon le titre de l'intercalaire (trait, couleur du texte) */
  const P = {
    home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
    chart: '<path d="M5 20V10M12 20V4M19 20v-7M3 20h18"/>',
    cal: '<path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5"/>',
    jour: '<path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5M10 14h4v3h-4z"/>',
    user: '<path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0"/>',
    users:
      '<path d="M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20a7 7 0 0114 0M16 4a3.5 3.5 0 010 7M22 20a7 7 0 00-5-6.7"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
    gear: '<path d="M12 15a3 3 0 100-6 3 3 0 000 6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    info: '<path d="M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5v.5"/>',
    book: '<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h11"/>',
    grid: '<path d="M4 4h16v16H4zM12 4v16M4 12h16"/>',
    tv: '<path d="M3 6h18v12H3zM8 21h8"/>',
    heart: '<path d="M12 20s-7-4.4-9-9a5 5 0 019-3 5 5 0 019 3c-2 4.6-9 9-9 9z"/>',
    euro: '<path d="M17 6a7 7 0 100 12M4 10h9M4 14h9"/>',
    trophy: '<path d="M7 4h10v5a5 5 0 01-10 0zM7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3M12 14v4M8 21h8M9 18h6"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1"/>',
    ball: '<path d="M12 21a9 9 0 100-18 9 9 0 000 18zM5.6 5.6c3 3 3 9.8 0 12.8M18.4 5.6c-3 3-3 9.8 0 12.8"/>',
    pen: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
    shuffle: '<path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3"/>',
    clock: '<path d="M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2"/>',
    live: '<path d="M12 14a2 2 0 100-4 2 2 0 000 4zM7.8 16.2a6 6 0 010-8.4M16.2 7.8a6 6 0 010 8.4M5 19a10 10 0 010-14M19 5a10 10 0 010 14"/>',
    medal: '<path d="M8 3h8l-2 6h-4zM12 9a6 6 0 100 12 6 6 0 000-12z"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5"/>',
    history: '<path d="M3 12a9 9 0 103-6.7L3 8M3 3v5h5M12 7v5l3 2"/>',
    point: '<path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/>'
  };
  const MOTS = [
    [/aujourd/, 'home'],
    [/statist|stats|chiffres/, 'chart'],
    [/^jour$|journ/, 'jour'],
    [/semaine|mois|calendrier|planning|agenda/, 'cal'],
    [/fiche|profil/, 'user'],
    [/s[ée]ances?|cours|cycles?/, 'cal'],
    [/progression|niveau/, 'trend'],
    [/[ée]changes?|discussion|messages?/, 'chat'],
    [/[ée]l[èe]ves|joueurs|adh[ée]rents|[ée]quipes|adjoints|inscrits/, 'users'],
    [/formule|offre|tarif|encaisser|paiement/, 'euro'],
    [/r[ée]glages|gestion|param/, 'gear'],
    [/informations?/, 'info'],
    [/r[èe]gles?/, 'book'],
    [/terrains?|tableaux?/, 'grid'],
    [/habillage|[ée]cran|tv/, 'tv'],
    [/sponsor|partenaires?/, 'heart'],
    [/r[ée]sultats?|palmar|classement/, 'trophy'],
    [/liste|tous|toutes/, 'list'],
    [/parties?/, 'ball'],
    [/tournois?/, 'medal'],
    [/inscriptions?/, 'pen'],
    [/tirage/, 'shuffle'],
    [/programmation|horaires?/, 'clock'],
    [/direct|en cours/, 'live'],
    [/abonn/, 'shield'],
    [/clubs?/, 'flag'],
    [/mod[èe]les?/, 'layers'],
    [/reprises?|historique|archives?/, 'history']
  ];
  function picto(t) {
    const s = String(t)
      .toLowerCase()
      .replace(/^[\d\s·.-]+/, '')
      .trim();
    const m = MOTS.find(x => x[0].test(s));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    [
      ['viewBox', '0 0 24 24'],
      ['fill', 'none'],
      ['stroke', 'currentColor'],
      ['stroke-width', '2'],
      ['stroke-linecap', 'round'],
      ['stroke-linejoin', 'round'],
      ['aria-hidden', 'true'],
      ['class', 'ong-ic']
    ].forEach(a => svg.setAttribute(a[0], a[1]));
    svg.innerHTML = P[m ? m[1] : 'point'];
    return svg;
  }
  const rgbOk = s => !!s && s !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(s);
  /* le fond de la boîte à laquelle la barre est collée : l'élément qui la suit (ou celui qui suit son parent) */
  function fondDessous(barre) {
    const n = barre.nextElementSibling || (barre.parentElement && barre.parentElement.nextElementSibling);
    if (n) {
      const c = getComputedStyle(n).backgroundColor;
      if (rgbOk(c)) return c;
      const k = n.firstElementChild && getComputedStyle(n.firstElementChild).backgroundColor;
      if (rgbOk(k)) return k;
    }
    for (let p = barre.parentElement; p; p = p.parentElement) {
      const c = getComputedStyle(p).backgroundColor;
      if (rgbOk(c)) return c;
    }
    return '';
  }
  function prepare() {
    document.querySelectorAll(BARRES).forEach(b => {
      if (b.closest(HORS) || !b.getClientRects().length) return;
      const onglets = [...b.children].filter(x => x.matches('button, a, [role="tab"]'));
      if (onglets.length < 2) return;
      if (!b.hasAttribute('data-onglets')) b.setAttribute('data-onglets', '');
      const compact = onglets.length >= 4;
      if (compact !== b.hasAttribute('data-compact')) b.toggleAttribute('data-compact', compact);
      const f = fondDessous(b);
      if (f && b.style.getPropertyValue('--ong-fond') !== f) b.style.setProperty('--ong-fond', f);
      onglets.forEach(o => {
        if (!o.hasAttribute('data-onglet')) o.setAttribute('data-onglet', '');
        if (!o.getAttribute('aria-label')) o.setAttribute('aria-label', (o.textContent || '').trim());
        if (!o.querySelector('.lb')) {
          const txt = [...o.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
          if (txt.length) {
            const s = document.createElement('span');
            s.className = 'lb';
            txt[0].before(s);
            txt.forEach(n => s.appendChild(n));
          }
        }
        if (!o.querySelector('svg')) o.prepend(picto(o.getAttribute('aria-label') || o.textContent || ''));
      });
    });
  }
  /* glisser le doigt d'un intercalaire à l'autre : celui qui passe sous le doigt s'ouvre */
  let glisse = null;
  document.addEventListener(
    'pointerdown',
    e => {
      const o = e.target.closest && e.target.closest('[data-onglets] > [data-onglet]');
      glisse = o ? { x: e.clientX, y: e.clientY, dernier: o, bouge: false } : null;
    },
    true
  );
  document.addEventListener(
    'pointermove',
    e => {
      if (!glisse) return;
      const dx = Math.abs(e.clientX - glisse.x);
      if (!glisse.bouge) {
        if (dx < 12 || dx < Math.abs(e.clientY - glisse.y)) return;
        glisse.bouge = true;
      }
      const el = document.elementFromPoint(e.clientX, glisse.y);
      const o = el && el.closest && el.closest('[data-onglets] > [data-onglet]');
      if (o && o !== glisse.dernier) {
        glisse.dernier = o;
        if (!o.matches(ACTIF)) o.click();
      }
    },
    { passive: true }
  );
  document.addEventListener(
    'pointerup',
    () => {
      if (glisse && glisse.bouge) {
        // le « clic » de fin de geste ne rouvre rien : l'intercalaire est déjà ouvert
        const stop = ev => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        document.addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => document.removeEventListener('click', stop, true), 400);
      }
      glisse = null;
    },
    true
  );
  document.addEventListener('pointercancel', () => (glisse = null), true);

  let encours = false;
  const lance = () => {
    if (encours) return;
    encours = true;
    try {
      prepare();
    } finally {
      encours = false;
    }
  };
  function demarre() {
    new MutationObserver(lance).observe(document.body, { childList: true, subtree: true });
    new MutationObserver(() => requestAnimationFrame(lance)).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class', 'data-theme', 'data-style']
    });
    addEventListener('click', () => queueMicrotask(lance));
    lance();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarre);
  else demarre();
})();
