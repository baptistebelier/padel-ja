/* ---------- Sons de l'appli : synthétisés dans le navigateur (aucun fichier audio), courts et discrets ---------- */
let AC = null,
  NZ = null;
/* Sons activés par défaut ; chacun peut les couper dans son profil (choix mémorisé sur l'appareil) */
try {
  S.sound = localStorage.getItem('club-sound') !== '0';
} catch (e) {
  S.sound = true;
}
function actx() {
  if (!AC) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    AC = new C();
  }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
/* iPhone : le son ne peut démarrer qu'après un premier toucher */
document.addEventListener(
  'pointerdown',
  () => {
    if (S.sound) actx();
  },
  { passive: true }
);
function tone(f, t, d, o = {}) {
  const a = AC,
    os = a.createOscillator(),
    g = a.createGain();
  os.type = o.w || 'sine';
  os.frequency.setValueAtTime(f, t);
  if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t + d * 0.8);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.g || 0.06, t + (o.a || 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  os.connect(g).connect(a.destination);
  os.start(t);
  os.stop(t + d + 0.03);
}
function noise(t, d, f, v) {
  const a = AC;
  if (!NZ) {
    NZ = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate);
    const c = NZ.getChannelData(0);
    for (let i = 0; i < c.length; i++) c[i] = Math.random() * 2 - 1;
  }
  const s = a.createBufferSource(),
    bp = a.createBiquadFilter(),
    g = a.createGain();
  s.buffer = NZ;
  bp.type = 'bandpass';
  bp.frequency.value = f;
  bp.Q.value = 1.2;
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(bp).connect(g).connect(a.destination);
  s.start(t);
  s.stop(t + d + 0.02);
}
const SFX = {
  tap: t => tone(1100, t, 0.04, { to: 760, g: 0.022 }),
  like: t => {
    tone(587, t, 0.09, { to: 880, g: 0.06, w: 'triangle' });
    tone(880, t + 0.07, 0.13, { to: 1320, g: 0.05 });
  },
  send: t => {
    tone(340, t, 0.17, { to: 1020, g: 0.045, w: 'triangle' });
    noise(t, 0.12, 2600, 0.018);
  },
  notif: t => {
    tone(988, t, 0.2, { g: 0.06 });
    tone(1319, t + 0.09, 0.3, { g: 0.05 });
  },
  live: t => {
    noise(t, 0.05, 1700, 0.11);
    tone(740, t + 0.05, 0.14, { g: 0.05, w: 'triangle' });
    tone(988, t + 0.14, 0.24, { g: 0.05, w: 'triangle' });
  },
  ok: t => tone(1047, t, 0.12, { g: 0.03 }),
  trophy: (t, k) => {
    const N = [
      [523, 659, 784],
      [587, 740, 880, 1175],
      [659, 831, 988, 1319],
      [784, 988, 1175, 1568, 1976]
    ][k || 0];
    N.forEach((f, i) => tone(f, t + i * 0.09, 0.38, { g: 0.06, w: 'triangle' }));
    if (k)
      [2093, 2637, 3136].slice(0, k + 1).forEach((f, i) => tone(f, t + N.length * 0.09 + i * 0.06, 0.3, { g: 0.022 }));
  },
  frame: t => {
    [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.08, 0.55, { g: 0.055, w: 'triangle' }));
    tone(1568, t + 0.45, 0.9, { g: 0.035 });
    noise(t + 0.42, 0.6, 6500, 0.012);
  }
};
function play(k, x) {
  if (!S.sound) return;
  /* compte pas encore validé pour la saison : aucun son de notification */ if (pending() && k !== 'ok') return;
  const a = actx();
  if (!a || !SFX[k]) return;
  try {
    SFX[k](a.currentTime + 0.01, x);
  } catch (e) {}
}
/* Branchements, une fois toute l'appli chargée */
window.addEventListener('DOMContentLoaded', () => {
  const oLike = A.like;
  A.like = d => {
    oLike(d);
    if (S.liked.has(d.id)) play('like');
  };
  A.sound = () => {
    S.sound = !S.sound;
    try {
      localStorage.setItem('club-sound', S.sound ? '1' : '0');
    } catch (e) {}
    render(true);
    if (S.sound) play('notif');
  };
  const oBan = banner;
  banner = n => {
    if (n.tier == null && !S.blocked.has(n.by) && nVis(n)) play(n.live || n.head ? 'live' : 'notif');
    return oBan(n);
  };
  const oToast = toast;
  toast = (m, u) => {
    play('ok');
    return oToast(m, u);
  };
  let sent = null;
  document.addEventListener(
    'submit',
    e => {
      const i = e.target.querySelector('#msg-input,#com-input');
      sent = i && i.value.trim() ? 1 : null;
    },
    true
  );
  document.addEventListener('submit', () => {
    if (sent) {
      const i = $('msg-input') || $('com-input');
      if (!i || !i.value.trim()) play('send');
    }
    sent = null;
  });
});
