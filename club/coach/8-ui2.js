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
  function u2Prochaine() {
    const nm = new Date().getHours() * 60 + new Date().getMinutes(),
      l = coSessions(TODAY, isoIn(7), 'me', 1),
      next = l.find(x => !isCx(x.g, x.d) && (x.d > TODAY || hMin(hAt(x.g, x.d)) + durMin(durAt(x.g, x.d)) > nm));
    let h = '';
    if (next) {
      const { g, d } = next,
        st = coStu(g),
        quand = d === TODAY ? 'Aujourd’hui' : d === isoIn(1) ? 'Demain' : fmtD(d),
        theme = (sesDu(g, d) || {}).theme || (REGLES.cycleDe(g, d) || {}).theme;
      h += `<div class="card u2c u2next"><div class="calh">${ic('clock')}<b>${quand} · ${esc(hAt(g, d))} · ${esc(durAt(g, d))}</b></div><span class="h3">${esc(g.name)}</span>${theme ? `<p class="muted small">Thème : ${esc(theme)}</p>` : ''}${st.length ? `<div class="u2avs">${st.map(k => coAv(k, 'sm')).join('')}<span class="muted small">${plural(st.length, 'élève')}</span></div>` : ''}<div class="ecacts"><button class="btn" data-a="open" data-v="seance" data-id="${sesKey(g, d)}">${ic('check')}Faire l’appel</button><button class="btn ghost" data-a="coNewGrpMsg">${ic('chat')}Écrire au groupe</button></div></div>`;
    } else h += `<div class="card">${none('cal', 'Aucun cours dans les 7 jours', '')}</div>`;
    // la semaine : une ligne par cours, un clic ouvre la séance
    const rest = l.filter(x => x !== next);
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
    let h = u2ElevesE();
    // l'entrée « À encaisser » après « Sans compte »
    h = h.replace(
      /(<div class="seg[^"]*" role="tablist">[\s\S]*?aria-label="Sans compte"[\s\S]*?<\/button>)/,
      '$1' + it
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
  const u2OpenE = A.open;
  A.open = d => (d && d.v === 'eleve' ? coOpenBase(d) : u2OpenE(d));
  const u2ElevesL = V.eleves;
  V.eleves = () => {
    let h = u2ElevesL();
    if (S.elF === 'pay' || !coWide()) return h;
    // plus d'aperçu à droite : la liste prend la largeur, un clic ouvre la fiche
    const [aside] = coCut(h, '<aside class="cobs">', 'aside');
    if (aside) h = h.replace(aside, '').replace('<div class="cobento">', '<div class="cobento u2one">');
    return h.replace(/ aria-current="true"/, '');
  };
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
}
