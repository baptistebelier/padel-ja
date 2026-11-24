/* /Dojo — coach/8-ui2.js : nouvelle organisation de /Dojo (maquette Figma « /Dojo · Nouvelle interface », 11/2026).
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
  /* l'entrée du menu allumée, lue par render() avant de placer le curseur (la corriger après coup le faisait clignoter) :
     une fiche élève ouverte depuis une autre page (Planning, Groupes…) allume Élèves ; Statistiques allume Aujourd'hui */
  window.tabActif = () => (view().v === 'eleve' ? 'eleves' : S.tab === 'dash' && !S.stack.length ? 'today' : S.tab);

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
        return `<div class="u2apr">${coAv(k, 'sm')}<span class="u2apn"><b>${esc(fn)}</b> ${esc(ln)}${v === 'E' ? ' <span class="tag">Excusé</span>' : ''}</span><span class="u2apb" role="group" aria-label="Présence de ${esc(svName(k))}">${[
          'P',
          'A'
        ]
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
    ['co-ax', 'co-aps', 'co-an2'].forEach(id => {
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
        ],
        [
          'coPdPick',
          'racket',
          'Partie dirigée',
          'Avec recherche de joueurs par niveau, ou déjà complète et placée dans ton agenda.'
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
  /* Réglages : une seule boîte, quatre intercalaires collés à son bord supérieur (Profil, Offres, Agenda, Historique).
     Chaque bloc du profil va dans la famille de son titre ; ce qui ne colle à aucune famille reste dans Profil. */
  const u2Me = V.me;
  const U2_ME = [
    ['profil', 'Profil'],
    ['offres', 'Offres'],
    ['agenda', 'Agenda'],
    ['histo', 'Historique']
  ];
  const u2MeLu = () => {
    try {
      return localStorage.getItem('coach-reglages-onglet');
    } catch (e) {
      return null;
    }
  };
  /* « Mon offre » (offres du 23/11/2026) : /Dojo gratuit (compteurs et limites) ou /Dojo Pro ; lue une fois sur le serveur */
  const u2Offre = () => {
    if (!(window.RAM && RAM.user)) return '';
    const o = S.dojoOffre;
    if (!o) {
      if (!S.dojoOffreLu) {
        S.dojoOffreLu = 1;
        fetch('/api/offres/dojo', { credentials: 'include' })
          .then(r => (r.ok ? r.json() : null))
          .then(d => {
            if (d) {
              S.dojoOffre = d;
              if (S.tab === 'me') render(true);
            }
          })
          .catch(() => {});
      }
      return '';
    }
    const L = o.limites,
      nf = ['formules', 'packs', 'abos'].reduce((n, k) => n + ((OFFRES && OFFRES[k]) || []).length, 0),
      ligne = (n, m, l) => `<div class="corow"><span class="grow">${l}</span><b>${n} / ${m}</b></div>`;
    if (o.offre === 'pro')
      return `<section class="card copc"><span class="coey">Mon offre</span><h2 class="coh2">/Dojo Pro</h2><p class="muted small">${o.admin ? 'Compte administrateur : toutes les options, sans abonnement.' : o.offertParClub ? 'Offert par ton club (offre /Buvette Club +).' : 'Actif jusqu’au ' + new Date(o.until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + '.'} Élèves, groupes et formules illimités, réservation en ligne et suivi des élèves.</p></section>`;
    return `<section class="card copc"><span class="coey">Mon offre</span><h2 class="coh2">/Dojo gratuit</h2>${ligne(o.eleves, L.eleves, 'Élèves')}${ligne(o.groupes, L.groupes, 'Groupes')}${ligne(nf, L.formules, 'Formules, packs et abonnements')}<p class="muted small">La réservation en ligne et le suivi des élèves font partie de /Dojo Pro : élèves, groupes et formules illimités.</p><a class="btn full" href="${esc(o.boutique)}" target="_blank" rel="noopener">${ic('star')}Passer à /Dojo Pro · 15 € par mois</a></section>`;
  };
  V.me = id => {
    if (id) return u2Me(id);
    let k = S.meTab || u2MeLu();
    if (!U2_ME.some(t => t[0] === k)) k = 'profil';
    S.meTab = k;
    const seg = `<div class="seg haut u2sous u2meseg" role="tablist" aria-label="Réglages">${U2_ME.map(([v, l]) => `<button role="tab" aria-selected="${k === v}" data-a="u2MeTab" data-k="${v}"><span class="lb">${l}</span></button>`).join('')}</div>`;
    const tpl = document.createElement('template');
    tpl.innerHTML = u2Me(id);
    const base = tpl.content.querySelector('.coprof') || tpl.content,
      fam = el => {
        const h = el.querySelector && el.querySelector('.coh2') ? el.querySelector('.coh2').textContent : '';
        if (/^Formules et tarifs$/.test(h)) return 'offres';
        if (/^(Mes disponibilités|Mes outils de réservation|Mes vacances|Vacances des clubs)$/.test(h)) return 'agenda';
        return 'profil';
      },
      bloc = { profil: [], offres: [], agenda: [] };
    [...base.children].forEach(el => bloc[fam(el)].push(el.outerHTML));
    bloc.profil.unshift(u2Offre());
    bloc.offres.push(
      `<section class="card copc"><span class="coey">Techniques</span><h2 class="coh2">Échelles techniques</h2><button class="btn full" data-a="open" data-v="niveaux">${ic('ladder')}Mes échelles techniques</button></section>`
    );
    const body =
      k === 'histo'
        ? V.histo()
            .replace(/^<div class="pad[^"]*">/, '')
            .replace(/<\/div>$/, '')
        : bloc[k].join('');
    return seg + `<div class="pad u2f"><div class="card u2mebox u2me-${k}">${body}</div></div>`;
  };
  A.u2MeTab = d => {
    S.meTab = d.k;
    try {
      localStorage.setItem('coach-reglages-onglet', d.k);
    } catch (e) {}
    render(true);
  };

  /* ---------- Planning : Jour / Semaine / Mois en intercalaires collés à la boîte (sélecteur de période + grille) ---------- */
  const u2Plan = V.planning;
  V.planning = () => {
    const h = u2Plan().replace(/<div class="chips covue"[\s\S]*?<\/div>/, '');
    if (!/class="pad covue/.test(h)) return h;
    return (
      `<div class="seg haut u2sous u2vue" role="tablist" aria-label="Vue du planning">${COVUES.map(([v, l]) => `<button role="tab" aria-selected="${(S.pl.v || 'semaine') === v}" data-a="coVue" data-k="${v}"><span class="lb">${l}</span></button>`).join('')}</div>` +
      h
    );
  };
  function u2BoitePlanning() {
    const pad =
      $('main') && $('main').querySelector(':scope > .pad.covues, :scope > .pad.covuej, :scope > .pad.covuem');
    if (!pad || S.tab !== 'planning' || S.stack.length) return;
    const week = pad.querySelector(':scope > .card.coweek'),
      grille = pad.querySelector(':scope > .cogrid, :scope > .cowg, :scope > .cogm');
    if (!grille || pad.querySelector(':scope > .u2plbox')) return;
    if (!week) {
      // grand écran : le sélecteur de période est dans l'en-tête ; la grille seule forme la boîte
      if (grille.classList.contains('card')) return;
      const b = document.createElement('div');
      b.className = 'card u2plbox';
      pad.insertBefore(b, grille);
      b.append(grille);
      return;
    }
    const box = document.createElement('div');
    box.className = 'card u2plbox';
    pad.insertBefore(box, week);
    week.classList.remove('card');
    grille.classList.remove('card');
    box.append(week, grille);
  }

  /* ---------- après chaque affichage : menu, Réglages, lien vers le suivi ---------- */
  function u2Nav() {
    const tabs = $('tabs');
    if (tabs) {
      tabs.querySelectorAll('button[data-t]').forEach(b => {
        if (u2Hors(b.dataset.t)) b.remove();
      });
      tabs.querySelectorAll('.coplus').forEach(b => b.remove());
      // l'entrée allumée (Élèves pour une fiche élève, Aujourd'hui pour Statistiques) est choisie par window.tabActif
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
    // Planning : plus de « … » (l'historique des séances est dans Réglages > Historique, le reste dans « + »)
    if (top) top.querySelectorAll('[data-a="coPlMore"]').forEach(b => b.remove());
    // Messages : « + » carré (Nouveau message) à côté des réglages et de la cloche, sur téléphone comme sur ordinateur
    if (top && !S.stack.length && S.tab === 'msgs' && !top.querySelector('.u2msgnew')) {
      const anchor = top.querySelector('.u2gear') || top.querySelector('[data-a="notifs"]');
      const h = `<button class="ib acc coplt u2msgnew" data-a="u2MsgNew" aria-label="Nouveau message">${ic('plus')}</button>`;
      if (anchor) anchor.insertAdjacentHTML('beforebegin', h);
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
  /* Élèves : une seule boîte sous les intercalaires (recherche et filtre, puis le titre et la liste, puis l'ajout d'un élève) */
  function u2BoiteEleves() {
    const main = $('main');
    if (!main || view().v !== 'eleves' || S.elF === 'pay') return;
    const seg = document.querySelector('#main > .seg, #subnav > .seg');
    if (seg) seg.classList.add('u2elseg');
    let box = main.querySelector('.card.colist');
    const search = main.querySelector('.card:has(> .cosearch)'),
      add = main.querySelector('.card:has(> [data-a="coNewEl"])');
    if (!search || search.classList.contains('u2elbox') || (box && box.classList.contains('u2elbox'))) return;
    if (box) {
      box.classList.add('u2elbox');
      [...search.children].reverse().forEach(c => box.prepend(c));
      search.remove();
    } else {
      // liste vide (aucun abonné, par exemple) : la carte de recherche devient la boîte et reprend le titre et le message
      box = search;
      box.classList.add('u2elbox');
      for (let n = box.nextElementSibling; n && n !== add; n = box.nextElementSibling) box.append(n);
    }
    if (add) {
      box.append(...add.children);
      add.remove();
    }
  }
  /* « + » de Messages : une fenêtre à deux choix, chacun menant au parcours d'envoi existant */
  A.u2MsgNew = () =>
    sheet(
      'Nouveau message',
      `<div class="body"><div class="menu"><button data-a="coNewMsg">${ic('user')}Écrire à un élève</button><button data-a="coNewGrpMsg">${ic('users')}Écrire à un groupe</button></div></div>`
    );
  const u2Rail = ramRail;
  ramRail = function (t, sub) {
    u2Rail(t, sub);
    u2Nav();
    u2Pastilles();
    u2BoiteEleves();
    u2BoitePlanning();
  };

  /* ---------- Fiche élève en une seule carte, fiche de groupe, historique en petites cartes empilées ---------- */
  const U2M = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  /* petite carte de séance de l'historique (élève, groupe) : l'encart coloré porte la date et l'heure ; les cartes
     s'empilent, ce n'est pas un agenda. tone : ok (faite), ex (excusé), ab (absent ou annulée), '' (à venir) */
  const u2HistCarte = o => {
    const el = o.go ? 'button' : 'div';
    return `<${el} class="u2hs ${o.tone || ''}"${o.go ? ' ' + o.go : ''}><span class="u2hd"><b>${esc(DA[new Date(o.d + 'T12:00').getDay()])} ${+o.d.slice(8)}</b><span>${U2M[+o.d.slice(5, 7) - 1]}</span>${o.h ? `<i>${esc(o.h)}</i>` : ''}</span><span class="u2hb"><span class="nm${o.cx ? ' u2cx' : ''}">${o.title}</span>${o.sub ? `<span class="muted small">${o.sub}</span>` : ''}</span>${o.tags ? `<span class="u2ht">${o.tags}</span>` : ''}</${el}>`;
  };
  const u2Hist = o =>
    o.del
      ? `<div class="u2sw"><button class="u2swd" type="button" ${o.del} aria-label="Supprimer cette séance">${ic('trash')}</button>${u2HistCarte(o)}</div>`
      : u2HistCarte(o);
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
      go: `data-a="open" data-v="seance" data-id="${sesKey(g, d)}"`,
      del: `data-a="u2SesDel" data-g="${g.id}" data-d="${d}"`
    });
  };

  /* Fiche élève : deux boîtes séparées. La première, fermée sur elle-même : identité, coordonnées, boutons. La seconde, à
     l'écart normal d'une carte : les intercalaires collés à son bord supérieur, puis le contenu de l'onglet choisi
     (sous-cartes avec leur picto, cadre « Abonné » en tête de l'onglet Fiche) */
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
                  go: `data-a="open" data-v="seance" data-id="${s.id}"`,
                  del: `data-a="u2SesDel" data-g="${s.g}" data-d="${s.d}" data-k="${id}"`
                })
              )
              .join('')}</div>`
          : none('cal', 'Aucune séance', ''));
    }
    return `<div class="pad u2f"><div class="card u2fiche"><div class="u2fh">${coAv(id, 'lg')}<div class="u2fn"><span class="u2fp">${esc(fn)}</span><b class="u2fl">${esc(ln)}</b><span class="tag">${M[id] ? 'Compte /Buvette' : 'Sans compte'}</span></div><div class="u2fc">${cell('phone', 'Téléphone', tel, 'tel:' + esc(String(tel).replace(/[^+\d]/g, '')))}${cell('mail', 'E-mail', mail, 'mailto:' + esc(mail))}</div><div class="u2fa"><button class="btn" data-a="u2Prog" data-id="${id}">${ic('cal')}Programmer une séance</button><button class="btn ghost" data-a="coEditEl" data-id="${id}">${ic('edit')}Modifier la fiche</button>${M[id] ? '' : `<button class="btn" data-a="coLink" data-id="${id}">${ic('link')}Relier à un compte /RAM</button>`}</div></div></div><div class="u2boite">${tabs}<div class="card u2fb">${body}</div></div></div>`;
  };

  /* Fiche de groupe : le cycle en cours et sa progression en haut, les élèves tout de suite (ajout et retrait), puis les
     séances à venir et effectuées en petites cartes, et les actions (cycle à l'avance, périodes sans cours) à portée de main */
  const U2_GR = [
    ['seances', 'Séances'],
    ['eleves', 'Élèves'],
    ['formule', 'Formule'],
    ['discussion', 'Discussion'],
    ['reglages', 'Réglages']
  ];
  const u2GrOnglet = () => {
    let k = S.grTab;
    if (!k)
      try {
        k = localStorage.getItem('coach-groupe-onglet');
      } catch (e) {}
    if (!U2_GR.some(t => t[0] === k)) k = 'seances';
    return (S.grTab = k);
  };
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
    const tab = u2GrOnglet(),
      enseignant = coTile('user', g.coach && M[g.coach] ? first(g.coach) : 'À choisir', 'Enseignant', 1),
      places = `<div class="cotile">${ic('users')}<b>${st.length}${g.max ? '<small>/' + g.max + '</small>' : ''}</b><span>${g.max ? 'Places occupées' : plural(st.length, 'élève')}</span>${g.max ? `<span class="cobarre" aria-hidden="true"><i style="width:${Math.min(100, Math.round((st.length * 100) / g.max))}%"></i></span>` : ''}</div>`;
    /* boîte 1 : l'identité du groupe, fermée sur elle-même */
    const head = `<div class="card u2gh"><div class="u2gt"><span class="kicker">${coSlot(g)} · ${g.dur} · ${g.defLoc || 'En salle'}</span><span class="h3">${esc(g.name)}</span></div><div class="cotiles u2gm">${enseignant}${places}</div><div class="u2gc"><div class="u2gcl"><span class="u2gct">${ic('ladder')}${
      E
        ? `<b>${esc(c.nom || 'Cycle en cours')}</b><span class="muted">${E.faites}/${E.prevues} séances</span>`
        : `<b>${coOver(g) ? 'Cycle terminé le ' + fmtD(g.to) : 'Pas de cycle en cours'}</b><span class="muted">${g.to ? 'jusqu’au ' + fmtD(g.to) : 'séances chaque semaine'}</span>`
    }</span>${etat}${u2SansFormule(g) ? `<button class="tag hot u2gfo" data-a="coGrpOf" data-id="${g.id}">Formule à choisir</button>` : ''}</div>${E ? `<span class="gbt u2gj" role="img" aria-label="${E.faites} séances sur ${E.prevues}"><i style="width:${pct}%"></i></span>` : ''}</div><div class="u2ga"><button class="btn" data-a="coPlan" data-id="${g.id}" title="Programmer un cycle à l’avance">${ic('plus')}Nouveau cycle</button><button class="btn ghost" data-a="coOffAdd" data-id="${g.id}">${ic('ban')}Périodes sans cours</button><button class="btn ghost" data-a="coGrpEdit" data-id="${g.id}">${ic('edit')}Modifier</button></div></div>`;
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
            .join(
              ''
            )}</div>${up.length > 6 ? `<p class="muted small">Et ${plural(up.length - 6, 'autre séance', 'autres séances')}.</p>` : ''}`
        : empty('cal', 'Aucune séance à venir', 'Programme un cycle, un pack ou des dates une par une.')
    );
    const faites = box(
      'check',
      'Séances effectuées · ' + past.length,
      todo && coOf().rappelBilans
        ? `<span class="tag cost todo">${plural(todo, 'bilan à écrire', 'bilans à écrire')}</span>`
        : '',
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
        ? `${ch.ext ? `<div class="item"><span class="tile">${ic('chat')}</span><span class="grow"><span class="nm">${esc(ch.name)}</span><br><span class="muted small">Dans /Buvette, ${esc(coClubName(g))}</span></span></div>` : `<button class="item" data-a="open" data-v="chan" data-id="${ch.id}"><span class="tile">${ic('chat')}</span><span class="grow"><span class="nm">${esc(ch.name)}</span><br><span class="muted small">Dans /Buvette pour les élèves et les parents</span></span></button>`}<button class="item" data-a="coChanDel" data-id="${g.id}"><span class="tile">${ic('x')}</span><span class="grow"><span class="nm">Supprimer la discussion</span><br><span class="muted small">Le groupe et ses séances restent</span></span></button>`
        : `<p class="muted small">Ce groupe n'a pas de discussion dans /Buvette.</p><button class="btn sm full ghost" data-a="coChanNew" data-id="${g.id}">${ic('plus')}Créer la discussion du groupe</button>`
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
    /* boîte 2 : les intercalaires collés à son bord supérieur, puis le contenu de l'onglet choisi */
    const corps = {
      seances: `<div class="u2g2"><div class="u2gl">${avenir}${coOffHtml(g)}${themes}</div><div class="u2gr">${faites}${bilans}</div></div>`,
      eleves: `${eleves}${u2ObjGroupe(g)}`,
      formule: `${formule}<div class="cotiles">${coGrpOffer(g)}</div>${cycles}`,
      discussion: discussion,
      reglages: `${box('home', 'Lieu des séances', '', coLocTg(g))}<div class="u2gdel"><button class="u2dng" data-a="coGrpDel" data-id="${g.id}">${ic('trash')}Supprimer le groupe</button></div>`
    }[tab];
    const tabs = `<div class="r-itabs u2itabs" role="tablist" aria-label="Rubriques du groupe">${U2_GR.map(([v, l]) => `<button role="tab" aria-selected="${tab === v}" data-a="u2GrTab" data-k="${v}"><span class="lb">${l}</span></button>`).join('')}</div>`;
    return `<div class="pad u2f u2g">${head}<div class="u2boite">${tabs}<div class="card u2fb u2gb u2gb-${tab}">${corps}</div></div></div>`;
  };
  A.u2GrTab = d => {
    S.grTab = d.k;
    try {
      localStorage.setItem('coach-groupe-onglet', d.k);
    } catch (e) {}
    render(true);
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
        x.gdur = g.dur || '';
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
    objListe = sc =>
      OBJECTIFS.filter(o => (sc.g ? o.g === sc.g : o.to === sc.k)).sort((a, b) => (a.ord || 0) - (b.ord || 0)),
    objAjout = sc =>
      `<button class="btn ghost sm full" data-a="u2ObjEdit" ${sc.g ? `data-g="${sc.g}"` : `data-to="${sc.k}"`}>${ic('plus')}Ajouter un objectif</button>`,
    objEntete = (o, p) => {
      const pct = p.total ? Math.round((100 * p.ok) / p.total) : 0,
        g = o.g ? grp(o.g) : null;
      return `<div class="objh"><b>${esc(o.nom)}</b><span class="objp">${p.ok}/${p.total}</span><button class="ib" data-a="u2ObjEdit" data-id="${o.id}" aria-label="Modifier l’objectif ${esc(o.nom)}">${ic('edit')}</button></div>${g && !o.to ? `<span class="tag objt">Objectif du groupe · ${esc(g.name)}</span>` : ''}<span class="objb" role="img" aria-label="${p.ok} sur ${p.total}"><i style="width:${pct}%"></i></span>`;
    };
  /* la fiche d'un élève : ses objectifs et ceux de ses groupes ; chaque compétence se valide d'un toucher */
  function u2ObjEleve(k) {
    const L = REGLES.objDe(
        OBJECTIFS,
        k,
        coGroupsOf(k).map(g => g.id)
      ),
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
      comps = [...f.querySelectorAll('.objer')]
        .map(r => ({ id: r.dataset.c, nom: r.querySelector('input').value.trim() }))
        .filter(c => c.nom);
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
    return h.replace(
      /(Objectifs<\/span><\/h2>)<div class="card"><p>[\s\S]*?<\/p><\/div>/,
      (m, t) => t + u2ObjEleve(id)
    );
  };

  /* ---------- Programmer une séance depuis la fiche d'un élève ----------
     La formule préremplit durée, sport et prix ; la séance est rattachée à un achat en cours (pack ou abonnement) qui la décompte
     (REGLES.achatsDecomptables, seanceElevePlan : mêmes règles que le connecteur, coach_programmer_seance). Sans achat compatible,
     « Attribuer » crée l'achat puis la séance d'un coup. Un achat de cycle de groupe reçoit la date dans son cycle. */
  const pgOffres = () => {
    const O = typeof OFFRES !== 'undefined' ? OFFRES : { formules: [], packs: [], abos: [] },
      f = x => (O.formules || []).find(y => y.id === x);
    return [
      ...(O.formules || []).map(x => ({
        v: 'f:' + x.id,
        l: `${x.nom} · ${x.duree} min · ${x.prix} €`,
        dur: x.duree,
        sport: x.sport,
        prix: x.prix
      })),
      ...(O.packs || []).map(x => ({
        v: 'p:' + x.id,
        l: `${x.nom || 'Pack ' + x.seances + ' séances'} · ${x.prix} €`,
        dur: (f(x.formule) || {}).duree,
        sport: (f(x.formule) || {}).sport,
        prix: x.seances ? Math.round((x.prix / x.seances) * 100) / 100 : x.prix,
        pack: x
      })),
      ...(O.abos || []).map(x => ({
        v: 'a:' + x.id,
        l: `${x.nom} · abonnement`,
        dur: null,
        sport: null,
        prix: 0,
        abo: x
      }))
    ];
  };
  const pgDispos = k => REGLES.achatsDecomptables(coPacks(k), TODAY, REGLES.progParAchat(GROUPS, TODAY));
  const pgLibres = d => {
    const l = typeof coLibre === 'function' ? coLibre(d) : [],
      h = m => Math.floor(m / 60) + ' h' + (m % 60 ? String(m % 60).padStart(2, '0') : '');
    return l.length
      ? 'Libre ce jour : ' + l.map(p => h(p.du) + '–' + h(p.au)).join(' · ')
      : 'Aucun créneau libre indiqué ce jour.';
  };
  A.u2Prog = d => {
    const k = d.id,
      cl = coClubList(),
      cur = (S.coClub !== 'all' && S.coClub) || coMainId(),
      of = pgOffres(),
      dispos = pgDispos(k),
      fiche = coEl(k) || {},
      sel0 = dispos.length === 1 ? dispos[0].id : '';
    sheet(
      'Programmer une séance',
      `<form class="body" id="u2-prog" data-id="${k}"><p class="muted small">Pour <b>${esc(svName(k))}</b>.</p><div class="fld"><label for="co-pf">Formule</label><select id="co-pf"><option value="">Séance libre</option>${of.map(o => `<option value="${o.v}">${esc(o.l)}</option>`).join('')}</select></div>${Dt('co-pd', 'Date', false, TODAY)}<p class="muted small" id="co-plib">${esc(pgLibres(TODAY))}</p>${Sel('co-ph', 'Heure', HOURS, '18 h')}${Sel('co-pdu', 'Durée', ['45 min', '1 h', '1 h 15', '1 h 30', '2 h'], '1 h')}${Sel('co-ps', 'Sport', ['Padel', 'Tennis'], fiche.sport || 'Padel')}${Sel('co-pl', 'Lieu', ['En salle', 'Extérieur'], 'En salle')}${cl.length > 1 ? `<div class="fld"><label for="co-pc">Club</label><select id="co-pc">${cl.map(c => `<option value="${c.id}" ${c.id === cur ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>` : ''}<div class="fld"><label for="co-pt">Thème ou objectif (facultatif)</label><input id="co-pt" autocomplete="off" placeholder="Ex. Travailler la bandeja"></div><div class="fld"><label for="co-pa">Décompter de l’achat</label><select id="co-pa"><option value="">Aucun, à payer à l’unité</option>${dispos.map(a => `<option value="${a.id}" ${a.id === sel0 ? 'selected' : ''}>${esc(a.libelle)}</option>`).join('')}</select></div><div class="fld" id="co-ppw">${O('co-pp', 'Prix de la séance en euros (à l’unité)', '35')}</div><p class="muted small" id="co-pnote"></p><div class="fld" id="co-pfw" hidden><label class="chk" for="co-pfait"><input type="checkbox" id="co-pfait" checked>Séance déjà faite : noter l’élève présent</label><p class="muted small">La séance est alors décomptée de l’achat choisi, comme une séance terminée.</p></div><button class="btn full">${ic('cal')}Programmer la séance</button></form>`
    );
    $('co-pp').inputMode = 'decimal';
    u2ProgMaj();
  };
  /* le panneau suit la formule, la date et l'achat choisis */
  function u2ProgMaj(quoi) {
    const f = $('co-pf');
    if (!f) return;
    const k = $('u2-prog').dataset.id,
      o = pgOffres().find(x => x.v === f.value),
      a = $('co-pa'),
      dispos = pgDispos(k);
    if (quoi === 'formule' && o) {
      if (o.dur) {
        const t = minTxt(o.dur),
          s = $('co-pdu');
        if (![...s.options].some(x => x.value === t)) s.add(new Option(t, t));
        s.value = t;
      }
      if (o.sport) $('co-ps').value = o.sport;
      if (o.prix != null && !o.abo) $('co-pp').value = String(o.prix).replace('.', ',');
    }
    // « Attribuer … » : un pack ou un abonnement choisi dans la formule, que l'élève n'a pas encore en cours
    const choisi = a.value; // le choix de l'achat survit au recalcul (changer la date ne doit pas le défaire)
    [...a.options].filter(x => x.dataset.nouveau).forEach(x => x.remove());
    if (
      o &&
      (o.pack || o.abo) &&
      !dispos.some(
        x =>
          x.t === (o.pack ? 'pack' : 'abo') && (coPacks(k).find(y => y.id === x.id) || {}).ref === (o.pack || o.abo).id
      )
    ) {
      const n = new Option(
        'Attribuer « ' + (o.pack ? o.pack.nom || 'Pack ' + o.pack.seances + ' séances' : o.abo.nom) + ' » et décompter',
        'new:' + o.v
      );
      n.dataset.nouveau = '1';
      a.add(n);
      if (quoi === 'formule' && !dispos.length) a.value = n.value;
      else if (choisi === n.value) a.value = choisi;
    }
    const couvert = !!a.value;
    $('co-ppw').hidden = couvert;
    $('co-pnote').textContent = couvert ? 'Séance couverte par l’achat : pas de paiement à l’unité.' : '';
    if (quoi === 'date') $('co-plib').textContent = pgLibres($('co-pd').value);
    // une date passée (ou l'heure du jour déjà passée) : proposer de noter l'élève présent tout de suite
    const p = u2ProgPassee();
    $('co-pfw').hidden = !p;
    if (p && (quoi === 'date' || quoi === 'heure') && !$('co-pfw').dataset.vu) $('co-pfait').checked = true;
    if (p) $('co-pfw').dataset.vu = '1';
    else delete $('co-pfw').dataset.vu;
  }
  /* la séance choisie est-elle déjà passée ? (date avant aujourd'hui, ou aujourd'hui à une heure déjà écoulée) */
  function u2ProgPassee() {
    const d = $('co-pd') ? $('co-pd').value : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    if (d !== TODAY) return d < TODAY;
    const m = /^(\d{1,2})\s*h\s*(\d{2})?/.exec($('co-ph') ? $('co-ph').value : ''),
      n = new Date();
    return !!m && +m[1] * 60 + (+m[2] || 0) < n.getHours() * 60 + n.getMinutes();
  }
  document.addEventListener('change', e => {
    if (!$('u2-prog')) return;
    if (e.target.id === 'co-pf') u2ProgMaj('formule');
    else if (e.target.id === 'co-pd') u2ProgMaj('date');
    else if (e.target.id === 'co-pa') u2ProgMaj('achat');
    else if (e.target.id === 'co-ph') u2ProgMaj('heure');
  });
  /* séance passée : l'élève est noté présent (appel recopié dans le groupe, comme un appel fait en direct) */
  function u2ProgFait(g, d, k) {
    const s = sesGet(g.id + '.' + d);
    s.pres = Object.assign({}, s.pres, { [k]: 'P' });
    s.gnom = g.name;
    s.gh = g.h || '';
    s.gdur = g.dur || '';
    coAtt(s, k, 'P');
  }
  document.addEventListener('submit', e => {
    if (e.target.id !== 'u2-prog') return;
    e.preventDefault();
    const v = x => ($(x) ? $(x).value.trim() : ''),
      k = e.target.dataset.id,
      d = v('co-pd');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return toast('Choisis la date de la séance');
    const cid = v('co-pc') || coMainId(),
      ext = CO_EXT[cid] ? cid : null,
      fiche = coElGet(k),
      choix = v('co-pa');
    const fait = u2ProgPassee() && !!($('co-pfait') && $('co-pfait').checked);
    let achat = null;
    if (choix.startsWith('new:')) {
      // l'élève n'a pas d'achat : on lui attribue le pack ou l'abonnement choisi (à régler), puis la séance
      const o = pgOffres().find(x => x.v === choix.slice(4)),
        p = o && (o.pack || o.abo);
      if (!p) return;
      const a = {
        id: 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
        t: o.pack ? 'pack' : 'abo',
        ref: p.id,
        d: TODAY,
        nom: o.pack ? p.nom || 'Pack ' + p.seances + ' séances' : p.nom,
        prix: p.prix || 0
      };
      if (o.pack) a.n = p.seances;
      else {
        const mois = ({ mois: 1, trimestre: 3, '6 mois': 6, an: 12 }[p.periode] || 1) * (p.duree || 1),
          [y, m, j] = TODAY.split('-').map(Number);
        a.fin = new Date(Date.UTC(y, m - 1 + mois, j - 1)).toISOString().slice(0, 10);
      }
      a.pay = { ech: [{ s: 0, m: a.prix, ok: '' }] };
      fiche.achats = (fiche.achats || []).concat(a);
      achat = { id: a.id, t: a.t, cycle: '' };
    } else if (choix) achat = pgDispos(k).find(x => x.id === choix) || null;
    if (achat && achat.cycle) {
      // achat d'un cycle de groupe : la date rejoint ce cycle
      const [gid, cid2] = achat.cycle.split(':'),
        g = grp(gid),
        c = g && (g.cycles || []).find(x => x.id === cid2);
      if (g && c) {
        coCycleSet(g, c, (c.dates || []).concat(d));
        g.hr = Object.assign({}, g.hr, { [d]: v('co-ph') });
        if (fait) u2ProgFait(g, d, k);
        closeSheet();
        return coSave('Séance ajoutée au cycle le ' + fmtD(d) + (fait ? ' · élève noté présent' : ''));
      }
    }
    const g = REGLES.seanceElevePlan({
      date: d,
      h: v('co-ph'),
      dur: v('co-pdu'),
      sport: v('co-ps'),
      lieu: v('co-pl'),
      coach: coKeyIn(ext),
      mem: M[k] ? [k] : [],
      ext: M[k] ? [] : [k],
      theme: v('co-pt'),
      prix: parseFloat(v('co-pp').replace(',', '.')) || 0,
      achat
    });
    g.id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    if (ext) g._club = ext;
    GROUPS.push(g);
    if (fait) u2ProgFait(g, d, k);
    closeSheet();
    coSave(
      'Séance programmée le ' +
        fmtD(d) +
        (fait ? ' · élève noté présent' : '') +
        (achat ? ' · décomptée de l’achat' : '')
    );
  });

  /* ---------- Supprimer une séance de l'historique : glissement vers la gauche (téléphone), survol et clavier (ordinateur) ----------
     Même règle que le connecteur (coach_supprimer_seance) : sans élève, la séance disparaît pour tous ; depuis la fiche d'UN élève, seul cet
     élève est retiré d'une séance de groupe ou à plusieurs. Les achats ne changent pas : le décompte suit les séances faites, donc le pack est
     recrédité. Filet de sécurité : un bandeau « Annuler » pendant quelques secondes. */
  const u2Copie = o => JSON.parse(JSON.stringify(o));
  function u2SesRetire(gid, d, k) {
    const g = grp(gid);
    if (!g) {
      // séance orpheline (groupe disparu) : elle ne dépend que d'elle-même ; avec un élève, seule sa présence part s'il y en a d'autres
      const rec = SEANCES.find(x => x.id === gid + '.' + d);
      if (!rec) return null;
      const avantRec = u2Copie(rec);
      if (k && Object.keys(rec.pres || {}).some(e => e !== k)) delete rec.pres[k];
      else SEANCES.splice(SEANCES.indexOf(rec), 1);
      return () => {
        const i = SEANCES.findIndex(x => x.id === avantRec.id);
        if (i >= 0) SEANCES.splice(i, 1, avantRec);
        else SEANCES.push(avantRec);
      };
    }
    const sid = gid + '.' + d,
      meme = s => s.id === sid && (s._club || '') === (g._club || ''),
      sRec = SEANCES.find(meme),
      tous = (g.mem || []).concat(g.ext || []),
      avant = {
        g: u2Copie(g),
        s: sRec ? u2Copie(sRec) : null,
        tout: g.once ? SEANCES.filter(x => x.g === gid && (x._club || '') === (g._club || '')).map(u2Copie) : []
      },
      partiel = !!k && !(g.once && tous.length <= 1);
    if (!partiel) {
      if (g.once) {
        GROUPS.splice(GROUPS.indexOf(g), 1);
        for (let i = SEANCES.length - 1; i >= 0; i--)
          if (SEANCES[i].g === gid && (SEANCES[i]._club || '') === (g._club || '')) SEANCES.splice(i, 1);
      } else {
        (g.cycles || []).forEach(c => (c.dates = (c.dates || []).filter(x => x !== d)));
        g.extra = (g.extra || []).filter(x => x !== d);
        g.cancel = (g.cancel || []).filter(x => x !== d);
        if (typeof trainOn === 'function' && trainOn(g, d)) g.skip = (g.skip || []).concat(d);
        if (sRec) SEANCES.splice(SEANCES.indexOf(sRec), 1);
      }
    } else if (g.once) {
      g.mem = (g.mem || []).filter(x => x !== k);
      g.ext = (g.ext || []).filter(x => x !== k);
      if (sRec && sRec.pres) delete sRec.pres[k];
    } else {
      const s = sesGet(sid);
      if (s.pres) delete s.pres[k];
      s.plus = (s.plus || []).filter(x => x !== k);
      if (!s.plus.length) delete s.plus;
      if (tous.includes(k)) s.out = [...new Set((s.out || []).concat(k))];
    }
    return () => {
      // annuler : le groupe et les séances reprennent leur état d'avant
      const actuel = GROUPS.find(x => x.id === gid && (x._club || '') === (g._club || ''));
      if (actuel) {
        Object.keys(actuel).forEach(c => delete actuel[c]);
        Object.assign(actuel, u2Copie(avant.g));
      } else GROUPS.push(u2Copie(avant.g));
      const remet = rec => {
        const i = SEANCES.findIndex(x => x.id === rec.id && (x._club || '') === (rec._club || ''));
        if (i >= 0) SEANCES.splice(i, 1, u2Copie(rec));
        else SEANCES.push(u2Copie(rec));
      };
      if (avant.s) remet(avant.s);
      else {
        const i = SEANCES.findIndex(meme);
        if (i >= 0) SEANCES.splice(i, 1);
      }
      avant.tout.forEach(remet);
    };
  }
  let u2Rappel = null;
  function u2Banniere(msg, restaure) {
    if (u2Rappel) clearTimeout(u2Rappel.t);
    const ancien = $('u2undo');
    if (ancien) ancien.remove();
    const b = document.createElement('div');
    b.id = 'u2undo';
    b.className = 'u2undo';
    b.setAttribute('role', 'status');
    b.innerHTML = `<span>${esc(msg)}</span><button type="button" data-a="u2Annule">Annuler</button>`;
    $('phone').appendChild(b);
    u2Rappel = {
      restaure,
      t: setTimeout(() => {
        b.remove();
        u2Rappel = null;
      }, 7000)
    };
  }
  A.u2Annule = () => {
    if (!u2Rappel) return;
    clearTimeout(u2Rappel.t);
    u2Rappel.restaure();
    u2Rappel = null;
    const b = $('u2undo');
    if (b) b.remove();
    coSave('Séance rétablie');
  };
  A.u2SesDel = d => {
    const restaure = u2SesRetire(d.g, d.d, d.k || '');
    if (!restaure) return;
    // on était sur la page de cette séance : retour à la page d'avant
    const haut = S.stack[S.stack.length - 1];
    if (haut && haut.v === 'seance' && haut.id === d.g + '.' + d.d) S.stack.pop();
    coSave();
    u2Banniere(d.k ? 'Séance retirée de la fiche' : 'Séance supprimée', restaure);
  };
  /* le glissement : seuil d'angle (plus horizontal que vertical) et de distance, un seul élément ouvert à la fois, le défilement vertical reste libre */
  (function () {
    const L = 88;
    let st = null,
      ouvert = null,
      vu = 0;
    const ferme = w => {
      if (!w) return;
      w.classList.remove('open');
      const c = w.querySelector('.u2hs');
      if (c) c.style.transform = '';
    };
    document.addEventListener(
      'touchstart',
      e => {
        const w = e.target.closest && e.target.closest('.u2sw');
        if (ouvert && w !== ouvert && !(e.target.closest && e.target.closest('.u2swd'))) {
          ferme(ouvert);
          ouvert = null;
        }
        if (!w || e.touches.length !== 1 || e.target.closest('.u2swd')) return (st = null);
        const t = e.touches[0];
        st = { w, x: t.clientX, y: t.clientY, dx: 0, lock: false, base: w.classList.contains('open') ? -L : 0 };
      },
      { passive: true }
    );
    document.addEventListener(
      'touchmove',
      e => {
        if (!st) return;
        const t = e.touches[0],
          dx = t.clientX - st.x,
          dy = t.clientY - st.y;
        if (!st.lock) {
          if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx) * 0.6) return (st = null); // défilement vertical : on laisse faire
          if (Math.abs(dx) > 10 && Math.abs(dx) > 1.6 * Math.abs(dy)) st.lock = true;
          else return;
        }
        if (e.cancelable) e.preventDefault();
        st.dx = dx;
        const c = st.w.querySelector('.u2hs');
        c.style.transition = 'none';
        c.style.transform = 'translateX(' + Math.max(-st.w.offsetWidth, Math.min(0, st.base + dx)) + 'px)';
      },
      { passive: false }
    );
    document.addEventListener('touchend', () => {
      if (!st || !st.lock) return (st = null);
      const w = st.w,
        c = w.querySelector('.u2hs'),
        total = st.base + st.dx;
      c.style.transition = '';
      c.style.transform = '';
      vu = Date.now();
      if (-total > w.offsetWidth * 0.6) {
        w.classList.remove('open');
        ouvert = null;
        vu = 0;
        w.querySelector('.u2swd').click(); // glissement long et complet : suppression directe
        vu = Date.now();
      } else if (-total > L / 2) {
        if (ouvert && ouvert !== w) ferme(ouvert);
        w.classList.add('open');
        ouvert = w;
      } else {
        ferme(w);
        if (ouvert === w) ouvert = null;
      }
      st = null;
    });
    // un toucher sur une carte ouverte la referme (il n'ouvre pas la séance) ; juste après un glissement, aucun clic ne passe
    document.addEventListener(
      'click',
      e => {
        const carte = e.target.closest && e.target.closest('.u2sw > .u2hs');
        if (Date.now() - vu < 350 || (carte && carte.parentNode.classList.contains('open'))) {
          e.preventDefault();
          e.stopPropagation();
          if (carte) {
            ferme(carte.parentNode);
            if (ouvert === carte.parentNode) ouvert = null;
          }
        }
      },
      true
    );
    // clavier : Suppr ou Retour arrière sur une carte la supprime
    document.addEventListener('keydown', e => {
      const carte = e.target.closest && e.target.closest('.u2sw > .u2hs');
      if (carte && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        carte.parentNode.querySelector('.u2swd').click();
      }
    });
  })();
}
