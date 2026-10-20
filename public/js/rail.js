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
    ['admin', '/admin', 'Admin', 'Administration']
  ];
  function build() {
    const page = document.body.dataset.page || '';
    const nav = document.createElement('aside');
    nav.className = 'rail'; nav.setAttribute('role', 'navigation'); nav.setAttribute('aria-label', 'Navigation principale');
    nav.innerHTML = `<a class="rail-logo" href="/dashboard" title="Padel JA — tableau de bord"><img src="/img/ram-logo-rouge-blanc.png" alt="/RAM"></a>
      <div class="rail-group">${ITEMS.map(([k, href, label, title]) =>
        `<a href="${href}" data-r="${k}" class="${page === k ? 'on' : ''}" title="${title}" ${k === 'admin' ? 'hidden' : ''}>${ICONS[k]}<span>${label}</span></a>`).join('')}</div>
      <div class="rail-group rail-bottom"><i class="sep"></i>
        <button type="button" data-theme-toggle title="Mode jour / nuit">${ICONS.moon}${ICONS.sun}<span>Thème</span></button>
        <a href="/profil" data-r="profil" class="${page === 'profil' ? 'on' : ''}" title="Mon profil"><i class="avatar" id="railAvatar">JA</i><span>Profil</span></a>
        <a href="/deconnexion" data-r="logout" title="Se déconnecter">${ICONS.logout}<span>Sortir</span></a></div>`;
    document.body.prepend(nav);
    document.body.classList.add('has-rail');
    fetch('/api/me').then(r => r.json()).then(d => {
      const u = d.user; if (!u) return;
      const n = (u.name || u.email || (u.guest ? 'Démo' : 'JA')).trim();
      const ini = n.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'JA';
      document.getElementById('railAvatar').textContent = ini;
      nav.querySelector('[data-r="admin"]').hidden = !u.admin;
    }).catch(() => {});
    // point rose sur « En cours » quand des matchs sont en jeu
    fetch('/api/tournaments').then(r => r.json()).then(d => {
      if ((d.tournaments || []).some(t => !t.closed && t.drawn && t.done < t.matches)) {
        const a = nav.querySelector('[data-r="encours"]'); const dot = document.createElement('i'); dot.className = 'live-dot'; a.appendChild(dot);
      }
    }).catch(() => {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
