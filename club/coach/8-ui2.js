/* /RAM Coach — coach/8-ui2.js : nouvelle organisation de /Dojo (maquette Figma « /Dojo · Nouvelle interface », 11/2026).
   À l'essai derrière l'interrupteur ?ui=2 (coach.html) : sans lui, rien ne change.
   Étape 1 — navigation : 5 rubriques partout (Aujourd'hui, Planning, Élèves, Groupes, Messages) ;
   Statistiques devient un sous-onglet d'Aujourd'hui ; Suivi sort du menu (joignable depuis « À traiter ») ;
   Profil devient Réglages, hors du menu (bas du menu sur grand écran, roue dentée dans l'en-tête au téléphone) ;
   les doublons Groupes et Formules quittent le sous-menu Élèves. */
const UI2 = document.documentElement.dataset.ui === '2';
if (UI2) {
  /* ---------- le menu : 5 rubriques ; Statistiques, Suivi et Réglages restent des pages, sans entrée dans le menu ---------- */
  const U2_MENU = [
    ['today', 'home', 'Aujourd’hui'],
    ['planning', 'cal', 'Planning'],
    ['eleves', 'users', 'Élèves'],
    ['clubs', 'club', 'Groupes'],
    ['msgs', 'chat', 'Messages']
  ];
  const U2_HORS = [
    ['dash', 'chart', 'Statistiques'],
    ['asuivi', 'check', 'Suivi'],
    ['me', 'gear', 'Réglages']
  ];
  TABBAR.splice(0, TABBAR.length, ...U2_MENU, ...U2_HORS);
  const u2Hors = k => U2_HORS.some(x => x[0] === k);

  /* titres des pages */
  const u2Titres = {
    today: () => ['Aujourd’hui', fmtD(TODAY)],
    dash: () => ['Aujourd’hui', 'Statistiques'],
    clubs: () => ['Groupes', 'Mes groupes'],
    asuivi: () => ['Bilans et paiements', 'À suivre'],
    me: () => ['Réglages', 'Mon compte enseignant']
  };
  Object.keys(u2Titres).forEach(k => {
    if (TITLES[k] || V[k]) TITLES[k] = u2Titres[k];
  });

  /* ---------- Aujourd'hui | Statistiques : un sous-onglet dans la page (pas une colonne de sous-menu) ---------- */
  const u2Sous = on =>
    `<div class="seg haut u2sous" role="tablist" aria-label="Aujourd’hui">${[
      ['today', 'Aujourd’hui', 'home'],
      ['dash', 'Statistiques', 'chart']
    ]
      .map(
        ([k, l, i]) =>
          `<button role="tab" aria-selected="${on === k}" data-a="tab" data-t="${k}">${ic(i)}<span class="lb">${l}</span></button>`
      )
      .join('')}</div>`;
  const u2Today = V.today,
    u2Dash = V.dash;
  /* ---------- Étape 2 — Aujourd'hui : la prochaine séance et l'appel, la semaine, « À faire », le mois en chiffres ---------- */
  /* carte d'une séance du jour : l'heure dans l'encart coloré (comme l'historique), un toucher ouvre la séance, et l'appel se
     fait ici : Présent / Absent par élève, enregistré aussitôt par la même action que la page de la séance (coPres) */
  function u2AppelCard(x) {
    const { g, d } = x,
      id = sesKey(g, d),
      s = sesFind(g, d) || {},
      cx = isCx(g, d),
      plus = (s.plus || []).filter(k => !coStu(g).includes(k)),
      st = coStu(g)
        .filter(k => !(s.out || []).includes(k))
        .concat(plus),
      pr = REGLES.presDe(sesFind(g, d), g, d) || {},
      nP = st.filter(k => pr[k] === 'P').length,
      nT = st.filter(k => pr[k]).length,
      fait = st.length > 0 && nT === st.length,
      theme = s.theme || (REGLES.cycleDe(g, d) || {}).theme,
      sub = [durAt(g, d), plural(st.length, 'élève'), theme ? esc(theme) : ''].filter(Boolean).join(' · '),
      tag = cx
        ? '<span class="tag cost cx">Annulée</span>'
        : fait
          ? `<span class="tag ok">Appel fait · ${nP}/${st.length}</span>`
          : nT
            ? `<span class="tag">${nT}/${st.length} pointés</span>`
            : '<span class="tag cost todo">Appel à faire</span>',
      row = k => {
        const v = pr[k] || '',
          fn = svFirst(k),
          ln = svName(k).slice(fn.length).trim();
        return `<div class="u2apr">${coAv(k, 'sm')}<span class="u2apn"><b>${esc(fn)}</b> ${esc(ln)}${v === 'E' ? ' <span class="tag">Excusé</span>' : ''}</span><span class="u2apb" role="group" aria-label="Présence de ${esc(svName(k))}">${['P', 'A']
          .map(
            z =>
              `<button class="${v === z ? 'on ' + z : ''}" data-a="coPres" data-id="${id}" data-k="${k}" data-s="${z}" aria-pressed="${v === z}" aria-label="${presLbl[z]} : ${esc(svName(k))}">${ic(PRES_IC[z])}<span>${presLbl[z]}</span></button>`
          )
          .join('')}</span></div>`;
      };
    return `<div class="card u2ap${cx ? ' cx' : ''}${st.length > 8 ? ' many' : ''}">${u2Hist({ d, h: hAt(g, d), title: esc(g.name), sub, cx, tone: cx ? 'ab' : 'ok', tags: tag, go: `data-a="open" data-v="seance" data-id="${id}"` })}${
      cx
        ? ''
        : st.length
          ? `<div class="u2apl">${st.map(row).join('')}</div>`
          : '<p class="muted small u2ape">Aucun élève dans ce groupe.</p>'
    }<div class="u2apf"><button class="btn ghost sm" data-a="coOpenChan" data-id="${g.id}">${ic('chat')}Écrire au groupe</button><button class="u2lnk" data-a="open" data-v="seance" data-id="${id}">Ouvrir la séance${ic('back')}</button></div></div>`;
  }
  function u2Prochaine() {
    const nm = new Date().getHours() * 60 + new Date().getMinutes(),
      l = coSessions(TODAY, isoIn(7), 'me', 1),
      next = l.find(x => !isCx(x.g, x.d) && (x.d > TODAY || hMin(hAt(x.g, x.d)) + durMin(durAt(x.g, x.d)) > nm));
    const today = l.filter(x => x.d === TODAY);
    let h = '';
    if (today.length)
      h += `<div class="card u2c u2auj"><div class="calh">${ic('clock')}<b>Aujourd’hui · ${plural(today.length, 'séance')}</b></div><div class="u2apw">${today.map(u2AppelCard).join('')}</div></div>`;
    else if (next) {
      const { g, d } = next,
        st = coStu(g),
        quand = d === TODAY ? 'Aujourd’hui' : d === isoIn(1) ? 'Demain' : fmtD(d),
        theme = (sesDu(g, d) || {}).theme || (REGLES.cycleDe(g, d) || {}).theme;
      h += `<div class="card u2c u2next"><div class="calh">${ic('clock')}<b>${quand} · ${esc(hAt(g, d))} · ${esc(durAt(g, d))}</b></div><span class="h3">${esc(g.name)}</span>${theme ? `<p class="muted small">Thème : ${esc(theme)}</p>` : ''}${st.length ? `<div class="u2avs">${st.map(k => coAv(k, 'sm')).join('')}<span class="muted small">${plural(st.length, 'élève')}</span></div>` : ''}<div class="ecacts"><button class="btn" data-a="open" data-v="seance" data-id="${sesKey(g, d)}">${ic('cal')}Ouvrir la séance</button><button class="btn ghost" data-a="coOpenChan" data-id="${g.id}">${ic('chat')}Écrire au groupe</button></div></div>`;
    } else h += `<div class="card">${none('cal', 'Aucun cours dans les 7 jours', '')}</div>`;
    // la semaine : une ligne par cours, un clic ouvre la séance
    const rest = l.filter(x => x !== next && !today.includes(x));
    if (rest.length)
      h += `<div class="card u2c u2sem"><div class="calh">${ic('cal')}<b>Cette semaine</b></div>${rest
        .map(x => {
          const { g, d } = x,
            s = sesDu(g, d) || {},
            n = coStu(g).length,
            sub = isCx(g, d)
              ? 'Annulé'
              : [
                  plural(n, 'élève'),
                  durAt(g, d),
                  s.coach && !coIsMe(s.coach) && M[s.coach] ? first(s.coach) + ' remplace' : ''
                ]
                  .filter(Boolean)
                  .join(' · ');
          return `<button class="item" data-a="open" data-v="seance" data-id="${sesKey(g, d)}"><span class="u2d"><b>${esc(DA[new Date(d + 'T12:00').getDay()])} ${+d.slice(8)}</b><span>${esc(hAt(g, d))}</span></span><span class="grow"><span class="nm${isCx(g, d) ? ' u2cx' : ''}">${esc(g.name)}</span><br><span class="muted small">${esc(sub)}</span></span>${ic('back')}</button>`;
        })
        .join('')}<button class="btn ghost full" data-a="tab" data-t="planning">${ic('cal')}Planning</button></div>`;
    return `<div class="cobmain">${h}</div>`;
  }
  function u2Mois() {
    const l = coSessions(TODAY.slice(0, 8) + '01', TODAY, 'me', 1).filter(x => !isCx(x.g, x.d)),
      hrs = l.reduce((a, x) => a + durMin(durAt(x.g, x.d)), 0) / 60,
      el = new Set();
    let P = 0,
      T = 0;
    l.forEach(x =>
      Object.entries(coPresOf(x)).forEach(([k, v]) => {
        T++;
        if (v === 'P') {
          P++;
          el.add(k);
        }
      })
    );
    const kv = (a, b) => `<div class="cokv"><span>${a}</span><b>${b}</b></div>`;
    return `<div class="card u2c u2mois"><div class="calh">${ic('chart')}<b>Ce mois-ci</b></div>${kv('Séances', l.length)}${kv('Heures de cours', fr(hrs))}${kv('Élèves venus', el.size)}${kv('Présence', T ? Math.round((100 * P) / T) + ' %' : '–')}<button class="btn ghost full" data-a="tab" data-t="dash">${ic('chart')}Toutes les statistiques</button></div>`;
  }
  V.today = () => {
    let h = u2Today();
    // plus de rangée de raccourcis ni de petits chiffres : « Nouveau » et « Ce mois-ci » les remplacent
    ['<div class="coshort3">', '<div class="cotiles">'].forEach(s => {
      const [bloc] = coCut(h, s, 'div');
      if (bloc) h = h.replace(bloc, '');
    });
    const [main] = coCut(h, '<div class="cobmain">', 'div');
    if (main) h = h.replace(main, u2Prochaine());
    const [side] = coCut(h, '<div class="cobside">', 'div');
    if (side) h = h.replace(side, side.slice(0, -6).replace('À traiter', 'À faire') + u2Mois() + '</div>');
    return u2Sous('today') + h;
  };

  /* ---------- Étape 3 — Séance : l'appel au premier plan, un seul menu « Modifier la séance » ----------
     Les actions de planning (extérieur, annuler, reporter, date-heure-durée, supprimer) et le remplaçant quittent la fiche :
     elles s'ouvrent ensemble, chacune avec la phrase qui dit ce qu'elle fait. */
  const u2Acts = coActs,
    u2Rempl = coRempl;
  coActs = (g, d) =>
    `<button class="btn ghost full u2mod" data-a="u2Mod" data-id="${g.id}" data-d="${d}">${ic('edit')}Modifier la séance</button>`;
  coRempl = (g, d, s, form) => (form ? u2Rempl(g, d, s, form) : '');
  A.u2Mod = x => {
    const g = grp(x.id),
      d = x.d;
    if (!g) return;
    const s = sesFind(g, d) || {},
      loc = (g.loc || {})[d] || g.defLoc || 'En salle';
    sheet(
      'Modifier la séance',
      `<div class="body"><p class="muted small">${esc(g.name)} · ${DAYS[coDow(d)]} ${fmtD(d, 1)} · ${esc(hAt(g, d))}</p>${u2Acts(g, d, loc, isCx(g, d))}${coIsGrp(g) ? u2Rempl(g, d, s) : ''}</div>`
    );
  };

  /* ---------- Étape 4 — Argent : un seul endroit (Élèves > À encaisser), un achat noté en quelques champs ----------
     Les montants viennent de coPayTodo (échéances atteintes, séances faites sans achat qui les couvre) : la même source
     que le Suivi ; les statistiques, elles, ne montrent plus d'argent (C02). */
  let u2DueCache = { t: 0, m: null };
  function u2Dues() {
    if (u2DueCache.m && Date.now() - u2DueCache.t < 800) return u2DueCache.m;
    const m = {};
    coPayTodo(isoIn(-400)).forEach(p => {
      const k = p.id.split('|')[1];
      (m[k] = m[k] || { m: 0, l: [] }).m += p.m || 0;
      m[k].l.push(p);
    });
    u2DueCache = { t: Date.now(), m };
    return m;
  }
  /* où en est l'élève : son pack en cours (séances faites / prévues) et ce qu'il doit */
  function u2Etat(k) {
    let h = '';
    const pk = coPacks(k).find(a => a.t === 'pack' && a.n && REGLES.etatAchat(a, TODAY) === 'encours');
    if (pk) h += ` <span class="tag ac u2pk">Pack ${pk.used}/${pk.n}</span>`;
    const du = u2Dues()[k];
    if (du && du.m) h += ` <span class="tag copay due u2du">À payer ${eur(du.m)}</span>`;
    return h;
  }
  // la pastille suit le nom de l'élève dans l'appel d'une séance et dans la liste des élèves
  function u2Pastilles() {
    const v = view().v;
    if (v !== 'seance' && !(v === 'eleves' && S.elF !== 'pay') && v !== 'cgroupe') return;
    document
      .querySelectorAll('#main .corow .nm[data-v="eleve"], #main .item[data-v="eleve"] .nm, #main [data-u2el]')
      .forEach(n => {
        const k = n.dataset.id || (n.closest('[data-id]') || {}).dataset?.id;
        if (!k || n.parentElement.querySelector(':scope > .u2pk, :scope > .u2du')) return;
        n.insertAdjacentHTML('afterend', u2Etat(k));
      });
  }

  /* Élèves > À encaisser : qui doit quoi, depuis quand ; les packs presque finis, pour proposer la suite */
  function u2Encaisser() {
    const m = u2Dues(),
      ks = Object.keys(m).sort((a, b) => m[b].m - m[a].m),
      tot = ks.reduce((s, k) => s + m[k].m, 0),
      fins = coStudents()
        .filter(k => coInClub(M[k] || coEl(k) || {}))
        .map(k => [k, coPacks(k).find(a => a.t === 'pack' && a.n && REGLES.etatAchat(a, TODAY) === 'encours')])
        .filter(([, a]) => a && a.n - a.used <= 1);
    const tile = (i, n, l) => `<div class="cotile">${ic(i)}<b>${n}</b><span>${l}</span></div>`;
    return `<div class="pad cowide u2enc"><div class="cotiles n3">${tile('euro', eur(tot), 'À encaisser')}${tile('users', ks.length, ks.length > 1 ? 'Élèves concernés' : 'Élève concerné')}${tile('ladder', fins.length, 'Packs bientôt finis')}</div><div class="card u2c"><div class="calh">${ic('euro')}<b>Qui doit quoi</b></div>${
      ks.length
        ? ks
            .map(k => {
              const l = m[k].l.sort((a, b) => a.d.localeCompare(b.d));
              return `<div class="item u2encl">${coAv(k)}<span class="grow"><button class="nm" data-a="open" data-v="eleve" data-id="${k}">${esc(svName(k))}</button><br><span class="muted small">${l.map(p => p.sub).join(' · ')}</span></span><span class="u2encm"><b>${eur(m[k].m)}</b><span class="muted small">depuis le ${fmtD(l[0].d, 1)}</span></span><button class="btn sm ghost" ${l[0].go}>${ic('euro')}Régler</button></div>`;
            })
            .join('')
        : none('check', 'Tout est réglé', 'Aucun paiement attendu pour le moment.')
    }</div>${
      fins.length
        ? `<div class="card u2c"><div class="calh">${ic('ladder')}<b>Packs bientôt finis</b></div>${fins
            .map(
              ([k, a]) =>
                `<div class="item u2encl">${coAv(k)}<span class="grow"><span class="nm">${esc(svName(k))}</span><br><span class="muted small">${esc(a.nom || ofLabel(a.t, a.ref))} · séance ${a.used} sur ${a.n}</span></span><button class="btn sm ghost" data-a="coAchat" data-id="${k}">${ic('plus')}Nouvel achat</button></div>`
            )
            .join('')}</div>`
        : ''
    }</div>`;
  }
  const u2ElevesE = V.eleves;
  V.eleves = () => {
    const n = Object.keys(u2Dues()).length,
      it = `<button role="tab" aria-selected="${S.elF === 'pay'}" aria-label="À encaisser" data-a="coElF" data-v="pay">${ic('euro')}<span class="lb">À encaisser</span>${n ? `<span class="cnt">${n}</span>` : ''}</button>`;
    // « Abonnés » : les élèves dont l'abonnement est en cours (achat de type abonnement commencé, non fini, non quitté : REGLES.aboEnCours) ;
    // « En activité » : ceux qui ont un pack ou un cycle en cours (coEnActivite, coach/5-formules.js)
    const dans = coStudents().filter(k => coInClub(M[k] || coEl(k) || {})),
      nAbo = dans.filter(coAbonne).length,
      nAct = dans.filter(coEnActivite).length,
      onglet = (v, l, i, n) =>
        `<button role="tab" aria-selected="${S.elF === v}" aria-label="${l}" data-a="coElF" data-v="${v}">${ic(i)}<span class="lb">${l}</span>${n ? `<span class="cnt">${n}</span>` : ''}</button>`;
    let h = u2ElevesE();
    // ordre : Tous les élèves, En activité, Abonnés, Sans compte, À encaisser
    h = h.replace(
      /(<div class="seg[^"]*" role="tablist">[\s\S]*?aria-label="Sans compte"[\s\S]*?<\/button>)/,
      '$1' + it
    );
    h = h.replace(
      /(<div class="seg[^"]*" role="tablist">\s*<button[\s\S]*?<\/button>)/,
      '$1' + onglet('act', 'En activité', 'ladder', nAct) + onglet('abo', 'Abonnés', 'shield', nAbo)
    );
    if (S.elF !== 'pay') return h;
    const i = h.indexOf('</div>', h.indexOf('role="tablist"'));
    return h.slice(0, i + 6) + u2Encaisser();
  };
  TITLES.eleves = () =>
    S.elF === 'pay'
      ? ['À encaisser', 'Élèves']
      : [
          'Élèves',
          plural(coStudents().filter(k => coInClub(M[k] || coEl(k) || {})).length, 'élève actif', 'élèves actifs')
        ];

  /* Noter un achat : produit, date, règlement, moyen ; le reste replié dans « Plus d'options » */
  const u2Achat = A.coAchat;
  A.coAchat = d => {
    u2Achat(d);
    const f = $('co-ac');
    if (!f) return;
    const fld = id => {
      const x = $(id);
      return x && x.closest('.fld');
    };
    const det = document.createElement('details');
    det.className = 'u2opt';
    det.innerHTML = '<summary>Plus d’options (prix différent, échéances, note)</summary>';
    ['co-ax', 'co-aps', 'co-an2', 'co-aplf'].forEach(id => {
      const x = fld(id);
      if (x) det.append(x);
    });
    const go = f.querySelector('button.btn:last-of-type, button:not([type])');
    f.insertBefore(det, go);
    // le nombre de paiements n'apparaît que pour « En plusieurs fois »
    const st = $('co-ast'),
      nb = fld('co-apn'),
      maj = () => nb && (nb.hidden = !st || st.value !== 'plus');
    if (st && nb) {
      st.closest('.fld').after(nb);
      st.addEventListener('change', maj);
      maj();
    }
  };
  /* « Noter un achat » depuis « Nouveau » : d'abord l'élève */
  A.u2AchatPick = () =>
    sheet(
      'Noter un achat',
      `<div class="body"><p class="muted small">Pour quel élève ?</p><div class="menu">${coStudents()
        .filter(k => coInClub(M[k] || coEl(k) || {}))
        .sort((a, b) => svName(a).localeCompare(svName(b)))
        .map(k => `<button data-a="coAchat" data-id="${k}">${coAv(k, 'xs')}${esc(svName(k))}</button>`)
        .join('')}</div></div>`
    );

  /* ---------- Étape 5 — Groupes et cycles : le prix vient de la formule, « Nouveau cycle » unique ----------
     Décision de Baptiste (13/11) : le tarif du groupe (g.tarif) disparaît de l'écran ; un groupe sans formule la demande,
     groupe par groupe (rien n'est créé tout seul). Les données du tarif restent intactes. */
  const u2SansFormule = g => coIsGrp(g) && !g.libre && !coOver(g) && !coOfferOf(g);
  const u2Groupe = V.cgroupe;
  V.cgroupe = id => {
    let h = u2Groupe(id);
    const g = grp(id);
    if (!g) return h;
    const t = tarifOf(g);
    h = h.replace(
      coTile('euro', t.prix ? t.prix + ' €' : '–', t.prix ? TARIF_MODES[t.mode] : 'Tarif à renseigner'),
      ''
    );
    h = h
      .replace(`${ic('cal')}Programmer des séances`, `${ic('plus')}Nouveau cycle`)
      .replace('Créer le cycle avec les séances déjà faites', 'Nouveau cycle, avec les séances déjà faites');
    if (u2SansFormule(g)) {
      const i = h.indexOf('<div class="cotiles">');
      if (i > 0)
        h =
          h.slice(0, i) +
          `<div class="card u2c u2fo"><div class="calh">${ic('ball')}<b>Formule à choisir</b></div><p class="muted small">Ce groupe n’a pas encore de formule. Choisis-la : c’est elle qui donne le prix des séances et, pour un pack, leur nombre.</p><button class="btn" data-a="coGrpOf" data-id="${g.id}">${ic('ball')}Choisir la formule</button></div>` +
          h.slice(i);
    }
    return h;
  };
  /* À faire (Aujourd'hui) : les groupes qui attendent leur formule */
  const u2FoTodo = () =>
    coGroups('', true)
      .filter(u2SansFormule)
      .map(
        g =>
          `<button class="item" data-a="open" data-v="cgroupe" data-id="${g.id}"><span class="tile">${ic('ball')}</span><span class="grow"><span class="nm">Formule à choisir</span><br><span class="muted small">${esc(g.name)}</span></span></button>`
      )
      .join('');
  const u2TodayF = V.today;
  V.today = () => {
    const h = u2TodayF(),
      f = u2FoTodo();
    if (!f) return h;
    // en tête de « À faire »
    const i = h.indexOf('<div class="cobside">');
    if (i < 0) return h;
    const j = h.indexOf('<div class="card colist">', i);
    if (j > 0) {
      const k = j + '<div class="card colist">'.length;
      return h.slice(0, k) + f + h.slice(k);
    }
    // rien d'autre à faire : une liste rien que pour les formules, sous le titre
    const t = h.indexOf('</h2>', i);
    return t > 0 ? h.slice(0, t + 5) + `<div class="card colist">${f}</div>` + h.slice(t + 5) : h;
  };
  /* Modifier un groupe, créer un groupe : plus de champ « Tarif » (gardé, caché, pour ne rien perdre) */
  const u2CacheTarif = (ids, note) => {
    ids.forEach(id => {
      const x = $(id),
        f = x && x.closest('.fld');
      if (f) f.hidden = true;
    });
    const btn = document.querySelector('#layer form .btn.full:last-of-type');
    if (note && btn) btn.insertAdjacentHTML('beforebegin', `<p class="muted small">${note}</p>`);
  };
  const u2GrpEdit = A.coGrpEdit,
    u2NewGrp = A.coNewGrp;
  A.coGrpEdit = d => {
    u2GrpEdit(d);
    u2CacheTarif(['co-mode', 'co-prix'], 'Le prix des séances vient de la formule du groupe.');
  };
  A.coNewGrp = d => {
    u2NewGrp(d);
    u2CacheTarif(['co-gt', 'co-gp'], 'La formule (et donc le prix) se choisit ensuite, sur la page du groupe.');
  };

  /* ---------- Étape 6 — Fiche élève en un clic, formules en tête, onglets Fiche · Séances · Progression · Échanges ---------- */
  /* Élèves, grand écran : une seule colonne de liste ; toucher un élève l'affiche à droite (aperçu de 7-refonte.js), « Ouvrir la fiche » ouvre sa fiche */
  const u2Eleve = V.eleve;
  V.eleve = id => {
    let h = u2Eleve(id)
      .replace(/(data-k="elTab" data-val="histo">[\s\S]*?<span class="lb">)Historique</, '$1Séances<')
      .replace(/(data-k="elTab" data-val="suivi">[\s\S]*?<span class="lb">)Suivi</, '$1Échanges<')
      .replace('aria-label="Historique"', 'aria-label="Séances"')
      .replace('aria-label="Suivi"', 'aria-label="Échanges"');
    if (S.elTab !== 'fiche' || typeof coAchatsCard !== 'function') return h;
    // les formules et ce qu'il reste à payer en tête de la fiche
    const a = coAchatsCard(id);
    if (h.includes(a) && h.includes('<div class="cobmain">'))
      h = h.replace(a, '').replace('<div class="cobmain">', '<div class="cobmain">' + a);
    return h;
  };

  /* ---------- Messages, grand écran : les conversations à gauche, la conversation ouverte à droite ----------
     Même principe que les groupes de /Buvette (app/23-refonte.js) : la barre de saisie est dans la page, avec son
     propre formulaire (u2dm) puisqu'on reste sur la page Messages (pas de vue « dm » ouverte). */
  const u2Msgs = V.msgs;
  V.msgs = () => {
    const h = u2Msgs();
    if (!coWide() || S.msTab !== 'eleves') return h;
    const ids = [...h.matchAll(/data-a="open" data-v="dm" data-id="([^"]+)"/g)].map(m => m[1]),
      k = ids.includes(S.u2Dm) ? S.u2Dm : ids[0],
      i = h.indexOf('<div class="pad');
    if (!k || i < 0) return h;
    S.u2Dm = k;
    const left = h
      .slice(i)
      .replace(
        `data-a="open" data-v="dm" data-id="${k}"`,
        `data-a="open" data-v="dm" data-id="${k}" aria-current="true"`
      );
    const ok = typeof dmCanWrite !== 'function' || dmCanWrite(k);
    requestAnimationFrame(() => {
      const b = document.querySelector('.u2split .schb');
      if (b) b.scrollTop = b.scrollHeight;
    });
    return (
      h.slice(0, i) +
      `<div class="split2 u2split"><div class="splitl">${left}</div><section class="splitchat" aria-label="Conversation avec ${esc(svName(k))}"><header class="sch">${coAv(k)}<span class="grow"><b>${esc(svName(k))}</b><small>${esc(
        coGroupsOf(k)
          .map(g => g.name)
          .join(' · ')
      )}</small></span><button class="btn ghost" data-a="open" data-v="eleve" data-id="${k}">${ic('user')}Voir la fiche</button></header><div class="schb">${dmView(k)}</div><div class="schf">${
        ok
          ? `<form class="composer" id="u2dm" data-id="${k}"><textarea id="u2dm-in" class="ta" rows="1" autocomplete="off" autocorrect="on" autocapitalize="sentences" spellcheck="true" enterkeyhint="enter" placeholder="${esc(dmPlaceholder(k))}" aria-label="Message"></textarea><button class="send" aria-label="Envoyer">${ic('send')}</button></form><div class="u2dmact"><button class="btn sm ghost" data-a="coContent" data-id="${k}">${ic('spark')}Envoyer un contenu</button></div>`
          : '<div class="muted small schro">Cet élève n’a pas encore de compte : la conversation s’ouvrira quand il sera relié.</div>'
      }</div></section></div>`
    );
  };
  /* toucher une conversation de la liste l'ouvre à droite, sans quitter la page */
  const u2OpenM = A.open;
  A.open = d => {
    if (d && d.v === 'dm' && coWide() && S.tab === 'msgs' && !S.stack.length && S.msTab === 'eleves') {
      closeSheet();
      S.u2Dm = d.id;
      render(true);
      const t = $('u2dm-in');
      if (t) t.focus();
      return;
    }
    return u2OpenM(d);
  };
  document.addEventListener('submit', e => {
    if (e.target.id !== 'u2dm') return;
    e.preventDefault();
    const k = e.target.dataset.id,
      inp = $('u2dm-in'),
      x = inp && inp.value.trim();
    if (!x || (typeof dmCanWrite === 'function' && !dmCanWrite(k))) return;
    svNew(k, 'msg', { txt: x });
    inp.value = '';
    render(true);
    const t = $('u2dm-in');
    if (t) t.focus();
  });

  /* ---------- « Nouveau » : un seul bouton, trois choix expliqués ---------- */
  A.u2New = () =>
    sheet(
      'Nouveau',
      `<div class="body"><div class="menu u2new">${[
        ['coNewSes', 'user', 'Cours individuel', 'Une date, de 1 à 4 élèves. Un pack acheté se décompte tout seul.'],
        ['coNewGrp', 'users', 'Groupe', 'Les mêmes élèves chaque semaine, organisés en cycles.'],
        [
          'nvNew" data-m="cours',
          'school',
          'Cours ouvert aux inscriptions',
          'Collectif, stage ou animation : les adhérents s’inscrivent depuis /Buvette, selon leur niveau.'
        ]
      ]
        .map(
          ([a, i, t, s]) =>
            `<button data-a="${a}">${ic(i)}<span class="grow"><b>${t}</b><br><span class="muted small">${s}</span></span></button>`
        )
        .join(
          ''
        )}</div><p class="kicker">Aussi</p><div class="menu"><button data-a="u2AchatPick">${ic('euro')}Noter un achat</button><button data-a="coNewMsg">${ic('chat')}Écrire un message</button><button data-a="coContentPick">${ic('spark')}Donner du contenu</button><button data-a="coShortMore">${ic('more')}Autres outils</button></div></div>`
    );
  // les statistiques mesurent l'activité, sans argent (carnet C02) : plus d'intercalaire Paiements
  V.dash = () => {
    S.dashTab = 'act';
    return u2Sous('dash') + u2Dash().replace(/<div class="seg haut" role="tablist">(?:(?!<\/div>)[\s\S])*?<\/div>/, '');
  };

  /* ---------- Élèves : le sous-menu garde Tous les élèves et Sans compte ---------- */
  const u2Eleves = V.eleves;
  V.eleves = () =>
    u2Eleves().replace(
      /<button role="tab"[^>]*aria-label="(?:Groupes|Formules et tarifs|Échelles techniques)"[\s\S]*?<\/button>/g,
      ''
    );

  /* ---------- Groupes au téléphone : les mêmes cartes que sur grand écran (créneau, remplissage, état du cycle) ---------- */
  const u2Clubs = V.clubs;
  V.clubs = () => {
    const h = u2Clubs();
    if (coWide()) return h;
    const i = h.indexOf('<div class="pad">');
    if (i < 0) return h;
    const id = S.coClubTab || (coClubList()[0] || {}).id,
      gs = coGroups('', true).filter(g => coClubOf(g) === id && coIsGrp(g) && !coOver(g));
    return (
      h.slice(0, i) +
      `<div class="pad u2grp">${gs.length ? gs.map(coGrpCard).join('') : none('users', 'Aucun groupe', 'Un groupe rassemble des élèves qui jouent ensemble chaque semaine.')}<button class="btn ghost full" data-a="coNewGrp">${ic('plus')}Créer un groupe</button></div>`
    );
  };

  /* ---------- Réglages : en tête, les réglages qui quittent le sous-menu Élèves ---------- */
  const u2Me = V.me;
  V.me = id =>
    (id
      ? ''
      : `<div class="pad"><div class="card u2c u2regl"><div class="calh">${ic('gear')}<b>Réglages</b></div><div class="menu"><button data-a="open" data-v="formules">${ic('euro')}Formules et tarifs</button><button data-a="open" data-v="niveaux">${ic('ladder')}Échelles techniques</button></div></div></div>`) +
    u2Me(id);

  /* ---------- après chaque affichage : menu, Réglages, lien vers le suivi ---------- */
  function u2Nav() {
    const tabs = $('tabs');
    if (tabs) {
      tabs.querySelectorAll('button[data-t]').forEach(b => {
        if (u2Hors(b.dataset.t)) b.remove();
      });
      tabs.querySelectorAll('.coplus').forEach(b => b.remove());
      // Statistiques est un sous-onglet d'Aujourd'hui : l'entrée Aujourd'hui reste allumée
      if (S.tab === 'dash' && !S.stack.length) {
        const b = tabs.querySelector('button[data-t="today"]');
        if (b) {
          b.setAttribute('aria-current', 'page');
          if (typeof pillTo === 'function') pillTo(b, true);
        }
      }
    }
    // grand écran : Réglages en bas du menu (à la place de Profil)
    const rb = $('rbot');
    if (rb) {
      const p = rb.querySelector('button[data-t="me"]');
      if (p) p.innerHTML = `${ic('gear')}<span>Réglages</span>`;
    }
    // téléphone : la roue dentée des Réglages dans l'en-tête des pages du menu
    const top = $('top');
    if (top && !coWide() && !S.stack.length && !top.querySelector('.u2gear')) {
      const bell = top.querySelector('[data-a="notifs"]'),
        h = `<button class="ib u2gear" data-a="tab" data-t="me" aria-label="Réglages" ${S.tab === 'me' ? 'aria-current="page"' : ''}>${ic('gear')}</button>`;
      if (bell) bell.insertAdjacentHTML('beforebegin', h);
      else top.insertAdjacentHTML('beforeend', h);
    }
    // « Nouveau » à la place de « Nouvelle séance » (Aujourd'hui et Planning) ; « + » au téléphone
    if (top && !S.stack.length && (S.tab === 'today' || S.tab === 'planning')) {
      top.querySelectorAll('[data-a="coNewSes"]').forEach(b => {
        b.dataset.a = 'u2New';
        if (b.classList.contains('btn')) b.innerHTML = `${ic('plus')}Nouveau`;
        else b.setAttribute('aria-label', 'Nouveau');
      });
      if (!coWide() && S.tab === 'today' && !top.querySelector('[data-a="u2New"]')) {
        const g = top.querySelector('.u2gear');
        if (g)
          g.insertAdjacentHTML(
            'beforebegin',
            `<button class="ib acc coplt" data-a="u2New" aria-label="Nouveau">${ic('plus')}</button>`
          );
      }
    }
    // Séance, grand écran : « Modifier la séance » dans l'en-tête
    if (top && coWide() && view().v === 'seance') {
      const b = document.querySelector('#main .u2mod');
      if (b) {
        top.querySelectorAll('.u2topact').forEach(e => e.remove());
        const box = document.createElement('div');
        box.className = 'topact u2topact';
        b.classList.remove('ghost', 'full');
        box.append(b);
        top.insertBefore(box, top.querySelector('[data-a="notifs"]') || null);
      }
    }
    // Aujourd'hui : le suivi (bilans et paiements) se rejoint depuis « À traiter »
    if (S.tab === 'today' && !S.stack.length) {
      const c = document.querySelector('#main .cobside');
      if (c && !c.querySelector('.u2suivi'))
        c.insertAdjacentHTML(
          'beforeend',
          `<button class="btn ghost full u2suivi" data-a="tab" data-t="asuivi">${ic('check')}Bilans et paiements à suivre</button>`
        );
    }
  }
  const u2Rail = ramRail;
  ramRail = function (t, sub) {
    u2Rail(t, sub);
    u2Nav();
    u2Pastilles();
  };

  /* ---------- Fiche élève en une seule carte, fiche de groupe, historique en petites cartes empilées ---------- */
  const U2M = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  /* petite carte de séance de l'historique (élève, groupe) : l'encart coloré porte la date et l'heure ; les cartes
     s'empilent, ce n'est pas un agenda. tone : ok (faite), ex (excusé), ab (absent ou annulée), '' (à venir) */
  const u2Hist = o => {
    const el = o.go ? 'button' : 'div';
    return `<${el} class="u2hs ${o.tone || ''}"${o.go ? ' ' + o.go : ''}><span class="u2hd"><b>${esc(DA[new Date(o.d + 'T12:00').getDay()])} ${+o.d.slice(8)}</b><span>${U2M[+o.d.slice(5, 7) - 1]}</span>${o.h ? `<i>${esc(o.h)}</i>` : ''}</span><span class="u2hb"><span class="nm${o.cx ? ' u2cx' : ''}">${o.title}</span>${o.sub ? `<span class="muted small">${o.sub}</span>` : ''}</span>${o.tags ? `<span class="u2ht">${o.tags}</span>` : ''}</${el}>`;
  };
  /* une séance d'un groupe (à venir ou faite), en petite carte */
  const u2Ses = (g, d) => {
    const s = sesFind(g, d),
      cx = isCx(g, d),
      past = d <= TODAY,
      pr = REGLES.presDe(s, g, d),
      nP = Object.keys(pr).length ? Object.values(pr).filter(v => v === 'P').length : null,
      brouillon = BROUILLONS.some(b => b.id === sesKey(g, d) && (b._club || '') === (g._club || '')),
      tag = cx
        ? ['Annulée', 'cx']
        : !past
          ? s && s.theme
            ? null
            : ['Thème à définir', '']
          : s && s.recap
            ? ['Bilan envoyé', 'ok']
            : brouillon
              ? ['Brouillon', '']
              : s && s.noRecap
                ? ['Sans bilan', '']
                : coOf().rappelBilans
                  ? ['Bilan à écrire', 'todo']
                  : null,
      sub = past
        ? [nP != null ? nP + '/' + coStu(g).length + ' présents' : 'Appel à faire', s && s.theme ? esc(s.theme) : '']
            .filter(Boolean)
            .join(' · ')
        : [durAt(g, d), s && s.theme ? esc(s.theme) : ''].filter(Boolean).join(' · ');
    return u2Hist({
      d,
      h: hAt(g, d),
      title: esc(g.name),
      sub,
      cx,
      tone: cx ? 'ab' : past ? 'ok' : '',
      tags: tag ? `<span class="tag cost ${tag[1]}">${tag[0]}</span>` : '',
      go: `data-a="open" data-v="seance" data-id="${sesKey(g, d)}"`
    });
  };

  /* Fiche élève : une grande carte (identité, coordonnées, boutons, puis les onglets en intercalaires du contenu), et dessous
     les sous-cartes de l'onglet, chacune avec son picto */
  const u2EleveF = V.eleve;
  V.eleve = id => {
    const h = u2EleveF(id),
      iPad = h.indexOf('<div class="pad">'),
      iSeg = h.indexOf('<div class="seg', iPad + 1),
      iBody = h.indexOf('<div class="pad">', iSeg + 1);
    if (iPad < 0 || iSeg < 0 || iBody < 0) return h;
    const tabs = h.slice(iSeg, iBody).replace(/^<div class="seg[^"]*"/, '<div class="r-itabs u2itabs"');
    let body = h.slice(iBody + '<div class="pad">'.length, h.lastIndexOf('</div>'));
    const e = coEl(id) || {},
      ct = (M[id] && M[id].ct) || {},
      tel = e.tel || ct.tel || '',
      mail = e.mail || ct.mail || '',
      fn = svFirst(id),
      ln = svName(id).slice(fn.length).trim(),
      cell = (i, lab, v, href) =>
        v
          ? `<a class="u2ct" href="${href}"><span class="u2cti">${ic(i)}</span><span class="u2ctt"><small>${lab}</small><b>${esc(v)}</b></span></a>`
          : `<button class="u2ct u2ctadd" data-a="coEditEl" data-id="${id}"><span class="u2cti">${ic(i)}</span><span class="u2ctt"><small>${lab}</small><b>Ajouter</b></span></button>`;
    if (S.elTab === 'histo') {
      const hs = SEANCES.filter(s => s.pres && s.pres[id] && s.d <= TODAY).sort((a, b) => b.d.localeCompare(a.d)),
        nP = hs.filter(s => s.pres[id] === 'P').length;
      body =
        `<div class="cotiles">${coTile('cal', hs.length, 'Séances')}${coTile('check', (hs.length ? Math.round((nP * 100) / hs.length) : 0) + ' %', 'Présence')}${coTile('excuse', hs.filter(s => s.pres[id] === 'E').length, 'Excusé')}${coTile('x', hs.filter(s => s.pres[id] === 'A').length, 'Absent')}</div>` +
        (hs.length
          ? `<div class="u2hl">${hs
              .map(s =>
                u2Hist({
                  d: s.d,
                  h: (grp(s.g) || {}).h || s.gh || '',
                  title: esc((grp(s.g) || {}).name || s.gnom || 'Séance'),
                  sub: s.theme ? esc(s.theme) : '',
                  tone: s.pres[id] === 'P' ? 'ok' : s.pres[id] === 'E' ? 'ex' : 'ab',
                  tags: `<span class="tag">${presLbl[s.pres[id]]}</span>`,
                  go: `data-a="open" data-v="seance" data-id="${s.id}"`
                })
              )
              .join('')}</div>`
          : none('cal', 'Aucune séance', ''));
    }
    return `<div class="pad"><div class="card u2fiche"><div class="u2fh">${coAv(id, 'lg')}<div class="u2fn"><span class="u2fp">${esc(fn)}</span><b class="u2fl">${esc(ln)}</b><span class="tag">${M[id] ? 'Compte /RAM Club' : 'Sans compte'}</span></div><div class="u2fc">${cell('phone', 'Téléphone', tel, 'tel:' + esc(String(tel).replace(/[^+\d]/g, '')))}${cell('mail', 'E-mail', mail, 'mailto:' + esc(mail))}</div><div class="u2fa"><button class="btn ghost" data-a="coEditEl" data-id="${id}">${ic('edit')}Modifier la fiche</button>${M[id] ? '' : `<button class="btn" data-a="coLink" data-id="${id}">${ic('link')}Relier à un compte /RAM</button>`}</div></div>${tabs}<div class="u2fb">${body}</div></div></div>`;
  };

  /* Fiche de groupe : le cycle en cours et sa progression en haut, les élèves tout de suite (ajout et retrait), puis les
     séances à venir et effectuées en petites cartes, et les actions (cycle à l'avance, périodes sans cours) à portée de main */
  const u2GroupeF = V.cgroupe;
  V.cgroupe = id => {
    const g = grp(id);
    if (!g) return u2GroupeF(id);
    const st = coStu(g),
      up = coDates(g, isoIn(1), g.to && g.to > isoIn(1) ? g.to : isoIn(180)),
      past = coDates(g, g.from || isoIn(-365), TODAY).reverse(),
      c = REGLES.cycleCourant(g, TODAY),
      E = c ? REGLES.cycleEtat(g, c, cycleSes(g), TODAY) : null,
      pct = E && E.prevues ? Math.min(100, Math.round((100 * E.faites) / E.prevues)) : 0,
      reste = E ? E.seances.filter(x => x.etat === 'next').length : 0,
      etat = E
        ? reste <= 1
          ? '<span class="tag hot">À renouveler</span>'
          : reste <= 3
            ? '<span class="tag ac">Fin proche</span>'
            : '<span class="tag ok">En cours</span>'
        : '',
      ch = g._club
        ? CO_EXT[g._club] && CO_EXT[g._club].chans && CO_EXT[g._club].chans.has(g.id)
          ? { id: g.id, name: g.name, ext: g._club }
          : null
        : chans.find(x => x.id === g.id),
      todo = past.filter(d => {
        const s = sesFind(g, d);
        return !isCx(g, d) && !(s && (s.recap || s.noRecap)) && !BROUILLONS.some(b => b.id === sesKey(g, d));
      }).length,
      recaps = past.map(d => ({ d, s: sesFind(g, d) })).filter(x => x.s && x.s.recap),
      next = up.slice(0, 5),
      box = (icn, title, extra, inner) =>
        `<div class="card u2c u2gs"><div class="calh">${ic(icn)}<b>${title}</b>${extra || ''}</div>${inner}</div>`;
    const head = `<div class="card u2gh"><div class="u2gt"><span class="kicker">${coSlot(g)} · ${g.dur} · ${g.defLoc || 'En salle'}</span><span class="h3">${esc(g.name)}</span></div><div class="u2gc"><div class="u2gcl"><span class="u2gct">${ic('ladder')}${
      E
        ? `<b>${esc(c.nom || 'Cycle en cours')}</b><span class="muted">${E.faites}/${E.prevues} séances</span>`
        : `<b>${coOver(g) ? 'Cycle terminé le ' + fmtD(g.to) : 'Pas de cycle en cours'}</b><span class="muted">${g.to ? 'jusqu’au ' + fmtD(g.to) : 'séances chaque semaine'}</span>`
    }</span>${etat}</div>${E ? `<span class="gbt u2gj" role="img" aria-label="${E.faites} séances sur ${E.prevues}"><i style="width:${pct}%"></i></span>` : ''}</div><div class="u2ga"><button class="btn" data-a="coPlan" data-id="${g.id}" title="Programmer un cycle à l’avance">${ic('plus')}Nouveau cycle</button><button class="btn ghost" data-a="coOffAdd" data-id="${g.id}">${ic('ban')}Périodes sans cours</button><button class="btn ghost" data-a="coGrpEdit" data-id="${g.id}">${ic('edit')}Modifier</button></div></div>`;
    const tiles = `<div class="cotiles">${coTile('user', g.coach && M[g.coach] ? first(g.coach) : 'À choisir', 'Enseignant', 1)}<div class="cotile">${ic('users')}<b>${st.length}${g.max ? '<small>/' + g.max + '</small>' : ''}</b><span>${g.max ? 'Places occupées' : plural(st.length, 'élève')}</span>${g.max ? `<span class="cobarre" aria-hidden="true"><i style="width:${Math.min(100, Math.round((st.length * 100) / g.max))}%"></i></span>` : ''}</div>${coGrpOffer(g)}</div>`;
    const formule = u2SansFormule(g)
      ? `<div class="card u2c u2fo"><div class="calh">${ic('ball')}<b>Formule à choisir</b></div><p class="muted small">Ce groupe n’a pas encore de formule. Choisis-la : c’est elle qui donne le prix des séances et, pour un pack, leur nombre.</p><button class="btn" data-a="coGrpOf" data-id="${g.id}">${ic('ball')}Choisir la formule</button></div>`
      : '';
    const eleves = box(
      'users',
      'Élèves · ' + st.length,
      '',
      `${st.map(k => `<div class="corow">${coAv(k)}<button class="nm grow" data-a="open" data-v="eleve" data-id="${k}" style="text-align:left">${esc(svName(k))}</button><button class="ib" data-a="coRm" data-g="${g.id}" data-k="${k}" aria-label="Retirer ${esc(svName(k))} du groupe">${ic('x')}</button></div>`).join('') || empty('users', 'Aucun élève', '')}<button class="btn sm full" data-a="coAdd" data-id="${g.id}">${ic('plus')}Ajouter des élèves</button>`
    );
    const avenir = box(
      'cal',
      'Séances à venir · ' + up.length,
      `<button class="chip" data-a="coPlan" data-id="${g.id}">${ic('plus')}Ajouter</button>`,
      up.length
        ? `<div class="u2hl">${up
            .slice(0, 6)
            .map(d => u2Ses(g, d))
            .join('')}</div>${up.length > 6 ? `<p class="muted small">Et ${plural(up.length - 6, 'autre séance', 'autres séances')}.</p>` : ''}`
        : empty('cal', 'Aucune séance à venir', 'Programme un cycle, un pack ou des dates une par une.')
    );
    const faites = box(
      'check',
      'Séances effectuées · ' + past.length,
      todo && coOf().rappelBilans ? `<span class="tag cost todo">${plural(todo, 'bilan à écrire', 'bilans à écrire')}</span>` : '',
      past.length
        ? `<div class="u2hl">${past
            .slice(0, 6)
            .map(d => u2Ses(g, d))
            .join('')}</div>${
            past.length > 6
              ? `<details class="coplus"><summary>Voir les ${plural(past.length - 6, 'autre séance', 'autres séances')}</summary><div class="u2hl">${past
                  .slice(6)
                  .map(d => u2Ses(g, d))
                  .join('')}</div></details>`
              : ''
          }`
        : empty('check', 'Aucune séance faite', 'Après chaque séance : l’appel et le bilan, ici.')
    );
    const cycles = box(
      'ladder',
      'Cycles et réglages',
      '',
      `${coCycleBar(g)}<div class="cokv"><span class="muted">${coOver(g) ? 'Cycle terminé le ' + fmtD(g.to) : g.to ? 'Cycle en cours, jusqu’au ' + fmtD(g.to) : 'En cours, chaque semaine'}</span>${coCycleTg(g)}</div>${coLocTg(g)}${typeof coCyclesHtml === 'function' ? coCyclesHtml(g) : ''}`
    );
    const discussion = box(
      'chat',
      'Discussion du groupe',
      '',
      ch
        ? `${ch.ext ? `<div class="item"><span class="tile">${ic('chat')}</span><span class="grow"><span class="nm">${esc(ch.name)}</span><br><span class="muted small">Dans /RAM Club, ${esc(coClubName(g))}</span></span></div>` : `<button class="item" data-a="open" data-v="chan" data-id="${ch.id}"><span class="tile">${ic('chat')}</span><span class="grow"><span class="nm">${esc(ch.name)}</span><br><span class="muted small">Dans /RAM Club pour les élèves et les parents</span></span></button>`}<button class="item" data-a="coChanDel" data-id="${g.id}"><span class="tile">${ic('x')}</span><span class="grow"><span class="nm">Supprimer la discussion</span><br><span class="muted small">Le groupe et ses séances restent</span></span></button>`
        : `<p class="muted small">Ce groupe n'a pas de discussion dans /RAM Club.</p><button class="btn sm full ghost" data-a="coChanNew" data-id="${g.id}">${ic('plus')}Créer la discussion du groupe</button>`
    );
    const themes = next.length
      ? `<details class="card cothm"><summary><b>Thèmes des prochaines séances</b><span class="muted small"> · les élèves les voient dans leurs cours</span></summary><form id="co-themes" data-id="${g.id}">${next.map(d => `<div class="fld"><label for="co-t-${d}">${fmtD(d)}${isCx(g, d) ? ' · annulé' : ''}</label><input id="co-t-${d}" data-d="${d}" class="co-t" autocomplete="off" placeholder="Thème" value="${esc((sesFind(g, d) || {}).theme || '')}"></div>`).join('')}<button class="btn full">Enregistrer les thèmes</button></form></details>`
      : '';
    const bilans = recaps.length
      ? box(
          'doc',
          'Bilans du groupe',
          '',
          recaps
            .slice(0, 6)
            .map(
              x =>
                `<button class="item" data-a="open" data-v="seance" data-id="${sesKey(g, x.d)}"><span class="tile">${ic('doc')}</span><span class="grow"><span class="nm">${fmtD(x.d)}</span><br><span class="muted small">${esc(String(x.s.recap).slice(0, 110))}</span></span></button>`
            )
            .join('')
        )
      : '';
    return `<div class="pad u2g">${head}${formule}${tiles}<div class="u2g2"><div class="u2gl">${eleves}${u2ObjGroupe(g)}${discussion}${cycles}<div class="u2gdel"><button class="u2dng" data-a="coGrpDel" data-id="${g.id}">${ic('trash')}Supprimer le groupe</button></div></div><div class="u2gr">${avenir}${faites}${coOffHtml(g)}${themes}${bilans}</div></div></div>`;
  };

  /* Supprimer un groupe : le groupe seul. Gardés : formules, achats, paiements, séances effectuées (présences, bilans), historique des élèves,
     discussion. Retirées avec lui : ses séances à venir sans appel ni bilan. Les séances gardées reçoivent le nom et l'heure du groupe (gnom, gh)
     pour rester lisibles dans la fiche de chaque élève. Même règle côté connecteur (lib/mcp-outils.js, coach_supprimer_groupe). */
  const u2Meme = (s, g) => s.g === g.id && (s._club || '') === (g._club || '');
  const u2Donnees = s => Object.keys(s.pres || {}).length > 0 || !!s.recap || !!s.noRecap;
  A.coGrpDel = d => {
    const g = grp(d.id);
    if (!g) return;
    const venir = SEANCES.filter(s => u2Meme(s, g) && s.d > TODAY && !u2Donnees(s)).length,
      faites = SEANCES.filter(s => u2Meme(s, g) && !(s.d > TODAY && !u2Donnees(s))).length;
    sheet(
      'Supprimer le groupe',
      `<div class="body"><p>Le groupe <b>${esc(g.name)}</b> va être supprimé.</p><p><b>Supprimé :</b> le groupe, son cycle en cours et ses dates${venir ? `, et ${plural(venir, 'séance à venir', 'séances à venir')} sans appel ni bilan` : ''}.</p><p><b>Gardé :</b> les formules et achats des élèves, leurs paiements, ${faites ? plural(faites, 'séance effectuée', 'séances effectuées') + ' avec leurs présences et bilans' : 'les séances effectuées'}, l’historique de chaque élève et la discussion du groupe.</p><button class="btn full hot" data-a="coGrpDelOk" data-id="${g.id}">${ic('trash')}Supprimer le groupe</button><button class="btn full ghost" data-a="close">Garder le groupe</button></div>`
    );
  };
  A.coGrpDelOk = d => {
    const g = grp(d.id);
    closeSheet();
    if (!g) return;
    for (let i = SEANCES.length - 1; i >= 0; i--) {
      const x = SEANCES[i];
      if (!u2Meme(x, g)) continue;
      if (x.d > TODAY && !u2Donnees(x)) SEANCES.splice(i, 1);
      else {
        x.gnom = g.name;
        x.gh = g.h || '';
      }
    }
    GROUPS.splice(GROUPS.indexOf(g), 1);
    S.stack = S.stack.filter(v => !(v.v === 'cgroupe' && v.id === g.id));
    coSave('Groupe supprimé : formules, séances effectuées et paiements gardés');
  };

  /* ---------- Objectifs et compétences : d'un élève ou d'un groupe, compétences validées d'un seul toucher ----------
     Collection « objectif » (OBJECTIFS, regles.js objDe / objProgres / objBascule) ; l'élève les lit dans /Buvette, École, Mon espace (objMes). */
  const objId = () => 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    objCid = () => 'c' + Math.random().toString(36).slice(2, 7),
    objListe = sc => OBJECTIFS.filter(o => (sc.g ? o.g === sc.g : o.to === sc.k)).sort((a, b) => (a.ord || 0) - (b.ord || 0)),
    objAjout = sc =>
      `<button class="btn ghost sm full" data-a="u2ObjEdit" ${sc.g ? `data-g="${sc.g}"` : `data-to="${sc.k}"`}>${ic('plus')}Ajouter un objectif</button>`,
    objEntete = (o, p) => {
      const pct = p.total ? Math.round((100 * p.ok) / p.total) : 0,
        g = o.g ? grp(o.g) : null;
      return `<div class="objh"><b>${esc(o.nom)}</b><span class="objp">${p.ok}/${p.total}</span><button class="ib" data-a="u2ObjEdit" data-id="${o.id}" aria-label="Modifier l’objectif ${esc(o.nom)}">${ic('edit')}</button></div>${g && !o.to ? `<span class="tag objt">Objectif du groupe · ${esc(g.name)}</span>` : ''}<span class="objb" role="img" aria-label="${p.ok} sur ${p.total}"><i style="width:${pct}%"></i></span>`;
    };
  /* la fiche d'un élève : ses objectifs et ceux de ses groupes ; chaque compétence se valide d'un toucher */
  function u2ObjEleve(k) {
    const L = REGLES.objDe(OBJECTIFS, k, coGroupsOf(k).map(g => g.id)),
      libre = ((coEl(k) || {}).goals || '').trim();
    return `<div class="card obj-card">${libre ? `<p class="objlibre">${esc(libre)}</p>` : ''}${
      L.length
        ? L.map(o => {
            const p = REGLES.objProgres(o, [k]);
            return `<div class="obj">${objEntete(o, p)}<div class="objl">${(o.comps || [])
              .map(c => {
                const on = !!(o.ok && o.ok[c.id] && o.ok[c.id][k]);
                return `<button class="objc${on ? ' on' : ''}" role="switch" aria-checked="${on}" data-a="u2Comp" data-o="${o.id}" data-c="${c.id}" data-k="${k}"><span class="objk">${ic('check')}</span><span class="grow">${esc(c.nom)}</span></button>`;
              })
              .join('')}</div></div>`;
          }).join('')
        : '<p class="muted small">Aucun objectif pour le moment.</p>'
    }${objAjout({ k })}</div>`;
  }
  /* la fiche d'un groupe : ses objectifs, avec la validation élève par élève (une pastille par élève) */
  function u2ObjGroupe(g) {
    const st = coStu(g),
      L = objListe({ g: g.id });
    return `<div class="card u2c u2gs obj-card"><div class="calh">${ic('target')}<b>Objectifs du groupe</b></div>${
      L.length
        ? L.map(o => {
            const p = REGLES.objProgres(o, st);
            return `<div class="obj">${objEntete(o, p)}<div class="objl">${(o.comps || [])
              .map(c => {
                const n = st.filter(k => o.ok && o.ok[c.id] && o.ok[c.id][k]).length;
                return `<div class="objr"><span class="objn">${esc(c.nom)}<small>${n}/${st.length}</small></span><span class="objg">${st
                  .map(k => {
                    const on = !!(o.ok && o.ok[c.id] && o.ok[c.id][k]);
                    return `<button class="objs${on ? ' on' : ''}" role="switch" aria-checked="${on}" data-a="u2Comp" data-o="${o.id}" data-c="${c.id}" data-k="${k}" aria-label="${esc(svName(k))} : ${esc(c.nom)}">${coAv(k, 'xs')}<span>${esc(svFirst(k))}</span><i>${ic('check')}</i></button>`;
                  })
                  .join('')}</span></div>`;
              })
              .join('')}</div></div>`;
          }).join('')
        : '<p class="muted small">Un objectif de groupe s’applique à chaque élève ; la validation reste individuelle.</p>'
    }${objAjout({ g: g.id })}</div>`;
  }
  A.u2Comp = d => {
    const o = OBJECTIFS.find(x => x.id === d.o);
    if (!o) return;
    const on = REGLES.objBascule(o, d.c, d.k, TODAY);
    coSave(on ? 'Compétence validée' : 'Validation retirée');
  };
  const objLigne = c =>
    `<div class="objer" data-c="${c.id}"><input value="${esc(c.nom)}" placeholder="Compétence" aria-label="Compétence" autocomplete="off"><button type="button" class="ib" data-a="u2CompMv" data-s="-1" aria-label="Monter">${ic('up')}</button><button type="button" class="ib" data-a="u2CompMv" data-s="1" aria-label="Descendre">${ic('down')}</button><button type="button" class="ib" data-a="u2CompRm" aria-label="Retirer la compétence">${ic('x')}</button></div>`;
  A.u2ObjEdit = d => {
    const o = d.id ? OBJECTIFS.find(x => x.id === d.id) : null,
      to = d.to || (o && o.to) || '',
      g = d.g || (o && o.g) || '';
    sheet(
      o ? 'Modifier l’objectif' : 'Nouvel objectif',
      `<form class="body" id="u2-obj" data-id="${o ? o.id : ''}" data-to="${to}" data-g="${g}"><div class="fld"><label for="u2o-nom">Objectif</label><input id="u2o-nom" value="${esc(o ? o.nom : '')}" placeholder="Ex. Maîtriser la bandeja" autocomplete="off" required></div><div class="fld"><label>Compétences à acquérir</label><div id="u2o-cs">${(o ? o.comps : [{ id: objCid(), nom: '' }]).map(objLigne).join('')}</div><button type="button" class="btn ghost sm full" data-a="u2CompAdd">${ic('plus')}Ajouter une compétence</button></div>${
        o
          ? `<div class="objmv"><button type="button" class="btn ghost sm" data-a="u2ObjMv" data-id="${o.id}" data-s="-1">${ic('up')}Monter l’objectif</button><button type="button" class="btn ghost sm" data-a="u2ObjMv" data-id="${o.id}" data-s="1">${ic('down')}Descendre l’objectif</button></div>`
          : ''
      }<button class="btn full">${ic('check')}Enregistrer</button>${o ? `<button type="button" class="btn full ghost" data-a="u2ObjDel" data-id="${o.id}">${ic('trash')}Supprimer l’objectif</button>` : ''}</form>`
    );
  };
  A.u2CompAdd = () => {
    const z = $('u2o-cs');
    z.insertAdjacentHTML('beforeend', objLigne({ id: objCid(), nom: '' }));
    z.lastElementChild.querySelector('input').focus();
  };
  A.u2CompRm = (d, el) => el.closest('.objer').remove();
  A.u2CompMv = (d, el) => {
    const r = el.closest('.objer'),
      s = +d.s;
    if (s < 0 && r.previousElementSibling) r.parentNode.insertBefore(r, r.previousElementSibling);
    if (s > 0 && r.nextElementSibling) r.parentNode.insertBefore(r.nextElementSibling, r);
    el.focus();
  };
  A.u2ObjMv = d => {
    const o = OBJECTIFS.find(x => x.id === d.id);
    if (!o) return;
    const sc = objListe(o.g ? { g: o.g } : { k: o.to }),
      i = sc.indexOf(o),
      j = i + +d.s;
    if (j < 0 || j >= sc.length) return toast(+d.s < 0 ? 'Déjà en premier' : 'Déjà en dernier');
    sc.splice(j, 0, sc.splice(i, 1)[0]);
    sc.forEach((x, n) => (x.ord = n));
    closeSheet();
    coSave('Objectif déplacé');
  };
  A.u2ObjDel = d => {
    const o = OBJECTIFS.find(x => x.id === d.id);
    if (!o || !confirm('Supprimer l’objectif « ' + o.nom + ' » et ses validations ?')) return;
    OBJECTIFS.splice(OBJECTIFS.indexOf(o), 1);
    closeSheet();
    coSave('Objectif supprimé');
  };
  document.addEventListener('submit', e => {
    if (e.target.id !== 'u2-obj') return;
    e.preventDefault();
    const f = e.target,
      nom = $('u2o-nom').value.trim(),
      comps = [...f.querySelectorAll('.objer')].map(r => ({ id: r.dataset.c, nom: r.querySelector('input').value.trim() })).filter(c => c.nom);
    if (!nom) return;
    let o = f.dataset.id ? OBJECTIFS.find(x => x.id === f.dataset.id) : null;
    if (!o) {
      o = { id: objId(), nom, comps, at: Date.now() };
      if (f.dataset.g) o.g = f.dataset.g;
      else o.to = f.dataset.to;
      const sc = objListe(o.g ? { g: o.g } : { k: o.to });
      o.ord = sc.length ? Math.max(...sc.map(x => x.ord || 0)) + 1 : 0;
      OBJECTIFS.push(o);
    } else {
      o.nom = nom;
      const gardees = new Set(comps.map(c => c.id));
      if (o.ok) {
        Object.keys(o.ok).forEach(c => !gardees.has(c) && delete o.ok[c]);
        if (!Object.keys(o.ok).length) delete o.ok;
      }
      o.comps = comps;
    }
    closeSheet();
    coSave('Objectif enregistré');
  });
  /* la fiche élève : la sous-carte « Objectifs » devient structurée ; la fiche de groupe : une carte d'objectifs sous les élèves */
  const u2EleveObj = V.eleve;
  V.eleve = id => {
    const h = u2EleveObj(id);
    return h.replace(/(Objectifs<\/span><\/h2>)<div class="card"><p>[\s\S]*?<\/p><\/div>/, (m, t) => t + u2ObjEleve(id));
  };
}
