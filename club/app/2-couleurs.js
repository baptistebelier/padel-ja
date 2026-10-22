/* /RAM Club — app/2-couleurs.js : Couleurs du club (lisibilité, contraste) et notifications.
   Morceau de l'ancien app.js : les fichiers app/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
/* Couleurs : le club choisit une seule couleur ; l'appli l'ajuste pour qu'elle reste lisible sur le fond et choisit le texte noir ou blanc au meilleur contraste. Le rouge d'alerte et le bleu padel sont fixes. */
function lum(hex) {
  const n = parseInt(hex.slice(1), 16),
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => {
  const x = lum(a),
    y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const onColor = hex => (contrast(hex, '#0B0B0B') >= contrast(hex, '#FFFFFF') ? '#0B0B0B' : '#FFFFFF');
function mix(hex, to, t) {
  const a = parseInt(hex.slice(1), 16),
    b = parseInt(to.slice(1), 16);
  return (
    '#' +
    [16, 8, 0]
      .map(s =>
        Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  );
}
function derive(acc, bg) {
  let c = acc,
    t = 0;
  const to = lum(bg) < 0.2 ? '#FFFFFF' : '#000000';
  while (contrast(c, bg) < 4.5 && t < 1) {
    t = Math.min(1, t + 0.05);
    c = mix(acc, to, t);
  }
  return { col: c, adj: c.toLowerCase() !== acc.toLowerCase() };
}
const BASE = {
  true: { bg: '#0B0B0B', card: '#161616', card2: '#222222', line: '#2E2E2E', fg: '#F5F3EE', muted: '#A09C93' },
  false: { bg: '#F3F5FA', card: '#FFFFFF', card2: '#E4E9F3', line: '#D0D7E5', fg: '#0C1630', muted: '#5A647E' }
};
const HOT = '#E0123C',
  PADEL = '#2459E0';
/* logo entier du club qui ressort sur son fond : logo clair sur fond sombre, logo sombre sur fond clair (l'autre en secours) */
const clubLogo = c => ((c = c || club()), effDark(c) ? c.logoL || c.logoD : c.logoD || c.logoL) || '';
function setTheme(i) {
  S.club = i;
  const c0 = CLUBS[i],
    dk = effDark(c0),
    c =
      dk === !!c0.dark
        ? c0
        : Object.assign({}, c0, { dark: dk, bg: null, card: null, card2: null, line: null, fg: null, muted: null }),
    r = document.documentElement.style,
    b = BASE[dk],
    acc = derive(c.accent, c.bg || b.bg).col;
  Object.keys(b).forEach(k => r.setProperty('--' + k, c[k] || b[k]));
  r.setProperty('--accent', acc);
  /* Rouge d'alerte utilisé comme couleur de texte (« Perf ! », « En jeu », « Supprimer ») : ajusté pour atteindre 4,5:1 sur la surface la plus défavorable du thème */
  const sf = [c.bg || b.bg, c.card || b.card, c.card2 || b.card2],
    to = c.dark ? '#FFFFFF' : '#000000';
  let ht = HOT,
    t = 0;
  while (Math.min(...sf.map(x => contrast(ht, x))) < 4.7 && t < 1) {
    t = Math.min(1, t + 0.03);
    ht = mix(HOT, to, t);
  }
  r.setProperty('--hot-tx', ht);
  r.setProperty('--on-accent', onColor(acc));
  r.setProperty('--hot', HOT);
  r.setProperty('--accent2', c.accent2 || HOT);
  const rl = clubLogo(c);
  r.setProperty(
    '--rail-logo',
    rl ? `url("${rl}")` : `url("${c.dark ? 'img/ram-club-blanc.png' : 'img/ram-club-noir.png'}")`
  );
  r.setProperty('--on-hot', '#FFFFFF');
  r.setProperty('--padel', PADEL);
  r.setProperty('--stage', c.dark ? '#050505' : '#DDE2EC');
  r.colorScheme = c.dark ? 'dark' : 'light';
  try {
    localStorage.setItem('club-theme', i);
  } catch (e) {}
}
function lookPrev() {
  const p = $('lk-prev');
  if (!p) return;
  const dark = $('lk-bg').value === 'Sombre',
    b = BASE[dark],
    acc = $('lk-acc').value,
    acc2 = $('lk-acc2').value,
    dv = derive(acc, b.bg),
    on = onColor(dv.col),
    cr = contrast(dv.col, b.bg).toFixed(1),
    lg = dark ? S.logoL || club().logoL || S.logoD || club().logoD : S.logoD || club().logoD || S.logoL || club().logoL;
  p.innerHTML = `${dv.adj ? `<div class="lkadj"><span class="sw2" style="background:${acc}"></span><span class="arrow">→</span><span class="sw2" style="background:${dv.col}"></span><span class="grow small">Ta couleur sera légèrement ${lum(dv.col) > lum(acc) ? 'éclaircie' : 'assombrie'} pour rester lisible sur ce fond.</span></div>` : ''}<div class="lkp" style="background:${b.bg};color:${b.fg}">${lg ? `<img src="${lg}" alt="" style="height:34px;max-width:140px;object-fit:contain;object-position:left">` : ''}<span style="font-family:var(--f-display);font-style:italic;font-size:22px;text-transform:uppercase">Doubles <span style="color:${dv.col}">et barbecue</span></span><span style="background:${dv.col};color:${on};padding:8px 14px;font-weight:700;box-shadow:4px 4px 0 ${acc2}">Je m'inscris</span><span style="color:${dv.col};font-family:var(--f-display);font-size:26px">6 · 4</span></div><p class="muted small" style="margin-top:6px">${dv.adj ? `Aperçu : ta couleur est ajustée en ${dv.col} pour rester lisible sur ce fond (contraste ${cr}:1).` : `Aperçu : contraste ${cr}:1, lisible.`}</p>`;
}

function notify(type, by, txt, go, quiet) {
  if (!S.nset[type] || by === ME()) return;
  NOTIFS.unshift({ by, txt, t: "À l'instant", n: 1, go });
  if (NOTIFS.length > 30) NOTIFS.pop();
  if (!quiet) banner(NOTIFS[0]);
}
