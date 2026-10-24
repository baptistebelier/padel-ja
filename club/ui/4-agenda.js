/* /RAM Club — ui/4-agenda.js : Planning et agenda du club : semaine, jour, liste.
   Morceau de l'ancien ui.js : les fichiers ui/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
/* ---------- planning ---------- */
function planItems(iso) {
  const [y, m, d] = iso.split('-').map(Number),
    wd = new Date(y, m - 1, d).getDay(),
    out = [],
    me = ME(),
    mine = x => x === me || (M[me].kids || []).includes(x);
  GROUPS.filter(g => g.type === 'train' && g.day === wd).forEach(g => {
    const cx = (g.cancel || []).includes(iso);
    out.push({
      cat: 'ens',
      sport: g.sport,
      t: g.h,
      dur: g.dur === '1 h' ? 60 : 90,
      sub:
        (cx ? 'Cours annulé · ' : 'Cours · ') +
        g.dur +
        (g.coach ? ' · ' + first(g.coach) : '') +
        (cx ? '' : ' · ' + locOf(g, iso)),
      title: g.name,
      cx,
      v: chans.some(c => c.id === g.id) ? 'chan' : 'grp',
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
        sub: r.comp,
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
        cat: 'ani',
        all: !!p.d2,
        sport: p.sport || '',
        t: p.d2 ? '' : p.h1,
        dur: du > 0 ? du : 120,
        sub: p.d2 ? 'Du ' + fmtD(p.d, 1) + ' au ' + fmtD(p.d2, 1) : p.h1 + ' – ' + p.h2 + ' · ' + p.place,
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
        (S.plan.scope === 'me' ? i.my : !i.priv && (!S.plan.mine || i.my))
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
        sport: y.sport,
        t: y.time,
        dur: hMin(y.dur) || 90,
        sub: `Partie libre · ${y.fmt}${inn ? ' · inscrit' : wt ? ' · liste d’attente' : ''} · ${y.in.length}/${y.places}`,
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
        sub: `${NV_MODE[nv.mode]}${s === 'ok' ? ' · validée' : s === 'wait' ? ' · liste d’attente' : s === 'in' ? ' · inscrit' : ''}${st.win ? '' : ' · en attente de joueurs'}`,
        title:
          nv.mode === 'cours'
            ? nv.theme || 'Séance collective'
            : 'Partie dirigée avec ' + (M[p.by] ? name(p.by) : 'l’enseignant'),
        v: 'post',
        id: p.id,
        my: p.by === me || !!s
      });
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
          sub: `Ton match${nx.court ? ' · ' + nx.court : ''}${nx.vs ? ' · contre ' + nx.vs : ''}`,
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
        sub: `${p.ja.ani ? 'Animation · ' + (p.ja.fmt || '') : 'Tournoi · ' + (p.ja.cat || '')}${inn ? ' · inscrit' : ''}`,
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
        sub: `Bar · ${o.qty} × ${o.name}${o.st === 'servi' ? ' · servi' : ''}`,
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
function eventsView() {
  const ev = posts
    .filter(p => p.kind === 'event' && !p.stage && !p.arch && ruleOk(p.rule))
    .sort((a, b) => (a.d || '').localeCompare(b.d || ''));
  return `<div class="pad">${
    ev.length
      ? ev
          .map(p => {
            const [yy, mm, dd] = (p.d || TODAY).split('-').map(Number),
              sp = postSport(p);
            return `<div class="card"><div class="row" style="align-items:flex-start;gap:12px"><div class="grow"><span class="h3">${p.title}</span><div class="tags" style="display:flex;margin-top:6px">${sp ? sportTag(sp) : postBoth(p) ? sportTag('Tennis') + sportTag('Padel') : ''}${p.done ? '<span class="bd done">Terminé</span>' : ''}</div><p class="muted small" style="margin-top:8px">${p.body}</p></div><span class="dblk"><b>${dd}</b>${MO[mm - 1]}</span></div>${evBox(p)}<button class="btn sm ghost" data-a="pmenu" data-id="${p.id}">${ic('more')}Options</button></div>`;
          })
          .join('')
      : empty('cal', 'Aucun événement à venir', 'Les prochains événements du club apparaîtront ici.')
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
    views = me ? ['next', 'week', 'day'] : ['events', 'week', 'day', 'list'];
  if (!views.includes(P.mode)) P.mode = views[0];
  const LBL = {
    next: ['À venir', 'list'],
    events: ['Événements', 'flag'],
    week: ['Semaine', 'cal'],
    day: ['Jour', 'clock'],
    list: ['Liste', 'list']
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
    modes = scopes + `<div class="chips">${views.map(mode).join('')}</div>`;
  if (P.mode === 'events') return eventsView().replace('<div class="pad">', '<div class="pad" id="plan">' + modes);
  const chip = (g2, k, l, c) =>
    `<button class="chip" data-a="planF" data-g="${g2}" data-k="${k}" aria-pressed="${!!P[g2][k]}">${c ? `<i class="sq ${c}"></i>` : ''}${l}</button>`;
  const item = i =>
    `<button class="pit ${i.cat} ${i.cx ? 'cx' : ''}" data-a="open" data-v="${i.v}" data-id="${i.id}"><i class="sq"></i><span class="tm">${i.t || 'Journée'}</span><span class="grow"><span class="nm">${i.title}</span><br><span class="muted small">${i.sub}</span></span>${sportTag(i.sport)}</button>`;
  const dayBlock = iso => {
    const it = planItems(iso);
    return `<div class="stack"><span class="kicker" ${iso === TODAY ? 'style="color:var(--accent)"' : ''}>${fmtD(iso)}${iso === TODAY ? " · aujourd'hui" : ''}</span>${it.length ? it.map(item).join('') : '<span class="muted small">Rien de prévu</span>'}</div>`;
  };
  const strip = `<div class="wk">${days
    .map(iso => {
      const n = planItems(iso).length,
        [yy, mm, dd] = iso.split('-').map(Number);
      return `<button class="wd ${iso === TODAY ? 'today' : ''}" data-a="planDay" data-d="${iso}" aria-pressed="${byDay && iso === P.d}" aria-label="${fmtD(iso)}"><span>${DA[new Date(yy, mm - 1, dd).getDay()]}</span><b>${dd}</b><i>${n || ''}</i></button>`;
    })
    .join('')}</div>`;
  const filters = `<div class="chips">${me ? '' : `<button class="chip" data-a="planMine" aria-pressed="${!!P.mine}">${ic('user')}Seulement les miens</button>`}${chip('cat', 'ens', 'Cours', 'ens')}${chip('cat', 'jeu', 'Parties', 'jeu')}${chip('cat', 'ani', 'Événements', 'ani')}${chip('cat', 'tour', 'Tournois', 'tour')}${chip('cat', 'eq', 'Équipes', 'eq')}${me ? chip('cat', 'repas', 'Repas', 'repas') : ''}${chip('sp', 'Tennis', 'Tennis')}${chip('sp', 'Padel', 'Padel')}</div>`;
  // « À venir » : les 45 prochains jours, seulement ceux où quelque chose est prévu
  if (P.mode === 'next') {
    const next = Array.from({ length: 45 }, (_, i) => isoIn(i, TODAY)).filter(iso => planItems(iso).length);
    return `<div class="pad" id="plan">${modes}${filters}${next.length ? next.map(dayBlock).join('') : empty('cal', 'Rien de prévu', 'Inscris-toi à une partie, un cours, un événement ou un tournoi : tout ce où tu te positionnes apparaît ici.')}</div>`;
  }
  return `<div class="pad" id="plan">${modes}<div class="row" style="justify-content:space-between"><button class="ib rnd" data-a="planNav" data-n="-1" aria-label="${byDay ? 'Jour précédent' : 'Semaine précédente'}">${ic('back')}</button><span class="h3">${byDay ? fmtD(P.d) : 'Du ' + fmtD(days[0], 1) + ' au ' + fmtD(days[6], 1)}</span><button class="ib rnd" style="rotate:180deg" data-a="planNav" data-n="1" aria-label="${byDay ? 'Jour suivant' : 'Semaine suivante'}">${ic('back')}</button></div>
 ${filters}
 ${P.mode === 'week' ? planGrid(days, false) + '<p class="muted small">Touche un bloc pour l\'ouvrir, un jour pour voir son détail. Glisse à gauche ou à droite pour changer de semaine.</p>' : byDay ? strip + planGrid([P.d], true) : strip + days.map(dayBlock).join('')}</div>`;
}
