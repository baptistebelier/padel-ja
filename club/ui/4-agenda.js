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
        my: true
      });
    });
  return out
    .filter(
      i =>
        S.plan.cat[i.cat] &&
        (!i.sport || S.plan.sp[i.sport]) &&
        (i.v !== 'grp' || seesMinors()) &&
        (!S.plan.mine || i.my)
    )
    .sort((a, b) => hMin(a.t) - hMin(b.t));
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
            return `<div class="card"><div class="row" style="align-items:flex-start;gap:12px"><div class="grow"><span class="h3">${p.title}</span><div class="tags" style="display:flex;margin-top:6px">${sportTag(sp)}${p.done ? '<span class="bd done">Terminé</span>' : ''}</div><p class="muted small" style="margin-top:8px">${p.body}</p></div><span class="dblk"><b>${dd}</b>${MO[mm - 1]}</span></div>${evBox(p)}<button class="btn sm ghost" data-a="pmenu" data-id="${p.id}">${ic('more')}Options</button></div>`;
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
  const mode = (k, l, i) =>
      `<button class="chip" data-a="planMode" data-m="${k}" aria-pressed="${P.mode === k}">${ic(i)}${l}</button>`,
    modes = `<div class="chips">${mode('events', 'Événements', 'flag')}${mode('week', 'Semaine', 'cal')}${mode('day', 'Jour', 'clock')}${mode('list', 'Liste', 'list')}</div>`;
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
  return `<div class="pad" id="plan">${modes}<div class="row" style="justify-content:space-between"><button class="ib rnd" data-a="planNav" data-n="-1" aria-label="${byDay ? 'Jour précédent' : 'Semaine précédente'}">${ic('back')}</button><span class="h3">${byDay ? fmtD(P.d) : 'Du ' + fmtD(days[0], 1) + ' au ' + fmtD(days[6], 1)}</span><button class="ib rnd" style="rotate:180deg" data-a="planNav" data-n="1" aria-label="${byDay ? 'Jour suivant' : 'Semaine suivante'}">${ic('back')}</button></div>
 <div class="chips"><button class="chip" data-a="planMine" aria-pressed="${!!P.mine}">${ic('user')}Mes groupes et équipes</button>${chip('cat', 'ens', 'Enseignement', 'ens')}${chip('cat', 'ani', 'Animation', 'ani')}${chip('cat', 'eq', 'Équipes', 'eq')}${chip('sp', 'Tennis', 'Tennis')}${chip('sp', 'Padel', 'Padel')}</div>
 ${P.mode === 'week' ? planGrid(days, false) + '<p class="muted small">Touche un bloc pour l\'ouvrir, un jour pour voir son détail. Glisse à gauche ou à droite pour changer de semaine.</p>' : byDay ? strip + planGrid([P.d], true) : strip + days.map(dayBlock).join('')}</div>`;
}

