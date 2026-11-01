/* /RAM Club — app/14-discussions.js : discussions plus vivantes, façon WhatsApp.
   - Glisser un message vers la droite : on y répond (comme l'appui long, « Répondre »).
   - Glisser un de ses messages vers la gauche : ses infos dans un panneau latéral (lu par, distribué à, avec date et heure).
   - « Paul est en train d'écrire… » : signal envoyé au serveur pendant la saisie (au plus toutes les 2,5 s),
     relayé en direct aux autres membres de la discussion, jamais enregistré ; il s'efface après 6 s sans signal,
     ou dès que le message arrive.
   L'apparition des messages (la bulle gonfle depuis sa pointe) et les coches sont dans les styles et ui/2-publications.js. */

/* ---------- « … est en train d'écrire » ---------- */
const TYPING = {}; // ref → { clé : heure du dernier signal }
const TYPING_TTL = 6000;
function typingWho(ref) {
  const now = Date.now(),
    l = TYPING[ref] || {};
  return Object.keys(l).filter(k => now - l[k] < TYPING_TTL && k !== ME() && M[k] && !S.blocked.has(k));
}
function typingHTML(ref) {
  const w = typingWho(ref);
  if (!w.length) return '';
  const names = w.map(first),
    txt =
      names.length === 1
        ? `${esc(names[0])} est en train d’écrire…`
        : names.length === 2
          ? `${esc(names[0])} et ${esc(names[1])} écrivent…`
          : `${esc(names[0])} et ${names.length - 1} autres écrivent…`;
  return `<div class="msg typing">${avLink(w[0], 'sm')}<div class="grow"><div class="bubw"><div class="bub tail typ" aria-hidden="true"><i></i><i></i><i></i></div><span class="typ-l">${txt}</span></div></div></div>`;
}
/* met à jour les emplacements de la discussion ouverte, sans redessiner la page ;
   si l'on est en bas de la discussion, on y reste */
function typingPaint(ref) {
  const slots = document.querySelectorAll(`.typing-slot[data-ref="${ref}"]`);
  if (!slots.length) return;
  const m = $('main'),
    atEnd = m && m.scrollHeight - m.clientHeight - m.scrollTop < 80;
  slots.forEach(s => (s.innerHTML = typingHTML(ref)));
  if (atEnd && m) m.scrollTop = m.scrollHeight;
  const cl = $('com-list');
  if (cl && ref.startsWith('p:')) cl.scrollTop = cl.scrollHeight;
}
window.ramTyping = t => {
  if (!t || !t.ref || !t.key) return;
  (TYPING[t.ref] = TYPING[t.ref] || {})[t.key] = Date.now();
  typingPaint(t.ref);
};
window.ramTypingDone = (ref, key) => {
  if (TYPING[ref] && TYPING[ref][key]) {
    delete TYPING[ref][key];
    typingPaint(ref);
  }
};
// nettoyage : un signal trop vieux s'efface
setInterval(() => {
  const now = Date.now();
  Object.keys(TYPING).forEach(ref => {
    const l = TYPING[ref],
      old = Object.keys(l).filter(k => now - l[k] >= TYPING_TTL);
    if (old.length) {
      old.forEach(k => delete l[k]);
      typingPaint(ref);
    }
  });
}, 1500);
/* j'écris : la discussion ouverte est prévenue (au plus toutes les 2,5 s) */
let typingSent = 0;
function typingRef(el) {
  if (el.id === 'com-input') {
    const f = el.closest('#com-form');
    return f ? 'p:' + f.dataset.id : '';
  }
  const v = view();
  return v.v === 'chan' ? 'c:' + v.id : v.v === 'rec' ? 'r:' + v.id : '';
}
document.addEventListener('input', e => {
  const el = e.target;
  if (!(el.id === 'msg-input' || el.id === 'com-input') || !el.value.trim()) return;
  if (!(window.RAM && RAM.live && RAM.club) || Date.now() - typingSent < 2500) return;
  const ref = typingRef(el);
  if (!ref) return;
  typingSent = Date.now();
  fetch('/api/ram/c/' + RAM.club + '/typing', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref })
  }).catch(() => {});
});

/* ---------- infos d'un de mes messages (panneau latéral, comme WhatsApp) ---------- */
const infoWhen = at => {
  const d = new Date(at),
    today = new Date().toDateString() === d.toDateString(),
    hier = new Date(Date.now() - 864e5).toDateString() === d.toDateString(),
    hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return (
    (today
      ? "Aujourd'hui"
      : hier
        ? 'Hier'
        : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })) +
    ' à ' +
    hm
  );
};
const infoRow = (k, at) =>
  `<div class="item">${av(k, 'sm')}<span class="grow"><span class="nm">${esc(name(k))}</span>${at ? `<br><span class="muted small">${infoWhen(at)}</span>` : ''}</span></div>`;
function infoBody(m, ref, data, err) {
  const bubble = `<div class="chat info-msg"><div class="msg me msg-end"><div class="grow"><div class="bubw"><div class="bub tail">${m.rep ? `<span class="quote">${esc(first(m.rep.by))} : ${esc(m.rep.x).slice(0, 80)}</span>` : ''}${m.img ? `<span class="ph mph" style="background-image:url(${m.img})"></span>` : ''}${m.x ? `<span class="tx">${esc(m.x)}</span>` : ''}<time>${m.t || ''}${msgTicks(m, ref)}</time></div></div></div></div></div>`;
  const sent = m.at
    ? `<div class="info-sec"><span class="kicker">${ic('tick1')}Envoyé</span><p class="muted small">${infoWhen(m.at)}</p></div>`
    : '';
  if (!ref.startsWith('c:'))
    return `<div class="body">${bubble}${sent}<p class="muted small">Le suivi de lecture existe dans les groupes de discussion.</p></div>`;
  if (err) return `<div class="body">${bubble}${sent}<p class="muted small">${esc(err)}</p></div>`;
  if (!data) return `<div class="body">${bubble}${sent}<p class="muted small">Chargement…</p></div>`;
  const sec = (t, cls, l, empty) =>
    `<div class="info-sec"><span class="kicker">${ic('tick2')}<span class="${cls}">${t}</span></span>${l.length ? l.map(x => infoRow(x.key, x.at)).join('') : `<p class="muted small">${empty}</p>`}</div>`;
  return `<div class="body">${bubble}${sec('Lu par', 'rd', data.read, 'Personne pour le moment.')}${sec('Distribué à', '', data.delivered, data.read.length ? 'Tous ceux qui l’ont reçu l’ont lu.' : 'Pas encore distribué.')}${
    data.waiting.length
      ? `<div class="info-sec"><span class="kicker">${ic('tick1')}Pas encore reçu</span>${data.waiting.map(x => infoRow(x.key)).join('')}</div>`
      : ''
  }<p class="muted small">Seul l’auteur d’un message voit ces informations.</p></div>`;
}
A.msgInfo = async d => {
  const l = msgList(d.ref),
    m = l && l[+d.i];
  if (!m || m.by !== ME()) return;
  const open = (data, err) => {
    sheet('Infos du message', infoBody(m, d.ref, data, err));
    $('sheet').classList.add('side');
  };
  const live = window.RAM && RAM.live && m._id && d.ref.startsWith('c:');
  if (!live) {
    // démonstration : un exemple de suivi de lecture
    const others = Object.keys(M)
        .filter(k => k !== 'club' && k !== ME())
        .slice(0, 5),
      t = m.at || Date.now();
    return open(
      d.ref.startsWith('c:')
        ? {
            read: others.slice(0, 3).map((k, i) => ({ key: k, at: t + (i + 1) * 240000 })),
            delivered: others.slice(3, 4).map(k => ({ key: k, at: t + 60000 })),
            waiting: others.slice(4).map(k => ({ key: k }))
          }
        : null
    );
  }
  open(null);
  try {
    const r = await fetch('/api/ram/c/' + RAM.club + '/msginfo?id=' + encodeURIComponent(m._id), {
        credentials: 'include'
      }),
      j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Erreur ' + r.status);
    if ($('sheet')) open(j);
  } catch (e) {
    if ($('sheet')) open(null, e.message);
  }
};

/* ---------- glisser un message : vers la droite pour y répondre, vers la gauche (les miens) pour ses infos ---------- */
let swp = null;
const SWP_MAX = 76,
  SWP_GO = 56;
document.addEventListener(
  'touchstart',
  e => {
    const b = e.target.closest && e.target.closest('.bub[data-lp="mmenu"]');
    if (!b || e.touches.length !== 1 || e.target.closest('[data-a]')) return;
    const t = e.touches[0];
    swp = { b, w: b.closest('.bubw'), x: t.clientX, y: t.clientY, dx: 0, lock: null, fired: false };
  },
  { passive: true }
);
document.addEventListener(
  'touchmove',
  e => {
    if (!swp) return;
    const t = e.touches[0],
      dx = t.clientX - swp.x,
      dy = t.clientY - swp.y;
    // on décide une fois : glissement horizontal vers la droite (réponse) ou défilement normal
    if (swp.lock === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      const horiz = Math.abs(dx) > Math.abs(dy) * 1.4,
        mine = !!swp.b.closest('.msg.me');
      swp.lock = horiz && (dx > 0 ? 'right' : mine ? 'left' : null);
      if (!swp.lock) {
        swp = null;
        return;
      }
      swp.w.classList.add('swiping');
    }
    swp.dx =
      swp.lock === 'right' ? Math.max(0, Math.min(SWP_MAX, dx * 0.85)) : Math.min(0, Math.max(-SWP_MAX, dx * 0.85));
    swp.w.style.transform = `translateX(${swp.dx}px)`;
    swp.w.style.setProperty(swp.lock === 'right' ? '--rp' : '--ri', Math.min(1, Math.abs(swp.dx) / SWP_GO));
    if (Math.abs(swp.dx) >= SWP_GO && !swp.fired) {
      swp.fired = true;
      if (typeof fxBuzz === 'function') fxBuzz(8);
    }
  },
  { passive: true }
);
const swpEnd = () => {
  if (!swp) return;
  const s = swp;
  swp = null;
  if (!s.lock) return;
  s.w.classList.remove('swiping');
  s.w.style.transform = '';
  s.w.style.removeProperty('--rp');
  s.w.style.removeProperty('--ri');
  if (s.dx >= SWP_GO) A.reply(s.b.dataset);
  else if (s.dx <= -SWP_GO) A.msgInfo(s.b.dataset);
};
document.addEventListener('touchend', swpEnd, { passive: true });
document.addEventListener('touchcancel', swpEnd, { passive: true });

/* ---------- supprimer un groupe de discussion ----------
   Le bureau (ou l'administrateur) supprime n'importe quel groupe, sauf Annonces et Général ; un enseignant, la
   discussion de son groupe d'entraînement. Le groupe d'entraînement lui-même et ses séances restent : sa discussion
   peut être recréée depuis sa page dans /RAM Coach. */
const chanCanDel = c => {
  if (!c || ['annonces', 'general'].includes(c.id)) return false;
  const g = typeof grp === 'function' ? grp(c.id) : null;
  return (
    isAdmin() ||
    !!S.super ||
    !!(g && g.coach && (g.coach === ME() || (typeof coIsMe === 'function' && coIsMe(g.coach))))
  );
};
/* ---------- réglages d'une discussion : son nom, sa règle d'accès, ajouter ou retirer quelqu'un ----------
   le bureau et l'enseignant du groupe. Ces réglages ne concernent que cette discussion ; le serveur fait respecter la règle. */
const chanCanCfg = c => {
  if (!c) return false;
  const g = typeof grp === 'function' ? grp(c.id) : null;
  return (
    isBureau() ||
    !!S.super ||
    !!(g && g.coach && (g.coach === ME() || (typeof coIsMe === 'function' && coIsMe(g.coach))))
  );
};
const chanCfgBtn = c =>
  chanCanCfg(c)
    ? `<button class="ib" data-a="chanCfg" data-id="${c.id}" aria-label="Réglages de la discussion ${esc(c.name)}">${ic('gear')}</button>`
    : '';
const CHAN_ACCES = [
  ['tous', 'Tous les adhérents'],
  ['groupe', 'Les membres du groupe'],
  ['invite', 'Sur invitation']
];
const chanKeys = () =>
  Object.keys(M)
    .filter(k => k !== 'club')
    .sort((a, b) => name(a).localeCompare(name(b)));
const chanIn = (c, k) => REGLES.chanOuvert(c, grp(c.id), [k]);
A.chanCfg = d => {
  const c = chans.find(x => x.id === d.id);
  if (!chanCanCfg(c)) return;
  const g = grp(c.id);
  sheet(
    'Réglages de la discussion',
    `<form class="body" id="chan-cfg" data-id="${c.id}"><div class="fld"><label for="cc-n">Nom</label><input id="cc-n" required maxlength="60" value="${esc(c.name)}"></div><div class="fld"><label for="cc-a">Qui y a accès</label><select id="cc-a">${CHAN_ACCES.filter(
      x => g || x[0] !== 'groupe'
    )
      .map(x => `<option value="${x[0]}" ${(c.acces || 'tous') === x[0] ? 'selected' : ''}>${x[1]}</option>`)
      .join(
        ''
      )}</select></div><span class="kicker">Participants</span><p class="muted small">Ajouter ou retirer quelqu'un prime sur la règle d'accès.</p><div class="fld"><input id="cc-q" type="search" placeholder="Rechercher" aria-label="Rechercher un adhérent"></div><div class="ccl">${chanKeys()
      .map(
        k =>
          `<div class="ct" data-n="${esc(fold0(name(k)))}">${av(k, 'sm')}<span class="grow">${esc(name(k))}</span><button type="button" class="tg" role="switch" aria-checked="${chanIn(c, k)}" data-a="chanWho" data-id="${c.id}" data-k="${k}" aria-label="${esc(name(k))} dans la discussion"></button></div>`
      )
      .join(
        ''
      )}</div><button class="btn full">Enregistrer</button>${chanCanDel(c) ? `<button type="button" class="btn full ghost" data-a="chanDel" data-id="${c.id}">${ic('trash')}Supprimer la discussion</button>` : ''}</form>`
  );
};
const chanPaint = c =>
  document
    .querySelectorAll('#chan-cfg [data-a="chanWho"]')
    .forEach(b => b.setAttribute('aria-checked', String(chanIn(c, b.dataset.k))));
A.chanWho = d => {
  const c = chans.find(x => x.id === d.id);
  if (!chanCanCfg(c)) return;
  const on = chanIn(c, d.k);
  c.plus = (c.plus || []).filter(k => k !== d.k);
  c.moins = (c.moins || []).filter(k => k !== d.k);
  // le choix à la main, s'il diffère de ce que donne la règle seule
  const rule = chanIn(c, d.k);
  if (on && rule) c.moins.push(d.k);
  else if (!on && !rule) c.plus.push(d.k);
  chanPaint(c);
  render(true);
};
document.addEventListener('change', e => {
  if (e.target.id !== 'cc-a') return;
  const c = chans.find(x => x.id === $('chan-cfg').dataset.id);
  if (!c) return;
  c.acces = e.target.value;
  chanPaint(c);
});
document.addEventListener('input', e => {
  if (e.target.id !== 'cc-q') return;
  const q = fold0(e.target.value);
  document.querySelectorAll('.ccl .ct').forEach(r => (r.hidden = !!q && !r.dataset.n.includes(q)));
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'chan-cfg') return;
  e.preventDefault();
  const c = chans.find(x => x.id === e.target.dataset.id);
  if (!chanCanCfg(c)) return;
  c.name = $('cc-n').value.trim().slice(0, 60) || c.name;
  c.acces = $('cc-a').value;
  closeSheet();
  render();
  toast('Discussion réglée');
});
const chanDelBtn = c =>
  chanCanDel(c)
    ? `<button class="ib" data-a="chanDel" data-id="${c.id}" aria-label="Supprimer le groupe de discussion ${esc(c.name)}">${ic('trash')}</button>`
    : '';
A.chanDel = d => {
  const c = chans.find(x => x.id === d.id);
  if (!chanCanDel(c)) return;
  sheet(
    'Supprimer la discussion',
    `<div class="body"><p>Le groupe de discussion <b>${esc(c.name)}</b> et tous ses messages seront supprimés pour tout le monde.${grp(c.id) ? " Le groupe d'entraînement, ses élèves et ses séances restent." : ''}</p><button class="btn full hot" data-a="chanDelOk" data-id="${c.id}">${ic('trash')}Supprimer la discussion</button><button class="btn full ghost" data-a="closeSheet">Annuler</button></div>`
  );
};
A.chanDelOk = d => {
  const i = chans.findIndex(x => x.id === d.id);
  if (i < 0) return closeSheet();
  const name0 = chans[i].name;
  chans.splice(i, 1);
  closeSheet();
  // si l'on était dans la discussion, on revient à la page d'avant
  if (S.stack.length && S.stack[S.stack.length - 1].v === 'chan' && S.stack[S.stack.length - 1].id === d.id)
    S.stack.pop();
  render();
  toast('Discussion « ' + name0 + ' » supprimée');
};
if (!A.closeSheet) A.closeSheet = () => closeSheet();
