/* /Buvette — app/10-niveaux.js : publications par niveaux des enseignants : formulaire (fourchettes de niveau,
   date unique ou chaque semaine) et inscriptions.
   Les fichiers app/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
const NV_MAX = 6;
const NV_PLACES = ['1', '2', '3', '4', '5', '6', '7', '8', '10', '12', '16'];
/* Modèles de fourchettes : enregistrés une fois, rechargés d'un toucher à chaque partie ou séance.
   Gardés dans mes réglages (synchronisés entre mes appareils, /Buvette et /Dojo), 20 au plus. */
const NV_MOD_MAX = 20;
// aussi gardés sur l'appareil : /Dojo ne synchronise pas ces réglages
const nvMods = () => {
  if (!Array.isArray(S.nvModeles))
    try {
      S.nvModeles = JSON.parse(localStorage.getItem('nv-modeles') || '[]');
    } catch (e) {
      S.nvModeles = [];
    }
  return S.nvModeles;
};
const nvModsKeep = () => {
  try {
    localStorage.setItem('nv-modeles', JSON.stringify(S.nvModeles || []));
  } catch (e) {}
  if (typeof ramSave === 'function') ramSave();
};
function nvModsHtml() {
  const l = nvMods();
  return `<div class="fld nv-mods"><span class="lb">Mes fourchettes enregistrées</span>${
    l.length
      ? `<div class="chips wrap">${l.map(m => `<span class="chip nv-mod"><button type="button" data-a="nvModLoad" data-id="${esc(m.id)}">${esc(m.n)}<small>${m.sport} · ${m.tiers.length} fourchette${m.tiers.length > 1 ? 's' : ''}</small></button><button type="button" class="nv-mod-x" data-a="nvModDel" data-id="${esc(m.id)}" aria-label="Supprimer le modèle ${esc(m.n)}">${ic('x')}</button></span>`).join('')}</div>`
      : '<p class="muted small">Aucune pour l’instant : règle tes fourchettes ci-dessous, puis enregistre-les pour la prochaine fois.</p>'
  }</div>`;
}
const nvSaveHtml = () =>
  `<div class="nv-save"><input id="nv-mod-n" maxlength="40" placeholder="Nom : Mardi compétiteurs, Ados…" aria-label="Nom du modèle de fourchettes" autocomplete="off"><button type="button" class="btn sm ghost" data-a="nvModSave">${ic('star')}Enregistrer ces fourchettes</button></div>`;
/* une ligne de fourchette du formulaire : nom, de, à, minimum, maximum */
function nvRow(i, sport, t) {
  const lv = sport === 'Padel' ? LV : RANKS,
    lo = t ? (sport === 'Padel' ? 'Niveau ' + t.lo : t.lo) : lv[Math.min(lv.length - 1, i * 3)],
    hi = t ? (sport === 'Padel' ? 'Niveau ' + t.hi : t.hi) : lv[Math.min(lv.length - 1, i * 3 + 2)],
    pl = String((t && t.places) || S.nvPl || 4);
  return `<div class="nv-row card" data-i="${i}"><div class="row"><b class="grow">Fourchette ${i + 1}</b>${i ? `<button type="button" class="ib" data-a="nvRowDel" data-i="${i}" aria-label="Retirer la fourchette ${i + 1}">${ic('x')}</button>` : ''}</div><div class="two">${Sel('nv-lo-' + i, sport === 'Padel' ? 'Niveau de' : 'Classement de', lv, lo)}${Sel('nv-hi-' + i, 'à', lv, hi)}</div><div class="fld"><label for="nv-no-${i}">Nom du groupe (facultatif)</label><input id="nv-no-${i}" maxlength="40" placeholder="Débutants, confirmés…" value="${esc((t && t.nom) || '')}"></div><div class="two">${Sel('nv-pl-' + i, 'Minimum', NV_PLACES, pl)}${Sel('nv-mx-' + i, 'Maximum', NV_PLACES, String((t && t.max) || pl))}</div></div>`;
}
/* fourchettes déjà saisies (pour les garder quand on change de sport ou qu'on en ajoute une) */
function nvRead(sport) {
  return [...document.querySelectorAll('#nv-tiers .nv-row')].map((r, i) => {
    const v = id => ($(id) || {}).value || '';
    const num = x => +String(x).replace(/\D+/g, '');
    const fin = { places: +v('nv-pl-' + i) || 1, max: +v('nv-mx-' + i) || 1, nom: v('nv-no-' + i).trim() };
    return Object.assign(
      sport === 'Padel'
        ? { lo: num(v('nv-lo-' + i)), hi: num(v('nv-hi-' + i)) }
        : { lo: v('nv-lo-' + i), hi: v('nv-hi-' + i) },
      fin
    );
  });
}
function nvTiers(sport, list) {
  const box = $('nv-tiers');
  if (box) box.innerHTML = list.map((t, i) => nvRow(i, sport, t)).join('');
  const add = $('nv-add');
  if (add) add.hidden = list.length >= NV_MAX;
}
/* séance collective récurrente (demande de Baptiste, 23/11/2026) : une date de fin, les vacances de l'enseignant et du club
   sautées ou non, et des inscriptions ouvertes par niveau ou un groupe complet dès le départ */
const NV_REP = ['Une seule fois', 'Chaque semaine', 'Une semaine sur deux'],
  NV_INS = ['Ouvertes aux adhérents, par niveau', 'Complet dès le départ'];
/* vacances de l'enseignant et du club en cours (réglées dans /Dojo) */
const nvVacances = () =>
  typeof OFFRES === 'undefined'
    ? []
    : (OFFRES.conges || []).concat((OFFRES.vacClubs || {})[(window.RAM && RAM.club) || ''] || []);
/* les dates d'une séance : la première, puis chaque semaine ou une sur deux jusqu'à la date de fin, sans les vacances si demandé */
function nvDates(d0, rep, fin, vac) {
  if (rep === NV_REP[0] || !fin || fin < d0) return [d0];
  const pas = rep === NV_REP[2] ? 14 : 7,
    off = vac ? nvVacances() : [],
    out = [];
  for (let d = d0, i = 0; d <= fin && i < 60; d = isoIn(pas, d), i++)
    if (!off.some(p => d >= p.du && d <= p.au)) out.push(d);
  return out.length ? out : [d0];
}
/* élèves que l'enseignant peut mettre dans un groupe complet */
function nvMemHtml(sel) {
  const l = (typeof coStudents === 'function' ? coStudents() : adults())
    .filter(k => k !== ME())
    .sort((a, b) => svName(a).localeCompare(svName(b)));
  if (!l.length) return '<p class="muted small">Aucun élève pour l’instant : tu pourras les ajouter au planning.</p>';
  return `<div class="stack nv-mem">${l.map(k => `<label class="chk"><input type="checkbox" name="nv-mem" value="${esc(k)}" ${sel.includes(k) ? 'checked' : ''}>${esc(svName(k))}</label>`).join('')}</div>`;
}
/* ce qui s'affiche selon les choix : la date de fin pour une récurrence, les élèves ou les fourchettes */
function nvVisibles() {
  const rec = $('nv-rec'),
    rep = $('nv-rep'),
    ins = $('nv-ins');
  if (rec && rep) rec.hidden = rep.value === NV_REP[0];
  const complet = !!ins && ins.value === NV_INS[1];
  if ($('nv-mem')) $('nv-mem').hidden = !complet;
  if ($('nv-niv')) $('nv-niv').hidden = complet;
}
document.addEventListener('change', e => {
  if (e.target.id === 'nv-rep' || e.target.id === 'nv-ins') nvVisibles();
});
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
 ${Dt('a-d1', cours ? 'Date (première séance)' : 'Date', 1)}<div class="two">${Sel('a-h1', 'Heure', HOURS, '18 h')}${Sel('a-dur', 'Durée', ['1 h', '1 h 30', '2 h'], '1 h 30')}</div>${O('nv-place', 'Lieu (facultatif)', 'Court 3, salle…')}${typeof prixChoix === 'function' ? prixChoix('nv-price', '', cours ? '15 € par séance' : '10 € par joueur') : O('nv-price', 'Tarif', cours ? '15 € par séance' : '10 € par joueur')}
 ${cours ? `${Sel('nv-rep', 'Récurrence', NV_REP)}<div id="nv-rec" hidden>${Dt('nv-fin', 'Dernière séance (date de fin)', false, isoIn(70))}<div class="fld"><label class="chk" for="nv-vac"><input type="checkbox" id="nv-vac" checked>Pas de séance pendant mes vacances et celles du club</label></div></div>${Sel('nv-ins', 'Inscriptions', NV_INS)}<div id="nv-mem" class="fld" hidden><span class="lb">Élèves du groupe (facultatif)</span>${nvMemHtml([])}</div>` : ''}
 <div id="nv-niv"><div class="fld"><span class="lb">Fourchettes de niveau</span><p class="muted small">Chaque adhérent ne voit que la fourchette de son niveau. La première à atteindre son minimum valide ${cours ? 'la séance' : 'la partie'}, qui arrive alors au planning ; les inscrits des autres passent en liste d'attente. Avant, rien n'est bloqué.</p></div>
 <div id="nv-mods-box">${nvModsHtml()}</div><div id="nv-tiers" class="stack"></div><button type="button" class="btn ghost full" id="nv-add" data-a="nvRowAdd">${ic('plus')}Ajouter une fourchette</button>${nvSaveHtml()}</div>
 <button class="btn full">${cours ? 'Proposer la séance' : 'Publier la recherche'}</button></form>`
    );
    nvTiers('Tennis', [null, null]);
    nvVisibles();
  },
  /* modèles de fourchettes */
  nvModSave() {
    const sp = $('nv-sport').value,
      tiers = nvRead(sp),
      n = (($('nv-mod-n') || {}).value || '').trim();
    if (!n) {
      toast('Donne un nom au modèle (par exemple « Mardi compétiteurs »)');
      if ($('nv-mod-n')) $('nv-mod-n').focus();
      return;
    }
    const l = nvMods().filter(m => m.n.toLowerCase() !== n.toLowerCase());
    if (l.length >= NV_MOD_MAX) return toast(NV_MOD_MAX + ' modèles au plus : supprimes-en un');
    l.unshift({ id: 'm' + Date.now().toString(36), n: esc(n).slice(0, 60), sport: sp, tiers });
    S.nvModeles = l;
    $('nv-mod-n').value = '';
    $('nv-mods-box').innerHTML = nvModsHtml();
    nvModsKeep();
    toast(`Fourchettes « ${n} » enregistrées`);
  },
  nvModLoad(d) {
    const m = nvMods().find(x => x.id === d.id);
    if (!m || !$('nv-sport')) return;
    if ($('nv-sport').value !== m.sport) {
      $('nv-sport').value = m.sport;
      $('nv-sport').dispatchEvent(new Event('change', { bubbles: true }));
    }
    nvTiers(m.sport, m.tiers.slice(0, NV_MAX));
    toast(`Fourchettes « ${m.n.replace(/&amp;/g, '&')} » chargées`);
  },
  nvModDel(d) {
    const m = nvMods().find(x => x.id === d.id);
    if (!m) return;
    S.nvModeles = nvMods().filter(x => x.id !== d.id);
    if ($('nv-mods-box')) $('nv-mods-box').innerHTML = nvModsHtml();
    nvModsKeep();
    toast('Modèle supprimé');
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
      return Object.assign(
        { id: 't' + (i + 1), lo: swap ? t.hi : t.lo, hi: swap ? t.lo : t.hi, places: t.places },
        t.nom ? { nom: t.nom } : {},
        t.max > t.places ? { max: t.max } : {}
      );
    }),
    d0 = val('a-d1') || isoIn(1),
    // récurrence jusqu'à une date de fin, vacances sautées ou non ; groupe complet dès le départ ou inscriptions ouvertes
    rec =
      cours && val('nv-rep') !== NV_REP[0]
        ? { pas: val('nv-rep') === NV_REP[2] ? 14 : 7, fin: val('nv-fin'), vac: !!($('nv-vac') && $('nv-vac').checked) }
        : null,
    lesDates = cours ? nvDates(d0, val('nv-rep'), val('nv-fin'), rec && rec.vac) : [d0],
    complet = cours && val('nv-ins') === NV_INS[1],
    membres = complet ? [...document.querySelectorAll('input[name="nv-mem"]:checked')].map(x => x.value) : [],
    extra = Object.assign(
      { rec: rec || undefined },
      complet ? { complet: true, membres } : { complet: undefined, membres: undefined }
    );
  if (rec && (!rec.fin || rec.fin < d0)) return toast('Choisis une date de fin après la première séance');
  if (!complet && !tiers.length) return toast('Ajoute au moins une fourchette de niveau');
  if (typeof prixOk === 'function' && !prixOk('nv-price')) return;
  if (f.dataset.edit) {
    const p = posts.find(x => x.id === f.dataset.edit),
      o = p.nv,
      dates = lesDates,
      prises = Object.entries(o.ins || {}).filter(([, l]) => (l || []).length);
    if (complet && prises.length) return toast('Il y a des inscrits : la séance reste ouverte aux inscriptions');
    // une fourchette ou une date qui a des inscrits ne disparaît pas ; une date déplacée les garde
    if (prises.some(([q]) => !tiers.some(t => t.id === q.split('|')[1])))
      return toast('Une fourchette retirée a des inscrits : garde-la');
    if (prises.some(([q]) => o.dates.indexOf(q.split('|')[0]) >= dates.length))
      return toast('Une date retirée a des inscrits : garde-la');
    if (prises.length && sport !== o.sport) return toast('Il y a des inscrits : le sport ne change plus');
    const versNew = d => dates[o.dates.indexOf(d)] || d,
      ins = {},
      at = {};
    Object.entries(o.ins || {}).forEach(([q, l]) => {
      const [d, t] = q.split('|');
      ins[versNew(d) + '|' + t] = l;
    });
    Object.entries(o.at || {}).forEach(([k, m]) => {
      at[k] = {};
      Object.entries(m || {}).forEach(([d, v]) => (at[k][versNew(d)] = v));
    });
    p.nv = Object.assign({}, o, {
      sport,
      theme: cours ? val('nv-theme') : '',
      body: val('nv-body'),
      fmt: cours ? '' : val('nv-fmt'),
      time: val('a-h1'),
      dur: val('a-dur'),
      place: val('nv-place'),
      price: typeof prixLu === 'function' ? prixLu('nv-price') : val('nv-price'),
      dates,
      tiers: complet ? [] : tiers,
      ins,
      at,
      ...extra
    });
    closeSheet();
    render(true);
    return toast('Modifié · les inscrits sont prévenus');
  }
  const newId = 'p' + Date.now();
  posts.unshift({
    id: newId,
    by: ME(),
    t: "À l'instant",
    at: Date.now(),
    kind: 'niveaux',
    mur: false, // dans sa section (École, Collectifs) ; le bouton « Promouvoir sur le mur » l'y met
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
      price: typeof prixLu === 'function' ? prixLu('nv-price') : val('nv-price'),
      dates: lesDates,
      tiers: complet ? [] : tiers,
      ins: {},
      at: {},
      lien: { t: nvTok() },
      ...extra
    }
  });
  const n = adults().filter(k => k !== ME() && tiers.some(t => nvFits(t, k, sport))).length;
  closeSheet();
  S.stack = [];
  // /Dojo : retour au planning ; /Buvette : sa page, avec le bouton pour la promouvoir
  if (typeof coPlanning === 'function') S.tab = 'planning';
  else {
    S.tab = 'ecole';
    S.ecTab = 'coll';
    S.stack.push({ v: 'post', id: newId });
  }
  render();
  if (complet)
    return toast(
      `Séance programmée · ${lesDates.length} date${lesDates.length > 1 ? 's' : ''} au planning, complète dès le départ`
    );
  if (nvLienUrl(posts.find(x => x.id === newId))) setTimeout(() => nvLienSheet(newId), 0);
  toast(
    `${cours ? 'Séance proposée' : 'Partie proposée'} · visible par ${n} adhérent${n > 1 ? 's' : ''} des fourchettes choisies, à toi de la promouvoir sur le mur`
  );
});
/* modifier une séance collective ou une partie dirigée : son formulaire, déjà rempli */
function nvEdit(p) {
  const nv = p.nv,
    cours = nv.mode === 'cours',
    put = (id, v) => $(id) && v != null && ($(id).value = v);
  A.nvNew({ m: nv.mode });
  const f = $('nv-form');
  if (!f) return;
  f.dataset.edit = p.id;
  put('nv-theme', nv.theme);
  put('nv-body', nv.body);
  put('nv-sport', nv.sport);
  put('nv-fmt', nv.fmt);
  put('a-d1', (nv.dates || [])[0]);
  put('a-h1', nv.time);
  put('a-dur', nv.dur);
  put('nv-place', nv.place);
  if (typeof prixSet === 'function') prixSet('nv-price', nv.price);
  else put('nv-price', nv.price);
  if (cours && (nv.dates || []).length > 1) {
    // récurrence : celle notée (date de fin, vacances), sinon déduite des dates (anciennes séances : chaque semaine)
    const r = nv.rec || { pas: 7, fin: nv.dates[nv.dates.length - 1], vac: false };
    put('nv-rep', r.pas === 14 ? NV_REP[2] : NV_REP[1]);
    put('nv-fin', r.fin);
    if ($('nv-vac')) $('nv-vac').checked = !!r.vac;
  }
  if (cours && nv.complet) {
    put('nv-ins', NV_INS[1]);
    if ($('nv-mem'))
      $('nv-mem').innerHTML = '<span class="lb">Élèves du groupe (facultatif)</span>' + nvMemHtml(nv.membres || []);
  }
  nvVisibles();
  nvTiers(nv.sport, nv.tiers);
  if (Object.values(nv.ins || {}).some(l => (l || []).length)) $('nv-sport').disabled = true;
  f.querySelector('button:not([type=button])').textContent = 'Enregistrer';
  const h = document.querySelector('#sheet header h2, #sheet header .h');
  if (h) h.textContent = 'Modifier';
}
/* Lien public d'inscription (sans compte) : coach.riseandmove.fr/i/club/publication/jeton.
   Le jeton, propre à la publication et impossible à deviner, est posé dans nv.lien.t ; nv.lien.off coupe le lien.
   Les publications déjà ouvertes reçoivent le leur au premier « Copier le lien ». Le serveur applique les mêmes règles que ci-dessus. */
const nvTok = () => {
  const a = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...a))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};
const nvLienUrl = p => {
  if (!(window.RAM && RAM.live && RAM.club) || !p.nv.lien || !p.nv.lien.t) return '';
  const h = /riseandmove\.fr$/.test(location.hostname)
    ? RAM_NOMS.urlDepuis('coach', location.hostname)
    : location.origin;
  return h + '/i/' + encodeURIComponent(RAM.club) + '/' + encodeURIComponent(p.id) + '/' + p.nv.lien.t;
};
const nvLienEnsure = p => {
  if (!p.nv.lien || !p.nv.lien.t) p.nv.lien = Object.assign({}, p.nv.lien, { t: nvTok() });
  return p.nv.lien;
};
const nvLienPost = d => {
  const p = posts.find(x => x.id === d.id);
  return p && p.nv && !p.nv.demande ? p : null;
};
const nvLienCopie = u =>
  navigator.clipboard
    ? navigator.clipboard.writeText(u).then(
        () => toast('Lien copié'),
        () => toast(u)
      )
    : toast(u);
/* la fenêtre du lien, ouverte après la création d'une séance ou d'une partie */
function nvLienSheet(id) {
  const p = posts.find(x => x.id === id),
    u = p && nvLienUrl(p);
  if (!u) return;
  sheet(
    'Lien d’inscription',
    `<div class="body"><p class="muted small">Donne ce lien en ligne : les personnes sans compte s’inscrivent d’elles-mêmes dans la fourchette de leur niveau. Tu peux le couper à tout moment depuis la publication.</p><p class="small" style="word-break:break-all">${esc(u)}</p><div class="ctl" style="flex-wrap:wrap"><button class="btn grow" data-a="nvLienCopy" data-id="${id}">${ic('link')}Copier le lien</button><button class="btn ghost grow" data-a="nvLienShare" data-id="${id}">${ic('send')}Partager</button></div></div>`
  );
}
Object.assign(A, {
  nvLienCopy(d) {
    const p = nvLienPost(d);
    if (!p) return;
    nvLienEnsure(p);
    render(true);
    nvLienCopie(nvLienUrl(p));
  },
  nvLienShare(d) {
    const p = nvLienPost(d);
    if (!p) return;
    nvLienEnsure(p);
    render(true);
    const u = nvLienUrl(p),
      t = p.nv.mode === 'cours' ? p.nv.theme || 'Séance collective' : 'Partie dirigée';
    if (navigator.share) navigator.share({ title: t, text: t + ' : inscris-toi ici', url: u }).catch(() => {});
    else nvLienCopie(u);
  },
  nvLienToggle(d) {
    const p = nvLienPost(d);
    if (!p) return;
    const l = nvLienEnsure(p);
    if (l.off) delete l.off;
    else l.off = true;
    render(true);
    toast(l.off ? 'Lien coupé : plus personne ne s’inscrit par ce lien' : 'Lien réactivé');
  }
});
