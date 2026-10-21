/* ---------- Compte /RAM : un seul compte pour RAM Club et Padel JA ----------
   Servie par le serveur Padel JA (club.riseandmove.fr), l'appli lit la session /RAM commune
   et l'affiche en haut du profil. Sur l'adresse de démonstration (GitHub Pages), il n'y a pas de
   serveur : le bloc reste caché et l'appli fonctionne avec ses données d'exemple. */
(function () {
  const JA = 'https://ja.riseandmove.fr';
  let me; // undefined : pas encore demandé ; null : pas de serveur ou pas connecté
  const onClubHost = /^club\./.test(location.hostname);
  const base = onClubHost ? '' : location.pathname.startsWith('/club') ? '' : null;   // null : démo sans serveur
  const here = () => location.href.split('#')[0];
  // connexion sur Padel JA (même compte), puis retour ici
  const loginUrl = () => (onClubHost ? JA : '') + '/connexion?retour=' + encodeURIComponent(onClubHost ? here() : location.pathname);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  async function load() {
    if (base === null) { me = null; return; }
    try {
      const r = await fetch('/api/me', { credentials: 'include' });
      const d = r.ok ? await r.json() : {};
      me = d.user && !d.user.guest ? d.user : null;
    } catch (e) { me = null; }
  }
  function fill() {
    const el = document.getElementById('ramAccount');
    if (!el || el.dataset.done || me === undefined || base === null) return;
    el.dataset.done = '1';
    el.hidden = false;
    el.innerHTML = me
      ? `<img src="${typeof ramLogo === 'function' ? ramLogo() : 'img/ram-club-blanc.png'}" alt="/RAM Club" class="ram-acc-logo">
         <div class="grow"><b>Compte /RAM</b><span>${esc([me.first, me.last].filter(Boolean).join(' ') || me.name || me.email)} · ${esc(me.email || '')}</span><small>Le même compte que Padel JA.</small></div>
         <a class="btn sm ghost" href="${onClubHost ? JA : ''}/deconnexion">Se déconnecter</a>`
      : `<img src="${typeof ramLogo === 'function' ? ramLogo() : 'img/ram-club-blanc.png'}" alt="/RAM Club" class="ram-acc-logo">
         <div class="grow"><b>Compte /RAM</b><span>Connecte-toi avec ton compte /RAM : le même que pour Padel JA.</span></div>
         <a class="btn sm" href="${loginUrl()}">Se connecter</a>`;
  }
  load().then(fill);
  new MutationObserver(fill).observe(document.getElementById('main'), { childList: true, subtree: true });
})();
