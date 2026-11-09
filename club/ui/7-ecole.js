/* /RAM Club — ui/7-ecole.js : École : séances, présences, premiers pas du bureau, compte en attente.
   Morceau de l'ancien ui.js : les fichiers ui/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
/* ---------- école : séances datées, lieu, présences ---------- */
function sessions(g, days) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const iso = isoIn(i),
      [y, m, d] = iso.split('-').map(Number);
    if (trainOn(g, iso)) out.push(iso);
  }
  return out;
}
/* élèves d'un groupe : adhérents de l'appli et élèves sans compte /RAM Club (ajoutés dans /RAM Coach) */
const grpN = g => g.mem.length + (g.ext || []).length;
const grpFull = g => !!g.max && grpN(g) >= g.max;
/* un vrai groupe, en cours : ni une séance ponctuelle (cours individuel), ni un cycle terminé */
const grpLive = g => g.type === 'train' && !g.once && !(g.to && (g.to < TODAY || g.fini));
// lieu d'une séance : en salle par défaut ; « Extérieur » pour la saison (interrupteur du groupe) ou ce jour-là
const locOf = (g, iso) => (g.loc || {})[iso] || g.defLoc || 'En salle';
const respOf = (g, iso, id) => ((g.resp || {})[iso] || {})[id] || (((g.abs || {})[iso] || []).includes(id) ? 'no' : '');
function sessCard(g, iso, who, manage) {
  const cx = (g.cancel || []).includes(iso),
    loc = locOf(g, iso),
    r = who ? respOf(g, iso, who) : '',
    nOk = g.mem.filter(p => respOf(g, iso, p) === 'ok').length,
    nNo = g.mem.filter(p => respOf(g, iso, p) === 'no').length;
  return evCard({
    cat: 'ens',
    t: g.h,
    cx,
    title: g.name,
    lines: [coachDu(g, iso) && M[coachDu(g, iso)] && ['user', first(coachDu(g, iso))], ['clock', g.dur]],
    tags:
      (cx ? evCx('Cours annulé') : evLoc(loc)) +
      sportTag(g.sport) +
      (who && who !== ME() ? evTag(first(who)) : '') +
      (manage || !who
        ? evTag(`${grpN(g)} élève${grpN(g) > 1 ? 's' : ''}${g.max ? ' / ' + g.max : ''}`) +
          (grpFull(g) ? '<span class="tag" style="background:var(--accent);color:var(--on-accent)">Complet</span>' : '')
        : ''),
    fixe: true,
    foot:
      (cx || !who
        ? ''
        : `<div class="ctl"><button class="btn sm grow ${r === 'ok' ? '' : 'ghost'}" data-a="cresp" data-g="${g.id}" data-d="${iso}" data-u="${who}" data-s="ok">${ic('check')}${who === ME() ? 'Je serai présent' : first(who) + ' sera présent'}</button><button class="btn sm grow ${r === 'no' ? 'hot' : 'ghost'}" data-a="cresp" data-g="${g.id}" data-d="${iso}" data-u="${who}" data-s="no">${ic('x')}Absent</button></div>`) +
      (manage
        ? `<span class="muted small">${nOk} présent${nOk > 1 ? 's' : ''} annoncé${nOk > 1 ? 's' : ''} · ${nNo} absent${nNo > 1 ? 's' : ''} · ${grpN(g)} élève${grpN(g) > 1 ? 's' : ''}${g.ext && g.ext.length ? ' dont ' + g.ext.length + ' sans compte' : ''}</span><div class="ecacts"><button class="ecact go" data-a="open" data-v="grp" data-id="${g.id}">${ic('check')}Appel</button>${cx ? '' : `<button class="ecact" data-a="loc" data-g="${g.id}" data-d="${iso}">${ic(loc === 'En salle' ? 'sun' : 'home')}${loc === 'En salle' ? 'Passer en extérieur' : 'Passer en salle'}</button>`}<button class="ecact warn" data-a="cancelCourse" data-id="${g.id}" data-d="${iso}">${ic(cx ? 'undo' : 'ban')}${cx ? 'Rétablir le cours' : 'Annuler le cours'}</button><button class="ecact del" data-a="delCourse" data-id="${g.id}" data-d="${iso}">${ic('trash')}Supprimer</button></div>`
        : '')
  });
}
/* « Premiers pas » du bureau : 5 étapes cochées toutes seules, chacune ouvre son écran ; disparaît quand tout est fait */
function setupCard() {
  if (!isBureau()) return '';
  const st = S.setup || {},
    steps = [
      ['Identité du club', 'Nom, logo et couleurs', !!st.look || !!club().logo, 'data-a="look"'],
      ['Infos et tarifs', 'Courts, contacts, formules et prix', !!st.info, 'data-a="clubInfo"'],
      [
        'Championnats et équipes',
        'Engager les équipes de la saison',
        CHAMPS.length > 0 && GROUPS.some(g => g.type === 'team'),
        'data-a="setupGo" data-k="champ"'
      ],
      [
        "Groupes d'entraînement",
        "Créés par les enseignants, visibles dans l'Agenda",
        GROUPS.some(g => g.type === 'train'),
        'data-a="setupGo" data-k="train"'
      ],
      [
        'Adhérents invités',
        'Code du club, lien ou import de liste',
        (S.invited || 0) > 0 || !!st.inv,
        'data-a="open" data-v="join"'
      ]
    ],
    n = steps.filter(s => s[2]).length;
  if (n === steps.length) return '';
  return `<div class="card setup"><span class="kicker">Premiers pas · ${n} sur ${steps.length}</span><span class="bar"><i style="width:${(n * 100) / steps.length}%"></i></span>${steps.map(s => `<button class="item" ${s[3]}><span class="chk ${s[2] ? 'on' : ''}" aria-hidden="true">${s[2] ? ic('check') : ''}</span><span class="grow"><span class="nm">${s[0]}</span><br><span class="muted small">${s[1]}</span></span><span class="sr">${s[2] ? 'fait' : 'à faire'}</span></button>`).join('')}</div>`;
}
/* ---------- compte en attente de validation pour la saison ---------- */
const lockOk = v =>
  v.v === 'me' ||
  v.v === 'legal' ||
  ((v.v === 'member' || v.v === 'trophies') && (!v.id || v.id === ME())) ||
  (v.v === 'troph' && (v.id || '').split('|')[0] === ME());
function lockCard() {
  const me = ME(),
    req = JOINREQ.some(j => j.id === me),
    back = !!VALID[me];
  return `<div class="card lockc"><span class="kicker">Accès en attente · saison ${S.season}</span>${req ? `<p>${back ? "Ta demande de reprise d'adhésion" : "Ta demande d'inscription"} a bien été envoyée. Le bureau du club doit la valider : tu seras prévenu dès que c'est fait.</p>` : `<p>Ton adhésion de la saison ${VALID[me]} est terminée. Si tu as repris ta licence au club, préviens le bureau pour retrouver l'accès.</p><button class="btn full" data-a="readh">J'ai repris mon adhésion</button>`}</div>`;
}
function lockView(v) {
  const home = !v.id && v.v === 'home';
  return `<div class="pad"><div class="lockv"><span class="tile big">${ic('shield')}</span><h2 class="h3">${home ? 'Bienvenue au club' : 'Page pas encore accessible'}</h2><p>${home ? `Vous devez attendre que le club valide votre accès au club pour la saison sportive ${S.season}.` : `Ton compte doit être activé pour la saison sportive ${S.season} pour accéder à cette page. En attendant, tu as accès à ton profil.`}</p></div>${lockCard()}<button class="btn full ghost" data-a="tab" data-t="me">Voir mon profil</button></div>`;
}
/* le cycle d'un groupe : un segment par séance, comme une suite de stories. Faites : couleur d'accent ; aujourd'hui :
   orange ; à venir : discrètes ; annulées : barrées. Une séance reportée suit sa nouvelle date. Un groupe sans fin de
   cycle montre ses 8 dernières séances et les 8 suivantes. Commun au Club et au Coach. */
/* la jauge d'un vrai cycle : ses séances, et elles seules */
const cycleSes = g => d =>
  typeof SEANCES === 'undefined'
    ? null
    : SEANCES.find(s => s.id === g.id + '.' + d && (s._club || '') === (g._club || ''));
function cycleBarDe(g, c, plus) {
  const E = REGLES.cycleEtat(g, c, cycleSes(g), TODAY),
    lab = { done: 'Faite', vide: 'À vérifier : pas d’appel', now: "Aujourd'hui", next: 'À venir', cx: 'Annulée' },
    leg = { done: 'Faites', vide: 'À vérifier', now: "Aujourd'hui", next: 'À venir', cx: 'Annulées' };
  return `<div class="cocycle"><div class="cocyct"><b>${E.faites} sur ${E.prevues}</b><span class="muted small">séances faites${plus || ''}</span></div><div class="cocycb" role="img" aria-label="${E.faites} séances faites sur ${E.prevues}, ${E.aVenir} à venir${E.sansDate ? ', ' + E.sansDate + ' sans date' : ''}">${E.seances.map(x => `<i class="${x.etat}" title="${x.num ? 'Séance ' + x.num + ' · ' : ''}${fmtD(x.d)} · ${lab[x.etat]}"></i>`).join('')}${'<i class="pose" title="Date à poser"></i>'.repeat(E.sansDate)}</div><div class="cocycl">${[
    'done',
    'vide',
    'now',
    'next',
    'cx'
  ]
    .filter(k => E.seances.some(x => x.etat === k))
    .map(k => `<span><i class="${k}"></i>${leg[k]}</span>`)
    .join('')}${E.sansDate ? '<span><i class="pose"></i>Date à poser</span>' : ''}</div></div>`;
}
function cycleBar(g, plus) {
  const cur = REGLES.cycleCourant(g, TODAY);
  if (cur) return cycleBarDe(g, cur, plus);
  const all = [],
    end = g.to || isoIn(180);
  for (let d = g.from || isoIn(-365); d <= end; d = isoIn(1, d)) if (trainOn(g, d)) all.push(d);
  const l = g.to
    ? all
    : all
        .filter(d => d < TODAY)
        .slice(-8)
        .concat(all.filter(d => d >= TODAY).slice(0, 9));
  if (!l.length) return '';
  const st = d => ((g.cancel || []).includes(d) ? 'cx' : d === TODAY ? 'now' : d < TODAY ? 'done' : 'next'),
    n = k => all.filter(d => st(d) === k).length,
    lab = { done: 'Faite', now: "Aujourd'hui", next: 'À venir', cx: 'Annulée' },
    leg = { done: 'Faites', now: "Aujourd'hui", next: 'À venir', cx: 'Annulées' },
    faites = n('done') + n('now'),
    total = all.length - n('cx');
  return `<div class="cocycle"><div class="cocyct"><b>${g.to ? faites + ' sur ' + total : faites}</b><span class="muted small">${faites > 1 || g.to ? 'séances faites' : 'séance faite'}${plus || ''}</span></div><div class="cocycb" role="img" aria-label="${faites} séances faites, ${n('next')} à venir">${l.map(d => `<i class="${st(d)}" title="${fmtD(d)} · ${lab[st(d)]}"></i>`).join('')}</div><div class="cocycl">${[
    'done',
    'now',
    'next',
    'cx'
  ]
    .filter(k => l.some(d => st(d) === k))
    .map(k => `<span><i class="${k}"></i>${leg[k]}</span>`)
    .join('')}</div></div>`;
}
/* Contenu de l'ancien onglet École, affiché par les filtres de l'Agenda */
function ecoleBody(t) {
  const me = ME(),
    staff = isAdmin(),
    coach = S.role === 'coach' || !!S.super;
  let b = '';
  if (t === 'manage' && !staff) t = 'mine';
  if (t === 'mine') {
    const whos = [me].concat(M[me].kids || []),
      items = [];
    GROUPS.filter(g => g.type === 'train').forEach(g => {
      whos.forEach(w => {
        if (g.mem.includes(w)) sessions(g, 21).forEach(iso => items.push({ g, iso, w }));
      });
      // les séances que j'enseigne : celles de mes groupes, de mes cycles et celles où je remplace
      sessions(g, 21)
        .filter(iso => coachDu(g, iso) === me)
        .forEach(iso => items.push({ g, iso, w: null, c: 1 }));
    });
    items.sort((a, b) => a.iso.localeCompare(b.iso) || hMin(a.g.h) - hMin(b.g.h));
    b = items.length
      ? `<p class="muted small">Tes cours des trois prochaines semaines. Indique ta présence : l'enseignant prépare la séance en conséquence, et tu es notifié si le lieu change ou si le cours est annulé.</p>` +
        evDays(
          items,
          x => x.iso,
          x => sessCard(x.g, x.iso, x.w, x.c)
        )
      : empty(
          'school',
          'Aucun cours',
          "Tu n'es inscrit à aucun groupe d'entraînement. Les formules sont dans Club, Le club."
        );
  }
  // messages, bilans, analyses vidéo et contenus de l'enseignant (/RAM Coach), historique des séances
  if (t === 'perso') b = (typeof resaMine === 'function' ? resaMine() : '') + persoBody();
  // l'équipe pédagogique : fiche de chaque enseignant (remplie dans /RAM Coach)
  if (t === 'profs') b = profsBody();
  if (t === 'stages') {
    const st = posts.filter(p => p.stage && !p.arch);
    b =
      (st.length
        ? st
            .map(
              p =>
                `<div class="card"><div class="row"><span class="h3 grow">${p.title}</span>${staff ? `<button class="btn sm ghost" data-a="pedit" data-id="${p.id}">${ic('edit')}Modifier</button>` : ''}</div><p class="muted small">${p.body}</p>${evBox(p)}</div>`
            )
            .join('')
        : empty('ball', 'Aucun stage prévu', '')) +
      (staff ? `<button class="btn full ghost" data-a="newPost" data-k="stage">Créer un stage</button>` : '');
  }
  // séances collectives et parties dirigées à venir, pour chacun celles de son niveau
  if (t === 'coll') {
    const prem = p => (p.nv.dates || []).find(d => d >= TODAY),
      l = posts
        .filter(p => p.kind === 'niveaux' && p.nv && canSee(p) && prem(p))
        .sort((x, y) => prem(x).localeCompare(prem(y)));
    b =
      `<div class="feed">${l.map(postHTML).join('')}</div>` +
      (l.length
        ? ''
        : empty(
            'users',
            'Aucun collectif à venir',
            'Les séances collectives et parties dirigées de ton niveau apparaîtront ici.'
          )) +
      (staff
        ? `<div class="ctl"><button class="btn grow" data-a="nvNew" data-m="cours">${ic('school')}Séance collective</button><button class="btn grow ghost" data-a="nvNew" data-m="partie">${ic('users')}Partie dirigée</button></div>`
        : '');
  }
  // Mes groupes : les groupes tout de suite ; les séances sont dans l'Agenda, la création de stage dans Stages
  if (t === 'manage') {
    const gs = GROUPS.filter(g => g.type === 'train' && (coach ? g.coach === me : true)).filter(grpLive);
    b =
      (coach
        ? `<button class="btn full" data-a="newPost" data-k="train">${ic('plus')}Créer un groupe</button>`
        : '<div class="note">Les groupes d\'entraînement sont créés par les enseignants.</div>') +
      gs
        .map(
          g =>
            `<button class="card grpc" data-a="open" data-v="grp" data-id="${g.id}"><span class="h3">${esc(g.name)}</span><br><span class="muted small">${g.coach && M[g.coach] && !String(g.sub || '').includes(first(g.coach)) ? esc(first(g.coach)) + ' · ' : ''}${grpN(g)} élève${grpN(g) > 1 ? 's' : ''}${g.max ? ' sur ' + g.max : ''} · ${g.sub || DAYS[g.day] + ' ' + g.h} · ${g.defLoc || 'En salle'}</span>${cycleBar(g)}</button>`
        )
        .join('') +
      (gs.length
        ? ''
        : empty(
            'users',
            'Aucun groupe en cours',
            'Les cours individuels et les cycles terminés sont dans l’historique de /RAM Coach.'
          ));
  }
  return b;
}
