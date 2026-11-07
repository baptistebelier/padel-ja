/* /RAM Club — ui/4-agenda.js : Planning et agenda du club : semaine, jour, liste.
   Morceau de l'ancien ui.js : les fichiers ui/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
/* ---------- planning ---------- */
/* l'agenda du club : ce que le club organise (événements, stages, animations, tournois, rencontres d'équipes) ;
   cours, séances collectives et parties dirigées sont dans « Mon agenda » de ceux qui y participent */
const CLUB_CATS = ['ani', 'tour', 'eq'];
function planItems(iso) {
  const [y, m, d] = iso.split('-').map(Number),
    wd = new Date(y, m - 1, d).getDay(),
    out = [],
    me = ME(),
    mine = x => x === me || (M[me].kids || []).includes(x);
  GROUPS.filter(g => g.type === 'train' && trainOn(g, iso)).forEach(g => {
    const cx = (g.cancel || []).includes(iso);
    out.push({
      cat: 'ens',
      sport: g.sport,
      t: g.h,
      dur: typeof durMin === 'function' ? durMin(g.dur) : g.dur === '1 h' ? 60 : 90,
      lines: [g.coach && ['user', first(g.coach)], ['clock', g.dur]],
      // les élèves sans compte /RAM Club (ajoutés dans /RAM Coach) comptent aussi
      tg0: cx ? evCx('Cours annulé') : evLoc(locOf(g, iso)),
      tg1:
        cx || !(g.mem.length + (g.ext || []).length)
          ? ''
          : evTag(
              g.mem.length +
                (g.ext || []).length +
                (g.max ? '/' + g.max : '') +
                ' élève' +
                (g.mem.length + (g.ext || []).length > 1 ? 's' : '')
            ),
      title: g.name,
      cx,
      v: chans.some(c => c.id === g.id && chanOk(c)) ? 'chan' : seesMinors() ? 'grp' : 'ginfo',
      id: g.id,
      my: g.mem.some(mine) || g.coach === me
    });
  });
  recs
    .filter(r => r.d === iso && !r.arch)
    .forEach(r => {
      const g = grp(r.tid);
      out.push({
        cat: 'eq',
        sport: recSport(r),
        t: r.h,
        dur: 240,
        lines: [['trophy', r.comp]],
        title: teamName(g) + ' – ' + r.opp,
        v: 'rec',
        id: r.id,
        my: g.mem.some(mine)
      });
    });
  posts
    .filter(p => p.kind === 'event' && !p.arch && p.d && iso >= p.d && iso <= (p.d2 || p.d) && ruleOk(p.rule))
    .forEach(p => {
      const du = hMin(p.h2) - hMin(p.h1);
      out.push({
        cat: p.trn ? 'tour' : 'ani',
        all: !!p.d2,
        sport: p.sport || '',
        t: p.d2 ? '' : p.h1,
        t2: p.d2 ? '' : p.h2,
        dur: du > 0 ? du : 120,
        kind: p.stage ? 'Stage' : p.anim ? 'Animation' : p.trn ? 'Tournoi' : '',
        pic: p.stage ? 'racket' : p.anim ? 'users' : '',
        lines: [
          p.d2 ? ['cal', 'Du ' + fmtD(p.d, 1) + ' au ' + fmtD(p.d2, 1)] : ['clock', p.h1 + ' – ' + p.h2],
          p.place && ['pin', p.place],
          typeof ensTxt === 'function' && ensTxt(p) && ['user', 'Avec ' + ensTxt(p)]
        ],
        // tarif toujours visible ; déroulé du stage dépliable sous la carte
        tg1: typeof prixTxt === 'function' && prixTxt(p) ? evTag(prixTxt(p)) : '',
        foot: typeof dlBlock === 'function' ? dlBlock(p) : '',
        title: p.title.replace(/<[^>]+>/g, ''),
        v: 'post',
        id: p.id,
        my: p.by === me || p.my === 'yes' || p.my === 'wait' || (p.vol || []).includes(me)
      });
    });
  planMore(iso, out, me, mine);
  return out
    .filter(
      i =>
        S.plan.cat[i.cat] !== 0 &&
        S.plan.cat[i.cat] !== false &&
        (!i.sport || S.plan.sp[i.sport]) &&
        (i.v !== 'grp' || seesMinors()) &&
        (S.plan.scope === 'me' ? i.my : CLUB_CATS.includes(i.cat) && !i.priv && (!S.plan.mine || i.my))
    )
    .sort((a, b) => hMin(a.t) - hMin(b.t));
}
/* tout ce où l'on se positionne, en plus des cours, rencontres et événements : parties libres, parties dirigées,
   séances collectives, tournois et animations /RAM JA, repas réservés au bar */
const hhmm = t => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? +m[1] + ' h' + (m[2] !== '00' ? ' ' + m[2] : '') : t || '';
};
function planMore(iso, out, me, mine) {
  const keys = [me, ...((M[me] && M[me].kids) || [])];
  posts.forEach(p => {
    if (p.arch || !canSee(p)) return;
    // partie libre (« Chercher une partie »)
    if (p.kind === 'play' && p.play && p.play.d === iso) {
      const y = p.play,
        inn = y.in.some(mine),
        wt = y.wait.some(mine);
      out.push({
        cat: 'jeu',
        priv: true, // partie d'un adhérent : dans son agenda et celui des inscrits, pas dans l'agenda du club
        sport: y.sport,
        t: y.time,
        dur: hMin(y.dur) || 90,
        lines: [
          ['clock', y.dur],
          ['users', `${y.fmt} · ${y.in.length}/${y.places}`]
        ],
        tg1: inn ? evTag('Inscrit') : wt ? evTag('Liste d’attente') : '',
        title: `Partie ${y.fmt.toLowerCase()} de ${first(p.by)}`,
        v: 'post',
        id: p.id,
        my: p.by === me || inn || wt
      });
    }
    // partie dirigée, séance collective : une ligne par date
    if (p.kind === 'niveaux' && p.nv && (p.nv.dates || []).includes(iso)) {
      const nv = p.nv,
        st = nvState(nv, iso),
        mineK = Object.keys(st.status).find(k => keys.includes(k.split('|')[1])),
        s = mineK && st.status[mineK];
      out.push({
        cat: nv.mode === 'cours' ? 'ens' : 'jeu',
        sport: nv.sport,
        t: nv.time,
        dur: hMin(nv.dur) || 90,
        kind: NV_MODE[nv.mode],
        lines: [['clock', nv.dur]],
        tg1:
          (s === 'ok'
            ? evTag('Validée')
            : s === 'wait'
              ? evTag('Liste d’attente')
              : s === 'in'
                ? evTag('Inscrit')
                : '') +
          (st.win ? '' : evTag('En attente de joueurs')) +
          (nv.price ? evTag(nv.price) : ''),
        title:
          nv.mode === 'cours'
            ? nv.theme || 'Séance collective'
            : 'Partie dirigée avec ' + (M[p.by] ? name(p.by) : 'l’enseignant'),
        v: 'post',
        id: p.id,
        my: p.by === me || !!s
      });
    }
    // tournoi interne : à son premier jour, et le jour limite de mon match
    if (p.kind === 'jaint' && p.ja && typeof intMoi === 'function') {
      const J = p.ja,
        moi = intMoi(J);
      if (p.d === iso)
        out.push({
          cat: 'tour',
          sport: p.sport || '',
          all: true,
          t: '',
          kind: 'Tournoi interne',
          lines: [['users', (J.players || []).length + ' participants']],
          title: p.title,
          v: 'post',
          id: p.id,
          my: moi.length > 0
        });
      moi.forEach(pj => {
        const m = intMonMatch(J, pj);
        if (!m || intEtat(m) !== 'ready' || ((J.tours || [])[m.r] || {}).fin !== iso) return;
        out.push({
          cat: 'tour',
          sport: p.sport || '',
          all: true,
          t: '',
          kind: 'Date limite',
          lines: [['users', 'Contre ' + intNom(J, m.a === pj.id ? m.b : m.a)]],
          title: p.title,
          v: 'post',
          id: p.id,
          my: true
        });
      });
      return;
    }
    // tournoi ou animation /RAM JA
    if (p.kind === 'jatour' && p.ja && p.d && iso >= p.d && iso <= (p.d2 || p.d)) {
      const inn = (p.ja.list || []).some(x => keys.includes(x.k1) || keys.includes(x.k2));
      // mon match programmé ce jour-là : à son heure, avec terrain et adversaires
      const row = (p.ja.list || []).find(x => keys.includes(x.k1) || keys.includes(x.k2)),
        nx = row && row.next;
      if (nx && !nx.live && new Date(nx.at).toDateString() === new Date(iso + 'T12:00').toDateString()) {
        out.push({
          cat: 'tour',
          sport: p.sport || 'Padel',
          t: jaHour(nx.at),
          dur: 90,
          kind: 'Ton match',
          lines: [nx.court && ['pin', nx.court], nx.vs && ['users', 'Contre ' + nx.vs]],
          title: p.title,
          v: 'post',
          id: p.id,
          my: true
        });
        return;
      }
      out.push({
        cat: 'tour',
        all: !!p.d2 || !p.ja.time,
        sport: p.sport || 'Padel',
        t: hhmm(p.ja.time),
        dur: p.ja.ani ? 180 : 480,
        kind: p.ja.ani ? 'Animation' : 'Tournoi',
        pic: p.ja.ani ? 'users' : '',
        lines: [(p.ja.ani ? p.ja.fmt : p.ja.cat) && ['flag', p.ja.ani ? p.ja.fmt : p.ja.cat]],
        tg1: inn ? evTag('Inscrit') : '',
        title: p.title,
        v: 'post',
        id: p.id,
        my: inn
      });
    }
  });
  // repas réservés au bar (privés : seulement dans « Mon agenda »)
  if (typeof ORDERS !== 'undefined')
    ORDERS.filter(o => o.date === iso && o.st !== 'annule' && keys.includes(o.by)).forEach(o =>
      out.push({
        cat: 'repas',
        t: o.moment === 'soir' ? '19 h 30' : '12 h',
        dur: 60,
        lines: [['cRepas', `${o.qty} × ${o.name}`]],
        tg1: o.st === 'servi' ? evTag('Servi') : '',
        title: o.moment === 'soir' ? 'Repas du soir' : 'Repas du midi',
        v: 'barday',
        id: o.date,
        my: true,
        priv: true
      })
    );
}
function planGrid(days, detail) {
  const H0 = 8,
    H1 = 23,
    ph = detail ? 48 : 26,
    hours = [];
  for (let h = H0; h < H1; h++) hours.push(h);
  const col = iso => {
    const its = planItems(iso).filter(i => !i.all),
      lanes = [];
    its.forEach(i => {
      const s = hMin(i.t),
        e = s + i.dur;
      let l = lanes.findIndex(end => end <= s);
      if (l < 0) {
        l = lanes.length;
        lanes.push(e);
      } else lanes[l] = e;
      i.l = l;
    });
    const n = lanes.length || 1;
    return `<div class="gcol" style="height:${(H1 - H0) * ph}px">${its
      .map(i => {
        const top = Math.max(0, (hMin(i.t) / 60 - H0) * ph),
          hh = Math.max((i.dur / 60) * ph, detail ? 34 : 12);
        return `<button class="gev ${i.cat} ${i.cx ? 'cx' : ''}" style="top:${top}px;height:${hh}px;left:${(i.l * 100) / n}%;width:${100 / n}%" data-a="open" data-v="${i.v}" data-id="${i.id}" aria-label="${i.t} ${esc(i.title)}">${detail ? `<b>${i.t}</b>${i.title}` : `<span class="gt">${(i.t || '').replace(/ h ?/, 'h')}</span>`}</button>`;
      })
      .join('')}</div>`;
  };
  const all = iso =>
    planItems(iso)
      .filter(i => i.all)
      .map(
        i =>
          `<button class="gall ${i.cat}" data-a="open" data-v="${i.v}" data-id="${i.id}" aria-label="${esc(i.title)}">${detail ? i.title : ''}</button>`
      )
      .join('');
  return `<div class="grid ${detail ? 'detail' : ''}" style="--n:${days.length}"><div class="ghead"><span></span>${days
    .map(iso => {
      const [yy, mm, dd] = iso.split('-').map(Number);
      return `<button class="gday ${iso === TODAY ? 'today' : ''}" data-a="planDay" data-d="${iso}" aria-label="${fmtD(iso)}">${DA[new Date(yy, mm - 1, dd).getDay()]}<b>${dd}</b></button>`;
    })
    .join('')}</div>
 <div class="gallrow"><span></span>${days.map(iso => `<div>${all(iso)}</div>`).join('')}</div><div class="gbody"><div class="ghours">${hours.map(h => `<span>${h} h</span>`).join('')}</div>${days.map(col).join('')}</div></div>`;
}
/* Agenda : planning du club + tout ce qui était dans « École » (cours, stages, gestion des groupes), avec des filtres en haut */
/* Agenda : le planning du club (événements, semaine, jour, liste) */
function agendaView() {
  return planView();
}
I.filter = '<path d="M4 6h16M7 12h10M10 18h4"/>';
Object.assign(I, {
  cCours: '<path d="M3 9l9-5 9 5-9 5z"/><path d="M7 12v5c3 2 7 2 10 0v-5"/>',
  cTour: '<path d="M7 4h10v6a5 5 0 01-10 0zM7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3M12 15v4M8 20h8"/>',
  cRepas: '<path d="M7 3v8M4 3v5a3 3 0 006 0V3M7 11v10M17 3c-2 2-3 5-3 8h3v10"/>'
});
/* les types de l'agenda : leur couleur (carré) et leur pictogramme */
const PLAN_CATS = [
  ['ens', 'Cours', 'cCours'],
  ['jeu', 'Parties', 'ball'],
  ['ani', 'Événements', 'cal'],
  ['tour', 'Tournois', 'cTour'],
  ['eq', 'Équipes', 'users'],
  ['repas', 'Repas', 'cRepas']
];
/* rappel des couleurs, au-dessus de la semaine */
const planCatsOf = () => PLAN_CATS.filter(x => (S.plan.scope === 'me' ? true : CLUB_CATS.includes(x[0])));
const planLegend = () =>
  `<div class="pllegend" aria-label="Couleurs de l'agenda">${planCatsOf()
    .filter(x => S.plan.cat[x[0]])
    .map(x => `<span><i class="sq ${x[0]}"></i>${ic(x[2])}${x[1]}</span>`)
    .join('')}</div>`;
/* filtres de l'agenda : nombre de filtres actifs (types masqués, sport masqué, « seulement les miens ») */
function planFilterCount() {
  const P = S.plan,
    cats = planCatsOf().map(x => x[0]);
  return (
    cats.filter(k => !P.cat[k]).length +
    ['Tennis', 'Padel'].filter(k => !P.sp[k]).length +
    (P.scope !== 'me' && P.mine ? 1 : 0)
  );
}
/* panneau des filtres (monte du bas de l'écran) */
function planFiltersBody() {
  const P = S.plan,
    me = P.scope === 'me',
    // filtre actif : contour épais et coche, la couleur du type reste visible
    chip = (g, k, l, c, i) =>
      `<button class="chip plf" data-a="planF" data-g="${g}" data-k="${k}" aria-pressed="${!!P[g][k]}">${c ? `<i class="sq ${c}"></i>` : ''}${i ? ic(i) : ''}${l}${P[g][k] ? ic('check') : ''}</button>`;
  return `<div class="body">${me ? '' : `<span class="kicker">Afficher</span><div class="chips wrap"><button class="chip" data-a="planMine" aria-pressed="${!!P.mine}">${ic('user')}Seulement les miens</button></div>`}
 <span class="kicker">Types</span><div class="chips wrap">${planCatsOf()
   .map(x => chip('cat', x[0], x[1], x[0], x[2]))
   .join('')}</div>
 <span class="kicker">Sports</span><div class="chips wrap">${chip('sp', 'Tennis', 'Tennis')}${chip('sp', 'Padel', 'Padel')}</div>
 <div class="ctl"><button class="btn ghost grow" data-a="planReset">Tout afficher</button><button class="btn grow" data-a="close">Voir l’agenda</button></div></div>`;
}
/* les vues Événements et Liste : la carte commune (ui/1-briques.js), sous l'étiquette du jour */
const PLAN_KIND = { jeu: 'Partie', ani: 'Événement', tour: 'Tournoi', eq: 'Rencontre', repas: 'Repas' };
/* dt : la date affichée en grand dans la pastille (liste d'événements promue sur le mur) */
const planCard = (i, dt) =>
  evCard({
    cat: i.cat,
    pic: i.pic,
    t: i.all ? '' : i.t,
    // heure de fin : celle de l'événement, sinon calculée depuis la durée (pas pour une rencontre, dont la fin n'est pas connue)
    t2: i.all ? '' : i.t2 !== undefined ? i.t2 : i.cat === 'eq' ? '' : hFin(i.t, i.dur),
    dt,
    cx: i.cx,
    go: `data-a="open" data-v="${i.v}" data-id="${i.id}"`,
    title: i.title,
    lines: i.lines,
    tags:
      (i.tg0 || '') +
      (i.kind || PLAN_KIND[i.cat] ? evTag(i.kind || PLAN_KIND[i.cat]) : '') +
      sportTag(i.sport) +
      (i.tg1 || ''),
    foot: i.foot || ''
  });
/* Événements de l'agenda du club : ce qu'organise le club (événements, stages, animations,
   tournois du club, tournois et animations /RAM JA, rencontres d'équipes),
   à venir sur 4 mois, une seule fois chacun (un stage sur plusieurs jours apparaît à son premier jour) */
function eventsView() {
  const me = S.plan.scope === 'me',
    seen = new Set(),
    days = [];
  for (let n = 0; n < (me ? 60 : 120); n++) {
    const iso = isoIn(n, TODAY),
      // mon agenda : tout ce où je suis positionné (cours, rencontres, repas compris), chaque jour ;
      // agenda du club : ce qui est publié sur le mur, une fois chacun
      l = planItems(iso).filter(i =>
        me ? !seen.has(i.v + i.id + iso) : (i.v === 'post' || i.v === 'rec') && !seen.has(i.id)
      );
    l.forEach(i => seen.add(me ? i.v + i.id + iso : i.id));
    if (l.length) days.push([iso, l]);
  }
  // une colonne par jour : les jours sans rien restent, au moins une semaine et jusqu'au dernier événement
  const fin = days.length ? days[days.length - 1][0] : TODAY,
    cols = [];
  for (let n = 0, iso = TODAY; n < 7 || iso <= fin; n++, iso = isoIn(n, TODAY))
    cols.push([iso, (days.find(x => x[0] === iso) || [iso, []])[1]]);
  return `<div class="pad">${
    days.length
      ? `${!me && typeof promoBar === 'function' ? promoBar() : ''}<div class="plk">${cols.map(([iso, l]) => evDay(iso, l.map(i => (!me && typeof promoCard === 'function' ? promoCard(i, iso, planCard(i)) : planCard(i))).join('') || '<span class="muted small plc-v">Rien de prévu</span>', l.length ? '' : 'vide')).join('')}</div>`
      : me
        ? empty(
            'cal',
            'Rien de prévu',
            'Inscris-toi à une partie, un cours, un événement ou un tournoi : tout ce où tu te positionnes apparaît ici.'
          )
        : empty(
            'cal',
            'Aucun événement à venir',
            'Les événements, stages, animations, tournois et rencontres du club apparaîtront ici.'
          )
  }</div>`;
}
function myTeamsView() {
  const me = ME(),
    who = [me, ...(M[me].kids || [])],
    ts = GROUPS.filter(g => g.type === 'team' && (g.cap === me || g.mem.some(x => who.includes(x)))),
    ids = ts.map(g => g.id);
  const up = recs.filter(r => !r.arch && ids.includes(r.tid) && r.st !== 'done').sort((a, b) => a.d.localeCompare(b.d)),
    past = recs.filter(r => !r.arch && ids.includes(r.tid) && r.st === 'done').sort((a, b) => b.d.localeCompare(a.d));
  return `<div class="pad">${ts.length ? `<span class="kicker">À venir et en direct</span>${up.length ? up.map(recCard).join('') : '<span class="muted small">Aucune rencontre programmée.</span>'}${past.length ? `<span class="kicker">Déjà jouées</span>${past.map(recCard).join('')}` : ''}<span class="kicker">Mes équipes</span>${ts.map(g => `<button class="item" data-a="open" data-v="team" data-id="${g.id}"><span class="tile">${ic('users')}</span><span class="grow"><span class="nm">${teamName(g)}</span><br><span class="muted small">${g.sub}${g.cap ? ' · capitaine ' + first(g.cap) : ''}</span></span></button>`).join('')}` : empty('users', 'Aucune équipe', "Tu ne fais partie d'aucune équipe cette saison. Les équipes du club sont dans Club, Équipes.")}</div>`;
}
function planView() {
  const P = S.plan;
  const [y, m, d] = P.d.split('-').map(Number),
    mon = isoIn(-((new Date(y, m - 1, d).getDay() + 6) % 7), P.d),
    days = [0, 1, 2, 3, 4, 5, 6].map(i => isoIn(i, mon)),
    byDay = P.mode === 'day';
  // deux agendas : le mien (tout ce où je me suis positionné) et celui du club ; chacun avec ses vues
  const me = P.scope === 'me',
    views = ['events', 'week', 'day'];
  if (!views.includes(P.mode)) P.mode = views[0];
  const LBL = {
    next: ['À venir', 'list'],
    events: ['Événements', 'flag'],
    week: ['Semaine', 'cal'],
    day: ['Jour', 'clock']
  };
  const mode = k =>
      `<button class="chip" data-a="planMode" data-m="${k}" aria-pressed="${P.mode === k}">${ic(LBL[k][1])}${LBL[k][0]}</button>`,
    scopes = `<div class="chips plan-scope">${[
      ['me', 'Mon agenda', 'user'],
      ['club', 'Agenda du club', 'club']
    ]
      .map(
        ([k, l, i]) =>
          `<button class="chip" data-a="planScope" data-k="${k}" aria-pressed="${P.scope === k}">${ic(i)}${l}</button>`
      )
      .join('')}</div>`,
    nf = planFilterCount(),
    modes =
      scopes +
      `<div class="chips plan-modes">${views.map(mode).join('')}<button class="chip fbtn" data-a="planFilters" aria-pressed="${nf > 0}" aria-label="Filtres${nf ? ', ' + nf + ' actifs' : ''}">${ic('filter')}<span class="fbl">Filtres</span>${nf ? `<span class="cnt">${nf}</span>` : ''}</button></div>`;
  if (P.mode === 'events') return eventsView().replace('<div class="pad">', '<div class="pad" id="plan">' + modes);
  const chip = (g2, k, l, c) =>
    `<button class="chip" data-a="planF" data-g="${g2}" data-k="${k}" aria-pressed="${!!P[g2][k]}">${c ? `<i class="sq ${c}"></i>` : ''}${l}</button>`;
  const strip = `<div class="wk">${days
    .map(iso => {
      const n = planItems(iso).length,
        [yy, mm, dd] = iso.split('-').map(Number);
      return `<button class="wd ${iso === TODAY ? 'today' : ''}" data-a="planDay" data-d="${iso}" aria-pressed="${byDay && iso === P.d}" aria-label="${fmtD(iso)}"><span>${DA[new Date(yy, mm - 1, dd).getDay()]}</span><b>${dd}</b><i>${n || ''}</i></button>`;
    })
    .join('')}</div>`;
  return `<div class="pad" id="plan">${modes}<div class="row" style="justify-content:space-between"><button class="ib rnd" data-a="planNav" data-n="-1" aria-label="${byDay ? 'Jour précédent' : 'Semaine précédente'}">${ic('back')}</button><span class="h3">${byDay ? fmtD(P.d) : 'Du ' + fmtD(days[0], 1) + ' au ' + fmtD(days[6], 1)}</span><button class="ib rnd" style="rotate:180deg" data-a="planNav" data-n="1" aria-label="${byDay ? 'Jour suivant' : 'Semaine suivante'}">${ic('back')}</button></div>
 ${P.mode === 'week' ? planLegend() + planGrid(days, false) + '<p class="muted small">Touche un bloc pour l\'ouvrir, un jour pour voir son détail. Glisse à gauche ou à droite pour changer de semaine.</p>' : strip + planGrid([P.d], true)}</div>`;
}
