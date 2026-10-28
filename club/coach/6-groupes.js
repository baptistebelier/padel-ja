/* /RAM Coach — coach/6-groupes.js : ce qui se fait depuis un groupe d'enseignement, et deux outils de l'accueil.
   - Programmer des séances : un pack, un cycle, un abonnement ou une formule à la séance donne le nombre de séances
     et le tarif ; les dates se règlent une par une (déplacer, retirer, ajouter). Les dates hors du créneau du groupe
     sont rangées dans g.extra, celles qu'on retire dans g.skip (comme une séance déplacée, data.js trainOn) ; un
     pack ou un cycle s'arrête après sa dernière date (g.to). Les séances apparaissent aussitôt dans le planning,
     l'Agenda et l'École de /RAM Club.
   - La discussion du groupe dans /RAM Club : la créer si elle manque (la supprimer : app/14-discussions.js).
   - Messages : conversations et groupes favoris, épinglés en haut (sur cet appareil).
   - Accueil : bilans à écrire sélectionnés comme des mails, puis retirés d'un coup (séance marquée « sans bilan »,
     brouillon effacé). */

/* ---------- favoris des Messages ---------- */
function coFavs() {
  if (!S.coFav) {
    try {
      S.coFav = JSON.parse(localStorage.getItem('coach-favs') || '[]');
    } catch (e) {
      S.coFav = [];
    }
  }
  return S.coFav;
}
const coIsFav = k => coFavs().includes(k);
/* une ligne de conversation avec son étoile : la ligne ouvre la conversation, l'étoile l'épingle en haut */
const coFavRow = (k, open, inner, label) =>
  `<div class="item cofr${coIsFav(k) ? ' fav' : ''}"><button class="cofav" ${open}>${inner}</button><button class="ib costar" data-a="coFav" data-k="${k}" aria-pressed="${coIsFav(k)}" aria-label="${coIsFav(k) ? 'Retirer ' + esc(label) + ' des favoris' : 'Mettre ' + esc(label) + ' en favori'}">${ic('star')}</button></div>`;

/* ---------- accueil : sélection des bilans à écrire ---------- */
function coSelBar() {
  const all = S.coBil || [],
    pick = (S.coPick || []).filter(id => all.includes(id)),
    every = all.length && pick.length === all.length;
  return `<div class="card cosbar"><button class="item cosel" data-a="coPickAll" aria-pressed="${!!every}"><span class="cochk" aria-hidden="true">${ic('check')}</span><span class="grow"><span class="nm">Tout sélectionner</span><br><span class="muted small">${pick.length ? plural(pick.length, 'bilan sélectionné', 'bilans sélectionnés') : 'Touche les bilans à retirer'}</span></span></button><button class="btn sm hot full" data-a="coPickDel" ${pick.length ? '' : 'disabled'}>${ic('trash')}Retirer des bilans à traiter</button><p class="muted small">Une séance retirée ne demande plus de bilan ; un brouillon retiré est effacé. Rien n'est envoyé aux élèves.</p></div>`;
}

/* ---------- formule d'un groupe : ce qu'il suit et où il en est ---------- */
function coGrpOffer(g) {
  if (!g.offre || typeof ofLabel !== 'function') return '';
  const [t, ref] = g.offre.split(':'),
    pk = t === 'pack' ? OFFRES.packs.find(p => p.id === ref) : null,
    done = coDates(g, g.from || isoIn(-365), TODAY).filter(d => !isCx(g, d)).length,
    left = coDates(g, isoIn(1), g.to || isoIn(180)).length;
  return `<div class="cokv"><span class="muted">Formule</span><b>${esc(ofLabel(t, ref))}</b></div>${pk ? `<div class="cokv"><span class="muted">Avancement</span><b>${Math.min(done, pk.seances)} sur ${pk.seances} séances${left ? ' · ' + left + ' à venir' : ''}</b></div>` : ''}`;
}

/* ---------- périodes sans cours (vacances scolaires, fermeture du club…) ----------
   g.off = [{ nom, du, au }] : le créneau du groupe ne donne pas de séance ces jours-là (data.js trainOn) ;
   une séance ajoutée à la main pendant une période (g.extra) a lieu quand même */
function coOffHtml(g) {
  if (g.once) return '';
  const l = (g.off || []).slice().sort((a, b) => a.du.localeCompare(b.du)),
    past = o => o.au < TODAY;
  return `${hd('Périodes sans cours', `<button class="chip" data-a="coOffAdd" data-id="${g.id}">${ic('plus')}Ajouter</button>`)}${
    l.length
      ? list(
          l
            .map(
              o =>
                `<div class="item"><span class="tile">${ic('cal')}</span><span class="grow${past(o) ? ' muted' : ''}"><span class="nm">${esc(o.nom || 'Pas de cours')}</span><br><span class="muted small">Du ${fmtD(o.du)} au ${fmtD(o.au)}</span></span><button class="ib" data-a="coOffDel" data-id="${g.id}" data-du="${o.du}" data-au="${o.au}" aria-label="Retirer la période ${esc(o.nom || '')}">${ic('x')}</button></div>`
            )
            .join('')
        )
      : `<div class="card"><p class="muted small">Vacances scolaires, fermeture du club : pendant ces périodes, le créneau du groupe ne donne pas de séance.</p></div>`
  }`;
}

/* ---------- lieu : en salle par défaut, un interrupteur pour la saison en extérieur ----------
   g.defLoc : lieu des prochaines séances ; g.loc[date] : un jour précis (« Passer en salle » s'il pleut).
   g.locPref : le lieu a été choisi par l'enseignant. Les groupes créés avant la règle « en salle par défaut »
   (où « Extérieur » n'était qu'une valeur par défaut) passent une fois en salle (coLocInit). */
const coLocTg = g => {
  const out = g.defLoc === 'Extérieur';
  return `<div class="cokv"><span class="muted">${out ? 'Saison en extérieur · « Passer en salle » s’il pleut' : 'En salle · saison en extérieur au printemps'}</span><span class="cocyc"><span class="muted small">Extérieur</span><button class="tg" role="switch" aria-checked="${out}" data-a="coLocSeason" data-id="${g.id}" aria-label="${esc(g.name)} : ${out ? 'repasser en salle' : 'passer la saison en extérieur'}"></button></span></div>`;
};
function coLocInit() {
  coGroups('', true).forEach(g => {
    if (g.locPref || g.old) return;
    if (g.defLoc !== 'En salle') g.defLoc = 'En salle';
    g.locPref = 1;
  });
}

/* ---------- reporter une séance, ou changer la date d'une seule ----------
   Reporter : la séance glisse à l'occurrence suivante du groupe (une semaine, deux pour un groupe une semaine sur
   deux, en sautant les périodes sans cours) et toutes les suivantes glissent avec elle, thèmes compris : la suite
   des thèmes prévus est gardée ; un cycle ou un pack se termine une occurrence plus tard.
   Changer la date : seule cette séance change de jour (avec son thème, son appel et son bilan). */
/* prochaine occurrence du créneau après une date, sans tenir compte de la fin du cycle */
function coNextOcc(g, after) {
  const free = Object.assign({}, g, { to: null });
  for (let i = 1; i <= 120; i++) {
    const d = isoIn(i, after);
    if (trainOn(free, d) && !(g.extra || []).includes(d)) return d;
  }
  return isoIn(7 * (g.every || 1), after);
}
/* une séance (thème, appel, bilan) passe d'une date à une autre */
function coSesMove(g, from, to) {
  const s = SEANCES.find(x => x.id === g.id + '.' + from && (x._club || '') === (g._club || ''));
  if (!s) return;
  const t = sesGet(g.id + '.' + to);
  Object.keys(s).forEach(k => !['id', 'g', 'd', '_club'].includes(k) && (t[k] = s[k]));
  SEANCES.splice(SEANCES.indexOf(s), 1);
}
/* une date du groupe disparaît, une autre apparaît (séance déplacée : skip et extra, comme data.js trainOn) */
function coDateOff(g, d) {
  if ((g.extra || []).includes(d)) g.extra = g.extra.filter(x => x !== d);
  if (trainOn(g, d)) g.skip = (g.skip || []).concat(d);
}
function coDateOn(g, d) {
  g.skip = (g.skip || []).filter(x => x !== d);
  if (!trainOn(g, d)) g.extra = (g.extra || []).concat(d).sort();
}

/* ---------- Programmer des séances ---------- */
/* les dates proposées : à partir d'une date, chaque semaine ou une semaine sur deux */
function coPlanDates(start, n, step, off) {
  const out = [],
    shut = d => (off || []).some(o => d >= o.du && d <= o.au);
  for (let d = start, k = 0; out.length < Math.min(n, 60) && k < 200; d = isoIn(step, d), k++)
    if (!shut(d)) out.push(d);
  return out;
}
/* première date utile : la prochaine séance du créneau du groupe */
function coPlanStart(g) {
  for (let i = 1; i < 15; i++) if (trainOn(g, isoIn(i)) && !(g.to && isoIn(i) > g.to)) return isoIn(i);
  for (let i = 1; i < 8; i++) if (coDow(isoIn(i)) === g.day) return isoIn(i);
  return isoIn(1);
}
/* nombre de séances et tarif d'un produit (formule, pack, abonnement) */
function coPlanOf(v) {
  const [t, ref] = String(v || '').split(':');
  if (t === 'pack') {
    const p = OFFRES.packs.find(x => x.id === ref);
    return p ? { n: p.seances, tarif: { mode: 'eleve', prix: Math.round((p.prix / p.seances) * 100) / 100 } } : {};
  }
  if (t === 'f') {
    const f = OFFRES.formules.find(x => x.id === ref);
    return f ? { n: 0, tarif: { mode: f.par === 'personne' ? 'eleve' : 'seance', prix: f.prix } } : {};
  }
  if (t === 'abo') {
    const a = OFFRES.abos.find(x => x.id === ref);
    return a ? { n: 0, abo: a } : {};
  }
  return {};
}
const coPlanRow = (d, i) =>
  `<div class="row coplr" style="gap:8px"><span class="muted small" style="width:28px">${i + 1}</span><input type="date" class="co-pd grow" value="${d}" aria-label="Date de la séance ${i + 1}"><button type="button" class="ib" data-a="coPlanRm" aria-label="Retirer cette date">${ic('x')}</button></div>`;
function coPlanPaint(dates) {
  const box = $('co-pl-dates');
  if (!box) return;
  box.innerHTML = dates.map(coPlanRow).join('') || '<p class="muted small">Aucune date : ajoute-en une.</p>';
  const n = $('co-pl-cnt');
  if (n) n.textContent = plural(dates.length, 'séance');
}
const coPlanRead = () =>
  [...document.querySelectorAll('#co-plan .co-pd')].map(i => i.value).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));

Object.assign(A, {
  /* saison en extérieur : les prochaines séances changent de lieu (un jour déjà réglé à la main l'est encore) ;
     élèves et parents prévenus */
  coLocSeason(d) {
    const g = grp(d.id);
    if (!g) return;
    const nl = g.defLoc === 'Extérieur' ? 'En salle' : 'Extérieur';
    g.defLoc = nl;
    g.locPref = 1;
    if (g.loc) Object.keys(g.loc).forEach(k => k > TODAY && g.loc[k] === nl && delete g.loc[k]);
    NOTIFS.unshift({
      by: g.coach,
      txt: `${g.name} : les prochains cours auront lieu ${nl === 'En salle' ? 'en salle' : 'en extérieur'}`,
      t: "À l'instant",
      n: 1,
      go: { v: 'agenda', ag: 'cours' },
      to: g.mem.slice()
    });
    coSave(`${g.name} : prochaines séances ${nl === 'En salle' ? 'en salle' : 'en extérieur'} · élèves prévenus`);
  },
  coShift(d) {
    const g = grp(d.id);
    if (!g) return;
    const L = coDates(g, d.d, g.to || isoIn(365)),
      next = coNextOcc(g, L[L.length - 1] || d.d);
    sheet(
      'Reporter la séance',
      `<div class="body"><p>La séance du <b>${fmtD(d.d)}</b> est reportée à la suivante, le <b>${fmtD(L[1] || next)}</b>. Les ${plural(L.length - 1, 'séance suivante', 'séances suivantes')} glissent aussi d'une occurrence, avec leurs thèmes${g.to ? ` : le cycle se termine le <b>${fmtD(next)}</b> au lieu du ${fmtD(g.to)}` : ''}.</p><p class="muted small">Les élèves et leurs parents sont prévenus dans /RAM Club.</p><button class="btn full" data-a="coShiftOk" data-id="${g.id}" data-d="${d.d}">${ic('cal')}Reporter</button><button class="btn full ghost" data-a="coMove" data-id="${g.id}" data-d="${d.d}">Changer seulement la date de cette séance</button></div>`
    );
  },
  coShiftOk(d) {
    const g = grp(d.id);
    closeSheet();
    if (!g) return;
    const L = coDates(g, d.d, g.to || isoIn(365)).filter(x => !isCx(g, x)),
      next = coNextOcc(g, L[L.length - 1] || d.d),
      N = L.slice(1).concat(next);
    // les séances glissent d'une occurrence, de la dernière à la première (sans écraser la suivante)
    for (let i = L.length - 1; i >= 0; i--) coSesMove(g, L[i], N[i]);
    coDateOff(g, d.d);
    if (g.to) g.to = next;
    else if (!trainOn(g, next)) coDateOn(g, next);
    NOTIFS.unshift({
      by: g.coach,
      txt: `${g.name} : la séance du ${fmtD(d.d)} est reportée au ${fmtD(N[0])}, les suivantes sont décalées`,
      t: "À l'instant",
      n: 1,
      go: { v: 'agenda', ag: 'cours' },
      to: g.mem.slice()
    });
    const top = S.stack[S.stack.length - 1];
    if (top && top.v === 'seance' && top.id === g.id + '.' + d.d) top.id = g.id + '.' + N[0];
    coSave(`Séance reportée au ${fmtD(N[0])} · ${plural(N.length, 'séance décalée', 'séances décalées')}`);
  },
  coMove(d) {
    const g = grp(d.id);
    if (!g) return;
    sheet(
      'Changer la date',
      `<form class="body" id="co-move" data-id="${g.id}" data-d="${d.d}"><p class="muted small">Seule la séance du ${fmtD(d.d)} change de jour, avec son thème, son appel et son bilan. Les autres séances${g.once ? '' : ' du groupe'} ne bougent pas.</p><div class="fld"><label for="co-mv-d">Nouvelle date</label><input id="co-mv-d" type="date" required value="${d.d}"></div>${g.once ? `<div class="fld"><label for="co-mv-h">Heure</label><select id="co-mv-h">${HOURS.map(h => `<option ${h === g.h ? 'selected' : ''}>${h}</option>`).join('')}</select></div>` : ''}<button class="btn full">Déplacer la séance</button></form>`
    );
  },
  coOffAdd(d) {
    const g = grp(d.id);
    if (!g) return;
    const n = coGroups('', true).filter(x => coIsGrp(x) && x.id !== g.id && coClubOf(x) === coClubOf(g)).length;
    sheet(
      'Période sans cours',
      `<form class="body" id="co-off" data-id="${g.id}">${O('co-of-n', 'Nom', 'Vacances de Noël, fermeture du club…')}<div class="row" style="gap:8px"><div class="fld grow"><label for="co-of-d">Du</label><input id="co-of-d" type="date" required value="${isoIn(1)}"></div><div class="fld grow"><label for="co-of-a">Au (inclus)</label><input id="co-of-a" type="date" required value="${isoIn(14)}"></div></div>${n ? `<div class="fld"><label class="chk" for="co-of-all"><input type="checkbox" id="co-of-all">Aussi pour mes ${plural(n, 'autre groupe', 'autres groupes')} de ce club</label></div>` : ''}<button class="btn full">Enregistrer la période</button><p class="muted small">Les séances de cette période disparaissent du planning, de l'Agenda et de l'École de /RAM Club. Un cycle ou un pack se décale tout seul si tu reprogrammes ses dates.</p></form>`
    );
  },
  coOffDel(d) {
    const g = grp(d.id);
    if (!g) return;
    g.off = (g.off || []).filter(o => !(o.du === d.du && o.au === d.au));
    if (!g.off.length) delete g.off;
    coSave('Période retirée : les cours reprennent ces jours-là');
  },
  /* cycle terminé ↔ en cours : un groupe en cours reprend son créneau (chaque semaine, ou une sur deux) ;
     un groupe qu'on termine s'arrête à sa dernière séance passée */
  coCycle(d) {
    const g = grp(d.id);
    if (!g) return;
    if (coOver(g)) {
      delete g.to;
      delete g.fini;
      const n = coDates(g, isoIn(1), isoIn(42))[0];
      coSave(`${g.name} est de nouveau en cours${n ? ' · prochaine séance le ' + fmtD(n) : ''}`);
    } else {
      g.to = coDates(g, g.from || isoIn(-365), TODAY).pop() || TODAY;
      g.fini = 1;
      coSave(g.name + ' : cycle terminé le ' + fmtD(g.to));
    }
  },
  coFav(d) {
    const l = coFavs(),
      i = l.indexOf(d.k);
    if (i >= 0) l.splice(i, 1);
    else l.unshift(d.k);
    try {
      localStorage.setItem('coach-favs', JSON.stringify(l));
    } catch (e) {}
    render(true);
    toast(i >= 0 ? 'Retiré des favoris' : 'En favori : tout en haut de la liste');
  },
  coSelMode() {
    S.coSel = !S.coSel;
    S.coPick = [];
    render(true);
  },
  coPick(d) {
    const l = (S.coPick = S.coPick || []),
      i = l.indexOf(d.id);
    if (i >= 0) l.splice(i, 1);
    else l.push(d.id);
    render(true);
  },
  coPickAll() {
    const all = S.coBil || [];
    S.coPick = (S.coPick || []).length === all.length ? [] : all.slice();
    render(true);
  },
  coPickDel() {
    const l = (S.coPick || []).filter(id => (S.coBil || []).includes(id));
    if (!l.length) return;
    l.forEach(id => {
      const dr = BROUILLONS.find(b => b.id === id);
      if (dr) BROUILLONS.splice(BROUILLONS.indexOf(dr), 1);
      else sesGet(id).noRecap = 1;
    });
    S.coSel = false;
    S.coPick = [];
    coSave(plural(l.length, 'bilan retiré', 'bilans retirés') + ' de la liste');
  },
  /* la discussion d'un groupe qui n'en a pas (ou plus) : la même que celle créée avec le groupe */
  coChanNew(d) {
    const g = grp(d.id);
    if (!g || chans.some(c => c.id === g.id)) return;
    const ch = { id: g.id, g: 'train', sport: g.sport, name: g.name, desc: g.sub || coSlot(g), kid: 0 };
    if (g._club) {
      if (CO_EXT[g._club] && CO_EXT[g._club].base)
        fetch('/api/ram/c/' + g._club + '/ops', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ops: [{ coll: 'chan', id: g.id, op: 'put', data: Object.assign({ at: Date.now() }, ch) }]
          })
        }).catch(() => {});
      return toast('Discussion créée dans ' + coClubName(g));
    }
    chans.push(Object.assign({ msgs: [{ by: 'club', x: 'Groupe ouvert. Bienvenue !', t: "À l'instant" }], un: 0 }, ch));
    coSave('Discussion du groupe créée dans /RAM Club');
  },
  /* Programmer des séances : produit, nombre, rythme, puis chaque date modifiable */
  coPlan(d) {
    const g = grp(d.id);
    if (!g) return;
    const cur = coDates(g, isoIn(1), g.to && g.to > isoIn(1) ? g.to : isoIn(120)),
      opts = [['', 'Aucune en particulier']]
        .concat(
          OFFRES.packs.map(p => ['pack:' + p.id, 'Pack · ' + ofLabel('pack', p.id) + ' · ' + p.seances + ' séances'])
        )
        .concat(OFFRES.formules.map(f => ['f:' + f.id, 'À la séance · ' + ofLabel('f', f.id)]))
        .concat(OFFRES.abos.map(a => ['abo:' + a.id, 'Abonnement · ' + a.nom])),
      cyc = !!g.to || (g.offre || '').startsWith('pack:');
    sheet(
      'Séances de ' + g.name,
      `<form class="body" id="co-plan" data-id="${g.id}"><p class="muted small">Choisis une formule : un pack donne le nombre de séances et le tarif. Règle ensuite chaque date ; tu pourras donner un thème à chaque séance.</p>${ofSel('co-pl-o', 'Formule suivie par le groupe', opts, g.offre || '')}<div class="row" style="gap:8px"><div class="fld grow"><label for="co-pl-s">À partir du</label><input id="co-pl-s" type="date" value="${coPlanStart(g)}"></div><div class="fld" style="width:96px"><label for="co-pl-n">Séances</label><input id="co-pl-n" type="number" inputmode="numeric" min="1" max="60" value="${cur.length || 10}"></div></div>${ofSel(
        'co-pl-r',
        'Rythme',
        [
          ['7', 'Chaque semaine'],
          ['14', 'Une semaine sur deux']
        ],
        g.every > 1 ? '14' : '7'
      )}<button type="button" class="btn sm ghost full" data-a="coPlanGen">${ic('cal')}Proposer les dates</button><span class="kicker" style="margin-top:12px">Dates · <span id="co-pl-cnt">${plural(cur.length, 'séance')}</span></span><div id="co-pl-dates" class="copl"></div><button type="button" class="btn sm ghost full" data-a="coPlanAdd">${ic('plus')}Ajouter une date</button><div class="fld"><label class="chk" for="co-pl-c"><input type="checkbox" id="co-pl-c" ${cyc ? 'checked' : ''}>Le groupe s'arrête après la dernière date (pack ou cycle)</label></div><button class="btn full">Enregistrer les séances</button><p class="muted small">Les séances apparaissent dans ton planning et dans l'Agenda et l'École de /RAM Club.</p></form>`
    );
    coPlanPaint(cur);
  },
  coPlanGen() {
    const o = coPlanOf($('co-pl-o').value),
      n = parseInt($('co-pl-n').value, 10) || o.n || 10,
      s = $('co-pl-s').value || TODAY;
    coPlanPaint(coPlanDates(s, n, +$('co-pl-r').value || 7, (grp($('co-plan').dataset.id) || {}).off));
  },
  coPlanAdd() {
    const l = coPlanRead(),
      last = l.slice().sort().pop();
    l.push(last ? isoIn(+$('co-pl-r').value || 7, last) : $('co-pl-s').value || isoIn(1));
    coPlanPaint(l);
  },
  coPlanRm(d, el) {
    const l = coPlanRead(),
      rows = [...document.querySelectorAll('#co-plan .coplr')],
      i = rows.indexOf(el && el.closest ? el.closest('.coplr') : null);
    if (i >= 0) l.splice(i, 1);
    coPlanPaint(l);
  }
});
/* choisir un pack remplit le nombre de séances ; le cycle s'arrête alors après la dernière date */
document.addEventListener('change', e => {
  if (e.target.id !== 'co-pl-o') return;
  const o = coPlanOf(e.target.value);
  if (o.n) {
    $('co-pl-n').value = o.n;
    $('co-pl-c').checked = true;
    A.coPlanGen();
  }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'co-move') return;
  e.preventDefault();
  const f = e.target,
    g = grp(f.dataset.id),
    from = f.dataset.d,
    to = $('co-mv-d').value;
  if (!g || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return;
  if (to !== from && !g.once && coDates(g, to, to).length) return toast('Le groupe a déjà une séance ce jour-là');
  coSesMove(g, from, to);
  if (g.once) {
    g.once = to;
    g.day = coDow(to);
    if ($('co-mv-h')) g.h = $('co-mv-h').value;
    g.sub = `${fmtD(to)} ${g.h} · ${g.dur}`;
  } else if (to !== from) {
    coDateOff(g, from);
    coDateOn(g, to);
    if (g.to && to > g.to) g.to = to;
    if (g.from && to < g.from) g.from = to;
  }
  closeSheet();
  const top = S.stack[S.stack.length - 1];
  if (top && top.v === 'seance') top.id = g.id + '.' + to;
  coSave('Séance déplacée au ' + fmtD(to));
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'co-off') return;
  e.preventDefault();
  const g = grp(e.target.dataset.id),
    nom = ($('co-of-n').value || '').trim().slice(0, 60),
    du = $('co-of-d').value,
    au = $('co-of-a').value;
  if (!g || !du || !au || au < du) return toast('Choisis une date de début et une date de fin après elle');
  const gs = [g].concat(
    $('co-of-all') && $('co-of-all').checked
      ? coGroups('', true).filter(x => coIsGrp(x) && x.id !== g.id && coClubOf(x) === coClubOf(g))
      : []
  );
  gs.forEach(x => {
    x.off = (x.off || []).filter(o => !(o.du === du && o.au === au)).concat({ nom, du, au });
  });
  closeSheet();
  coSave(`Pas de cours du ${fmtD(du)} au ${fmtD(au)}${gs.length > 1 ? ' · ' + plural(gs.length, 'groupe') : ''}`);
});
/* applique la liste des dates à venir au groupe : séances ajoutées (extra) et retirées (skip) */
function coPlanApply(g, list, cycle) {
  const keep = new Set(list),
    fut = d => d > TODAY;
  g.extra = (g.extra || []).filter(d => !fut(d) || keep.has(d));
  g.skip = (g.skip || []).filter(d => !keep.has(d));
  delete g.fini;
  if (cycle) g.to = list.length ? list[list.length - 1] : TODAY;
  else if (g.to && g.to >= TODAY) delete g.to;
  // un groupe sans séance faite (ni appel ni bilan) commence à sa première date programmée
  const used = SEANCES.some(x => x.g === g.id && (x._club || '') === (g._club || '') && (x.pres || x.recap));
  if (list.length && (g.from ? g.from > list[0] : !used)) g.from = list[0];
  // jusqu'à la dernière date choisie : après elle, un groupe sans fin reprend son créneau chaque semaine
  const end = list.length ? list[list.length - 1] : TODAY;
  // des dates passées choisies (cycle commencé avant d'être programmé) sont reprises ; une séance passée déjà
  // faite (appel ou bilan) n'est jamais retirée
  const done = d =>
    SEANCES.some(x => x.id === g.id + '.' + d && (x._club || '') === (g._club || '') && (x.pres || x.recap));
  for (let d = list.length && list[0] < isoIn(1) ? list[0] : isoIn(1); d <= end; d = isoIn(1, d)) {
    if (keep.has(d)) {
      if (!trainOn(g, d)) g.extra.push(d);
    } else if (trainOn(g, d) && (fut(d) || !done(d))) g.skip.push(d);
  }
  g.extra.sort();
  g.skip.sort();
}
document.addEventListener('submit', e => {
  if (e.target.id !== 'co-plan') return;
  e.preventDefault();
  const g = grp(e.target.dataset.id);
  if (!g) return;
  const list = [...new Set(coPlanRead())].sort(),
    o = $('co-pl-o').value,
    p = coPlanOf(o);
  if (o) g.offre = o;
  else delete g.offre;
  if (p.tarif) g.tarif = p.tarif;
  coPlanApply(g, list, $('co-pl-c').checked);
  closeSheet();
  coSave(plural(list.length, 'séance programmée', 'séances programmées') + ' pour ' + g.name);
});
