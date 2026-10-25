/* /RAM Club — app/12-finitions.js : petites animations qui rendent l'appli agréable à utiliser.
   Cœurs qui jaillissent sur un like, confettis quand on s'inscrit (événement, partie, cours),
   cloche qui s'agite à l'arrivée d'une notification, icône d'onglet qui rebondit, vibration légère
   (seulement si « Sons et vibrations » est activé dans le profil et que le téléphone sait vibrer).
   Rien ne bouge si le téléphone demande de réduire les animations.
   Les actions d'origine ne changent pas : on les enveloppe, puis on ajoute l'effet. */
const fxCalm = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
function fxBuzz(p) {
  if (!S.sound || !navigator.vibrate) return;
  try {
    navigator.vibrate(p);
  } catch (e) {}
}
const fxAt = el => {
  if (!el || !el.getBoundingClientRect) return null;
  const r = el.getBoundingClientRect();
  return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null;
};
/* particules autour d'un point de l'écran ; conf : confettis qui retombent */
function fxBurst(pt, conf) {
  if (!pt || fxCalm()) return;
  const d = document.createElement('div'),
    cols = conf ? ['var(--accent)', 'var(--hot)', 'var(--accent2, var(--hot))', 'var(--fg)'] : ['var(--hot)'],
    n = conf ? 22 : 9;
  d.className = 'fx' + (conf ? ' conf' : '');
  d.style.transform = `translate(${pt[0]}px, ${pt[1]}px)`;
  d.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.5,
      r = conf ? 50 + Math.random() * 70 : 22 + Math.random() * 16,
      p = document.createElement('i');
    p.style.cssText = `--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r - (conf ? 40 : 0)}px;--r:${Math.random() * 720 - 360}deg;--c:${cols[i % cols.length]};--t:${conf ? 0.9 + Math.random() * 0.4 : 0.6}s`;
    d.appendChild(p);
  }
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 1500);
}
/* envelopper une action : l'effet part du bouton touché, après l'action */
function fxWrap(name, after) {
  const f = A[name];
  if (typeof f !== 'function') return;
  A[name] = function (d, el) {
    const pt = fxAt(el),
      out = f.apply(this, arguments);
    try {
      after(d || {}, pt);
    } catch (e) {}
    return out;
  };
}
// like : une gerbe de petits cœurs
fxWrap('like', (d, pt) => {
  if (S.liked.has(d.id)) {
    fxBurst(pt);
    fxBuzz(8);
  }
});
// inscription à un événement, à une partie, présence confirmée à un cours : confettis
fxWrap('rsvp', (d, pt) => {
  const p = posts.find(x => x.id === d.id);
  if (p && p.my === 'yes') {
    fxBurst(pt, true);
    fxBuzz([10, 40, 10]);
  }
});
fxWrap('play', (d, pt) => {
  const p = posts.find(x => x.id === d.id);
  if (p && p.play && d.r === 'in' && p.play.in.includes(ME())) {
    fxBurst(pt, true);
    fxBuzz([10, 40, 10]);
  }
});
fxWrap('cresp', (d, pt) => {
  const g = grp(d.g),
    v = g && g.resp && g.resp[d.d] && g.resp[d.d][d.u];
  if (v === 'ok') {
    fxBurst(pt);
    fxBuzz(8);
  }
});
// changement d'onglet : l'icône de l'onglet ouvert rebondit
fxWrap('tab', () => {
  if (fxCalm()) return;
  const s = document.querySelector('.tabs button[aria-current="page"] svg');
  if (!s) return;
  s.classList.remove('bnc');
  void s.getBoundingClientRect();
  s.classList.add('bnc');
});
// interrupteurs : petite vibration
document.addEventListener('click', e => {
  if (e.target.closest && e.target.closest('.tg')) fxBuzz(6);
});
// nouvelle notification : la cloche s'agite
const fxNotify = notify;
notify = function () {
  const before = NOTIFS.length,
    out = fxNotify.apply(this, arguments);
  if (NOTIFS.length > before && !fxCalm())
    setTimeout(() => {
      const b = document.querySelector('#top [data-a="notifs"]');
      if (!b) return;
      b.classList.remove('ring');
      void b.getBoundingClientRect();
      b.classList.add('ring');
      setTimeout(() => b.classList.remove('ring'), 900);
    }, 60);
  return out;
};
