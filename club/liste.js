/* /RAM — liste.js : la liste déroulante maison, commune aux trois applis (/Pista, /Buvette, /Dojo).
   Elle remplace la liste du système des <select> : même largeur exacte, mêmes coins, même police, même bordure
   et même couleur que la boîte d'où elle part (règle de Baptiste), en jour comme en nuit.
   Le <select> reste en place et reste la source de vérité : value, selectedIndex, événements « input » et « change »
   se comportent comme avant, aucun code existant n'a à changer.
   Choix rapide : data-natif sur un <select> lui garde la liste du système. Les <select multiple> aussi.
   Sources : /Pista charge ce fichier par /club/liste.js, /Buvette et /Dojo par liste.js (un seul fichier, ici). */
(function () {
  'use strict';
  if (window.RamListe) return;
  const css = document.createElement('style');
  css.textContent =
    '.rl{position:fixed;z-index:2147483000;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;margin:0;padding:0;max-height:min(320px,50vh);' +
    'background:var(--c-surface,var(--ui-surface,var(--card,#fff)));color:var(--c-text,var(--ui-text,var(--fg,#111)))}' +
    '.rl[hidden]{display:none}' +
    '.rl button{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:44px;margin:0;text-align:left;border:0;border-top:1px solid rgba(128,128,128,.28);' +
    'border-radius:0;box-shadow:none;background:transparent;color:inherit;font:inherit;letter-spacing:inherit;text-transform:inherit;padding:8px 12px;cursor:pointer;transform:none}' +
    '.rl button:first-child{border-top:0}' +
    '.rl button[aria-selected="true"]{font-weight:700}' +
    '.rl button.on,.rl button:hover{background:var(--c-lime,var(--ui-lime,var(--c-accent,var(--accent,#E0F50A))));color:var(--c-dark,#1A0509)}' +
    '.rl button[disabled]{opacity:.45;cursor:default}.rl button[disabled]:hover{background:transparent;color:inherit}' +
    '.rl .rl-g{padding:8px 12px 4px;font-size:.78em;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.65;border-top:1px solid rgba(128,128,128,.28)}' +
    '.rl .rl-g:first-child{border-top:0}' +
    '.rl svg{flex:none;width:16px;height:16px}' +
    // écran tactile : le <select> ne reçoit plus ni le toucher ni le focus (sinon iOS ouvre sa liste en verre dépoli, parfois par-dessus la nôtre) ;
    // le toucher tombe sur ce qui est dessous et on le reconnaît par sa position (sousLeDoigt)
    '@media (pointer:coarse){select:not([data-natif]):not([multiple]):not([size]){pointer-events:none}}';
  document.head.appendChild(css);

  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let box = null, sel = null, act = -1, rows = [], typed = '', typedAt = 0, touch = null;

  const geree = s => s && s.tagName === 'SELECT' && !s.multiple && !(s.size > 1) && !s.disabled && s.dataset.natif == null;
  const tactile = matchMedia('(pointer: coarse)');
  let ferme0 = { s: null, t: 0 };   // la liste vient d'être fermée par un toucher à côté : le clic qui suit sur la même boîte ne la rouvre pas
  /* le select géré dont la boîte contient le point touché (il est sous le doigt mais n'est plus la cible du toucher) */
  function sousLeDoigt(e) {
    const t = e.target, x = e.clientX, y = e.clientY;
    if (!t || !(x >= 0)) return null;
    return [...document.querySelectorAll('select')].find(s => {
      if (!geree(s) || !s.getClientRects().length || !(t === s.parentElement || s.parentElement.contains(t) || t.contains(s))) return false;
      const r = s.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }) || null;
  }

  function ouverte() { return !!(box && !box.hidden); }
  function ferme(rend) {
    if (!box || box.hidden) return;
    box.hidden = true;
    if (sel) { sel.setAttribute('aria-expanded', 'false'); if (rend && !tactile.matches) try { sel.focus({ preventScroll: true }); } catch (e) { /* champ retiré de la page */ } }
    sel = null; act = -1; rows = [];
  }
  function surligne(i, voir) {
    act = i;
    rows.forEach((r, k) => r.btn.classList.toggle('on', k === i));
    if (voir && rows[i]) rows[i].btn.scrollIntoView({ block: 'nearest' });
  }
  function choisit(i) {
    const r = rows[i], s = sel;
    if (!r || !s || r.opt.disabled) return;
    const change = s.selectedIndex !== r.opt.index;
    s.selectedIndex = r.opt.index;
    ferme(true);
    if (change) ['input', 'change'].forEach(t => s.dispatchEvent(new Event(t, { bubbles: true })));
  }
  function pose() {
    // bouton-picto (data-rl-hote) : la liste prend le style du bouton et une largeur minimale, alignée sur son bord droit
    const hote = sel.dataset.rlHote ? sel.closest(sel.dataset.rlHote) : null, r = (hote || sel).getBoundingClientRect(), cs = getComputedStyle(hote || sel), larg = Math.max(r.width, +sel.dataset.rlMin || 0), gauche = Math.max(8, Math.min(r.left, innerWidth - 8 - larg));
    // fond opaque : celui de la boîte, sinon la surface de l'appli
    const bg = /rgba\(.*,\s*0\)|transparent/.test(cs.backgroundColor) ? '' : cs.backgroundColor;
    Object.assign(box.style, {
      left: (hote ? gauche : r.left) + 'px', width: (hote ? larg : r.width) + 'px',
      borderRadius: cs.borderTopLeftRadius === cs.borderBottomRightRadius ? cs.borderRadius : cs.borderTopLeftRadius,
      fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, letterSpacing: cs.letterSpacing, textTransform: cs.textTransform,
      borderWidth: cs.borderTopWidth, borderStyle: cs.borderTopStyle === 'none' ? 'solid' : cs.borderTopStyle, borderColor: cs.borderTopColor,
      backgroundColor: bg, color: cs.color === 'rgba(0, 0, 0, 0)' ? '' : cs.color,
      boxShadow: 'var(--sh, none)'   // l'ombre de l'appli, pas celle (de focus) de la boîte
    });
    box.style.paddingLeft = '0';
    const h = Math.min(box.scrollHeight, Math.min(320, innerHeight * 0.5)), dessous = innerHeight - r.bottom, dessus = r.top;
    if (dessous < h + 8 && dessus > dessous) { box.style.top = 'auto'; box.style.bottom = (innerHeight - r.top) + 'px'; box.style.maxHeight = Math.min(320, dessus - 8) + 'px'; }
    else { box.style.bottom = 'auto'; box.style.top = r.bottom + 'px'; box.style.maxHeight = Math.min(320, Math.max(120, dessous - 8)) + 'px'; }
  }
  function ouvre(s) {
    if (ferme0.s === s && Date.now() - ferme0.t < 500) return;
    if (ouverte() && sel === s) return ferme(true);
    ferme(false);
    sel = s;
    if (!box) {
      box = document.createElement('div'); box.className = 'rl'; box.setAttribute('role', 'listbox'); box.hidden = true;
      // le clic dans la liste ne doit ni voler le focus ni fermer la liste avant d'avoir choisi
      box.addEventListener('mousedown', e => e.preventDefault());
      box.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) choisit(+b.dataset.i); });
    }
    // la liste vit dans la boîte de dialogue ouverte (couche supérieure du navigateur), sinon dans la page
    const hote = s.closest('dialog[open]') || document.body;
    if (box.parentElement !== hote) hote.appendChild(box);
    rows = [];
    let html = '';
    [...s.children].forEach(n => {
      const add = o => {
        if (o.hidden) return;
        rows.push({ opt: o });
        html += `<button type="button" role="option" data-i="${rows.length - 1}" aria-selected="${o.selected}"${o.disabled ? ' disabled' : ''}><span>${esc(o.textContent)}</span>${o.selected ? CHECK : ''}</button>`;
      };
      if (n.tagName === 'OPTGROUP') { html += `<div class="rl-g" role="presentation">${esc(n.label)}</div>`; [...n.children].forEach(add); }
      else if (n.tagName === 'OPTION') add(n);
    });
    box.innerHTML = html;
    [...box.querySelectorAll('button[data-i]')].forEach((b, i) => { rows[i].btn = b; });
    box.hidden = false;
    s.setAttribute('aria-haspopup', 'listbox'); s.setAttribute('aria-expanded', 'true');
    pose();
    surligne(Math.max(0, rows.findIndex(r => r.opt.selected)), true);
  }

  // la boîte garde le focus (on la voit active) ; le système n'ouvre pas sa propre liste
  document.addEventListener('mousedown', e => {
    const s = e.target.closest && e.target.closest('select');
    if (geree(s) && e.button === 0) { e.preventDefault(); try { s.focus({ preventScroll: true }); } catch (x) { /* rien */ } }
    else if (ouverte() && !(box.contains(e.target))) { ferme0 = { s: sousLeDoigt(e) || sel, t: Date.now() }; ferme(false); }
  }, true);
  document.addEventListener('click', e => {
    let s = e.target.closest && e.target.closest('select');
    if (!geree(s)) {
      // l'activation d'une étiquette donnerait le focus au select (liste native sur iOS) : on ouvre la nôtre à la place
      const lab = e.target.closest && e.target.closest('label');
      s = lab && geree(lab.control) ? lab.control : tactile.matches ? sousLeDoigt(e) : null;
    }
    if (!geree(s)) return;
    e.preventDefault(); e.stopPropagation(); ouvre(s);
  }, true);
  // jamais de focus sur un select au toucher : on le rend aussitôt (le clavier d'un ordinateur garde le sien)
  document.addEventListener('focusin', e => { if (tactile.matches && geree(e.target) && !e.target.matches(':focus-visible')) e.target.blur(); }, true);
  // téléphone et iPad : un appui net ouvre la liste maison ; un glissement (défilement de la page) ne fait rien
  document.addEventListener('touchstart', e => { const s = e.target.closest && e.target.closest('select'); touch = geree(s) ? { y: e.touches[0].clientY, x: e.touches[0].clientX, s } : null; if (!touch && ouverte() && !box.contains(e.target)) { ferme0 = { s: sel, t: Date.now() }; ferme(false); } }, { capture: true, passive: true });
  document.addEventListener('touchend', e => {
    const t = touch; touch = null;
    if (!t || !e.cancelable) return;
    const c = e.changedTouches[0];
    if (Math.abs(c.clientY - t.y) < 10 && Math.abs(c.clientX - t.x) < 10) { e.preventDefault(); ouvre(t.s); }
  }, { capture: true, passive: false });
  document.addEventListener('keydown', e => {
    if (ouverte()) {
      const k = e.key;
      if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); return ferme(true); }
      if (k === 'Tab') return ferme(false);
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        e.preventDefault(); const d = k === 'ArrowDown' ? 1 : -1; let i = act;
        for (let n = 0; n < rows.length; n++) { i = (i + d + rows.length) % rows.length; if (!rows[i].opt.disabled) break; }
        return surligne(i, true);
      }
      if (k === 'Home' || k === 'End') { e.preventDefault(); return surligne(k === 'Home' ? 0 : rows.length - 1, true); }
      if (k === 'Enter' || k === ' ') { e.preventDefault(); return choisit(act); }
      if (k.length === 1 && !e.ctrlKey && !e.metaKey) {   // frappe : saute à l'entrée qui commence par ces lettres
        const now = Date.now(); typed = now - typedAt > 700 ? k.toLowerCase() : typed + k.toLowerCase(); typedAt = now;
        const i = rows.findIndex(r => !r.opt.disabled && r.opt.textContent.trim().toLowerCase().startsWith(typed));
        if (i >= 0) surligne(i, true);
      }
      return;
    }
    const s = e.target;
    if (geree(s) && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') && !e.altKey) { e.preventDefault(); ouvre(s); }
  }, true);
  // page qui défile ou fenêtre qui change de taille : la liste se referme (elle ne suivrait plus sa boîte)
  addEventListener('resize', () => ferme(false));
  addEventListener('scroll', e => { if (ouverte() && !(box.contains(e.target))) ferme(false); }, true);
  window.RamListe = { ferme: () => ferme(false) };
})();
