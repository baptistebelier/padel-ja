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
/* Base neutre (maquette Figma « /Buvette v2 », choix de Baptiste) : crème le jour, anthracite gris-bleu la nuit,
   légèrement teintée par la couleur principale du club (TEINTE : part de la couleur du club, [jour, nuit]) */
const BASE = {
  true: { bg: '#1C1F24', card: '#2A2E35', card2: '#343941', line: '#454B55', fg: '#F2F0EB', muted: '#C7CAD1' },
  false: { bg: '#F1ECE3', card: '#FFFCF7', card2: '#F6F1E8', line: '#E3DDD2', fg: '#16191E', muted: '#5B606B' }
};
const TEINTE = { bg: [0.07, 0.1], card: [0.025, 0.07], card2: [0.05, 0.08], line: [0.08, 0.1] };
/* héros et surtitres sans couleur de club réglée */
const HERO_BASE = { true: '#3B4250', false: '#2A2F38' },
  KICK_BASE = { true: '#FF94AD', false: '#B0123F' };
// rose /RAM (maquette Figma) pour le direct et le danger, texte foncé dessus ; vert pour le padel
const HOT = '#FF3D6B',
  PADEL = '#9BD43C';
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
    main = c.main || c.accent,
    // base neutre teintée par la couleur principale du club ; une couleur réglée par le club garde la priorité
    b = Object.fromEntries(
      Object.entries(BASE[dk]).map(([k, v]) => [k, TEINTE[k] && main ? mix(v, main, TEINTE[k][dk ? 1 : 0]) : v])
    ),
    acc = derive(c.accent, c.bg || b.bg).col;
  Object.keys(b).forEach(k => r.setProperty('--' + k, c[k] || b[k]));
  r.setProperty('--accent', acc);
  // carte héros à la couleur principale du club (texte au meilleur contraste), ombre de l'autre accent ;
  // surtitres à la couleur du club rendue lisible sur le fond
  const hero = main || HERO_BASE[dk],
    accs = [c.accent, c.accent2, HOT].filter(Boolean);
  r.setProperty('--hero', hero);
  r.setProperty('--on-hero', onColor(hero));
  r.setProperty('--hero-sh', accs.find(x => x.toLowerCase() !== hero.toLowerCase()) || '#E0F50A');
  r.setProperty('--kick', main ? derive(main, c.bg || b.bg).col : KICK_BASE[dk]);
  /* menus (refonte Figma) : couleur principale du club si elle est foncée, bordeaux /RAM sinon ;
     sous-menu plus sombre ; élément actif à la couleur d'accent, citron si elle se confond avec le menu */
  const menu = main && lum(main) < 0.2 ? main : '#74102A',
    act = contrast(c.accent, menu) >= 2.5 ? c.accent : '#E0F50A';
  r.setProperty('--menu', menu);
  r.setProperty('--menu2', mix(menu, '#000000', 0.38));
  r.setProperty('--on-menu', onColor(menu));
  r.setProperty('--menu-act', act);
  r.setProperty('--on-menu-act', onColor(act));
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
  // couleur du club telle quelle pour les fonds (boutons, onglet actif, pastilles), la version ajustée restant celle du texte
  r.setProperty('--accent-bg', c.accent);
  r.setProperty('--on-accent-bg', onColor(c.accent));
  r.setProperty('--hot', HOT);
  r.setProperty('--accent2', c.accent2 || HOT);
  const rl = clubLogo(c);
  r.setProperty(
    '--rail-logo',
    rl ? `url("${rl}")` : `url("${c.dark ? 'img/ram-club-blanc.png' : 'img/ram-club-noir.png'}")`
  );
  r.setProperty('--on-hot', '#1A0509');
  // encre des traits et des ombres dures, et couleur « éteinte » (désactivé, interrupteur coupé)
  r.setProperty('--ink', dk ? '#000000' : '#16191E');
  r.setProperty('--off', b.line);
  r.setProperty('--field', dk ? mix(b.bg, b.card, 0.5) : b.card2);
  r.setProperty('--padel', PADEL);
  r.setProperty('--stage', dk ? mix(b.bg, '#000000', 0.25) : b.line);
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
  // déjà arrivée par le serveur (panneau) : pas de doublon
  if (go && NOTIFS.some(n => n.srv && n.go && n.go.v === go.v && n.go.id === go.id && Date.now() - n.at < 3e5)) return;
  NOTIFS.unshift({ by, txt, t: "À l'instant", n: 1, go, at: Date.now() });
  trimNotifs();
  if (!quiet) banner(NOTIFS[0]);
}
/* panneau de notifications : ajoute ce que le serveur a gardé pour ce compte, même reçu appli fermée */
const notifGo = u => {
  const m = String(u || '').match(/#\/([a-z]+)(?:\/([^/?#]+))?/i);
  return m ? (m[2] ? { v: m[1], id: decodeURIComponent(m[2]) } : { v: m[1] }) : null;
};
window.ramNotifsMerge = items => {
  let n = 0;
  items
    .slice()
    .reverse()
    .forEach(x => {
      const id = 'srv-' + x.id;
      if (NOTIFS.some(y => y.id === id)) return;
      const go = notifGo(x.url),
        cl = (String(x.url).match(/[?&]club=([\w-]+)/) || [])[1],
        // la même chose déjà notée par cet appareil, appli ouverte : pas de doublon
        deja = NOTIFS.some(
          y => !y.srv && y.go && go && y.go.v === go.v && y.go.id === go.id && Math.abs((y.at || 0) - x.at) < 3e5
        );
      if (deja) return;
      const ici = !cl || !window.RAM || cl === RAM.club;
      NOTIFS.unshift({
        id,
        srv: 1,
        by: 'club',
        txt: (ici ? ': ' : 'de ' + x.title + ' : ') + x.body,
        t: '',
        n: 1,
        at: x.at,
        go,
        url: x.url,
        coach: 1
      });
      n++;
    });
  if (n) trimNotifs();
  return n;
};
/* Historique des notifications : toutes celles des 7 derniers jours, et au moins les 20 dernières (même plus anciennes) */
const NOTIF_DAYS = 7,
  NOTIF_MIN = 20,
  NOTIF_MAX = 100;
function trimNotifs() {
  const lim = Date.now() - NOTIF_DAYS * 864e5;
  NOTIFS.sort((a, b) => (b.at || Infinity) - (a.at || Infinity));
  for (let i = NOTIFS.length - 1; i >= NOTIF_MIN; i--)
    if (i >= NOTIF_MAX || (NOTIFS[i].at && NOTIFS[i].at < lim)) NOTIFS.splice(i, 1);
}
/* « Il y a 5 min », « Hier »… pour l'historique (les notifications de démo gardent leur texte) */
function ago(n) {
  if (!n.at) return n.t || '';
  const s = (Date.now() - n.at) / 1000;
  if (s < 60) return "À l'instant";
  if (s < 3600) return 'Il y a ' + Math.floor(s / 60) + ' min';
  if (s < 86400) return 'Il y a ' + Math.floor(s / 3600) + ' h';
  if (s < 2 * 86400) return 'Hier';
  return 'Il y a ' + Math.floor(s / 86400) + ' jours';
}
/* Nouveautés depuis la dernière visite de chaque onglet : pastilles du menu, « Nouveau » sur le mur.
   SEEN.at : dernière visite (enregistrée et partagée entre appareils par ram-sync.js) ;
   SEEN.prev : visite d'avant, figée pendant qu'on regarde l'onglet. Démo : rien n'est marqué. */
const SEEN = { at: {}, prev: {} };
const isNew = (tab, at, by, wr) => !!at && by !== ME() && wr !== ME() && SEEN.prev[tab] != null && at > SEEN.prev[tab];
function tabNews(tab) {
  const since = SEEN.at[tab],
    me = ME(),
    kids = (M[me] && M[me].kids) || [];
  if (since == null || pending()) return 0;
  const aft = x => (x.at || 0) > since;
  if (tab === 'home') return posts.filter(p => p.kind !== 'ad' && p.by !== me && aft(p) && canSee(p)).length;
  if (tab === 'agenda')
    return (
      recs.filter(r => !r.arch && aft(r)).length +
      posts.filter(p => p.kind === 'event' && p.by !== me && aft(p) && canSee(p)).length
    );
  if (tab === 'ecole')
    return (
      GROUPS.filter(g => g.type !== 'team' && aft(g) && (g.mem || []).some(k => k === me || kids.includes(k))).length +
      NOTIFS.filter(n => n.n && n.go && (n.go.v === 'ecole' || n.go.ag === 'cours') && nVis(n)).length
    );
  if (tab === 'club')
    return (
      arts.filter(aft).length +
      COMMS.filter(aft).length +
      PARTNERS.filter(aft).length +
      (isBureau() ? JOINREQ.length : 0)
    );
  return 0;
}
