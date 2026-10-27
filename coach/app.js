/* /RAM Coach — app.js : les écrans et les actions du prototype.
   L'appli du coach : son planning, ses groupes, ses élèves (des adhérents /RAM Club), l'appel, les bilans de séance,
   la progression, ses statistiques. Tout ce que fait l'élève (voir son historique, envoyer une vidéo, répondre)
   passe par la page École de /RAM Club : ici, ces liens sont signalés par une note bleue « /RAM Club ».
   Prototype : aucune donnée n'est envoyée, les changements s'effacent quand on recharge la page. */

/* ---------- état ---------- */
const S = { tab: 'today', stack: [], wk: 0, mine: true, q: '', fg: 'all', noacc: false, statP: 'mois', statScope: 'moi', stTab: {}, schoolTab: 'groupes', vidF: 'todo', lvSport: 'Padel', ignored: new Set(), checks: {}, persoOpen: {} };
const view = () => S.stack[S.stack.length - 1] || { v: S.tab };
const go = (v, id) => {
  S.stack.push({ v, id });
  render(true);
};
const back = () => {
  S.stack.pop();
  render(true);
};

/* ---------- outils ---------- */
const st = id => STUDENTS[id];
const nm = s => s.first + ' ' + s.last;
const ini = s => (s.first[0] + s.last[0]).toUpperCase();
const av = (s, c = '') => `<span class="av ${c}" style="background:${s.color}">${ini(s)}</span>`;
const cav = (c, cl = 'sm') => `<span class="av ${cl}" style="background:${c.color};color:#0b0b0b">${c.first[0]}${c.last[0]}</span>`;
const age = s => 2026 - s.born;
const isKid = s => age(s) < 18;
const coachName = id => COACHES[id].first + ' ' + COACHES[id].last;
const past = s => s.date < TODAY || (s.date === TODAY && s.start + s.dur <= NOW_MIN);
const isNow = s => s.date === TODAY && s.start <= NOW_MIN && NOW_MIN < s.start + s.dur;
const mineS = s => s.coach === ME;
const gName = s => (GROUPS[s.g].indiv ? 'Cours individuel · ' + nm(st(GROUPS[s.g].indiv)) : GROUPS[s.g].name);
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const euros = n => Math.round(n).toLocaleString('fr-FR') + ' €';
const plural = (n, a, b = a + 's') => n + ' ' + (n > 1 ? b : a);
const levelLabel = s => {
  if (s.sport === 'Tennis' && !s.level) return 'Classement ' + (s.rank || 'NC');
  const L = SCALES[s.sport].levels.find(l => l.n === s.level);
  return s.sport === 'Padel' ? `Niveau ${s.level} · ${L.t}` : `Galaxie ${L.t}`;
};
const studentsOf = g => Object.values(STUDENTS).filter(s => s.groups.includes(g));
const myStudents = () => Object.values(STUDENTS).filter(s => s.groups.some(g => GROUPS[g].coach === ME));
const sessOfStudent = id => SESSIONS.filter(s => s.members.includes(id));
function assid(id) {
  const l = sessOfStudent(id).filter(s => past(s) && !s.cancelled && s.att[id]);
  return { n: l.length, p: l.filter(s => s.att[id] === 'p').length, rate: pct(l.filter(s => s.att[id] === 'p').length, l.length) };
}
const extOn = () => EXT.filter(x => !S.ignored.has(x.id));
const monday = off => {
  const d = D(TODAY),
    wd = (d.getDay() + 6) % 7;
  return addDays(TODAY, -wd + off * 7);
};
const revenue = s => {
  if (s.cancelled) return 0;
  const T = TYPES[GROUPS[s.g].type];
  return T.mode === 'seance' ? T.prix : T.mode === 'heure' ? (T.prix * s.dur) / 60 : T.prix * Object.values(s.att).filter(v => v === 'p').length;
};
let toastT;
function toast(msg, ico = 'check') {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.innerHTML = ic(ico) + `<span>${msg}</span>`;
  document.body.appendChild(t);
  clearTimeout(toastT);
  toastT = setTimeout(() => t.remove(), 3200);
}
const clubNote = txt => `<p class="club-note">${ic('link')}<span>${txt}</span></p>`;

/* ---------- cadre : barre haute et navigation ---------- */
const TABS = [
  ['today', 'today', 'Aujourd’hui'],
  ['planning', 'cal', 'Planning'],
  ['students', 'users', 'Élèves'],
  ['school', 'school', 'École'],
  ['stats', 'chart', 'Stats']
];
const MORE = [
  ['videos', 'video', 'Vidéos reçues'],
  ['messages', 'chat', 'Messages'],
  ['levels', 'ladder', 'Échelle de niveaux'],
  ['agenda', 'link', 'Agendas connectés'],
  ['types', 'euro', 'Tarifs des séances']
];
const pendingVideos = () => VIDEOS.filter(v => !v.reply && myStudents().some(s => s.id === v.s)).length;
function navHTML() {
  const cur = S.stack.length ? null : S.tab;
  const b = ([t, i, l], cls = '') =>
    `<button class="${cls} ${cur === t ? 'on' : ''}" data-a="tab" data-t="${t}" ${cur === t ? 'aria-current="page"' : ''}>${ic(i)}<span>${l}</span>${t === 'videos' && pendingVideos() ? `<span class="n">${pendingVideos()}</span>` : ''}</button>`;
  return `<div class="side-head"><span class="logo"><img class="lg-w" src="img/ram-blanc.png" alt="/RAM"><img class="lg-n" src="img/ram-noir.webp" alt=""><b>COACH</b></span></div>${TABS.map(x => b(x)).join('')}<div class="side-sep more-only"></div>${MORE.map(x => b(x, 'more-only')).join('')}<button class="more-only" data-a="timer">${ic('timer')}<span>Minuteur</span></button><div class="side-foot"><button class="more-only" data-a="theme">${ic(document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun')}<span>${document.documentElement.dataset.theme === 'light' ? 'Mode nuit' : 'Mode jour'}</span></button><button class="more-only" data-a="tab" data-t="team">${cav(COACHES[ME])}<span>${COACHES[ME].first} ${COACHES[ME].last}</span></button></div>`;
}
const TITLES = { today: 'Aujourd’hui', planning: 'Planning', students: 'Élèves', school: 'École', stats: 'Statistiques', videos: 'Vidéos reçues', messages: 'Messages', levels: 'Échelle de niveaux', agenda: 'Agendas connectés', types: 'Tarifs des séances', team: 'Équipe pédagogique' };
function topHTML(v) {
  const sub = S.stack.length > 0;
  let title = TITLES[v.v] || '',
    small = '';
  if (v.v === 'session') {
    const s = SESSIONS.find(x => x.id === v.id);
    title = 'Séance';
    small = fmtDay(s.date) + ' · ' + hm(s.start);
  } else if (v.v === 'student') {
    title = nm(st(v.id));
    small = 'Fiche élève';
  } else if (v.v === 'group') {
    title = GROUPS[v.id].name;
    small = 'Groupe';
  } else if (v.v === 'thread') {
    const t = THREADS.find(x => x.id === v.id),
      s = st(t.s);
    title = t.to === 'parent' ? s.parents[0].name : nm(s);
    small = t.to === 'parent' ? `${s.parents[0].rel} de ${s.first}` : 'Élève';
  } else if (!sub) small = 'TPC Les Tilleuls';
  const pv = pendingVideos();
  return `${sub ? `<button class="ib" data-a="back" aria-label="Retour">${ic('back')}</button>` : '<span class="logo"><img class="lg-w" src="img/ram-blanc.png" alt="/RAM"><img class="lg-n" src="img/ram-noir.webp" alt=""><b>COACH</b></span>'}<h1>${sub || matchMedia('(min-width:960px)').matches ? esc(title) : ''}${small && (sub || matchMedia('(min-width:960px)').matches) ? `<small>${esc(small)}</small>` : ''}</h1><button class="ib" data-a="tab" data-t="videos" aria-label="Vidéos reçues">${ic('video')}${pv ? `<span class="n">${pv}</span>` : ''}</button><button class="ib" data-a="tab" data-t="messages" aria-label="Messages">${ic('chat')}</button><button class="ib" data-a="timer" aria-label="Minuteur">${ic('timer')}</button>`;
}

/* ---------- ligne de séance (planning, aujourd'hui, groupe) ---------- */
function sesRow(s, opts = {}) {
  const G = GROUPS[s.g],
    c = COACHES[s.coach];
  const marked = Object.keys(s.att).length,
    pres = Object.values(s.att).filter(v => v === 'p').length;
  const state = s.cancelled
    ? '<span class="tag hot">Annulée</span>'
    : isNow(s)
      ? '<span class="tag acc">En cours</span>'
      : past(s)
        ? marked
          ? `<span class="tag ok">${pres}/${s.members.length} présents</span>${s.bilan ? '' : ' <span class="tag warn">Bilan à écrire</span>'}`
          : '<span class="tag warn">Appel à faire</span>'
        : s.date === TODAY
          ? `<span class="tag">${plural(s.members.length, 'élève')}</span>`
          : '';
  return `<button class="ses ${isNow(s) ? 'now' : ''} ${s.cancelled ? 'cancel' : ''}" data-a="open" data-v="session" data-id="${s.id}"><span class="when"><b>${hm(s.start)}</b><span>${dur(s.dur)}</span></span><span class="bar" style="background:${c.color}"></span><span class="grow"><span class="t">${esc(gName(s))}</span><span class="theme">${s.theme ? esc(s.theme) : '<span class="muted">Thème à définir</span>'}</span><span class="s">${esc(G.court)}${opts.coach || s.coach !== ME ? ' · ' + coachName(s.coach) : ''}</span><span>${state}</span></span></button>`;
}
function extRow(x) {
  const C = CAL_SOURCES[x.src];
  return `<button class="ses" data-a="ext" data-id="${x.id}"><span class="when"><b>${hm(x.start)}</b><span>${dur(x.dur)}</span></span><span class="bar" style="background:${C.color}"></span><span class="grow"><span class="t">${esc(x.title)}</span><span class="s">${esc(x.where || '')}</span><span><span class="tag info">${ic('link')}${C.name}</span></span></span></button>`;
}

/* ================= écrans ================= */
const V = {};

/* ---------- aujourd'hui ---------- */
V.today = () => {
  const me = COACHES[ME];
  const today = SESSIONS.filter(s => s.date === TODAY && mineS(s));
  const ext = extOn().filter(x => x.date === TODAY);
  const items = [...today.map(s => [s.start, sesRow(s)]), ...ext.map(x => [x.start, extRow(x)])].sort((a, b) => a[0] - b[0]);
  const wk0 = monday(0),
    wk1 = addDays(wk0, 6);
  const wkS = SESSIONS.filter(s => mineS(s) && s.date >= wk0 && s.date <= wk1 && !s.cancelled);
  const m0 = TODAY.slice(0, 7) + '-01';
  const moS = SESSIONS.filter(s => mineS(s) && s.date >= m0 && past(s) && !s.cancelled);
  const att = moS.flatMap(s => Object.values(s.att));
  const noBilan = SESSIONS.filter(s => mineS(s) && past(s) && !s.cancelled && !s.bilan && s.date >= addDays(TODAY, -14));
  const noTheme = SESSIONS.filter(s => mineS(s) && !past(s) && !s.theme && s.date <= addDays(TODAY, 7) && !s.cancelled);
  const noAcc = myStudents().filter(s => s.account === 'manuel');
  const carnets = myStudents().filter(s => s.carnet && s.carnet.total - s.carnet.used <= 2);
  const pv = pendingVideos();
  const todo = [
    pv && ['videos', '', 'hot', 'video', `${plural(pv, 'vidéo')} à regarder`, 'Envoyées par vos élèves depuis /RAM Club, ils attendent votre retour'],
    noBilan.length && ['open', `data-v="session" data-id="${noBilan[noBilan.length - 1].id}"`, 'acc', 'edit', `${plural(noBilan.length, 'bilan')} de séance à écrire`, noBilan.slice(-3).reverse().map(s => GROUPS[s.g].name + ' (' + fmtShort(s.date) + ')').join(', ')],
    noTheme.length && ['open', `data-v="session" data-id="${noTheme[0].id}"`, '', 'flag', `${plural(noTheme.length, 'séance')} sans thème cette semaine`, noTheme.slice(0, 3).map(s => gName(s) + ' (' + fmtShort(s.date) + ')').join(', ')],
    noAcc.length && ['noacc', '', '', 'user', `${plural(noAcc.length, 'élève')} sans compte /RAM Club`, 'Ajoutés à la main : invitez-les à créer leur compte'],
    carnets.length && ['open', `data-v="student" data-id="${carnets[0].id}"`, '', 'cal', `Carnet bientôt fini : ${carnets.map(nm).join(', ')}`, carnets.map(s => `${s.carnet.total - s.carnet.used} séance(s) restante(s)`).join(', ')]
  ].filter(Boolean);
  const tomorrow = addDays(TODAY, 1);
  const tmr = [...SESSIONS.filter(s => s.date === tomorrow && mineS(s)).map(s => [s.start, sesRow(s)]), ...extOn().filter(x => x.date === tomorrow).map(x => [x.start, extRow(x)])].sort((a, b) => a[0] - b[0]);
  return `<div class="hello"><div><p class="kicker">${fmtDay(TODAY)} · ${inVac(TODAY) ? VACANCES[0][2] : 'période scolaire'}</p><h2>Bonjour <em>${me.first}</em></h2></div><div class="btns"><button class="btn sm ghost" data-a="timer">${ic('timer')}Minuteur</button><button class="btn sm pri" data-a="post">${ic('mega')}Annonce</button></div></div>
  <div class="kpis"><div class="kpi"><b>${wkS.length}</b><span>séances cette semaine</span></div><div class="kpi"><b>${dur(moS.reduce((a, s) => a + s.dur, 0))}</b><span>données en ${MOIS[D(TODAY).getMonth()].replace('.', '')}</span></div><div class="kpi"><b>${pct(att.filter(v => v === 'p').length, att.length)} %</b><span>d’assiduité ce mois</span></div><div class="kpi"><b>${euros(moS.reduce((a, s) => a + revenue(s), 0))}</b><span>ce mois</span></div></div>
  <div class="cols"><div style="display:grid;gap:18px">
    <div class="h2"><h2>Aujourd’hui</h2><button class="lk" data-a="tab" data-t="planning">Planning</button></div>
    <div class="card flat">${items.length ? items.map(x => x[1]).join('') : '<p class="empty">Aucune séance aujourd’hui.</p>'}</div>
    <div class="h2"><h2>Demain</h2></div>
    <div class="card flat">${tmr.length ? tmr.map(x => x[1]).join('') : '<p class="empty">Rien de prévu demain.</p>'}</div>
  </div><div style="display:grid;gap:18px;align-content:start">
    <div class="h2"><h2>À traiter</h2></div>
    <div class="card flat">${todo.length ? todo.map(([a, ex, cl, i, t, s]) => `<button class="todo" data-a="${a === 'videos' ? 'tab' : a}" ${a === 'videos' ? 'data-t="videos"' : ex}><span class="ico ${cl}">${ic(i)}</span><span class="grow"><span class="t">${t}</span><span class="s">${esc(s)}</span></span>${ic('next')}</button>`).join('') : '<p class="empty">Tout est à jour.</p>'}</div>
    ${clubNote('Vos groupes, l’appel et les bilans se retrouvent dans la page École de /RAM Club, côté élèves et parents.')}
  </div></div>`;
};

/* ---------- planning ---------- */
V.planning = () => {
  const w0 = monday(S.wk);
  const days = [...Array(7)].map((_, i) => addDays(w0, i));
  const sess = SESSIONS.filter(s => s.date >= w0 && s.date <= days[6] && (!S.mine || mineS(s)));
  const ext = S.mine ? extOn().filter(x => x.date >= w0 && x.date <= days[6]) : [];
  const hours = sess.filter(s => !s.cancelled).reduce((a, s) => a + s.dur, 0) + ext.reduce((a, x) => a + x.dur, 0);
  return `<div class="btns" style="justify-content:space-between"><div class="seg" style="flex:1;max-width:360px"><button class="${S.mine ? 'on' : ''}" data-a="mine" data-v="1">Mes séances</button><button class="${S.mine ? '' : 'on'}" data-a="mine" data-v="0">Toute l’école</button></div><div class="btns"><button class="btn sm ghost" data-a="tab" data-t="agenda">${ic('link')}Agendas</button><button class="btn sm pri" data-a="newSession">${ic('plus')}Séance</button></div></div>
  <div class="wknav"><button class="ib" data-a="wk" data-d="-1" aria-label="Semaine précédente">${ic('back')}</button><b>Semaine du ${fmtShort(w0)} au ${fmtShort(days[6])}<br><span class="muted small" style="font-weight:600">${plural(sess.filter(s => !s.cancelled).length + ext.length, 'séance')} · ${dur(hours)}${inVac(w0) || inVac(days[6]) ? ' · vacances scolaires' : ''}</span></b><button class="ib" data-a="wk" data-d="1" aria-label="Semaine suivante">${ic('next')}</button></div>
  ${S.wk ? `<button class="btn sm ghost" data-a="wk" data-d="0" style="align-self:center">Revenir à cette semaine</button>` : ''}
  <div class="week">${days
    .map(d => {
      const it = [...sess.filter(s => s.date === d).map(s => [s.start, sesRow(s, { coach: !S.mine })]), ...ext.filter(x => x.date === d).map(x => [x.start, extRow(x)])].sort((a, b) => a[0] - b[0]);
      return `<div class="day ${d === TODAY ? 'today' : ''}"><h3>${fmtDay(d).split(' ')[0]} <span>${fmtShort(d)}</span></h3>${it.length ? `<div class="card flat">${it.map(x => x[1]).join('')}</div>` : FERIES.includes(d) ? '<p class="vac">Jour férié</p>' : '<p class="vac">Rien de prévu</p>'}</div>`;
    })
    .join('')}</div>`;
};

/* ---------- séance : thème, appel, bilan ---------- */
V.session = id => {
  const s = SESSIONS.find(x => x.id === id),
    G = GROUPS[s.g];
  const open = s.date <= TODAY && !s.cancelled;
  const cnt = v => Object.values(s.att).filter(x => x === v).length;
  const att = s.members
    .map(k => {
      const e = st(k),
        a = s.att[k],
        po = S.persoOpen[s.id + k] || s.perso[k];
      return `<div class="att">${av(e)}<span class="grow"><button data-a="open" data-v="student" data-id="${k}" style="text-align:left"><span class="t">${esc(nm(e))}</span></button><span class="s">${esc(levelLabel(e))}${e.carnet ? ` · carnet ${e.carnet.used}/${e.carnet.total}` : ''}${e.account === 'manuel' ? ' · sans compte' : ''}</span></span>${
        open
          ? `<span class="pres" role="group" aria-label="Présence de ${esc(e.first)}">${[['p', 'P', 'Présent'], ['e', 'E', 'Excusé'], ['a', 'A', 'Absent']].map(([v, l, t]) => `<button class="${a === v ? 'on' : ''}" data-v="${v}" data-a="mark" data-s="${s.id}" data-k="${k}" aria-pressed="${a === v}" title="${t}">${l}</button>`).join('')}</span>`
          : ''
      }</div>${open && a === 'p' ? (po ? `<div class="perso"><textarea class="in" data-in="perso" data-s="${s.id}" data-k="${k}" placeholder="Commentaire pour ${esc(e.first)} (visible dans son historique)">${esc(s.perso[k] || '')}</textarea></div>` : `<div class="perso"><button class="btn sm ghost" data-a="persoOpen" data-s="${s.id}" data-k="${k}">${ic('edit')}Mot pour ${esc(e.first)}</button></div>`) : ''}`;
    })
    .join('');
  return `<div class="card"><div style="display:flex;gap:8px;flex-wrap:wrap"><span class="tag">${G.sport}</span><span class="tag">${TYPES[G.type].name}</span>${s.cancelled ? '<span class="tag hot">Annulée</span>' : isNow(s) ? '<span class="tag acc">En cours</span>' : ''}</div>
    <h2 style="margin:0;font:400 italic 28px/1.05 var(--f-display);text-transform:uppercase">${esc(gName(s))}</h2>
    <dl class="kv"><dt>Quand</dt><dd>${fmtDay(s.date)}, ${hm(s.start)} à ${hm(s.start + s.dur)}</dd><dt>Où</dt><dd>${esc(G.court)}</dd><dt>Coach</dt><dd>${coachName(s.coach)}</dd>${G.lv ? `<dt>Niveau</dt><dd>${esc(G.lv)}</dd>` : ''}</dl>
    ${s.cancelled ? `<p class="club-note">${ic('stop')}<span>${esc(s.cancelReason || 'Séance annulée')}. Le groupe a été prévenu sur /RAM Club.</span></p>` : ''}
    <label class="field"><span>Thème de la séance</span><input class="in" data-in="theme" data-s="${s.id}" value="${esc(s.theme)}" placeholder="Par exemple : sortie de vitre de fond"></label>
    <div class="btns"><button class="btn sm ghost" data-a="timer">${ic('timer')}Minuteur</button>${!s.cancelled && !past(s) ? `<button class="btn sm ghost" data-a="cancel" data-s="${s.id}">${ic('stop')}Annuler la séance</button>` : ''}<button class="btn sm ghost" data-a="post" data-g="${s.g}">${ic('mega')}Message au groupe</button></div></div>
  <div class="h2"><h2>Appel</h2>${open ? `<button class="lk" data-a="allP" data-s="${s.id}">Tous présents</button>` : ''}</div>
  ${open ? `<div class="sum"><span><i style="background:var(--ok)"></i>${plural(cnt('p'), 'présent')}</span><span><i style="background:var(--warn)"></i>${plural(cnt('e'), 'excusé')}</span><span><i style="background:var(--hot)"></i>${plural(cnt('a'), 'absent')}</span><span class="muted">${s.members.length - Object.keys(s.att).length} à pointer</span></div>` : `<p class="muted small">${s.cancelled ? 'Pas d’appel pour une séance annulée.' : 'L’appel s’ouvre le jour de la séance.'}</p>`}
  <div class="card flat">${att || '<p class="empty">Aucun élève inscrit.</p>'}</div>
  ${open ? `<div class="h2"><h2>Bilan de séance</h2></div><div class="card"><label class="field"><span>Pour tout le groupe</span><textarea class="in" data-in="bilan" data-s="${s.id}" placeholder="Ce qui a été travaillé, ce qui a bien marché, la suite…">${esc(s.bilan)}</textarea></label>${clubNote('Le bilan et les mots personnels apparaissent dans l’historique de chaque élève sur /RAM Club (page École). La note privée de la fiche, elle, reste entre coachs.')}<button class="btn pri" data-a="saveBilan" data-s="${s.id}">${ic('send')}Publier le bilan</button></div>` : ''}`;
};

/* ---------- élèves ---------- */
V.students = () => {
  const base = S.mine ? myStudents() : Object.values(STUDENTS);
  const q = S.q.trim().toLowerCase();
  const l = base
    .filter(s => (S.fg === 'all' || s.groups.includes(S.fg)) && (!S.noacc || s.account === 'manuel') && (!q || nm(s).toLowerCase().includes(q)))
    .sort((a, b) => a.last.localeCompare(b.last));
  const groups = Object.values(GROUPS).filter(g => !g.indiv && (!S.mine || g.coach === ME));
  return `<div class="btns" style="justify-content:space-between"><div class="seg" style="flex:1;max-width:360px"><button class="${S.mine ? 'on' : ''}" data-a="mine" data-v="1">Mes élèves</button><button class="${S.mine ? '' : 'on'}" data-a="mine" data-v="0">Toute l’école</button></div><button class="btn sm pri" data-a="newStudent">${ic('plus')}Élève</button></div>
  <div class="f2"><label class="search">${ic('search')}<input type="search" data-in="q" value="${esc(S.q)}" placeholder="Chercher un élève" aria-label="Chercher un élève"></label><select class="in" data-in="fg" aria-label="Groupe"><option value="all">Tous les groupes</option>${groups.map(g => `<option value="${g.id}" ${S.fg === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
  <div class="btns"><button class="btn sm ${S.noacc ? 'pri' : 'ghost'}" data-a="noaccT">${ic('user')}Sans compte /RAM Club</button><span class="muted small" style="align-self:center">${plural(l.length, 'élève')}</span></div>
  <div class="card flat" id="slist">${l.map(stRow).join('') || '<p class="empty">Aucun élève.</p>'}</div>`;
};
function stRow(s) {
  const a = assid(s.id);
  return `<button class="row" data-a="open" data-v="student" data-id="${s.id}">${av(s)}<span class="grow"><span class="t">${esc(nm(s))}${isKid(s) ? ` <span class="muted small">${age(s)} ans</span>` : ''}</span><span class="s">${esc(levelLabel(s))} · ${s.groups.map(g => (GROUPS[g].indiv ? 'Individuel' : GROUPS[g].name)).join(', ')}</span></span>${s.account === 'manuel' ? '<span class="tag warn">Sans compte</span>' : ''}${a.n ? `<span class="tag ${a.rate >= 80 ? 'ok' : a.rate >= 60 ? 'warn' : 'hot'}">${a.rate} %</span>` : ''}${ic('next')}</button>`;
}

V.student = id => {
  const s = st(id),
    tab = S.stTab[id] || 'fiche';
  const a = assid(id);
  const tabs = [['fiche', 'Fiche'], ['hist', 'Historique'], ['prog', 'Progression'], ['vid', 'Vidéos']];
  let body = '';
  if (tab === 'fiche') {
    const contacts = [s.mail && !isKid(s) ? [nm(s), s.mail, s.phone] : null, ...s.parents.map(p => [`${p.name} (${p.rel.toLowerCase()})`, p.mail, p.phone])].filter(Boolean);
    body = `<div class="cols"><div style="display:grid;gap:14px">
      <div class="card"><dl class="kv"><dt>Âge</dt><dd>${age(s)} ans</dd><dt>Sport</dt><dd>${s.sport}</dd><dt>Niveau</dt><dd>${esc(levelLabel(s))}</dd><dt>Main</dt><dd>${s.hand}</dd>${s.side ? `<dt>Poste</dt><dd>${s.side === 'Les deux' ? 'Droite et gauche' : 'Côté ' + s.side.toLowerCase()}</dd>` : ''}<dt>Groupes</dt><dd>${s.groups.map(g => (GROUPS[g].indiv ? 'Cours individuel' : `<button data-a="open" data-v="group" data-id="${g}" style="text-decoration:underline">${esc(GROUPS[g].name)}</button>`)).join(', ')}</dd>${s.carnet ? `<dt>Carnet</dt><dd>${s.carnet.used} séances sur ${s.carnet.total} · <b>${s.carnet.total - s.carnet.used} restantes</b></dd>` : ''}<dt>Assiduité</dt><dd>${a.n ? `${a.rate} % (${a.p} présences sur ${a.n} séances)` : 'Pas encore de séance'}</dd></dl></div>
      <label class="card field"><span>Objectifs</span><textarea class="in" data-in="goals" data-k="${id}">${esc(s.goals)}</textarea></label>
      <div class="card"><div class="private"><span class="kicker">${ic('lock')}Note privée · visible par les coachs seulement</span><textarea class="in" data-in="note" data-k="${id}" placeholder="Blessure, caractère, ce qu’il faut savoir…">${esc(s.note)}</textarea></div></div>
    </div><div style="display:grid;gap:14px;align-content:start">
      ${s.account === 'manuel' ? `<div class="card"><span class="tag warn" style="align-self:start">Pas encore de compte /RAM Club</span><p class="small">${esc(s.first)} a été ajouté${isKid(s) ? '' : '(e)'} à la main. En créant son compte, ${isKid(s) ? 'sa famille' : 'il ou elle'} retrouvera ses groupes, son historique et sa progression : rien à ressaisir.</p><button class="btn pri" data-a="invite" data-k="${id}">${ic('mail')}Inviter sur /RAM Club</button></div>` : `<p class="club-note">${ic('check')}<span>Adhérent /RAM Club : ${isKid(s) ? 'l’élève et ses parents voient' : 'voit'} le planning, l’historique et la progression dans la page École.</span></p>`}
      <div class="card"><span class="kicker">Contacts</span>${contacts.map(c => `<div style="display:grid;gap:2px"><b>${esc(c[0])}</b><span class="small muted">${esc(c[1] || '')}${c[2] ? ' · ' + esc(c[2]) : ''}</span></div>`).join('')}<div class="btns"><button class="btn sm pri" data-a="dm" data-k="${id}" data-to="${isKid(s) ? 'parent' : 'eleve'}">${ic('chat')}Message ${isKid(s) ? 'aux parents' : 'direct'}</button>${isKid(s) ? `<button class="btn sm ghost" data-a="dm" data-k="${id}" data-to="eleve">${ic('chat')}À ${esc(s.first)}</button>` : ''}</div></div>
      <div class="card"><span class="kicker">Tournois et animations</span><p class="small muted">Inscrire ${esc(s.first)} à un tournoi ou une animation /RAM JA : les résultats remontent dans sa progression.</p><button class="btn sm ghost" data-a="ja" data-k="${id}">${ic('trophy')}Inscrire à une compétition</button></div>
    </div></div>`;
  } else if (tab === 'hist') {
    const l = sessOfStudent(id)
      .filter(x => past(x))
      .reverse();
    body = `${clubNote(`Cet historique est celui que ${isKid(s) ? s.first + ' et ses parents voient' : s.first + ' voit'} dans /RAM Club : séances, présence et vos bilans.`)}
    ${s.ja.length ? `<div class="h2"><h2>Compétitions /RAM JA</h2></div><div class="card flat">${s.ja.map(j => `<div class="row"><span class="ico" style="width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--accent);color:var(--on-accent)">${ic('trophy')}</span><span class="grow"><span class="t">${esc(j.event)}</span><span class="s">${fmtDay(j.date)}</span></span><span class="tag acc">${esc(j.res)}</span></div>`).join('')}</div>` : ''}
    <div class="h2"><h2>Séances</h2><span class="muted small">${plural(l.length, 'séance')}</span></div>
    <div class="card flat hist">${l
      .map(x => {
        const v = x.cancelled ? ['hot', 'Annulée'] : { p: ['ok', 'Présent'], e: ['warn', 'Excusé'], a: ['hot', 'Absent'] }[x.att[id]] || ['', 'Non pointé'];
        return `<div class="it"><span class="d">${fmtShort(x.date)}<small>${hm(x.start)}</small></span><span class="b"><span style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><b>${esc(x.theme || gName(x))}</b><span class="tag ${v[0]}">${v[1]}</span></span><span class="small muted">${esc(gName(x))} · ${coachName(x.coach)}</span>${x.bilan ? `<p class="bilan"><span class="kicker">Bilan du groupe</span>${esc(x.bilan)}</p>` : ''}${x.perso[id] ? `<p class="bilan me"><span class="kicker">Pour ${esc(s.first)}</span>${esc(x.perso[id])}</p>` : ''}${!x.bilan && !x.cancelled ? `<button class="btn sm ghost" data-a="open" data-v="session" data-id="${x.id}" style="justify-self:start">${ic('edit')}Écrire le bilan</button>` : ''}</span></div>`;
      })
      .join('') || '<p class="empty">Pas encore de séance.</p>'}</div>`;
  } else if (tab === 'prog') body = progHTML(s);
  else {
    const l = VIDEOS.filter(v => v.s === id);
    body = `${clubNote(`${s.first} envoie ses vidéos depuis la page École de /RAM Club. Votre retour lui arrive au même endroit.`)}<div class="grid">${l.map(vidCard).join('') || '<p class="empty">Aucune vidéo reçue.</p>'}</div>`;
  }
  return `<div class="hero">${av(s, 'lg')}<div class="grow"><h2>${esc(nm(s))}</h2><div class="btns"><span class="tag">${s.sport}</span><span class="tag acc">${esc(levelLabel(s))}</span>${s.account === 'manuel' ? '<span class="tag warn">Sans compte /RAM Club</span>' : '<span class="tag info">Adhérent /RAM Club</span>'}</div></div></div>
  <div class="seg" role="tablist">${tabs.map(([k, l]) => `<button role="tab" class="${tab === k ? 'on' : ''}" aria-selected="${tab === k}" data-a="stTab" data-k="${id}" data-t="${k}">${l}</button>`).join('')}</div>${body}`;
};

/* progression : échelle de niveau (prérequis, attendus) et grille technique */
function progHTML(s) {
  const coups = TECH[s.sport];
  const cur = c => s.tech[c][s.tech[c].length - 1][1],
    first = c => s.tech[c][0][1];
  const acq = coups.filter(c => cur(c) >= 3).length,
    ups = coups.reduce((a, c) => a + (cur(c) - first(c)), 0);
  let scale = '';
  if (s.level) {
    const L = SCALES[s.sport].levels,
      now = L.find(l => l.n === s.level),
      nx = L.find(l => l.n === s.level + 1);
    const ck = (S.checks[s.id] = S.checks[s.id] || {});
    const done = nx ? nx.att.filter((_, i) => ck[nx.n + '|' + i]).length : 0;
    scale = `<div class="h2"><h2>Échelle de niveau</h2><button class="lk" data-a="levels" data-sp="${s.sport}">Voir toute l’échelle</button></div>
    <div class="scale"><div class="lvl cur"><span class="num">${s.sport === 'Padel' ? now.n : now.t[0]}</span><div><h3>${esc(now.t)} <span class="tag acc">Niveau actuel</span></h3><p class="cnt">${s.levelHist.length > 1 ? `Validé le ${fmtShort(s.levelHist[s.levelHist.length - 1][0])}` : 'Depuis le début de saison'}</p></div></div>
    ${
      nx
        ? `<div class="lvl next"><span class="num">${s.sport === 'Padel' ? nx.n : nx.t[0]}</span><div><h3>${esc(nx.t)} <span class="tag">Objectif</span></h3><div class="pa"><div><span class="kicker">Prérequis</span><ul>${nx.pre.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div><div><span class="kicker">Attendus · ${done}/${nx.att.length}</span><ul class="chk">${nx.att.map((t, i) => `<li><button class="${ck[nx.n + '|' + i] ? 'on' : ''}" data-a="chk" data-k="${s.id}" data-c="${nx.n}|${i}" aria-pressed="${!!ck[nx.n + '|' + i]}" aria-label="${esc(t)}">${ic('check')}</button>${esc(t)}</li>`).join('')}</ul></div></div><div class="btns" style="margin-top:10px"><button class="btn sm ${done === nx.att.length ? 'pri' : 'ghost'}" data-a="levelUp" data-k="${s.id}">${ic('up')}Valider le passage en ${esc(nx.t)}</button></div></div></div>`
        : '<p class="muted small">Dernier niveau de l’échelle atteint.</p>'
    }</div>`;
  } else scale = `<div class="card"><span class="kicker">Classement FFT</span><b style="font:400 30px var(--f-display)">${esc(s.rank)}</b><p class="small muted">Le classement est repris de la FFT ; la grille technique suit la progression.</p></div>`;
  return `${scale}
  <div class="h2"><h2>Grille technique</h2><span class="muted small">${acq}/${coups.length} acquis · ${ups > 0 ? '+' + ups : ups} depuis sept.</span></div>
  <p class="legend">${STEPS.slice(1)
    .map((t, i) => `<span><b>${i + 1}</b> ${t}</span>`)
    .join('')}<span>Contour : niveau de septembre</span></p>
  <div class="card flat tech">${coups
    .map(c => {
      const h = s.tech[c],
        v = cur(c),
        f = first(c);
      return `<div class="l"><span class="nm">${esc(c)}<small>${STEPS[v]}${h.length > 1 ? ` · évalué le ${fmtShort(h[h.length - 1][0])}` : ''}</small></span><span class="steps" role="group" aria-label="${esc(c)}">${[1, 2, 3, 4].map(n => `<button class="${n === v ? 'on' : ''} ${n === f && f !== v ? 'was' : ''}" data-a="tech" data-k="${s.id}" data-c="${esc(c)}" data-n="${n}" aria-pressed="${n === v}" title="${STEPS[n]}">${n}</button>`).join('')}</span></div>`;
    })
    .join('')}</div>
  ${s.levelHist.length > 1 ? `<div class="card"><span class="kicker">Évolution du niveau</span>${s.levelHist.map(([d, n]) => `<div class="small">${fmtDay(d)} : ${esc(s.sport === 'Padel' ? 'niveau ' + n : 'Galaxie ' + SCALES.Tennis.levels[n - 1].t)}</div>`).join('')}</div>` : ''}`;
}

/* ---------- vidéos ---------- */
function vidCard(v) {
  const s = st(v.s);
  return `<div class="card vid"><div style="display:flex;gap:10px;align-items:center">${av(s, 'sm')}<span style="flex:1;min-width:0"><b>${esc(nm(s))}</b><br><span class="small muted">${fmtDay(v.date)}</span></span>${v.reply ? '<span class="tag ok">Répondu</span>' : '<span class="tag hot">À regarder</span>'}</div>
  <button class="thumb" data-a="play" aria-label="Lire la vidéo ${esc(v.title)}" style="background:linear-gradient(160deg,hsl(${v.tint} 45% 32%),hsl(${v.tint + 40} 40% 14%))"><svg class="court" viewBox="0 0 160 90" preserveAspectRatio="none" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1"><path d="M30 85L55 15h50l25 70zM42.5 50h75M80 15v70"/></svg><span class="play">${ic('play')}</span><span class="len">${v.len}</span></button>
  <b>${esc(v.title)}</b><p class="quote">${esc(v.msg)}</p>
  ${v.reply ? `<p class="reply"><span class="kicker" style="display:block">Votre retour · ${fmtShort(v.replyAt)}</span>${esc(v.reply)}</p>` : `<textarea class="in" data-in="vreply" data-id="${v.id}" placeholder="Votre retour pour ${esc(s.first)}…"></textarea><button class="btn pri" data-a="vsend" data-id="${v.id}">${ic('send')}Envoyer le retour</button>`}</div>`;
}
V.videos = () => {
  const l = VIDEOS.filter(v => (S.vidF === 'todo' ? !v.reply : true));
  return `<div class="seg" style="max-width:360px"><button class="${S.vidF === 'todo' ? 'on' : ''}" data-a="vidF" data-v="todo">À regarder (${VIDEOS.filter(v => !v.reply).length})</button><button class="${S.vidF === 'all' ? 'on' : ''}" data-a="vidF" data-v="all">Toutes</button></div>${clubNote('Vos élèves envoient leurs vidéos depuis la page École de /RAM Club pour demander un retour. Votre réponse leur arrive au même endroit.')}<div class="grid">${l.map(vidCard).join('') || '<p class="empty">Aucune vidéo en attente.</p>'}</div>`;
};

/* ---------- messages directs ---------- */
V.messages = () =>
  `${clubNote('Vous êtes le seul à pouvoir écrire en premier. L’élève ou ses parents répondent depuis /RAM Club.')}<div class="btns"><button class="btn pri" data-a="newDm">${ic('plus')}Nouveau message</button></div><div class="card flat">${
    THREADS.map(t => {
      const s = st(t.s),
        last = t.msgs[t.msgs.length - 1];
      return `<button class="row" data-a="open" data-v="thread" data-id="${t.id}">${av(s)}<span class="grow"><span class="t">${esc(t.to === 'parent' ? s.parents[0].name + ' · ' + s.parents[0].rel.toLowerCase() + ' de ' + s.first : nm(s))}</span><span class="s">${last.me ? 'Vous : ' : ''}${esc(last.x)}</span></span>${ic('next')}</button>`;
    }).join('') || '<p class="empty">Aucun message.</p>'
  }</div>`;
V.thread = id => {
  const t = THREADS.find(x => x.id === id);
  return `<div class="card"><div class="thread">${t.msgs.map(m => `<p class="bub ${m.me ? 'me' : ''}">${esc(m.x)}<time>${fmtShort(m.at.slice(0, 10))} · ${m.at.slice(11)}</time></p>`).join('')}</div><textarea class="in" data-in="dmText" placeholder="Votre message"></textarea><button class="btn pri" data-a="dmSend" data-id="${id}">${ic('send')}Envoyer</button></div>`;
};

/* ---------- école : groupes, équipe pédagogique, publications ---------- */
V.school = () => {
  const t = S.schoolTab;
  let body = '';
  if (t === 'groupes') {
    const gs = Object.values(GROUPS).filter(g => !g.indiv && (!S.mine || g.coach === ME));
    body = `<div class="btns" style="justify-content:space-between"><div class="seg" style="flex:1;max-width:360px"><button class="${S.mine ? 'on' : ''}" data-a="mine" data-v="1">Mes groupes</button><button class="${S.mine ? '' : 'on'}" data-a="mine" data-v="0">Toute l’école</button></div><button class="btn sm pri" data-a="newGroup">${ic('plus')}Groupe</button></div>
    ${['Padel', 'Tennis']
      .map(sp => {
        const l = gs.filter(g => g.sport === sp);
        return l.length ? `<div class="h2"><h2>École de ${sp.toLowerCase()}</h2></div><div class="grid">${l.map(groupCard).join('')}</div>` : '';
      })
      .join('')}`;
  } else if (t === 'equipe') body = teamHTML();
  else
    body = `<div class="btns"><button class="btn pri" data-a="post">${ic('plus')}Publier</button></div>${clubNote('Annonces et contenus s’affichent dans la page École de /RAM Club, pour les élèves du groupe et leurs parents.')}<div class="card flat">${POSTS.slice()
      .reverse()
      .map(p => `<div class="row"><span class="ico" style="width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--card2)">${ic(p.kind === 'annule' ? 'stop' : p.kind === 'contenu' ? 'news' : 'mega')}</span><span class="grow"><span class="t" style="white-space:normal">${esc(p.x)}</span><span class="s">${{ annonce: 'Annonce', contenu: 'Contenu', annule: 'Cours annulé' }[p.kind]} · ${esc(GROUPS[p.g].name)} · ${fmtShort(p.date)}${p.link ? ' · ' + esc(p.link) : ''}</span></span></div>`)
      .join('')}</div>`;
  return `<div class="seg" role="tablist">${[['groupes', 'Groupes'], ['equipe', 'Équipe pédagogique'], ['pubs', 'Publications']].map(([k, l]) => `<button role="tab" class="${t === k ? 'on' : ''}" aria-selected="${t === k}" data-a="schoolTab" data-t="${k}">${l}</button>`).join('')}</div>${body}`;
};
function groupCard(g) {
  const n = studentsOf(g.id).length,
    c = COACHES[g.coach];
  const next = SESSIONS.find(s => s.g === g.id && !past(s) && !s.cancelled);
  return `<button class="card" data-a="open" data-v="group" data-id="${g.id}" style="text-align:left"><div style="display:flex;gap:8px;align-items:center;justify-content:space-between"><b style="font:400 italic 20px/1.1 var(--f-display);text-transform:uppercase">${esc(g.name)}</b>${cav(c)}</div>
  <span class="small muted">${g.stage ? `Du ${fmtShort(g.stage[0])} au ${fmtShort(g.stage[1])}` : `Le ${JOURS[g.day]}`}, ${hm(g.start)} · ${dur(g.dur)} · ${esc(g.court)}</span>
  <div style="display:grid;gap:4px"><span class="small">${n}/${g.cap} élèves · niveau ${esc(g.lv)}</span><span class="meter"><i style="width:${pct(n, g.cap)}%"></i></span></div>
  <div class="btns">${g.chat ? '<span class="tag info">Discussion /RAM Club</span>' : ''}${g.kids ? '<span class="tag">Jeunes</span>' : ''}${next ? `<span class="tag">Prochaine : ${fmtShort(next.date)}</span>` : ''}</div></button>`;
}
function teamHTML() {
  const w0 = monday(0),
    w1 = addDays(w0, 6);
  return `${clubNote('Vous êtes responsable pédagogique : vous répartissez les groupes entre les coachs. Chaque coach a son propre espace /RAM Coach.')}<div class="grid">${Object.values(COACHES)
    .map(c => {
      const gs = Object.values(GROUPS).filter(g => g.coach === c.id && !g.indiv);
      const h = SESSIONS.filter(s => s.coach === c.id && s.date >= w0 && s.date <= w1 && !s.cancelled).reduce((a, s) => a + s.dur, 0);
      return `<div class="card"><div style="display:flex;gap:12px;align-items:center">${cav(c, '')}<span style="flex:1"><b>${c.first} ${c.last}</b><br><span class="small muted">${c.role} · ${c.dip}</span></span></div><span class="small">${c.sports.join(' et ')} · ${dur(h)} cette semaine</span><div class="card flat" style="background:var(--bg)">${gs.map(g => `<button class="row" data-a="open" data-v="group" data-id="${g.id}"><span class="grow"><span class="t">${esc(g.name)}</span><span class="s">${g.stage ? 'Stage' : JOURS[g.day]} ${hm(g.start)} · ${studentsOf(g.id).length} élèves</span></span>${ic('next')}</button>`).join('') || '<p class="empty">Aucun groupe</p>'}</div></div>`;
    })
    .join('')}</div>`;
}
V.team = () => teamHTML();

V.group = id => {
  const g = GROUPS[id],
    ss = studentsOf(id);
  const next = SESSIONS.filter(s => s.g === id && !past(s)).slice(0, 6);
  const done = SESSIONS.filter(s => s.g === id && past(s) && !s.cancelled);
  const att = done.flatMap(s => Object.values(s.att));
  const others = Object.values(STUDENTS)
    .filter(s => s.sport === g.sport && !s.groups.includes(id))
    .sort((a, b) => a.last.localeCompare(b.last));
  return `<div class="card"><div class="btns"><span class="tag">${g.sport}</span><span class="tag">${TYPES[g.type].name}</span>${g.kids ? '<span class="tag">Jeunes</span>' : ''}</div>
  <dl class="kv"><dt>Créneau</dt><dd>${g.stage ? `Du ${fmtDay(g.stage[0])} au ${fmtDay(g.stage[1])}` : `Chaque ${JOURS[g.day]}`}, ${hm(g.start)} à ${hm(g.start + g.dur)}</dd><dt>Lieu</dt><dd>${esc(g.court)}</dd><dt>Niveau</dt><dd>${esc(g.lv)}</dd><dt>Effectif</dt><dd>${ss.length}/${g.cap}</dd><dt>Assiduité</dt><dd>${att.length ? pct(att.filter(v => v === 'p').length, att.length) + ' %' : '—'}</dd>
  <dt>Coach</dt><dd><select class="in" data-in="gcoach" data-g="${id}" aria-label="Coach du groupe" style="min-height:40px;padding:6px 10px;max-width:260px">${Object.values(COACHES).map(c => `<option value="${c.id}" ${g.coach === c.id ? 'selected' : ''}>${c.first} ${c.last}</option>`).join('')}</select></dd></dl>
  <label style="display:flex;gap:10px;align-items:center;min-height:44px"><input type="checkbox" data-in="gchat" data-g="${id}" ${g.chat ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--accent)"><span><b>Groupe de discussion sur /RAM Club</b><br><span class="small muted">Les élèves${g.kids ? ', leurs parents' : ''} et le coach échangent dans l’onglet Groupes de /RAM Club.</span></span></label>
  <div class="btns"><button class="btn sm pri" data-a="post" data-g="${id}">${ic('mega')}Annonce</button><button class="btn sm ghost" data-a="post" data-g="${id}" data-k="contenu">${ic('news')}Contenu</button>${next[0] && !next[0].cancelled ? `<button class="btn sm ghost" data-a="cancel" data-s="${next[0].id}">${ic('stop')}Annuler le ${fmtShort(next[0].date)}</button>` : ''}</div></div>
  <div class="cols"><div style="display:grid;gap:14px">
  <div class="h2"><h2>Prochaines séances</h2><span class="muted small">Thèmes définis à l’avance</span></div>
  <div class="card flat">${next.map(s => `<div class="row"><span style="width:76px;flex:none"><b>${fmtShort(s.date)}</b><br><span class="small muted">${hm(s.start)}</span></span><span class="grow">${s.cancelled ? '<span class="tag hot">Annulée</span>' : `<input class="in" data-in="theme" data-s="${s.id}" value="${esc(s.theme)}" placeholder="Thème à définir" aria-label="Thème du ${fmtShort(s.date)}" style="min-height:40px;padding:6px 10px">`}</span><button class="ib" data-a="open" data-v="session" data-id="${s.id}" aria-label="Ouvrir la séance">${ic('next')}</button></div>`).join('') || '<p class="empty">Aucune séance à venir.</p>'}</div>
  <div class="h2"><h2>Dernières séances</h2></div>
  <div class="card flat">${done
    .slice(-4)
    .reverse()
    .map(s => sesRow(s))
    .join('') || '<p class="empty">Pas encore de séance.</p>'}</div>
  </div><div style="display:grid;gap:14px;align-content:start">
  <div class="h2"><h2>Élèves</h2><span class="muted small">${ss.length}/${g.cap}</span></div>
  <div class="card flat">${ss.map(stRow).join('') || '<p class="empty">Aucun élève.</p>'}</div>
  ${ss.length < g.cap ? `<div class="f2"><select class="in" id="addSel" aria-label="Élève à ajouter"><option value="">Ajouter un élève du club…</option>${others.map(s => `<option value="${s.id}">${esc(nm(s))} · ${esc(levelLabel(s))}</option>`).join('')}</select><button class="btn ghost" data-a="addToGroup" data-g="${id}">${ic('plus')}Ajouter</button></div>` : ''}
  </div></div>`;
};

/* ---------- échelle de niveaux ---------- */
V.levels = () => {
  const sc = SCALES[S.lvSport];
  return `<div class="seg" style="max-width:360px">${Object.keys(SCALES)
    .map(k => `<button class="${S.lvSport === k ? 'on' : ''}" data-a="lvSport" data-v="${k}">${k}</button>`)
    .join('')}</div><p class="muted">${esc(sc.name)}. Les prérequis permettent d’entrer dans un niveau, les attendus de le valider. L’élève voit son niveau et ce qu’il lui reste à acquérir dans /RAM Club.</p>
  <div class="scale">${sc.levels
    .map(l => {
      const n = Object.values(STUDENTS).filter(s => s.sport === S.lvSport && s.level === l.n).length;
      return `<div class="lvl"><span class="num">${S.lvSport === 'Padel' ? l.n : l.t[0]}</span><div><h3>${esc(l.t)} <span class="tag">${plural(n, 'élève')}</span></h3><div class="pa"><div><span class="kicker">Prérequis</span><ul>${l.pre.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div><div><span class="kicker">Attendus</span><ul>${l.att.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div></div></div></div>`;
    })
    .join('')}</div>`;
};

/* ---------- statistiques ---------- */
function period() {
  if (S.statP === 'semaine') return [monday(0), addDays(monday(0), 6), [monday(-1), addDays(monday(-1), 6)], 'la semaine dernière'];
  if (S.statP === 'mois') return ['2026-10-01', '2026-10-31', ['2026-09-01', '2026-09-30'], 'septembre'];
  return [SEASON0, SEASON1, null, ''];
}
function figures(a, b, scope) {
  const l = SESSIONS.filter(s => s.date >= a && s.date <= b && past(s) && !s.cancelled && (scope === 'ecole' || mineS(s)));
  const att = l.flatMap(s => Object.values(s.att));
  const grp = l.filter(s => !GROUPS[s.g].indiv);
  return {
    l,
    n: l.length,
    h: l.reduce((x, s) => x + s.dur, 0) / 60,
    ca: l.reduce((x, s) => x + revenue(s), 0),
    ass: pct(att.filter(v => v === 'p').length, att.length),
    fill: grp.length ? Math.round(grp.reduce((x, s) => x + s.members.length / GROUPS[s.g].cap, 0) / grp.length * 100) : 0
  };
}
V.stats = () => {
  const [a, b, prev, pl] = period(),
    sc = S.statScope;
  const F = figures(a, b, sc),
    P = prev && figures(prev[0], prev[1], sc);
  const delta = (x, y, u = '') => (P ? `<i class="${x < y ? 'down' : ''}">${x >= y ? '+' : ''}${Math.round(x - y)}${u} vs ${pl}</i>` : '');
  // heures par semaine sur la saison
  const weeks = [];
  for (let w = SEASON0; w <= SEASON1; w = addDays(w, 7)) {
    const e = addDays(w, 6),
      l = SESSIONS.filter(s => s.date >= w && s.date <= e && !s.cancelled && (sc === 'ecole' || mineS(s)));
    weeks.push([w, l.reduce((x, s) => x + s.dur, 0) / 60, w > TODAY]);
  }
  const max = Math.max(...weeks.map(w => w[1]), 1),
    W = 600,
    H = 170,
    bw = W / weeks.length;
  const chart = `<svg class="chart" viewBox="0 0 ${W} ${H + 20}" role="img" aria-label="Heures par semaine sur la saison">${[0.5, 1].map(f => `<line class="gl" x1="0" x2="${W}" y1="${H - f * (H - 14)}" y2="${H - f * (H - 14)}"/><text x="0" y="${H - f * (H - 14) - 3}">${Math.round(max * f)} h</text>`).join('')}${weeks.map(([w, h, fut], i) => `<rect class="b ${fut ? 'fut' : ''}" x="${i * bw + 3}" y="${H - (h / max) * (H - 14)}" width="${bw - 6}" height="${(h / max) * (H - 14)}" rx="3"><title>Semaine du ${fmtShort(w)} : ${Math.round(h * 10) / 10} h${fut ? ' prévues' : ''}</title></rect>${i % 2 ? '' : `<text x="${i * bw + bw / 2}" y="${H + 15}" text-anchor="middle">${fmtShort(w)}</text>`}`).join('')}</svg>`;
  // par type de séance
  const byT = Object.entries(TYPES)
    .map(([k, T]) => {
      const l = F.l.filter(s => GROUPS[s.g].type === k);
      return [T, l.length, l.reduce((x, s) => x + s.dur, 0) / 60, l.reduce((x, s) => x + revenue(s), 0)];
    })
    .filter(x => x[1]);
  // par groupe
  const byG = Object.values(GROUPS)
    .filter(g => !g.indiv && (sc === 'ecole' || g.coach === ME))
    .map(g => {
      const l = SESSIONS.filter(s => s.g === g.id && past(s) && !s.cancelled);
      const at = l.flatMap(s => Object.values(s.att));
      return [g, studentsOf(g.id).length, pct(at.filter(v => v === 'p').length, at.length)];
    });
  // progression des élèves
  const st0 = sc === 'ecole' ? Object.values(STUDENTS) : myStudents();
  const lvUp = st0.filter(s => s.levelHist.length > 1);
  const techUp = st0.reduce((x, s) => x + Object.values(s.tech).filter(h => h[h.length - 1][1] > h[0][1]).length, 0);
  return `<div class="btns" style="justify-content:space-between"><div class="seg" style="flex:1;max-width:420px">${[['semaine', 'Semaine'], ['mois', 'Octobre'], ['saison', 'Saison']].map(([k, l]) => `<button class="${S.statP === k ? 'on' : ''}" data-a="statP" data-v="${k}">${l}</button>`).join('')}</div><div class="seg" style="max-width:260px"><button class="${sc === 'moi' ? 'on' : ''}" data-a="statScope" data-v="moi">Moi</button><button class="${sc === 'ecole' ? 'on' : ''}" data-a="statScope" data-v="ecole">L’école</button></div></div>
  <div class="kpis"><div class="kpi"><b>${Math.round(F.h * 10) / 10} h</b><span>données · ${plural(F.n, 'séance')}</span>${delta(F.h, P && P.h, ' h')}</div><div class="kpi"><b>${euros(F.ca)}</b><span>chiffre d’affaires</span>${P ? `<i class="${F.ca < P.ca ? 'down' : ''}">${F.ca >= P.ca ? '+' : ''}${euros(F.ca - P.ca)} vs ${pl}</i>` : ''}</div><div class="kpi"><b>${F.fill} %</b><span>remplissage des groupes</span></div><div class="kpi"><b>${F.ass} %</b><span>assiduité</span>${delta(F.ass, P && P.ass, ' pts')}</div></div>
  <div class="card"><div class="h2" style="margin:0"><h2>Heures par semaine</h2><span class="muted small">En gris : prévu</span></div><div class="scroll-x">${chart}</div></div>
  <div class="cols"><div class="card"><div class="h2" style="margin:0"><h2>Par type de séance</h2><button class="lk" data-a="tab" data-t="types">Tarifs</button></div><div class="scroll-x"><table class="tbl"><thead><tr><th>Type</th><th class="r">Séances</th><th class="r">Heures</th><th class="r">CA</th></tr></thead><tbody>${byT.map(([T, n, h, ca]) => `<tr><td>${esc(T.name)}<br><span class="small muted">${T.prix} € ${MODES[T.mode]}</span></td><td class="r">${n}</td><td class="r">${Math.round(h * 10) / 10}</td><td class="r">${euros(ca)}</td></tr>`).join('')}<tr><td><b>Total</b></td><td class="r"><b>${F.n}</b></td><td class="r"><b>${Math.round(F.h * 10) / 10}</b></td><td class="r"><b>${euros(F.ca)}</b></td></tr></tbody></table></div><p class="small muted">Les rendez-vous importés d’un agenda en ligne comptent dans le planning ; associez-les à un type de séance pour les compter ici (à venir).</p></div>
  <div class="card"><div class="h2" style="margin:0"><h2>Groupes</h2><span class="muted small">Saison</span></div>${byG.map(([g, n, as]) => `<div style="display:grid;gap:4px"><div style="display:flex;justify-content:space-between;gap:8px"><button data-a="open" data-v="group" data-id="${g.id}" style="font-weight:600;text-align:left">${esc(g.name)}</button><span class="small muted">${n}/${g.cap} · ${as} % présents</span></div><span class="meter"><i style="width:${pct(n, g.cap)}%"></i></span></div>`).join('')}</div></div>
  <div class="card"><div class="h2" style="margin:0"><h2>Progression des élèves</h2><span class="muted small">Depuis septembre</span></div><div class="kpis"><div class="kpi"><b>${lvUp.length}</b><span>passages de niveau</span></div><div class="kpi"><b>${techUp}</b><span>compétences en progrès</span></div><div class="kpi"><b>${st0.filter(s => s.ja.length).length}</b><span>élèves en compétition</span></div><div class="kpi"><b>${st0.length}</b><span>élèves suivis</span></div></div>${lvUp.length ? `<div class="card flat" style="background:var(--bg)">${lvUp.slice(0, 6).map(s => `<button class="row" data-a="open" data-v="student" data-id="${s.id}">${av(s, 'sm')}<span class="grow"><span class="t">${esc(nm(s))}</span><span class="s">${esc(levelLabel(s))} · validé le ${fmtShort(s.levelHist[s.levelHist.length - 1][0])}</span></span><span class="tag ok">${ic('up')}+1</span></button>`).join('')}</div>` : ''}</div>`;
};

/* ---------- tarifs ---------- */
V.types = () =>
  `<p class="muted">Ce que rapporte chaque type de séance : le chiffre d’affaires des statistiques est calculé à partir de ces tarifs.</p><div class="card flat">${Object.entries(TYPES)
    .map(([k, T]) => `<div class="row" style="flex-wrap:wrap"><span class="grow" style="min-width:160px"><span class="t">${esc(T.name)}</span></span><input class="in" type="number" min="0" step="1" data-in="prix" data-k="${k}" value="${T.prix}" aria-label="Tarif ${esc(T.name)}" style="width:100px;min-height:40px"><select class="in" data-in="mode" data-k="${k}" aria-label="Mode de calcul" style="width:auto;min-height:40px">${Object.entries(MODES).map(([m, l]) => `<option value="${m}" ${T.mode === m ? 'selected' : ''}>€ ${l}</option>`).join('')}</select></div>`)
    .join('')}</div>`;

/* ---------- agendas connectés ---------- */
V.agenda = () => {
  const up = EXT.filter(x => x.date >= TODAY).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return `<p class="muted">Connectez l’agenda où vous notez vos rendez-vous professionnels : ils sont récupérés automatiquement et se mettent à jour dans votre planning. Choisissez un agenda qui ne contient que vos cours.</p>
  <div class="card flat">${CALS.map((c, i) => `<div class="row" style="flex-wrap:wrap"><span class="av" style="background:${CAL_SOURCES[c.src].color}">${ic('cal')}</span><span class="grow" style="min-width:180px"><span class="t">${CAL_SOURCES[c.src].name} · ${esc(c.label)}</span><span class="s">${esc(c.account)} · synchronisé le ${fmtShort(c.sync.slice(0, 10))} à ${c.sync.slice(11)}</span></span><button class="btn sm ghost" data-a="sync" data-i="${i}">${ic('swap')}Synchroniser</button><button class="btn sm ghost" data-a="unlink" data-i="${i}">Déconnecter</button></div>`).join('') || '<p class="empty">Aucun agenda connecté.</p>'}</div>
  <div class="btns"><button class="btn pri" data-a="link">${ic('plus')}Connecter un agenda</button></div>
  <div class="h2"><h2>Rendez-vous récupérés</h2><span class="muted small">${up.filter(x => !S.ignored.has(x.id)).length} à venir</span></div>
  <div class="card flat">${up
    .map(x => {
      const off = S.ignored.has(x.id);
      return `<div class="row" style="${off ? 'opacity:.55' : ''}"><span style="width:84px;flex:none"><b>${fmtShort(x.date)}</b><br><span class="small muted">${hm(x.start)} · ${dur(x.dur)}</span></span><span class="grow"><span class="t" style="white-space:normal;${off ? 'text-decoration:line-through' : ''}">${esc(x.title)}</span><span class="s" style="white-space:normal">${CAL_SOURCES[x.src].name}${x.where ? ' · ' + esc(x.where) : ''}${off ? ' · retiré de /RAM Coach' : ''}</span></span>${off ? `<button class="btn sm ghost" data-a="unignore" data-id="${x.id}">Rétablir</button>` : `<button class="btn sm ghost" data-a="ignore" data-id="${x.id}">${ic('x')}Retirer</button>`}</div>`;
    })
    .join('')}</div>
  <p class="small muted">Retirer un rendez-vous l’enlève de /RAM Coach seulement : il reste dans votre agenda et ne revient pas aux synchronisations suivantes.</p>`;
};

/* ================= affichage ================= */
function render(scrollTop) {
  const v = view();
  document.title = '/RAM Coach';
  $('tabs').innerHTML = navHTML();
  $('top').innerHTML = topHTML(v);
  const f = V[v.v];
  $('main').innerHTML = f ? f(v.id) : '';
  if (scrollTop) scrollTo(0, 0);
}
addEventListener('resize', () => {
  clearTimeout(window._rz);
  window._rz = setTimeout(() => ($('top').innerHTML = topHTML(view())), 150);
});

/* ---------- feuille ---------- */
function sheet(title, body, onReady) {
  closeSheet();
  const w = document.createElement('div');
  w.className = 'veil';
  w.id = 'veil';
  w.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><span class="grab"></span><div class="hd"><h2>${esc(title)}</h2><button class="ib" data-a="close" aria-label="Fermer">${ic('x')}</button></div>${body}</div>`;
  w.addEventListener('click', e => e.target === w && closeSheet());
  document.body.appendChild(w);
  onReady && onReady(w);
  w.querySelector('input,select,textarea,button.btn')?.focus();
}
const closeSheet = () => $('veil')?.remove();
addEventListener('keydown', e => e.key === 'Escape' && (closeSheet(), $('timer') && A.timerClose()));

/* ================= actions ================= */
const A = {};
A.tab = d => {
  S.tab = d.t;
  S.stack = [];
  closeSheet();
  render(true);
};
A.open = d => {
  closeSheet();
  go(d.v, d.id);
};
A.back = back;
A.close = closeSheet;
A.theme = () => {
  const l = document.documentElement.dataset.theme !== 'light';
  document.documentElement.dataset.theme = l ? 'light' : 'dark';
  try {
    localStorage.setItem('ramcoach-theme', l ? 'light' : 'dark');
  } catch (e) {}
  render();
};
A.mine = d => {
  S.mine = d.v === '1';
  render();
};
A.wk = d => {
  S.wk = d.d === '0' ? 0 : S.wk + +d.d;
  render();
};
A.stTab = d => {
  S.stTab[d.k] = d.t;
  render();
};
A.schoolTab = d => {
  S.schoolTab = d.t;
  render();
};
A.noaccT = () => {
  S.noacc = !S.noacc;
  render();
};
A.noacc = () => {
  S.tab = 'students';
  S.stack = [];
  S.noacc = true;
  S.mine = true;
  render(true);
};
A.vidF = d => {
  S.vidF = d.v;
  render();
};
A.lvSport = d => {
  S.lvSport = d.v;
  render();
};
A.levels = d => {
  S.lvSport = d.sp;
  go('levels');
};
A.statP = d => {
  S.statP = d.v;
  render();
};
A.statScope = d => {
  S.statScope = d.v;
  render();
};

/* appel */
A.mark = d => {
  const s = SESSIONS.find(x => x.id === d.s);
  s.att[d.k] = s.att[d.k] === d.v ? undefined : d.v;
  if (!s.att[d.k]) delete s.att[d.k];
  render();
};
A.allP = d => {
  const s = SESSIONS.find(x => x.id === d.s);
  s.members.forEach(k => (s.att[k] = s.att[k] || 'p'));
  render();
  toast('Tout le monde est pointé présent');
};
A.persoOpen = d => {
  S.persoOpen[d.s + d.k] = true;
  render();
  document.querySelector(`[data-in="perso"][data-k="${d.k}"]`)?.focus();
};
A.saveBilan = d => {
  const s = SESSIONS.find(x => x.id === d.s);
  if (!s.bilan.trim()) return toast('Écrivez d’abord le bilan du groupe', 'edit');
  toast(`Bilan publié dans l’historique de ${plural(s.members.length, 'élève')} sur /RAM Club`);
};
A.cancel = d => {
  const s = SESSIONS.find(x => x.id === d.s);
  sheet(
    'Annuler la séance',
    `<p>${esc(gName(s))}, ${fmtDay(s.date)} à ${hm(s.start)}.</p><div class="btns">${['Pluie', 'Coach absent', 'Terrain indisponible', 'Autre'].map((r, i) => `<button class="btn sm ${i ? 'ghost' : 'pri'}" data-a="reason" data-r="${r}">${r}</button>`).join('')}</div><label class="field"><span>Message au groupe</span><textarea class="in" id="cmsg">Cours annulé ${fmtDay(s.date)} : pluie, terrain impraticable. Je vous propose un rattrapage très vite.</textarea></label>${clubNote(`Tous les élèves${GROUPS[s.g].kids ? ' et leurs parents' : ''} reçoivent une notification /RAM Club, et l’annonce s’affiche dans le groupe.`)}<button class="btn hot" data-a="cancelGo" data-s="${s.id}">${ic('stop')}Annuler et prévenir le groupe</button>`
  );
};
A.reason = (d, el) => {
  el.parentNode.querySelectorAll('.btn').forEach(b => b.classList.replace('pri', 'ghost'));
  el.classList.replace('ghost', 'pri');
  const s = $('cmsg');
  s.value = s.value.replace(/: [^,]*?, terrain impraticable|: [^.]*\./, d.r === 'Pluie' ? ': pluie, terrain impraticable' : ': ' + d.r.toLowerCase() + '.');
};
A.cancelGo = d => {
  const s = SESSIONS.find(x => x.id === d.s);
  s.cancelled = true;
  s.cancelReason = $('cmsg').value;
  POSTS.push({ id: 'p' + Date.now(), g: s.g, kind: 'annule', date: TODAY, x: $('cmsg').value });
  closeSheet();
  render();
  toast(`${GROUPS[s.g].name} prévenu sur /RAM Club`);
};

/* saisies au fil de l'eau */
document.addEventListener('input', e => {
  const el = e.target,
    k = el.dataset.in;
  if (!k) return;
  const s = el.dataset.s && SESSIONS.find(x => x.id === el.dataset.s);
  if (k === 'theme') s.theme = el.value;
  else if (k === 'bilan') s.bilan = el.value;
  else if (k === 'perso') {
    if (el.value.trim()) s.perso[el.dataset.k] = el.value;
    else delete s.perso[el.dataset.k];
  } else if (k === 'goals') st(el.dataset.k).goals = el.value;
  else if (k === 'note') st(el.dataset.k).note = el.value;
  else if (k === 'q') {
    S.q = el.value;
    const pos = el.selectionStart;
    render();
    const n = document.querySelector('[data-in="q"]');
    n.focus();
    n.setSelectionRange(pos, pos);
  } else if (k === 'prix') TYPES[el.dataset.k].prix = Math.max(0, +el.value || 0);
});
document.addEventListener('change', e => {
  const el = e.target,
    k = el.dataset.in;
  if (k === 'fg') {
    S.fg = el.value;
    render();
  } else if (k === 'mode') TYPES[el.dataset.k].mode = el.value;
  else if (k === 'gcoach') {
    const g = GROUPS[el.dataset.g];
    g.coach = el.value;
    SESSIONS.filter(s => s.g === g.id && !past(s)).forEach(s => (s.coach = el.value));
    toast(`${g.name} confié à ${coachName(el.value)}`, 'swap');
    render();
  } else if (k === 'gchat') {
    const g = GROUPS[el.dataset.g];
    g.chat = el.checked;
    toast(g.chat ? `Groupe de discussion « ${g.name} » créé dans /RAM Club` : 'Groupe de discussion fermé dans /RAM Club', 'chat');
    render();
  } else if (k === 'theme') toast('Thème enregistré', 'check');
});

/* progression */
A.tech = d => {
  const s = st(d.k),
    h = s.tech[d.c];
  if (h[h.length - 1][0] === TODAY) h[h.length - 1][1] = +d.n;
  else h.push([TODAY, +d.n]);
  render();
};
A.chk = d => {
  const c = (S.checks[d.k] = S.checks[d.k] || {});
  c[d.c] = !c[d.c];
  render();
};
A.levelUp = d => {
  const s = st(d.k),
    nx = SCALES[s.sport].levels.find(l => l.n === s.level + 1);
  s.level++;
  s.levelHist.push([TODAY, s.level]);
  render();
  toast(`${s.first} passe en ${nx.t} : bravo ! La nouvelle apparaît dans /RAM Club`, 'up');
};

/* élèves */
A.invite = d => {
  const s = st(d.k),
    to = s.parents[0] ? s.parents[0].mail : s.mail || 'son adresse';
  toast(`Invitation envoyée à ${to}`, 'mail');
};
A.newStudent = () =>
  sheet(
    'Ajouter un élève',
    `<p class="small muted">S’il est déjà adhérent, cherchez-le plutôt dans /RAM Club. Sinon, ajoutez-le ici : il retrouvera tout en créant son compte.</p><div class="f2"><label class="field"><span>Prénom</span><input class="in" id="nf" autocomplete="off"></label><label class="field"><span>Nom</span><input class="in" id="nl" autocomplete="off"></label></div><div class="f2"><label class="field"><span>Année de naissance</span><input class="in" id="nb" type="number" min="1930" max="2022" value="1990"></label><label class="field"><span>Sport</span><select class="in" id="ns"><option>Padel</option><option>Tennis</option></select></label></div><div class="f2"><label class="field"><span>Groupe</span><select class="in" id="ng"><option value="">Aucun pour l’instant</option>${Object.values(GROUPS)
      .filter(g => !g.indiv)
      .map(g => `<option value="${g.id}">${esc(g.name)}</option>`)
      .join('')}</select></label><label class="field"><span>Niveau</span><select class="in" id="nv">${SCALES.Padel.levels.map(l => `<option value="${l.n}">${l.n} · ${l.t}</option>`).join('')}</select></label></div><label class="field"><span>E-mail (de l’élève ou d’un parent)</span><input class="in" id="nm" type="email" autocomplete="off"></label><button class="btn pri" data-a="addStudent">${ic('plus')}Ajouter</button>`
  );
A.addStudent = () => {
  const f = $('nf').value.trim(),
    l = $('nl').value.trim();
  if (!f || !l) return toast('Indiquez le prénom et le nom', 'edit');
  const born = +$('nb').value || 1990;
  const id = student({ first: f, last: l, born, sport: $('ns').value, level: +$('nv').value, account: 'manuel', mail: $('nm').value, goals: '', note: '', parents: 2026 - born < 18 && $('nm').value ? [{ name: 'Parent de ' + f, rel: 'Parent', mail: $('nm').value, phone: '' }] : [] });
  const s = st(id);
  TECH[s.sport].forEach(c => (s.tech[c] = [[TODAY, 1]]));
  s.levelHist = [[TODAY, s.level]];
  if ($('ng').value) {
    s.groups.push($('ng').value);
    SESSIONS.filter(x => x.g === $('ng').value && !past(x)).forEach(x => x.members.push(id));
  }
  closeSheet();
  go('student', id);
  toast(`${f} ajouté. Il retrouvera tout en créant son compte /RAM Club`);
};
A.addToGroup = d => {
  const id = $('addSel').value;
  if (!id) return;
  st(id).groups.push(d.g);
  SESSIONS.filter(x => x.g === d.g && !past(x)).forEach(x => x.members.push(id));
  render();
  toast(`${nm(st(id))} ajouté au groupe`);
};
A.ja = d => {
  const s = st(d.k);
  const ev = [
    ['2026-11-05', 'Americano du jeudi', 'Animation'],
    ['2026-11-15', 'P25 Open du TPC', 'Tournoi'],
    ['2026-11-22', 'Montée-descente de novembre', 'Animation'],
    ['2026-12-06', 'P100 Padel Club Est', 'Tournoi']
  ];
  sheet('Inscrire à une compétition', `<p class="small muted">Tournois et animations organisés sur /RAM JA.</p><div class="card flat">${ev.map(e => `<button class="row" data-a="jaGo" data-k="${s.id}" data-e="${esc(e[1])}"><span class="grow"><span class="t">${esc(e[1])}</span><span class="s">${e[2]} · ${fmtDay(e[0])}</span></span>${ic('plus')}</button>`).join('')}</div>`);
};
A.jaGo = d => {
  closeSheet();
  toast(`${st(d.k).first} inscrit : ${d.e}. Le résultat remontera dans sa progression`, 'trophy');
};

/* messages */
A.dm = d => {
  let t = THREADS.find(x => x.s === d.k && x.to === d.to);
  if (!t) THREADS.unshift((t = { id: 't' + Date.now(), s: d.k, to: d.to, msgs: [] }));
  if (st(d.k).parents.length === 0) t.to = 'eleve';
  go('thread', t.id);
};
A.newDm = () => {
  const l = myStudents().sort((a, b) => a.last.localeCompare(b.last));
  sheet('Nouveau message', `<label class="field"><span>À qui</span><select class="in" id="dmTo">${l.map(s => `<option value="${s.id}|eleve">${esc(nm(s))}</option>${s.parents.map(p => `<option value="${s.id}|parent">${esc(p.name)} (${p.rel.toLowerCase()} de ${esc(s.first)})</option>`).join('')}`).join('')}</select></label><button class="btn pri" data-a="dmGo">${ic('chat')}Écrire</button>`);
};
A.dmGo = () => {
  const [k, to] = $('dmTo').value.split('|');
  closeSheet();
  A.dm({ k, to });
};
A.dmSend = d => {
  const t = THREADS.find(x => x.id === d.id),
    x = document.querySelector('[data-in="dmText"]').value.trim();
  if (!x) return;
  t.msgs.push({ me: true, at: TODAY + ' ' + hm(NOW_MIN).replace(' h ', ':').replace(' h', ':00'), x });
  render();
  toast('Message envoyé sur /RAM Club', 'send');
};

/* vidéos */
A.play = () => toast('Prototype : la vidéo de l’élève se lit ici (ralenti image par image prévu plus tard)', 'video');
A.vsend = d => {
  const v = VIDEOS.find(x => x.id === d.id),
    x = document.querySelector(`[data-in="vreply"][data-id="${d.id}"]`).value.trim();
  if (!x) return toast('Écrivez votre retour', 'edit');
  v.reply = x;
  v.replyAt = TODAY;
  render();
  toast(`Retour envoyé à ${st(v.s).first} sur /RAM Club`, 'send');
};

/* publications vers l'école */
A.post = d => {
  const gs = Object.values(GROUPS).filter(g => !g.indiv && g.coach === ME);
  sheet(
    d.k === 'contenu' ? 'Publier un contenu' : 'Annonce',
    `<label class="field"><span>Pour</span><select class="in" id="pg">${gs.map(g => `<option value="${g.id}" ${d.g === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}<option value="all">Tous mes groupes</option></select></label><div class="seg" id="pk"><button class="${d.k === 'contenu' ? '' : 'on'}" data-a="pk" data-v="annonce">Annonce</button><button class="${d.k === 'contenu' ? 'on' : ''}" data-a="pk" data-v="contenu">Contenu</button></div><label class="field"><span>Message</span><textarea class="in" id="px" placeholder="${d.k === 'contenu' ? 'Un exercice à refaire, une vidéo à regarder, une fiche…' : 'Une information pour le groupe…'}"></textarea></label>${clubNote('Publié dans la page École de /RAM Club, avec une notification aux élèves (et aux parents des jeunes).')}<button class="btn pri" data-a="postGo">${ic('send')}Publier</button>`
  );
};
A.pk = (d, el) => {
  el.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
};
A.postGo = () => {
  const x = $('px').value.trim();
  if (!x) return toast('Écrivez le message', 'edit');
  const kind = document.querySelector('#pk .on').dataset.v,
    g = $('pg').value;
  const gs = g === 'all' ? Object.values(GROUPS).filter(G => !G.indiv && G.coach === ME).map(G => G.id) : [g];
  gs.forEach(id => POSTS.push({ id: 'p' + Date.now() + id, g: id, kind, date: TODAY, x }));
  closeSheet();
  render();
  toast(`Publié sur /RAM Club pour ${gs.length > 1 ? plural(gs.length, 'groupe') : GROUPS[gs[0]].name}`, 'send');
};

/* groupes */
A.newGroup = () =>
  sheet(
    'Nouveau groupe',
    `<label class="field"><span>Nom</span><input class="in" id="gn" placeholder="Par exemple : Padel Adultes Confirmés"></label><div class="f2"><label class="field"><span>Sport</span><select class="in" id="gsp"><option>Padel</option><option>Tennis</option></select></label><label class="field"><span>Type</span><select class="in" id="gt">${Object.entries(TYPES)
      .filter(([k]) => k !== 'indiv')
      .map(([k, T]) => `<option value="${k}">${T.name}</option>`)
      .join('')}</select></label></div><div class="f2"><label class="field"><span>Jour</span><select class="in" id="gd">${[1, 2, 3, 4, 5, 6, 0].map(i => `<option value="${i}">${JOURS[i]}</option>`).join('')}</select></label><label class="field"><span>Heure</span><input class="in" id="gh" type="time" value="18:00"></label></div><div class="f2"><label class="field"><span>Durée (min)</span><input class="in" id="gdu" type="number" value="90" step="15"></label><label class="field"><span>Places</span><input class="in" id="gc" type="number" value="8"></label></div><div class="f2"><label class="field"><span>Lieu</span><input class="in" id="gco" value="Terrain 1"></label><label class="field"><span>Coach</span><select class="in" id="gch">${Object.values(COACHES).map(c => `<option value="${c.id}">${c.first} ${c.last}</option>`).join('')}</select></label></div><label style="display:flex;gap:10px;align-items:center;min-height:44px"><input type="checkbox" id="gcb" checked style="width:22px;height:22px;accent-color:var(--accent)">Créer le groupe de discussion sur /RAM Club</label><button class="btn pri" data-a="groupGo">${ic('plus')}Créer le groupe</button>`
  );
A.groupGo = () => {
  const name = $('gn').value.trim();
  if (!name) return toast('Donnez un nom au groupe', 'edit');
  const id = 'g' + Date.now(),
    [h, m] = $('gh').value.split(':').map(Number);
  GROUPS[id] = { id, name, sport: $('gsp').value, type: $('gt').value, coach: $('gch').value, day: +$('gd').value, start: h * 60 + m, dur: +$('gdu').value || 90, court: $('gco').value, cap: +$('gc').value || 8, kids: false, chat: $('gcb').checked, lv: 'à définir' };
  for (let d = addDays(TODAY, 1); d <= SEASON1; d = addDays(d, 1)) if (D(d).getDay() === GROUPS[id].day && !FERIES.includes(d)) addSession(id, d);
  closeSheet();
  go('group', id);
  toast(GROUPS[id].chat ? 'Groupe créé, avec sa discussion sur /RAM Club' : 'Groupe créé');
};

/* nouvelle séance (cours individuel) */
A.newSession = () => {
  const l = Object.values(STUDENTS).sort((a, b) => a.last.localeCompare(b.last));
  sheet('Nouvelle séance', `<label class="field"><span>Élève</span><select class="in" id="ss">${l.map(s => `<option value="${s.id}">${esc(nm(s))}</option>`).join('')}</select></label><div class="f2"><label class="field"><span>Date</span><input class="in" id="sd" type="date" value="${addDays(TODAY, 1)}"></label><label class="field"><span>Heure</span><input class="in" id="sh" type="time" value="12:30"></label></div><div class="f2"><label class="field"><span>Durée (min)</span><input class="in" id="sdu" type="number" value="60" step="15"></label><label class="field"><span>Lieu</span><input class="in" id="sco" value="Terrain 3"></label></div><button class="btn pri" data-a="sessionGo">${ic('plus')}Ajouter au planning</button>`);
};
A.sessionGo = () => {
  const k = $('ss').value,
    s = st(k);
  let g = Object.values(GROUPS).find(G => G.indiv === k);
  if (!g) {
    const id = 'i' + Date.now();
    g = GROUPS[id] = { id, name: 'Cours individuel', sport: s.sport, type: 'indiv', coach: ME, day: D($('sd').value).getDay(), start: 0, dur: 60, court: $('sco').value, cap: 1, kids: false, chat: false, indiv: k };
    s.groups.push(id);
  }
  const [h, m] = $('sh').value.split(':').map(Number);
  const se = addSession(g.id, $('sd').value, { start: h * 60 + m, dur: +$('sdu').value || 60, coach: ME });
  se.members = [k];
  closeSheet();
  S.wk = Math.floor((D(se.date) - D(monday(0))) / 6048e5);
  render();
  toast(`Séance ajoutée le ${fmtDay(se.date)} à ${hm(se.start)}`);
};

/* agendas connectés */
A.ext = d => {
  const x = EXT.find(e => e.id === d.id);
  sheet(x.title, `<dl class="kv"><dt>Quand</dt><dd>${fmtDay(x.date)}, ${hm(x.start)} à ${hm(x.start + x.dur)}</dd>${x.where ? `<dt>Où</dt><dd>${esc(x.where)}</dd>` : ''}<dt>Source</dt><dd>${CAL_SOURCES[x.src].name} · ${esc(CALS[0] ? CALS[0].label : '')}</dd></dl><p class="small muted">Ce rendez-vous vient de votre agenda en ligne et se met à jour tout seul. S’il ne concerne pas vos cours, retirez-le de /RAM Coach : il restera dans votre agenda.</p><button class="btn hot" data-a="ignore" data-id="${x.id}">${ic('x')}Retirer de /RAM Coach</button>`);
};
A.ignore = d => {
  S.ignored.add(d.id);
  closeSheet();
  render();
  toast('Rendez-vous retiré de /RAM Coach. Il ne reviendra pas à la prochaine synchronisation', 'x');
};
A.unignore = d => {
  S.ignored.delete(d.id);
  render();
  toast('Rendez-vous rétabli');
};
A.sync = d => {
  CALS[+d.i].sync = TODAY + ' ' + hm(NOW_MIN).replace(' h ', ':');
  render();
  toast(`${CAL_SOURCES[CALS[+d.i].src].name} à jour : ${plural(extOn().filter(x => x.date >= TODAY).length, 'rendez-vous')} à venir`, 'swap');
};
A.unlink = d => {
  CALS.splice(+d.i, 1);
  render();
  toast('Agenda déconnecté. Ses rendez-vous ne sont plus récupérés', 'link');
};
A.link = () =>
  sheet(
    'Connecter un agenda',
    `<p class="small muted">Choisissez votre service d’agenda. Vous vous connecterez ensuite chez lui : /RAM Coach ne voit jamais votre mot de passe.</p><div class="card flat">${Object.entries(CAL_SOURCES)
      .map(([k, c]) => `<button class="row" data-a="linkPick" data-src="${k}"><span class="av" style="background:${c.color}">${ic(k === 'ical' ? 'link' : 'cal')}</span><span class="grow"><span class="t">${c.name}</span><span class="s">${k === 'ical' ? 'Collez le lien privé de votre agenda (.ics)' : k === 'calendly' ? 'Vos rendez-vous réservés par vos élèves' : 'Récupération automatique, mise à jour en continu'}</span></span>${ic('next')}</button>`)
      .join('')}</div>`
  );
A.linkPick = d => {
  const c = CAL_SOURCES[d.src];
  sheet(`${c.name}`, `<p class="small muted">Démonstration : la connexion à ${c.name} se fait sur sa propre page, puis vous choisissez l’agenda à récupérer.</p><span class="kicker">Quel agenda contient vos rendez-vous professionnels ?</span><div class="card flat">${['Cours et coaching', 'Personnel', 'Famille'].map((l, i) => `<button class="row" data-a="linkGo" data-src="${d.src}" data-l="${l}"><span class="grow"><span class="t">${l}</span><span class="s">${i ? 'Déconseillé : contient des rendez-vous personnels' : 'Recommandé'}</span></span>${i ? '' : '<span class="tag ok">Pro</span>'}</button>`).join('')}</div>`);
};
A.linkGo = d => {
  CALS.push({ src: d.src, label: d.l, account: COACHES[ME].first.toLowerCase() + '.' + COACHES[ME].last.toLowerCase() + '@exemple.fr', sync: TODAY + ' ' + hm(NOW_MIN).replace(' h ', ':') });
  closeSheet();
  S.tab = 'agenda';
  S.stack = [];
  render(true);
  toast(`${CAL_SOURCES[d.src].name} connecté : vos rendez-vous arrivent dans le planning`, 'link');
};

/* ---------- minuteur d'exercices par intervalles ---------- */
const TM = { work: 40, rest: 20, rounds: 8, ph: 'set', left: 0, round: 0, id: 0, paused: false };
let actx;
const beep = (f = 880, t = 0.15) => {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(),
      g = actx.createGain();
    o.frequency.value = f;
    o.connect(g);
    g.connect(actx.destination);
    g.gain.setValueAtTime(0.25, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + t);
    o.start();
    o.stop(actx.currentTime + t);
  } catch (e) {}
};
function timerHTML() {
  const mm = n => (n >= 60 ? Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0') : String(n));
  if (TM.ph === 'set')
    return `<button class="ib x" data-a="timerClose" aria-label="Fermer">${ic('x')}</button><span class="ph">Minuteur</span><p class="muted">Travail, repos, répétitions : un bip à chaque changement.</p><div class="cfg"><label>Travail (s)<input class="in" id="tw" type="number" min="5" value="${TM.work}"></label><label>Repos (s)<input class="in" id="tr" type="number" min="0" value="${TM.rest}"></label><label>Séries<input class="in" id="tn" type="number" min="1" value="${TM.rounds}"></label></div><button class="btn pri" data-a="timerGo">${ic('play')}Démarrer</button>`;
  const tot = TM.ph === 'work' ? TM.work : TM.ph === 'rest' ? TM.rest : 1;
  return `<button class="ib x" data-a="timerClose" aria-label="Fermer">${ic('x')}</button><span class="ph">${TM.ph === 'work' ? 'Travail' : TM.ph === 'rest' ? 'Repos' : 'Terminé'}</span><span class="big" aria-live="off">${TM.ph === 'done' ? 'Fini' : mm(TM.left)}</span><span class="ring"><i style="width:${(100 * TM.left) / tot}%"></i></span><span class="rd">Série ${Math.min(TM.round, TM.rounds)} sur ${TM.rounds}</span><div class="btns">${TM.ph === 'done' ? `<button class="btn pri" data-a="timerReset">${ic('reset')}Recommencer</button>` : `<button class="btn ${TM.paused ? 'pri' : ''}" data-a="timerPause">${ic(TM.paused ? 'play' : 'pause')}${TM.paused ? 'Reprendre' : 'Pause'}</button><button class="btn ghost" data-a="timerReset">Arrêter</button>`}</div>`;
}
function timerPaint() {
  const t = $('timer');
  if (!t) return;
  t.className = 'timer ' + (TM.ph === 'work' ? 'work' : TM.ph === 'rest' ? 'rest' : '');
  t.innerHTML = timerHTML();
}
A.timer = () => {
  closeSheet();
  if ($('timer')) return;
  const t = document.createElement('div');
  t.id = 'timer';
  t.setAttribute('role', 'dialog');
  t.setAttribute('aria-label', 'Minuteur');
  document.body.appendChild(t);
  TM.ph = 'set';
  timerPaint();
};
A.timerGo = () => {
  TM.work = Math.max(5, +$('tw').value || 40);
  TM.rest = Math.max(0, +$('tr').value || 0);
  TM.rounds = Math.max(1, +$('tn').value || 1);
  TM.round = 1;
  TM.ph = 'work';
  TM.left = TM.work;
  TM.paused = false;
  beep(1046, 0.3);
  clearInterval(TM.id);
  TM.id = setInterval(() => {
    if (TM.paused) return;
    TM.left--;
    if (TM.left <= 3 && TM.left > 0) beep(660, 0.08);
    if (TM.left <= 0) {
      if (TM.ph === 'work' && TM.rest && TM.round < TM.rounds) {
        TM.ph = 'rest';
        TM.left = TM.rest;
        beep(523, 0.3);
      } else if (TM.round < TM.rounds) {
        TM.round++;
        TM.ph = 'work';
        TM.left = TM.work;
        beep(1046, 0.3);
      } else {
        TM.ph = 'done';
        clearInterval(TM.id);
        beep(1046, 0.6);
      }
    }
    timerPaint();
  }, 1000);
  timerPaint();
};
A.timerPause = () => {
  TM.paused = !TM.paused;
  timerPaint();
};
A.timerReset = () => {
  clearInterval(TM.id);
  TM.ph = 'set';
  timerPaint();
};
A.timerClose = () => {
  clearInterval(TM.id);
  $('timer')?.remove();
};

/* ---------- clics ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el || !A[el.dataset.a]) return;
  e.preventDefault();
  A[el.dataset.a](el.dataset, el);
});

/* ---------- démarrage ---------- */
try {
  const t = localStorage.getItem('ramcoach-theme');
  if (t) document.documentElement.dataset.theme = t;
} catch (e) {}
render();
