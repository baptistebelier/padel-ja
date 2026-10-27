/* /RAM Club — ui/6-profil.js : Profil : palmarès, coordonnées, espace parent.
   Morceau de l'ancien ui.js : les fichiers ui/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
/* ---------- profil ---------- */
const PLACES = Array.from({ length: 24 }, (_, i) => (i ? i + 1 + 'e' : '1er'));
const partnerTxt = r => (r.pid ? 'avec ' + name(r.pid) : r.ext ? 'avec ' + r.ext : '');
function padelList(id) {
  const m = M[id],
    self = id === ME(),
    l = m.pres || [],
    row = r =>
      `<div class="res"><span class="wl wide ${r.place === '1er' ? 'w' : 'pl'}">${r.place}</span><span class="grow"><span class="nm">${r.cat} · ${r.club}</span>${r.pub !== 'Adultes' || r.age ? ` <span class="bd rk">${r.age || r.pub}</span>` : ''}<br><span class="muted small">${r.place === '1er' ? '1re' : r.place} place · ${partnerTxt(r)} · ${fmtD(r.d)}</span></span></div>`;
  if (!l.length)
    return empty(
      'ball',
      'Aucun tournoi de padel cette saison',
      self ? 'Ajoute ton premier résultat avec le bouton +.' : ''
    );
  return self
    ? l
        .map(
          (r, i) =>
            `<div class="swipe">${row(r)}<button class="del" data-a="delPres" data-i="${i}" aria-label="Supprimer ce résultat">${ic('trash')}</button></div>`
        )
        .join('') +
        '<p class="muted small swipehint" style="margin-top:8px">Glisse un résultat vers la gauche pour faire apparaître la corbeille.</p>'
    : l.map(row).join('');
}
function resList(id) {
  const m = M[id],
    self = id === ME(),
    row = r =>
      `<div class="res"><span class="wl ${r.w ? 'w' : ''}">${r.w ? 'V' : 'D'}</span><span class="grow"><span class="nm">${esc(r.opp)}</span> <span class="bd rk">${esc(r.or)}</span>${r.perf ? ' <span class="bd coach">Perf</span>' : ''}<br><span class="muted small">${esc(r.ctx)}</span></span><span style="font-variant-numeric:tabular-nums;white-space:nowrap">${esc(r.sc)}</span></div>`;
  if (!m.res.length)
    return empty('score', 'Aucun résultat cette saison', self ? 'Ajoute ton premier résultat avec le bouton +.' : '');
  return self
    ? m.res
        .map(
          (r, i) =>
            `<div class="swipe">${row(r)}<button class="del" data-a="delRes" data-i="${i}" aria-label="Supprimer ce résultat">${ic('trash')}</button></div>`
        )
        .join('') +
        '<p class="muted small swipehint" style="margin-top:8px">Glisse un résultat vers la gauche pour faire apparaître la corbeille.</p>'
    : m.res.map(row).join('');
}
function contact(id) {
  const self = id === ME(),
    row = (i, l, v) =>
      `<div class="ct">${ic(i)}<span class="grow"><span class="muted small">${l}</span><br><span class="v">${v}</span></span></div>`,
    catRow = row(
      'cal',
      'Catégorie',
      catOf(id) +
        (self && M[id].bd
          ? ' · né' + (M[id].g === 'F' ? 'e' : '') + ' le ' + fmtD(M[id].bd, 1) + ' (visible par toi seul)'
          : '')
    );
  if (self && isMinor(id))
    return `<div class="card"><span class="kicker">Mes informations</span>${catRow}<p class="muted small">Compte jeune géré par ${name(M[id].parent)}. Tes coordonnées ne sont jamais affichées.</p></div>`;
  if (self && id === ME())
    return `<div class="card"><span class="kicker">Mes informations visibles par les adhérents</span>${catRow}${Object.keys(
      MYCT
    )
      .map(
        k =>
          `<div class="ct">${ic(MYCT[k][0])}<span class="grow"><span class="muted small">${MYCT[k][1]}</span><br>${esc(MYCT[k][2]) || '<span class="muted">Non renseigné</span>'}</span><button class="tg" role="switch" aria-checked="${S.share[k]}" aria-label="Partager : ${MYCT[k][1]}" data-a="share" data-k="${k}"></button></div>`
      )
      .join(
        ''
      )}<p class="muted small">Tout est masqué par défaut. Active seulement ce que tu acceptes de partager.</p><button class="btn sm ghost" data-a="editMe">Modifier mes informations</button></div>`;
  if (isMinor(id) || S.role === 'kid') return '';
  const c = CT[id] || {};
  return `<div class="card"><span class="kicker">Contact</span>${catRow}${c.tel ? row('phone', 'Téléphone', c.tel) : ''}${c.mail ? row('mail', 'E-mail', c.mail) : ''}${c.soc ? row('at', c.soc[0], c.soc[1]) : ''}<p class="muted small">${c.tel || c.mail || c.soc ? `Les coordonnées affichées sont celles que ${first(id)} a choisi de partager.` : `${first(id)} ne partage pas ses coordonnées.`}</p></div>`;
}
function profile(id) {
  const m = M[id],
    self = id === ME(),
    kid = isMinor(id),
    f = S.follow.has(id),
    w = m.res.filter(r => r.w).length,
    pf = m.res.filter(r => r.perf).length,
    blk = S.blocked.has(id),
    parent = (M[ME()].kids || []).includes(id);
  let h = `<div class="pad">${self && pending() ? lockCard() : ''}<div class="phero"><div class="row" style="gap:14px">${self ? `<label class="avedit" aria-label="Changer ma photo de profil">${av(id)}<span class="cam">${ic('image')}</span><input type="file" id="me-photo" accept="image/*"></label>` : m.photo ? `<button class="avbtn" data-a="photo" style="background-image:url(${m.photo})" aria-label="Agrandir la photo de profil">${av(id)}</button>` : av(id)}<div class="grow"><h2 class="tilt">${m.n.replace(' ', '<br>')}</h2></div></div>
 <div class="row" style="flex-wrap:wrap;gap:6px">${m.role ? `<span class="bd ${RC[m.role] || ''}">${m.role}</span>` : ''}<span class="muted small">${m.team}</span></div>
 <div class="rtiles">${m.r && m.r !== 'NC' ? `<span class="rt tennis"><b>${m.r}</b>Tennis</span>` : ''}${m.pl ? `<span class="rt padel"><b>Niv ${m.pl}</b>Padel</span>` : ''}${m.tn && m.tn.n ? `<span class="rt tennis"><b>Niv ${m.tn.n}</b>Tennis${m.tn.t ? ' · ' + esc(m.tn.t) : ''}</span>` : ''}${m.pad ? `<span class="rt"><b>${m.pad}</b>Classement padel</span>` : ''}${(!m.r || m.r === 'NC') && !m.pl && !m.pad && !(m.tn && m.tn.n) ? '<span class="rt"><b>NC</b>Non classé</span>' : ''}</div>
 ${self || kid ? '' : `<div class="ctl">${blk ? `<button class="btn grow ghost" data-a="unblock" data-id="${id}">Débloquer ${first(id)}</button>` : `<button class="btn grow ${f ? 'on' : ''}" data-a="follow" data-id="${id}" aria-pressed="${f}">${ic(f ? 'check' : 'plus')}${f ? 'Suivi' : 'Suivre ' + first(id)}</button>`}<button class="ib rnd" data-a="umenu" data-id="${id}" aria-label="Options">${ic('more')}</button></div>`}</div>
 <div class="stats"><div><b>${kid ? '—' : m.fol + (f ? 1 : 0)}</b><span>Abonnés</span></div><div><b>${w}</b><span>Victoires</span></div><div><b>${m.res.length - w}</b><span>Défaites</span></div><div><b>${pf}</b><span>Perfs</span></div></div>${self ? '' : trophyCard(id)}`;
  /* mon profil : la carte d'identité en haut, puis trois onglets au lieu d'une longue colonne */
  if (self) {
    const T = ['jeu', 'infos', 'reglages'].includes(S.meTab) ? S.meTab : 'jeu',
      tab = (k, i, l) =>
        `<button role="tab" aria-selected="${T === k}" data-a="meTab" data-k="${k}">${ic(i)}${l}</button>`;
    if ((isAdmin() || S.role === 'cap') && !pending())
      h += `<button class="btn full" data-a="admin">${ic('gear')}${isAdmin() && S.role !== 'coach' ? 'Gérer le club' : S.role === 'coach' ? 'Mes groupes' : 'Gérer mon équipe'}</button>`;
    h += `<div class="bar-tabs me-tabs" role="tablist">${tab('jeu', 'ball', 'Mon jeu')}${tab('infos', 'user', 'Mes infos')}${tab('reglages', 'gear', 'Réglages')}</div>`;
    return (
      h +
      meTabBody(T, id, m, kid) +
      (window.RAM && RAM.user
        ? `<button class="btn ghost full logout" data-a="logout">${ic('logout')}Se déconnecter de /RAM Club</button>`
        : '') +
      '</div>'
    );
  }
  if (kid && parent) h += parentCard(id);
  else if (kid && !self)
    h += `<div class="note">Compte jeune : pas de messagerie privée ni d'abonnés. Ses résultats ne sont visibles que de son groupe, de ses parents et des encadrants.</div>`;
  h +=
    contact(id) +
    `<div class="stack"><span class="kicker">Palmarès de la saison</span><div class="chips"><button class="chip" data-a="palm" data-s="tennis" aria-pressed="${S.palm !== 'padel'}">Tennis · ${m.res.length}</button><button class="chip" data-a="palm" data-s="padel" aria-pressed="${S.palm === 'padel'}">Padel · ${(m.pres || []).length}</button></div><div class="palm">${S.palm === 'padel' ? padelList(id) : resList(id)}</div></div>`;
  return h + '</div>';
}
/* onglets de mon profil :
   Mon jeu : publier un résultat, chercher une partie, classements, palmarès ;
   Mes infos : ce que voient les adhérents, ma famille, mes clubs, mon compte /RAM ;
   Réglages : affichage, fond, notifications, apparence du club, aide et compte */
function meTabBody(T, id, m, kid) {
  let h = '';
  if (T === 'jeu')
    return `${trophyCard(id)}<div class="stack"><div class="ctl"><button class="btn grow" data-a="result">Ajouter un résultat</button>${kid ? '' : `<button class="btn grow ghost" data-a="newPost" data-k="play">Chercher une partie</button>`}</div><div class="ctl"><button class="btn sm ghost grow" data-a="rank" data-k="tennis">Classement tennis</button><button class="btn sm ghost grow" data-a="rank" data-k="padel">Classement padel</button></div></div><div class="stack"><span class="kicker">Palmarès de la saison</span><div class="chips"><button class="chip" data-a="palm" data-s="tennis" aria-pressed="${S.palm !== 'padel'}">Tennis · ${m.res.length}</button><button class="chip" data-a="palm" data-s="padel" aria-pressed="${S.palm === 'padel'}">Padel · ${(m.pres || []).length}</button></div><div class="palm">${S.palm === 'padel' ? padelList(id) : resList(id)}</div></div>`;
  if (T === 'infos') {
    h = contact(id);
    if (!kid)
      h += `<div class="card"><span class="kicker">Ma famille</span>${(m.kids || []).map(k => `<button class="item" data-a="member" data-id="${k}">${av(k, 'sm')}<span class="grow"><span class="nm">${M[k].n}</span> ${bd(k)}<br><span class="muted small">${catOf(k)} · ${M[k].team}</span></span></button>`).join('')}<button class="btn sm ghost" data-a="addKid">Ajouter un enfant</button></div>`;
    // mes clubs et mon compte /RAM : remplis par ram-sync.js dans la vraie appli
    return h + '<div id="ramClubsBox" hidden></div><div id="ramAccount" class="ram-acc" hidden></div>';
  }
  const N = [
    ['club', 'Annonces et événements du club'],
    ['follow', 'Résultats des adhérents que je suis'],
    ['chan', 'Messages dans mes groupes'],
    ['team', 'Convocations et scores de mon équipe'],
    ['live', 'Détail des matchs en direct (chaque match, pas seulement le début et la fin de la rencontre)'],
    ['play', 'Recherches de partie à mon niveau et joueurs qui rejoignent les miennes'],
    ['mine', 'Nouveaux abonnés, likes, commentaires et réactions à mes publications'],
    ['suivi', 'Suivi personnel : messages, bilans et vidéos (enseignant et élèves)']
  ];
  h += `<div class="card"><span class="kicker">Affichage</span><div class="chips">${[
    ['jour', 'Jour', 'sun'],
    ['nuit', 'Nuit', 'moon'],
    ['systeme', 'Système', 'screen']
  ]
    .map(
      ([k, l, i]) =>
        `<button class="chip" data-a="mode" data-k="${k}" aria-pressed="${(S.mode || 'systeme') === k}">${ic(i)}${l}</button>`
    )
    .join('')}</div><span class="kicker" style="margin-top:14px">Style de l'interface</span><div class="chips">${[
    ['epure', 'Épuré'],
    ['', 'Street dosé'],
    ['street', 'Full street']
  ]
    .map(
      ([k, l]) =>
        `<button class="chip" data-a="ustyle" data-k="${k}" aria-pressed="${(S.ustyle || '') === k}">${l}</button>`
    )
    .join(
      ''
    )}</div><p class="muted small">Les couleurs sont celles du club, choisies par le bureau. Tu choisis seulement le jour, la nuit ou le réglage de ton appareil.</p></div>`;
  h += `<div class="card"><span class="kicker">Fond de l'appli</span><div class="motifs">${MOTIFS.map(([k, l]) => `<button data-a="motif" data-k="${k}" aria-pressed="${S.motif === k}"><i class="${k}"></i>${l}</button>`).join('')}</div><p class="muted small">Le motif reste immobile derrière le contenu.</p></div>`;
  h += `<div class="card"><span class="kicker">Mes notifications</span>${N.map(x => `<div class="ct"><span class="grow">${x[1]}</span><button class="tg" role="switch" aria-checked="${S.nset[x[0]]}" aria-label="${x[1]}" data-a="nset" data-k="${x[0]}"></button></div>`).join('')}<div class="ct"><span class="grow">Notifications sur ce téléphone<br><span class="muted small">Même quand l'appli est fermée${/iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone ? " · sur iPhone, installe d'abord l'appli" : ''}</span></span><button class="btn sm ghost" data-a="pushOn">Activer</button></div>${/iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone && document.querySelector('link[rel="manifest"]') ? '<button class="btn sm ghost full" data-a="installHelp">Installer l\'appli sur l\'écran d\'accueil</button>' : ''}<div class="ct"><span class="grow">Sons et vibrations<br><span class="muted small">Like, message, notification, trophée, inscription</span></span><button class="tg" role="switch" aria-checked="${!!S.sound}" aria-label="Sons et vibrations" data-a="sound"></button></div></div>`;
  h += `${
    window.RAM_KEY
      ? isAdmin()
        ? `<div class="card"><span class="kicker">Apparence du club</span><p class="muted small">Nom, sigle, logo et couleur, visibles par tous les adhérents.</p><button class="btn sm ghost" data-a="look">Personnaliser</button></div>`
        : ''
      : `<div class="card"><span class="kicker">Démo · voir l'appli en tant que</span><div class="chips">${[
          ['admin', 'Bureau'],
          ['cap', 'Capitaine'],
          ['mem', 'Adhérent et parent'],
          ['coach', 'Enseignante'],
          ['kid', 'Jeune (Léo)'],
          ['wait', 'Nouvel inscrit (Lucas)']
        ]
          .map(
            x =>
              `<button class="chip" data-a="role" data-r="${x[0]}" aria-pressed="${S.role === x[0]}">${x[1]}</button>`
          )
          .join(
            ''
          )}</div><p class="muted small">Le bureau voit tout et gère le club. Le capitaine gère son équipe. L'enseignante gère ses groupes (appel, annulation). L'adhérent et le jeune ne voient que ce qui leur est destiné.</p></div>
  <div class="card"><span class="kicker">Démo · les couleurs du club</span><div class="sw">${CLUBS.map((c, i) => `<button data-a="theme" data-i="${i}" aria-pressed="${S.club === i}"><i><span style="background:${c.bg || (c.dark ? '#0B0B0B' : '#F3F5FA')}"></span><span style="background:${c.accent}"></span></i>${c.label}</button>`).join('')}</div>${isAdmin() ? `<button class="btn sm ghost" data-a="look">Personnaliser nom, logo et couleur</button>` : ''}</div>`
  }
  <div class="menu"><button data-a="open" data-v="aide">${ic('info')}Aide : tout savoir sur l’appli</button><button data-a="open" data-v="legal">${ic('shield')}Conditions et confidentialité</button>${kid ? '' : `<button class="danger" data-a="delAccount">${ic('trash')}Supprimer mon compte</button>`}</div>${kid ? '<p class="muted small">Seul ton parent peut supprimer ton compte.</p>' : ''}
  <div class="powered"><span>Propulsé par</span><img src="${ramLogo()}" alt="/RAM Club"></div>`;
  return h;
}
/* Espace parent : prochains cours de l'enfant, absences, autorisation photo, second parent */
const nextSessionOf = g => {
  for (let i = 0; i < 7; i++) {
    const iso = isoIn(i),
      [y, m, d] = iso.split('-').map(Number);
    if (trainOn(g, iso)) return iso;
  }
  return TODAY;
};
function nextSessions(k, n) {
  const out = [];
  GROUPS.filter(g => g.type === 'train' && g.mem.includes(k)).forEach(g => {
    let c = 0;
    for (let i = 0; i < 15 && c < n; i++) {
      const iso = isoIn(i),
        [y, m, d] = iso.split('-').map(Number);
      if (trainOn(g, iso)) {
        out.push({ g, iso });
        c++;
      }
    }
  });
  return out.sort((a, b) => a.iso.localeCompare(b.iso));
}
function parentCard(k) {
  const kd = M[k],
    ss = nextSessions(k, 2),
    rr = recs.filter(r => !r.arch && r.st !== 'done' && grp(r.tid).mem.includes(k));
  return `<div class="card"><span class="kicker">Espace parent · ${first(k)}</span>${
    ss
      .map(s => {
        const cx = (s.g.cancel || []).includes(s.iso),
          ab = ((s.g.abs || {})[s.iso] || []).includes(k);
        return `<div class="ct">${ic('cal')}<span class="grow"><span class="nm">${s.g.name}</span><br><span class="muted small">${fmtD(s.iso)} · ${s.g.h}${cx ? ' · cours annulé' : ab ? ' · absence signalée' : ''}</span></span></div>`;
      })
      .join('') || '<p class="muted small">Aucun cours dans les 15 prochains jours.</p>'
  }${rr.map(r => `<div class="ct">${ic('users')}<span class="grow"><span class="nm">${teamName(grp(r.tid))} – ${r.opp}</span><br><span class="muted small">${r.when}</span></span></div>`).join('')}
 <div class="ctl"><button class="btn sm grow" data-a="absence" data-id="${k}">Signaler une absence</button><button class="btn sm ghost grow" data-a="parent2" data-id="${k}">Second parent</button></div>
 <div class="ct"><span class="grow"><span class="nm">Autorisation photo</span><br><span class="muted small">${kd.photoOk ? 'Le club peut publier des photos où apparaît ' + first(k) + '.' : 'Le club ne doit publier aucune photo où apparaît ' + first(k) + '.'}</span></span><button class="tg" role="switch" aria-checked="${!!kd.photoOk}" aria-label="Autorisation photo pour ${first(k)}" data-a="photoOk" data-id="${k}"></button></div>
 <div class="fld"><span class="lb">Résultats de ${first(k)} visibles par</span><div class="chips"><button class="chip" data-a="kidVis" data-id="${k}" data-v="grp" aria-pressed="${kd.resVis !== 'club'}">Son groupe et ses encadrants</button><button class="chip" data-a="kidVis" data-id="${k}" data-v="club" aria-pressed="${kd.resVis === 'club'}">Tout le club</button></div></div>
 <button class="btn sm ghost" style="color:var(--hot-tx)" data-a="kidDel" data-id="${k}">Supprimer le compte de ${first(k)}</button></div>`;
}
