/* /RAM Coach — coach/5-formules.js : formules, packs et abonnements de l'enseignant, et ce que chaque élève a acheté.
   Les formules sont rangées sur le compte /RAM de l'enseignant (lib/formules.js, /api/coach/formules), les mêmes dans
   tous ses clubs ; elles s'affichent sur sa fiche enseignant de /RAM Club et serviront à la prise de rendez-vous.
   Un achat (formule à la séance, pack ou abonnement) est noté dans la fiche de l'élève (e.achats) : les séances
   d'un pack se décomptent toutes seules avec les séances ponctuelles où l'élève est venu, de la même durée. */
/* formules de démonstration ; remplacées par celles du compte au démarrage */
const OFFRES = {
  formules: [
    { id: 'f1', nom: 'Cours individuel', sport: 'Padel', joueurs: 1, duree: 60, prix: 35, par: 'seance' },
    { id: 'f2', nom: 'Cours individuel', sport: 'Padel', joueurs: 1, duree: 90, prix: 50, par: 'seance' },
    { id: 'f3', nom: 'Cours duo', sport: 'Padel', joueurs: 2, duree: 60, prix: 30, par: 'personne' },
    { id: 'f4', nom: 'Collectif à 4', sport: 'Padel', joueurs: 4, duree: 90, prix: 25, par: 'personne' }
  ],
  packs: [
    { id: 'p1', formule: 'f1', nom: 'Pack Découverte', seances: 3, prix: 99 },
    { id: 'p2', formule: 'f1', nom: 'Pack Perfectionnement', seances: 5, prix: 160 }
  ],
  abos: [{ id: 'a1', nom: 'Academy Training', formule: 'f1', periode: 'mois', duree: 6, prix: 120, parSemaine: 1 }]
};
const PERIODES = ['mois', 'trimestre', '6 mois', 'an'];
const eur = n => (Math.round(n * 100) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' €';
const minTxt = n => (n % 60 ? (n >= 60 ? Math.floor(n / 60) + ' h ' + (n % 60) : n + ' min') : n / 60 + ' h');
const foOf = id => OFFRES.formules.find(f => f.id === id);
const foKind = f => (f.joueurs === 1 ? 'Individuel' : f.joueurs === 2 ? 'Duo' : 'Collectif ' + f.joueurs);
/* prix d'une séance pour l'élève qui l'achète (par personne si la formule est par personne) */
const foSeance = f => (f.par === 'personne' ? f.prix : f.prix);
const foPrice = f =>
  f.par === 'personne' && f.joueurs > 1
    ? `${eur(f.prix)} par personne (${eur(f.prix * f.joueurs)} la séance)`
    : `${eur(f.prix)} la séance${f.joueurs > 1 ? ' (' + eur(f.prix / f.joueurs) + ' par personne)' : ''}`;
const pkPrice = p => `${p.seances} séances · ${eur(p.prix)} (${eur(p.prix / p.seances)} la séance)`;
/* abPer et abEng : ui/13-suivi.js, les mêmes mots que sur la fiche enseignant de /RAM Club */
const abPrice = a =>
  `${eur(a.prix)} ${abPer(a)}${abEng(a) ? ' · ' + abEng(a) : ''}${a.parSemaine ? ' · ' + a.parSemaine + ' séance' + (a.parSemaine > 1 ? 's' : '') + ' par semaine' : ''}`;
/* le libellé d'un produit, pour un achat ou une liste */
function ofLabel(t, id) {
  if (t === 'pack') {
    const p = OFFRES.packs.find(x => x.id === id),
      f = p && foOf(p.formule);
    return p
      ? `${p.nom || 'Pack ' + p.seances + ' séances'}${f ? ' · ' + foKind(f) + ' ' + minTxt(f.duree) : ''}`
      : 'Pack';
  }
  if (t === 'abo') return (OFFRES.abos.find(x => x.id === id) || {}).nom || 'Abonnement';
  const f = foOf(id);
  return f ? `${f.nom} · ${minTxt(f.duree)}` : 'Séance';
}

/* ---------- enregistrement : sur le compte /RAM (démonstration : en mémoire) ---------- */
function ofSave(msg) {
  render(true);
  if (!(window.RAM && RAM.user)) return toast((msg || 'Formules modifiées') + ' (démonstration : non enregistrées)');
  fetch('/api/coach/formules', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formules: OFFRES })
  })
    .then(r => r.json())
    .then(d => {
      if (d.formules) Object.assign(OFFRES, d.formules);
      render(true);
      toast(msg || 'Formules enregistrées');
    })
    .catch(() => toast('Les formules n’ont pas été enregistrées'));
}
addEventListener('load', () =>
  (window.ramReady || Promise.resolve()).then(() => {
    if (!(window.RAM && RAM.user)) return;
    fetch('/api/coach/formules', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (!d.formules) return;
        Object.assign(OFFRES, d.formules);
        render(true);
      })
      .catch(() => {});
  })
);

/* ---------- page « Formules et tarifs » ---------- */
function coFormules() {
  const fo = OFFRES.formules.map(f => {
    const pk = OFFRES.packs.filter(p => p.formule === f.id);
    return `<div class="card cofo"><div class="row" style="gap:10px;align-items:flex-start"><span class="tile">${ic(f.joueurs > 1 ? 'users' : 'user')}</span><div class="grow"><span class="h3" style="font-size:18px">${esc(f.nom)}</span><br><span class="muted small">${foKind(f)} · ${minTxt(f.duree)} · ${f.sport}</span><p class="cofop">${foPrice(f)}</p></div><button class="ib" data-a="coFoEdit" data-id="${f.id}" aria-label="Modifier la formule">${ic('edit')}</button></div>${
      pk.length
        ? `<div class="copk">${pk.map(p => `<button class="copki" data-a="coPkEdit" data-id="${p.id}"><span class="grow"><b>${esc(p.nom || 'Pack ' + p.seances + ' séances')}</b><br><span class="muted small">${pkPrice(p)}</span></span>${ic('edit')}</button>`).join('')}</div>`
        : ''
    }<button class="btn sm ghost full" data-a="coPkEdit" data-f="${f.id}">${ic('plus')}Créer un pack de séances</button></div>`;
  });
  const ab = OFFRES.abos.map(
    a =>
      `<button class="item" data-a="coAbEdit" data-id="${a.id}"><span class="tile">${ic('cal')}</span><span class="grow"><span class="nm">${esc(a.nom)}</span><br><span class="muted small">${abPrice(a)}${a.formule && foOf(a.formule) ? ' · ' + esc(ofLabel('f', a.formule)) : ''}</span></span>${ic('edit')}</button>`
  );
  return `<div class="pad"><div class="card"><p class="muted small">Tes formules, pour tous tes clubs. Elles s'affichent sur ta fiche enseignant dans /RAM Club et serviront à la prise de rendez-vous. Pour chaque formule, crée des packs de plusieurs séances : le prix de la séance se calcule tout seul.</p></div>${hd('Formules · à la séance')}${fo.join('') || none('ball', 'Aucune formule', 'Une formule : un nombre de joueurs, une durée, un prix.')}<div class="card"><button class="btn full" data-a="coFoEdit" data-id="new">${ic('plus')}Ajouter une formule</button></div>${hd('Abonnements')}${ab.length ? list(ab.join('')) : none('cal', 'Aucun abonnement', 'Un prix par mois, par trimestre ou à l’année, avec un engagement si tu veux.')}<div class="card"><button class="btn full ghost" data-a="coAbEdit" data-id="new">${ic('plus')}Ajouter un abonnement</button></div></div>`;
}
V.formules = coFormules;
TITLES.formules = () => ['Formules et tarifs', 'Séances, packs et abonnements'];

/* ---------- ce que l'élève a acheté (fiche élève) ---------- */
/* séances ponctuelles faites par l'élève, de la plus ancienne : elles se décomptent des packs, du plus ancien au plus récent */
function coPacks(id) {
  const e = coEl(id) || {},
    l = (e.achats || []).slice().sort((a, b) => a.d.localeCompare(b.d)),
    done = SEANCES.filter(s => s.d <= TODAY && s.pres && s.pres[id] === 'P')
      .map(s => ({ s, g: GROUPS.find(g => g.id === s.g && (g._club || '') === (s._club || '')) }))
      .filter(x => x.g && x.g.once)
      .sort((a, b) => a.s.d.localeCompare(b.s.d)),
    used = new Set();
  return l.map(a => {
    const o = Object.assign({}, a, { used: 0 });
    if (a.t !== 'pack') return o;
    const p = OFFRES.packs.find(x => x.id === a.ref),
      f = p && foOf(p.formule);
    done.forEach(x => {
      if (o.used >= (a.n || 0) || used.has(x.s) || x.s.d < a.d) return;
      if (f && durMin(x.g.dur) !== f.duree) return;
      used.add(x.s);
      o.used++;
    });
    return o;
  });
}
function coAchatsCard(id) {
  const l = coPacks(id).reverse();
  return (
    hd('Formules achetées') +
    `<div class="card">${
      l
        .map(a => {
          const pct = a.t === 'pack' && a.n ? Math.round((a.used * 100) / a.n) : 0,
            fin = a.t === 'abo' && a.fin;
          return `<div class="coach-a"><div class="row" style="gap:10px;align-items:center"><div class="grow"><b>${esc(a.nom || ofLabel(a.t, a.ref))}</b><br><span class="muted small">Acheté le ${fmtD(a.d)}${a.prix ? ' · ' + eur(a.prix) : ''}${fin ? (fin < TODAY ? ' · terminé le ' : ' · jusqu’au ') + fmtD(fin) : ''}${a.note ? ' · ' + esc(a.note) : ''}</span></div>${a.t === 'pack' ? `<span class="tag${a.used >= a.n ? '' : ' copink'}">${a.n - a.used > 0 ? a.n - a.used + ' restante' + (a.n - a.used > 1 ? 's' : '') : 'Terminé'}</span>` : ''}<button class="ib" data-a="coAchatDel" data-id="${id}" data-x="${a.id}" aria-label="Retirer cet achat">${ic('x')}</button></div>${a.t === 'pack' ? `<div class="cobarre" role="img" aria-label="${a.used} séances sur ${a.n}"><i style="width:${pct}%"></i></div><span class="muted small">${a.used} séance${a.used > 1 ? 's' : ''} sur ${a.n}</span>` : ''}</div>`;
        })
        .join('') || '<p class="muted small">Aucun achat noté.</p>'
    }<button class="btn sm full" data-a="coAchat" data-id="${id}">${ic('plus')}Noter un achat</button></div>`
  );
}

/* ---------- fenêtres de saisie ---------- */
const ofSel = (id, l, opts, sel) =>
  `<div class="fld"><label for="${id}">${l}</label><select id="${id}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
const ofNum = (id, l, v, step) =>
  `<div class="fld"><label for="${id}">${l}</label><input id="${id}" type="number" inputmode="decimal" min="0" step="${step || 'any'}" value="${v == null ? '' : v}" required></div>`;
const ofDel = (a, id) =>
  `<button type="button" class="btn ghost" data-a="${a}" data-id="${id}">${ic('trash')}Supprimer</button>`;
Object.assign(A, {
  coFoEdit(d) {
    const f = foOf(d.id) || { nom: '', sport: 'Padel', joueurs: 1, duree: 60, prix: 35, par: 'seance' };
    sheet(
      d.id === 'new' ? 'Nouvelle formule' : 'Formule',
      `<form class="body" id="co-fo" data-id="${d.id}">${F('co-fn', 'Nom', 'Cours individuel, duo, collectif…', f.nom)}${ofSel(
        'co-fs',
        'Sport',
        [
          ['Padel', 'Padel'],
          ['Tennis', 'Tennis']
        ],
        f.sport
      )}${ofNum('co-fj', 'Nombre de joueurs', f.joueurs, 1)}${ofSel(
        'co-fd',
        'Durée',
        [30, 45, 60, 90, 120].map(n => [String(n), minTxt(n)]),
        String(f.duree)
      )}${ofNum('co-fp', 'Prix en euros', f.prix)}${ofSel(
        'co-fpp',
        'Ce prix est',
        [
          ['seance', 'Pour la séance'],
          ['personne', 'Par personne']
        ],
        f.par
      )}<div class="cotools"><button class="btn">Enregistrer</button>${d.id === 'new' ? '' : ofDel('coFoDel', d.id)}</div></form>`
    );
  },
  coFoDel(d) {
    OFFRES.formules = OFFRES.formules.filter(f => f.id !== d.id);
    OFFRES.packs = OFFRES.packs.filter(p => p.formule !== d.id);
    OFFRES.abos.forEach(a => a.formule === d.id && (a.formule = ''));
    closeSheet();
    ofSave('Formule supprimée');
  },
  coPkEdit(d) {
    const p = OFFRES.packs.find(x => x.id === d.id) || { formule: d.f, nom: '', seances: 5, prix: '' },
      f = foOf(p.formule);
    sheet(
      p.id ? 'Pack de séances' : 'Nouveau pack',
      `<form class="body" id="co-pk" data-id="${p.id || 'new'}" data-f="${p.formule}"><p class="muted small">${f ? esc(f.nom) + ' · ' + foKind(f) + ' · ' + minTxt(f.duree) + ' · à l’unité : ' + foPrice(f) : ''}</p>${O('co-kn', 'Nom du pack (facultatif)', 'Pack Découverte, Perfectionnement…', p.nom)}${ofNum('co-ks', 'Nombre de séances', p.seances, 1)}${ofNum('co-kp', 'Prix du pack en euros', p.prix)}<p class="muted small" id="co-kx"></p><div class="cotools"><button class="btn">Enregistrer</button>${p.id ? ofDel('coPkDel', p.id) : ''}</div></form>`
    );
    const upd = () => {
      const n = +$('co-ks').value,
        x = parseFloat($('co-kp').value);
      $('co-kx').textContent =
        n > 0 && x > 0
          ? `Soit ${eur(x / n)} la séance${f ? ' (au lieu de ' + eur(foSeance(f)) + ' : ' + Math.round((1 - x / n / foSeance(f)) * 100) + ' % de remise)' : ''}`
          : '';
    };
    $('co-ks').oninput = $('co-kp').oninput = upd;
    upd();
  },
  coPkDel(d) {
    OFFRES.packs = OFFRES.packs.filter(p => p.id !== d.id);
    closeSheet();
    ofSave('Pack supprimé');
  },
  coAbEdit(d) {
    const a = OFFRES.abos.find(x => x.id === d.id) || {
      nom: '',
      formule: '',
      periode: 'mois',
      duree: 1,
      prix: '',
      parSemaine: 1
    };
    sheet(
      d.id === 'new' ? 'Nouvel abonnement' : 'Abonnement',
      `<form class="body" id="co-ab" data-id="${d.id}">${F('co-an', 'Nom', 'Academy, abonnement performance…', a.nom)}${ofSel('co-af', 'Formule comprise', [['', 'Aucune en particulier']].concat(OFFRES.formules.map(f => [f.id, ofLabel('f', f.id) + ' · ' + foKind(f)])), a.formule)}${ofNum('co-aw', 'Séances par semaine', a.parSemaine, 1)}${ofNum('co-ap', 'Prix en euros', a.prix)}${ofSel(
        'co-ae',
        'Par',
        PERIODES.map(x => [x, x]),
        a.periode
      )}${ofNum('co-ad', 'Engagement (nombre de périodes)', a.duree, 1)}<div class="cotools"><button class="btn">Enregistrer</button>${d.id === 'new' ? '' : ofDel('coAbDel', d.id)}</div></form>`
    );
  },
  coAbDel(d) {
    OFFRES.abos = OFFRES.abos.filter(a => a.id !== d.id);
    closeSheet();
    ofSave('Abonnement supprimé');
  },
  /* noter un achat dans la fiche d'un élève (une séance, un pack, un abonnement) */
  coAchat(d) {
    const opts = OFFRES.packs
      .map(p => ['pack:' + p.id, ofLabel('pack', p.id) + ' · ' + eur(p.prix)])
      .concat(OFFRES.abos.map(a => ['abo:' + a.id, a.nom + ' · ' + abPrice(a)]))
      .concat(
        OFFRES.formules.map(f => ['f:' + f.id, ofLabel('f', f.id) + ' · ' + foKind(f) + ' · ' + eur(foSeance(f))])
      );
    if (!opts.length) return A.open({ v: 'formules' });
    sheet(
      'Noter un achat',
      `<form class="body" id="co-ac" data-id="${d.id}">${ofSel('co-ao', 'Produit', opts, opts[0][0])}${Dt('co-ad2', 'Date d’achat', true, TODAY)}${O('co-ax', 'Prix payé en euros (facultatif)', 'Prix du produit')}${O('co-an2', 'Note (facultatif)', 'Payé en 2 fois, offert…')}<button class="btn full">Enregistrer</button></form>`
    );
  },
  coAchatDel(d) {
    const e = coEl(d.id);
    if (!e) return;
    e.achats = (e.achats || []).filter(a => a.id !== d.x);
    coSave('Achat retiré');
  }
});
document.addEventListener('submit', e => {
  const f = e.target,
    v = id => ($(id) ? $(id).value.trim() : ''),
    n = id => parseFloat(v(id).replace(',', '.')) || 0,
    nid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  if (f.id === 'co-fo') {
    e.preventDefault();
    const x = {
      nom: v('co-fn') || 'Formule',
      sport: v('co-fs'),
      joueurs: Math.max(1, Math.round(n('co-fj'))),
      duree: +v('co-fd'),
      prix: n('co-fp'),
      par: v('co-fpp')
    };
    if (f.dataset.id === 'new') OFFRES.formules.push(Object.assign({ id: nid('f') }, x));
    else Object.assign(foOf(f.dataset.id), x);
    closeSheet();
    ofSave('Formule enregistrée');
  }
  if (f.id === 'co-pk') {
    e.preventDefault();
    const x = { formule: f.dataset.f, nom: v('co-kn'), seances: Math.max(2, Math.round(n('co-ks'))), prix: n('co-kp') };
    if (f.dataset.id === 'new') OFFRES.packs.push(Object.assign({ id: nid('p') }, x));
    else
      Object.assign(
        OFFRES.packs.find(p => p.id === f.dataset.id),
        x
      );
    closeSheet();
    ofSave('Pack enregistré');
  }
  if (f.id === 'co-ab') {
    e.preventDefault();
    const x = {
      nom: v('co-an') || 'Abonnement',
      formule: v('co-af'),
      parSemaine: Math.round(n('co-aw')),
      prix: n('co-ap'),
      periode: v('co-ae'),
      duree: Math.max(1, Math.round(n('co-ad')))
    };
    if (f.dataset.id === 'new') OFFRES.abos.push(Object.assign({ id: nid('a') }, x));
    else
      Object.assign(
        OFFRES.abos.find(a => a.id === f.dataset.id),
        x
      );
    closeSheet();
    ofSave('Abonnement enregistré');
  }
  if (f.id === 'co-ac') {
    e.preventDefault();
    const el = coEl(f.dataset.id),
      [t, ref] = v('co-ao').split(':'),
      d = v('co-ad2') || TODAY;
    if (!el) return;
    const a = { id: nid('h'), t: t === 'f' ? 'seance' : t, ref, d, nom: ofLabel(t === 'f' ? 'f' : t, ref) };
    if (t === 'pack') a.n = (OFFRES.packs.find(p => p.id === ref) || {}).seances || 0;
    if (t === 'abo') {
      const ab = OFFRES.abos.find(x => x.id === ref) || {},
        months = { mois: 1, trimestre: 3, '6 mois': 6, an: 12 }[ab.periode] * (ab.duree || 1),
        [y, m, dd] = d.split('-').map(Number);
      a.fin = new Date(Date.UTC(y, m - 1 + months, dd - 1)).toISOString().slice(0, 10);
    }
    const prix =
      n('co-ax') ||
      (t === 'pack'
        ? (OFFRES.packs.find(p => p.id === ref) || {}).prix
        : t === 'abo'
          ? (OFFRES.abos.find(x => x.id === ref) || {}).prix
          : foSeance(foOf(ref) || { prix: 0 }));
    if (prix) a.prix = prix;
    if (v('co-an2')) a.note = v('co-an2').slice(0, 120);
    el.achats = (el.achats || []).concat(a);
    closeSheet();
    coSave('Achat noté');
  }
});
