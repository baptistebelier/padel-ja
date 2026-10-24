/* /RAM Club — app/10-niveaux.js : publications par niveaux des enseignants : formulaire (fourchettes de niveau,
   date unique ou chaque semaine) et inscriptions.
   Les fichiers app/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
const NV_MAX = 6;
/* une ligne de fourchette du formulaire : de, à, places */
function nvRow(i, sport, t) {
  const lv = sport === 'Padel' ? LV : RANKS,
    lo = t ? (sport === 'Padel' ? 'Niveau ' + t.lo : t.lo) : lv[Math.min(lv.length - 1, i * 3)],
    hi = t ? (sport === 'Padel' ? 'Niveau ' + t.hi : t.hi) : lv[Math.min(lv.length - 1, i * 3 + 2)],
    pl = String((t && t.places) || S.nvPl || 4);
  return `<div class="nv-row card" data-i="${i}"><div class="row"><b class="grow">Fourchette ${i + 1}</b>${i ? `<button type="button" class="ib" data-a="nvRowDel" data-i="${i}" aria-label="Retirer la fourchette ${i + 1}">${ic('x')}</button>` : ''}</div><div class="two">${Sel('nv-lo-' + i, sport === 'Padel' ? 'Niveau de' : 'Classement de', lv, lo)}${Sel('nv-hi-' + i, 'à', lv, hi)}</div>${Sel('nv-pl-' + i, 'Places', ['1', '2', '3', '4', '5', '6', '7', '8', '10', '12', '16'], pl)}</div>`;
}
/* fourchettes déjà saisies (pour les garder quand on change de sport ou qu'on en ajoute une) */
function nvRead(sport) {
  return [...document.querySelectorAll('#nv-tiers .nv-row')].map((r, i) => {
    const v = id => ($(id) || {}).value || '';
    const num = x => +String(x).replace(/\D+/g, '');
    return sport === 'Padel'
      ? { lo: num(v('nv-lo-' + i)), hi: num(v('nv-hi-' + i)), places: +v('nv-pl-' + i) || 1 }
      : { lo: v('nv-lo-' + i), hi: v('nv-hi-' + i), places: +v('nv-pl-' + i) || 1 };
  });
}
function nvTiers(sport, list) {
  const box = $('nv-tiers');
  if (box) box.innerHTML = list.map((t, i) => nvRow(i, sport, t)).join('');
  const add = $('nv-add');
  if (add) add.hidden = list.length >= NV_MAX;
}
Object.assign(A, {
  /* créer une partie dirigée ou une séance collective (enseignants et bureau) */
  nvNew(d) {
    if (!isAdmin()) return;
    const cours = d.m === 'cours';
    S.nvPl = cours ? 6 : 4;
    sheet(
      cours ? 'Séance collective' : 'Partie dirigée',
      `<form class="body" id="nv-form" data-m="${cours ? 'cours' : 'partie'}">${cours ? F('nv-theme', 'Thème de la séance', 'Service et retour, jeu au filet…') : ''}${O('nv-body', 'Précisions (facultatif)', cours ? 'Ce que l’on travaille, matériel…' : 'Format, court…')}
 <div class="two">${Sel('nv-sport', 'Sport', ['Tennis', 'Padel'])}${cours ? '' : Sel('nv-fmt', 'Format', ['Double', 'Simple'], 'Double')}</div>
 ${Dt('a-d1', cours ? 'Date (première séance)' : 'Date', 1)}<div class="two">${Sel('a-h1', 'Heure', HOURS, '18 h')}${Sel('a-dur', 'Durée', ['1 h', '1 h 30', '2 h'], '1 h 30')}</div>${O('nv-place', 'Lieu (facultatif)', 'Court 3, salle…')}${O('nv-price', 'Tarif', cours ? '15 € par séance' : '10 € par joueur')}
 ${cours ? Sel('nv-rep', 'Récurrence', ['Une seule fois', 'Chaque semaine · 4 semaines', 'Chaque semaine · 6 semaines', 'Chaque semaine · 8 semaines', 'Chaque semaine · 10 semaines', 'Chaque semaine · 12 semaines']) : ''}
 <div class="fld"><span class="lb">Fourchettes de niveau</span><p class="muted small">Chaque adhérent ne voit que la fourchette de son niveau. La première fourchette complète valide ${cours ? 'la séance' : 'la partie'} ; les inscrits des autres passent en liste d'attente.</p></div>
 <div id="nv-tiers" class="stack"></div><button type="button" class="btn ghost full" id="nv-add" data-a="nvRowAdd">${ic('plus')}Ajouter une fourchette</button>
 <button class="btn full">${cours ? 'Proposer la séance' : 'Publier la recherche'}</button></form>`
    );
    nvTiers('Tennis', [null, null]);
  },
  nvRowAdd() {
    const sp = $('nv-sport').value,
      l = nvRead(sp);
    if (l.length >= NV_MAX) return;
    nvTiers(sp, [...l, null]);
  },
  nvRowDel(d) {
    const sp = $('nv-sport').value,
      l = nvRead(sp);
    l.splice(+d.i, 1);
    nvTiers(sp, l);
  },
  /* choisir la date affichée d'une séance récurrente */
  nvDay(d) {
    S.nvd = S.nvd || {};
    S.nvd[d.id] = d.d;
    render(true);
  },
  /* s'inscrire (ou se désinscrire) dans sa fourchette, pour une date */
  nvJoin(d) {
    const p = posts.find(x => x.id === d.id);
    if (!p || !p.nv) return;
    const nv = p.nv,
      k = d.d + '|' + d.t,
      me = ME();
    nv.ins = nv.ins || {};
    nv.at = nv.at || {};
    const l = (nv.ins[k] = nv.ins[k] || []),
      i = l.indexOf(me);
    if (i >= 0) {
      l.splice(i, 1);
      if (nv.at[me]) delete nv.at[me][d.d];
    } else {
      l.push(me);
      (nv.at[me] = nv.at[me] || {})[d.d] = Date.now();
    }
    render(true);
    const s = nvState(nv, d.d).status[d.t + '|' + me];
    toast(
      i >= 0
        ? `${first(p.by)} est prévenu de ton désistement`
        : s === 'ok'
          ? `C’est validé : ${nv.mode === 'cours' ? 'la séance' : 'la partie'} est complète`
          : s === 'wait'
            ? 'Tu es sur la liste d’attente · prévenu si une place se libère'
            : `C’est noté · ${first(p.by)} est prévenu`
    );
  }
});
/* changer de sport remplace les listes de niveaux (classements tennis ou niveaux padel) */
document.addEventListener('change', e => {
  if (e.target.id !== 'nv-sport') return;
  const n = document.querySelectorAll('#nv-tiers .nv-row').length || 2;
  nvTiers(
    e.target.value,
    Array.from({ length: n }, () => null)
  );
});
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id !== 'nv-form') return;
  const val = id => ($(id) ? $(id).value.trim() : ''),
    cours = f.dataset.m === 'cours',
    sport = val('nv-sport'),
    tiers = nvRead(sport).map((t, i) => {
      // une fourchette se lit toujours du plus bas au plus haut
      const swap = sport === 'Padel' ? t.lo > t.hi : rIdx(t.lo) > rIdx(t.hi);
      return { id: 't' + (i + 1), lo: swap ? t.hi : t.lo, hi: swap ? t.lo : t.hi, places: t.places };
    }),
    weeks = cours ? +(val('nv-rep').match(/(\d+) semaines/) || [0, 1])[1] : 1,
    d0 = val('a-d1') || isoIn(1);
  if (!tiers.length) return toast('Ajoute au moins une fourchette de niveau');
  posts.unshift({
    id: 'p' + Date.now(),
    by: ME(),
    t: "À l'instant",
    at: Date.now(),
    kind: 'niveaux',
    likes: 0,
    com: [],
    nv: {
      mode: cours ? 'cours' : 'partie',
      sport,
      theme: cours ? val('nv-theme') : '',
      body: val('nv-body'),
      fmt: cours ? '' : val('nv-fmt'),
      time: val('a-h1'),
      dur: val('a-dur'),
      place: val('nv-place'),
      price: val('nv-price'),
      dates: Array.from({ length: weeks }, (_, i) => isoIn(7 * i, d0)),
      tiers,
      ins: {},
      at: {}
    }
  });
  const n = adults().filter(k => k !== ME() && tiers.some(t => nvFits(t, k, sport))).length;
  closeSheet();
  S.tab = 'home';
  S.stack = [];
  render();
  toast(
    `${cours ? 'Séance proposée' : 'Recherche publiée'} · visible par ${n} adhérent${n > 1 ? 's' : ''} des fourchettes choisies`
  );
});
