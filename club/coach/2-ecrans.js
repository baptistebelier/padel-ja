/* /RAM Coach — coach/2-ecrans.js : les pages de l'enseignant (Aujourd'hui, Planning, Séance, Élèves,
   Messages, École). Elles s'ajoutent à la table des écrans V du Club ; Profil, discussions de groupe,
   notifications et conversation privée (ui/13-suivi.js) sont ceux du Club. */
/* ---------- aides ---------- */
const fold = s =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const coAll = () => isBureau() || !!S.super; // bureau du club ou administrateur : toute l'école
const coGroups = scope =>
  GROUPS.filter(g => g.type === 'train' && ((scope || S.plScope) === 'ecole' ? true : g.coach === ME()));
const coStu = g => g.mem.concat(g.ext || []);
const coEl = id => ELEVES.find(e => e.id === id);
const coDow = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
};
/* dates d'un groupe entre deux jours (inclus) */
function coDates(g, from, to) {
  const out = [];
  for (let d = from; d <= to; d = isoIn(1, d)) if (coDow(d) === g.day) out.push(d);
  return out;
}
const sesKey = (g, d) => g.id + '.' + d;
const sesFind = (g, d) => SEANCES.find(s => s.id === sesKey(g, d));
const isCx = (g, d) => (g.cancel || []).includes(d);
const monday = off => {
  const dow = (coDow(TODAY) + 6) % 7;
  return isoIn(-dow + 7 * (off || 0));
};
/* toutes les séances d'une période, triées : { g, d, s } */
function coSessions(from, to, scope) {
  return coGroups(scope)
    .flatMap(g => coDates(g, from, to).map(d => ({ g, d, s: sesFind(g, d) })))
    .sort((a, b) => a.d.localeCompare(b.d) || hMin(a.g.h) - hMin(b.g.h));
}
/* élèves suivis : ceux de mes groupes (ou de toute l'école) et les fiches créées à la main */
function coStudents() {
  const ids = new Set();
  coGroups(coAll() ? 'ecole' : 'me').forEach(g => coStu(g).forEach(k => ids.add(k)));
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
const coSport = id =>
  (coEl(id) || {}).sport || (GROUPS.find(g => g.type === 'train' && coStu(g).includes(id)) || {}).sport || 'Tennis';
const coLvl = id => {
  const e = coEl(id),
    sc = SCALES[coSport(id)];
  return e && e.lvl ? sc.levels.find(l => l.n === e.lvl) : null;
};
const coGroupsOf = id => GROUPS.filter(g => g.type === 'train' && coStu(g).includes(id));
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
/* carte d'une séance du planning */
function coSesCard(x, big) {
  const { g, d, s } = x,
    cx = isCx(g, d),
    st = coStu(g),
    nP = s && s.pres ? Object.values(s.pres).filter(v => v === 'P').length : null,
    [y, m, dd] = d.split('-').map(Number),
    loc = (g.loc || {})[d] || g.defLoc || 'Extérieur';
  return `<button class="card coses${cx ? ' cx' : ''}" data-a="open" data-v="seance" data-id="${sesKey(g, d)}"><span class="dblk"><b>${dd}</b>${MO[m - 1]}</span><span class="grow"><span class="h3" style="font-size:18px">${esc(g.name)}</span><br><span class="muted small">${DA[new Date(y, m - 1, dd).getDay()]} · ${g.h} · ${g.dur}${g.coach && g.coach !== ME() && M[g.coach] ? ' · ' + first(g.coach) : ''}</span><span class="tags" style="display:flex;margin-top:6px">${cx ? '<span class="tag" style="background:var(--hot);color:#fff">Cours annulé</span>' : `<span class="tag loc">${ic(loc === 'En salle' ? 'home' : 'sun')}${loc}</span>`}${sportTag(g.sport)}<span class="tag">${nP != null && d <= TODAY ? nP + '/' + st.length + ' présents' : plural(st.length, 'élève')}</span></span>${s && s.theme ? `<span class="small cotheme">${ic('ladder')}${esc(s.theme)}</span>` : big && !cx ? '<span class="muted small">Thème à définir</span>' : ''}</span></button>`;
}
/* ---------- Aujourd'hui ---------- */
function coToday() {
  const today = coSessions(TODAY, TODAY, 'me'),
    tom = coSessions(isoIn(1), isoIn(1), 'me'),
    wk = coSessions(monday(0), isoIn(6, monday(0)), 'me').filter(x => !isCx(x.g, x.d)),
    todoB = coSessions(isoIn(-7), TODAY, 'me').filter(x => !isCx(x.g, x.d) && !(x.s && x.s.recap) && x.d <= TODAY),
    vids = coVideosTodo(),
    un = coUnread(),
    todo = [];
  todoB.forEach(x =>
    todo.push(
      `<button class="item" data-a="open" data-v="seance" data-id="${sesKey(x.g, x.d)}"><span class="tile">${ic('doc')}</span><span class="grow"><span class="nm">Bilan à écrire</span><br><span class="muted small">${esc(x.g.name)} · ${fmtD(x.d)}</span></span></button>`
    )
  );
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
  return `<div class="pad"><div class="stats"><div><b>${today.filter(x => !isCx(x.g, x.d)).length}</b><span>Aujourd'hui</span></div><div><b>${String(Math.round(hrs * 10) / 10).replace('.', ',')}</b><span>Heures semaine</span></div><div><b>${coStudents().length}</b><span>Élèves</span></div><div><b>${vids.length}</b><span>Vidéos</span></div></div>
<span class="kicker">Aujourd'hui · ${fmtD(TODAY)}</span>${today.length ? today.map(x => coSesCard(x, 1)).join('') : empty('cal', 'Pas de cours aujourd’hui', '')}
${tom.length ? `<span class="kicker">Demain</span>${tom.map(x => coSesCard(x)).join('')}` : ''}
<span class="kicker">À traiter</span>${todo.length ? todo.join('') : empty('check', 'Tout est à jour', 'Bilans écrits, vidéos analysées, messages lus.')}
<div class="ctl" style="flex-wrap:wrap"><button class="btn grow ghost" data-a="coTimer">${ic('timer')}Minuteur</button><button class="btn grow ghost" data-a="coGo" data-t="ecole" data-k="stats">${ic('chart')}Statistiques</button></div></div>`;
}
/* ---------- Planning : semaine par semaine, mes cours ou toute l'école ---------- */
function coPlanning() {
  const from = monday(S.pl.w),
    to = isoIn(6, from),
    l = coSessions(from, to),
    stages = posts.filter(p => p.stage && !p.arch && (p.date || '') >= from && (p.date || '') <= to);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = isoIn(i, from),
      x = l.filter(s => s.d === d);
    if (x.length)
      days.push(
        `<span class="kicker">${DAYS[coDow(d)]} ${+d.slice(8)} ${MO[+d.slice(5, 7) - 1]}${d === TODAY ? " · aujourd'hui" : ''}</span>` +
          x.map(s => coSesCard(s, 1)).join('')
      );
  }
  return (
    segs('plScope', [
      ['me', 'Mes cours', 'user'],
      ['ecole', "Toute l'école", 'school']
    ]) +
    `<div class="pad"><div class="row coweek"><button class="ib" data-a="coWeek" data-n="-1" aria-label="Semaine précédente">${ic('back')}</button><span class="grow" style="text-align:center"><b>Semaine du ${+from.slice(8)} ${MO[+from.slice(5, 7) - 1]}</b><br><span class="muted small">${plural(l.filter(x => !isCx(x.g, x.d)).length, 'séance')}${S.pl.w ? '' : ' · cette semaine'}</span></span><button class="ib flip" data-a="coWeek" data-n="1" aria-label="Semaine suivante">${ic('back')}</button></div>${days.join('') || empty('cal', 'Aucun cours cette semaine', '')}${stages.length ? '<span class="kicker">Stages</span>' + stages.map(p => `<button class="item" data-a="open" data-v="post" data-id="${p.id}"><span class="tile">${ic('ball')}</span><span class="grow"><span class="nm">${esc(p.title)}</span></span></button>`).join('') : ''}<div class="ctl"><button class="btn grow" data-a="newPost" data-k="train">${ic('plus')}Créer un groupe</button><button class="btn grow ghost" data-a="newPost" data-k="stage">Créer un stage</button></div></div>`
  );
}
/* ---------- Séance : thème, appel, bilan du groupe et commentaires personnels ---------- */
function coSeance(id) {
  const i = id.lastIndexOf('.'),
    g = grp(id.slice(0, i)),
    d = id.slice(i + 1);
  if (!g) return empty('cal', 'Séance introuvable', '');
  const s = sesFind(g, d) || {},
    cx = isCx(g, d),
    st = coStu(g),
    past = d <= TODAY,
    loc = (g.loc || {})[d] || g.defLoc || 'Extérieur',
    perso = k => (SUIVI.find(x => x.k === 'bilan' && x.ses === id && x.to === k) || {}).txt || '';
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
<form id="co-theme" data-id="${id}" class="row" style="gap:8px;margin-top:10px"><input id="co-th" class="grow" placeholder="Thème de la séance" value="${esc(s.theme || '')}" aria-label="Thème de la séance" list="co-thl"><datalist id="co-thl">${THEMES[g.sport].map(t => `<option value="${esc(t)}">`).join('')}</datalist><button class="btn sm">OK</button></form>
<div class="ctl" style="flex-wrap:wrap">${cx ? '' : `<button class="btn sm grow ghost" data-a="loc" data-g="${g.id}" data-d="${d}">${loc === 'En salle' ? 'Passer en extérieur' : 'Passer en salle'}</button>`}<button class="btn sm grow ${cx ? '' : 'ghost'}" data-a="cancelCourse" data-id="${g.id}" data-d="${d}">${cx ? 'Rétablir le cours' : 'Cours annulé'}</button><button class="btn sm grow ghost" data-a="coTimer">${ic('timer')}Minuteur</button></div></div>
${
  cx
    ? '<div class="note">Les élèves et leurs parents sont prévenus dans /RAM Club.</div>'
    : `<span class="kicker">Appel · ${nP} présent${nP > 1 ? 's' : ''} sur ${st.length}</span><div class="card">${roll || empty('users', 'Aucun élève', '')}<button class="btn sm ghost full" data-a="coAllP" data-id="${id}">Tout le monde présent</button></div>
<span class="kicker">Bilan de la séance</span><form id="co-bilan" data-id="${id}" class="card"><div class="fld"><label for="co-recap">Pour tout le groupe</label><textarea id="co-recap" placeholder="Ce qui a été travaillé, ce qu'on garde pour la prochaine fois">${esc(s.recap || '')}</textarea></div>${st
        .filter(k => !s.pres || s.pres[k] !== 'A')
        .map(
          k =>
            `<div class="fld"><label for="co-p-${k}">Pour ${esc(svFirst(k))} (personnel)</label><textarea id="co-p-${k}" data-k="${k}" class="co-perso" rows="2" placeholder="Facultatif : reçu dans son espace">${esc(perso(k))}</textarea></div>`
        )
        .join(
          ''
        )}<button class="btn full">${ic('send')}${past ? 'Envoyer le bilan aux élèves' : 'Enregistrer'}</button><p class="muted small">Le bilan arrive dans /RAM Club, École, Mon espace : celui du groupe pour tous, le commentaire personnel pour l'élève (et ses parents) seulement.</p></form>`
}</div>`;
}
/* ---------- Élèves ---------- */
function coEleves() {
  const q = fold(S.elQ || ''),
    f = S.elF,
    l = coStudents()
      .filter(k => !q || fold(svName(k)).includes(q))
      .filter(k => f === 'all' || (f === 'nc' ? !M[k] : f === 'jeunes' ? M[k] && isMinor(k) : coSport(k) === f))
      .sort((a, b) => svName(a).localeCompare(svName(b)));
  const chip = (v, t) => `<button class="chip" data-a="coElF" data-v="${v}" aria-pressed="${f === v}">${t}</button>`;
  return `<div class="pad"><div class="fld cosearch"><input id="co-q" type="search" placeholder="Rechercher un élève" value="${esc(S.elQ || '')}" aria-label="Rechercher un élève" data-in="coQ"></div><div class="chips">${chip('all', 'Tous')}${chip('Padel', 'Padel')}${chip('Tennis', 'Tennis')}${chip('jeunes', 'Jeunes')}${chip('nc', 'Sans compte')}</div><span class="kicker">${plural(l.length, 'élève')}</span>${
    l
      .map(k => {
        const lv = coLvl(k),
          gs = coGroupsOf(k),
          un = svOf(k).length ? svUnread(k) : 0;
        return `<button class="item" data-a="open" data-v="eleve" data-id="${k}">${coAv(k)}<span class="grow"><span class="nm">${esc(svName(k))}</span>${M[k] ? '' : ' <span class="tag">Sans compte</span>'}<br><span class="muted small">${lv ? 'Niv. ' + lv.n + ' ' + lv.t + ' · ' : ''}${gs.map(g => esc(g.name)).join(', ') || 'Cours individuels'}</span></span>${un ? `<span class="cnt">${un}</span>` : ''}</button>`;
      })
      .join('') || empty('users', 'Aucun élève', q ? 'Personne ne correspond à la recherche.' : '')
  }<button class="btn full ghost" data-a="coNewEl">${ic('plus')}Ajouter un élève sans compte</button><p class="muted small">Un élève sans compte /RAM Club retrouve sa fiche, ses bilans et ses messages dès qu'il est relié à son compte.</p></div>`;
}
function coEleve(id) {
  const e = coEl(id) || {},
    sp = coSport(id),
    sc = SCALES[sp],
    lv = coLvl(id),
    gs = coGroupsOf(id),
    tab = S.elTab;
  let b = '';
  if (tab === 'fiche') {
    const row = (l, v) => `<div class="cokv"><span class="muted">${l}</span><b>${v || '–'}</b></div>`;
    b = `<div class="card">${row('Sport', sp)}${row('Niveau', lv ? lv.n + ' · ' + lv.t : '')}${row('Main', e.hand === 'G' ? 'Gaucher' : e.hand === 'D' ? 'Droitier' : '')}${sp === 'Padel' ? row('Côté', e.side === 'G' ? 'Gauche' : e.side === 'D' ? 'Droite' : e.side === '2' ? 'Les deux' : '') : ''}${row('Groupes', gs.map(g => esc(g.name)).join(', '))}${e.mail ? row('E-mail', esc(e.mail)) : ''}</div>
<span class="kicker">Objectifs</span><div class="card"><p>${esc(e.goals || 'Aucun objectif noté.')}</p></div>
<span class="kicker">Note privée</span><div class="card"><p>${esc(e.note || 'Aucune note.')}</p><span class="muted small">Visible par l'équipe pédagogique seulement.</span></div>
${(e.parents || []).length ? `<span class="kicker">Parents</span><div class="card">${e.parents.map(p => `<div class="cokv"><span>${esc(p.n)}</span><b>${esc(p.tel || p.mail || '')}</b></div>`).join('')}</div>` : ''}
<button class="btn full ghost" data-a="coEditEl" data-id="${id}">${ic('edit')}Modifier la fiche</button>${M[id] ? '' : `<button class="btn full" data-a="coLink" data-id="${id}">${ic('link')}Relier à un compte du club</button>`}`;
  }
  if (tab === 'histo') {
    const h = SEANCES.filter(s => s.pres && s.pres[id] && s.d <= TODAY).sort((a, b) => b.d.localeCompare(a.d)),
      nP = h.filter(s => s.pres[id] === 'P').length;
    b =
      `<div class="stats"><div><b>${h.length}</b><span>Séances</span></div><div><b>${h.length ? Math.round((nP * 100) / h.length) : 0} %</b><span>Présence</span></div><div><b>${h.filter(s => s.pres[id] === 'E').length}</b><span>Excusé</span></div><div><b>${h.filter(s => s.pres[id] === 'A').length}</b><span>Absent</span></div></div>` +
      (h
        .map(
          s =>
            `<button class="item" data-a="open" data-v="seance" data-id="${s.id}"><span class="dblk"><b>${+s.d.slice(8)}</b>${MO[+s.d.slice(5, 7) - 1]}</span><span class="grow"><span class="nm">${esc((grp(s.g) || {}).name || 'Séance')}</span> <span class="tag" ${s.pres[id] === 'P' ? '' : 'style="background:var(--hot);color:#fff"'}>${presLbl[s.pres[id]]}</span><br><span class="muted small">${esc(s.theme || '')}</span></span></button>`
        )
        .join('') || empty('cal', 'Aucune séance', ''));
  }
  if (tab === 'prog') {
    const t = e.tech || {},
      res = (M[id] && M[id].res) || [];
    b = `<span class="kicker">${sc.name} · niveau actuel</span><div class="coscale">${sc.levels
      .map(
        l =>
          `<button class="${lv && l.n === lv.n ? 'on' : lv && l.n < lv.n ? 'past' : ''}" data-a="coLvl" data-id="${id}" data-n="${l.n}" aria-pressed="${!!lv && l.n === lv.n}" aria-label="Niveau ${l.n} ${l.t}">${l.n}</button>`
      )
      .join('')}</div>${
      lv
        ? `<div class="card"><span class="h3">${lv.n} · ${lv.t}</span><span class="kicker">Prérequis</span><ul class="coul">${lv.pre.map(x => `<li>${esc(x)}</li>`).join('')}</ul><span class="kicker">Attendus pour valider</span><ul class="coul">${lv.att.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`
        : '<div class="note">Touche un niveau pour le donner à l’élève.</div>'
    }<span class="kicker">Grille technique · touche pour faire avancer</span><div class="card">${TECH[sp]
      .map(
        x =>
          `<button class="cotech" data-a="coTech" data-id="${id}" data-t="${esc(x)}"><span class="grow">${esc(x)}</span><span class="pips" aria-hidden="true">${[1, 2, 3, 4].map(n => `<i class="${(t[x] || 0) >= n ? 'on' : ''}"></i>`).join('')}</span><span class="muted small">${STEPS[t[x] || 0] || 'Non évalué'}</span></button>`
      )
      .join('')}</div>${
      (e.lvlH || []).length
        ? `<span class="kicker">Évolution</span><div class="card">${e.lvlH
            .slice()
            .reverse()
            .map(x => `<div class="cokv"><span class="muted">${fmtD(x.d)}</span><b>Niveau ${x.lvl}</b></div>`)
            .join('')}</div>`
        : ''
    }${
      res.length
        ? `<span class="kicker">Résultats en tournoi</span><div class="card">${res
            .slice(0, 6)
            .map(
              r =>
                `<div class="cokv"><span>${r.w ? 'Victoire' : 'Défaite'} · ${esc(r.opp)}</span><b>${esc(r.sc)}</b></div>`
            )
            .join('')}</div>`
        : ''
    }`;
  }
  if (tab === 'suivi') {
    const l = svOf(id),
      un = l.length ? svUnread(id) : 0;
    b =
      `<button class="item" data-a="open" data-v="dm" data-id="${id}"><span class="tile">${ic('chat')}</span><span class="grow"><span class="nm">Conversation avec ${esc(svFirst(id))}</span><br><span class="muted small">${l.length ? plural(l.length, 'envoi') : 'Aucun échange pour le moment'}</span></span>${un ? `<span class="cnt">${un}</span>` : ''}</button><div class="ctl"><button class="btn grow" data-a="coContent" data-id="${id}">${ic('spark')}Envoyer un contenu</button></div>` +
      l
        .filter(x => x.k !== 'msg')
        .reverse()
        .slice(0, 8)
        .map(x => svCard(x, x.by === ME()))
        .join('');
  }
  return (
    `<div class="pad"><div class="row" style="gap:12px;margin-bottom:8px">${coAv(id, 'lg')}<div class="grow"><span class="h3">${esc(svName(id))}</span><br><span class="muted small">${lv ? 'Niveau ' + lv.n + ' · ' + lv.t : sp}${M[id] ? '' : ' · sans compte'}</span></div></div></div>` +
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
      .sort((a, b) => (svOf(b).slice(-1)[0].at || 0) - (svOf(a).slice(-1)[0].at || 0));
    b =
      `<button class="btn full" data-a="coNewMsg">${ic('plus')}Nouveau message</button>` +
      (l
        .map(k => {
          const x = svOf(k).slice(-1)[0],
            un = svUnread(k);
          return `<button class="item" data-a="open" data-v="dm" data-id="${k}">${coAv(k)}<span class="grow"><span class="nm">${esc(svName(k))}</span><br><span class="muted small">${esc(((x.by === ME() ? 'Moi : ' : '') + (x.txt || SV_KIND[x.k][1])).slice(0, 70))}</span></span><span class="muted small">${fmtD(svDay(x.at), 1)}</span>${un ? `<span class="cnt">${un}</span>` : ''}</button>`;
        })
        .join('') || empty('chat', 'Aucune conversation', 'Toi seul peux commencer une conversation avec un élève.'));
  } else {
    const gs = coGroups(coAll() ? 'ecole' : 'me');
    b =
      `<p class="muted small">Les discussions des groupes sont celles de /RAM Club : annonces, changements de lieu, cours annulés.</p>` +
      (gs
        .map(g => {
          const c = chans.find(c => c.id === g.id);
          if (!c) return '';
          const last = (c.msgs || []).slice(-1)[0];
          return `<button class="item" data-a="open" data-v="chan" data-id="${c.id}"><span class="tile">${ic('users')}</span><span class="grow"><span class="nm">${esc(c.name)}</span><br><span class="muted small">${last ? esc(String(last.x || 'Photo').slice(0, 60)) : 'Aucun message'}</span></span>${c.un ? `<span class="cnt">${c.un}</span>` : ''}</button>`;
        })
        .join('') || empty('users', 'Aucun groupe', ''));
  }
  return (
    segs('msTab', [
      ['eleves', 'Élèves', 'user'],
      ['groupes', 'Groupes', 'users']
    ]) + `<div class="pad">${b}</div>`
  );
}
/* ---------- École : groupes, équipe pédagogique, statistiques, niveaux ---------- */
function coStats() {
  const now = TODAY,
    from =
      S.stP === 'sem'
        ? monday(0)
        : S.stP === 'mois'
          ? now.slice(0, 8) + '01'
          : (+now.slice(5, 7) >= 9 ? now.slice(0, 4) : +now.slice(0, 4) - 1) + '-09-01',
    scope = S.stWho === 'ecole' && coAll() ? 'ecole' : 'me',
    l = coSessions(from, now, scope).filter(x => !isCx(x.g, x.d)),
    mins = l.reduce((a, x) => a + durMin(x.g.dur), 0),
    nPres = x => (x.s && x.s.pres ? Object.values(x.s.pres).filter(v => v === 'P').length : 0),
    money = x => {
      const t = tarifOf(x.g);
      return t.mode === 'heure'
        ? (t.prix * durMin(x.g.dur)) / 60
        : t.mode === 'eleve'
          ? t.prix * nPres(x)
          : +t.prix || 0;
    },
    eur = l.reduce((a, x) => a + money(x), 0),
    called = l.filter(x => x.s && x.s.pres),
    att = called.reduce((a, x) => a + Object.keys(x.s.pres).length, 0),
    attP = called.reduce((a, x) => a + nPres(x), 0),
    gs = coGroups(scope),
    fillG = gs.filter(g => g.max),
    fill = fillG.length
      ? Math.round((fillG.reduce((a, g) => a + coStu(g).length / g.max, 0) * 100) / fillG.length)
      : null;
  // heures par semaine (8 dernières semaines)
  const wks = [];
  for (let w = -7; w <= 0; w++) {
    const a = monday(w),
      z = isoIn(6, a),
      h =
        coSessions(a, z < now ? z : now, scope)
          .filter(x => !isCx(x.g, x.d))
          .reduce((s, x) => s + durMin(x.g.dur), 0) / 60;
    wks.push([a, h]);
  }
  const mx = Math.max(1, ...wks.map(w => w[1]));
  const byG = gs
    .map(g => {
      const x = l.filter(s => s.g === g),
        c = x.filter(s => s.s && s.s.pres),
        n = c.reduce((a, s) => a + Object.keys(s.s.pres).length, 0),
        p = c.reduce((a, s) => a + nPres(s), 0);
      return `<div class="cokv"><span class="grow">${esc(g.name)}<br><span class="muted small">${plural(x.length, 'séance')} · ${n ? Math.round((p * 100) / n) + ' % de présence' : 'pas d’appel'}</span></span><b>${Math.round(x.reduce((a, s) => a + money(s), 0))} €</b></div>`;
    })
    .join('');
  return (
    `<div class="chips">${[
      ['sem', 'Semaine'],
      ['mois', 'Mois'],
      ['saison', 'Saison']
    ]
      .map(
        p => `<button class="chip" data-a="coStP" data-v="${p[0]}" aria-pressed="${S.stP === p[0]}">${p[1]}</button>`
      )
      .join(
        ''
      )}${coAll() ? `<button class="chip" data-a="coStWho" aria-pressed="${S.stWho === 'ecole'}">Toute l'école</button>` : ''}</div>` +
    `<div class="stats"><div><b>${String(Math.round(mins / 6) / 10).replace('.', ',')}</b><span>Heures</span></div><div><b>${Math.round(eur)}</b><span>Euros</span></div><div><b>${fill == null ? '–' : fill + ' %'}</b><span>Remplissage</span></div><div><b>${att ? Math.round((attP * 100) / att) + ' %' : '–'}</b><span>Présence</span></div></div>` +
    `<span class="kicker">Heures données · 8 semaines</span><div class="card cobars">${wks.map(w => `<div><i style="height:${Math.round((w[1] / mx) * 100)}%"></i><span>${+w[0].slice(8)}/${+w[0].slice(5, 7)}</span><b>${String(Math.round(w[1] * 10) / 10).replace('.', ',')}</b></div>`).join('')}</div>` +
    `<span class="kicker">Par groupe</span><div class="card">${byG || empty('users', 'Aucun groupe', '')}</div><p class="muted small">Revenus calculés avec le tarif de chaque groupe (par séance, à l'heure ou par élève présent), réglable dans la page du groupe.</p>`
  );
}
function coEcole() {
  const t = S.coTab;
  let b = '';
  if (t === 'groupes') {
    const gs = coGroups(coAll() ? 'ecole' : 'me');
    b =
      gs
        .map(
          g =>
            `<button class="item" data-a="open" data-v="cgroupe" data-id="${g.id}"><span class="tile">${ic('users')}</span><span class="grow"><span class="nm">${esc(g.name)}</span><br><span class="muted small">${DAYS[g.day]} ${g.h} · ${plural(coStu(g).length, 'élève')}${g.max ? ' sur ' + g.max : ''}${g.coach && M[g.coach] ? ' · ' + first(g.coach) : ''}</span></span>${sportTag(g.sport)}</button>`
        )
        .join('') || empty('users', 'Aucun groupe', 'Crée ton premier groupe d’entraînement.');
    b += `<button class="btn full" data-a="newPost" data-k="train">${ic('plus')}Créer un groupe</button>`;
  }
  if (t === 'equipe') {
    const coaches = [
      ...new Set(
        GROUPS.filter(g => g.type === 'train' && g.coach)
          .map(g => g.coach)
          .concat(window.RAM && RAM.live ? Object.keys(RAM.roles || {}).filter(k => RAM.roles[k] === 'coach') : [])
      )
    ].filter(k => M[k]);
    b =
      `<p class="muted small">Qui encadre quel groupe. ${coAll() ? 'Ouvre un groupe pour changer son enseignant.' : 'Le bureau du club répartit les groupes.'}</p>` +
      coaches
        .map(k => {
          const gs = GROUPS.filter(g => g.type === 'train' && g.coach === k),
            h = gs.reduce((a, g) => a + durMin(g.dur), 0) / 60;
          return `<div class="card"><div class="row" style="gap:10px">${av(k, 'sm')}<span class="grow"><span class="nm">${esc(name(k))}</span><br><span class="muted small">${plural(gs.length, 'groupe')} · ${String(Math.round(h * 10) / 10).replace('.', ',')} h par semaine</span></span></div>${gs.map(g => `<button class="item" data-a="open" data-v="cgroupe" data-id="${g.id}"><span class="grow"><span class="nm">${esc(g.name)}</span><br><span class="muted small">${DAYS[g.day]} ${g.h} · ${plural(coStu(g).length, 'élève')}</span></span></button>`).join('')}</div>`;
        })
        .join('');
  }
  if (t === 'stats') b = coStats();
  if (t === 'niveaux')
    b = Object.keys(SCALES)
      .map(
        sp =>
          `<span class="kicker">${SCALES[sp].name}</span>` +
          SCALES[sp].levels
            .map(
              l =>
                `<div class="card"><span class="h3" style="font-size:18px">${l.n} · ${l.t}</span><p class="small"><b>Prérequis :</b> ${l.pre.map(esc).join(' · ')}</p><p class="small"><b>Attendus :</b> ${l.att.map(esc).join(' · ')}</p></div>`
            )
            .join('')
      )
      .join('');
  return (
    segs('coTab', [
      ['groupes', 'Groupes', 'users'],
      ['equipe', 'Équipe', 'school'],
      ['stats', 'Statistiques', 'chart'],
      ['niveaux', 'Niveaux', 'ladder']
    ]) + `<div class="pad">${b}</div>`
  );
}
/* ---------- page d'un groupe vue par l'enseignant ---------- */
function coGroupe(id) {
  const g = grp(id);
  if (!g) return empty('users', 'Groupe introuvable', '');
  const t = tarifOf(g),
    st = coStu(g),
    next = coDates(g, TODAY, isoIn(34)).slice(0, 5),
    c = chans.find(x => x.id === g.id);
  return `<div class="pad"><div class="card"><span class="kicker">${DAYS[g.day]} · ${g.h} · ${g.dur} · ${g.defLoc || 'Extérieur'}</span><span class="h3">${esc(g.name)}</span><div class="cokv"><span class="muted">Enseignant</span><b>${g.coach && M[g.coach] ? esc(name(g.coach)) : 'À choisir'}</b></div><div class="cokv"><span class="muted">Élèves</span><b>${st.length}${g.max ? ' sur ' + g.max + ' places' : ''}</b></div><div class="cokv"><span class="muted">Tarif</span><b>${t.prix ? t.prix + ' € ' + TARIF_MODES[t.mode] : 'Non renseigné'}</b></div><button class="btn sm ghost full" data-a="coGrpEdit" data-id="${g.id}">${ic('edit')}Réglages du groupe</button></div>
${c ? `<button class="item" data-a="open" data-v="chan" data-id="${c.id}"><span class="tile">${ic('chat')}</span><span class="grow"><span class="nm">Discussion du groupe</span><br><span class="muted small">Dans /RAM Club pour les élèves et les parents</span></span></button>` : ''}
<span class="kicker">Prochaines séances · thèmes</span><form id="co-themes" data-id="${g.id}" class="card">${next.map(d => `<div class="fld"><label for="co-t-${d}">${fmtD(d)}${isCx(g, d) ? ' · annulé' : ''}</label><input id="co-t-${d}" data-d="${d}" class="co-t" list="co-thl2" placeholder="Thème" value="${esc((sesFind(g, d) || {}).theme || '')}"></div>`).join('')}<datalist id="co-thl2">${THEMES[g.sport].map(x => `<option value="${esc(x)}">`).join('')}</datalist><button class="btn full">Enregistrer les thèmes</button></form>
<span class="kicker">Élèves</span><div class="card">${st.map(k => `<div class="corow">${coAv(k)}<button class="nm grow" data-a="open" data-v="eleve" data-id="${k}" style="text-align:left">${esc(svName(k))}</button><button class="ib" data-a="coRm" data-g="${g.id}" data-k="${k}" aria-label="Retirer ${esc(svName(k))} du groupe">${ic('x')}</button></div>`).join('') || empty('users', 'Aucun élève', '')}<button class="btn sm full" data-a="coAdd" data-id="${g.id}">${ic('plus')}Ajouter des élèves</button></div></div>`;
}
Object.assign(V, {
  today: coToday,
  planning: coPlanning,
  seance: coSeance,
  eleves: coEleves,
  eleve: coEleve,
  msgs: coMsgs,
  ecole: coEcole,
  cgroupe: coGroupe
});
