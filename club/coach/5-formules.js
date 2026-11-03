/* /RAM Coach — coach/5-formules.js : formules, packs et abonnements de l'enseignant, et ce que chaque élève a acheté.
   Les formules sont rangées sur le compte /RAM de l'enseignant (lib/formules.js, /api/coach/formules), les mêmes dans
   tous ses clubs ; elles s'affichent sur sa fiche enseignant de /RAM Club et serviront à la prise de rendez-vous.
   Un achat (formule à la séance, pack ou abonnement) est noté dans la fiche de l'élève (e.achats) : les séances
   d'un pack se décomptent toutes seules avec les séances où l'élève est venu, de la même durée et du même format. */
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
/* vendu sur Shopify : la référence (SKU) reconnue à la commande payée, et le lien d'achat montré aux élèves */
const ofVente = (id, x) =>
  O(id + '-sku', 'Référence Shopify (SKU, facultatif)', 'PACK-5', (x && x.sku) || '') +
  O(id + '-url', 'Lien d’achat Shopify (facultatif)', 'https://…', (x && x.url) || '');
const ofVenteLue = id => ({ sku: ($(id + '-sku') || {}).value || '', url: ($(id + '-url') || {}).value || '' });
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
  const abRow = a =>
      `<button class="item" data-a="coAbEdit" data-id="${a.id}"><span class="tile">${ic('cal')}</span><span class="grow"><span class="nm">${esc(a.nom)}</span><br><span class="muted small">${abPrice(a)}${a.formule && foOf(a.formule) ? ' · ' + esc(ofLabel('f', a.formule)) : ''}${a.moyen ? ' · ' + esc(a.moyen) : ''}</span></span>${ic('edit')}</button>`,
    ens = [...new Set(OFFRES.abos.map(a => a.ens).filter(Boolean))],
    // un ensemble : une seule ligne, ses variantes à la demande
    abEns = ens
      .map(n => {
        const l = OFFRES.abos.filter(a => a.ens === n),
          px = l.map(a => +a.prix || 0);
        return `<details class="card coens"><summary><span class="tile">${ic('cal')}</span><span class="grow"><span class="nm">${esc(n)}</span><br><span class="muted small">${plural(l.length, 'variante')} · ${Math.min(...px) === Math.max(...px) ? eur(px[0]) : 'de ' + eur(Math.min(...px)) + ' à ' + eur(Math.max(...px))}</span></span><span class="chev" aria-hidden="true">${ic('back')}</span></summary><div class="list">${l.map(abRow).join('')}</div><button class="btn sm ghost full" data-a="coAbEdit" data-id="new" data-ens="${esc(n)}">${ic('plus')}Ajouter une variante</button></details>`;
      })
      .join(''),
    ab = OFFRES.abos.filter(a => !a.ens).map(abRow);
  return `<div class="pad"><div class="card"><p class="muted small">Tes formules, pour tous tes clubs. Elles s'affichent sur ta fiche enseignant dans /RAM Club et serviront à la prise de rendez-vous. Pour chaque formule, crée des packs de plusieurs séances : le prix de la séance se calcule tout seul.</p></div>${hd('Formules · à la séance')}${fo.join('') || none('ball', 'Aucune formule', 'Une formule : un nombre de joueurs, une durée, un prix.')}<div class="card"><button class="btn full" data-a="coFoEdit" data-id="new">${ic('plus')}Ajouter une formule</button></div>${hd('Abonnements')}${abEns}${ab.length ? list(ab.join('')) : abEns ? '' : none('cal', 'Aucun abonnement', 'Un prix par mois, par trimestre ou à l’année, avec un engagement si tu veux.')}<div class="card"><button class="btn full ghost" data-a="coAbEdit" data-id="new">${ic('plus')}Ajouter un abonnement</button></div></div>`;
}
V.formules = coFormules;
TITLES.formules = () => ['Formules et tarifs', 'Séances, packs et abonnements'];

/* ---------- ce que l'élève a acheté (fiche élève) ---------- */
/* séances faites par l'élève (cours ponctuels et séances de ses groupes : cycles, duos, collectifs), de la plus
   ancienne : elles se décomptent des packs, du plus ancien au plus récent. Une séance compte pour un pack si elle a
   la durée de sa formule et le même format (individuel, duo, collectif) ; un pack payé un peu après sa première
   séance (« payé au mois ») la compte aussi : jusqu'à 14 jours avant la date d'achat. La règle est dans regles.js
   (REGLES.couverture), la même que celle du serveur et du chiffre d'affaires. */
/* séances faites où l'élève était présent : { d, min, n (inscrits : le format), sport } */
const coVenues = id =>
  SEANCES.filter(s => s.d <= TODAY && s.pres && s.pres[id] === 'P')
    .map(s => ({ s, g: GROUPS.find(g => g.id === s.g && (g._club || '') === (s._club || '')) }))
    .filter(x => x.g && !isCx(x.g, x.s.d))
    .map(x => ({ d: x.s.d, min: durMin(x.g.dur), n: coStu(x.g).length, sport: x.g.sport }));
/* cette présence n'est couverte par aucun achat de l'élève (le pack ne correspond pas, ou il n'en a pas) */
function coDue(id, d) {
  const vs = coVenues(id),
    v = vs.find(x => x.d === d);
  return !!v && !REGLES.couverture((coEl(id) || {}).achats || [], vs, OFFRES).couvre.has(v);
}
function coPacks(id) {
  return REGLES.couverture((coEl(id) || {}).achats || [], coVenues(id), OFFRES).achats;
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
          return `<div class="coach-a"><div class="row" style="gap:10px;align-items:center"><div class="grow"><b>${esc(a.nom || ofLabel(a.t, a.ref))}</b><br><span class="muted small">Acheté le ${fmtD(a.d)}${a.prix ? ' · ' + eur(a.prix) : ''}${fin ? (fin < TODAY ? ' · terminé le ' : ' · jusqu’au ') + fmtD(fin) : ''}${a.note ? ' · ' + esc(a.note) : ''}</span></div>${a.t === 'pack' ? `<span class="tag${a.used >= a.n ? '' : ' copink'}">${a.n - a.used > 0 ? a.n - a.used + ' restante' + (a.n - a.used > 1 ? 's' : '') : 'Terminé'}</span>` : ''}<button class="ib" data-a="coAchatDel" data-id="${id}" data-x="${a.id}" aria-label="Retirer cet achat">${ic('x')}</button></div><button class="copayb" data-a="coPay" data-id="${id}" data-x="${a.id}">${coPayTag(coPayState(a))}<span class="muted small">${coPayLine(a)}</span></button>${a.t === 'pack' ? `<div class="cobarre" role="img" aria-label="${a.used} séances sur ${a.n}"><i style="width:${pct}%"></i></div><span class="muted small">${a.used} séance${a.used > 1 ? 's' : ''} sur ${a.n}</span>` : ''}</div>`;
        })
        .join('') || '<p class="muted small">Aucun achat noté.</p>'
    }<button class="btn sm full" data-a="coAchat" data-id="${id}">${ic('plus')}Noter un achat</button></div>`
  );
}

/* ---------- suivi des paiements : consommer une séance et la régler sont deux choses ----------
   a.pay = { moyen, ech: [{ s: séance à laquelle le paiement est attendu (0 : tout de suite), m: montant, ok: date du
   règlement ou '' }] }. Un achat sans a.pay est réglé. Aucun rappel n'est envoyé aux élèves, aucune facture n'est faite. */
const coPayEch = a => (a.pay && Array.isArray(a.pay.ech) ? a.pay.ech : null);
function coPayState(a) {
  const e = coPayEch(a);
  if (!e) return { etat: 'paye', regle: +a.prix || 0, total: +a.prix || 0, reste: 0 };
  const total = e.reduce((s, x) => s + (+x.m || 0), 0),
    regle = e.filter(x => x.ok).reduce((s, x) => s + (+x.m || 0), 0);
  return {
    etat: e.every(x => x.ok) ? 'paye' : e.some(x => x.ok) ? 'partiel' : 'due',
    regle,
    total,
    reste: total - regle
  };
}
const PAY_LBL = { paye: 'Payé', partiel: 'Payé en partie', due: 'À payer' };
const coPayTag = st => `<span class="tag copay ${st.etat}">${PAY_LBL[st.etat]}</span>`;
/* en une fois ou en plusieurs fois, plus le moyen */
function coPayLine(a) {
  const e = coPayEch(a),
    st = coPayState(a),
    nb = e && e.length > 1 ? 'En ' + e.length + ' fois' : 'En une fois';
  return [
    nb,
    st.etat === 'partiel' ? eur(st.regle) + ' sur ' + eur(st.total) : '',
    a.pay && a.pay.moyen ? esc(a.pay.moyen) : ''
  ]
    .filter(Boolean)
    .join(' · ');
}
/* répartit ce qui reste à régler ; un pack reprend les séances réglées sur le pack, sinon elles sont étalées */
function coPaySplit(a, n, paid) {
  const kept = paid || [],
    k = Math.max(1, n - kept.length),
    total = +a.prix || 0,
    rest = Math.max(0, total - kept.reduce((s, x) => s + (+x.m || 0), 0)),
    part = Math.floor((rest * 100) / k) / 100,
    pk = a.t === 'pack' ? OFFRES.packs.find(p => p.id === a.ref) : null,
    preset = pk && (pk.ech || []).length === n ? pk.ech : null,
    span = +a.n || 4 * n;
  const out = [];
  for (let i = 0; i < k; i++) {
    const r = i + kept.length;
    out.push({
      s: preset ? preset[r] : Math.round((r * span) / n) + 1,
      m:
        preset && (pk.echm || []).length === n && !kept.length && pk.prix === total
          ? pk.echm[r]
          : i === k - 1
            ? Math.round((rest - part * (k - 1)) * 100) / 100
            : part,
      ok: ''
    });
  }
  return kept.concat(out);
}
/* ce qu'il faut régulariser : les échéances atteintes, les séances individuelles faites sans achat qui les couvre */
/* une ligne du calendrier de paiement d'un pack */
const coKeRow = (s, m) =>
  `<div class="copech co-ker"><div class="fld"><label>Séance n°</label><input class="co-kes" type="number" min="1" inputmode="numeric" value="${s || ''}"></div><div class="fld"><label>Montant en euros</label><input class="co-kem" type="number" min="0" step="0.01" inputmode="decimal" value="${m != null ? m : ''}"></div><button type="button" class="ib" data-a="coKeDel" aria-label="Retirer ce paiement">${ic('x')}</button></div>`;
Object.assign(A, {
  coKeAdd() {
    $('co-kr').insertAdjacentHTML('beforeend', coKeRow());
  },
  coKeDel(d, el) {
    el.closest('.co-ker').remove();
  }
});
function coPayTodo(depuis) {
  const out = [];
  ELEVES.filter(e => coInClub(e) && (e.achats || []).some(a => a.pay)).forEach(e =>
    coPacks(e.id).forEach(a => {
      if ((a.pay || {}).off) return; // retiré de la liste par l'enseignant
      const faites = a.cycle ? coCycleUsed(a, e.id) : a.used || 0,
        due = (coPayEch(a) || []).filter(x => !x.ok && faites >= (+x.s || 0));
      if (due.length)
        out.push({
          id: 'a|' + e.id + '|' + a.id,
          t: esc(svName(e.id)),
          d: a.d,
          sub: esc(a.nom || ofLabel(a.t, a.ref)) + ' · ' + plural(due.length, 'paiement attendu', 'paiements attendus'),
          m: due.reduce((s, x) => s + (+x.m || 0), 0),
          go: `data-a="coPay" data-id="${e.id}" data-x="${a.id}"`
        });
    })
  );
  coSessions(depuis || isoIn(-90), TODAY, 'me', 1)
    .filter(x => !coIsGrp(x.g) && !isCx(x.g, x.d) && x.s && x.s.pres)
    .forEach(x =>
      Object.keys(x.s.pres)
        .filter(k => x.s.pres[k] === 'P' && coDue(k, x.d) && !((coEl(k) || {}).payIgn || []).includes(x.d))
        .forEach(k => {
          const f = REGLES.formuleDe(OFFRES, Math.max(1, coStu(x.g).length), durMin(x.g.dur), x.g.sport);
          out.push({
            id: 's|' + k + '|' + x.d,
            t: esc(svName(k)),
            d: x.d,
            sub: 'Séance du ' + fmtD(x.d),
            m: f ? REGLES.prixEleve(f, Math.max(1, coStu(x.g).length)) : 0,
            go: `data-a="open" data-v="seance" data-id="${sesKey(x.g, x.d)}"`
          });
        })
    );
  return out;
}
/* Suivi : sélection des paiements à régulariser, comme les bilans ; les retirer ne touche ni à l'achat ni aux séances */
function coSelBarP() {
  const all = S.coPayIds || [],
    pick = (S.coPickP || []).filter(id => all.includes(id)),
    every = all.length && pick.length === all.length;
  return `<div class="card cosbar"><button class="item cosel" data-a="coPickAllP" aria-pressed="${!!every}"><span class="cochk" aria-hidden="true">${ic('check')}</span><span class="grow"><span class="nm">Tout sélectionner</span><br><span class="muted small">${pick.length ? plural(pick.length, 'paiement sélectionné', 'paiements sélectionnés') : 'Touche les paiements à supprimer'}</span></span></button><button class="btn sm hot full" data-a="coPickDelP" ${pick.length ? '' : 'disabled'}>${ic('trash')}Supprimer de la liste</button></div>`;
}
Object.assign(A, {
  coSelModeP() {
    S.coSelP = !S.coSelP;
    S.coPickP = [];
    render(true);
  },
  coPickP(d) {
    const l = (S.coPickP = S.coPickP || []),
      i = l.indexOf(d.id);
    if (i >= 0) l.splice(i, 1);
    else l.push(d.id);
    render(true);
  },
  coPickAllP() {
    const all = S.coPayIds || [];
    S.coPickP = (S.coPickP || []).length === all.length ? [] : all.slice();
    render(true);
  },
  coPickDelP() {
    const l = (S.coPickP || []).filter(id => (S.coPayIds || []).includes(id));
    if (!l.length) return;
    l.forEach(id => {
      const [t, k, x] = id.split('|'),
        e = coElGet(k);
      if (t === 's') e.payIgn = (e.payIgn || []).concat(x);
      else {
        const a = (e.achats || []).find(h => h.id === x);
        if (a && a.pay) a.pay.off = 1;
      }
    });
    S.coSelP = false;
    S.coPickP = [];
    coSave(plural(l.length, 'paiement supprimé', 'paiements supprimés') + ' de la liste');
  }
});
/* la partie « suivi pratique » de la page Statistiques */
function coPayPage(C) {
  const todo = coPayTodo(),
    enCours = [];
  ELEVES.filter(coInClub).forEach(e =>
    coPacks(e.id).forEach(a => {
      if ((a.t === 'pack' && a.used < a.n) || (a.t === 'abo' && (!a.fin || a.fin >= TODAY))) enCours.push([e, a]);
    })
  );
  const cycles = coGroups().filter(g => coIsGrp(g) && !coOver(g) && g.offre);
  return `<div class="cotiles n3">${coTile('euro', eurs(C.encaisse), 'Encaissé cette saison')}${coTile('timer', eurs(C.aEncaisser), 'À encaisser')}${coTile('ball', eurs(C.prepaye), 'Packs pas encore utilisés')}</div>
${hd(ic('euro') + 'À régulariser · ' + todo.length)}${todo.length ? list(todo.map(p => `<button class="item" ${p.go}><span class="tile">${ic('euro')}</span><span class="grow"><span class="nm">${p.t}</span><br><span class="muted small">${p.sub}</span></span>${p.m ? `<span class="tag cost todo">${eur(p.m)}</span>` : ''}</button>`).join('')) : none('check', 'Rien à régulariser', 'Les paiements attendus et les séances non réglées apparaissent ici.')}
${hd(ic('ball') + 'Formules en cours · ' + enCours.length)}${enCours.length ? list(enCours.map(([e, a]) => `<button class="item" data-a="coPay" data-id="${e.id}" data-x="${a.id}"><span class="tile">${ic(a.t === 'pack' ? 'ball' : 'cal')}</span><span class="grow"><span class="nm">${esc(svName(e.id))}</span><br><span class="muted small">${esc(a.nom || ofLabel(a.t, a.ref))}${a.t === 'pack' ? ' · ' + a.used + ' sur ' + a.n + ' séances' : ''} · ${coPayLine(a)}</span></span>${coPayTag(coPayState(a))}</button>`).join('')) : '<div class="card"><p class="muted small">Aucun pack ni abonnement en cours.</p></div>'}
${cycles.length ? hd(ic('cal') + 'Cycles en cours') + `<div class="card">${cycles.map(g => `<button class="coact2" data-a="open" data-v="cgroupe" data-id="${g.id}"><span class="cokv2"><span class="grow">${esc(g.name)}</span></span>${coCycleBar(g)}</button>`).join('')}</div>` : ''}
<div class="card"><p class="muted small">Encaissé : les règlements notés dans les fiches des élèves. À encaisser : les paiements attendus, et ${plural(C.nonCouvertes, 'présence')} sans achat qui la couvre, au prix de ta formule correspondante. Aucun rappel n'est envoyé aux élèves.</p></div>`;
}
/* séance individuelle : payée ou non. « Payée » note un achat à la séance : le reste des calculs suit tout seul */
function coSesPay(g, d, id, st, s) {
  const row = st
    .map(k => {
      const ach = ((coEl(k) || {}).achats || []).find(a => a.ses === id),
        p = (s.pres || {})[k] === 'P',
        state = ach
          ? coPayTag({ etat: 'paye' }) +
            `<button class="btn sm ghost" data-a="coSesPaid" data-id="${id}" data-k="${k}" data-v="0">Annuler</button>`
          : !p
            ? '<span class="muted small">Après l’appel</span>'
            : coDue(k, d)
              ? coPayTag({ etat: 'due' }) +
                `<button class="btn sm" data-a="coSesPaid" data-id="${id}" data-k="${k}" data-v="1">Marquer payée</button>`
              : '<span class="muted small">Couverte par un achat</span>';
      return `<div class="corow"><span class="grow">${esc(svName(k))}</span><span class="copayr">${state}</span></div>`;
    })
    .join('');
  return row ? hd(ic('euro') + 'Paiement de la séance') + `<div class="card">${row}</div>` : '';
}
Object.assign(A, {
  coSesPaid(d) {
    const s = sesGet(d.id),
      g = grp(s.g),
      e = coElGet(d.k);
    if (d.v === '1') {
      const n = Math.max(1, coStu(g).length),
        f = REGLES.formuleDe(OFFRES, n, durMin(g.dur), g.sport),
        prix = f ? REGLES.prixEleve(f, n) : +tarifOf(g).prix || 0;
      e.achats = (e.achats || []).concat({
        id: 'h' + Date.now().toString(36),
        t: 'seance',
        ref: f ? f.id : '',
        d: s.d,
        nom: f ? ofLabel('f', f.id) : g.name,
        prix,
        ses: d.id
      });
    } else e.achats = (e.achats || []).filter(a => a.ses !== d.id);
    coSave(d.v === '1' ? 'Séance marquée payée' : 'Paiement retiré');
  },
  /* le détail d'un achat : ses échéances, modifiables */
  coPay(d) {
    const a = ((coEl(d.id) || {}).achats || []).find(x => x.id === d.x);
    if (!a) return;
    const ech = d.ech || coPayEch(a) || [{ s: 0, m: +a.prix || 0, ok: a.d }],
      row = (x, i) =>
        `<div class="copech"><div class="fld"><label for="co-es${i}">Séance</label><input id="co-es${i}" class="co-es" type="number" min="0" value="${+x.s || 0}" data-ok="${esc(x.ok || '')}"></div><div class="fld"><label for="co-em${i}">Montant</label><input id="co-em${i}" class="co-em" type="number" min="0" step="any" value="${+x.m || 0}"></div><label class="copok"><input type="checkbox" class="co-eo" ${x.ok ? 'checked' : ''}>Payé</label></div>`;
    sheet(
      'Paiement · ' + (a.nom || 'Achat'),
      `<form class="body" id="co-pay" data-id="${d.id}" data-x="${d.x}"><p class="muted small">${esc(svName(d.id))} · acheté le ${fmtD(a.d)}${a.prix ? ' · ' + eur(a.prix) : ''}. Séance : à quelle séance le paiement est attendu (0 : tout de suite).</p>${ech.map(row).join('')}<div class="row" style="gap:8px;align-items:flex-end"><div class="fld grow"><label for="co-pn">Nombre de paiements</label><input id="co-pn" type="number" min="1" max="12" value="${ech.length}"></div><button type="button" class="btn ghost" data-a="coPayN" data-id="${d.id}" data-x="${d.x}">Répartir</button></div>${O('co-pmo', 'Moyen de paiement (facultatif)', 'Espèces, virement, Shopify', (a.pay || {}).moyen)}<button class="btn full">Enregistrer</button></form>`
    );
  },
  /* nouvelle répartition : ce qui est déjà payé ne bouge pas */
  coPayN(d) {
    const a = ((coEl(d.id) || {}).achats || []).find(x => x.id === d.x),
      paid = coPayRead().filter(x => x.ok),
      n = Math.max(paid.length || 1, Math.min(12, parseInt($('co-pn').value, 10) || 1));
    A.coPay({
      id: d.id,
      x: d.x,
      ech: n === 1 && !paid.length ? [{ s: 0, m: +a.prix || 0, ok: '' }] : coPaySplit(a, n, paid)
    });
  }
});
const coPayRead = () =>
  [...document.querySelectorAll('#co-pay .copech')].map(r => {
    const on = r.querySelector('.co-eo').checked,
      was = r.querySelector('.co-es').dataset.ok;
    return {
      s: +r.querySelector('.co-es').value || 0,
      m: +r.querySelector('.co-em').value || 0,
      ok: on ? was || TODAY : ''
    };
  });
document.addEventListener('submit', e => {
  if (e.target.id !== 'co-pay') return;
  e.preventDefault();
  const f = e.target,
    a = ((coEl(f.dataset.id) || {}).achats || []).find(x => x.id === f.dataset.x);
  if (!a) return;
  const moyen = $('co-pmo').value.trim().slice(0, 60);
  a.pay = { ech: coPayRead() };
  if (moyen) a.pay.moyen = moyen;
  closeSheet();
  coSave('Paiement enregistré');
});

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
      )}${ofVente('co-fv', f)}<div class="cotools"><button class="btn">Enregistrer</button>${d.id === 'new' ? '' : ofDel('coFoDel', d.id)}</div></form>`
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
      `<form class="body" id="co-pk" data-id="${p.id || 'new'}" data-f="${p.formule}"><p class="muted small">${f ? esc(f.nom) + ' · ' + foKind(f) + ' · ' + minTxt(f.duree) + ' · à l’unité : ' + foPrice(f) : ''}</p>${O('co-kn', 'Nom du pack (facultatif)', 'Pack Découverte, Perfectionnement…', p.nom)}${ofNum('co-ks', 'Nombre de séances', p.seances, 1)}${ofNum('co-kp', 'Prix du pack en euros', p.prix)}<p class="muted small" id="co-kx"></p><span class="kicker">Paiement en plusieurs fois</span><div id="co-kr" class="stack">${(p.ech || []).map((s, i) => coKeRow(s, (p.echm || [])[i])).join('')}</div><button type="button" class="btn sm ghost full" data-a="coKeAdd">${ic('plus')}Ajouter un paiement</button><p class="muted small">À quelle séance chaque paiement est dû, et son montant. Vaut pour tous les élèves qui prennent ce pack. Sans montant : à parts égales. Sans ligne : tout d’un coup.</p>${ofVente('co-kv', p)}<div class="cotools"><button class="btn">Enregistrer</button>${p.id ? ofDel('coPkDel', p.id) : ''}</div></form>`
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
      parSemaine: 1,
      ens: d.ens || ''
    };
    sheet(
      d.id === 'new' ? 'Nouvel abonnement' : 'Abonnement',
      `<form class="body" id="co-ab" data-id="${d.id}">${F('co-an', 'Nom', 'Academy, abonnement performance…', a.nom)}${O('co-ag', 'Ensemble (facultatif)', 'Pour regrouper des variantes : Academy', a.ens)}${O('co-amy', 'Moyen de paiement (facultatif)', 'Espèces, virement, Shopify', a.moyen)}${ofSel('co-af', 'Formule comprise', [['', 'Aucune en particulier']].concat(OFFRES.formules.map(f => [f.id, ofLabel('f', f.id) + ' · ' + foKind(f)])), a.formule)}${ofNum('co-aw', 'Séances par semaine', a.parSemaine, 1)}${ofNum('co-ap', 'Prix en euros', a.prix)}${ofSel(
        'co-ae',
        'Par',
        PERIODES.map(x => [x, x]),
        a.periode
      )}${ofNum('co-ad', 'Engagement (nombre de périodes)', a.duree, 1)}${ofVente('co-av', a)}<div class="cotools"><button class="btn">Enregistrer</button>${d.id === 'new' ? '' : ofDel('coAbDel', d.id)}</div></form>`
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
      `<form class="body" id="co-ac" data-id="${d.id}">${ofSel('co-ao', 'Produit', opts, opts[0][0])}${Dt('co-ad2', 'Date d’achat', true, TODAY)}${O('co-ax', 'Prix payé en euros (facultatif)', 'Prix du produit')}${ofSel(
        'co-ast',
        'Règlement',
        [
          ['paye', 'Payé'],
          ['due', 'À payer'],
          ['plus', 'En plusieurs fois']
        ],
        'paye'
      )}${O('co-aps', 'Paiement demandé aux séances n° (facultatif)', '4  ou 1, 4, 8')}${O('co-apn', 'Nombre de paiements (en plusieurs fois)', '3')}${O('co-amo', 'Moyen de paiement (facultatif)', 'Espèces, virement, Shopify')}${O('co-an2', 'Note (facultatif)', 'Payé en 2 fois, offert…')}<button class="btn full">Enregistrer</button></form>`
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
      par: v('co-fpp'),
      ...ofVenteLue('co-fv')
    };
    if (f.dataset.id === 'new') OFFRES.formules.push(Object.assign({ id: nid('f') }, x));
    else Object.assign(foOf(f.dataset.id), x);
    closeSheet();
    ofSave('Formule enregistrée');
  }
  if (f.id === 'co-pk') {
    e.preventDefault();
    const x = {
        formule: f.dataset.f,
        nom: v('co-kn'),
        seances: Math.max(2, Math.round(n('co-ks'))),
        prix: n('co-kp'),
        ...ofVenteLue('co-kv')
      },
      lignes = [...document.querySelectorAll('#co-kr .co-ker')]
        .map(l => [Math.round(+l.querySelector('.co-kes').value), l.querySelector('.co-kem').value])
        .filter(l => l[0] > 0)
        .sort((a, b) => a[0] - b[0]),
      montants = lignes.every(l => l[1] !== '') ? lignes.map(l => +l[1]) : [];
    if (montants.length && Math.abs(montants.reduce((a, b) => a + b, 0) - x.prix) >= 0.01)
      return toast('Les paiements doivent faire ' + eur(x.prix) + ' au total');
    x.ech = lignes.map(l => l[0]);
    x.echm = montants;
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
      duree: Math.max(1, Math.round(n('co-ad'))),
      ens: v('co-ag'),
      moyen: v('co-amy'),
      ...ofVenteLue('co-av')
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
    const reg = v('co-ast'),
      moy = v('co-amo').slice(0, 60);
    // des numéros de séance : le paiement est demandé à ces séances-là ; sinon ceux prévus par le pack
    const pk0 = t === 'pack' ? OFFRES.packs.find(p => p.id === ref) : null,
      nums = coCycleNums(v('co-aps')),
      prevus = nums.length ? nums : reg !== 'paye' && pk0 && (pk0.ech || []).length ? pk0.ech : [];
    const mont = pk0 && prevus === pk0.ech ? pk0.echm : null;
    if (reg === 'due')
      a.pay = { ech: prevus.length ? coPayPlan(a.prix, prevus, mont) : [{ s: 0, m: a.prix || 0, ok: '' }] };
    if (reg === 'plus')
      a.pay = {
        ech:
          prevus.length > 1 ? coPayPlan(a.prix, prevus, mont) : coPaySplit(a, Math.max(2, Math.round(n('co-apn')) || 3))
      };
    if (reg === 'paye' && nums.length) a.pay = { ech: coPayPlan(a.prix, nums) };
    if (moy) a.pay = Object.assign(a.pay || { ech: [{ s: 0, m: a.prix || 0, ok: d }] }, { moyen: moy });
    el.achats = (el.achats || []).concat(a);
    closeSheet();
    coSave('Achat noté');
  }
});
