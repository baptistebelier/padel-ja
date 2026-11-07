/* /RAM Club — app/20-interne.js : tournoi interne du club (créé et géré dans /RAM JA, post.kind 'jaint').
   Pour les adhérents : le tableau en direct, le règlement, les participants (leur fiche du club),
   « mon prochain match » (adversaire, date limite, contact), saisir le résultat quand on a joué,
   confirmer ou contester celui que l'adversaire a saisi. Le serveur /RAM JA vérifie qu'on joue bien le match. */
const INT_TOURS = [
  'Finale',
  'Demi-finales',
  'Quarts de finale',
  'Huitièmes de finale',
  'Seizièmes de finale',
  '32es de finale',
  '64es de finale'
];
const intTour = (r, nb) => INT_TOURS[nb - 1 - r] || 'Tour ' + (r + 1);
const intJoueur = (J, id) => (J.players || []).find(p => p.id === id) || null;
const intNom = (J, id) => (id === 'BYE' ? 'Exempt' : (intJoueur(J, id) || {}).n || '…');
/* les participants qui sont moi ou mes enfants */
const intMoi = J => {
  const keys = [ME()].concat((M[ME()] || {}).kids || []);
  return (J.players || []).filter(p => (p.ks || []).some(k => keys.includes(k)));
};
const intEtat = m => (m.w ? (m.conf ? 'done' : 'pending') : m.a && m.b ? 'ready' : 'wait');
const intMatches = J => (J.rounds || []).flat();
/* mon match en cours : à jouer, à confirmer, ou en attente de mon adversaire */
function intMonMatch(J, pj) {
  const l = intMatches(J).filter(m => !m.bye && (m.a === pj.id || m.b === pj.id));
  return l.find(m => intEtat(m) !== 'done') || null;
}
/* la fiche d'un participant : lien vers le profil du club s'il en a un */
const intLien = (J, id) => {
  const p = intJoueur(J, id);
  if (!p) return esc(intNom(J, id));
  const k = (p.ks || []).find(x => M[x]);
  return k && (p.ks || []).length === 1
    ? `<button class="nm" data-a="member" data-id="${k}">${esc(p.n)}</button>`
    : esc(p.n);
};
const intFin = (J, r) => {
  const f = ((J.tours || [])[r] || {}).fin;
  return f ? f.split('-').reverse().slice(0, 2).join('/') : '';
};
/* la carte « mon match » : qui, quand, et ce que je peux faire */
function intMatchCarte(p, J, pj) {
  const m = intMonMatch(J, pj),
    nb = (J.rounds || []).length,
    kid = (pj.ks || []).find(k => k !== ME() && ((M[ME()] || {}).kids || []).includes(k));
  const pour = kid ? ` (${esc(first(kid))})` : '';
  if (J.status === 'done' || (!m && J.champion === pj.id))
    return J.champion === pj.id
      ? `<div class="int-moi win">${ic('trophy')}<b>Vainqueur du tournoi${pour} !</b></div>`
      : '';
  if (!m)
    return `<div class="int-moi">${ic('check')}<span>Ton parcours est terminé${pour}. Merci d’avoir participé !</span></div>`;
  const adv = m.a === pj.id ? m.b : m.a,
    fin = intFin(J, m.r),
    data = `data-tid="${esc(J.tid)}" data-m="${m.id}"${kid ? ` data-kid="${kid}"` : ''}`;
  if (!adv) {
    const r = m.r,
      av = (J.rounds[r - 1] || [])[2 * m.i + (m.a === pj.id ? 1 : 0)];
    return `<div class="int-moi">${ic('clock')}<span><b>${intTour(r, nb)}${pour}</b><br>Ton adversaire sortira du match ${av ? `${intLien(J, av.a)} contre ${intLien(J, av.b)}` : 'précédent'}.</span></div>`;
  }
  const e = intEtat(m);
  let act = '';
  if (e === 'ready') act = `<button class="btn sm" data-a="intRes" ${data}>Saisir le résultat</button>`;
  else if (e === 'pending' && m.by !== pj.id)
    act = `<p class="small"><b>${esc(intNom(J, m.by))}</b> a saisi : ${m.w === pj.id ? 'ta victoire' : 'sa victoire'}${m.sc ? ' (' + esc(m.sc) + ')' : ''}.</p><div class="ctl"><button class="btn sm grow" data-a="intConf" ${data}>Confirmer</button><button class="btn sm ghost grow" data-a="intContest" ${data}>Contester</button></div>`;
  else if (e === 'pending')
    act = `<p class="muted small">${m.conteste ? 'Résultat contesté : le juge-arbitre va trancher.' : 'Résultat saisi, en attente de la confirmation de ton adversaire.'}</p>`;
  return `<div class="int-moi"><span class="kicker">Mon prochain match${pour} · ${intTour(m.r, nb)}</span><div class="row" style="gap:10px"><span class="grow">Contre <b>${intLien(J, adv)}</b>${fin ? `<br><span class="muted small">À jouer avant le ${fin}</span>` : ''}</span></div>${act}</div>`;
}
/* la publication sur le mur */
function intPost(p) {
  const J = p.ja || {},
    moi = intMoi(J),
    nb = (J.rounds || []).length,
    st = J.status === 'done' ? 'Terminé' : J.status === 'live' ? 'En cours' : 'Inscriptions';
  return `<span class="kicker">Tournoi interne · ${esc(J.sport || '')}</span><h2 class="tilt sm">${p.title}<i class="dd"></i></h2><div class="meta"><span>${ic('users')}${(J.players || []).length} participant${(J.players || []).length > 1 ? 's' : ''}</span><span>${ic('flag')}${st}</span>${nb ? `<span>${ic('trophy')}${intTour(0, nb)}</span>` : ''}</div>${J.champion ? `<div class="int-moi win">${ic('trophy')}<b>${esc(intNom(J, J.champion))} remporte le tournoi</b></div>` : ''}${moi.map(pj => intMatchCarte(p, J, pj)).join('')}<div class="ctl"><button class="btn grow" data-a="open" data-v="jaint" data-id="${p.id}">${ic('chart')}Tableau</button><button class="btn grow ghost" data-a="intTab" data-id="${p.id}" data-t="regle">Règlement</button><button class="btn grow ghost" data-a="intTab" data-id="${p.id}" data-t="joueurs">Participants</button></div>`;
}
/* la page du tournoi : tableau, règlement, participants */
function intView(id) {
  const p = posts.find(x => x.id === id);
  if (!p || !p.ja) return `<div class="pad">${empty('trophy', 'Tournoi introuvable', '')}</div>`;
  const J = p.ja,
    t = S.intTab || 'tableau',
    nb = (J.rounds || []).length,
    moi = intMoi(J),
    mesIds = moi.map(x => x.id);
  let corps = '';
  if (t === 'regle')
    corps = J.regle
      ? `<div class="card prose int-regle">${esc(J.regle).replace(/\n/g, '<br>')}</div>`
      : `<p class="muted">Le juge-arbitre n’a pas encore écrit le règlement.</p>`;
  else if (t === 'joueurs')
    corps = `<div class="card list">${(J.players || [])
      .slice()
      .sort((a, b) => (a.seed || 99) - (b.seed || 99) || a.n.localeCompare(b.n, 'fr'))
      .map(x => {
        const k = (x.ks || []).find(y => M[y]),
          enCourse = !intMatches(J).some(
            m => m.w && m.conf && !m.bye && (m.a === x.id || m.b === x.id) && m.w !== x.id
          );
        return `<div class="item">${k ? av(k, 'sm') : `<span class="tile">${ic('user')}</span>`}<span class="grow"><span class="nm">${intLien(J, x.id)}</span>${x.seed ? ` <span class="bd rk">TS ${x.seed}</span>` : ''}<br><span class="muted small">${J.champion === x.id ? 'Vainqueur' : nb ? (enCourse ? 'Toujours en course' : 'Éliminé') : 'Inscrit'}</span></span></div>`;
      })
      .join('')}</div>`;
  else if (!nb) corps = `<p class="muted">Le tableau n’est pas encore tiré.</p>`;
  else {
    const boite = m => {
      const e = intEtat(m),
        mien = mesIds.includes(m.a) || mesIds.includes(m.b),
        j = x =>
          `<span class="int-j ${m.w && m.conf ? (m.w === x ? 'w' : 'l') : ''}${mesIds.includes(x) ? ' moi' : ''}"><span>${x ? esc(intNom(J, x)) : '…'}</span>${m.w === x && m.sc ? `<b>${esc(m.sc)}</b>` : ''}</span>`;
      return `<div class="int-m${m.bye ? ' bye' : ''}${mien ? ' mien' : ''}${e === 'pending' ? ' att' : ''}">${j(m.a)}${j(m.b)}${e === 'pending' ? '<small>À confirmer</small>' : m.wo ? '<small>Forfait</small>' : ''}</div>`;
    };
    corps = `<div class="int-tab" style="--nb:${nb}">${J.rounds
      .map(
        (l, r) =>
          `<div class="int-col"><span class="kicker">${intTour(r, nb)}${intFin(J, r) ? ` · avant le ${intFin(J, r)}` : ''}</span>${l.map(boite).join('')}</div>`
      )
      .join('')}</div><p class="muted small">Faites glisser le tableau sur le côté pour voir les tours suivants.</p>`;
  }
  return `<div class="pad">${moi.map(pj => intMatchCarte(p, J, pj)).join('')}<div class="seg" role="tablist">${[
    ['tableau', 'Tableau'],
    ['regle', 'Règlement'],
    ['joueurs', 'Participants']
  ]
    .map(
      ([k, l]) =>
        `<button role="tab" aria-selected="${t === k}" data-a="intTab" data-id="${p.id}" data-t="${k}"><span class="lb">${l}</span></button>`
    )
    .join('')}</div>${corps}</div>`;
}
const intEnvoi = async (body, ok) => {
  try {
    await jaCall('/api/ja/interne', body);
    toast(ok); // la publication du tournoi est mise à jour par le serveur /RAM JA, et arrive en direct
  } catch (e) {
    toast(e.message);
  }
};
Object.assign(A, {
  intTab(d) {
    S.intTab = d.t;
    if (view().v !== 'jaint') S.stack.push({ v: 'jaint', id: d.id });
    render();
  },
  intRes(d) {
    const p = posts.find(x => x.kind === 'jaint' && x.ja && x.ja.tid === d.tid),
      J = p && p.ja,
      m = J && intMatches(J).find(x => x.id === d.m);
    if (!m) return;
    const moi = intMoi(J).find(x => x.id === m.a || x.id === m.b),
      adv = m.a === moi.id ? m.b : m.a;
    sheet(
      'Résultat du match',
      `<form class="body" id="int-res" data-tid="${esc(d.tid)}" data-m="${m.id}"${d.kid ? ` data-kid="${d.kid}"` : ''}><fieldset class="fld fq-opts"><legend>Qui a gagné ?</legend><label class="chk" for="int-w1"><input type="radio" name="int-w" id="int-w1" value="moi" required>${d.kid ? esc(first(d.kid)) : 'Moi'}</label><label class="chk" for="int-w2"><input type="radio" name="int-w" id="int-w2" value="lui">${esc(intNom(J, adv))}</label></fieldset>${O('int-sc', 'Score', '6-3 6-4')}<p class="muted small">Ton adversaire reçoit le résultat et le confirme. En cas de désaccord, le juge-arbitre tranche.</p><button class="btn full">Envoyer le résultat</button></form>`
    );
  },
  intConf(d) {
    intEnvoi({ act: 'confirm', tid: d.tid, m: d.m, kid: d.kid }, 'Résultat confirmé · le tableau avance');
  },
  intContest(d) {
    sheet(
      'Contester le résultat',
      `<form class="body" id="int-contest" data-tid="${esc(d.tid)}" data-m="${d.m}"${d.kid ? ` data-kid="${d.kid}"` : ''}>${O('int-why', 'Ce qui ne va pas (facultatif)', 'Le score réel, un match pas encore joué…')}<p class="muted small">Le juge-arbitre est prévenu et tranche dans /RAM JA.</p><button class="btn full">Contester</button></form>`
    );
  }
});
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id !== 'int-res' && f.id !== 'int-contest') return;
  e.preventDefault();
  const base = { tid: f.dataset.tid, m: f.dataset.m, kid: f.dataset.kid || undefined };
  closeSheet();
  if (f.id === 'int-res') {
    const w = (f.querySelector('input[name="int-w"]:checked') || {}).value;
    if (!w) return toast('Indique qui a gagné');
    intEnvoi(
      Object.assign(base, { act: 'result', w, sc: (($('int-sc') || {}).value || '').trim() }),
      'Résultat envoyé · ton adversaire doit le confirmer'
    );
  } else
    intEnvoi(
      Object.assign(base, { act: 'contest', why: (($('int-why') || {}).value || '').trim() }),
      'Contestation envoyée au juge-arbitre'
    );
});
V.jaint = intView;
