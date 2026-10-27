/* /RAM Club — app/8-demarrage.js : Démo animée, barre d'onglets, démarrage, push, installation, fonds, gestes, version ordinateur.
   Morceau de l'ancien app.js : les fichiers app/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
/* ---------- la démo vit : le direct avance, des messages arrivent ---------- */
setInterval(() => {
  if (S.scoring || window.RAM_KEY) return;
  const r = recs.find(r => r.sim && r.st === 'live');
  if (!r) return;
  const lives = r.ms.map((m, i) => (m.st === 'live' ? i : -1)).filter(i => i >= 0),
    v = view(),
    here = () => ['home', 'recs'].includes(v.v) || (v.v === 'rec' && v.id === r.id);
  if (!lives.length) {
    if (r.ms.every(x => x.st === 'done')) endRec(r);
    else {
      const n = r.ms.find(x => x.st === 'soon');
      n.st = 'live';
      n.sets = [[0, 0]];
      liveStart(r, n);
    }
    liveRefresh(r);
    return;
  }
  addGame(r, lives[Math.floor(Math.random() * lives.length)], Math.random() < 0.58 ? 0 : 1);
  liveRefresh(r);
  S.flash = null;
}, 6500);
let simN = 0;
setInterval(() => {
  if (simN >= 8 || window.RAM_KEY) return;
  const v = view(),
    pool = chans.filter(c => !c.ro && chanOk(c) && !(v.v === 'chan' && v.id === c.id)),
    who2 = adults().filter(x => x !== 'me' && !S.blocked.has(x));
  if (!pool.length || !who2.length) return;
  const c = pool[Math.floor(Math.random() * pool.length)],
    by = who2[Math.floor(Math.random() * who2.length)];
  simN++;
  c.msgs.push({ by, x: CANNED[simN % CANNED.length], t: 'Maintenant' });
  c.un++;
  if (!c.mute) notify('chan', by, `a écrit dans ${c.name}`, { v: 'chan', id: c.id });
  if (['home', 'chans'].includes(v.v) && !$('sheet')) render(true);
}, 24000);

/* Le bandeau du haut se retire quand on fait défiler vers le bas, revient quand on remonte */
/* Il faut remonter d'au moins 160 px (ou revenir tout en haut) pour le faire revenir : le rebond en bas de page ne le rappelle plus */
/* Le bandeau flotte au-dessus de la page : il glisse sans changer la taille de la zone qui défile, donc le défilement reste collé au doigt */
var lastY = 0,
  turnY = 0;
function topPad() {
  const t = $('top'),
    m = $('main');
  m.style.paddingTop = t.offsetHeight + 'px';
  m.style.setProperty(
    '--segt',
    t.classList.contains('hide') ? 'calc(env(safe-area-inset-top,0px) - ' + t.offsetHeight + 'px)' : '0px'
  );
}
$('main').addEventListener(
  'scroll',
  () => {
    const m = $('main'),
      max = m.scrollHeight - m.clientHeight,
      y = Math.min(Math.max(m.scrollTop, 0), max),
      t = $('top'),
      hid = t.classList.contains('hide');
    if (y > lastY) {
      turnY = y;
      if (y > 80 && !hid && !['chan', 'rec'].includes(view().v)) {
        t.classList.add('hide');
        m.style.setProperty('--segt', 'calc(env(safe-area-inset-top,0px) - ' + t.offsetHeight + 'px)');
      }
    } else if (y < lastY && hid && (turnY - y > 160 || y < 30)) {
      t.classList.remove('hide');
      m.style.setProperty('--segt', '0px');
    }
    lastY = y;
  },
  { passive: true }
);
new ResizeObserver(topPad).observe($('top'), { box: 'border-box' });
/* Glisser le doigt le long de la barre du bas pour choisir sa page, comme Instagram */
/* Curseur de la barre du bas (comme Instagram) : il suit le doigt pendant le glissé, puis se cale sur l'onglet le plus proche.
   Il fait exactement la largeur d'un onglet : la marge entre le curseur et le bord de la barre est la même en haut, en bas et sur les côtés. */
let pillPos = null;
const tabBtns = () => [...$('tabs').querySelectorAll(':scope > button')];
/* Sur ordinateur (1024 px et plus), la barre devient un menu latéral : le curseur se déplace à la verticale */
const sideNav = () => matchMedia('(min-width:1024px)').matches;
function pillSet(l, w, anim) {
  const p = $('tpill');
  if (!p) return;
  p.style.transition = anim ? '' : 'none';
  p.style.opacity = '1';
  if (sideNav()) {
    p.style.transform = `translateY(${l}px)`;
    p.style.height = w + 'px';
    p.style.width = '';
  } else {
    p.style.transform = `translateX(${l}px)`;
    p.style.width = w + 'px';
    p.style.height = '';
  }
  pillPos = { l, w };
}
function pillTo(b, fromLast) {
  const p = $('tpill');
  if (!p) return;
  if (!b) {
    p.style.opacity = '0';
    return;
  }
  if (fromLast && pillPos) {
    pillSet(pillPos.l, pillPos.w, false);
    void p.offsetWidth;
  }
  if (sideNav()) pillSet(b.offsetTop, b.offsetHeight, true);
  else pillSet(b.offsetLeft, b.offsetWidth, true);
}
const nearestTab = x => {
  let best = null,
    d = 1e9;
  tabBtns().forEach(b => {
    const dd = Math.abs(b.offsetLeft + b.offsetWidth / 2 - x);
    if (dd < d) {
      d = dd;
      best = b;
    }
  });
  return best;
};
let tabSw = null,
  tabDragged = false;
$('tabs').addEventListener('pointerdown', e => {
  if (e.button > 0 || sideNav()) return;
  const t = $('tabs');
  tabSw = {
    x0: e.clientX,
    left: t.getBoundingClientRect().left + t.clientLeft,
    moved: false,
    id: e.pointerId,
    el: null
  };
});
$('tabs').addEventListener('pointermove', e => {
  const s = tabSw;
  if (!s || e.pointerId !== s.id) return;
  if (!s.moved && Math.abs(e.clientX - s.x0) < 8) return;
  const t = $('tabs'),
    bs = tabBtns();
  if (!bs.length) return;
  if (!s.moved) {
    s.moved = true;
    try {
      t.setPointerCapture(e.pointerId);
    } catch (_) {}
    t.classList.add('drag');
  }
  const w = bs[0].offsetWidth,
    pad = bs[0].offsetLeft,
    l = Math.min(t.clientWidth - pad - w, Math.max(pad, e.clientX - s.left - w / 2));
  pillSet(l, w, false);
  const b = nearestTab(l + w / 2);
  if (b !== s.el) {
    bs.forEach(x => x.classList.remove('hov'));
    if (b) b.classList.add('hov');
    s.el = b;
  }
});
function tabEnd(cancel) {
  const s = tabSw,
    t = $('tabs');
  tabSw = null;
  t.classList.remove('drag');
  tabBtns().forEach(x => x.classList.remove('hov'));
  if (!s || !s.moved) return;
  tabDragged = true;
  setTimeout(() => (tabDragged = false), 60);
  const b = !cancel && s.el;
  if (b) {
    pillTo(b);
    if (b.getAttribute('aria-current') !== 'page') setTimeout(() => A[b.dataset.a](b.dataset, b), 200);
  } else pillTo(t.querySelector('[aria-current]'));
}
$('tabs').addEventListener('pointerup', () => tabEnd(false));
$('tabs').addEventListener('pointercancel', () => tabEnd(true));
/* Après un glissé, le « clic » de fin de geste n'ouvre pas l'onglet une deuxième fois */
$('tabs').addEventListener(
  'click',
  e => {
    if (tabDragged) {
      e.stopPropagation();
      e.preventDefault();
    }
  },
  true
);
/* Glisser le bandeau de notification vers le haut pour le ranger */
let banY = null;
let banEl = null;
document.addEventListener(
  'touchstart',
  e => {
    const b = e.target.closest('.nban');
    if (b) {
      banEl = b;
      banY = e.touches[0].clientY;
      clearTimeout(b._t);
    }
  },
  { passive: true }
);
document.addEventListener(
  'touchmove',
  e => {
    if (banY === null) return;
    const d = Math.min(0, e.touches[0].clientY - banY);
    banEl.style.transform = `translateY(${d}px)`;
  },
  { passive: true }
);
document.addEventListener('touchend', e => {
  if (banY === null) return;
  const d = e.changedTouches[0].clientY - banY,
    b = banEl;
  banY = null;
  banEl = null;
  if (d < -25) {
    e.preventDefault();
    banHide(b);
  } else {
    b.style.transform = '';
    b._t = setTimeout(() => banHide(b), 3000);
  }
});
let saved = 0;
try {
  saved = +localStorage.getItem('club-theme') || 0;
} catch (e) {}
setTheme(CLUBS[saved] ? saved : 0);
render();
/* passage téléphone ↔ ordinateur (fenêtre redimensionnée) : le curseur se recale sur l'onglet actif */
matchMedia('(min-width:1024px)').addEventListener('change', () => {
  pillPos = null;
  render(true);
  pillTo($('tabs').querySelector('[aria-current]'));
});

/* ---------- Ouvrir un écran depuis une adresse (notification push, lien partagé) ----------
   Formats : #/rec/r1  #/chan/general  #/post/p1  #/agenda/cours  #/notifs  #/me */
function openFromUrl(u) {
  const m = String(u || '').match(/#\/([a-z]+)(?:\/([^/?#]+))?/i);
  if (!m) return false;
  // notification d'un autre de mes clubs : ce club s'ouvre d'abord
  const cl = (String(u).match(/[?&]club=([\w-]+)/) || [])[1];
  if (cl && window.RAM && RAM.club && cl !== RAM.club && window.ramOpen) {
    ramOpen(cl, String(u).replace(/[?&]club=[\w-]+/, ''));
    return true;
  }
  const [, v, id] = m;
  closeSheet();
  if (v === 'ecole' || (v === 'agenda' && id === 'cours')) {
    S.ecTab = id && id !== 'cours' ? id : 'mine';
    A.tab({ t: 'ecole' });
    return true;
  }
  // conversation privée enseignant-élève (/RAM Coach)
  if (v === 'dm' && id) {
    A.tab({ t: S.tab });
    A.open({ v: 'dm', id });
    return true;
  }
  if (v === 'agenda') {
    A.tab({ t: 'agenda' });
    return true;
  }
  if (['home', 'chans', 'club', 'me'].includes(v)) {
    A.tab({ t: v });
    return true;
  }
  if (v === 'notifs') {
    A.tab({ t: 'home' });
    A.notifs();
    return true;
  }
  const ok =
    v === 'rec'
      ? recs.some(r => r.id === id)
      : v === 'post'
        ? posts.some(p => p.id === id)
        : v === 'chan'
          ? chans.some(c => c.id === id && chanOk(c))
          : false;
  if (ok) {
    S.tab = v === 'chan' ? 'chans' : 'home';
    S.stack = [{ v, id }];
    render();
    return true;
  }
  return false;
}
if (location.hash) openFromUrl(location.hash);
if ('serviceWorker' in navigator)
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && e.data.type === 'open') openFromUrl(e.data.url);
  });

/* ---------- Notifications push : abonnement de ce téléphone ----------
   La clé publique vient du serveur (/api/ram/push/key) ; l'abonnement est rattaché au compte connecté.
   Le serveur envoie {"title":"…","body":"…","url":"#/post/p1","tag":"post-p1"} (voir sw.js).
   Sans serveur (démo) ou si le navigateur ne connaît pas le push (iPhone hors appli installée, iOS < 16.4…), rien n'est bloqué. */
const pushReady = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function b64ToU8(s) {
  const p = '='.repeat((4 - (s.length % 4)) % 4),
    b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...b].map(c => c.charCodeAt(0)));
}
async function pushKey() {
  const r = await fetch('/api/ram/push/key', { credentials: 'include' });
  const d = await r.json().catch(() => ({}));
  return r.ok && d.key ? d.key : '';
}
/* ask : demander l'autorisation (bouton « Activer ») ; sinon, seulement renouveler un abonnement déjà autorisé */
async function pushSubscribe(ask) {
  if (!pushReady() || (!ask && Notification.permission !== 'granted')) return null;
  try {
    const key = await pushKey();
    if (!key) return null;
    if (ask && (await Notification.requestPermission()) !== 'granted') return null;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    // abonnement créé avec une autre clé : on le remplace
    if (sub && sub.options && sub.options.applicationServerKey) {
      const old = new Uint8Array(sub.options.applicationServerKey),
        k = b64ToU8(key);
      if (old.length !== k.length || old.some((x, i) => x !== k[i])) {
        await sub.unsubscribe();
        sub = null;
      }
    }
    sub = sub || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) }));
    const r = await fetch('/api/ram/push/subscribe', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() })
    });
    return r.ok ? sub : null;
  } catch (e) {
    return null;
  }
}
A.pushOn = async () => {
  if (!pushReady()) {
    toast(
      isIOS() && !standalone()
        ? "Sur iPhone, installe d'abord l'appli sur l'écran d'accueil pour recevoir les notifications"
        : 'Ce navigateur ne gère pas les notifications push'
    );
    return;
  }
  if (!window.RAM) {
    toast("Les notifications sur le téléphone fonctionnent dans l'appli du club, une fois connecté");
    return;
  }
  const sub = await pushSubscribe(true);
  toast(
    sub
      ? 'Notifications activées sur ce téléphone'
      : Notification.permission === 'denied'
        ? 'Notifications refusées : tu peux changer ça dans les réglages du téléphone'
        : "Les notifications n'ont pas pu être activées, réessaie dans un instant"
  );
};
// déjà autorisées sur ce téléphone : l'abonnement est renouvelé et rattaché au compte connecté
window.addEventListener('load', () => setTimeout(() => window.RAM && pushSubscribe(false), 4000));

/* L'appli installable (index.html, avec manifeste) enregistre le service worker ; la version de démo n'en a pas */
const isPWAPage = !!document.querySelector('link[rel="manifest"]');

/* ---------- iPhone : écran guidé « Installer l'appli du club » au premier lancement dans Safari ---------- */
const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
function installGuide(force) {
  let later = false;
  try {
    later = localStorage.getItem('club-install-later') === '1';
  } catch (e) {}
  if (!force && (!isPWAPage || !isIOS() || standalone() || later)) return;
  closeSheet();
  const d = document.createElement('div');
  d.className = 'back anim install';
  d.id = 'sheet';
  d.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Installer l'appli du club" tabindex="-1"><div class="body ig">
 <span class="crest ig-crest ${club().logo ? 'logo' : ''}" ${club().logo ? `style="background-image:url(${club().logo})"` : ''}>${club().logo ? '' : club().short}</span>
 <h2 class="h3">Installer l'appli du club</h2><p class="muted">Sur iPhone, les notifications (messages, convocations, scores en direct) n'arrivent que si l'appli est ajoutée à l'écran d'accueil. Ça prend dix secondes :</p>
 <ol class="ig-steps"><li><span class="ig-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Touche le bouton <b>Partager</b> en bas de Safari.</span></li>
 <li><span class="ig-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span><span>Fais défiler et choisis <b>Sur l'écran d'accueil</b>.</span></li>
 <li><span class="ig-ic">${ic('check')}</span><span>Touche <b>Ajouter</b>, puis ouvre l'appli depuis son icône.</span></li></ol>
 <div class="ig-demo" aria-hidden="true"><span class="ig-bar"><i></i><i class="hl"></i><i></i></span><span class="ig-arrow">↓</span></div>
 <button class="btn full ghost" data-a="installLater">Plus tard</button></div></div>`;
  $('layer').appendChild(d);
}
A.installLater = () => {
  try {
    localStorage.setItem('club-install-later', '1');
  } catch (e) {}
  closeSheet();
};
A.installHelp = () => installGuide(true);
setTimeout(() => installGuide(false), 600);

/* ---------- fond de l'appli : motif fixe au choix (points, quadrillage, diagonales, uni), mémorisé ---------- */
const MOTIFS = [
  ['dots', 'Points'],
  ['grid', 'Quadrillage'],
  ['stripes', 'Diagonales'],
  ['plain', 'Uni'],
  ['ram-padel', 'Padel'],
  ['ram-tennis', 'Tennis'],
  ['ram-mixte', 'Padel &amp; Tennis']
];
function setMotif(k) {
  if (!MOTIFS.some(m => m[0] === k)) k = 'dots';
  S.motif = k;
  document.documentElement.dataset.motif = k;
  try {
    localStorage.setItem('club-motif', k);
  } catch (e) {}
}
/* le système passe du jour à la nuit : on suit, si l'adhérent a choisi « Système » */
if (window.matchMedia)
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (S.mode === 'systeme') {
      setTheme(S.club);
      render(true);
    }
  });
/* style de l'interface : épuré, street dosé (par défaut) ou full street, comme /RAM JA */
function setUStyle(v) {
  S.ustyle = v || '';
  if (S.ustyle) document.documentElement.dataset.style = S.ustyle;
  else delete document.documentElement.dataset.style;
  try {
    localStorage.setItem('club-style', S.ustyle);
  } catch (e) {}
}
try {
  setUStyle(localStorage.getItem('club-style') || '');
} catch (e) {
  setUStyle('');
}
A.ustyle = d => {
  setUStyle(d.k);
  render(true);
};
/* équipes : filtrer le fil des rencontres par équipe */
A.recTeam = d => {
  S.recTeam = d.k || '';
  render(true);
};
/* fond par défaut des nouveaux adhérents : le motif /RAM padel et tennis */
try {
  setMotif(localStorage.getItem('club-motif') || 'ram-mixte');
} catch (e) {
  setMotif('ram-mixte');
}
A.motif = d => {
  setMotif(d.k);
  render(true);
};

/* ---------- retour en arrière : glisser depuis le bord gauche vers la droite (sauf sur les écrans principaux) ---------- */
(function () {
  let x0 = 0,
    y0 = 0,
    t0 = 0,
    dx = 0,
    on = false,
    lock = false;
  const els = () => [$('main'), $('top'), $('foot')].filter(Boolean),
    ph = $('phone');
  const move = v => {
    els().forEach(e => (e.style.transform = v ? `translateX(${v}px)` : ''));
    ph.style.setProperty('--sw', Math.min(v, 60) + 'px');
  };
  const reset = () => {
    els().forEach(e => e.classList.remove('swipe-back', 'swipe-done'));
    ph.classList.remove('swiping');
    move(0);
  };
  document.addEventListener(
    'touchstart',
    e => {
      if (e.touches.length !== 1 || !S.stack.length || $('sheet')) return;
      const t = e.touches[0],
        r = ph.getBoundingClientRect();
      if (t.clientX - r.left > 28) return;
      x0 = t.clientX;
      y0 = t.clientY;
      t0 = Date.now();
      dx = 0;
      on = true;
      lock = false;
    },
    { passive: true }
  );
  document.addEventListener(
    'touchmove',
    e => {
      if (!on) return;
      const t = e.touches[0],
        ddx = t.clientX - x0,
        ddy = t.clientY - y0;
      if (!lock) {
        if (Math.abs(ddy) > Math.abs(ddx) && Math.abs(ddy) > 8) {
          on = false;
          return;
        }
        if (ddx < 8) return;
        lock = true;
        els().forEach(el => el.classList.add('swipe-back'));
        ph.classList.add('swiping');
      }
      dx = Math.max(0, ddx);
      move(dx);
      e.preventDefault();
    },
    { passive: false }
  );
  document.addEventListener('touchend', () => {
    if (!on) return;
    on = false;
    if (!lock) return;
    const w = ph.clientWidth,
      fast = dx > 40 && dx / (Date.now() - t0) > 0.5;
    els().forEach(el => {
      el.classList.remove('swipe-back');
      el.classList.add('swipe-done');
    });
    if (dx > w * 0.33 || fast) {
      move(w);
      setTimeout(() => {
        reset();
        S.dir = 0;
        S.stack.pop();
        render();
        try {
          navigator.vibrate && navigator.vibrate(8);
        } catch (_) {}
      }, 180);
    } else {
      move(0);
      setTimeout(reset, 190);
    }
  });
  document.addEventListener('touchcancel', () => {
    if (on) {
      on = false;
      reset();
    }
  });
})();

/* ---------- actualiser en tirant vers le bas (comme Instagram) ----------
   Tout en haut d'une page, tirer vers le bas fait apparaître un indicateur de chargement sous la barre du haut ;
   au-delà du seuil, l'appli recharge le club depuis le serveur. */
(function () {
  const ph = $('phone'),
    m = $('main'),
    sp = document.createElement('div');
  sp.className = 'ptr';
  sp.setAttribute('aria-hidden', 'true');
  sp.innerHTML = '<i></i>';
  ph.appendChild(sp);
  let y0 = 0,
    x0 = 0,
    d = 0,
    on = false,
    lock = false,
    busy = false;
  const MAX = 96,
    GO = 64;
  const show = v => {
    const t = $('top').offsetHeight;
    sp.style.top = t + 'px';
    sp.style.opacity = Math.min(1, v / GO);
    sp.style.transform = `translate(-50%,${v / 2 - 17}px)`;
    sp.firstChild.style.transform = `rotate(${v * 4}deg)`;
    m.style.transform = v ? `translateY(${v}px)` : '';
  };
  const end = () => {
    m.classList.add('ptr-back');
    sp.classList.add('ptr-back');
    show(0);
    setTimeout(() => {
      m.classList.remove('ptr-back');
      sp.classList.remove('ptr-back', 'spin');
    }, 260);
  };
  m.addEventListener(
    'touchstart',
    e => {
      if (busy || e.touches.length !== 1 || m.scrollTop > 0 || $('sheet')) return;
      y0 = e.touches[0].clientY;
      x0 = e.touches[0].clientX;
      d = 0;
      on = true;
      lock = false;
    },
    { passive: true }
  );
  m.addEventListener(
    'touchmove',
    e => {
      if (!on) return;
      const dy = e.touches[0].clientY - y0,
        dx = e.touches[0].clientX - x0;
      if (!lock) {
        if (Math.abs(dx) > Math.abs(dy) || dy < 0 || m.scrollTop > 0) {
          on = false;
          return;
        }
        if (dy < 8) return;
        lock = true;
      }
      d = Math.min(MAX, dy * 0.6);
      show(d);
      e.preventDefault();
    },
    { passive: false }
  );
  m.addEventListener('touchend', async () => {
    if (!on) return;
    on = false;
    if (!lock) return;
    if (d < GO) {
      end();
      return;
    }
    busy = true;
    sp.classList.add('spin');
    show(GO);
    try {
      navigator.vibrate && navigator.vibrate(10);
    } catch (_) {}
    const t0 = Date.now();
    let ok = false;
    try {
      ok = window.ramRefresh ? await window.ramRefresh() : false;
    } catch (_) {}
    await new Promise(r => setTimeout(r, Math.max(0, 600 - (Date.now() - t0)))); // l'indicateur tourne au moins un instant
    busy = false;
    end();
    if (!window.RAM || !RAM.live) toast('Démonstration : rien à actualiser');
  });
  m.addEventListener('touchcancel', () => {
    if (on) {
      on = false;
      end();
    }
  });
})();

/* ---------- version ordinateur, comme /RAM JA : bas du menu (mode jour/nuit, profil, sortie) et titre du sous-menu ---------- */
function ramRail(title) {
  let rb = $('rbot');
  if (!rb) {
    rb = document.createElement('div');
    rb.id = 'rbot';
    rb.className = 'rbot';
    $('phone').appendChild(rb);
  }
  const dk = effDark(),
    me = ME(),
    cur = S.tab === 'me' && !S.stack.length;
  rb.innerHTML = `<i class="sep"></i><button data-a="ramMode">${ic(dk ? 'sun' : 'moon')}<span>${dk ? 'Mode jour' : 'Mode nuit'}</span></button><button data-a="tab" data-t="me" ${cur ? 'aria-current="page"' : ''}>${M[me] ? av(me, 'sm') : ic('user')}<span>Profil</span></button><button data-a="logout">${ic('logout')}<span>Sortir</span></button>`;
  const seg = $('main').querySelector(':scope > .seg');
  if (seg && !seg.querySelector('.segt'))
    seg.insertAdjacentHTML(
      'afterbegin',
      `<div class="segt"><span>${esc(club().name)}</span><b>${title || ''}</b></div>`
    );
}
A.ramMode = () => {
  S.mode = effDark() ? 'jour' : 'nuit';
  try {
    localStorage.setItem('club-mode', S.mode);
  } catch (e) {}
  setTheme(S.club);
  render(true);
};
/* réglage du profil : jour, nuit ou système (les couleurs, elles, restent celles choisies par le bureau) */
A.mode = d => {
  S.mode = d.k || 'systeme';
  try {
    localStorage.setItem('club-mode', S.mode);
  } catch (e) {}
  setTheme(S.club);
  render(true);
};
/* sortir : on se déconnecte et on arrive sur la page de connexion de /RAM Club */
A.logout = () => {
  fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    .catch(() => {})
    .then(() => {
      try {
        localStorage.removeItem('ram-club');
      } catch (e) {}
      location.href = (location.pathname.startsWith('/club/') ? '/club/' : '/') + 'connexion';
    });
};
