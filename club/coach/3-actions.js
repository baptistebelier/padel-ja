/* /RAM Coach — coach/3-actions.js : titres des pages, gestes et formulaires de l'enseignant, minuteur.
   Chaque changement passe par les listes partagées (GROUPS, ELEVES, SEANCES, SUIVI) : la synchronisation
   du Club (ram-sync.js) l'envoie au serveur, et les élèves le retrouvent dans /RAM Club. */
Object.assign(TITLES, {
  today: () => ["Aujourd'hui", club().name],
  planning: () => ['Planning', S.plScope === 'ecole' ? "Toute l'école" : 'Mes cours'],
  eleves: () => ['Élèves', club().name],
  msgs: () => ['Messages', 'Élèves et groupes'],
  ecole: () => ['École', club().name],
  seance: () => {
    const id = view().id,
      g = grp(id.slice(0, id.lastIndexOf('.')));
    return ['Séance', g ? g.name : ''];
  },
  eleve: () => [svName(view().id), 'Fiche élève'],
  cgroupe: () => [(grp(view().id) || {}).name || 'Groupe', 'Groupe d’entraînement']
});
ROLE.coach = 'Enseignant';
/* une séance (créée à la première écriture) */
function sesGet(id) {
  let s = SEANCES.find(x => x.id === id);
  if (!s) {
    const i = id.lastIndexOf('.');
    s = { id, g: id.slice(0, i), d: id.slice(i + 1) };
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
    coSave('Niveau ' + n + ' donné à ' + svFirst(d.id));
  },
  coTech(d) {
    const e = coElGet(d.id);
    e.tech = e.tech || {};
    e.tech[d.t] = ((e.tech[d.t] || 0) % 4) + 1;
    render(true);
  },
  coNewEl() {
    sheet(
      'Nouvel élève',
      `<form class="body" id="co-new">${F('co-n', 'Prénom et nom', '')}${O('co-mail', 'E-mail (pour le relier à son compte)', '')}${Sel('co-sp', 'Sport', ['Padel', 'Tennis'], 'Padel')}${Sel('co-g', 'Groupe', ['Aucun'].concat(coGroups(coAll() ? 'ecole' : 'me').map(g => g.name)), 'Aucun')}<button class="btn full">Ajouter l'élève</button></form>`
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
    const cands = Object.keys(M).filter(k => k !== 'club' && !coEl(k));
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
      cand = Object.keys(M)
        .filter(k => k !== 'club' && !st.includes(k))
        .concat(ELEVES.filter(e => !M[e.id] && !st.includes(e.id)).map(e => e.id))
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
    return coSave(
      n ? 'Bilan envoyé, ' + plural(n, 'commentaire personnel', 'commentaires personnels') : 'Bilan enregistré'
    );
  }
  if (f.id === 'co-new') {
    const n = val('co-n');
    if (!n) return;
    const e2 = { id: 'e' + Date.now().toString(36), n, sport: val('co-sp'), mail: val('co-mail'), parents: [] };
    ELEVES.push(e2);
    const g = GROUPS.find(x => x.name === val('co-g'));
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
const coSetTheme = setTheme;
setTheme = function (i) {
  coSetTheme(i);
  const r = document.documentElement.style,
    v = r.getPropertyValue('--rail-logo');
  if (v.includes('ram-club-')) r.setProperty('--rail-logo', v.replace('ram-club-', 'ram-coach-'));
};
