/* /RAM JA — panneau « Tournoi en cours » : plusieurs tournois peuvent se jouer en même temps (un tournoi interne
   dure des semaines) ; ce panneau déroulant ouvre le tournoi à éditer.
   - sur un tournoi en cours (et sur le tableau de bord) : seulement les tournois en cours ;
   - sur un tournoi clôturé (ouvert depuis « Mes tournois ») : tous les tournois clôturés, et le menu marque « Tournois ».
   La liste est relue à chaque ouverture du panneau et quand on revient sur la page : un tournoi rouvert ou clôturé
   ailleurs y apparaît ou en disparaît aussitôt.
   Comme toute liste déroulante des applis, elle prend la largeur et le style de la boîte d'où elle part. */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ici = (location.pathname.match(/^\/t\/([\w-]+)\/?$/) || [])[1] || '';
  const KIND = { interne: 'Tournoi interne', animation: 'Animation' };
  const enCours = t => !t.closed && !t.example && (t.drawn || (t.kind === 'interne' && t.players));
  let liste = null, ouvert = false;
  const ic = '<svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const etat = t => (t.closed ? 'Clôturé' + (t.closedAt ? ' le ' + new Date(t.closedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '') : t.drawn ? (t.kind === 'animation' ? 'Manche ' + (t.rounds || 0) : t.done + '/' + t.matches + ' matchs') : 'Inscriptions');
  const courant = () => (liste || []).find(t => t.id === ici) || null;
  // le tournoi affiché est-il clôturé ? (son propre état fait foi, la liste peut avoir un temps de retard)
  const cloture = () => { const c = courant(); return !!(c && c.closed); };
  function html() {
    const clos = cloture();
    const l = (liste || []).filter(t => (clos ? t.closed && !t.example : enCours(t)) || t.id === ici)
      .sort((a, b) => (clos ? (b.closedAt || 0) - (a.closedAt || 0) : (b.updated_at || 0) - (a.updated_at || 0)));
    if (l.length < 2) return '';
    const cur = l.find(t => t.id === ici);
    return `<details class="enc"${ouvert ? ' open' : ''}>
      <summary><span class="enc-t"><small>${l.length} tournois ${clos ? 'clôturés' : 'en cours'}</small><b>${esc(cur ? cur.name || 'Sans nom' : 'Choisir un tournoi')}</b></span>${ic}</summary>
      <div class="enc-l" role="list">${l.map(t => `<a role="listitem" href="/t/${esc(t.id)}"${t.id === ici ? ' aria-current="page"' : ''}><b>${esc(t.name || 'Sans nom')}</b><small>${esc([KIND[t.kind] || 'Tournoi', etat(t), t.adjoint ? 'adjoint' : ''].filter(Boolean).join(' · '))}</small></a>`).join('')}</div>
    </details>`;
  }
  /* tournoi clôturé : il n'est plus « en cours » ; le menu principal marque « Tournois » et le bloc du tournoi le dit */
  function section() {
    const clos = cloture();
    if (!ici || !liste) return;
    document.querySelectorAll('.rail a[data-r]').forEach(a => {
      if (a.dataset.r === 'encours') a.classList.toggle('on', !clos);
      if (a.dataset.r === 'tournois') a.classList.toggle('on', clos);
    });
    const ey = document.querySelector('.side-t .side-ey');
    const lib = clos ? 'Tournoi clôturé' : 'Tournoi en cours';
    if (ey && ey.textContent !== lib) ey.textContent = lib;   // réécrire un texte identique relancerait l'observateur sans fin
  }
  // la liste copie la boîte d'où elle part : largeur, coins, police, bordure
  function caler(d) {
    const s = d.querySelector('summary'), l = d.querySelector('.enc-l');
    if (!s || !l) return;
    const cs = getComputedStyle(s);
    Object.assign(l.style, { borderRadius: cs.borderRadius, fontFamily: cs.fontFamily, borderWidth: cs.borderTopWidth, borderStyle: cs.borderTopStyle, borderColor: cs.borderTopColor });
  }
  function poser() {
    if (!liste) return;
    section();
    const h = html();
    // éditeur : sous le nom du tournoi ; pages animation et interne : avant l'en-tête de la page ; tableau de bord : son emplacement
    const cibles = [...document.querySelectorAll('[data-encours]')];
    const side = document.querySelector('.side-t');
    if (side) cibles.push(side);
    else if (ici) { const ph = document.querySelector('main .phead, main .page-h, .phead'); if (ph) cibles.push(ph); }
    cibles.forEach(c => {
      const avant = c.classList.contains('phead') || c.classList.contains('page-h');
      let box = avant ? (c.previousElementSibling && c.previousElementSibling.classList.contains('enc-box') ? c.previousElementSibling : null) : c.querySelector(':scope > .enc-box');
      if (!h) { if (box) box.remove(); return; }
      if (!box) { box = document.createElement('div'); box.className = 'enc-box'; if (avant) c.before(box); else c.appendChild(box); }
      if (box.dataset.h !== h) {
        box.dataset.h = h; box.innerHTML = h;
        const d = box.querySelector('details.enc');
        d.addEventListener('toggle', () => { ouvert = d.open; if (d.open) { caler(d); relire(); } });
        if (d.open) caler(d);
      }
    });
  }
  let enVol = null;
  function relire() {
    if (enVol) return enVol;
    enVol = fetch('/api/tournaments', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (d) { liste = d.tournaments || []; poser(); } }).catch(() => {}).finally(() => { enVol = null; });
    return enVol;
  }
  const css = document.createElement('style');
  css.textContent = '[data-encours]:empty{display:none}.enc-box{margin:8px 0}.enc{position:relative}'
    + '.enc summary{list-style:none;display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 10px;border:2px solid var(--ui-accent-line,#E0284A);border-radius:var(--ui-r-sm,0);background:var(--ui-surface,#fff);color:var(--ui-text,#111);min-height:44px;font-family:var(--body,inherit)}'
    + '.side-t .enc summary{background:rgba(255,255,255,.08);color:#fff;border-color:rgba(255,255,255,.4)}'
    + '.enc summary::-webkit-details-marker{display:none}.enc-t{display:flex;flex-direction:column;min-width:0;flex:1}'
    + '.enc .enc-t b,.enc .enc-t small,.enc-l a b,.enc-l a small{font-family:inherit;font-style:normal;text-transform:none;letter-spacing:normal;color:inherit}'
    + '.enc .enc-t small,.enc-l a small{font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.75;display:block}'
    + '.enc .enc-t b,.enc-l a b{font-size:14px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.enc summary .ic{width:18px;height:18px;flex:none}.enc[open] summary .ic{transform:rotate(180deg)}'
    // la liste : exactement la largeur de la boîte, sans coins arrondis ajoutés (elle reprend ceux de la boîte)
    + '.enc-l{position:absolute;left:0;right:0;top:100%;z-index:70;display:grid;max-height:320px;overflow-y:auto;background:var(--ui-surface,#fff);color:var(--ui-text,#111);border:2px solid var(--ui-accent-line,#E0284A);border-top-width:0;border-radius:0;box-shadow:4px 4px 0 var(--ui-hard,rgba(0,0,0,.35));font-family:var(--body,inherit)}'
    + '.enc-l a{display:flex;flex-direction:column;justify-content:center;gap:1px;padding:8px 10px;min-height:44px;color:inherit;text-decoration:none;border-radius:0;border-top:1px solid var(--ui-border,rgba(0,0,0,.1))}'
    + '.enc-l a:first-child{border-top:0}.enc-l a:hover,.enc-l a:focus-visible{background:var(--ui-surface-2,#f2f2f2)}.enc-l a[aria-current]{background:var(--ui-surface-2,#f2f2f2)}.enc-l a[aria-current] b{color:var(--ui-accent-text,#E0284A)}';
  document.head.appendChild(css);
  // un clic ailleurs referme le panneau
  document.addEventListener('click', e => document.querySelectorAll('details.enc[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }));
  // revenir sur la page (autre onglet, téléphone réveillé) : la liste est relue
  document.addEventListener('visibilitychange', () => { if (!document.hidden) relire(); });
  addEventListener('focus', relire);
  // un tournoi vient d'être clôturé ou rouvert, depuis n'importe quel bouton de la page (éditeur, animation, tournoi
  // interne) : la demande envoyée au serveur suffit à le savoir, la liste est relue une fois la réponse arrivée
  const CLOT = /\/api\/tournaments\/[\w-]+\/(close|reopen)$|\/api\/t\/[\w-]+\/action$/;
  const fetch0 = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    const p = fetch0(url, opts);
    try {
      const u = String((url && url.url) || url), corps = opts && typeof opts.body === 'string' ? opts.body : '';
      if (CLOT.test(u) && (!/\/action$/.test(u) || /"type":"(int\/finish|int\/reopen|ani\/finish|ani\/reopen|tournament\/setClosed)"/.test(corps))) p.then(() => setTimeout(relire, 800), () => {});
    } catch (e) { /* adresse illisible : rien à faire */ }
    return p;
  };
  setInterval(() => { if (!document.hidden) relire(); }, 30000);
  relire().then(() => new MutationObserver(poser).observe(document.body, { childList: true, subtree: true }));
})();
