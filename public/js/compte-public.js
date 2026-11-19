/* /RAM — compte sur les pages publiques de réservation et d'inscription (reserver.html, inscrire.html).
   Une seule brique, partagée : le bouton « Me connecter » (ou l'étiquette « Vous êtes connecté ») dans l'en-tête, et la feuille qui s'ouvre au toucher :
   e-mail et mot de passe du compte /RAM commun, ou lien reçu par e-mail ; confirmation de l'adresse (le seul moyen d'accéder à ses fiches) ;
   ouverture du lien de confirmation (?v=…). La réservation sans compte reste toujours possible : rien ici n'est obligatoire.
   Les pages donnent : moiUrl() (qui renvoie l'état du compte), corps() (c, k ou c, p, t pour les e-mails), chemin(), onChange(). */
(function () {
  'use strict';
  var cfg = null, S = { moi: null, ouvert: false, menu: false, em: '', msg: '', err: '', conf: '', verif: null, info: '', occupe: false };
  var e = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ic = function (n, s) { return '<svg class="ic" width="' + s + '" height="' + s + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; };
  var post = function (url, b) { return fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Action impossible'); return d; }); }); };
  var initiales = function (n) { return String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (x) { return x[0]; }).join('').toUpperCase() || '·'; };

  var css = document.createElement('style');
  css.textContent =
    '.cp{position:relative;display:flex;align-items:center;gap:10px;margin-left:auto;flex:none;min-width:0}' +
    '.cp-q{display:none;color:var(--c-muted);font-size:13px;text-align:right;line-height:1.2}' +
    '.cp-av{display:grid;place-items:center;flex:none;width:44px;height:44px;padding:0;background:var(--c-lime);color:var(--c-dark);border:var(--bw) solid var(--c-ink);font:400 16px/1 var(--f-display);overflow:hidden;box-shadow:var(--sh-sm);cursor:pointer}' +
    '.cp-av img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.cp-who{display:none;flex-direction:column;min-width:0;text-align:right;line-height:1.2}' +
    '.cp-l{color:var(--c-muted);font-size:12px;letter-spacing:.04em}' +
    '.cp-n{font:700 17px/1.15 var(--f-label);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px}' +
    '.cp-out{display:none}' +
    '.cp-b .cp-t{display:none}' +
    '.cp .cp-b.r-btn{min-width:44px;min-height:44px;padding:8px 10px}' +
    '.cp-menu{position:absolute;right:0;top:calc(100% + 8px);z-index:20;width:min(280px,calc(100vw - 20px));background:var(--c-surface);border:var(--bw) solid var(--c-ink);box-shadow:var(--sh);padding:14px;display:flex;flex-direction:column;gap:10px}' +
    '.cp-menu[hidden]{display:none}' +
    '.cp-menu b{font:700 18px/1.15 var(--f-label);overflow-wrap:anywhere}' +
    '.cp-menu small{color:var(--c-muted);font-size:13px}' +
    '.cp-voile{position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;padding:0}' +
    '.cp-voile[hidden]{display:none}' +
    '.cp-feuille{width:100%;max-width:480px;max-height:92vh;overflow:auto;background:var(--c-surface);color:var(--c-text);border:var(--bw) solid var(--c-ink);border-bottom:0;box-shadow:var(--sh);padding:var(--s5)}' +
    '.cp-feuille .r-card__head{flex-wrap:nowrap}.cp-feuille .r-card__head .acts{display:flex;flex:0 0 auto;margin-left:auto}' +
    '.cp-feuille .fm{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}' +
    '.cp-feuille .dg{margin-top:6px;color:var(--c-muted);font-size:13px}' +
    '.cp-feuille .info{padding:8px 12px;border:var(--bw) solid var(--c-ink);background:var(--c-surface-2);font-size:13px}' +
    '.cp-feuille .err{color:var(--c-pink);font-weight:600}.cp-feuille .err:empty{display:none}' +
    '.cp-note{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 12px;border:var(--bw) solid var(--c-ink);background:var(--c-surface);box-shadow:var(--sh-sm);font-size:14px}' +
    '@media (min-width:520px){.cp-b .cp-t{display:inline}.cp-q{display:block}.cp-voile{align-items:center;padding:16px}.cp-feuille{border-bottom:var(--bw) solid var(--c-ink)}}' +
    '@media (min-width:900px){.cp-who{display:flex}.cp-out{display:inline-flex}.cp-n{font-size:18px}}';
  document.head.appendChild(css);

  function charge() {
    if (!cfg) return Promise.resolve();
    return fetch(cfg.moiUrl(), { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) {
      S.moi = d && d.connecte ? d : null;
      if (cfg.onMoi) cfg.onMoi(S.moi);
      majEntete();
      if (cfg.onChange) cfg.onChange();
    }).catch(function () {});
  }
  function majEntete() {
    var h = document.getElementById('cp-zone');
    if (h) h.innerHTML = entete();
  }
  /* le bouton ou l'étiquette de l'en-tête (zone #cp-zone dans le bandeau) */
  function entete() {
    var m = S.moi;
    if (!m) return '<div class="cp"><span class="cp-q">Vous êtes déjà élève ?</span><button type="button" class="r-btn r-btn--sm cp-b" data-cp="ouvre" aria-label="Me connecter">' + ic('user', 18) + '<span class="cp-t">Me connecter</span></button></div>';
    var av = m.avatar ? '<img src="/api/public/resa/avatar?v=' + encodeURIComponent(m.nom || '') + '" alt="" data-i="' + e(initiales(m.nom)) + '">' : e(initiales(m.nom));
    return '<div class="cp"><div class="cp-who"><span class="cp-l">Vous êtes connecté</span><b class="cp-n">' + e(m.nom || m.email) + '</b></div><button type="button" class="r-btn r-btn--sec r-btn--sm cp-out" data-cp="sortir">Se déconnecter</button>' +
      '<button type="button" class="cp-av" data-cp="menu" aria-label="Mon compte" aria-expanded="' + S.menu + '">' + av + '</button>' +
      '<div class="cp-menu" role="menu"' + (S.menu ? '' : ' hidden') + '><small>Vous êtes connecté</small><b>' + e(m.nom || m.email) + '</b><small>' + e(m.email) + '</small>' +
      (m.verifie === false ? '<button type="button" class="r-btn r-btn--sm" data-cp="ouvre">' + ic('mail', 16) + 'Confirmer mon adresse</button>' : '') +
      '<button type="button" class="r-btn r-btn--sec r-btn--sm" data-cp="sortir">' + ic('x', 16) + 'Se déconnecter</button></div></div>';
  }
  /* une ligne sous l'en-tête quand le compte est connecté mais l'adresse pas encore prouvée */
  function note() {
    var m = S.moi;
    var info = S.info ? '<p class="cp-note" role="status">' + e(S.info) + '</p>' : '';
    if (m && m.verifie === false) return info + '<div class="cp-note" role="status"><span>Ton adresse n’est pas encore confirmée : confirme-la pour retrouver tes cours. Tu peux aussi réserver sans te connecter.</span><button type="button" class="r-btn r-btn--sm" data-cp="ouvre">' + ic('mail', 16) + 'Confirmer</button></div>';
    return info;
  }

  /* ---------- la feuille ---------- */
  function voile() {
    var v = document.getElementById('cp-voile');
    if (!v) { v = document.createElement('div'); v.id = 'cp-voile'; v.className = 'cp-voile'; v.hidden = true; document.body.appendChild(v); }
    return v;
  }
  function entete2(t) { return '<div class="r-card__head">' + ic('user', 20) + '<b>' + e(t) + '</b><span class="acts"><button type="button" class="r-btn r-btn--sec r-btn--sm" data-cp="ferme" aria-label="Fermer">' + ic('x', 16) + 'Fermer</button></span></div>'; }
  function feuille() {
    var m = S.moi, v = S.verif, c;
    if (v && (v.etat === 'besoin' || v.etat === 'erreur')) {
      c = v.etat === 'erreur'
        ? entete2('Confirmation de l’adresse') + '<p class="err" role="alert">' + e(v.err) + '</p><p class="dg">Connecte-toi puis demande un nouveau lien de confirmation.</p>'
        : '<form id="cp-fv" novalidate>' + entete2('Confirme ton adresse') + '<p style="margin-bottom:12px">Pour protéger ton compte, prouve que c’est bien toi.</p><div class="fm">' +
          '<div class="r-field"><label for="cp-vp">Mon mot de passe actuel</label><input class="r-input" id="cp-vp" type="password" autocomplete="current-password"></div>' +
          '<button class="r-btn r-btn--full" type="submit">' + ic('check', 18) + 'Confirmer avec mon mot de passe</button>' +
          '<p class="dg" style="margin:0">Pas de mot de passe, ou tu ne le connais pas ? Choisis-en un nouveau : les autres appareils connectés à ce compte seront déconnectés.</p>' +
          '<div class="r-field"><label for="cp-vn">Nouveau mot de passe (8 caractères au moins)</label><input class="r-input" id="cp-vn" type="password" autocomplete="new-password"></div>' +
          '<button class="r-btn r-btn--sec r-btn--full" type="button" data-cp="nouveau">' + ic('edit', 18) + 'Choisir ce mot de passe et confirmer</button><p class="err" id="cp-verr" role="alert">' + e(v.err) + '</p></div></form>';
    } else if (m && m.verifie === false) {
      c = entete2('Confirme ton adresse') + '<p class="dg" style="margin:0 0 6px">' + e(m.email) + '</p><p>Ton adresse n’est pas encore confirmée : confirme-la pour retrouver tes fiches et réserver depuis ton compte. Tu peux aussi réserver sans te connecter.</p>' +
        '<p style="margin-top:12px"><button type="button" class="r-btn r-btn--full" data-cp="confirmation">' + ic('mail', 18) + 'Recevoir le lien de confirmation</button></p>' +
        (S.conf ? '<p class="info" role="status" style="margin-top:10px">' + e(S.conf) + '</p>' : '') + (S.err ? '<p class="err" role="alert">' + e(S.err) + '</p>' : '') +
        '<p style="margin-top:12px"><button type="button" class="r-btn r-btn--sec r-btn--full" data-cp="sortir">' + ic('x', 18) + 'Se déconnecter</button></p>';
    } else if (m) {
      c = entete2('Connecté') + '<p><b>' + e(m.nom || m.email) + '</b></p><p class="dg">' + e(m.email) + '</p><p style="margin-top:12px"><button type="button" class="r-btn r-btn--sec r-btn--full" data-cp="sortir">' + ic('x', 18) + 'Se déconnecter</button></p>';
    } else {
      c = '<form id="cp-fa" novalidate>' + entete2('Vous êtes déjà élève ?') + '<p class="dg" style="margin:0 0 12px">Connecte-toi pour retrouver tes cours. Tu peux aussi réserver sans te connecter : rien n’est obligatoire.</p><div class="fm">' +
        '<div class="r-field"><label for="cp-ae">E-mail</label><input class="r-input" id="cp-ae" type="email" autocomplete="email" required value="' + e(S.em) + '"></div>' +
        '<div class="r-field"><label for="cp-ap">Mot de passe</label><input class="r-input" id="cp-ap" type="password" autocomplete="current-password"></div>' +
        '<button class="r-btn r-btn--full" type="submit">' + ic('chev', 18) + 'Me connecter</button><p class="err" id="cp-aerr" role="alert">' + e(S.err) + '</p>' +
        '<div><p class="dg" style="margin:0 0 8px">Premier accès, ou mot de passe oublié ? Un lien à usage unique te permet de choisir ton mot de passe, le même pour toutes les applis /RAM.</p><button type="button" class="r-btn r-btn--sec r-btn--full" data-cp="lien">' + ic('mail', 18) + 'Recevoir un lien par e-mail</button>' + (S.msg ? '<p class="info" role="status" style="margin-top:10px">' + e(S.msg) + '</p>' : '') + '</div></div></form>';
    }
    return '<div class="cp-feuille r-card" role="dialog" aria-modal="true" aria-label="Compte">' + c + '</div>';
  }
  function rend() {
    var v = voile();
    v.hidden = !S.ouvert;
    if (S.ouvert) {
      v.innerHTML = feuille();
      var ae = document.getElementById('cp-ae'), ap = document.getElementById('cp-ap');
      if (ae) ae.oninput = function () { S.em = ae.value; };
      var fa = document.getElementById('cp-fa');
      if (fa) fa.onsubmit = function (x) {
        x.preventDefault(); S.em = ae.value; S.err = '';
        post('/api/auth/login', { email: ae.value, password: ap.value }).then(function () { S.err = ''; S.msg = ''; S.ouvert = false; rend(); charge(); }).catch(function (z) { S.err = z.message; rend(); });
      };
      var fv = document.getElementById('cp-fv');
      if (fv) fv.onsubmit = function (x) { x.preventDefault(); confirmer({ password: document.getElementById('cp-vp').value }); };
      var focus = v.querySelector('input'); if (focus && !matchMedia('(pointer:coarse)').matches) focus.focus();
    }
    majEntete();
  }
  function ouvre() { S.ouvert = true; S.menu = false; S.err = ''; rend(); }
  function ferme() { S.ouvert = false; rend(); }

  /* le lien de confirmation (?v=…) : session ouverte sur ce compte → confirmé ; sinon la feuille demande le mot de passe ou un nouveau */
  function confirmer(body) {
    S.verif.etat = 'envoi';
    post('/api/public/resa/confirmer', Object.assign({ t: S.verif.t }, body)).then(function (r) {
      if (r.besoin) { S.verif.etat = 'besoin'; S.verif.err = r.faux ? 'Mot de passe incorrect.' : ''; S.ouvert = true; rend(); return; }
      S.verif = null; S.info = 'Adresse confirmée : tes fiches sont disponibles.'; S.ouvert = false;
      try { history.replaceState(null, '', location.pathname); } catch (x) { /* rien */ }
      rend(); charge();
    }).catch(function (z) { S.verif.etat = 'erreur'; S.verif.err = z.message; S.ouvert = true; rend(); });
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-cp]');
    if (!b) { if (S.menu && !(ev.target.closest && ev.target.closest('.cp'))) { S.menu = false; majEntete(); } if (ev.target.id === 'cp-voile') ferme(); return; }
    var a = b.dataset.cp;
    if (a === 'ouvre') ouvre();
    else if (a === 'ferme') ferme();
    else if (a === 'menu') { S.menu = !S.menu; majEntete(); }
    else if (a === 'sortir') post('/api/auth/logout', {}).catch(function () {}).then(function () { S.moi = null; S.menu = false; S.ouvert = false; S.info = ''; rend(); if (cfg.onMoi) cfg.onMoi(null); if (cfg.onChange) cfg.onChange(); });
    else if (a === 'nouveau') confirmer({ nouveau: document.getElementById('cp-vn').value });
    else if (a === 'lien') {
      S.em = document.getElementById('cp-ae').value; S.err = ''; S.msg = '';
      post('/api/public/resa/acces', Object.assign({ email: S.em, chemin: cfg.chemin() }, cfg.corps())).then(function () { S.msg = 'Si cette adresse est connue, un e-mail vient de partir. Pense à regarder dans les indésirables.'; rend(); }).catch(function (z) { S.err = z.message; rend(); });
    } else if (a === 'confirmation') {
      S.err = ''; S.conf = '';
      post('/api/public/resa/confirmation', Object.assign({ chemin: cfg.chemin() }, cfg.corps())).then(function () { S.conf = 'Un e-mail de confirmation vient de partir à ' + S.moi.email + '. Pense à regarder dans les indésirables.'; rend(); }).catch(function (z) { S.err = z.message; rend(); });
    }
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && (S.ouvert || S.menu)) { S.ouvert = false; S.menu = false; rend(); } });
  /* photo illisible : retour aux initiales */
  document.addEventListener('error', function (ev) {
    var i = ev.target;
    if (i && i.tagName === 'IMG' && i.closest && i.closest('.cp-av')) i.replaceWith(document.createTextNode(i.dataset.i || ''));
  }, true);

  window.ComptePublic = {
    init: function (o) {
      cfg = o;
      var v = new URLSearchParams(location.search).get('v');
      if (v) S.verif = { t: v, etat: 'essai', err: '' };
      return charge().then(function () { if (S.verif && S.verif.etat === 'essai') confirmer({}); });
    },
    moi: function () { return S.moi; },
    entete: entete,
    note: note,
    recharge: charge
  };
})();
