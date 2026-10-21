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
    ['stats', '/statistiques', 'Stats', 'Statistiques'],
    ['admin', '/admin', 'Admin', 'Administration']
  ];
  function build() {
    const page = document.body.dataset.page || '';
    const nav = document.createElement('aside');
    nav.className = 'rail'; nav.setAttribute('role', 'navigation'); nav.setAttribute('aria-label', 'Navigation principale');
    nav.innerHTML = `<a class="rail-logo" href="/dashboard" title="Padel JA — tableau de bord"><img src="/img/ja-ram-rouge-blanc.png" alt="/RAM JA"></a>
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
    if (!document.querySelector('[data-drawer-open]')) {   // pages sans barre d'application : on en ajoute une
      const top = document.createElement('header'); top.className = 'mtop';
      top.innerHTML = `<button type="button" class="mtop-btn" data-drawer-open aria-label="Ouvrir le menu"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h12"/></svg></button>
        <a class="mtop-logo" href="/dashboard"><img class="lg-n" src="/img/ja-ram-rouge-blanc.png" alt="/RAM JA"><img class="lg-j" src="/img/ja-ram-rouge-noir.png" alt="/RAM JA"></a><span class="mtop-sp"></span>`;
      nav.after(top);
    }
    const open = () => { document.body.classList.add('drawer-open'); };
    const close = () => { document.body.classList.remove('drawer-open'); nav.style.transform = ''; };
    document.addEventListener('click', e => { if (e.target.closest('[data-drawer-open]')) { e.preventDefault(); open(); } });
    veil.onclick = close;
    nav.addEventListener('click', e => { if (e.target.closest('a')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    // glisser du bord gauche vers la droite pour ouvrir, vers la gauche pour fermer
    let sx = null, sy = 0, dx = 0, mode = '';
    const mobile = () => matchMedia('(max-width: 720px)').matches;
    document.addEventListener('touchstart', e => {
      if (!mobile() || e.target.closest('#nav')) return;
      const t = e.touches[0], isOpen = document.body.classList.contains('drawer-open');
      if (!isOpen && t.clientX < 24) mode = 'open'; else if (isOpen) mode = 'close'; else return;
      sx = t.clientX; sy = t.clientY; dx = 0;
    }, { passive: true });
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
    if (!a || (a.state !== 'trial' && a.state !== 'expired' && !(a.state === 'paid' && a.grace))) return;
    const bar = document.createElement('div');
    bar.className = 'acc-bar acc-bar-' + (a.state === 'trial' ? 'trial' : 'stop');
    const txt = a.state === 'trial'
      ? `<b>Essai gratuit</b> : encore ${a.daysLeft} jour${a.daysLeft > 1 ? 's' : ''}${a.tournamentsLeft ? ` · ${a.tournamentsLeft} tournoi à créer` : ' · tournoi d\'essai utilisé'}`
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
    const btns = () => [...nav.querySelectorAll('button[data-tab]')];
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { build(); navCursor(); }); else { build(); navCursor(); }
})();
