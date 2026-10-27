/* /RAM Club — app/14-discussions.js : discussions plus vivantes, façon WhatsApp.
   - Glisser un message vers la droite : on y répond (comme l'appui long, « Répondre »).
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

/* ---------- glisser un message vers la droite pour y répondre ---------- */
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
      swp.lock = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.4;
      if (!swp.lock) {
        swp = null;
        return;
      }
      swp.w.classList.add('swiping');
    }
    swp.dx = Math.max(0, Math.min(SWP_MAX, dx * 0.85));
    swp.w.style.transform = `translateX(${swp.dx}px)`;
    swp.w.style.setProperty('--rp', Math.min(1, swp.dx / SWP_GO));
    if (swp.dx >= SWP_GO && !swp.fired) {
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
  if (s.dx >= SWP_GO) A.reply(s.b.dataset);
};
document.addEventListener('touchend', swpEnd, { passive: true });
document.addEventListener('touchcancel', swpEnd, { passive: true });
