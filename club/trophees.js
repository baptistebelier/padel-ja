/* ---------- Trophées : récompenser la participation à la vie du club ---------- */
const TIERS = ['Bronze', 'Argent', 'Or', 'Platine'],
  TPTS = [10, 25, 60, 150],
  RPTS = [20, 60, 150, 300];
/* Trophées à paliers : chaque seuil atteint (bronze, argent, or, platine) rapporte des points ; u = unité affichée, m = décerné uniquement par le club */
const TROPHIES = [
  {
    id: 'like',
    n: 'Supporter',
    d: 'Aimer les publications du club',
    u: 'publications aimées',
    t: [10, 100, 400, 1000],
    i: 'heart'
  },
  { id: 'com', n: 'Commentateur', d: 'Commenter les publications', u: 'commentaires', t: [5, 50, 200, 500], i: 'com' },
  {
    id: 'msg',
    n: 'Pilier des groupes',
    d: 'Écrire dans les groupes de discussion',
    u: 'messages',
    t: [20, 250, 1000, 3000],
    i: 'chat'
  },
  {
    id: 'react',
    n: 'Expressif',
    d: 'Réagir aux messages avec un emoji',
    u: 'réactions',
    t: [10, 100, 400, 1000],
    i: 'heart'
  },
  {
    id: 'evt',
    n: 'Toujours partant',
    d: "S'inscrire aux événements du club",
    u: 'inscriptions',
    t: [1, 5, 15, 30],
    i: 'cal'
  },
  {
    id: 'volu',
    cl: 1,
    n: 'Coup de main',
    d: "S'inscrire comme bénévole pour aider à organiser un événement",
    u: 'événements aidés',
    t: [1, 3, 8, 15],
    i: 'users'
  },
  { id: 'stage', n: 'Stagiaire', d: "S'inscrire à des stages", u: 'stages', t: [1, 3, 6, 10], i: 'ball' },
  {
    id: 'train',
    n: 'Assidu',
    d: 'Confirmer sa présence aux cours collectifs',
    u: 'cours confirmés',
    t: [5, 25, 60, 120],
    i: 'school'
  },
  {
    id: 'streak',
    n: 'Sur sa lancée',
    d: "Confirmer des cours d'affilée sans absence",
    u: "cours d'affilée",
    t: [4, 10, 20, 40],
    i: 'clock'
  },
  {
    id: 'team',
    n: "Esprit d'équipe",
    d: 'Répondre présent aux convocations de son équipe',
    u: 'convocations acceptées',
    t: [1, 5, 15, 40],
    i: 'users'
  },
  {
    id: 'live',
    n: 'Tribune',
    d: 'Encourager son équipe pendant un direct',
    u: 'messages en direct',
    t: [5, 50, 200, 500],
    i: 'score'
  },
  {
    id: 'palm',
    n: 'Palmarès',
    d: 'Ajouter ses résultats à son palmarès',
    u: 'résultats',
    t: [1, 10, 30, 75],
    i: 'trophy'
  },
  {
    id: 'rank',
    n: 'Classement à jour',
    d: 'Mettre à jour son classement',
    u: 'mises à jour',
    t: [1, 3, 6, 10],
    i: 'poll'
  },
  { id: 'poll', n: 'Citoyen', d: 'Voter aux sondages du club', u: 'votes', t: [1, 10, 25, 50], i: 'poll' },
  { id: 'follow', n: 'Réseau', d: "Suivre d'autres adhérents", u: 'adhérents suivis', t: [3, 15, 40, 100], i: 'user' },
  {
    id: 'fidele',
    cl: 1,
    n: 'Fidèle',
    d: "Ancienneté au club, décernée par le bureau ou l'enseignant",
    u: 'saisons au club',
    t: [1, 3, 5, 10],
    i: 'club',
    m: 1
  }
];
/* Trophées rares : obtenus une fois. m = décerné par le club (ou automatiquement) */
const RARES = [
  { id: 'hello', n: 'Bienvenue', d: "Rejoindre l'appli du club", r: 0, i: 'club', ok: () => true },
  {
    id: 'profil',
    n: "Carte d'identité",
    d: 'Compléter ses informations personnelles',
    r: 0,
    i: 'user',
    ok: id => ST(id).k.has('profil')
  },
  { id: 'photo', n: 'Photogénique', d: 'Ajouter une photo de profil', r: 0, i: 'image', ok: id => !!M[id].photo },
  {
    id: 'famille',
    n: 'Esprit de famille',
    d: 'Relier le compte de son enfant',
    r: 1,
    i: 'users',
    ok: id => (M[id].kids || []).length > 0
  },
  {
    id: 'finale',
    cl: 1,
    n: 'Finaliste',
    d: "Jouer la finale d'un tournoi (case « finale » cochée en tennis, 1re ou 2e place en padel)",
    r: 1,
    i: 'trophy',
    ok: id => M[id].res.some(r => r.fin) || (M[id].pres || []).some(r => r.place === '1er' || r.place === '2e')
  },
  {
    id: 'titre',
    cl: 1,
    n: 'Vainqueur de tournoi',
    d: 'Remporter un tournoi (finale gagnée en tennis, 1re place en padel)',
    r: 2,
    i: 'trophy',
    ok: id => M[id].res.some(r => r.fin && r.w) || (M[id].pres || []).some(r => r.place === '1er')
  },
  {
    id: 'comm',
    cl: 1,
    n: 'Bénévole',
    d: 'Entrer dans une commission du club',
    r: 2,
    i: 'flag',
    ok: id => COMMS.some(c => c.mem.includes(id))
  },
  {
    id: 'cap',
    cl: 1,
    n: 'Capitaine',
    d: "Devenir capitaine d'une équipe",
    r: 2,
    i: 'shield',
    ok: id => GROUPS.some(g => g.cap === id)
  },
  {
    id: 'coach',
    cl: 1,
    n: 'Pédagogue',
    d: 'Enseigner au club',
    r: 2,
    i: 'school',
    ok: id => GROUPS.some(g => g.coach === id)
  },
  {
    id: 'champion',
    cl: 1,
    n: 'Champion',
    d: 'Monter de division ou finir 1er avec son équipe, en ayant joué au moins un match. Donné automatiquement quand le capitaine clôture le championnat',
    r: 3,
    i: 'trophy',
    m: 1,
    ok: () => false
  },
  {
    id: 'invaincu',
    cl: 1,
    n: 'Invaincu',
    d: 'Finir la saison sans perdre un match par équipe. Vérifié automatiquement à la clôture de la saison',
    r: 3,
    i: 'shield',
    m: 1,
    ok: () => false
  },
  {
    id: 'roi',
    cl: 1,
    n: 'Roi du terrain',
    d: 'Gagner une animation montée-descente /RAM JA du club (finir 1er sur le terrain du roi)',
    r: 2,
    i: 'trophy',
    ok: id =>
      posts.some(
        p =>
          p.kind === 'jatour' &&
          p.ja &&
          p.ja.ani &&
          p.ja.status === 'done' &&
          /^Mont/.test(p.ja.fmt || '') &&
          (((p.ja.results || [])[0] || {}).k || []).includes(id)
      )
  },
  {
    id: 'bureau',
    cl: 1,
    n: 'Au bureau',
    d: 'Être élu au bureau du club',
    r: 3,
    i: 'club',
    ok: id => (window.RAM && RAM.roles && RAM.club ? RAM.roles[id] === 'bureau' : id === ME() && S.role === 'admin')
  }
];
const RAR = ['Courant', 'Peu courant', 'Rare', 'Très rare'];
/* Cadres autour de l'avatar, débloqués par le score d'investissement */
const FRAMES = [
  { n: 'Sans cadre', min: 0 },
  { n: 'Bronze', min: 150 },
  { n: 'Argent', min: 500 },
  { n: 'Or', min: 1200 },
  { n: 'Platine', min: 2500 },
  { n: 'Diamant', min: 4500 }
];
/* Historique de démo : les autres adhérents ont déjà des points, toi tu as des compteurs */
const XP = {
  hugo: 1700,
  sarah: 2900,
  mehdi: 1250,
  thomas: 4700,
  ines: 2100,
  marc: 650,
  nathan: 480,
  emma: 300,
  antoine: 200,
  paul: 4900,
  julie: 90,
  leo: 380
};
const STATS = {};
const ST = id => STATS[id] || (STATS[id] = { c: {}, k: new Set(), got: {}, lvl: null });
Object.assign(ST('me').c, {
  like: 120,
  com: 30,
  msg: 180,
  react: 40,
  evt: 6,
  train: 30,
  streak: 6,
  streakCur: 3,
  team: 6,
  live: 20,
  palm: 4,
  rank: 2,
  poll: 4,
  follow: 12,
  fidele: 4,
  ap: 454
});
ST('me').k.add('profil');
ST('thomas').k.add('award:invaincu');
ST('leo').c.train = 6;
/* Demandes de trophées envoyées au club */
const CLAIMS = [
  { id: 'cl1', by: 'thomas', tid: 'fidele', tier: 3, msg: 'Dixième saison au club cette année !', st: 'wait' }
];
const tierOf = (t, v) => t.t.filter(x => v >= x).length;
const sumT = n => TPTS.slice(0, n).reduce((a, b) => a + b, 0);
const rOk = (r, id) => r.ok(id) || ST(id).k.has('award:' + r.id);
const findT = tid => TROPHIES.find(t => t.id === tid) || RARES.find(r => r.id === tid);
function ptsOf(id) {
  if (!M[id]) return 0;
  const s = ST(id);
  return (
    TROPHIES.reduce((a, t) => a + sumT(tierOf(t, s.c[t.id] || 0)), 0) +
    RARES.reduce((a, r) => a + (rOk(r, id) ? RPTS[r.r] : 0), 0)
  );
}
/* Score = historique de démo + points des trophées + 1 point par action (ap) */
const score = id => (XP[id] || 0) + ptsOf(id) + (ST(id).c.ap || 0);
const lvlOf = id => {
  const s = score(id);
  let l = 0;
  FRAMES.forEach((f, i) => {
    if (s >= f.min) l = i;
  });
  return l;
};
const frc = id => {
  if (!M[id] || id === 'club') return '';
  const l = lvlOf(id);
  return l ? ' fr' + l : '';
};
const staff = () => S.role === 'admin' || S.role === 'coach';
/* Gagner : chaque action ne compte qu'une fois par élément (pas de points en aimant et retirant en boucle) */
function gain(stat, key) {
  const s = ST(ME());
  if (key != null) {
    const k = stat + ':' + key;
    if (s.k.has(k)) return;
    s.k.add(k);
  }
  s.c[stat] = (s.c[stat] || 0) + 1;
  s.c.ap = (s.c.ap || 0) + 1;
  check();
}
/* Annuler une action (désinscription, like retiré, commentaire supprimé…) retire le point et fait redescendre le compteur du trophée */
function lose(stat, key) {
  const s = ST(ME());
  if (key != null) {
    const k = stat + ':' + key;
    if (!s.k.has(k)) return;
    s.k.delete(k);
  }
  if (!(s.c[stat] > 0)) return;
  s.c[stat]--;
  s.c.ap = Math.max(0, (s.c.ap || 0) - 1);
  const t = TROPHIES.find(t => t.id === stat);
  if (t) s.got[stat] = Math.min(s.got[stat] || 0, tierOf(t, s.c[stat]));
  const L = lvlOf(ME());
  if (s.lvl != null && L < s.lvl) s.lvl = L;
  render(true);
}
/* Avant de remettre la saison à zéro : on fige les trophées calculés à partir du palmarès, des équipes et des groupes */
function freezeTrophies() {
  Object.keys(M).forEach(id => {
    if (id === 'club') return;
    RARES.forEach(r => {
      if (r.id !== 'bureau' && r.ok(id)) ST(id).k.add('award:' + r.id);
    });
  });
}
function check() {
  const id = ME(),
    s = ST(id),
    out = [];
  TROPHIES.forEach(t => {
    const n = tierOf(t, s.c[t.id] || 0);
    if (n > (s.got[t.id] || 0)) {
      if (s.lvl != null) out.push({ t, tier: n - 1, pts: TPTS[n - 1] });
      s.got[t.id] = n;
    }
  });
  RARES.forEach(r => {
    if (!s.got[r.id] && rOk(r, id)) {
      if (s.lvl != null) out.push({ t: r, tier: r.r, pts: RPTS[r.r], rare: 1 });
      s.got[r.id] = 1;
    }
  });
  const L = lvlOf(id),
    up = s.lvl != null && L > s.lvl;
  s.lvl = L;
  out.forEach(o => {
    const lv = o.rare ? RAR[o.t.r].toLowerCase() : TIERS[o.tier].toLowerCase(),
      n = {
        by: 'club',
        kick: 'Trophée débloqué',
        head: `${o.t.n} · ${lv}`,
        det: `${o.t.d} · +${o.pts} pts`,
        tier: o.tier,
        txt: `Trophée débloqué : ${o.t.n} (${lv}) · +${o.pts} pts`,
        t: "À l'instant",
        n: 1,
        go: { v: 'troph', id: id + '|' + o.t.id }
      };
    NOTIFS.unshift(n);
    banner(n);
  });
  if (out.length) play('trophy', Math.max(...out.map(o => o.tier)));
  if (up) {
    const F = FRAMES[L],
      n = {
        by: 'club',
        kick: 'Nouveau cadre',
        head: `Cadre ${F.n} débloqué`,
        det: `${score(id)} points d'investissement · ton avatar change partout`,
        tier: Math.min(3, L - 1),
        frame: L,
        txt: `Nouveau cadre d'avatar : ${F.n}`,
        t: "À l'instant",
        n: 1,
        go: { v: 'trophies' }
      };
    NOTIFS.unshift(n);
    setTimeout(
      () => {
        banner(n);
        play('frame');
        render(true);
      },
      out.length ? 700 : 0
    );
  } else if (out.length) render(true);
}
/* Décerner un trophée (club, automatique ou demande approuvée) : un palier de plus, ou le trophée rare */
function award(id, tid, quiet, tier) {
  const t = findT(tid),
    s = ST(id);
  let lv;
  if (t.t) {
    const n = tierOf(t, s.c[t.id] || 0);
    const k = tier != null ? Math.max(tier, n) : n;
    if (k >= 4) return false;
    s.c[t.id] = t.t[k];
    s.k.add('award:' + t.id + ':' + k);
    lv = TIERS[k].toLowerCase();
  } else {
    if (rOk(t, id)) return false;
    s.k.add('award:' + t.id);
    lv = RAR[t.r].toLowerCase();
  }
  if (id === ME()) check();
  else if (!quiet)
    NOTIFS.unshift({
      by: 'club',
      txt: `te décerne le trophée ${t.n} (${lv})`,
      t: "À l'instant",
      n: 1,
      go: { v: 'troph', id: id + '|' + t.id },
      to: [id]
    });
  return true;
}
/* Clôture du championnat : trophée Champion pour ceux qui ont joué au moins un match (et le capitaine) */
function teamChampion(g) {
  const ids = new Set();
  recs
    .filter(r => r.tid === g.id && !r.arch)
    .forEach(r => {
      (r.ms || []).forEach(m => {
        if (m.a && m.st !== 'soon') ids.add(m.a);
      });
      Object.entries(r.lineup || {}).forEach(([p, v]) => {
        if (v === 'T' && r.st !== 'soon') ids.add(p);
      });
    });
  if (g.cap) ids.add(g.cap);
  let n = 0;
  ids.forEach(p => {
    if (M[p] && award(p, 'champion')) n++;
  });
  return n;
}
/* Clôture de la saison : trophée Invaincu si au moins un match par équipe et aucune défaite */
function seasonTrophies() {
  const pl = {};
  recs
    .filter(r => !r.arch && r.st === 'done')
    .forEach(r =>
      (r.ms || []).forEach(m => {
        if (!m.a || m.st !== 'done') return;
        const p = (pl[m.a] = pl[m.a] || { n: 0, l: 0 });
        p.n++;
        if (m.w === 1) p.l++;
      })
    );
  let n = 0;
  Object.entries(pl).forEach(([p, v]) => {
    if (v.n && !v.l && award(p, 'invaincu')) n++;
  });
  return n;
}
/* ---------- affichage ---------- */
const medal = (i, tier, on) => `<span class="medal ${on ? 't' + tier : 'off'}">${ic(i)}</span>`;
function nextFrame(id) {
  const s = score(id),
    L = lvlOf(id),
    N = FRAMES[L + 1];
  return N ? { n: N.n, need: N.min - s, pc: Math.round(((s - FRAMES[L].min) / (N.min - FRAMES[L].min)) * 100) } : null;
}
function trophyCard(id) {
  const L = lvlOf(id),
    s = score(id),
    self = id === ME(),
    nx = nextFrame(id);
  const own = gotList(id);
  return `<div class="card tcard${L ? ' cf' + L : ''}"><button class="row thead" data-a="open" data-v="trophies" data-id="${id}" style="gap:14px"><span class="medal big t${Math.max(0, Math.min(3, L - 1))} ${L ? '' : 'off'}${L ? ' fr' + L : ''}">${ic('trophy')}</span><span class="grow"><span class="kicker">Investissement au club</span><span class="h3" style="display:block">${s} pts · cadre ${FRAMES[L].n.toLowerCase()}</span>${nx ? `<span class="bar"><i style="width:${nx.pc}%"></i></span><span class="muted small">Encore ${nx.need} pts pour le cadre ${nx.n.toLowerCase()}</span>` : '<span class="muted small">Le plus beau cadre du club</span>'}</span>${ic('back')}</button>
 ${own.length ? `<div class="tstrip">${own.map(o => `<button class="tchip" data-a="open" data-v="troph" data-id="${id}|${o.t.id}">${medal(o.t.i, o.tier, 1)}<span class="sl">${o.t.n}</span><small>${o.lv}</small></button>`).join('')}</div>` : ''}</div>`;
}
/* Trophées obtenus, du plus prestigieux (palier ou rareté qui rapporte le plus) au plus modeste */
function gotList(id) {
  const s = ST(id),
    l = [];
  TROPHIES.forEach(t => {
    const n = tierOf(t, s.c[t.id] || 0);
    if (n) l.push({ t, tier: n - 1, lv: TIERS[n - 1], w: TPTS[n - 1] });
  });
  RARES.forEach(r => {
    if (rOk(r, id)) l.push({ t: r, tier: r.r, lv: RAR[r.r], w: RPTS[r.r] });
  });
  return l.sort((a, b) => b.w - a.w || b.tier - a.tier);
}
/* Jauge du palier en cours : du seuil atteint au seuil suivant */
const tierBar = (t, v) => {
  const n = tierOf(t, v),
    lo = n ? t.t[n - 1] : 0,
    hi = t.t[n];
  return hi ? Math.round(Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * 100) : 100;
};
const pron = id => (id === ME() ? '' : ` de ${first(id)}`);
function trophiesView(id) {
  id = id && M[id] ? id : ME();
  const s = ST(id),
    self = id === ME(),
    sc = score(id),
    L = lvlOf(id),
    nx = nextFrame(id),
    got = TROPHIES.filter(t => tierOf(t, s.c[t.id] || 0)).length + RARES.filter(r => rOk(r, id)).length;
  const tiered = TROPHIES.map(t => {
    const v = s.c[t.id] || 0,
      n = tierOf(t, v),
      nxt = t.t[n];
    return `<button class="tro ${n ? '' : 'lock'}" data-a="open" data-v="troph" data-id="${id}|${t.id}">${medal(t.i, n - 1, n)}<span class="grow"><span class="nm">${t.n}</span>${n ? ` <span class="tier t${n - 1}">${TIERS[n - 1]}</span>` : ''}<br><span class="muted small">${t.d}</span><span class="bar tb ${nxt ? '' : 'full'}"><i class="t${Math.min(3, n)}" style="width:${tierBar(t, v)}%"></i></span><span class="small muted">${nxt ? `${v} / ${nxt} pour ${n === 2 ? "l'or" : 'le ' + TIERS[n].toLowerCase()}` : 'Collection complète'}</span></span></button>`;
  }).join('');
  const rares = RARES.map(r => {
    const on = rOk(r, id);
    return `<button class="tro ${on ? '' : 'lock'}" data-a="open" data-v="troph" data-id="${id}|${r.id}">${medal(r.i, r.r, on)}<span class="grow"><span class="nm">${r.n}</span> <span class="tier t${r.r}">${RAR[r.r]}</span><br><span class="muted small">${RPTS[r.r]} pts</span></span>${on ? `<span class="st ok">${ic('check')}</span>` : ''}</button>`;
  }).join('');
  const board = Object.keys(M)
      .filter(x => x !== 'club' && (!isMinor(x) || seesMinors()))
      .sort((a, b) => score(b) - score(a))
      .slice(0, 10),
    nc = CLAIMS.filter(c => c.st === 'wait').length;
  return `<div class="pad">${self && staff() && nc ? `<button class="note" data-a="open" data-v="claims" style="width:100%;text-align:left"><b>${nc} demande${nc > 1 ? 's' : ''} de trophée</b> à examiner</button>` : ''}<div class="thero tsec">${av(id, 'xl')}<div class="grow"><span class="kicker">Score d'investissement${pron(id)}</span><span class="tscore">${sc}<small> pts</small></span><span class="muted small">${ptsOf(id)} pts de trophées · ${ST(id).c.ap || 0} pts d'activité${XP[id] ? ` · ${XP[id]} pts des saisons passées` : ''}</span><span class="muted small">${got} trophées sur ${TROPHIES.length + RARES.length} · cadre ${FRAMES[L].n.toLowerCase()}</span>${nx ? `<span class="bar"><i style="width:${nx.pc}%"></i></span><span class="muted small">Encore ${nx.need} pts pour le cadre ${nx.n.toLowerCase()}</span>` : '<span class="muted small">Le plus beau cadre du club.</span>'}</div></div>
 ${!self && staff() ? `<div class="note">Touche un trophée pour le décerner à ${first(id)}.</div>` : self ? '<p class="muted small">Chaque action rapporte 1 point d\'activité : like, commentaire, message, réaction, inscription, vote, présence, bénévolat. Annuler l\'action retire le point. Les trophées rapportent beaucoup plus : touche-en un pour voir ses paliers, ou le réclamer au club.</p>' : ''}
 ${self ? `<span class="kicker">Les cadres d'avatar</span><div class="frames tsec">${FRAMES.map((f, i) => `<span class="fx ${i > L ? 'lock' : ''}"><span class="av sm${i ? ' fr' + i : ''}" style="--h:${hue(id)}">${ini(id)}</span><b>${f.n}</b><small>${f.min} pts</small></span>`).join('')}</div>` : ''}
 <span class="kicker">Trophées à paliers</span><div class="tsec">${tiered}</div>
 <span class="kicker">Trophées rares</span><div class="tsec">${rares}</div>
 ${self ? `<span class="kicker">Les plus investis du club</span><div class="tsec">${board.map((x, i) => `<button class="item" data-a="member" data-id="${x}"><b class="rank">${i + 1}</b>${av(x, 'sm')}<span class="grow"><span class="nm">${x === ME() ? 'Toi' : name(x)}</span><br><span class="muted small">Cadre ${FRAMES[lvlOf(x)].n.toLowerCase()}</span></span><b>${score(x)} pts</b></button>`).join('')}</div>` : ''}</div>`;
}
/* Page d'un trophée : paliers, explication, réclamer ou décerner */
function trophyPage(key) {
  const [id, tid] = key.split('|'),
    t = findT(tid),
    s = ST(id),
    self = id === ME(),
    v = s.c[tid] || 0;
  const n = t.t ? tierOf(t, v) : rOk(t, id) ? 1 : 0,
    done = t.t ? n >= 4 : n > 0,
    cl = CLAIMS.find(c => c.by === id && c.tid === tid && c.st === 'wait'),
    nextLv = t.t ? (n < 4 ? TIERS[n] : '') : RAR[t.r];
  const head = `<div class="tdet">${medal(t.i, t.t ? Math.max(0, n - 1) : t.r, n)}<h2 class="h3">${t.n}</h2>${t.t ? (n ? `<span class="tier t${n - 1}">${TIERS[n - 1]}</span>` : '<span class="muted small">Pas encore obtenu</span>') : `<span class="tier t${t.r}">${RAR[t.r]}</span>`}<p class="muted">${t.d}</p></div>`;
  const lv = t.t
    ? `<span class="kicker">Les paliers</span>` +
      t.t
        .map(
          (x, i) =>
            `<div class="lvl">${medal(t.i, i, i < n)}<span class="grow"><span class="nm">${TIERS[i]}</span><br><span class="muted small">${Math.min(v, x)} / ${x} ${t.u}</span><span class="bar tb"><i class="t${i}" style="width:${Math.round(Math.min(1, v / x) * 100)}%"></i></span></span><b>+${TPTS[i]} pts</b>${i < n ? `<span class="st ok">${ic('check')}</span>` : ''}</div>`
        )
        .join('')
    : `<div class="lvl">${medal(t.i, t.r, n)}<span class="grow"><span class="nm">${n ? 'Obtenu' : 'À obtenir'}</span><br><span class="muted small">${t.m ? 'Décerné par le club ou automatiquement' : 'Se débloque tout seul dès que la condition est remplie'}</span></span><b>+${RPTS[t.r]} pts</b></div>`;
  let act = '';
  if (!done && !self && staff())
    act = `<button class="btn full" data-a="awardAsk" data-id="${id}" data-t="${tid}">${t.t ? `Faire passer ${first(id)} au palier ${nextLv.toLowerCase()}` : `Décerner ce trophée à ${first(id)}`}</button>`;
  else if (!done && self && !t.cl)
    act = `<p class="muted small" style="text-align:center">Calculé automatiquement par l'appli : il se débloque tout seul, pas besoin de le réclamer.</p>`;
  else if (!done && self)
    act = cl
      ? `<div class="note">Ta demande pour le palier ${(t.t ? TIERS[cl.tier] : RAR[t.r]).toLowerCase()} est en attente. Le bureau et les enseignants sont prévenus.</div>`
      : `<button class="btn full ghost" data-a="claimAsk" data-t="${tid}">Réclamer ce trophée au club</button><p class="muted small">Tu penses remplir la condition mais l'appli ne l'a pas vu (par exemple un tournoi joué ailleurs) ? Le bureau ou un enseignant vérifie et valide ta demande.</p>`;
  return `<div class="pad">${head}<div class="stack">${lv}</div>${act}</div>`;
}
function claimsView() {
  const l = CLAIMS.filter(c => c.st === 'wait');
  return `<div class="pad"><p class="muted small">Les adhérents réclament un trophée que l'appli n'a pas pu détecter. Vérifie qu'ils remplissent la condition avant de valider.</p>${
    l.length
      ? l
          .map(c => {
            const t = findT(c.tid);
            return `<div class="claimrow">${av(c.by, 'sm')}<div class="grow"><span class="nm">${name(c.by)}</span> réclame <b>${t.n}</b> · ${(t.t ? TIERS[c.tier] : RAR[t.r]).toLowerCase()}<br><span class="muted small">${t.t ? t.t[c.tier] + ' ' + t.u : t.d}</span>${c.msg ? `<p class="quote">${esc(c.msg)}</p>` : ''}<div class="ctl"><button class="btn sm grow" data-a="claimOk" data-id="${c.id}">Valider</button><button class="btn sm grow ghost" data-a="claimNo" data-id="${c.id}">Refuser</button></div></div></div>`;
          })
          .join('')
      : empty('trophy', 'Aucune demande en attente', '')
  }</div>`;
}
V.trophies = trophiesView;
V.troph = trophyPage;
V.claims = claimsView;
/* ---------- branchements ---------- */
window.addEventListener('DOMContentLoaded', () => {
  TITLES.trophies = () => {
    const id = view().id;
    return id && id !== ME() && M[id] ? ['Trophées', name(id)] : ['Trophées', 'Mon investissement'];
  };
  TITLES.troph = () => {
    const [id, tid] = view().id.split('|');
    return [findT(tid).n, id === ME() ? 'Mes trophées' : name(id)];
  };
  TITLES.claims = () => ['Demandes de trophées', 'Bureau et enseignants'];
  /* une demande n'est visible que du bureau et des enseignants */
  const oVis = nVis;
  nVis = n => (n.staff ? staff() : oVis(n));
  const after = (k, fn) => {
    const o = A[k];
    A[k] = (d, el) => {
      const r = o(d, el);
      try {
        fn(d);
      } catch (e) {}
      return r;
    };
  };
  after('like', d => {
    S.liked.has(d.id) ? gain('like', d.id) : lose('like', d.id);
  });
  after('follow', d => {
    S.follow.has(d.id) ? gain('follow', d.id) : lose('follow', d.id);
  });
  after('react', d => {
    const l = msgList(d.ref),
      m = l && l[+d.i];
    if (!m) return;
    m.my ? gain('react', d.ref + d.i) : lose('react', d.ref + d.i);
  });
  after('creact', d => {
    const p = posts.find(p => p.id === d.id),
      c = p && p.com[+d.i];
    if (!c) return;
    c.my ? gain('react', 'c' + d.id + d.i) : lose('react', 'c' + d.id + d.i);
  });
  after('rsvp', d => {
    const p = posts.find(p => p.id === d.id);
    if (!p) return;
    const st = p.kind === 'comm' ? 'comm-int' : p.stage ? 'stage' : 'evt';
    p.my === 'yes' ? gain(st, d.id) : lose(st, d.id);
  });
  after('vote', d => {
    const p = posts.find(p => p.id === d.id);
    if (!p) return;
    p.my != null ? gain('poll', d.id) : lose('poll', d.id);
  });
  after('conv', d => {
    const r = recs.find(r => r.id === d.r);
    if (!r) return;
    r.conv[ME()] === 'ok' ? gain('team', d.r) : lose('team', d.r);
  });
  after('play', d => {
    const p = posts.find(p => p.id === d.id);
    if (!p || !p.play) return;
    p.play.in.includes(ME()) ? gain('play', d.id) : lose('play', d.id);
  });
  after('cresp', d => {
    if (d.u !== ME()) return;
    const g = grp(d.g),
      v = ((g.resp || {})[d.d] || {})[d.u],
      s = ST(ME());
    if (v === 'ok') {
      s.c.streakCur = (s.c.streakCur || 0) + 1;
      s.c.streak = Math.max(s.c.streak || 0, s.c.streakCur);
      gain('train', d.g + d.d);
    } else {
      if (v === 'no') s.c.streakCur = 0;
      lose('train', d.g + d.d);
    }
  });
  const oCdel = A.cdel;
  A.cdel = d => {
    const p = posts.find(p => p.id === d.id),
      c = p && p.com[+d.i],
      mine = c && c.by === ME();
    oCdel(d);
    if (mine) lose('com');
  };
  const oMdel = A.mdel;
  A.mdel = d => {
    const l = msgList(d.ref),
      m = l && l[+d.i],
      mine = m && m.by === ME();
    oMdel(d);
    if (mine) lose(d.ref.startsWith('c:') ? 'msg' : 'live');
  };
  ['role', 'commReq', 'commAsk', 'joinOk'].forEach(k => A[k] && after(k, () => check()));
  A.volu = d => {
    const p = posts.find(p => p.id === d.id);
    if (!p) return;
    p.vol = p.vol || [];
    const i = p.vol.indexOf(ME());
    if (i >= 0) p.vol.splice(i, 1);
    else p.vol.push(ME());
    render(true);
    toast(
      i >= 0
        ? 'Tu ne fais plus partie des bénévoles'
        : "Merci ! Le club est prévenu et te recontactera pour l'organisation"
    );
    i < 0 ? gain('volu', d.id) : lose('volu', d.id);
  };
  A.awardAsk = d => {
    const t = findT(d.t),
      n = t.t ? tierOf(t, ST(d.id).c[t.id] || 0) : 0,
      lv = (t.t ? TIERS[n] : RAR[t.r]).toLowerCase();
    sheet(
      'Décerner un trophée',
      `<div class="body"><div class="tdet">${medal(t.i, t.t ? n : t.r, 1)}<h2 class="h3">${t.n} · ${lv}</h2></div><p style="text-align:center">Voulez-vous faire gagner le trophée <b>${t.n}</b> (${lv}) à <b>${name(d.id)}</b> ?</p><div class="ctl"><button class="btn grow ghost" data-a="close">Annuler</button><button class="btn grow" data-a="awardOk" data-id="${d.id}" data-t="${d.t}">Oui, décerner</button></div></div>`
    );
  };
  A.awardOk = d => {
    closeSheet();
    const ok = award(d.id, d.t);
    render(true);
    if (ok && d.id !== ME()) {
      play('trophy', 1);
      toast(
        `Trophée décerné à ${first(d.id)} · ${isMinor(d.id) ? 'lui et ses parents sont prévenus' : 'il ou elle est prévenu(e)'}`
      );
    }
  };
  A.claimAsk = d => {
    const t = findT(d.t),
      n = t.t ? tierOf(t, ST(ME()).c[t.id] || 0) : 0;
    sheet(
      'Réclamer un trophée',
      `<form class="body" id="claim-form" data-t="${d.t}"><p><b>${t.n}</b> · ${(t.t ? TIERS[n] : RAR[t.r]).toLowerCase()}</p><p class="muted small">${t.t ? t.t[n] + ' ' + t.u : t.d}</p><div class="fld"><label for="cl-msg">Explique ta demande (facultatif)</label><textarea id="cl-msg" placeholder="Ex. : j'ai gagné le tournoi de Brive en septembre"></textarea></div><button class="btn full">Envoyer la demande au club</button></form>`
    );
  };
  const res = (d, ok) => {
    const c = CLAIMS.find(c => c.id === d.id);
    if (!c) return;
    c.st = ok ? 'ok' : 'no';
    if (ok) award(c.by, c.tid, 0, c.tier);
    else
      NOTIFS.unshift({
        by: 'club',
        txt: `n'a pas validé ta demande pour le trophée ${findT(c.tid).n}`,
        t: "À l'instant",
        n: 1,
        go: { v: 'trophies' },
        to: [c.by]
      });
    render(true);
    toast(ok ? `Trophée validé · ${first(c.by)} est prévenu(e)` : `Demande refusée · ${first(c.by)} est prévenu(e)`);
  };
  A.claimOk = d => res(d, 1);
  A.claimNo = d => res(d, 0);
  document.addEventListener('submit', e => {
    if (e.target.id !== 'claim-form') return;
    const tid = e.target.dataset.t,
      t = findT(tid),
      n = t.t ? tierOf(t, ST(ME()).c[t.id] || 0) : 0,
      msg = ($('cl-msg') || {}).value || '';
    CLAIMS.unshift({ id: 'cl' + Date.now(), by: ME(), tid, tier: n, msg: msg.trim(), st: 'wait' });
    NOTIFS.unshift({
      by: ME(),
      txt: `réclame le trophée ${t.n} (${(t.t ? TIERS[n] : RAR[t.r]).toLowerCase()})`,
      t: "À l'instant",
      n: 1,
      staff: 1,
      go: { v: 'claims' }
    });
    closeSheet();
    render(true);
    toast('Demande envoyée · le bureau et les enseignants vont la vérifier');
  });
  /* formulaires : on compare avant / après l'envoi */
  let pre = null;
  const cnt = () => {
    const v = view(),
      me = M[ME()],
      c = v.v === 'chan' && chans.find(c => c.id === v.id),
      r = v.v === 'rec' && recs.find(r => r.id === v.id);
    return {
      chan: c ? c.msgs.length : -1,
      live: r && r.chat ? r.chat.length : -1,
      res: me.res.length,
      pres: (me.pres || []).length
    };
  };
  document.addEventListener(
    'submit',
    e => {
      pre = {
        id: e.target.id,
        c: cnt(),
        com: e.target.id === 'com-form' ? (posts.find(p => p.id === e.target.dataset.id) || { com: [] }).com.length : 0,
        pid: e.target.dataset.id
      };
    },
    true
  );
  document.addEventListener('submit', () => {
    if (!pre) return;
    const p = pre,
      c = cnt();
    pre = null;
    if (p.id === 'composer') {
      if (c.chan > p.c.chan) gain('msg');
      else if (c.live > p.c.live) gain('live');
    }
    if (p.id === 'com-form') {
      const q = posts.find(x => x.id === p.pid);
      if (q && q.com.length > p.com) gain('com');
    }
    if (p.id === 'me-form' && !$('sheet')) {
      ST(ME()).k.add('profil');
      check();
    }
    if (p.id === 'rank-form' && !$('sheet')) gain('rank');
    if ((p.id === 'res-form' && c.res > p.c.res) || (p.id === 'pres-form' && c.pres > p.c.pres)) gain('palm');
    if (['kid-form', 'tf-form', 'season-form'].includes(p.id)) check();
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'me-photo') setTimeout(check, 800);
  });
  NOTIFS.unshift({
    by: 'thomas',
    txt: 'réclame le trophée Fidèle (platine)',
    t: 'Il y a 1 h',
    n: 1,
    staff: 1,
    go: { v: 'claims' }
  });
  check();
  render(true);
});
