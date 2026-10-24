/* /RAM Club — app/6-gestes.js : Événements du navigateur : clics, appui long, clavier, zoom photo, glissés.
   Morceau de l'ancien app.js : les fichiers app/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
/* ---------- événements du navigateur ---------- */
document.addEventListener('click', e => {
  const nb = e.target.closest('.nban');
  if (nb && e.target.closest('.bq')) {
    banHide(nb);
    A.notifs();
    return;
  }
  if (nb && nb._n && !e.target.closest('[data-a]')) {
    const i = NOTIFS.indexOf(nb._n);
    banHide(nb);
    if (i >= 0) {
      NOTIFS[i].n = 0;
      A.ngo({ i });
    }
    return;
  }
  const lp = e.target.closest('[data-lp]');
  if (lp && !e.target.closest('[data-a]')) {
    if (e.detail === 0) A[lp.dataset.lp](lp.dataset, lp);
    return;
  }
  const el = e.target.closest('[data-a]');
  if (el) {
    if (el.disabled) return;
    A[el.dataset.a](el.dataset, el);
    return;
  }
  if (e.target.id === 'sheet') closeSheet();
});
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSheet();
});
/* Feuilles du bas : on les ferme aussi en les glissant vers le bas */
/* Appui long sur un message ou un commentaire : réactions, réponse, signalement */
let lpT = null,
  lpX = 0,
  lpY = 0;
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-lp]');
  if (!el || e.target.closest('[data-a]')) return;
  lpX = e.clientX;
  lpY = e.clientY;
  clearTimeout(lpT);
  lpT = setTimeout(() => {
    lpT = null;
    try {
      navigator.vibrate && navigator.vibrate(12);
    } catch (_) {}
    A[el.dataset.lp](el.dataset, el);
  }, 450);
});
document.addEventListener('pointermove', e => {
  if (lpT && Math.abs(e.clientX - lpX) + Math.abs(e.clientY - lpY) > 10) {
    clearTimeout(lpT);
    lpT = null;
  }
});
['pointerup', 'pointercancel'].forEach(t =>
  document.addEventListener(t, () => {
    clearTimeout(lpT);
    lpT = null;
  })
);
document.addEventListener('contextmenu', e => {
  const el = e.target.closest('[data-lp]');
  if (el) {
    e.preventDefault();
    clearTimeout(lpT);
    lpT = null;
    A[el.dataset.lp](el.dataset, el);
  }
});
/* Nouvelle saison : tout repart de zéro. On ne garde que les archives (résultats des équipes, articles, événements passés), les profils, les trophées et les points */
function newSeason(old) {
  if (typeof freezeTrophies === 'function') freezeTrophies();
  GROUPS.filter(g => g.type === 'team').forEach(g => OLDG.push(g));
  CHAMPS.forEach(c => OLDC.push(c));
  GROUPS.length = 0;
  CHAMPS.length = 0;
  for (let i = recs.length - 1; i >= 0; i--) if (!recs[i].arch) recs.splice(i, 1);
  for (let i = posts.length - 1; i >= 0; i--) if (!posts[i].arch) posts.splice(i, 1);
  for (let i = chans.length - 1; i >= 0; i--) {
    const c = chans[i];
    if (c.g !== 'club') chans.splice(i, 1);
    else {
      c.msgs = [];
      c.un = 0;
    }
  }
  Object.keys(M).forEach(k => {
    M[k].res = [];
    M[k].pres = [];
  });
  NOTIFS.length = 0;
  NOTIFS.push({ by: 'club', txt: `ouvre la saison ${S.season} : bienvenue à tous !`, t: "À l'instant", n: 1 });
  S.liked.clear();
  S.scoring = false;
}
/* Formulaire du résultat final : on n'affiche que les champs utiles */
function tfSync() {
  const fm = val0('tf-fmt'),
    tm = document.querySelector('#tf-form input[name="tm"]:checked'),
    pl = tm && tm.value === 'place';
  if (!$('tf-p')) return;
  $('tf-p').hidden = fm === 'Tableau final';
  $('tf-t').hidden = fm === 'Poule';
  $('tf-tsw').hidden = pl;
  $('tf-tpw').hidden = !pl;
  $('tf-d').hidden = val0('tf-out') === 'Maintien';
}
const val0 = id => {
  const x = $(id);
  return x ? x.value : '';
};
document.addEventListener('change', e => {
  if (e.target.closest('#tf-form')) tfSync();
});
/* Visionneuse de photos : seul endroit où l'on peut zoomer, à deux doigts (comme WhatsApp). Double-tap : zoom ×2,5 ; toucher simple sans zoom : fermer */
function pinchZoom(img) {
  const P = new Map();
  let s = 1,
    x = 0,
    y = 0,
    s0 = 1,
    d0 = 0,
    x0 = 0,
    y0 = 0,
    moved = false,
    lastTap = 0;
  const apply = () => {
    img.style.transform = `translate(${x}px,${y}px) scale(${s})`;
  };
  const dist = () => {
    const [a, b] = [...P.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  img.addEventListener('pointerdown', e => {
    img.setPointerCapture(e.pointerId);
    P.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (P.size === 2) {
      s0 = s;
      d0 = dist();
    } else {
      x0 = e.clientX - x;
      y0 = e.clientY - y;
    }
  });
  img.addEventListener('pointermove', e => {
    if (!P.has(e.pointerId)) return;
    P.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (P.size === 2) {
      s = Math.min(4, Math.max(1, (s0 * dist()) / d0));
      moved = true;
      apply();
    } else if (s > 1) {
      x = e.clientX - x0;
      y = e.clientY - y0;
      moved = true;
      apply();
    }
  });
  const up = e => {
    P.delete(e.pointerId);
    if (P.size) return;
    if (s <= 1.02) {
      s = 1;
      x = 0;
      y = 0;
      apply();
    }
    if (!moved) {
      const now = Date.now();
      if (now - lastTap < 300) {
        s = s > 1 ? 1 : 2.5;
        x = 0;
        y = 0;
        img.style.transition = 'transform .2s';
        apply();
        setTimeout(() => (img.style.transition = ''), 220);
        lastTap = 0;
      } else {
        lastTap = now;
        setTimeout(() => {
          if (lastTap === now && s === 1) closeSheet();
        }, 310);
      }
    }
  };
  img.addEventListener('pointerup', up);
  img.addEventListener('pointercancel', up);
  img.addEventListener(
    'wheel',
    e => {
      e.preventDefault();
      s = Math.min(4, Math.max(1, s * (e.deltaY < 0 ? 1.15 : 0.87)));
      if (s === 1) {
        x = 0;
        y = 0;
      }
      apply();
    },
    { passive: false }
  );
}
/* Clavier (comme WhatsApp) : on garde le clavier natif ; l'appli se cale sur la partie visible de l'écran (visualViewport),
   donc la barre de saisie reste collée juste au-dessus du clavier, sans saut ni vide. La liste reste sur le dernier message. */
const VV = window.visualViewport;
function vvFit() {
  const p = $('phone');
  if (!VV || !p) return;
  const a = document.activeElement,
    typing = !!a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.type !== 'file',
    kb = Math.max(0, window.innerHeight - VV.height),
    open = typing && kb > 80;
  const was = p.classList.contains('kb');
  p.classList.toggle('kb', open);
  if (open) {
    p.style.height = VV.height + 'px';
    p.style.top = VV.offsetTop + 'px';
  } else {
    p.style.height = '';
    p.style.top = '';
    if (was) window.scrollTo(0, 0);
  }
  if (open && !was) toEnd();
}
function toEnd() {
  const v = view(),
    m = $('main'),
    cl = $('com-list');
  if (m && (v.v === 'chan' || v.v === 'rec')) m.scrollTop = m.scrollHeight;
  if (cl) cl.scrollTop = cl.scrollHeight;
}
if (VV) {
  VV.addEventListener('resize', vvFit);
  VV.addEventListener('scroll', vvFit);
}
document.addEventListener('focusout', () => setTimeout(vvFit, 60));
/* Après l'envoi d'un message ou d'un commentaire, le clavier se ferme */
document.addEventListener('submit', e => {
  const id = e.target.id;
  if (id === 'composer' || id === 'com-form')
    setTimeout(() => {
      const a = document.activeElement;
      if (a && a.blur) a.blur();
    }, 0);
});
/* Toucher la liste des messages (hors barre de saisie) ferme le clavier */
document.addEventListener(
  'pointerdown',
  e => {
    const a = document.activeElement;
    if (!a || !/^(INPUT|TEXTAREA)$/.test(a.tagName) || !a.closest('.composer')) return;
    if (e.target.closest('#main,#com-list') && !e.target.closest('.composer')) a.blur();
  },
  true
);
/* Qui peut publier sur le mur : bureau, enseignants, membres d'une commission */
const myComms = () => COMMS.filter(c => c.mem.includes(ME()) || c.resp === ME());
const canPublish = () => isAdmin() || myComms().length > 0;
/* Champ de message multiligne (comme WhatsApp) : une zone de texte et non un champ « texte »,
   ce qui évite la suggestion « Préremplir le contact » de Safari. Il grandit jusqu'à 5 lignes.
   Téléphone : la touche Entrée va à la ligne, on envoie avec le bouton. Ordinateur : Entrée envoie, Maj+Entrée va à la ligne. */
const taFit = t => {
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight, 128) + 'px';
};
document.addEventListener('input', e => {
  if (e.target.classList && e.target.classList.contains('ta')) taFit(e.target);
});
document.addEventListener('keydown', e => {
  const t = e.target;
  if (!t.classList || !t.classList.contains('ta') || e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
  if (matchMedia('(pointer:coarse)').matches) return;
  e.preventDefault();
  const f = t.closest('form');
  if (f) f.requestSubmit();
});
document.addEventListener('submit', e => {
  const t = e.target.querySelector && e.target.querySelector('.ta');
  if (t)
    setTimeout(() => {
      t.style.height = '';
    }, 0);
});
let shY = null;
document.addEventListener(
  'touchstart',
  e => {
    const h = e.target.closest('.sheet header,.grab');
    shY = h ? e.touches[0].clientY : null;
  },
  { passive: true }
);
document.addEventListener(
  'touchmove',
  e => {
    if (shY === null) return;
    const dy = e.touches[0].clientY - shY,
      s = document.querySelector('#sheet .sheet');
    if (s && dy > 0) s.style.transform = `translateY(${dy}px)`;
  },
  { passive: true }
);
document.addEventListener(
  'touchend',
  e => {
    if (shY === null) return;
    const dy = e.changedTouches[0].clientY - shY;
    shY = null;
    const s = document.querySelector('#sheet .sheet');
    if (dy > 90) closeSheet();
    else if (s) s.style.transform = '';
  },
  { passive: true }
);
function scrollFirst() {
  const m = $('main'),
    g = m.querySelector('#plan .gev');
  if (g) m.scrollTop += g.getBoundingClientRect().top - m.getBoundingClientRect().top - 140;
}
let tsx = null,
  tsy = 0;
document.addEventListener(
  'touchstart',
  e => {
    const g = e.target.closest('#plan') && !e.target.closest('.chips') && S.plan.mode !== 'events';
    tsx = g ? e.touches[0].clientX : null;
    tsy = g ? e.touches[0].clientY : 0;
  },
  { passive: true }
);
document.addEventListener(
  'touchend',
  e => {
    if (tsx === null) return;
    const t = e.changedTouches[0],
      dx = t.clientX - tsx,
      dy = t.clientY - tsy;
    tsx = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) A.planNav({ n: dx < 0 ? 1 : -1 });
  },
  { passive: true }
);
document.addEventListener('input', e => {
  if (e.target.id === 'l-q') {
    S.list.q = e.target.value;
    render(true);
    const i = $('l-q');
    i.focus();
    i.setSelectionRange(i.value.length, i.value.length);
  }
  if (e.target.id === 'lk-acc' || e.target.id === 'lk-acc2') lookPrev();
});
document.addEventListener('change', e => {
  const el = e.target,
    prev = u => {
      const p = $('a-prev');
      if (p) {
        p.hidden = false;
        p.style.backgroundImage = `url(${u})`;
      }
    };
  if (el.dataset.hide) $(el.dataset.hide).hidden = el.checked;
  if (el.id === 'v-sport' && $('v-rk')) {
    $('v-rk').hidden = el.value === 'Padel';
    $('v-nv').hidden = el.value === 'Tennis';
  }
  if (el.id === 'tr-sport' || el.id === 'tr-mgr') {
    const pad = $('tr-sport').value === 'Padel';
    $('tr-tennis').hidden = pad;
    $('tr-padel').hidden = !pad;
    // tournoi organisé avec /RAM JA : pas de lien Ten'Up (inscriptions dans l'appli)
    if ($('tr-ext')) $('tr-ext').hidden = pad && /RAM JA/.test($('tr-mgr').value);
  }
  if (el.id === 'tr-pub') {
    $('tr-jeunes').hidden = el.value !== 'Jeunes';
    $('tr-vet').hidden = el.value !== 'Seniors +';
  }
  if (el.name === 'pt' && $('pt-c')) {
    $('pt-c').hidden = el.value !== 'club';
    $('pt-e').hidden = el.value !== 'ext';
  }
  if (el.name === 'a-reg' && $('ev-int')) {
    $('ev-int').hidden = el.value !== 'int';
    $('ev-ext').hidden = el.value !== 'ext';
  }
  if (el.id === 'lk-bg') lookPrev();
  if (el.id === 'imp-file' && el.files[0]) {
    const fr = new FileReader();
    fr.onload = () => {
      const rows = String(fr.result)
        .split(/\r?\n/)
        .map(l => l.split(/[;,\t]/).map(x => x.trim()))
        .filter(r => r.length >= 2 && r[0] && !/^pr[ée]nom$/i.test(r[0]));
      S.imp = rows.map(r => ({ n: r[0] + ' ' + r[1], mail: r[2] || '' }));
      $('imp-prev').innerHTML = S.imp.length
        ? `<p class="small"><b>${S.imp.length} adhérent${S.imp.length > 1 ? 's' : ''}</b> trouvé${S.imp.length > 1 ? 's' : ''} : ${S.imp
            .slice(0, 3)
            .map(x => esc(x.n))
            .join(
              ', '
            )}${S.imp.length > 3 ? '…' : ''}</p><button class="btn full" data-a="impSend">Envoyer ${S.imp.length} invitation${S.imp.length > 1 ? 's' : ''}</button>`
        : '<p class="muted small">Aucune ligne lisible : vérifie le format prénom ; nom ; e-mail.</p>';
    };
    fr.readAsText(el.files[0]);
  }
  if (el.id === 'l-sort') {
    S.list.sort = el.value;
    render(true);
  }
  if (el.id === 'l-f') {
    S.list.f = el.value;
    render(true);
  }
  if (el.id === 'p-sport') {
    const pad = el.value === 'Padel',
      f = $('a-fmt');
    $('p-rk').hidden = pad;
    $('p-lv').hidden = !pad;
    if (pad) f.value = 'Double';
    f.disabled = pad;
  }
  if (el.id === 'cap-sel') {
    grp(el.dataset.team).cap = el.value;
    render(true);
    toast(`${name(el.value)} est capitaine · prévenu`);
  }
  if ((el.id === 'a-img' || el.id === 'lk-logo') && el.files[0])
    shrink(el.files[0], u => {
      S.img = u;
      prev(u);
    });
  if ((el.id === 'lk-ll' || el.id === 'lk-ld') && el.files[0])
    shrinkLogo(el.files[0], u => {
      S[el.id === 'lk-ll' ? 'logoL' : 'logoD'] = u;
      const p = $(el.id + '-p');
      if (p) {
        p.hidden = false;
        p.innerHTML = `<img src="${u}" alt="">`;
      }
      lookPrev();
    });
  if (el.id === 'm-img' && el.files[0])
    shrink(el.files[0], u => {
      S.img = u;
      showAtt();
    });
  if (el.id === 'me-photo' && el.files[0])
    shrink(el.files[0], u => {
      M[ME()].photo = u;
      render(true);
      toast('Photo de profil mise à jour');
    });
  if (el.id === 'd-ph') {
    [...el.files].slice(0, 10 - S.imgs.length).forEach(f =>
      shrink(f, u => {
        if (S.imgs.length < 10) S.imgs.push(u);
        const p = $('d-prev');
        if (p)
          p.innerHTML =
            S.imgs.map(x => `<span class="ph" style="background-image:url(${x})"></span>`).join('') +
            `<span class="muted small" style="grid-column:1/-1">${S.imgs.length} photo${S.imgs.length > 1 ? 's' : ''} sur 10</span>`;
      })
    );
    el.value = '';
  }
  if (el.id === 'rec-ph' && el.files[0])
    shrink(el.files[0], u => {
      recs.find(r => r.id === el.dataset.r).img = u;
      render(true);
      toast('Photo ajoutée · la publication du mur est à jour');
    });
});
