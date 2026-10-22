/* /RAM Club — ui/7-ecole.js : École : séances, présences, premiers pas du bureau, compte en attente.
   Morceau de l'ancien ui.js : les fichiers ui/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
/* ---------- école : séances datées, lieu, présences ---------- */
function sessions(g, days) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const iso = isoIn(i),
      [y, m, d] = iso.split('-').map(Number);
    if (new Date(y, m - 1, d).getDay() === g.day) out.push(iso);
  }
  return out;
}
const locOf = (g, iso) => (g.loc || {})[iso] || g.defLoc || 'Extérieur';
const respOf = (g, iso, id) => ((g.resp || {})[iso] || {})[id] || (((g.abs || {})[iso] || []).includes(id) ? 'no' : '');
function sessCard(g, iso, who, manage) {
  const cx = (g.cancel || []).includes(iso),
    loc = locOf(g, iso),
    [y, m, d] = iso.split('-').map(Number),
    r = who ? respOf(g, iso, who) : '',
    nOk = g.mem.filter(p => respOf(g, iso, p) === 'ok').length,
    nNo = g.mem.filter(p => respOf(g, iso, p) === 'no').length;
  return (
    `<div class="card"><div class="row" style="align-items:flex-start;gap:12px"><span class="dblk"><b>${d}</b>${MO[m - 1]}</span><div class="grow"><span class="h3" style="font-size:19px">${g.name}</span><br><span class="muted small">${DA[new Date(y, m - 1, d).getDay()]} · ${g.h} · ${g.dur}${g.coach ? ' · ' + first(g.coach) : ''}</span><div class="tags" style="display:flex;margin-top:6px">${cx ? '<span class="tag" style="background:var(--hot);color:#fff">Cours annulé</span>' : `<span class="tag loc">${ic(loc === 'En salle' ? 'home' : 'sun')}${loc}</span>`}${sportTag(g.sport)}${who && who !== ME() ? `<span class="tag">${first(who)}</span>` : ''}</div></div></div>` +
    (cx || !who
      ? ''
      : `<div class="ctl"><button class="btn sm grow ${r === 'ok' ? '' : 'ghost'}" data-a="cresp" data-g="${g.id}" data-d="${iso}" data-u="${who}" data-s="ok">${who === ME() ? 'Je serai présent' : first(who) + ' sera présent'}</button><button class="btn sm grow ${r === 'no' ? 'hot' : 'ghost'}" data-a="cresp" data-g="${g.id}" data-d="${iso}" data-u="${who}" data-s="no">Absent</button></div>`) +
    (manage
      ? `<span class="muted small">${nOk} présent${nOk > 1 ? 's' : ''} annoncé${nOk > 1 ? 's' : ''} · ${nNo} absent${nNo > 1 ? 's' : ''} · ${g.mem.length} élève${g.mem.length > 1 ? 's' : ''}</span><div class="ctl" style="flex-wrap:wrap">${cx ? '' : `<button class="btn sm grow ghost" data-a="loc" data-g="${g.id}" data-d="${iso}">${loc === 'En salle' ? 'Passer en extérieur' : 'Passer en salle'}</button>`}<button class="btn sm grow ${cx ? '' : 'ghost'}" data-a="cancelCourse" data-id="${g.id}" data-d="${iso}">${cx ? 'Rétablir le cours' : 'Annuler'}</button><button class="btn sm grow" data-a="open" data-v="grp" data-id="${g.id}">Appel</button></div>`
      : '') +
    `</div>`
  );
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
/* Contenu de l'ancien onglet École, affiché par les filtres de l'Agenda */
function ecoleBody(t) {
  const me = ME(),
    staff = isAdmin(),
    coach = S.role === 'coach';
  let b = '';
  if (t === 'manage' && !staff) t = 'mine';
  if (t === 'mine') {
    const whos = [me].concat(M[me].kids || []),
      items = [];
    GROUPS.filter(g => g.type === 'train').forEach(g => {
      whos.forEach(w => {
        if (g.mem.includes(w)) sessions(g, 21).forEach(iso => items.push({ g, iso, w }));
      });
      if (g.coach === me) sessions(g, 21).forEach(iso => items.push({ g, iso, w: null, c: 1 }));
    });
    items.sort((a, b) => a.iso.localeCompare(b.iso) || hMin(a.g.h) - hMin(b.g.h));
    b = items.length
      ? `<p class="muted small">Tes cours des trois prochaines semaines. Indique ta présence : l'enseignant prépare la séance en conséquence, et tu es notifié si le lieu change ou si le cours est annulé.</p>` +
        items.map(x => sessCard(x.g, x.iso, x.w, x.c)).join('')
      : empty(
          'school',
          'Aucun cours',
          "Tu n'es inscrit à aucun groupe d'entraînement. Les formules sont dans Club, Le club."
        );
  }
  if (t === 'stages') {
    const st = posts.filter(p => p.stage && !p.arch);
    b =
      (st.length
        ? st
            .map(
              p =>
                `<div class="card"><span class="h3">${p.title}</span><p class="muted small">${p.body}</p>${evBox(p)}</div>`
            )
            .join('')
        : empty('ball', 'Aucun stage prévu', '')) +
      (staff ? `<button class="btn full ghost" data-a="newPost" data-k="stage">Créer un stage</button>` : '');
  }
  if (t === 'manage') {
    const gs = GROUPS.filter(g => g.type === 'train' && (coach ? g.coach === me : true));
    b =
      `${coach ? `<div class="ctl"><button class="btn grow" data-a="newPost" data-k="train">Créer un groupe</button><button class="btn grow ghost" data-a="newPost" data-k="stage">Créer un stage</button></div>` : '<div class="note">Les groupes d\'entraînement sont créés par les enseignants.</div>'}<span class="kicker">Planning des cours · 2 semaines</span>` +
      (gs
        .flatMap(g => sessions(g, 14).map(iso => ({ g, iso })))
        .sort((a, b) => a.iso.localeCompare(b.iso) || hMin(a.g.h) - hMin(b.g.h))
        .map(x => sessCard(x.g, x.iso, null, 1))
        .join('') || empty('cal', 'Aucun cours', '')) +
      `<span class="kicker">Groupes</span>` +
      gs
        .map(
          g =>
            `<button class="item" data-a="open" data-v="grp" data-id="${g.id}"><span class="tile">${ic('users')}</span><span class="grow"><span class="nm">${g.name}</span><br><span class="muted small">${g.mem.length} élève${g.mem.length > 1 ? 's' : ''} · ${g.sub} · ${g.defLoc || 'Extérieur'}</span></span></button>`
        )
        .join('');
  }
  return b;
}
