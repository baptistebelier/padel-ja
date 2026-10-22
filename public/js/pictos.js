/* =========================================================================
   RAM JA — pictogrammes des cartes (dessinés pour le logiciel, jamais d'emoji)
   - chaque carte reçoit le pictogramme de son sujet devant son titre ;
   - les sections numérotées de la fiche tournoi (« 01 / Infos ») perdent leur
     numéro au profit du pictogramme, dans le titre comme dans les onglets ;
   - les cartes ajoutées plus tard (fenêtres, tirage…) sont décorées aussi.
   ========================================================================= */
(function () {
  const P = {
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8"/>',
    book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H20z"/>',
    court: '<rect x="4" y="3" width="16" height="18"/><path d="M4 12h16M12 3v18M4 7.5h16M4 16.5h16"/>',
    tv: '<rect x="3" y="5" width="18" height="12"/><path d="M8 21h8M12 17v4"/>',
    sponsor: '<circle cx="12" cy="9" r="5.5"/><path d="M8.5 13.5L7 21l5-2.5 5 2.5-1.5-7.5"/>',
    lock: '<rect x="5" y="11" width="14" height="10"/><path d="M8 11V7a4 4 0 0 1 8 0v4M12 15v2"/>',
    userplus: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5M19 8v6M16 11h6"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5 6-5s5.4 1.6 6 5"/><circle cx="17" cy="9" r="2.6"/><path d="M16 14.2c2.6.2 4.4 1.8 5 4.8"/>',
    hourglass: '<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/>',
    userx: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5M16.5 8.5l5 5M21.5 8.5l-5 5"/>',
    pools: '<rect x="3" y="3" width="7.5" height="7.5"/><rect x="13.5" y="3" width="7.5" height="7.5"/><rect x="3" y="13.5" width="7.5" height="7.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5"/>',
    bracket: '<path d="M3 5h5v6H3M3 13h5v6H3M8 8h4v8H8M12 12h5M17 9h4v6h-4z"/>',
    podium: '<path d="M3 21V14h6v7M9 21V9h6v12M15 21v-5h6v5M2 21h20"/><path d="M12 3l1 2 2 .3-1.5 1.4.4 2.1L12 7.8l-1.9 1 .4-2.1L9 5.3l2-.3z"/>',
    ranking: '<path d="M10 6h11M10 12h11M10 18h11"/><path d="M4 5l1.5-1v5M3.5 13.5c0-1 .8-1.6 1.6-1.6s1.5.6 1.5 1.4c0 1.2-3 2.2-3 3.7h3M3.5 19.6c.3.3.8.5 1.4.5.8 0 1.4-.5 1.4-1.2s-.6-1.1-1.4-1.1c.8 0 1.3-.4 1.3-1 0-.6-.5-1-1.3-1-.5 0-1 .2-1.3.5"/>',
    order: '<path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4"/>',
    rest: '<path d="M4 9h13v5a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 2.5c-.6 1 .6 2 0 3M12 2.5c-.6 1 .6 2 0 3"/>',
    check: '<rect x="3" y="5" width="18" height="16"/><path d="M3 10h18M8 3v4M16 3v4M8.5 15.5l2.3 2.3 4.7-4.6"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.5M4 12h.5M4 18h.5"/>',
    stream: '<circle cx="12" cy="12" r="2.5"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>',
    dice: '<rect x="3" y="3" width="18" height="18"/><path d="M8 8h.5M15.5 8h.5M12 12h.5M8 16h.5M15.5 16h.5"/>',
    save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
    print: '<path d="M7 8V3h10v5M7 17H4V8h16v9h-3"/><rect x="7" y="13" width="10" height="8"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12"/><path d="M6 10h.5M10 10h.5M14 10h.5M18 10h.5M7 14h10"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.2-2.5 3.9M12 17v.5"/>',
    progress: '<path d="M4 20V4M4 20h16"/><path d="M7 15l4-4 3 3 6-6"/>'
  };
  // sujet de la carte (titre ou sur-titre, sans accents) → pictogramme
  const RULES = [
    ['formats preenregistres', 'layers'], ['informations', 'info'], ['infos', 'info'], ['formule', 'trophy'], ['regles', 'book'], ['reglement', 'book'],
    ['terrains', 'court'], ['sur les terrains', 'court'], ['ecran tv', 'tv'], ['habillage', 'tv'], ['vue affichee', 'tv'], ['television', 'tv'],
    ['sponsor', 'sponsor'], ['partenaires', 'sponsor'], ['cloture', 'lock'], ['gestion', 'lock'],
    ['saisie rapide', 'userplus'], ['nouvelle paire', 'userplus'], ['paires retenues', 'users'], ['liste d\'attente', 'hourglass'], ['forfaits', 'userx'], ['forfait', 'userx'],
    ['qualifications', 'pools'], ['poules', 'pools'], ['phase de poules', 'pools'], ['tableau final', 'bracket'], ['tableaux constitues', 'bracket'],
    ['matchs de classement', 'ranking'], ['classement', 'podium'], ['ordre des matchs', 'order'], ['repos', 'rest'], ['matchs par jour', 'check'],
    ['tous les matchs', 'list'], ['overlay', 'stream'], ['stream', 'stream'], ['preparer le tirage', 'dice'], ['tirage', 'dice'],
    ['enregistrer ce format', 'save'], ['imprimer', 'print'], ['impression', 'print'], ['modifier la paire', 'edit'], ['raccourcis clavier', 'keyboard'],
    ['mon compte', 'user'], ['fiche joueur', 'user'], ['aide', 'help'], ['progression', 'progress']
  ];
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const keyOf = txt => { const t = norm(txt); const r = RULES.find(([k]) => t.startsWith(k)); return r ? r[1] : null; };
  const svg = k => `<svg class="pic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[k]}</svg>`;

  function decorate(root) {
    const R = root || document;
    // 1. sections numérotées (« 01 / Infos ») : le numéro devient le pictogramme, le titre en dessous n'en reçoit pas d'autre
    R.querySelectorAll('.eyebrow').forEach(eb => {
      if (eb.querySelector('.pic') || !/^\s*\d{1,2}\s*\/\s*/.test(eb.textContent)) return;
      const word = eb.textContent.replace(/^\s*\d{1,2}\s*\/\s*/, ''), k = keyOf(word);
      if (k) eb.innerHTML = svg(k) + word;
    });
    // 2. titres de cartes : chacun son pictogramme (une carte peut en avoir plusieurs : paires, attente, forfaits)
    R.querySelectorAll('.card h3, .modal h3, .sheet h3, .dlg h3').forEach(h3 => {
      if (h3.querySelector('.pic') || h3.closest('[data-nopic]')) return;
      const card = h3.closest('.card, .modal, .sheet, .dlg'), eb = card && card.querySelector('.eyebrow');
      if (eb && eb.querySelector('.pic') && card.querySelector('h3') === h3) return;   // section numérotée : déjà illustrée
      const k = keyOf(h3.textContent) || (card && card.querySelector('h3') === h3 && eb ? keyOf(eb.textContent) : null);
      if (k) h3.insertAdjacentHTML('afterbegin', svg(k));
    });
    // 3. cartes sans titre (« Sur les terrains ») : le pictogramme va dans le sur-titre
    R.querySelectorAll('.card').forEach(card => {
      if (card.querySelector('h3')) return;
      const eb = card.querySelector('.eyebrow');
      if (!eb || eb.querySelector('.pic')) return;
      const k = keyOf(eb.textContent);
      if (k) eb.insertAdjacentHTML('afterbegin', svg(k));
    });
  }
  window.Pictos = { decorate, svg: k => (P[k] ? svg(k) : '') };
  const run = () => decorate(document);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  // cartes ajoutées ensuite (fenêtres, tableaux de tirage…) : décorées au fil de l'eau
  let t = null;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(run, 60); }).observe(document.documentElement, { childList: true, subtree: true });
})();
