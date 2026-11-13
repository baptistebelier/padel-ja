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
        )}</div><p class="kicker">Aussi</p><div class="menu"><button data-a="coNewMsg">${ic('chat')}Écrire un message</button><button data-a="coContentPick">${ic('spark')}Donner du contenu</button><button data-a="coShortMore">${ic('more')}Autres outils</button></div></div>`
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
  };
}
