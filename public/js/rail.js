/* Rail de navigation principal (tout à gauche), commun à l'espace juge-arbitre et à l'éditeur.
   La page indique l'élément actif avec <body data-page="dashboard|encours|tournois|calendrier|joueurs|profil|admin">. */
(function () {
  const I = d => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    dashboard: I('<rect x="3" y="3" width="7.5" height="9" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="5" rx="1.5"/><rect x="13.5" y="11" width="7.5" height="10" rx="1.5"/><rect x="3" y="15" width="7.5" height="6" rx="1.5"/>'),
    encours: I('<circle cx="12" cy="12" r="2.5"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>'),
    tournois: I('<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 13v4M8 21h8M9 17h6"/>'),
    calendrier: I('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M7.5 14h2M11 14h2M14.5 14h2M7.5 17.5h2M11 17.5h2"/>'),
    joueurs: I('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5 6-5s5.4 1.6 6 5"/><circle cx="17" cy="9" r="2.6"/><path d="M16 14.2c2.6.2 4.4 1.8 5 4.8"/>'),
    equipes: I('<path d="M4 19v-1.5A3.5 3.5 0 0 1 7.5 14h3A3.5 3.5 0 0 1 14 17.5V19"/><circle cx="9" cy="8.5" r="3"/><path d="M16 4.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z"/><path d="M16 14h1a3 3 0 0 1 3 3v2"/>'),
    stats: I('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    admin: I('<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
    moon: '<svg class="ic ic-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
    sun: '<svg class="ic ic-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    logout: I('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>')
  };
  const ITEMS = [
    ['dashboard', '/dashboard', 'Dashboard', 'Tableau de bord'],
    ['encours', '/en-cours', 'En cours', 'Tournoi en cours'],
    ['tournois', '/app', 'Tournois', 'Mes tournois'],
    ['calendrier', '/calendrier', 'Calendrier', 'Mon calendrier'],
    ['joueurs', '/joueurs', 'Joueurs', 'Mes joueurs'],
    ['equipes', '/championnats', 'Équipes', 'Championnats par équipes'],
    ['stats', '/statistiques', 'Stats', 'Statistiques'],
    ['admin', '/admin', 'Admin', 'Administration']
  ];
  /* téléphone : barre du haut avec le bouton du menu, pour les pages qui n'ont pas la leur */
  function railTop(nav) {
    const mine = document.querySelector('.mtop-rail');
    const own = [...document.querySelectorAll('[data-drawer-open]')].some(b => !mine || !mine.contains(b));
    if (own) { if (mine) mine.remove(); return; }
    if (mine) return;
    const top = document.createElement('header'); top.className = 'mtop mtop-rail';
    top.innerHTML = `<button type="button" class="mtop-btn" data-drawer-open aria-label="Ouvrir le menu"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h12"/></svg></button>
        <a class="mtop-logo" href="/dashboard"><img class="lg-n" src="/img/ja-ram-rouge-blanc.png" alt="/RAM JA"><img class="lg-j" src="/img/ja-ram-rouge-noir.png" alt="/RAM JA"></a><span class="mtop-sp"></span>`;
    nav.after(top);
  }
  function build() {
    const page = document.body.dataset.page || '';
    const nav = document.createElement('aside');
    nav.className = 'rail'; nav.setAttribute('role', 'navigation'); nav.setAttribute('aria-label', 'Navigation principale');
    nav.innerHTML = `<a class="rail-logo" href="/dashboard" title="/RAM JA — tableau de bord"><img src="/img/ja-ram-rouge-blanc.png" alt="/RAM JA"></a>
      <div class="rail-group">${ITEMS.map(([k, href, label, title]) =>
        `<a href="${href}" data-r="${k}" class="${page === k ? 'on' : ''}" title="${title}" ${k === 'admin' ? 'hidden' : ''}>${ICONS[k]}<span class="r-sh">${label}</span><span class="r-lg">${title}</span></a>`).join('')}</div>
      <div class="rail-group rail-bottom"><i class="sep"></i>
        <button type="button" data-theme-toggle title="Mode jour / nuit">${ICONS.moon}${ICONS.sun}<span class="r-sh">Thème</span><span class="r-lg">Mode jour / nuit</span></button>
        <a href="/profil" data-r="profil" class="${page === 'profil' ? 'on' : ''}" title="Mon profil"><i class="avatar" id="railAvatar">JA</i><span class="r-sh">Profil</span><span class="r-lg" id="railWho">Mon profil</span></a>
        <a href="/deconnexion" data-r="logout" title="Se déconnecter">${ICONS.logout}<span class="r-sh">Sortir</span><span class="r-lg">Se déconnecter</span></a></div>`;
    document.body.prepend(nav);
    document.body.classList.add('has-rail');

    /* ---------- téléphone : le rail devient un volet qui sort de la gauche ---------- */
    const veil = document.createElement('div'); veil.className = 'rail-veil'; document.body.appendChild(veil);
    railTop(nav);
    const open = () => { document.body.classList.add('drawer-open'); };
    const close = () => { document.body.classList.remove('drawer-open'); nav.style.transform = ''; };
    document.addEventListener('click', e => { if (e.target.closest('[data-drawer-open]')) { e.preventDefault(); open(); } });
    veil.onclick = close;
    nav.addEventListener('click', e => { if (e.target.closest('a')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    // glisser du bord gauche vers la droite pour ouvrir, vers la gauche pour fermer.
    // Le geste du bord gauche ouvre uniquement le menu : on bloque le « retour à la page précédente »
    // du navigateur (iPhone), qui se déclenchait en même temps.
    let sx = null, sy = 0, dx = 0, mode = '';
    const mobile = () => matchMedia('(max-width: 720px)').matches;
    document.addEventListener('touchstart', e => {
      if (!mobile() || e.target.closest('#nav')) return;
      const t = e.touches[0], isOpen = document.body.classList.contains('drawer-open');
      if (!isOpen && t.clientX < 24) { mode = 'open'; if (e.cancelable) e.preventDefault(); } else if (isOpen) mode = 'close'; else return;
      sx = t.clientX; sy = t.clientY; dx = 0;
    }, { passive: false });
    document.addEventListener('touchmove', e => {
      if (sx == null) return;
      const t = e.touches[0]; dx = t.clientX - sx;
      if (Math.abs(t.clientY - sy) > Math.abs(dx) && Math.abs(dx) < 12) return;
      const w = nav.offsetWidth;
      const x = mode === 'open' ? Math.min(0, -w + Math.max(0, dx)) : Math.min(0, dx);
      nav.style.transition = 'none'; nav.style.transform = `translateX(${x}px)`;
    }, { passive: true });
    document.addEventListener('touchend', () => {
      if (sx == null) return;
      nav.style.transition = ''; nav.style.transform = '';
      if (mode === 'open' && dx > 60) open(); else if (mode === 'close' && dx < -60) close();
      sx = null; mode = '';
    });
    fetch('/api/me').then(r => r.json()).then(d => {
      const u = d.user; if (!u) return;
      const ini = (((u.first || '').trim()[0] || '') + ((u.last || '').trim()[0] || '') || (u.guest ? 'DÉ' : (u.email || 'JA').slice(0, 2))).toUpperCase();
      const av = document.getElementById('railAvatar');
      if (u.avatar) { av.textContent = ''; av.style.backgroundImage = `url("${u.avatar}")`; av.classList.add('has-img'); }
      else av.textContent = ini;
      if (!u.guest && u.name) document.getElementById('railWho').textContent = u.name;
      nav.querySelector('[data-r="admin"]').hidden = !u.admin;
      accessBar(d.access);
    }).catch(() => {});
    // point rose sur « En cours » quand des matchs sont en jeu
    fetch('/api/tournaments').then(r => r.json()).then(d => {
      if ((d.tournaments || []).some(t => !t.closed && t.drawn && t.done < t.matches)) {
        const a = nav.querySelector('[data-r="encours"]'); const dot = document.createElement('i'); dot.className = 'live-dot'; a.appendChild(dot);
      }
    }).catch(() => {});
  }
  /* bandeau d'accès : discret pendant l'essai, bien visible quand le compte est en lecture seule */
  function accessBar(a) {
    window.PadelAccess = a;
    if (!a || (a.state !== 'trial' && a.state !== 'pass' && a.state !== 'expired' && !(a.state === 'paid' && a.grace))) return;
    const bar = document.createElement('div');
    bar.className = 'acc-bar acc-bar-' + (a.state === 'trial' || a.state === 'pass' ? 'trial' : 'stop');
    const days = `encore ${a.daysLeft} jour${a.daysLeft > 1 ? 's' : ''}`;
    const txt = a.state === 'trial'
      ? `<b>Essai gratuit</b> : ${days}${a.tournamentsLeft ? ` · ${a.tournamentsLeft} tournoi à créer` : ' · tournoi d\'essai utilisé'}`
      : a.state === 'pass' ? `<b>Pass tournoi</b> : ${days}${a.tournamentsLeft ? ` · ${a.tournamentsLeft} tournoi à créer` : ' · tournoi du pass créé'}`
      : a.state === 'expired' ? '<b>Lecture seule</b> : votre accès est terminé. Vos tournois restent consultables et exportables.'
      : '<b>Paiement en attente</b> : renouvelez votre abonnement pour garder l\'accès.';
    bar.innerHTML = `<span>${txt}</span><a class="acc-go" href="${a.shop}" target="_blank" rel="noopener">${a.state === 'trial' ? 'Voir les offres' : 'S\'abonner'}</a>`;
    const host = document.querySelector('main.page') || document.querySelector('body.editor-page main') || document.body;
    host.prepend(bar);
  }

  /* téléphone, dans un tournoi : curseur citron sous l'onglet actif. En glissant le doigt sur la barre,
     le curseur suit le doigt ; au relâcher, il se cale sur l'onglet le plus proche et l'ouvre. */
  function navCursor() {
    const nav = document.getElementById('nav');
    if (!nav || !document.body.classList.contains('editor-page')) return;
    const bar = nav.closest('.side') || nav;
    const ind = document.createElement('i'); ind.className = 'nav-ind'; nav.prepend(ind);
    // onglets visibles seulement : sur téléphone, certaines sections sont rangées dans « Plus »
    const btns = () => [...nav.querySelectorAll('button[data-tab], button[data-plus]')].filter(b => getComputedStyle(b).display !== 'none');
    const mobile = () => matchMedia('(max-width: 720px)').matches;
    const size = () => { const b = btns(), w = nav.clientWidth / b.length; ind.style.width = (w - 8) + 'px'; return w; };
    const place = i => { const w = size(); ind.style.transform = `translateX(${i * w + 4}px)`; };
    let dragging = false, last = -1, until = 0;
    // recale le carré sous l'onglet actif (jamais pendant que le doigt le déplace)
    const sync = () => { if (!mobile() || dragging) return; const i = btns().findIndex(b => b.classList.contains('on')); if (i >= 0) place(i); };
    new MutationObserver(sync).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
    addEventListener('resize', sync); sync();
    // dès que le doigt touche la barre, le carré vient sous le doigt, grossit et le suit en temps réel ;
    // au relâcher, il se cale sur l'onglet le plus proche et l'ouvre
    // la barre grossit pendant le geste : on ramène la position du doigt à l'échelle de la barre
    const xIn = clientX => { const r = nav.getBoundingClientRect(); return (clientX - r.left) * nav.clientWidth / (r.width || 1); };
    const idx = clientX => Math.max(0, Math.min(btns().length - 1, Math.floor(xIn(clientX) / size())));
    const follow = clientX => {
      const w = size(), x = Math.max(0, Math.min(nav.clientWidth - w, xIn(clientX) - w / 2));
      ind.style.transform = `translateX(${x + 4}px) scale(1.18)`;
      const i = idx(clientX);
      if (i !== last) { last = i; btns().forEach((b, k) => b.classList.toggle('hover', k === i)); if (navigator.vibrate) navigator.vibrate(6); }
    };
    const begin = clientX => { dragging = true; last = -1; nav.classList.add('dragging'); bar.classList.add('navdrag'); ind.classList.add('drag'); follow(clientX); };
    const move = clientX => { if (!dragging) return; ind.classList.add('moving'); follow(clientX); };
    const end = (clientX, open) => {
      if (!dragging) return;
      dragging = false;
      nav.classList.remove('dragging'); bar.classList.remove('navdrag'); ind.classList.remove('drag', 'moving');
      btns().forEach(b => b.classList.remove('hover'));
      if (!open || clientX == null) return sync();
      const i = idx(clientX);
      until = Date.now() + 600;   // on ignore le clic natif qui suit
      place(i); btns()[i].click();
    };
    // doigt (iPhone, Android) : événements tactiles natifs, la page ne défile pas pendant le geste
    let lastX = null;
    nav.addEventListener('touchstart', e => { if (!mobile()) return; e.preventDefault(); lastX = e.touches[0].clientX; begin(lastX); }, { passive: false });
    nav.addEventListener('touchmove', e => { if (!dragging) return; e.preventDefault(); lastX = e.touches[0].clientX; move(lastX); }, { passive: false });
    nav.addEventListener('touchend', e => { const t = e.changedTouches[0]; end(t ? t.clientX : lastX, true); });
    nav.addEventListener('touchcancel', () => end(null, false));
    // souris (ordinateur en petite fenêtre)
    nav.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || !mobile() || e.button > 0) return; try { nav.setPointerCapture(e.pointerId); } catch (err) {} begin(e.clientX); });
    nav.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') move(e.clientX); });
    nav.addEventListener('pointerup', e => { if (e.pointerType === 'mouse') end(e.clientX, true); });
    nav.addEventListener('click', e => { if (Date.now() < until && e.isTrusted) { e.stopPropagation(); e.preventDefault(); } }, true);
  }

  /* ---------- navigation sans rechargement (comme /RAM Club) ----------
     Entre les pages de l'espace juge-arbitre, on ne recharge plus tout : la page visée est lue (souvent
     dès le survol du lien), son contenu remplace l'ancien, le menu reste en place, et seuls ses propres
     scripts s'exécutent. Styles, polices et scripts communs déjà chargés ne sont plus redemandés. */
  const SOFT = new Set(['/dashboard', '/app', '/calendrier', '/joueurs', '/statistiques', '/profil', '/admin']);
  const pages = new Map();   // adresse → { at, p: Promise<{ url, html }> }
  const pathOf = src => (src || '').split('?')[0];
  const softOk = url => url.origin === location.origin && SOFT.has(url.pathname) && SOFT.has(location.pathname);
  function fetchPage(href) {
    const c = pages.get(href);
    if (c && Date.now() - c.at < 10000) return c.p;
    const p = fetch(href, { credentials: 'include', headers: { Accept: 'text/html' } }).then(r => {
      if (!r.ok) throw new Error('page ' + r.status);
      return r.text().then(html => ({ url: r.url, html }));
    });
    pages.set(href, { at: Date.now(), p }); p.catch(() => pages.delete(href));
    return p;
  }
  const loadScript = src => new Promise(ok => { const s = document.createElement('script'); s.src = src; s.onload = s.onerror = ok; document.body.appendChild(s); });
  const loaded = src => [...document.scripts].some(s => s.src && pathOf(new URL(s.src).pathname) === pathOf(src));
  let navSeq = 0;
  async function go(href, push) {
    const seq = ++navSeq;
    let page;
    try { page = await fetchPage(href); } catch (e) { location.href = href; return; }
    if (seq !== navSeq) return;   // un autre clic a eu lieu entre-temps
    const target = new URL(page.url);
    if (!SOFT.has(target.pathname)) { location.href = page.url; return; }   // redirigé (connexion expirée…)
    const doc = new DOMParser().parseFromString(page.html, 'text/html');
    if (push) history.pushState({ soft: 1 }, '', href);
    document.title = doc.title;
    // feuilles de style et scripts d'en-tête propres à la page visée (déjà chargés : ignorés)
    doc.querySelectorAll('head link[rel="stylesheet"]').forEach(l => {
      const h = pathOf(l.getAttribute('href'));
      if (![...document.querySelectorAll('link[rel="stylesheet"]')].some(x => pathOf(x.getAttribute('href')) === h)) document.head.appendChild(l.cloneNode());
    });
    const heads = [...doc.querySelectorAll('head script[src]')].map(s => s.getAttribute('src')).filter(s => !loaded(s));
    // contenu : tout sauf le menu, le voile du volet et la barre du haut du téléphone
    const nav = document.querySelector('.rail'), veil = document.querySelector('.rail-veil');
    [...document.body.children].forEach(el => { if (el !== nav && el !== veil && !el.classList.contains('mtop-rail')) el.remove(); });
    const page2 = doc.body.dataset.page || '';
    document.body.className = doc.body.className; document.body.classList.add('has-rail');
    document.body.dataset.page = page2;
    const scripts = [];
    [...doc.body.childNodes].forEach(n => {
      if (n.nodeName === 'SCRIPT') { scripts.push(n); return; }
      document.body.insertBefore(document.importNode(n, true), veil);
    });
    // barre du haut du téléphone : celle de la page si elle en a une, sinon celle du menu
    railTop(nav);
    nav.querySelectorAll('a[data-r]').forEach(a => a.classList.toggle('on', a.dataset.r === page2));
    window.scrollTo(0, 0);
    if (window.PadelAccess) accessBar(window.PadelAccess);
    for (const src of heads) await loadScript(src);
    for (const s of scripts) {
      const src = s.getAttribute('src');
      if (src) { if (!loaded(src)) await loadScript(src); continue; }
      if (s.type && s.type !== 'text/javascript' && s.type !== 'module') continue;
      const n = document.createElement('script'); n.textContent = s.textContent; document.body.appendChild(n);
    }
  }
  /* tournoi en cours : en quittant par le menu, le sous-menu du tournoi repart en glissant avant de changer de page */
  function sideOut() {
    if (!document.body.classList.contains('editor-page')) return;
    document.addEventListener('click', e => {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest('.rail a[href^="/"]');
      if (!a || !matchMedia('(min-width: 721px) and (prefers-reduced-motion: no-preference)').matches) return;
      e.preventDefault(); document.body.classList.add('side-out');
      setTimeout(() => { location.href = a.href; }, 200);
    });
    // retour arrière vers le tournoi (page gardée en mémoire par le navigateur) : le sous-menu réapparaît
    addEventListener('pageshow', e => { if (e.persisted) document.body.classList.remove('side-out'); });
  }
  function softNav() {
    document.addEventListener('click', e => {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (!softOk(url) || url.hash && url.pathname === location.pathname) return;
      e.preventDefault();
      if (url.href !== location.href) go(url.href, true);
    });
    // retour / avance du navigateur entre deux pages de l'espace
    addEventListener('popstate', () => { if (SOFT.has(location.pathname)) go(location.href, false); else location.reload(); });
    history.replaceState({ soft: 1 }, '');
    // la page visée est lue dès le survol ou le toucher du lien : au clic, elle s'affiche aussitôt
    const warm = e => { const a = e.target.closest && e.target.closest('a[href^="/"]'); if (!a) return; const url = new URL(a.href, location.href); if (softOk(url) && url.href !== location.href) fetchPage(url.href).catch(() => {}); };
    document.addEventListener('pointerover', warm, { passive: true }); document.addEventListener('touchstart', warm, { passive: true });
  }
  /* ---------- liste déroulante sous les champs de noms (clubs, juges-arbitres, joueurs, adhérents) ----------
     Règles : { match(champ), source(texte, champ) → [{ v, l, d }], pick(champ, élément), filtre } ; les pages en ajoutent
     avec RamSugg.add(règle), ou avant le chargement du menu : (window.RamSuggQ = window.RamSuggQ || []).push(règle). */
  function suggestions() {
    const rules = [], fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const q = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let box = null, cur = null, items = [], act = -1, seq = 0, timer = null, skip = false;
    const css = document.createElement('style');
    css.textContent = '.rsug{position:absolute;z-index:60;box-sizing:border-box;max-height:280px;overflow-y:auto;background:var(--ui-surface,#fff);color:var(--ui-text,#111);border:2px solid var(--ui-accent-line,#E0284A);border-radius:0;box-shadow:4px 4px 0 var(--ui-hard,rgba(0,0,0,.3));padding:0}.rsug button{display:flex;flex-direction:column;align-items:flex-start;width:100%;text-align:left;border:0;border-top:1px solid var(--ui-border,rgba(0,0,0,.1));background:transparent;color:inherit;font:inherit;text-transform:none;letter-spacing:normal;padding:8px 10px;border-radius:0;box-shadow:none;cursor:pointer;min-height:44px;justify-content:center}.rsug button:first-child{border-top:0}.rsug button b{font-weight:700}.rsug button small{font-size:12px;opacity:.7}.rsug button[aria-selected="true"],.rsug button:hover{background:var(--ui-surface-2,#f2f2f2)}.rsug button.pp{flex-direction:row;align-items:center;justify-content:flex-start;gap:10px}.rsug .pp-t{display:flex;flex-direction:column;min-width:0}.rsug .pp-t small{overflow-wrap:anywhere}.rsug .pp-a{flex:0 0 34px;width:34px;height:34px;border-radius:50%;background:var(--ui-surface-2,#eee) center/cover no-repeat;display:grid;place-items:center;font-size:12px;font-weight:800}';
    document.head.appendChild(css);
    const rule = el => el && el.tagName === 'INPUT' && rules.find(r => { try { return r.match(el); } catch (e) { return false; } });
    const close = () => { if (box) box.hidden = true; items = []; act = -1; };
    // rangée dans le bloc du champ, accrochée sous lui : elle suit le champ (défilement, clavier du téléphone)
    function place() {
      const hote = cur.parentElement;
      if (getComputedStyle(hote).position === 'static') hote.style.position = 'relative';
      if (box.parentElement !== hote) hote.appendChild(box);
      // règle commune aux trois applis : la liste prend la largeur exacte et le style de la boîte d'où elle part
      const cs = getComputedStyle(cur);
      Object.assign(box.style, { left: cur.offsetLeft + 'px', top: cur.offsetTop + cur.offsetHeight + 'px', width: cur.offsetWidth + 'px', borderRadius: cs.borderRadius, fontFamily: cs.fontFamily, fontSize: cs.fontSize, borderWidth: cs.borderTopWidth, borderColor: cs.borderTopColor, borderStyle: cs.borderTopStyle });
    }
    function draw() {
      if (!box) {
        box = document.createElement('div'); box.className = 'rsug'; box.setAttribute('role', 'listbox'); document.body.appendChild(box);
        box.addEventListener('pointerdown', e => { e.preventDefault(); const b = e.target.closest('[data-i]'); if (b) pick(+b.dataset.i); });
      }
      // une personne (adhérent, joueur) : sa photo, ou ses initiales, et son e-mail s'il le partage
      const pp = it => it.pp ? `<span class="pp-a" aria-hidden="true"${it.ph && /^(https?:\/\/|\/)[^"'()\s]+$/.test(it.ph) ? ` style="background-image:url('${q(it.ph)}')"` : ''}>${it.ph ? '' : q(String(it.v || '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</span>` : '';
      box.innerHTML = items.map((it, i) => `<button type="button" role="option" data-i="${i}" aria-selected="${i === act}"${it.pp ? ' class="pp"' : ''}>${pp(it)}<span class="pp-t"><b>${q(it.v)}</b>${it.ml ? `<small>${q(it.ml)}</small>` : ''}${it.l ? `<small>${q(it.l)}</small>` : ''}</span></button>`).join('');
      box.hidden = !items.length || !cur;
      if (!box.hidden) place();
    }
    async function update(el) {
      const r = rule(el); if (!r) return;
      cur = el; el.setAttribute('autocomplete', 'off'); el.removeAttribute('list');
      const t = el.value.trim(), my = ++seq;
      let l = await Promise.resolve(r.source(t, el)).catch(() => []);
      if (my !== seq || cur !== el || document.activeElement !== el) return;
      if (r.filtre !== false && t) l = l.filter(x => fold(x.v).includes(fold(t)) || fold(x.l).includes(fold(t)));
      // deux homonymes restent deux propositions : on dédoublonne par personne (id), pas par nom
      const vus = new Set(), cle = x => x.id || fold(x.v) + '|' + fold(x.l);
      l = l.filter(x => x && x.v && !vus.has(cle(x)) && vus.add(cle(x)));
      if (l.length === 1 && el._sugg && cle(el._sugg) === cle(l[0])) l = [];
      items = l.slice(0, 8); act = -1; draw();
    }
    function pick(i) {
      const it = items[i], el = cur, r = rule(el); if (!it || !el) return;
      skip = true; el.value = it.v; el._sugg = it;
      ['input', 'change'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true })));
      skip = false;
      if (r && r.pick) r.pick(el, it);
      close();
    }
    document.addEventListener('focusin', e => { if (rule(e.target)) update(e.target); });
    document.addEventListener('input', e => { if (skip || !rule(e.target)) return; delete e.target._sugg; clearTimeout(timer); timer = setTimeout(() => update(e.target), 160); });
    document.addEventListener('keydown', e => {
      if (!box || box.hidden || e.target !== cur) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); act = (act + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; draw(); }
      else if (e.key === 'Enter' && act >= 0) { e.preventDefault(); pick(act); }
      else if (e.key === 'Escape') close();
    });
    document.addEventListener('focusout', e => { if (e.target === cur) setTimeout(() => { if (document.activeElement !== cur) { close(); cur = null; } }, 150); });
    addEventListener('resize', () => { if (box && !box.hidden && cur) place(); });
    window.RamSugg = { add: r => rules.push(r), fold };
    (window.RamSuggQ || []).forEach(r => rules.push(r));
    window.RamSuggQ = { push: r => rules.push(r) };
  }
  /* annuaire des clubs commun à /RAM JA et /RAM Club : proposé dans les champs « Club »
     (tournoi, paires, profil, adversaire d'une rencontre), clubs /RAM Club en premier */
  function clubList() {
    let annuaire = null;
    const charger = () => (annuaire = annuaire || fetch('/api/clubs-directory').then(r => r.json()).then(d => (d.clubs || []).map(c => ({ v: c.name, l: [c.city, c.ramClub ? '/RAM Club' : c.tournaments ? c.tournaments + ' tournoi' + (c.tournaments > 1 ? 's' : '') : ''].filter(Boolean).join(' · ') }))).catch(() => { annuaire = null; return []; }));
    window.RamSugg.add({ match: el => el.matches('input[data-f="club"], input[name="k1"], input[name="k2"], input[name="club"], input[data-clubs]'), source: () => charger() });
  }
  /* juges-arbitres /RAM JA proposés dans le champ « Juge-arbitre » (tournoi, préférences) ;
     en choisir un remplit aussi « Qualification JA » (son titre padel en priorité) */
  function jaList() {
    window.RamSugg.add({
      match: el => el.matches('input[data-f="ja"], input[data-p="ja"]'),
      filtre: false,
      source: t => fetch('/api/referees?q=' + encodeURIComponent(t || '')).then(r => r.json()).then(d => (d.referees || []).map(r => ({ id: 'ja:' + (r.id || r.userId || [r.first, r.last, r.club].join('|')), v: [r.first, r.last].filter(Boolean).join(' '), l: [r.titles.join(' · '), r.sameClub ? 'mon club' : r.club].filter(Boolean).join(' — '), d: r }))),
      // en choisir un remplit aussi « Qualification JA » (son titre padel en priorité)
      pick: (el, it) => {
        const r = it.d, title = r && (r.titles.find(x => /^JAP/.test(x)) || r.titles[0]); if (!title) return;
        const key = el.dataset.f ? 'data-f' : 'data-p';
        const box = el.closest('.form, .form2, form') || document, num = box.querySelector(`[${key}="jaNumber"]`);
        if (!num || num.value === title) return;
        num.value = title;
        ['input', 'change'].forEach(t => num.dispatchEvent(new Event(t, { bubbles: true })));
      }
    });
    // joueurs de la base /RAM JA (et adhérents /RAM Club) : champs marqués data-joueurs
    window.RamSugg.add({
      match: el => el.hasAttribute('data-joueurs'),
      filtre: false,
      source: t => (t.length < 2 ? [] : fetch('/api/players?q=' + encodeURIComponent(t)).then(r => r.json()).then(d => (d.players || []).map(p => ({ id: 'p:' + p.id, v: [p.first, p.last].filter(Boolean).join(' '), l: [p.club, p.rank, p.licence ? 'lic. ' + p.licence : ''].filter(Boolean).join(' · '), d: p, pp: 1, ph: p.photo, ml: p.mail }))))
    });
  }
  const start = () => { build(); suggestions(); clubList(); jaList(); navCursor(); softNav(); sideOut(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
