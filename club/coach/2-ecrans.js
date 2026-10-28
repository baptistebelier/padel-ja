/* /RAM Coach — coach/2-ecrans.js : les pages de l'enseignant (Aujourd'hui, Planning, Séance, Élèves,
   Messages, École, Profil). Elles s'ajoutent à la table des écrans V du Club ; les discussions de groupe,
   les notifications et la conversation privée (ui/13-suivi.js) sont celles du Club.
   Un logiciel de gestion, pas un réseau social : pas de mur, pas de favoris, pas de palmarès ni de trophées.
   Tout le contenu est posé sur des cartes opaques : titres de section (cohd) et listes (colist) compris. */
/* ---------- aides ---------- */
const fold = s =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const coAll = () => isBureau() || !!S.super; // bureau du club ou administrateur : toute l'école
/* mes groupes, de tous mes clubs (ma clé n'est pas la même dans chaque club), filtrés par club si demandé */
const coKeyIn = cid => (cid && CO_EXT[cid] && CO_EXT[cid].key) || ME();
const coIsMe = k => k === ME() || Object.values(CO_EXT).some(c => c.key === k);
const coMainId = () => (window.RAM && RAM.live ? RAM.club : 'main');
const coClubOf = o => (o && o._club) || coMainId();
const coClubList = () =>
  [{ id: coMainId(), name: club().name }].concat(Object.keys(CO_EXT).map(id => ({ id, name: CO_EXT[id].name })));
const coInClub = o => !S.coClub || S.coClub === 'all' || coClubOf(o) === S.coClub;
const coGroups = (scope, any) =>
  GROUPS.filter(g => g.type === 'train' && !g.old && g.coach === coKeyIn(g._club) && (any || coInClub(g)));
const coStu = g => g.mem.concat(g.ext || []);
const coEl = id => ELEVES.find(e => e.id === id);
const coDow = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
};
/* dates d'un groupe entre deux jours (inclus) */
function coDates(g, from, to) {
  const out = [],
    f0 = from,
    t0 = to;
  if (g.once) return g.once >= from && g.once <= to ? [g.once] : []; // séance ponctuelle (cours individuel)
  if (g.from && g.from > from) from = g.from; // un cycle : de sa première à sa dernière séance
  if (g.to && g.to < to) to = g.to;
  for (let d = from; d <= to; d = isoIn(1, d)) if (trainOn(g, d)) out.push(d);
  // séances ajoutées au groupe en dehors de son créneau ou de ses dates (Programmer des séances)
  (g.extra || []).forEach(d => d >= f0 && d <= t0 && !out.includes(d) && out.push(d));
  return out.sort();
}
/* un groupe : des élèves qui jouent ensemble chaque semaine (avec sa discussion) ; une séance ponctuelle n'en est pas un */
const coIsGrp = g => !g.once;
// cycle terminé : sa dernière séance est passée, ou l'enseignant l'a terminé lui-même (fini)
const coOver = g => !!g.to && (g.to < TODAY || !!g.fini);
/* créneau d'un groupe : « mardi 18 h » chaque semaine, ou la date d'une séance ponctuelle */
const coSlot = g => (g.once ? fmtD(g.once) + ' · ' + g.h : DAYS[g.day] + ' ' + g.h);
const sesKey = (g, d) => g.id + '.' + d;
/* autres clubs où j'enseigne, lus à part (coach/4-finitions.js) : { id: { name, key, role, groups, seances } }.
   Leurs groupes ont _club ; on les voit dans Aujourd'hui, Planning et Statistiques, on les modifie en ouvrant ce club. */
const CO_EXT = {};
const coMulti = () => Object.keys(CO_EXT).length > 0;
/* à chaque club ouvert (au démarrage ou après un changement), les autres sont relus */
let coExtFor = null;
function coExtCheck() {
  if (window.RAM && RAM.live && coExtFor !== RAM.club && typeof coLoadExt === 'function') {
    coExtFor = RAM.club;
    coLoadExt();
  }
}
const coClubName = g => (g._club ? CO_EXT[g._club].name : club().name);
const sesFind = (g, d) => SEANCES.find(s => s.id === sesKey(g, d) && (s._club || '') === (g._club || ''));
const isCx = (g, d) => (g.cancel || []).includes(d);
const monday = off => {
  const dow = (coDow(TODAY) + 6) % 7;
  return isoIn(-dow + 7 * (off || 0));
};
const coAllGroups = scope => coGroups(scope);
/* toutes les séances d'une période, triées : { g, d, s } ; all : de tous mes clubs */
function coSessions(from, to, scope, all) {
  return (all ? coAllGroups(scope) : coGroups(scope))
    .flatMap(g => coDates(g, from, to).map(d => ({ g, d, s: sesFind(g, d) })))
    .sort((a, b) => a.d.localeCompare(b.d) || hMin(a.g.h) - hMin(b.g.h));
}
/* élèves suivis : ceux de mes groupes (ou de toute l'école) et les fiches créées à la main */
function coStudents() {
  const ids = new Set();
  coGroups('', true).forEach(g => coStu(g).forEach(k => ids.add(k)));
  ELEVES.forEach(e => ids.add(e.id));
  return [...ids].filter(k => M[k] || coEl(k));
}
const coAv = (id, c = 'sm') =>
  M[id]
    ? av(id, c)
    : `<span class="av ${c}" style="--h:${hue(id)}">${svName(id)
        .split(' ')
        .map(w => w[0])
        .join('')
        .slice(0, 2)}</span>`;
/* avatars d'un petit groupe d'élèves, l'un sur l'autre */
const coStack = (ks, n = 4) =>
  ks.length
    ? `<span class="costack">${ks
        .slice(0, n)
        .map(k => coAv(k))
        .join('')}${ks.length > n ? `<span class="av sm">+${ks.length - n}</span>` : ''}</span>`
    : '';
/* élèves d'une séance : les présents si l'appel est fait, sinon les inscrits */
const coWho = x => {
  const p = x.s && x.s.pres ? Object.keys(x.s.pres).filter(k => x.s.pres[k] === 'P') : [];
  return p.length ? p : coStu(x.g);
};
const coNames = ks => (ks.length > 2 ? ks.map(k => svFirst(k)).join(', ') : ks.map(k => svName(k)).join(' et '));
const coSport = id =>
  (coEl(id) || {}).sport || (GROUPS.find(g => g.type === 'train' && coStu(g).includes(id)) || {}).sport || 'Tennis';
const coLvl = id => {
  const e = coEl(id),
    sc = SCALES[coSport(id)];
  return e && e.lvl ? sc.levels.find(l => l.n === e.lvl) : null;
};
const coGroupsOf = id => GROUPS.filter(g => g.type === 'train' && coIsGrp(g) && !coOver(g) && coStu(g).includes(id));
/* séances faites par chaque élève (noté présent) : { clé: { n, h } } */
function coDone() {
  const o = {};
  SEANCES.forEach(s => {
    if (!s.pres || s.d > TODAY) return;
    const g = GROUPS.find(x => x.id === s.g && (x._club || '') === (s._club || '')),
      h = g ? durMin(g.dur) / 60 : 1;
    Object.keys(s.pres).forEach(k => {
      if (s.pres[k] !== 'P') return;
      const x = (o[k] = o[k] || { n: 0, h: 0 });
      x.n++;
      x.h += h;
    });
  });
  return o;
}
const presLbl = { P: 'Présent', E: 'Excusé', A: 'Absent' };
const plural = (n, w, ws) => n + ' ' + (n > 1 ? ws || w + 's' : w);
const coVideosTodo = () =>
  SUIVI.filter(
    x =>
      x.k === 'video' &&
      !x.re &&
      M[x.by] &&
      x.by === x.to &&
      !SUIVI.some(y => y.re === x.id) &&
      coStudents().includes(x.to)
  );
const coUnread = () => coStudents().reduce((a, k) => a + (svOf(k).length ? svUnread(k) : 0), 0);
/* titre de section sur sa barre opaque ; liste sur sa carte ; message vide dans une carte */
const hd = (t, extra) => `<h2 class="cohd"><span>${t}</span>${extra || ''}</h2>`;
const list = rows => `<div class="card colist">${rows}</div>`;
const none = (i, t, s) => `<div class="card">${empty(i, t, s)}</div>`;
const fr = n => String(Math.round(n * 10) / 10).replace('.', ',');
/* carte d'une séance du planning */
function coSesCard(x, big) {
  const { g, d, s } = x,
    cx = isCx(g, d),
    st = coStu(g),
    nP = s && s.pres ? Object.values(s.pres).filter(v => v === 'P').length : null,
    [y, m, dd] = d.split('-').map(Number),
    loc = (g.loc || {})[d] || g.defLoc || 'En salle';
  const go = `data-a="open" data-v="seance" data-id="${sesKey(g, d)}"`;
  // de haut en bas : titre, élèves, durée, thème, étiquettes ; l'heure dans l'encart de la date
  return `<button class="card coses${cx ? ' cx' : ''}" ${go}>${coDblk(d, g.h)}<span class="grow"><span class="h3" style="font-size:18px">${esc(g.name)}</span>${
    st.length
      ? `<span class="coline costu">${ic('user')}<span class="coppl">${st.map(k => `<span class="copp${s && s.pres && s.pres[k] === 'A' ? ' abs' : ''}">${coAv(k, 'xs')}<span>${esc(svName(k))}</span></span>`).join('')}</span></span>`
      : `<span class="coline muted">${ic('user')}Aucun élève</span>`
  }<span class="coline muted">${ic('clock')}${g.dur}${g.coach && !coIsMe(g.coach) && M[g.coach] ? ' · ' + first(g.coach) : ''}</span>${s && s.theme ? `<span class="coline cotheme">${ic('ladder')}${esc(s.theme)}</span>` : big && !cx ? `<span class="coline muted">${ic('ladder')}Thème à définir</span>` : ''}<span class="tags" style="display:flex;margin-top:6px">${cx ? '<span class="tag" style="background:var(--hot);color:#fff">Cours annulé</span>' : `<span class="tag loc">${ic(loc === 'En salle' ? 'home' : 'sun')}${loc}</span>`}${sportTag(g.sport)}${coMulti() ? `<span class="tag coclub">${ic('club')}${esc(coClubName(g))}</span>` : ''}<span class="tag">${nP != null && d <= TODAY ? nP + '/' + st.length + ' présents' : plural(st.length, 'élève')}</span></span></span></button>`;
}
/* encart de la date d'une séance : jour, mois, et l'heure dessous */
const coDblk = (d, h) => {
  const [, m, dd] = d.split('-').map(Number);
  return `<span class="dblk codblk"><b>${dd}</b>${MO[m - 1]}${h ? `<i>${h}</i>` : ''}</span>`;
};
/* ---------- Aujourd'hui : premiers pas, chiffres, cours du jour et du lendemain, ce qui reste à faire ---------- */
function coSetup() {
  const mine = coGroups('me'),
    ses = SEANCES.filter(s => mine.some(g => g.id === s.g)),
    steps = [
      ['Ma fiche enseignant', 'Diplôme, coordonnées, tarifs, réservation', !!proOf(ME()).on, 'data-a="coPro"'],
      ['Mes groupes', 'Créés ici, visibles dans /RAM Club', mine.length > 0, 'data-a="coNewGrp"'],
      [
        'Thèmes des séances',
        'Préparer les prochaines séances',
        ses.some(s => s.theme && s.d >= TODAY),
        'data-a="tab" data-t="planning"'
      ],
      [
        'Premier appel',
        'Présent, excusé ou absent',
        ses.some(s => s.pres && Object.keys(s.pres).length),
        'data-a="tab" data-t="planning"'
      ],
      [
        'Premier bilan ou message',
        'Reçu par l’élève dans /RAM Club',
        SUIVI.some(x => coIsMe(x.by)),
        'data-a="tab" data-t="msgs"'
      ]
    ],
    n = steps.filter(s => s[2]).length;
  if (n === steps.length) return '';
  return `<div class="card setup"><span class="kicker">Premiers pas · ${n} sur ${steps.length}</span><span class="bar"><i style="width:${(n * 100) / steps.length}%"></i></span>${steps.map(s => `<button class="item" ${s[3]}><span class="chk ${s[2] ? 'on' : ''}" aria-hidden="true">${s[2] ? ic('check') : ''}</span><span class="grow"><span class="nm">${s[0]}</span><br><span class="muted small">${s[1]}</span></span><span class="sr">${s[2] ? 'fait' : 'à faire'}</span></button>`).join('')}</div>`;
}
/* vrai compte sans club où enseigner, ou adhérent sans rôle d'enseignant : ce qu'il faut faire */
function coNoClub() {
  if (!(window.RAM && RAM.user)) return '';
  if (!RAM.live)
    return `<div class="card"><span class="kicker">Ton club</span><p>Tu n'es encore dans aucun club. Rejoins le club où tu enseignes avec son code : le bureau te donnera ensuite le rôle d'enseignant.</p><button class="btn full" data-a="ramStart">Rejoindre mon club</button></div>`;
  if (!isAdmin())
    return `<div class="card"><span class="kicker">Rôle à demander</span><p>Dans ${esc(club().name)}, ton compte est celui d'un adhérent. Demande au bureau de te donner le rôle <b>Enseignant</b> (Profil de l'adhérent, Accès à l'appli) pour retrouver tes groupes ici.</p></div>`;
  return '';
}
function coToday() {
  coExtCheck();
  if (typeof coLocInit === 'function') coLocInit();
  const today = coSessions(TODAY, TODAY, 'me', 1),
    tom = coSessions(isoIn(1), isoIn(1), 'me', 1),
    wk = coSessions(monday(0), isoIn(6, monday(0)), 'me', 1).filter(x => !isCx(x.g, x.d)),
    todoB = coSessions(isoIn(-7), TODAY, 'me').filter(
      x =>
        !isCx(x.g, x.d) &&
        !(x.s && (x.s.recap || x.s.noRecap)) &&
        x.d <= TODAY &&
        !BROUILLONS.some(b => b.id === sesKey(x.g, x.d))
    ),
    vids = coVideosTodo(),
    un = coUnread(),
    todo = [];
  // bilans : à écrire ou en brouillon ; en mode sélection, on les coche comme des mails pour les retirer d'un coup
  const sel = !!S.coSel,
    pick = S.coPick || [],
    bil = (id, icn, t, sub) =>
      sel
        ? `<button class="item cosel" data-a="coPick" data-id="${id}" aria-pressed="${pick.includes(id)}"><span class="cochk" aria-hidden="true">${ic('check')}</span><span class="grow"><span class="nm">${t}</span><br><span class="muted small">${sub}</span></span></button>`
        : `<button class="item" data-a="open" data-v="seance" data-id="${id}"><span class="tile">${ic(icn)}</span><span class="grow"><span class="nm">${t}</span><br><span class="muted small">${sub}</span></span></button>`,
    bilIds = [];
  todoB.forEach(x => {
    bilIds.push(sesKey(x.g, x.d));
    todo.push(bil(sesKey(x.g, x.d), 'doc', 'Bilan à écrire', `${esc(x.g.name)} · ${fmtD(x.d)}`));
  });
  BROUILLONS.forEach(b => {
    const g = grp(b.g);
    if (!g) return;
    bilIds.push(b.id);
    todo.push(
      bil(
        b.id,
        'edit',
        'Bilan en brouillon à publier',
        `${esc(g.name)} · ${fmtD(b.d)}${b.src === 'claude' ? ' · préparé par Claude' : ''}`
      )
    );
  });
  S.coBil = bilIds; // pour « Tout sélectionner »
  vids.forEach(v =>
    todo.push(
      `<button class="item" data-a="open" data-v="dm" data-id="${v.to}"><span class="tile">${ic('video')}</span><span class="grow"><span class="nm">Vidéo à analyser</span><br><span class="muted small">${esc(svName(v.to))} · ${esc((v.txt || '').slice(0, 60))}</span></span></button>`
    )
  );
  if (un)
    todo.push(
      `<button class="item" data-a="tab" data-t="msgs"><span class="tile">${ic('chat')}</span><span class="grow"><span class="nm">${plural(un, 'message non lu', 'messages non lus')}</span><br><span class="muted small">Réponses de tes élèves</span></span><span class="cnt">${un}</span></button>`
    );
  const hrs = wk.reduce((a, x) => a + durMin(x.g.dur), 0) / 60;
  return `<div class="pad">${coNoClub()}${coSetup()}<div class="stats"><div><b>${today.filter(x => !isCx(x.g, x.d)).length}</b><span>Aujourd'hui</span></div><div><b>${fr(hrs)}</b><span>Heures semaine</span></div><div><b>${coStudents().length}</b><span>Élèves</span></div><div><b>${vids.length}</b><span>Vidéos</span></div></div>
${hd("Aujourd'hui · " + fmtD(TODAY))}${today.length ? today.map(x => coSesCard(x, 1)).join('') : none('cal', 'Pas de cours aujourd’hui', '')}
${tom.length ? hd('Demain') + tom.map(x => coSesCard(x, 1)).join('') : ''}
${hd('À traiter', S.coBil.length ? `<button class="chip" data-a="coSelMode" aria-pressed="${sel}">${sel ? 'Terminé' : 'Sélectionner'}</button>` : '')}${sel ? coSelBar() : ''}${todo.length ? list((sel ? todo.slice(0, S.coBil.length) : todo).join('')) : none('check', 'Tout est à jour', 'Bilans écrits, vidéos analysées, messages lus.')}
${hd('Outils')}<div class="card cotools"><button class="btn ghost" data-a="coTimer">${ic('timer')}Minuteur</button><button class="btn ghost" data-a="coNewMsg">${ic('chat')}Écrire à un élève</button><button class="btn ghost" data-a="tab" data-t="dash">${ic('chart')}Tableau de bord</button><button class="btn ghost" data-a="open" data-v="aide">${ic('info')}Aide</button></div></div>`;
}
/* ---------- Planning : semaine par semaine, mes cours ou toute l'école ---------- */
function coPlanning() {
  const from = monday(S.pl.w),
    to = isoIn(6, from),
    l = coSessions(from, to, '', 1),
    stages = posts.filter(p => p.stage && !p.arch && (p.date || '') >= from && (p.date || '') <= to);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = isoIn(i, from),
      x = l.filter(s => s.d === d);
    if (x.length)
      days.push(
        hd(`${DAYS[coDow(d)]} ${+d.slice(8)} ${MO[+d.slice(5, 7) - 1]}${d === TODAY ? " · aujourd'hui" : ''}`) +
          x.map(s => coSesCard(s, 1)).join('')
      );
  }
  return `<div class="pad">${coClubChips()}<div class="card coweek"><button class="ib" data-a="coWeek" data-n="-1" aria-label="Semaine précédente">${ic('back')}</button><span class="grow" style="text-align:center"><b>Semaine du ${+from.slice(8)} ${MO[+from.slice(5, 7) - 1]}</b><br><span class="muted small">${plural(l.filter(x => !isCx(x.g, x.d)).length, 'séance')}${S.pl.w ? '' : ' · cette semaine'}</span></span><button class="ib flip" data-a="coWeek" data-n="1" aria-label="Semaine suivante">${ic('back')}</button></div>${days.join('') || none('cal', 'Aucun cours cette semaine', '')}${stages.length ? hd('Stages') + list(stages.map(p => `<button class="item" data-a="open" data-v="post" data-id="${p.id}"><span class="tile">${ic('ball')}</span><span class="grow"><span class="nm">${esc(p.title)}</span></span></button>`).join('')) : ''}<div class="card cotools"><button class="btn" data-a="coNewSes">${ic('plus')}Ajouter une séance</button><button class="btn ghost" data-a="coNewGrp">${ic('users')}Créer un groupe</button><button class="btn ghost" data-a="open" data-v="histo">${ic('cal')}Historique des séances</button></div></div>`;
}
/* actions d'une séance : une grille de tuiles avec pictogramme (lieu, annuler, reporter, changer la date, supprimer) */
function coActs(g, d, loc, cx) {
  const t = (a, icn, l, sub, extra, cls) =>
      `<button class="coact${cls ? ' ' + cls : ''}" data-a="${a}" ${extra}>${ic(icn)}<b>${l}</b><span>${sub}</span></button>`,
    at = `data-id="${g.id}" data-d="${d}"`;
  return `<div class="coacts">${
    cx
      ? ''
      : loc === 'En salle'
        ? t('loc', 'sun', 'Passer en extérieur', 'Ce jour-là · élèves prévenus', `data-g="${g.id}" data-d="${d}"`)
        : t('loc', 'home', 'Passer en salle', 'S’il pleut · élèves prévenus', `data-g="${g.id}" data-d="${d}"`)
  }${cx ? t('cancelCourse', 'undo', 'Rétablir le cours', 'Élèves prévenus', at, 'on') : t('cancelCourse', 'ban', 'Annuler le cours', 'Reste affiché · élèves prévenus', at)}${coIsGrp(g) && d >= TODAY ? t('coShift', 'forward', 'Reporter', 'Les suivantes glissent', at) : ''}${t('coMove', 'calmove', 'Changer la date', 'Cette séance seulement', at)}${t('delCourse', 'trash', 'Supprimer', 'Personne n’est prévenu', at, 'danger')}</div>`;
}
/* ---------- Séance : thème, appel, bilan du groupe et commentaires personnels ---------- */
function coSeance(id) {
  const i = id.lastIndexOf('.'),
    g = grp(id.slice(0, i)),
    d = id.slice(i + 1);
  if (!g) return `<div class="pad">${none('cal', 'Séance introuvable', '')}</div>`;
  const s = sesFind(g, d) || {},
    cx = isCx(g, d),
    st = coStu(g),
    past = d <= TODAY,
    loc = (g.loc || {})[d] || g.defLoc || 'En salle',
    // bilan préparé en brouillon (par Claude ou par l'enseignant) : relu ici, publié par l'enseignant
    dr = BROUILLONS.find(b => b.id === id && (b._club || '') === (g._club || '')),
    perso = k =>
      dr && dr.perso && dr.perso[k] != null
        ? dr.perso[k]
        : (SUIVI.find(x => x.k === 'bilan' && x.ses === id && x.to === k) || {}).txt || '';
  const roll = st
    .map(k => {
      const at = ((g.att || {})[d] || {})[k],
        v = (s.pres || {})[k] || (at === true ? 'P' : at === false ? 'A' : ''),
        ann = M[k] ? respOf(g, d, k) : '';
      return `<div class="corow">${coAv(k)}<span class="grow"><button class="nm" data-a="open" data-v="eleve" data-id="${k}">${esc(svName(k))}</button>${ann ? `<br><span class="muted small">A annoncé : ${ann === 'ok' ? 'présent' : 'absent'}</span>` : ''}</span><span class="pea" role="group" aria-label="Présence de ${esc(svName(k))}">${['P', 'E', 'A'].map(x => `<button class="${v === x ? 'on ' + x : ''}" data-a="coPres" data-id="${id}" data-k="${k}" data-s="${x}" aria-pressed="${v === x}" aria-label="${presLbl[x]}">${x}</button>`).join('')}</span></div>`;
    })
    .join('');
  const nP = Object.values(s.pres || {}).filter(v => v === 'P').length;
  return `<div class="pad"><div class="card"><span class="kicker">${DAYS[coDow(d)]} ${fmtD(d, 1)} · ${g.h} · ${g.dur}</span><span class="h3">${esc(g.name)}</span><span class="tags" style="display:flex;margin-top:6px">${cx ? '<span class="tag" style="background:var(--hot);color:#fff">Cours annulé</span>' : `<span class="tag">${loc}</span>`}${sportTag(g.sport)}${g.coach && M[g.coach] ? `<span class="tag">${first(g.coach)}</span>` : ''}</span>
${coIsGrp(g) ? `<button class="btn sm ghost full cogo" data-a="open" data-v="cgroupe" data-id="${g.id}">${ic('users')}Fiche du groupe · ${esc(g.name)}</button>` : ''}${st.length ? `<div class="coppl">${st.map(k => `<button class="copp" data-a="open" data-v="eleve" data-id="${k}" aria-label="Fiche de ${esc(svName(k))}">${coAv(k, 'xs')}<span>${esc(svName(k))}</span></button>`).join('')}</div>` : ''}
<form id="co-theme" data-id="${id}" class="row" style="gap:8px;margin-top:10px"><input id="co-th" class="grow" placeholder="Thème de la séance" value="${esc(s.theme || '')}" aria-label="Thème de la séance" list="co-thl"><datalist id="co-thl">${THEMES[g.sport].map(t => `<option value="${esc(t)}">`).join('')}</datalist><button class="btn sm">OK</button></form>
${coActs(g, d, loc, cx)}</div>
${
  cx
    ? '<div class="card"><p>Les élèves et leurs parents sont prévenus dans /RAM Club.</p></div>'
    : `${hd(`Appel · ${nP} présent${nP > 1 ? 's' : ''} sur ${st.length}`)}<div class="card">${roll || empty('users', 'Aucun élève', '')}<button class="btn sm ghost full" data-a="coAllP" data-id="${id}">Tout le monde présent</button></div>
${hd('Bilan de la séance')}${dr ? `<div class="card codraft"><span class="kicker">Brouillon à relire</span><p>Ce bilan a été préparé${dr.src === 'claude' ? ' par Claude' : ''} et n'est pas encore envoyé : relis-le, corrige-le si besoin, puis publie-le.</p></div>` : ''}<form id="co-bilan" data-id="${id}" class="card"><div class="fld"><label for="co-recap">Pour tout le groupe</label><textarea id="co-recap" placeholder="Ce qui a été travaillé, ce qu'on garde pour la prochaine fois">${esc(dr && dr.recap != null ? dr.recap : s.recap || '')}</textarea></div>${st
        .filter(k => !s.pres || s.pres[k] !== 'A')
        .map(
          k =>
            `<div class="fld"><label for="co-p-${k}">Pour ${esc(svFirst(k))} (personnel)</label><textarea id="co-p-${k}" data-k="${k}" class="co-perso" rows="2" placeholder="Facultatif : reçu dans son espace">${esc(perso(k))}</textarea></div>`
        )
        .join(
          ''
        )}<button class="btn full" name="go" value="pub">${ic('send')}${past ? 'Publier le bilan aux élèves' : 'Enregistrer'}</button><button class="btn full ghost" name="go" value="draft">${ic('edit')}Garder en brouillon</button><p class="muted small">Le bilan arrive dans /RAM Club, École, Mon espace : celui du groupe pour tous, le commentaire personnel pour l'élève (et ses parents) seulement.</p></form>`
}</div>`;
}
/* filtre par club (quand j'enseigne dans plusieurs clubs) : Planning, Élèves, Tableau de bord */
const coClubChips = () =>
  coMulti()
    ? `<div class="card"><div class="chips"><button class="chip" data-a="coClub" data-c="all" aria-pressed="${!S.coClub || S.coClub === 'all'}">Tous mes clubs</button>${coClubList()
        .map(
          c =>
            `<button class="chip" data-a="coClub" data-c="${c.id}" aria-pressed="${S.coClub === c.id}">${esc(c.name)}</button>`
        )
        .join('')}</div></div>`
    : '';
const coClubBar = () => '';
/* ---------- Élèves ---------- */
function coEleves() {
  const q = fold(S.elQ || ''),
    f = S.elF,
    dn = coDone(),
    l = coStudents()
      .filter(k => !q || fold(svName(k)).includes(q))
      .filter(k => coInClub(M[k] || coEl(k) || {}))
      .filter(k => f === 'all' || (f === 'nc' ? !M[k] : f === 'jeunes' ? M[k] && isMinor(k) : coSport(k) === f))
      .sort((a, b) => svName(a).localeCompare(svName(b)));
  const chip = (v, t) => `<button class="chip" data-a="coElF" data-v="${v}" aria-pressed="${f === v}">${t}</button>`;
  return `<div class="pad">${coClubChips()}<div class="card"><div class="fld cosearch"><input id="co-q" type="search" placeholder="Rechercher un élève" value="${esc(S.elQ || '')}" aria-label="Rechercher un élève"></div><div class="chips">${chip('all', 'Tous')}${chip('Padel', 'Padel')}${chip('Tennis', 'Tennis')}${chip('jeunes', 'Jeunes')}${chip('nc', 'Sans compte')}</div></div>${hd(plural(l.length, 'élève'))}${
    l.length
      ? list(
          l
            .map(k => {
              const lv = coLvl(k),
                gs = coGroupsOf(k),
                un = svOf(k).length ? svUnread(k) : 0;
              return `<button class="item" data-a="open" data-v="eleve" data-id="${k}">${coAv(k)}<span class="grow"><span class="nm">${esc(svName(k))}</span>${M[k] ? '' : ' <span class="tag">Sans compte</span>'}<br><span class="muted small">${[lv ? 'Niv. ' + lv.n + ' ' + lv.t : '', dn[k] ? plural(dn[k].n, 'séance') + ' · ' + fr(dn[k].h) + ' h de cours' : 'Aucune séance', gs.map(g => esc(g.name)).join(', ')].filter(Boolean).join(' · ')}</span></span>${un ? `<span class="cnt">${un}</span>` : ''}</button>`;
            })
            .join('')
        )
      : none('users', 'Aucun élève', q ? 'Personne ne correspond à la recherche.' : '')
  }<div class="card"><button class="btn full ghost" data-a="coNewEl">${ic('plus')}Ajouter un élève sans compte</button><p class="muted small">Un élève sans compte /RAM Club retrouve sa fiche, ses bilans et ses messages dès qu'il est relié à son compte.</p></div></div>`;
}
function coEleve(id) {
  const e = coEl(id) || {},
    sp = coSport(id),
    sc = SCALES[sp],
    lv = coLvl(id),
    gs = coGroupsOf(id),
    tab = S.elTab;
  const row = (l, v) => `<div class="cokv"><span class="muted">${l}</span><b>${v || '–'}</b></div>`;
  let b = '';
  if (tab === 'fiche')
    b = `<div class="card">${row('Sport', sp)}${row('Niveau', lv ? lv.n + ' · ' + lv.t : '')}${row('Main', e.hand === 'G' ? 'Gaucher' : e.hand === 'D' ? 'Droitier' : '')}${sp === 'Padel' ? row('Côté', e.side === 'G' ? 'Gauche' : e.side === 'D' ? 'Droite' : e.side === '2' ? 'Les deux' : '') : ''}${row('Groupes', gs.map(g => esc(g.name)).join(', '))}${e.mail ? row('E-mail', esc(e.mail)) : ''}</div>
${hd('Objectifs')}<div class="card"><p>${esc(e.goals || 'Aucun objectif noté.')}</p></div>
${hd('Note privée')}<div class="card"><p>${esc(e.note || 'Aucune note.')}</p><span class="muted small">Visible par l'équipe pédagogique seulement.</span></div>
${coAchatsCard(id)}
${(e.parents || []).length ? hd('Parents') + `<div class="card">${e.parents.map(p => `<div class="cokv"><span>${esc(p.n)}</span><b>${esc(p.tel || p.mail || '')}</b></div>`).join('')}</div>` : ''}
<div class="card cotools"><button class="btn ghost" data-a="coEditEl" data-id="${id}">${ic('edit')}Modifier la fiche</button>${M[id] ? '' : `<button class="btn" data-a="coLink" data-id="${id}">${ic('link')}Relier à un compte du club</button>`}</div>`;
  if (tab === 'histo') {
    const h = SEANCES.filter(s => s.pres && s.pres[id] && s.d <= TODAY).sort((a, b) => b.d.localeCompare(a.d)),
      nP = h.filter(s => s.pres[id] === 'P').length;
    b =
      `<div class="stats"><div><b>${h.length}</b><span>Séances</span></div><div><b>${h.length ? Math.round((nP * 100) / h.length) : 0} %</b><span>Présence</span></div><div><b>${h.filter(s => s.pres[id] === 'E').length}</b><span>Excusé</span></div><div><b>${h.filter(s => s.pres[id] === 'A').length}</b><span>Absent</span></div></div>` +
      (h.length
        ? list(
            h
              .map(
                s =>
                  `<button class="item" data-a="open" data-v="seance" data-id="${s.id}"><span class="dblk"><b>${+s.d.slice(8)}</b>${MO[+s.d.slice(5, 7) - 1]}</span><span class="grow"><span class="nm">${esc((grp(s.g) || {}).name || 'Séance')}</span> <span class="tag" ${s.pres[id] === 'P' ? '' : 'style="background:var(--hot);color:#fff"'}>${presLbl[s.pres[id]]}</span><br><span class="muted small">${esc(s.theme || '')}</span></span></button>`
              )
              .join('')
          )
        : none('cal', 'Aucune séance', ''));
  }
  if (tab === 'prog') {
    const t = e.tech || {},
      res = (M[id] && M[id].res) || [];
    b =
      hd(sc.name + ' · niveau actuel') +
      `<div class="card"><div class="coscale">${sc.levels.map(l => `<button class="${lv && l.n === lv.n ? 'on' : lv && l.n < lv.n ? 'past' : ''}" data-a="coLvl" data-id="${id}" data-n="${l.n}" aria-pressed="${!!lv && l.n === lv.n}" aria-label="Niveau ${l.n} ${l.t}">${l.n}</button>`).join('')}</div>${
        lv
          ? `<span class="h3">${lv.n} · ${lv.t}</span><span class="kicker">Prérequis</span><ul class="coul">${lv.pre.map(x => `<li>${esc(x)}</li>`).join('')}</ul><span class="kicker">Attendus pour valider</span><ul class="coul">${lv.att.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
          : '<p class="muted small">Touche un niveau pour le donner à l’élève.</p>'
      }</div>` +
      hd('Grille technique · touche pour faire avancer') +
      `<div class="card">${TECH[sp].map(x => `<button class="cotech" data-a="coTech" data-id="${id}" data-t="${esc(x)}"><span class="grow">${esc(x)}</span><span class="pips" aria-hidden="true">${[1, 2, 3, 4].map(n => `<i class="${(t[x] || 0) >= n ? 'on' : ''}"></i>`).join('')}</span><span class="muted small">${STEPS[t[x] || 0] || 'Non évalué'}</span></button>`).join('')}</div>` +
      ((e.lvlH || []).length
        ? hd('Évolution') +
          `<div class="card">${e.lvlH
            .slice()
            .reverse()
            .map(x => `<div class="cokv"><span class="muted">${fmtD(x.d)}</span><b>Niveau ${x.lvl}</b></div>`)
            .join('')}</div>`
        : '') +
      (res.length
        ? hd('Résultats en tournoi') +
          `<div class="card">${res
            .slice(0, 6)
            .map(
              r =>
                `<div class="cokv"><span>${r.w ? 'Victoire' : 'Défaite'} · ${esc(r.opp)}</span><b>${esc(r.sc)}</b></div>`
            )
            .join('')}</div>`
        : '');
  }
  if (tab === 'suivi') {
    const l = svOf(id),
      un = l.length ? svUnread(id) : 0,
      cards = l
        .filter(x => x.k !== 'msg')
        .reverse()
        .slice(0, 8)
        .map(x => svCard(x, coIsMe(x.by)))
        .join('');
    b =
      list(
        `<button class="item" data-a="open" data-v="dm" data-id="${id}"><span class="tile">${ic('chat')}</span><span class="grow"><span class="nm">Conversation avec ${esc(svFirst(id))}</span><br><span class="muted small">${l.length ? plural(l.length, 'envoi') : 'Aucun échange pour le moment'}</span></span>${un ? `<span class="cnt">${un}</span>` : ''}</button>`
      ) +
      `<div class="card cotools"><button class="btn" data-a="coContent" data-id="${id}">${ic('spark')}Envoyer un contenu</button></div>` +
      (cards ? hd('Bilans, vidéos et contenus') + cards : '');
  }
  return (
    `<div class="pad"><div class="card"><div class="row" style="gap:12px">${coAv(id, 'lg')}<div class="grow"><span class="h3">${esc(svName(id))}</span><br><span class="muted small">${lv ? 'Niveau ' + lv.n + ' · ' + lv.t : sp}${M[id] ? '' : ' · sans compte'}</span></div></div></div></div>` +
    segs('elTab', [
      ['fiche', 'Fiche', 'user'],
      ['histo', 'Historique', 'cal'],
      ['prog', 'Progression', 'ladder'],
      ['suivi', 'Suivi', 'chat']
    ]) +
    `<div class="pad">${b}</div>`
  );
}
/* ---------- Messages : élèves (conversations privées) et groupes (discussions du Club) ---------- */
function coMsgs() {
  let b = '';
  if (S.msTab === 'eleves') {
    const l = coStudents()
      .filter(k => svOf(k).length)
      .sort((a, b) => (svOf(b).slice(-1)[0].at || 0) - (svOf(a).slice(-1)[0].at || 0))
      .sort((a, b) => coIsFav('e:' + b) - coIsFav('e:' + a)); // favoris en haut
    b =
      `<div class="card"><button class="btn full" data-a="coNewMsg">${ic('plus')}Nouveau message</button></div>` +
      (l.length
        ? list(
            l
              .map(k => {
                const x = svOf(k).slice(-1)[0],
                  un = svUnread(k);
                return coFavRow(
                  'e:' + k,
                  `data-a="open" data-v="dm" data-id="${k}"`,
                  `${coAv(k)}<span class="grow"><span class="nm">${esc(svName(k))}</span><br><span class="muted small">${esc(((coIsMe(x.by) ? 'Moi : ' : '') + (x.txt || SV_KIND[x.k][1])).slice(0, 70))}</span></span><span class="muted small">${fmtD(svDay(x.at), 1)}</span>${un ? `<span class="cnt">${un}</span>` : ''}`,
                  svName(k)
                );
              })
              .join('')
          )
        : none('chat', 'Aucune conversation', 'Toi seul peux commencer une conversation avec un élève.'));
  } else {
    const gs = coGroups('', true)
        .filter(coIsGrp)
        .sort((a, b) => coIsFav('c:' + b.id) - coIsFav('c:' + a.id)), // favoris en haut
      rows = gs
        .map(g => {
          const c = chans.find(c => c.id === g.id);
          if (!c) return '';
          const last = (c.msgs || []).slice(-1)[0];
          return coFavRow(
            'c:' + c.id,
            `data-a="open" data-v="chan" data-id="${c.id}"`,
            `<span class="tile">${ic('users')}</span><span class="grow"><span class="nm">${esc(c.name)}</span><br><span class="muted small">${last ? esc(String(last.x || 'Photo').slice(0, 60)) : 'Aucun message'}</span></span>${c.un ? `<span class="cnt">${c.un}</span>` : ''}`,
            c.name
          );
        })
        .join('');
    b =
      (rows ? list(rows) : none('users', 'Aucun groupe', '')) +
      `<div class="card"><p class="muted small">Les discussions des groupes sont celles de /RAM Club : annonces, changements de lieu, cours annulés.</p></div>`;
  }
  return (
    segs('msTab', [
      ['eleves', 'Élèves', 'user'],
      ['groupes', 'Groupes', 'users']
    ]) + `<div class="pad">${coClubBar()}${b}</div>`
  );
}
/* ---------- Tableau de bord : toutes mes statistiques, sur un club ou tous, au mois, sur la saison ou sur un an ---------- */
const MOIS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
const coSeasonStart = () => (+TODAY.slice(5, 7) >= 9 ? TODAY.slice(0, 4) : +TODAY.slice(0, 4) - 1) + '-09-01';
const coPres = x => (x.s && x.s.pres ? Object.values(x.s.pres).filter(v => v === 'P').length : 0);
const coMoney = x => {
  const t = tarifOf(x.g);
  return t.mode === 'heure' ? (t.prix * durMin(x.g.dur)) / 60 : t.mode === 'eleve' ? t.prix * coPres(x) : +t.prix || 0;
};
/* chiffres d'une liste de séances faites */
function coFigures(l) {
  const called = l.filter(x => x.s && x.s.pres),
    att = called.reduce((a, x) => a + Object.keys(x.s.pres).length, 0),
    p = called.reduce((a, x) => a + coPres(x), 0);
  return {
    n: l.length,
    h: l.reduce((a, x) => a + durMin(x.g.dur), 0) / 60,
    eur: l.reduce((a, x) => a + coMoney(x), 0),
    att: att ? Math.round((p * 100) / att) : null
  };
}
const eurs = n => Math.round(n).toLocaleString('fr-FR') + ' €';
function coDash() {
  const per = S.dashP || 'saison',
    from = per === 'mois' ? TODAY.slice(0, 8) + '01' : per === 'an' ? isoIn(-364) : coSeasonStart(),
    gs = coGroups(),
    done = coSessions(from, TODAY).filter(x => !isCx(x.g, x.d)),
    F = coFigures(done),
    eleves = new Set(gs.flatMap(coStu)),
    act = gs.filter(g => coIsGrp(g) && !coOver(g)),
    fillG = act.filter(g => g.max),
    fill = fillG.length
      ? Math.round((fillG.reduce((a, g) => a + coStu(g).length / g.max, 0) * 100) / fillG.length)
      : null,
    terrain = act.reduce((a, g) => a + durMin(g.dur), 0) / 60;
  // évolution mois par mois (12 derniers mois, ou depuis la rentrée)
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const [y, m] = TODAY.split('-').map(Number),
      d = new Date(y, m - 1 - i, 1),
      a = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01',
      z = isoIn(-1, new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10)),
      l = coSessions(a, z < TODAY ? z : TODAY).filter(x => !isCx(x.g, x.d));
    if (per !== 'an' && a < coSeasonStart()) continue;
    months.push([MOIS[d.getMonth()], coFigures(l)]);
  }
  const mx = Math.max(1, ...months.map(m => m[1].eur));
  const row = (t, sub, v) =>
    `<div class="cokv"><span class="grow">${t}<br><span class="muted small">${sub}</span></span><b>${v}</b></div>`;
  const byClub = coMulti()
    ? coClubList()
        .map(c => {
          const l = done.filter(x => coClubOf(x.g) === c.id),
            f = coFigures(l);
          return row(
            esc(c.name),
            `${fr(f.h)} h · ${plural(l.length, 'séance')}${f.att != null ? ' · ' + f.att + ' % de présence' : ''}`,
            eurs(f.eur)
          );
        })
        .join('')
    : '';
  // les groupes un par un ; les séances ponctuelles rassemblées par type (cours individuel, duo…)
  const once = {};
  done.filter(x => !coIsGrp(x.g)).forEach(x => (once[x.g.name] = once[x.g.name] || []).push(x));
  const byOnce = Object.keys(once)
    .sort((a, b) => once[b].length - once[a].length)
    .map(n => {
      const f = coFigures(once[n]);
      return row(esc(n), `${plural(f.n, 'séance')} · ${fr(f.h)} h`, eurs(f.eur));
    })
    .join('');
  const byGroup = gs
    .filter(g => coIsGrp(g) && (!coOver(g) || done.some(x => x.g === g)))
    .map(g => {
      const l = done.filter(x => x.g === g),
        f = coFigures(l);
      return row(
        esc(g.name) + (coMulti() ? ' · ' + esc(coClubName(g)) : ''),
        `${plural(coStu(g).length, 'élève')}${g.max ? ' sur ' + g.max : ''} · ${fr(f.h)} h${f.att != null ? ' · ' + f.att + ' % de présence' : ''}`,
        eurs(f.eur)
      );
    })
    .join('');
  const bySport = ['Tennis', 'Padel']
    .map(sp => {
      const f = coFigures(done.filter(x => x.g.sport === sp));
      return f.n ? row(sp, `${fr(f.h)} h · ${plural(f.n, 'séance')}`, eurs(f.eur)) : '';
    })
    .join('');
  return `<div class="pad">${coClubChips()}<div class="card"><div class="chips">${[
    ['mois', 'Ce mois'],
    ['saison', 'Saison'],
    ['an', '12 mois']
  ]
    .map(p => `<button class="chip" data-a="coDashP" data-v="${p[0]}" aria-pressed="${per === p[0]}">${p[1]}</button>`)
    .join('')}</div></div>
<div class="stats codash"><div><b>${eurs(F.eur)}</b><span>Chiffre d'affaires</span></div><div><b>${fr(F.h)}</b><span>Heures données</span></div><div><b>${eleves.size}</b><span>Élèves</span></div><div><b>${F.n}</b><span>Séances</span></div><div><b>${fill == null ? '–' : fill + ' %'}</b><span>Remplissage</span></div><div><b>${F.att == null ? '–' : F.att + ' %'}</b><span>Présence</span></div><div><b>${fr(terrain)}</b><span>H de terrain / sem.</span></div><div><b>${F.h ? eurs(F.eur / F.h) : '–'}</b><span>Par heure</span></div></div>
${hd('Évolution mois par mois')}<div class="card cobars comonths">${months.map(([l, f]) => `<div><b>${f.eur ? Math.round(f.eur) : ''}</b><i style="height:${Math.round((f.eur / mx) * 100)}%"></i><span>${l}</span><small>${fr(f.h)} h</small></div>`).join('')}</div>
${byClub ? hd('Par club') + `<div class="card">${byClub}</div>` : ''}
${hd('Par groupe')}<div class="card">${byGroup || empty('users', 'Aucun groupe', '')}</div>
${byOnce ? hd('Séances ponctuelles') + `<div class="card">${byOnce}</div>` : ''}
${bySport ? hd('Par sport') + `<div class="card">${bySport}</div>` : ''}
<div class="card"><p class="muted small">Chiffre d'affaires calculé avec le tarif de chaque groupe (par séance, à l'heure ou par élève présent), réglable dans la page du groupe. Heures de terrain : un terrain par groupe pendant la durée du cours.</p></div></div>`;
}
/* ---------- Mes clubs : les clubs où j'enseigne ; dans chacun, mes groupes et ses élèves ---------- */
function coClubs() {
  return `<div class="pad">${coClubList()
    .map(c => {
      const gs = coGroups('', true).filter(g => coClubOf(g) === c.id && coIsGrp(g) && !coOver(g)),
        el = new Set(gs.flatMap(coStu)).size,
        h = gs.reduce((a, g) => a + durMin(g.dur), 0) / 60,
        main = c.id === coMainId();
      return `<button class="card coclubc" data-a="open" data-v="cclub" data-id="${c.id}"><span class="row" style="gap:12px;align-items:center"><span class="tile">${ic('club')}</span><span class="grow"><span class="h3" style="font-size:20px">${esc(c.name)}</span>${main ? ' <span class="tag copink">Club principal</span>' : ''}<br><span class="muted small">${plural(gs.length, 'groupe')} · ${plural(el, 'élève')} · ${fr(h)} h par semaine</span></span>${ic('back')}</span></button>`;
    })
    .join(
      ''
    )}<div class="card cotools"><button class="btn ghost" data-a="coOtherClub">${ic('plus')}J'enseigne dans un autre club</button><button class="btn ghost" data-a="open" data-v="niveaux">${ic('ladder')}Échelles de niveaux</button><button class="btn ghost" data-a="open" data-v="formules">${ic('ball')}Formules et tarifs</button></div></div>`;
}
/* un groupe dans la liste : la ligne ouvre le groupe ; l'interrupteur le remet en cours ou termine son cycle */
const coGrpRow = g =>
  `<div class="item cofr"><button class="cofav" data-a="open" data-v="cgroupe" data-id="${g.id}"><span class="tile">${ic('users')}</span><span class="grow"><span class="nm">${esc(g.name)}</span><br><span class="muted small">${coOver(g) ? (g.from ? 'Du ' + fmtD(g.from) + ' au ' : 'Jusqu’au ') + fmtD(g.to) : coSlot(g) + ' · ' + g.dur} · ${plural(coStu(g).length, 'élève')}${g.max ? ' sur ' + g.max : ''}</span></span>${coStack(coStu(g))}</button>${coCycleTg(g)}</div>`;
const coCycleTg = g =>
  `<span class="cocyc"><span class="muted small">${coOver(g) ? 'Terminé' : 'En cours'}</span><button class="tg" role="switch" aria-checked="${!coOver(g)}" data-a="coCycle" data-id="${g.id}" aria-label="${esc(g.name)} : ${coOver(g) ? 'remettre le groupe en cours' : 'terminer le cycle'}"></button></span>`;
function coClubPage(id) {
  const c = coClubList().find(x => x.id === id);
  if (!c) return `<div class="pad">${none('club', 'Club introuvable', '')}</div>`;
  const all = coGroups('', true).filter(g => coClubOf(g) === id && coIsGrp(g)),
    gs = all.filter(g => !coOver(g)),
    over = all.filter(coOver),
    mem = Object.keys(M).filter(k => k !== 'club' && (M[k]._club || coMainId()) === id && !M[k].kids),
    el = new Set(gs.flatMap(coStu));
  return `<div class="pad"><div class="card"><span class="coey">${id === coMainId() ? 'Club principal' : 'Club'}</span><span class="h3">${esc(c.name)}</span><div class="cokv"><span class="muted">Mes groupes</span><b>${gs.length}</b></div><div class="cokv"><span class="muted">Mes élèves</span><b>${el.size}</b></div><div class="cokv"><span class="muted">Adhérents du club</span><b>${mem.length}</b></div></div>
${hd('Mes groupes dans ce club')}${gs.length ? list(gs.map(coGrpRow).join('')) : none('users', 'Aucun groupe', 'Un groupe rassemble des élèves qui jouent ensemble chaque semaine, avec leur discussion dans /RAM Club.')}${over.length ? hd('Cycles terminés') + list(over.map(coGrpRow).join('')) : ''}
<div class="card cotools"><button class="btn" data-a="coNewGrp" data-c="${id}">${ic('plus')}Créer un groupe dans ce club</button><button class="btn ghost" data-a="coSeeEl" data-c="${id}">${ic('users')}Voir mes élèves de ce club</button><button class="btn ghost" data-a="open" data-v="histo">${ic('cal')}Historique des séances</button></div>
<div class="card"><p class="muted small">Les élèves se proposent d'eux-mêmes : ce sont les adhérents de ce club dans /RAM Club. Un élève qui n'a pas encore de compte s'ajoute à la main, puis se relie à son compte.</p></div></div>`;
}
/* échelles de niveaux de l'enseignant (sur son compte /RAM, pour tous ses clubs) : modifiables, autant de niveaux que voulu */
const coLevels = () =>
  `<div class="pad"><div class="card"><p class="muted small">Tes échelles, pour tous tes clubs. Le niveau donné à un élève se recopie dans sa fiche /RAM Club (niveau padel ou niveau tennis). Changer l'ordre ou supprimer un niveau change le numéro des niveaux suivants.</p></div>${Object.keys(
    SCALES
  )
    .map(
      sp =>
        hd(
          SCALES[sp].name,
          `<button class="ib" data-a="coScName" data-s="${sp}" aria-label="Renommer l'échelle">${ic('edit')}</button>`
        ) +
        SCALES[sp].levels
          .map(
            (l, i, all) =>
              `<div class="card colvl"><div class="row" style="gap:10px;align-items:flex-start"><span class="dblk"><b>${i + 1}</b>niv.</span><div class="grow"><span class="h3" style="font-size:18px">${esc(l.t)}</span><p class="small"><b>Prérequis :</b> ${l.pre.map(esc).join(' · ') || '–'}</p><p class="small"><b>Attendus :</b> ${l.att.map(esc).join(' · ') || '–'}</p></div></div><div class="cotools"><button class="btn sm ghost" data-a="coLvlEdit" data-s="${sp}" data-i="${i}">${ic('edit')}Modifier</button><button class="btn sm ghost" data-a="coLvlMove" data-s="${sp}" data-i="${i}" data-n="-1" ${i ? '' : 'disabled'} aria-label="Monter">Monter</button><button class="btn sm ghost" data-a="coLvlMove" data-s="${sp}" data-i="${i}" data-n="1" ${i < all.length - 1 ? '' : 'disabled'} aria-label="Descendre">Descendre</button><button class="btn sm ghost" data-a="coLvlDel" data-s="${sp}" data-i="${i}">${ic('trash')}Supprimer</button></div></div>`
          )
          .join('') +
        `<div class="card"><button class="btn full" data-a="coLvlEdit" data-s="${sp}" data-i="new">${ic('plus')}Ajouter un niveau ${sp.toLowerCase()}</button></div>`
    )
    .join('')}</div>`;
/* ---------- Historique des séances : toutes mes séances faites, de la plus récente, mois par mois ----------
   la date d'abord, puis le type de séance et les élèves (avatars) : un groupe ou un cours ponctuel */
const MOISL = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre'
];
const coHisRow = x => {
  const w = coWho(x);
  return `<button class="item cohis" data-a="open" data-v="seance" data-id="${sesKey(x.g, x.d)}">${coDblk(x.d, x.g.h)}<span class="grow"><span class="nm">${esc(coIsGrp(x.g) ? x.g.name : x.g.name + (w.length ? ' avec ' + coNames(w) : ''))}</span><br><span class="muted small">${coIsGrp(x.g) ? esc(coNames(w)) : x.g.dur}${coMulti() ? ' · ' + esc(coClubName(x.g)) : ''}</span></span>${coStack(w)}</button>`;
};
function coHisto() {
  const f = S.hiF || 'all',
    start = SEANCES.map(s => s.d)
      .concat(GROUPS.map(g => g.once || g.from))
      .filter(Boolean)
      .sort()[0],
    l = coSessions(start && start < TODAY ? start : coSeasonStart(), TODAY, '', 1)
      .filter(x => !isCx(x.g, x.d) && (f === 'all' || (f === 'grp' ? coIsGrp(x.g) : !coIsGrp(x.g))))
      .reverse(),
    months = [];
  l.forEach(x => {
    const k = x.d.slice(0, 7);
    if (!months.length || months[months.length - 1][0] !== k) months.push([k, []]);
    months[months.length - 1][1].push(x);
  });
  const chip = (v, t) => `<button class="chip" data-a="coHiF" data-v="${v}" aria-pressed="${f === v}">${t}</button>`;
  return `<div class="pad">${coClubChips()}<div class="card"><div class="chips">${chip('all', 'Toutes')}${chip('once', 'Cours ponctuels')}${chip('grp', 'Groupes')}</div><span class="muted small">${plural(l.length, 'séance')} · ${fr(l.reduce((a, x) => a + durMin(x.g.dur), 0) / 60)} h</span></div>${
    months
      .map(
        ([k, xs]) =>
          hd(
            MOISL[+k.slice(5) - 1] + ' ' + k.slice(0, 4),
            `<span class="muted small">${plural(xs.length, 'séance')}</span>`
          ) + list(xs.map(coHisRow).join(''))
      )
      .join('') ||
    none('cal', 'Aucune séance', 'Les séances faites apparaissent ici, de la plus récente à la plus ancienne.')
  }</div>`;
}
/* ---------- page d'un groupe vue par l'enseignant ----------
   ses séances à venir (thème, date déplacée, séance ajoutée) et ses séances faites (appel, bilan), sa formule
   (pack, cycle, abonnement : coach/6-groupes.js), sa discussion dans /RAM Club et ses élèves */
function coSesRow(g, d) {
  const s = sesFind(g, d),
    cx = isCx(g, d),
    past = d <= TODAY,
    id = sesKey(g, d),
    dr = BROUILLONS.some(b => b.id === id && (b._club || '') === (g._club || '')),
    nP = s && s.pres ? Object.values(s.pres).filter(v => v === 'P').length : null,
    [y, m, dd] = d.split('-').map(Number),
    tag = cx
      ? ['Annulée', 'cx']
      : !past
        ? s && s.theme
          ? null
          : ['Thème à définir', '']
        : s && s.recap
          ? ['Bilan envoyé', 'ok']
          : dr
            ? ['Brouillon', '']
            : s && s.noRecap
              ? ['Sans bilan', '']
              : ['Bilan à écrire', 'todo'];
  const sub = past
    ? [nP != null ? nP + '/' + coStu(g).length + ' présents' : 'Appel à faire', s && s.theme ? esc(s.theme) : '']
        .filter(Boolean)
        .join(' · ')
    : [g.dur, s && s.theme ? esc(s.theme) : ''].filter(Boolean).join(' · ');
  return `<button class="item cohis" data-a="open" data-v="seance" data-id="${id}">${coDblk(d, g.h)}<span class="grow"><span class="nm">${DAYS[coDow(d)]} ${fmtD(d, 1)}${d === TODAY ? " · aujourd'hui" : ''}</span><br><span class="muted small">${sub}</span></span>${tag ? `<span class="tag cost ${tag[1]}">${tag[0]}</span>` : ''}</button>`;
}
function coGroupe(id) {
  const g = grp(id);
  if (!g) return `<div class="pad">${none('users', 'Groupe introuvable', '')}</div>`;
  const t = tarifOf(g),
    st = coStu(g),
    up = coDates(g, isoIn(1), g.to && g.to > isoIn(1) ? g.to : isoIn(180)),
    next = up.slice(0, 5),
    past = coDates(g, g.from || isoIn(-365), TODAY).reverse(),
    c = chans.find(x => x.id === g.id),
    todo = past.filter(d => {
      const s = sesFind(g, d);
      return !isCx(g, d) && !(s && (s.recap || s.noRecap)) && !BROUILLONS.some(b => b.id === sesKey(g, d));
    }).length,
    recaps = past.map(d => ({ d, s: sesFind(g, d) })).filter(x => x.s && x.s.recap);
  return `<div class="pad"><div class="card"><span class="kicker">${coSlot(g)} · ${g.dur} · ${g.defLoc || 'En salle'}</span><span class="h3">${esc(g.name)}</span><div class="cokv"><span class="muted">Enseignant</span><b>${g.coach && M[g.coach] ? esc(name(g.coach)) : 'À choisir'}</b></div><div class="cokv"><span class="muted">Élèves</span><b>${st.length}${g.max ? ' sur ' + g.max + ' places' : ''}</b></div><div class="cokv"><span class="muted">Tarif</span><b>${t.prix ? t.prix + ' € ' + TARIF_MODES[t.mode] : 'Non renseigné'}</b></div>${coGrpOffer(g)}${coLocTg(g)}<div class="cokv"><span class="muted">${coOver(g) ? 'Cycle terminé le ' + fmtD(g.to) : g.to ? 'Cycle en cours, jusqu’au ' + fmtD(g.to) : 'En cours, chaque semaine'}</span>${coCycleTg(g)}</div><div class="ctl" style="flex-wrap:wrap"><button class="btn sm grow" data-a="coPlan" data-id="${g.id}">${ic('cal')}Programmer des séances</button><button class="btn sm grow ghost" data-a="coGrpEdit" data-id="${g.id}">${ic('edit')}Réglages</button></div></div>
${hd('Discussion du groupe')}${
    c
      ? list(
          `<button class="item" data-a="open" data-v="chan" data-id="${c.id}"><span class="tile">${ic('chat')}</span><span class="grow"><span class="nm">${esc(c.name)}</span><br><span class="muted small">Dans /RAM Club pour les élèves et les parents</span></span></button><button class="item" data-a="chanDel" data-id="${c.id}"><span class="tile">${ic('x')}</span><span class="grow"><span class="nm">Supprimer la discussion</span><br><span class="muted small">Le groupe et ses séances restent</span></span></button>`
        )
      : `<div class="card"><p class="muted small">Ce groupe n'a pas de discussion dans /RAM Club.</p><button class="btn sm full ghost" data-a="coChanNew" data-id="${g.id}">${ic('plus')}Créer la discussion du groupe</button></div>`
  }
${hd('Séances à venir · ' + up.length, `<button class="chip" data-a="coPlan" data-id="${g.id}">${ic('plus')}Ajouter</button>`)}${
    up.length
      ? list(
          up
            .slice(0, 12)
            .map(d => coSesRow(g, d))
            .join('') +
            (up.length > 12
              ? `<p class="muted small" style="padding:8px 0">Et ${plural(up.length - 12, 'autre séance', 'autres séances')}.</p>`
              : '')
        )
      : none('cal', 'Aucune séance à venir', 'Programme des séances : un pack, un cycle ou des dates une par une.')
  }
${coOffHtml(g)}
${next.length ? `<details class="card cothm"><summary><b>Thèmes des prochaines séances</b><span class="muted small"> · les élèves les voient dans leurs cours</span></summary><form id="co-themes" data-id="${g.id}">${next.map(d => `<div class="fld"><label for="co-t-${d}">${fmtD(d)}${isCx(g, d) ? ' · annulé' : ''}</label><input id="co-t-${d}" data-d="${d}" class="co-t" list="co-thl2" placeholder="Thème" value="${esc((sesFind(g, d) || {}).theme || '')}"></div>`).join('')}<datalist id="co-thl2">${THEMES[g.sport].map(x => `<option value="${esc(x)}">`).join('')}</datalist><button class="btn full">Enregistrer les thèmes</button></form></details>` : ''}
${hd('Séances effectuées · ' + past.length, todo ? `<span class="tag cost todo">${plural(todo, 'bilan à écrire', 'bilans à écrire')}</span>` : '')}${past.length ? list(past.map(d => coSesRow(g, d)).join('')) : none('check', 'Aucune séance faite', 'Après chaque séance : l’appel et le bilan, ici.')}
${
  recaps.length
    ? hd('Bilans du groupe') +
      list(
        recaps
          .slice(0, 6)
          .map(
            x =>
              `<button class="item" data-a="open" data-v="seance" data-id="${sesKey(g, x.d)}"><span class="tile">${ic('doc')}</span><span class="grow"><span class="nm">${fmtD(x.d)}</span><br><span class="muted small">${esc(String(x.s.recap).slice(0, 110))}</span></span></button>`
          )
          .join('')
      )
    : ''
}
${hd('Élèves')}<div class="card">${st.map(k => `<div class="corow">${coAv(k)}<button class="nm grow" data-a="open" data-v="eleve" data-id="${k}" style="text-align:left">${esc(svName(k))}</button><button class="ib" data-a="coRm" data-g="${g.id}" data-k="${k}" aria-label="Retirer ${esc(svName(k))} du groupe">${ic('x')}</button></div>`).join('') || empty('users', 'Aucun élève', '')}<button class="btn sm full" data-a="coAdd" data-id="${g.id}">${ic('plus')}Ajouter des élèves</button></div></div>`;
}
/* ---------- Profil : la page de l'enseignant, sur le modèle du profil /RAM JA ----------
   carte d'identité bordeaux, puis des cartes titrées : fiche enseignant, clubs (pour information : on n'y
   change pas de club), apparence, notifications, compte /RAM. Rien du réseau social du Club. */
const coPCard = (ey, h, body) =>
  `<section class="card copc"><span class="coey">${ey}</span><h2 class="coh2">${h}</h2>${body}</section>`;
function coMyClubs() {
  if (window.RAM && RAM.live)
    return RAM.clubs
      .filter(c => c.role === 'coach' || c.role === 'bureau' || S.super)
      .sort((a, b) => Number(b.main) - Number(a.main) || String(a.name).localeCompare(b.name))
      .map(c => ({
        name: c.name,
        main: c.main,
        role: S.super ? 'Administrateur' : c.role === 'bureau' ? 'Bureau et enseignant' : 'Enseignant'
      }));
  return [{ name: club().name, main: true, role: 'Enseignante' }].concat(
    Object.keys(CO_EXT).map(id => ({ name: CO_EXT[id].name, main: false, role: 'Enseignante' }))
  );
}
function coProfile() {
  const me = ME(),
    m = M[me] || { n: 'Moi' },
    p = proOf(me),
    mine = coAllGroups('me').filter(g => coIsGrp(g) && !coOver(g)),
    hrs = mine.reduce((a, g) => a + durMin(g.dur), 0) / 60,
    nEl = new Set(mine.flatMap(coStu)).size,
    clubs = coMyClubs(),
    [fn, ...ln] = String(m.n).split(' '),
    role = S.super ? 'Administrateur' : S.role === 'admin' ? 'Bureau et enseignant' : 'Enseignant',
    N = [
      ['suivi', 'Messages, réponses et vidéos de mes élèves'],
      ['resa', 'Réservations et annulations de séances'],
      ['chan', 'Messages dans mes groupes']
    ],
    seg = (a, val, l) =>
      `<div class="coseg">${l.map(([k, t, i]) => `<button data-a="${a}" data-k="${k}" aria-pressed="${val === k}">${i ? ic(i) : ''}${t}</button>`).join('')}</div>`,
    user = window.RAM && RAM.user;
  const hero = `<section class="card cohero"><span class="coey">Mon compte enseignant</span><div class="row" style="gap:16px;align-items:center">${M[me] ? `<label class="avedit" aria-label="Changer ma photo">${av(me, 'xl')}<span class="cam">${ic('image')}</span><input type="file" id="me-photo" accept="image/*"></label>` : ''}<div class="grow" style="min-width:0"><h1 class="coname"><span>${esc(fn)}</span> <span>${esc(ln.join(' '))}</span></h1><div class="tags" style="display:flex;margin-top:8px"><span class="tag copink">${role}</span><span class="tag coghost">${plural(clubs.length, 'club')}</span></div></div></div></section>`;
  const fiche = coPCard(
    'Profil public',
    'Ma fiche enseignant',
    `${p.on ? profCard(me, true) : '<p>Ta fiche n’est pas encore publiée. Remplis-la pour apparaître dans /RAM Club, École, Enseignants, avec ton diplôme, tes coordonnées, tes tarifs et ton lien de réservation.</p>'}<button class="btn full ${p.on ? 'ghost' : ''}" data-a="coPro">${ic('edit')}${p.on ? 'Modifier ma fiche' : 'Remplir ma fiche'}</button>`
  );
  const mesClubs = coPCard(
    'Clubs',
    'Mes clubs',
    `<div class="colist">${clubs.map(c => `<div class="item"><span class="tile">${ic('club')}</span><span class="grow"><span class="nm">${esc(c.name)}</span><br><span class="muted small">${c.role}</span></span>${c.main ? '<span class="tag copink">Club principal</span>' : ''}</div>`).join('')}</div><p class="muted small">Tous tes groupes et tous tes élèves, de tous tes clubs, sont dans /RAM Coach. Le club principal est celui de ta licence, choisi dans /RAM Club.</p><button class="btn full ghost" data-a="coOtherClub">${ic('plus')}J'enseigne dans un autre club</button>`
  );
  const tarifs = coPCard(
    'Tarifs',
    'Formules et tarifs',
    `<p class="muted small">${plural(OFFRES.formules.length, 'formule')} · ${plural(OFFRES.packs.length, 'pack')} · ${plural(OFFRES.abos.length, 'abonnement')}. Ils s'affichent sur ta fiche enseignant dans /RAM Club.</p><button class="btn full" data-a="open" data-v="formules">${ic('ball')}Mes formules et tarifs</button>`
  );
  const look = coPCard(
    'Affichage',
    'Apparence',
    `${seg('mode', S.mode || 'systeme', [
      ['jour', 'Jour', 'sun'],
      ['nuit', 'Nuit', 'moon'],
      ['systeme', 'Système', 'screen']
    ])}<h3 class="coh3">Style de l'interface</h3>${seg('ustyle', S.ustyle || '', [
      ['epure', 'Épuré'],
      ['', 'Street dosé'],
      ['street', 'Full street']
    ])}<h3 class="coh3">Fond de l'interface</h3><div class="motifs">${MOTIFS.map(([k, l]) => `<button data-a="motif" data-k="${k}" aria-pressed="${S.motif === k}"><i class="${k}"></i>${l}</button>`).join('')}</div><p class="muted small">Choix mémorisé sur cet appareil.</p>`
  );
  const notifs = coPCard(
    'Notifications',
    'Mes notifications',
    `${N.map(x => `<div class="ct"><span class="grow">${x[1]}</span><button class="tg" role="switch" aria-checked="${!!S.nset[x[0]]}" aria-label="${x[1]}" data-a="nset" data-k="${x[0]}"></button></div>`).join('')}<div class="ct"><span class="grow">Notifications sur ce téléphone<br><span class="muted small">Même quand l'appli est fermée</span></span><button class="btn sm ghost" data-a="pushOn">Activer</button></div>`
  );
  const compte = coPCard(
    'Compte /RAM',
    'Mon compte',
    `<div class="colist"><div class="cokv"><span class="muted">E-mail</span><b>${user ? esc(user.email || '') : 'Démonstration'}</b></div><div class="cokv"><span class="muted">Applis</span><b>/RAM Coach · /RAM Club · /RAM JA</b></div></div><p class="muted small">Un seul compte /RAM pour les trois applis. Le mot de passe changé ici vaut aussitôt dans les trois.</p><div class="cotools">${user ? `<button class="btn ghost" data-a="ramPw">${ic('shield')}${user.hasPassword ? 'Changer le mot de passe' : 'Choisir un mot de passe'}</button>` : ''}<button class="btn ghost" data-a="open" data-v="aide">${ic('info')}Aide</button><button class="btn ghost" data-a="open" data-v="legal">${ic('shield')}Conditions</button>${user ? `<button class="btn ghost" data-a="logout">${ic('logout')}Se déconnecter</button>` : ''}</div>`
  );
  const stats = `<div class="stats"><div><b>${mine.length}</b><span>Groupes</span></div><div><b>${nEl}</b><span>Élèves</span></div><div><b>${fr(hrs)}</b><span>Heures / sem.</span></div><div><b>${p.since ? +TODAY.slice(0, 4) - +p.since : '–'}</b><span>Ans d'expérience</span></div></div>`;
  return `<div class="pad coprof">${hero}${stats}${fiche}${tarifs}${mesClubs}${look}${notifs}${compte}</div>`;
}
Object.assign(V, {
  today: coToday,
  dash: coDash,
  planning: coPlanning,
  seance: coSeance,
  eleves: coEleves,
  eleve: coEleve,
  msgs: coMsgs,
  clubs: coClubs,
  cclub: coClubPage,
  niveaux: coLevels,
  cgroupe: coGroupe,
  histo: coHisto,
  me: coProfile
});
