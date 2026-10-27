/* /RAM Coach — coach/3-actions.js : titres des pages, gestes et formulaires de l'enseignant, minuteur.
   Chaque changement passe par les listes partagées (GROUPS, ELEVES, SEANCES, SUIVI) : la synchronisation
   du Club (ram-sync.js) l'envoie au serveur, et les élèves le retrouvent dans /RAM Club. */
Object.assign(TITLES, {
  today: () => ["Aujourd'hui", fmtD(TODAY)],
  planning: () => ['Planning', S.plScope === 'ecole' ? "Toute l'école" : 'Mes cours'],
  eleves: () => ['Élèves', 'Fiches et progression'],
  msgs: () => ['Messages', 'Élèves et groupes'],
  dash: () => [
    'Tableau de bord',
    S.coClub && S.coClub !== 'all'
      ? (coClubList().find(c => c.id === S.coClub) || {}).name || ''
      : coMulti()
        ? 'Tous mes clubs'
        : 'Mes statistiques'
  ],
  clubs: () => ['Mes clubs', 'Groupes et élèves de chaque club'],
  cclub: () => [(coClubList().find(c => c.id === view().id) || {}).name || 'Club', 'Mes groupes dans ce club'],
  niveaux: () => ['Échelles de niveaux', 'Prérequis et attendus'],
  seance: () => {
    const id = view().id,
      g = grp(id.slice(0, id.lastIndexOf('.')));
    return [g ? g.name : 'Séance', fmtD(id.slice(id.lastIndexOf('.') + 1))];
  },
  eleve: () => [svName(view().id), 'Fiche élève'],
  cgroupe: () => {
    const g = grp(view().id) || {};
    return [g.name || 'Groupe', coOver(g) ? 'Cycle terminé' : 'Groupe chaque semaine'];
  },
  histo: () => ['Historique des séances', 'Cours ponctuels et groupes']
});
ROLE.coach = 'Enseignant';
ROLE.admin = 'Bureau et enseignant';
/* une séance (créée à la première écriture) */
function sesGet(id) {
  let s = SEANCES.find(x => x.id === id);
  if (!s) {
    const i = id.lastIndexOf('.');
    s = { id, g: id.slice(0, i), d: id.slice(i + 1) };
    const g = grp(s.g);
    if (g && g._club) s._club = g._club; // séance d'un groupe d'un autre club : enregistrée dans ce club
    SEANCES.push(s);
  }
  return s;
}
/* appel : recopié dans celui du groupe (g.att, celui de /RAM Club, enregistré dans les présences du club) */
function coAtt(s, k, v) {
  const g = grp(s.g);
  if (!g || !M[k]) return;
  g.att = g.att || {};
  g.att[s.d] = g.att[s.d] || {};
  if (v) g.att[s.d][k] = v === 'P';
  else delete g.att[s.d][k];
}
/* petit saut du bouton touché (et confettis pour un niveau donné ou un bilan envoyé), sauf mouvement réduit */
function coPop(sel, burst) {
  const el = document.querySelector(sel);
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.classList.remove('copop');
  void el.offsetWidth;
  el.classList.add('copop');
  if (burst && typeof fxBurst === 'function') fxBurst(fxAt(el));
}
const coSave = msg => {
  render(true);
  if (msg) toast(msg);
};
Object.assign(A, {
  coGo(d) {
    S.coTab = d.k;
    A.tab({ t: d.t });
  },
  coWeek(d) {
    S.pl.w += +d.n;
    S.dir = +d.n;
    render();
  },
  coPres(d) {
    const s = sesGet(d.id);
    s.pres = s.pres || {};
    if (s.pres[d.k] === d.s) delete s.pres[d.k];
    else s.pres[d.k] = d.s;
    coAtt(s, d.k, s.pres[d.k]);
    render(true);
    coPop(`[data-a="coPres"][data-k="${d.k}"][data-s="${d.s}"]`);
  },
  coAllP(d) {
    const s = sesGet(d.id),
      g = grp(s.g);
    s.pres = s.pres || {};
    coStu(g).forEach(k => {
      if (!s.pres[k]) s.pres[k] = 'P';
      coAtt(s, k, s.pres[k]);
    });
    coSave('Tout le monde est présent');
  },
  coElF(d) {
    S.elF = d.v;
    render(true);
  },
  coStP(d) {
    S.stP = d.v;
    render(true);
  },
  coStWho() {
    S.stWho = S.stWho === 'ecole' ? 'me' : 'ecole';
    render(true);
  },
  coLvl(d) {
    const e = coElGet(d.id),
      n = +d.n;
    if (e.lvl === n) return;
    e.lvl = n;
    e.lvlH = (e.lvlH || []).filter(x => x.d !== TODAY).concat({ d: TODAY, lvl: n });
    coMemberLevel(d.id);
    coSave('Niveau ' + n + ' donné à ' + svFirst(d.id));
    coPop(`[data-a="coLvl"][data-n="${n}"]`, true);
  },
  coTech(d) {
    const e = coElGet(d.id);
    e.tech = e.tech || {};
    e.tech[d.t] = ((e.tech[d.t] || 0) % 4) + 1;
    render(true);
    coPop(`[data-a="coTech"][data-t="${d.t}"] .pips`);
  },
  coNewEl() {
    sheet(
      'Nouvel élève',
      `<form class="body" id="co-new">${F('co-n', 'Prénom et nom', '')}${O('co-mail', 'E-mail (pour le relier à son compte)', '')}${Sel('co-sp', 'Sport', ['Padel', 'Tennis'], 'Padel')}${Sel('co-g', 'Groupe', ['Aucun'].concat(coGroups('', true).map(g => g.name + (coMulti() ? ' · ' + coClubName(g) : ''))), 'Aucun')}<button class="btn full">Ajouter l'élève</button></form>`
    );
  },
  coEditEl(d) {
    const e = coElGet(d.id),
      p = (e.parents || [])[0] || {};
    sheet(
      'Fiche de ' + svFirst(d.id),
      `<form class="body" id="co-el" data-id="${d.id}">${Sel('co-sp', 'Sport', ['Padel', 'Tennis'], coSport(d.id))}${Sel('co-hand', 'Main', ['Droitier', 'Gaucher'], e.hand === 'G' ? 'Gaucher' : 'Droitier')}${Sel('co-side', 'Côté (padel)', ['–', 'Droite', 'Gauche', 'Les deux'], { D: 'Droite', G: 'Gauche', 2: 'Les deux' }[e.side] || '–')}${T('co-goals', 'Objectifs', '', e.goals)}${T('co-note', 'Note privée (équipe pédagogique)', '', e.note)}${O('co-pn', 'Parent : nom', '', p.n)}${O('co-pt', 'Parent : téléphone', '', p.tel)}${O('co-pm', 'Parent : e-mail', '', p.mail)}<button class="btn full">Enregistrer</button></form>`
    );
    $('co-goals').required = false;
    $('co-note').required = false;
  },
  /* élève sans compte : rattaché à l'adhérent qui vient de créer le sien ; il retrouve tout */
  coLink(d) {
    const cid = coClubOf(coEl(d.id)),
      cands = Object.keys(M).filter(k => k !== 'club' && !coEl(k) && coClubOf(M[k]) === cid);
    if (!cands.length) return toast('Aucun adhérent du club à relier');
    sheet(
      'Relier ' + svFirst(d.id),
      `<form class="body" id="co-link" data-id="${d.id}">${Who(
        'co-who',
        'Son compte /RAM Club',
        cands.sort((a, b) => name(a).localeCompare(name(b)))
      )}<p class="muted small">Sa fiche, ses séances, ses bilans et ses messages passent sur son compte.</p><button class="btn full">Relier</button></form>`
    );
  },
  coContent(d) {
    sheet(
      'Contenu pour ' + svFirst(d.id),
      `<form class="body" id="co-cont" data-id="${d.id}">${T('co-txt', 'Message', 'Exercice, conseil, vidéo à regarder…')}${O('co-url', 'Lien (facultatif)', 'Vidéo, document…')}<button class="btn full">${ic('send')}Envoyer</button></form>`
    );
  },
  coNewMsg() {
    const l = coStudents().sort((a, b) => svName(a).localeCompare(svName(b)));
    sheet(
      'Nouveau message',
      `<div class="body"><div class="menu">${l.map(k => `<button data-a="coOpenDm" data-id="${k}">${coAv(k)}${esc(svName(k))}</button>`).join('')}</div></div>`
    );
  },
  coOpenDm(d) {
    closeSheet();
    A.open({ v: 'dm', id: d.id });
  },
  coGrpEdit(d) {
    const g = grp(d.id),
      t = tarifOf(g),
      cs = Object.keys(M).filter(
        k =>
          k !== 'club' &&
          (window.RAM && RAM.live ? ['coach', 'bureau'].includes(RAM.roles[k]) : GROUPS.some(x => x.coach === k))
      );
    sheet(
      g.name,
      `<form class="body" id="co-grp" data-id="${g.id}">${coAll() && cs.length ? Who('co-coach', 'Enseignant', cs) : ''}${O('co-max', 'Nombre de places', '8', g.max || '')}${Sel('co-mode', 'Tarif', Object.values(TARIF_MODES), TARIF_MODES[t.mode])}${O('co-prix', 'Montant en euros', '60', t.prix || '')}<button class="btn full">Enregistrer</button></form>`
    );
    if ($('co-coach')) $('co-coach').value = g.coach || '';
    $('co-max').inputMode = 'numeric';
    $('co-prix').inputMode = 'decimal';
  },
  coAdd(d) {
    const g = grp(d.id),
      st = coStu(g),
      cid = coClubOf(g),
      cand = Object.keys(M)
        .filter(k => k !== 'club' && !st.includes(k) && coClubOf(M[k]) === cid)
        .concat(ELEVES.filter(e => !M[e.id] && !st.includes(e.id) && coClubOf(e) === cid).map(e => e.id))
        .sort((a, b) => svName(a).localeCompare(svName(b)));
    sheet(
      'Ajouter à ' + g.name,
      `<form class="body" id="co-add" data-id="${g.id}"><div class="fld"><input id="co-aq" type="search" placeholder="Rechercher" aria-label="Rechercher un adhérent"></div><div class="coadd">${cand.map(k => `<label class="corow" data-n="${esc(fold(svName(k)))}"><input type="checkbox" value="${k}">${coAv(k)}<span class="grow">${esc(svName(k))}${M[k] ? '' : ' <span class="tag">Sans compte</span>'}</span></label>`).join('')}</div><button class="btn full">Ajouter</button></form>`
    );
  },
  coRm(d) {
    const g = grp(d.g);
    g.mem = g.mem.filter(k => k !== d.k);
    if (g.ext) g.ext = g.ext.filter(k => k !== d.k);
    coSave(svFirst(d.k) + ' retiré du groupe');
  }
});
/* fiche d'un élève (créée à la première écriture, pour un adhérent qui n'en a pas encore) */
function coElGet(id) {
  let e = coEl(id);
  if (!e) {
    e = { id, n: svName(id), sport: coSport(id), parents: [] };
    const c = coStuClub(id);
    if (c !== coMainId()) e._club = c;
    ELEVES.push(e);
  }
  return e;
}
/* recherche d'élèves : la liste se redessine, la saisie garde le curseur */
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'co-q') {
    S.elQ = t.value;
    const p = t.selectionStart;
    render(true);
    const n = $('co-q');
    if (n) {
      n.focus();
      n.setSelectionRange(p, p);
    }
  }
  if (t.id === 'co-aq') {
    const q = fold(t.value);
    document.querySelectorAll('.coadd .corow').forEach(r => (r.hidden = !!q && !r.dataset.n.includes(q)));
  }
});
document.addEventListener('submit', e => {
  const f = e.target,
    id = f.dataset && f.dataset.id,
    val = x => ($(x) ? $(x).value.trim() : '');
  if (!/^co-/.test(f.id)) return;
  e.preventDefault();
  if (f.id === 'co-theme') {
    sesGet(id).theme = val('co-th');
    return coSave('Thème enregistré');
  }
  if (f.id === 'co-themes') {
    f.querySelectorAll('.co-t').forEach(i => {
      const v = i.value.trim(),
        s = SEANCES.find(x => x.id === id + '.' + i.dataset.d);
      if (v || s) sesGet(id + '.' + i.dataset.d).theme = v;
    });
    return coSave('Thèmes enregistrés : les élèves les voient dans leurs cours');
  }
  if (f.id === 'co-bilan') {
    const i0 = id.lastIndexOf('.'),
      g0 = grp(id.slice(0, i0)),
      same = b => b.id === id && (b._club || '') === ((g0 && g0._club) || ''),
      old = BROUILLONS.find(same);
    // « Garder en brouillon » : rien n'est envoyé aux élèves
    if (e.submitter && e.submitter.value === 'draft') {
      const perso = {};
      f.querySelectorAll('.co-perso').forEach(t => t.value.trim() && (perso[t.dataset.k] = t.value.trim()));
      const b = old || { id, g: id.slice(0, i0), d: id.slice(i0 + 1) };
      Object.assign(b, { recap: val('co-recap'), perso, at: Date.now(), by: coKeyIn(g0 && g0._club) });
      if (g0 && g0._club) b._club = g0._club;
      if (!old) BROUILLONS.push(b);
      return coSave('Brouillon enregistré : rien n’est encore envoyé aux élèves');
    }
    if (old) BROUILLONS.splice(BROUILLONS.indexOf(old), 1); // publié : le brouillon disparaît
    const s = sesGet(id);
    s.recap = val('co-recap');
    let n = 0;
    f.querySelectorAll('.co-perso').forEach(t => {
      const k = t.dataset.k,
        v = t.value.trim(),
        old = SUIVI.find(x => x.k === 'bilan' && x.ses === id && x.to === k);
      if (old) {
        if (old.txt !== v) old.txt = v;
        if (!v) SUIVI.splice(SUIVI.indexOf(old), 1);
      } else if (v) {
        svNew(k, 'bilan', { ses: id, txt: v });
        n++;
      }
    });
    setTimeout(() => coPop('#co-bilan .btn.full', true));
    return coSave(
      n ? 'Bilan envoyé, ' + plural(n, 'commentaire personnel', 'commentaires personnels') : 'Bilan enregistré'
    );
  }
  if (f.id === 'co-new') {
    const n = val('co-n');
    if (!n) return;
    const g = coGroups('', true).find(x => val('co-g').startsWith(x.name)),
      e2 = { id: 'e' + Date.now().toString(36), n, sport: val('co-sp'), mail: val('co-mail'), parents: [] };
    if (g && g._club) e2._club = g._club; // élève sans compte : rangé dans le club de son groupe
    ELEVES.push(e2);
    if (g) g.ext = (g.ext || []).concat(e2.id);
    closeSheet();
    S.elTab = 'fiche';
    A.open({ v: 'eleve', id: e2.id });
    return toast(n + ' ajouté');
  }
  if (f.id === 'co-el') {
    const e2 = coElGet(id);
    e2.sport = val('co-sp');
    e2.hand = val('co-hand') === 'Gaucher' ? 'G' : 'D';
    e2.side = { Droite: 'D', Gauche: 'G', 'Les deux': '2' }[val('co-side')] || '';
    e2.goals = val('co-goals');
    e2.note = val('co-note');
    e2.parents =
      val('co-pn') || val('co-pt') || val('co-pm') ? [{ n: val('co-pn'), tel: val('co-pt'), mail: val('co-pm') }] : [];
    closeSheet();
    return coSave('Fiche enregistrée');
  }
  if (f.id === 'co-link') {
    const k = val('co-who'),
      old = coEl(id);
    if (!k || !old) return;
    // la fiche, les groupes, les séances et le suivi passent sur le compte de l'adhérent
    ELEVES.splice(ELEVES.indexOf(old), 1);
    ELEVES.push(Object.assign({}, old, { id: k, n: name(k) }));
    GROUPS.forEach(g => {
      if ((g.ext || []).includes(id)) {
        g.ext = g.ext.filter(x => x !== id);
        if (!g.mem.includes(k)) g.mem.push(k);
      }
    });
    SEANCES.forEach(s => {
      if (s.pres && s.pres[id]) {
        s.pres[k] = s.pres[id];
        delete s.pres[id];
      }
    });
    SUIVI.forEach(x => {
      if (x.to === id) x.to = k;
    });
    closeSheet();
    S.stack[S.stack.length - 1] = { v: 'eleve', id: k };
    return coSave(svFirst(k) + ' est relié à son compte');
  }
  if (f.id === 'co-cont') {
    const t = val('co-txt');
    if (!t) return;
    svNew(id, 'contenu', { txt: t, url: toUrl(val('co-url')) || undefined });
    closeSheet();
    return coSave('Contenu envoyé à ' + svFirst(id));
  }
  if (f.id === 'co-grp') {
    const g = grp(id),
      mode = Object.keys(TARIF_MODES).find(k => TARIF_MODES[k] === val('co-mode')) || 'seance',
      prix = parseFloat(val('co-prix').replace(',', '.')) || 0,
      max = parseInt(val('co-max'), 10) || 0;
    if ($('co-coach') && val('co-coach') && val('co-coach') !== g.coach) {
      g.coach = val('co-coach');
      g.sub = g.sub ? g.sub.replace(/ · [^·]+$/, ' · ' + first(g.coach)) : g.sub;
    }
    g.tarif = { mode, prix };
    if (max) g.max = max;
    else delete g.max;
    closeSheet();
    return coSave('Groupe enregistré');
  }
  if (f.id === 'co-add') {
    const g = grp(id),
      ks = [...f.querySelectorAll('input[type=checkbox]:checked')].map(i => i.value);
    ks.forEach(k => {
      if (M[k]) {
        if (!g.mem.includes(k)) g.mem.push(k);
      } else g.ext = [...new Set((g.ext || []).concat(k))];
    });
    closeSheet();
    return coSave(ks.length ? plural(ks.length, 'élève ajouté', 'élèves ajoutés') : '');
  }
});

/* ---------- minuteur d'intervalles : travail, repos, séries, avec bips ---------- */
const TM = { work: 40, rest: 20, rounds: 8, on: false, phase: 'work', left: 40, round: 1, t: null };
let tmAudio;
function tmBeep(f, d) {
  try {
    tmAudio = tmAudio || new (window.AudioContext || window.webkitAudioContext)();
    const o = tmAudio.createOscillator(),
      g = tmAudio.createGain();
    o.frequency.value = f;
    o.connect(g);
    g.connect(tmAudio.destination);
    g.gain.setValueAtTime(0.25, tmAudio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, tmAudio.currentTime + d);
    o.start();
    o.stop(tmAudio.currentTime + d);
  } catch (e) {}
}
const tmFmt = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
function tmDraw() {
  const b = $('tmbox');
  if (!b) return;
  const fin = TM.phase === 'fin';
  b.className = 'cotimer ' + TM.phase;
  b.innerHTML = `<span class="kicker">${fin ? 'Terminé' : TM.phase === 'work' ? 'Travail' : 'Récupération'} · série ${Math.min(TM.round, TM.rounds)} sur ${TM.rounds}</span><b class="tmn" role="timer" aria-live="off">${fin ? 'Fini' : tmFmt(TM.left)}</b><div class="tmset">${[
    ['work', 'Travail', 5],
    ['rest', 'Repos', 5],
    ['rounds', 'Séries', 1]
  ]
    .map(
      x =>
        `<div><span class="muted small">${x[1]}</span><span class="row"><button class="ib" data-a="tmAdj" data-k="${x[0]}" data-n="-${x[2]}" aria-label="${x[1]} moins">–</button><b>${x[0] === 'rounds' ? TM.rounds : TM[x[0]] + ' s'}</b><button class="ib" data-a="tmAdj" data-k="${x[0]}" data-n="${x[2]}" aria-label="${x[1]} plus">+</button></span></div>`
    )
    .join(
      ''
    )}</div><div class="ctl"><button class="btn grow" data-a="tmGo">${TM.on ? 'Pause' : fin ? 'Recommencer' : 'Démarrer'}</button><button class="btn grow ghost" data-a="tmReset">Remettre à zéro</button></div>`;
}
function tmTick() {
  if (!TM.on) return;
  TM.left--;
  if (TM.left <= 3 && TM.left > 0) tmBeep(660, 0.12);
  if (TM.left <= 0) {
    if (TM.phase === 'work' && TM.rest) {
      TM.phase = 'rest';
      TM.left = TM.rest;
      tmBeep(440, 0.5);
    } else if (TM.round < TM.rounds) {
      TM.round++;
      TM.phase = 'work';
      TM.left = TM.work;
      tmBeep(880, 0.5);
    } else {
      TM.phase = 'fin';
      TM.on = false;
      clearInterval(TM.t);
      tmBeep(880, 1);
    }
  }
  tmDraw();
}
Object.assign(A, {
  coTimer() {
    sheet('Minuteur', '<div class="body"><div id="tmbox"></div></div>');
    tmDraw();
  },
  tmAdj(d) {
    if (TM.on) return;
    const k = d.k,
      n = +d.n;
    TM[k] = Math.max(k === 'rounds' ? 1 : k === 'rest' ? 0 : 5, Math.min(k === 'rounds' ? 30 : 600, TM[k] + n));
    if (TM.phase !== 'fin') TM.left = TM.phase === 'work' ? TM.work : TM.rest;
    tmDraw();
  },
  tmGo() {
    if (TM.phase === 'fin') A.tmReset();
    TM.on = !TM.on;
    clearInterval(TM.t);
    if (TM.on) {
      tmBeep(880, 0.3);
      TM.t = setInterval(tmTick, 1000);
    }
    tmDraw();
  },
  tmReset() {
    TM.on = false;
    clearInterval(TM.t);
    Object.assign(TM, { phase: 'work', left: TM.work, round: 1 });
    tmDraw();
  }
});
/* logo /RAM Coach (au lieu de /RAM Club) dans le menu latéral, quand le club n'a pas de logo à lui */
/* couleurs de /RAM JA (nuit bordeaux, jour rosé, lime et rose /RAM), jamais celles du club : un logiciel de gestion */
const CO_THEME = {
  true: {
    bg: '#120A0C',
    card: '#1C1215',
    card2: '#2A1C20',
    line: '#3A2A30',
    fg: '#F7EFF0',
    muted: '#B5A0A6',
    accent: '#E0F50A',
    'on-accent': '#1A0509',
    accent2: '#FF3D6B',
    hot: '#FF3D6B',
    'hot-tx': '#FF6F8F',
    'on-hot': '#FFFFFF',
    stage: '#0A0506'
  },
  false: {
    bg: '#F6F1F1',
    card: '#FFFFFF',
    card2: '#F1E6E8',
    line: '#E0D0D4',
    fg: '#2A0A12',
    muted: '#86717A',
    accent: '#A30F35',
    'on-accent': '#FFFFFF',
    accent2: '#D0103A',
    hot: '#D0103A',
    'hot-tx': '#B3123D',
    'on-hot': '#FFFFFF',
    stage: '#E9DDE0'
  }
};
const coSetTheme = setTheme;
setTheme = function (i) {
  coSetTheme(i);
  const r = document.documentElement.style,
    dk = effDark();
  Object.entries(CO_THEME[dk]).forEach(([k, v]) => r.setProperty('--' + k, v));
  r.setProperty('--rail-logo', `url("img/coach-v2-logo-${dk ? 'blanc' : 'noir'}.png")`);
  r.colorScheme = dk ? 'dark' : 'light';
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = dk ? '#120A0C' : '#74102A';
};
/* ma fiche enseignant : rangée dans mon profil du club, visible de tous les adhérents (École, Enseignants) */
A.coPro = () => {
  const p = proOf(ME()),
    ck = (id, l, on) =>
      `<label class="corow"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--accent)"><span class="grow">${l}</span></label>`;
  sheet(
    'Ma fiche enseignant',
    `<form class="body" id="co-pro">${O('co-dip', 'Diplôme', 'DE JEPS tennis, moniteur padel…', p.dip)}${O('co-since', 'Année de début d’activité', '2015', p.since)}${O('co-sports', 'Sports enseignés', 'Tennis, padel', p.sports)}${O('co-tel', 'Téléphone', '', p.tel)}${O('co-mail', 'E-mail', '', p.mail)}${O('co-web', 'Site internet', '', p.web)}${O('co-book', 'Lien de réservation (agenda en ligne)', 'Calendly, Google Agenda…', p.book)}${T('co-tarifs', 'Tarifs (un par ligne)', 'Cours individuel : 45 € de l’heure', p.tarifs)}${T('co-bio', 'Présentation', 'Ce que tu enseignes, à qui', p.bio)}${ck('co-age', 'Montrer mon âge', p.age)}${ck('co-on', 'Publier ma fiche dans /RAM Club', p.on !== false)}<button class="btn full">Enregistrer</button></form>`
  );
  ['co-tarifs', 'co-bio'].forEach(x => ($(x).required = false));
  $('co-since').inputMode = 'numeric';
  $('co-tel').type = 'tel';
  $('co-mail').type = 'email';
};
document.addEventListener('submit', e => {
  if (e.target.id !== 'co-pro') return;
  const v = x => $(x).value.trim();
  M[ME()].pro = {
    on: $('co-on').checked,
    age: $('co-age').checked,
    dip: v('co-dip'),
    since: v('co-since').replace(/[^\d]/g, '').slice(0, 4),
    sports: v('co-sports'),
    tel: v('co-tel'),
    mail: v('co-mail'),
    web: v('co-web'),
    book: v('co-book'),
    tarifs: v('co-tarifs'),
    bio: v('co-bio')
  };
  closeSheet();
  coSave('Fiche enregistrée : visible dans /RAM Club, École, Enseignants');
});
/* enseigner dans un autre club : on le rejoint avec son code, le bureau donne ensuite le rôle d'enseignant
   (formulaire « ram-join2 » de ram-sync.js : on rejoint sans quitter ses autres clubs) */
A.coOtherClub = () =>
  sheet(
    'J’enseigne dans un autre club',
    `<form class="body" id="ram-join2"><div class="fld"><label for="rj2-code">Code du club</label><input id="rj2-code" required autocomplete="off" autocapitalize="characters" placeholder="TPC-4821"></div><p class="muted small">Le bureau du club te donne son code. Il valide ensuite ta demande et te donne le rôle d’enseignant : tes groupes de ce club s’ajoutent alors à ton planning, à côté des autres.</p><button class="btn full">Envoyer ma demande</button></form>`
  );
document.addEventListener('submit', e => {
  if (e.target.id !== 'ram-join2' || (window.RAM && RAM.user)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  closeSheet();
  toast('Démonstration : la demande partirait au bureau de ce club');
});
/* ---------- plusieurs clubs : le club d'un élève, et les envois signés de ma clé dans ce club ---------- */
function coStuClub(id) {
  if (M[id]) return coClubOf(M[id]);
  if (coEl(id)) return coClubOf(coEl(id));
  const g = GROUPS.find(x => x.type === 'train' && coStu(x).includes(id));
  return coClubOf(g);
}
svMe = k => (coIsMe(k) ? ME() : k);
svFrom = to => {
  const c = coStuClub(to);
  return c !== coMainId() && CO_EXT[c] ? { by: coKeyIn(c), _club: c } : { by: ME() };
};
Object.assign(A, {
  coClub(d) {
    S.coClub = d.c;
    render(true);
  },
  coDashP(d) {
    S.dashP = d.v;
    render(true);
  },
  /* Mes clubs, un club : mes élèves de ce club */
  coSeeEl(d) {
    S.coClub = d.c;
    A.tab({ t: 'eleves' });
  },
  /* ajouter une séance ponctuelle : un cours individuel, un duo, une séance unique (pas un groupe : pas de discussion) */
  coNewSes(d) {
    const cl = coClubList(),
      cur = (d && d.c) || (S.coClub !== 'all' && S.coClub) || coMainId(),
      st = coStudents().sort((a, b) => svName(a).localeCompare(svName(b))),
      pick = i =>
        `<div class="fld"><label for="co-se${i}">Élève ${i}${i > 1 ? ' (facultatif)' : ''}</label><select id="co-se${i}"><option value="">${i > 1 ? '–' : 'Choisir'}</option>${st.map(k => `<option value="${k}" ${d && d.k === k && i === 1 ? 'selected' : ''}>${esc(svName(k))}</option>`).join('')}</select></div>`;
    sheet(
      'Ajouter une séance',
      `<form class="body" id="co-sesnew">${cl.length > 1 ? `<div class="fld"><label for="co-sc">Club</label><select id="co-sc">${cl.map(c => `<option value="${c.id}" ${c.id === cur ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>` : ''}${Dt('co-sd', 'Date', false, TODAY)}${Sel('co-sh', 'Heure', HOURS, '18 h')}${Sel('co-sdu', 'Durée', ['45 min', '1 h', '1 h 30', '2 h'], '1 h')}${[1, 2, 3, 4].map(pick).join('')}${Sel('co-ss', 'Sport', ['Padel', 'Tennis'], 'Padel')}${O('co-sp', 'Prix de la séance en euros', '35')}<button class="btn full">Ajouter la séance</button></form>`
    );
    $('co-sp').inputMode = 'decimal';
  },
  coHiF(d) {
    S.hiF = d.v;
    render();
  },
  /* créer un groupe d'entraînement dans l'un de mes clubs (il apparaît aussitôt dans /RAM Club, École et Groupes) */
  coNewGrp(d) {
    const cl = coClubList(),
      cur = (d && d.c) || (S.coClub !== 'all' && S.coClub) || coMainId();
    sheet(
      'Nouveau groupe',
      `<form class="body" id="co-grpnew">${cl.length > 1 ? `<div class="fld"><label for="co-gc">Club</label><select id="co-gc">${cl.map(c => `<option value="${c.id}" ${c.id === cur ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>` : ''}<p class="muted small">Un groupe rassemble des élèves qui jouent ensemble chaque semaine. Sa discussion est créée dans /RAM Club. Pour un cours individuel ou une séance unique : Ajouter une séance.</p>${F('co-gn', 'Nom', 'Adultes compétition, duo du mardi…')}${Sel('co-gs', 'Sport', ['Padel', 'Tennis'], 'Padel')}${Sel('co-gd', 'Jour (chaque semaine)', DAYS.slice(1).concat(DAYS[0]), 'Mardi')}${Dt('co-go', 'Première séance', false, TODAY)}${Dt('co-gz', 'Dernière séance (cycle, facultatif)', false, '')}${Sel('co-gh', 'Heure', HOURS, '18 h')}${Sel('co-gdu', 'Durée', ['45 min', '1 h', '1 h 30', '2 h', '2 h 30', '3 h'], '1 h 30')}${Sel('co-gl', 'Lieu', ['Extérieur', 'En salle'], 'Extérieur')}${O('co-gm', 'Nombre de places', '8')}${Sel('co-gt', 'Tarif', Object.values(TARIF_MODES), TARIF_MODES.seance)}${O('co-gp', 'Montant en euros', '60')}<button class="btn full">Créer le groupe</button></form>`
    );
    $('co-gm').inputMode = 'numeric';
    $('co-gp').inputMode = 'decimal';
  }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'co-sesnew') return;
  e.preventDefault();
  const v = x => ($(x) ? $(x).value.trim() : ''),
    cid = v('co-sc') || coMainId(),
    ext = CO_EXT[cid] ? cid : null,
    key = coKeyIn(ext),
    d = v('co-sd'),
    ks = [1, 2, 3, 4].map(i => v('co-se' + i)).filter((k, i, a) => k && a.indexOf(k) === i);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !ks.length) return toast('Choisis la date et au moins un élève');
  const g = {
    id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    type: 'train',
    name: ks.length === 1 ? 'Cours individuel' : ks.length === 2 ? 'Cours duo' : 'Cours collectif',
    sport: v('co-ss'),
    once: d,
    day: new Date(d + 'T12:00:00').getDay(),
    h: v('co-sh'),
    dur: v('co-sdu'),
    defLoc: 'Extérieur',
    coach: key,
    mem: ks.filter(k => M[k]),
    ext: ks.filter(k => !M[k]),
    sub: `${fmtD(d)} ${v('co-sh')} · ${v('co-sdu')}`,
    tarif: { mode: 'seance', prix: parseFloat(v('co-sp').replace(',', '.')) || 0 }
  };
  if (ext) g._club = ext;
  GROUPS.push(g);
  closeSheet();
  coSave('Séance ajoutée le ' + fmtD(d));
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'co-grpnew') return;
  const v = x => ($(x) ? $(x).value.trim() : ''),
    cid = v('co-gc') || coMainId(),
    ext = CO_EXT[cid] ? cid : null,
    id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    key = coKeyIn(ext),
    g = {
      id,
      type: 'train',
      name: v('co-gn'),
      sport: v('co-gs'),
      day: DAYS.indexOf(v('co-gd')),
      h: v('co-gh'),
      dur: v('co-gdu'),
      defLoc: v('co-gl'),
      coach: key,
      mem: [],
      sub: `${v('co-gd')} ${v('co-gh')} · ${v('co-gdu')} · ${first(key)}`,
      tarif: {
        mode: Object.keys(TARIF_MODES).find(k => TARIF_MODES[k] === v('co-gt')) || 'seance',
        prix: parseFloat(v('co-gp').replace(',', '.')) || 0
      }
    };
  if (!g.name) return;
  // un cycle : de sa première à sa dernière séance
  if (/^\d{4}-\d{2}-\d{2}$/.test(v('co-go')) && v('co-go') > TODAY) g.from = v('co-go');
  if (/^\d{4}-\d{2}-\d{2}$/.test(v('co-gz'))) g.to = v('co-gz');
  if (parseInt(v('co-gm'), 10)) g.max = parseInt(v('co-gm'), 10);
  // la discussion du groupe dans /RAM Club : créée avec le groupe
  const ch = { id, g: 'train', sport: g.sport, name: g.name, desc: g.sub, kid: 0 };
  if (ext) {
    g._club = ext;
    if (CO_EXT[ext].base)
      fetch('/api/ram/c/' + ext + '/ops', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ops: [{ coll: 'chan', id, op: 'put', data: Object.assign({ at: Date.now() }, ch) }] })
      }).catch(() => {});
  } else chans.push(Object.assign({ msgs: [], un: 0 }, ch));
  GROUPS.push(g);
  closeSheet();
  S.stack.push({ v: 'cgroupe', id });
  coSave('Groupe créé dans ' + (ext ? CO_EXT[ext].name : club().name));
});

/* niveau donné dans /RAM Coach : recopié dans la fiche /RAM Club de l'adhérent (niveau padel ou niveau tennis) */
function coMemberLevel(id) {
  const m = M[id],
    e = coEl(id);
  if (!m || !e || !e.lvl) return;
  const sp = e.sport || coSport(id),
    l = (SCALES[sp] || SCALES.Padel).levels[e.lvl - 1];
  if (sp === 'Padel') m.pl = e.lvl;
  else m.tn = { n: e.lvl, t: l ? l.t : '' };
}
/* ---------- échelles de niveaux : modifiées ici, enregistrées sur le compte /RAM (pour tous mes clubs) ---------- */
const coRenum = sp => SCALES[sp].levels.forEach((l, i) => (l.n = i + 1));
function coSaveScales(msg) {
  Object.keys(SCALES).forEach(coRenum);
  render(true);
  if (!(window.RAM && RAM.user)) return toast((msg || 'Échelle modifiée') + ' (démonstration : non enregistrée)');
  fetch('/api/coach/echelles', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ echelles: SCALES })
  })
    .then(r => (r.ok ? toast(msg || 'Échelle enregistrée') : toast('L’échelle n’a pas été enregistrée')))
    .catch(() => toast('L’échelle n’a pas été enregistrée'));
}
Object.assign(A, {
  coLvlEdit(d) {
    const l = d.i === 'new' ? { t: '', pre: [], att: [] } : SCALES[d.s].levels[+d.i];
    sheet(
      d.i === 'new' ? 'Nouveau niveau ' + d.s.toLowerCase() : 'Niveau ' + (+d.i + 1) + ' · ' + d.s.toLowerCase(),
      `<form class="body" id="co-lvl" data-s="${d.s}" data-i="${d.i}">${F('co-lt', 'Nom du niveau', 'Débutant, Orange…', l.t)}${T('co-lp', 'Prérequis (un par ligne)', 'Ce qu’il faut savoir faire pour y entrer', l.pre.join('\n'))}${T('co-la', 'Attendus pour le valider (un par ligne)', 'Ce qu’il faut savoir faire pour passer au suivant', l.att.join('\n'))}<button class="btn full">Enregistrer</button></form>`
    );
    $('co-lp').required = false;
    $('co-la').required = false;
  },
  coLvlMove(d) {
    const L = SCALES[d.s].levels,
      i = +d.i,
      j = i + +d.n;
    if (j < 0 || j >= L.length) return;
    [L[i], L[j]] = [L[j], L[i]];
    coSaveScales('Ordre des niveaux enregistré');
  },
  coLvlDel(d) {
    const l = SCALES[d.s].levels[+d.i];
    sheet(
      'Supprimer le niveau',
      `<div class="body"><p>Supprimer « ${esc(l.t)} » de l’échelle ${d.s.toLowerCase()} ? Les niveaux suivants avancent d’un rang.</p><div class="cotools"><button class="btn" data-a="coLvlDelOk" data-s="${d.s}" data-i="${d.i}">Supprimer</button><button class="btn ghost" data-a="close">Annuler</button></div></div>`
    );
  },
  coLvlDelOk(d) {
    if (SCALES[d.s].levels.length <= 1) return toast('Une échelle garde au moins un niveau');
    SCALES[d.s].levels.splice(+d.i, 1);
    closeSheet();
    coSaveScales('Niveau supprimé');
  },
  coScName(d) {
    sheet(
      'Nom de l’échelle',
      `<form class="body" id="co-scn" data-s="${d.s}">${F('co-sn', 'Nom', '', SCALES[d.s].name)}<button class="btn full">Enregistrer</button></form>`
    );
  }
});
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id === 'co-lvl') {
    e.preventDefault();
    const lines = id =>
        $(id)
          .value.split('\n')
          .map(x => x.trim())
          .filter(Boolean),
      l = { t: $('co-lt').value.trim() || 'Niveau', pre: lines('co-lp'), att: lines('co-la') };
    if (f.dataset.i === 'new') SCALES[f.dataset.s].levels.push(l);
    else Object.assign(SCALES[f.dataset.s].levels[+f.dataset.i], l);
    closeSheet();
    coSaveScales('Niveau enregistré');
  }
  if (f.id === 'co-scn') {
    e.preventDefault();
    SCALES[f.dataset.s].name = $('co-sn').value.trim() || SCALES[f.dataset.s].name;
    closeSheet();
    coSaveScales('Échelle renommée');
  }
});
