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

/* ---------- Programmer des séances ---------- */
/* les dates proposées : à partir d'une date, chaque semaine ou une semaine sur deux */
function coPlanDates(start, n, step) {
  const out = [];
  for (let i = 0; i < Math.min(n, 60); i++) out.push(isoIn(i * step, start));
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
    coPlanPaint(coPlanDates(s, n, +$('co-pl-r').value || 7));
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
/* applique la liste des dates à venir au groupe : séances ajoutées (extra) et retirées (skip) */
function coPlanApply(g, list, cycle) {
  const keep = new Set(list),
    fut = d => d > TODAY;
  g.extra = (g.extra || []).filter(d => !fut(d) || keep.has(d));
  g.skip = (g.skip || []).filter(d => !fut(d) || !keep.has(d));
  delete g.fini;
  if (cycle) g.to = list.length ? list[list.length - 1] : TODAY;
  else if (g.to && g.to >= TODAY) delete g.to;
  // un groupe sans séance faite (ni appel ni bilan) commence à sa première date programmée
  const used = SEANCES.some(x => x.g === g.id && (x._club || '') === (g._club || '') && (x.pres || x.recap));
  if (list.length && (g.from ? g.from > list[0] : !used)) g.from = list[0];
  // jusqu'à la dernière date choisie : après elle, un groupe sans fin reprend son créneau chaque semaine
  const end = list.length ? list[list.length - 1] : TODAY;
  for (let d = isoIn(1); d <= end; d = isoIn(1, d)) {
    if (keep.has(d)) {
      if (!trainOn(g, d)) g.extra.push(d);
    } else if (trainOn(g, d)) g.skip.push(d);
  }
  g.extra.sort();
  g.skip.sort();
}
document.addEventListener('submit', e => {
  if (e.target.id !== 'co-plan') return;
  e.preventDefault();
  const g = grp(e.target.dataset.id);
  if (!g) return;
  const list = [...new Set(coPlanRead())].filter(d => d > TODAY).sort(),
    o = $('co-pl-o').value,
    p = coPlanOf(o);
  if (o) g.offre = o;
  else delete g.offre;
  if (p.tarif) g.tarif = p.tarif;
  coPlanApply(g, list, $('co-pl-c').checked);
  closeSheet();
  coSave(plural(list.length, 'séance programmée', 'séances programmées') + ' pour ' + g.name);
});
