/* /RAM Club — app/13-favoris.js : mes favoris, la frise de raccourcis personnelle en haut du mur.
   L'étoile en haut d'une page (une discussion, une équipe, le bar, mes cours…) l'ajoute à mes favoris ;
   la frise du mur les montre dans mon ordre. Tant que je n'en ai pas, la frise propose les pages que
   j'ouvre le plus souvent (comptées sur cet appareil), puis les raccourcis habituels.
   Les favoris sont rangés avec mes préférences : je les retrouve sur tous mes appareils. */
I.star = '<path d="M12 3.6l2.55 5.2 5.7.83-4.13 4.02.98 5.68L12 16.65l-5.1 2.68.98-5.68-4.13-4.02 5.7-.83z"/>';
const FAV_MAX = 12;
const FAV_SUB = { club: 'clubTab', ecole: 'ecTab', chans: 'chanTab' };
const FAV_TABS = {
  chans: ['Groupes', 'chat', { club: 'Groupes du club', train: 'Entraînements', team: 'Groupes d’équipe' }],
  agenda: ['Agenda', 'cal', { me: 'Mon agenda', club: 'Agenda du club' }],
  ecole: [
    'École',
    'school',
    { mine: 'Mes cours', perso: 'Mon espace', profs: 'Enseignants', stages: 'Stages', manage: 'Gestion des cours' }
  ],
  club: ['Le club', 'club', { teams: 'Équipes', club: 'Le club', comm: 'Commissions', bar: 'Bar', actus: 'Actus' }],
  me: ['Mon profil', 'user', {}]
};
const FAV_TAB_ICONS = {
  teams: 'score',
  bar: 'cup',
  actus: 'news',
  comm: 'users',
  stages: 'ball',
  mine: 'cal',
  perso: 'user',
  profs: 'school',
  train: 'ball',
  team: 'users'
};
if (!Array.isArray(S.favs)) {
  try {
    S.favs = JSON.parse(localStorage.getItem('club-favs') || '[]');
  } catch (e) {
    S.favs = [];
  }
}
/* la page ouverte, telle qu'on la range en favori (null : le mur lui-même) */
function favHere() {
  const v = view();
  if (S.stack.length) return { v: v.v, id: v.id || '' };
  if (S.tab === 'home') return null;
  const k = FAV_SUB[S.tab];
  return { t: S.tab, s: k ? S[k] || '' : S.tab === 'agenda' ? S.plan.scope || 'me' : '' };
}
const favKey = f => (f.v ? f.v + ':' + (f.id || '') : 'tab:' + f.t + ':' + (f.s || ''));
const isFav = f => !!f && S.favs.some(x => favKey(x) === favKey(f));
/* nom et pictogramme d'un favori (null s'il n'existe plus : groupe supprimé, discussion fermée…) */
function favMeta(f) {
  try {
    if (f.t) {
      const T = FAV_TABS[f.t];
      if (!T) return null;
      return { l: T[2][f.s] || T[0], i: FAV_TAB_ICONS[f.s] || T[1] };
    }
    const id = f.id;
    switch (f.v) {
      case 'chan': {
        const c = chans.find(x => x.id === id);
        return c && chanOk(c) ? { l: c.name, i: c.g === 'team' ? 'users' : c.g === 'train' ? 'ball' : 'chat' } : null;
      }
      case 'rec': {
        const r = recs.find(x => x.id === id);
        return r ? { l: teamName(grp(r.tid)) + ' – ' + r.opp, i: 'score' } : null;
      }
      case 'team':
      case 'grp': {
        const g = grp(id);
        return g ? { l: f.v === 'team' ? teamName(g) : g.name, i: f.v === 'team' ? 'users' : 'ball' } : null;
      }
      case 'champ': {
        const c = CHAMPS.find(x => x.id === id);
        return c ? { l: c.name, i: 'folder' } : null;
      }
      case 'comm': {
        const c = COMMS.find(x => x.id === id);
        return c ? { l: c.name, i: 'flag' } : null;
      }
      case 'member':
        return M[id] ? { l: M[id].n, a: id } : null;
      case 'post': {
        const p = posts.find(x => x.id === id);
        return p ? { l: String(p.title || p.q || 'Publication').replace(/<[^>]+>/g, ''), i: 'news' } : null;
      }
    }
    return TITLES[f.v] ? { l: TITLES[f.v]()[0], i: f.v === 'aide' ? 'info' : 'star' } : null;
  } catch (e) {
    return null;
  }
}
function favSave() {
  try {
    localStorage.setItem('club-favs', JSON.stringify(S.favs));
  } catch (e) {}
}
/* pages les plus ouvertes sur cet appareil (pour proposer une frise avant le premier favori) */
let favVisits = {};
try {
  favVisits = JSON.parse(localStorage.getItem('club-visits') || '{}');
} catch (e) {}
let favLast = '';
function favVisit() {
  const f = favHere();
  if (!f) return;
  const k = favKey(f);
  if (k === favLast) return;
  favLast = k;
  favVisits[k] = { f, n: ((favVisits[k] && favVisits[k].n) || 0) + 1 };
  try {
    localStorage.setItem('club-visits', JSON.stringify(favVisits));
  } catch (e) {}
}
const favUsual = () =>
  Object.values(favVisits)
    .filter(x => x.n >= 3 && favMeta(x.f))
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
    .map(x => x.f);
/* du nouveau dans un favori : messages non lus, rencontre en direct, réservations ou demandes à traiter */
function favNew(f) {
  try {
    const unread = c => !!c && !c.mute && c.un > 0;
    if (f.v === 'chan') return unread(chans.find(x => x.id === f.id));
    if (f.v === 'rec') return (recs.find(x => x.id === f.id) || {}).st === 'live';
    if (f.v === 'team' || f.v === 'grp')
      return unread(chans.find(x => x.id === f.id)) || recs.some(r => r.tid === f.id && r.st === 'live');
    if (f.t === 'chans') return chans.some(c => (!f.s || c.g === f.s) && chanOk(c) && unread(c));
    if (f.t === 'club') {
      if (f.s === 'teams') return recs.some(r => r.st === 'live' && !r.arch);
      if (f.s === 'bar')
        return (
          isBureau() && (REDEEMS.some(r => r.st === 'ok') || ORDERS.some(o => o.date === isoIn(1) && o.st === 'ok'))
        );
      if (f.s === 'comm') return isBureau() && COMMS.some(c => (c.req || []).length);
      if (f.s === 'actus') return arts.some(a => !a.arch && isNew('club', a.at));
    }
  } catch (e) {}
  return false;
}
/* tuiles de la frise : mes favoris (ou les pages que j'ouvre le plus), puis « Modifier » */
function favStrip(st) {
  const mine = S.favs.filter(f => favMeta(f)),
    list = mine.length ? mine : favUsual(),
    tile = (f, i) => {
      const m = favMeta(f);
      return st(
        'favGo',
        `data-k="${esc(favKey(f))}"`,
        m.a ? av(m.a, 'sm') : ic(m.i),
        esc(m.l),
        favNew(f) ? '' : 'calm'
      );
    };
  return {
    tiles: list.map(tile).join(''),
    tail: mine.length
      ? st('favEdit', '', ic('edit'), 'Mes favoris', 'calm')
      : st('favHelp', '', ic('star'), 'Mes favoris', 'calm'),
    any: list.length > 0
  };
}
Object.assign(A, {
  /* étoile en haut de la page : ajouter ou retirer des favoris */
  fav(d, el) {
    const f = favHere();
    if (!f) return;
    const k = favKey(f),
      i = S.favs.findIndex(x => favKey(x) === k);
    if (i >= 0) {
      S.favs.splice(i, 1);
      toast('Retiré de tes favoris');
    } else {
      if (S.favs.length >= FAV_MAX) return toast(`${FAV_MAX} favoris au plus : retires-en un depuis le mur`);
      S.favs.push(f);
      toast('Ajouté à tes favoris, en haut du mur');
      if (typeof fxBurst === 'function') fxBurst(fxAt(el));
    }
    favSave();
    render(true);
  },
  /* ouvrir un favori depuis la frise */
  favGo(d) {
    const f = S.favs.concat(favUsual()).find(x => favKey(x) === d.k);
    if (!f) return;
    if (f.v) {
      S.stack = [{ v: f.v, id: f.id || undefined }];
      render();
      return;
    }
    if (FAV_SUB[f.t]) S[FAV_SUB[f.t]] = f.s;
    if (f.t === 'agenda') S.plan.scope = f.s || 'me';
    S.stack = [];
    A.tab({ t: f.t });
  },
  favHelp() {
    sheet(
      'Mes favoris',
      `<div class="body"><p>Garde à portée de main les pages que tu utilises le plus : touche l’<b>étoile</b> en haut d’une page (une discussion, une équipe, le bar, tes cours, l’agenda du club…) pour l’ajouter à ta frise, en haut du mur.</p><p class="muted small">Tant que tu n’as pas de favori, la frise te propose les pages que tu ouvres le plus souvent. Tes favoris te suivent sur tous tes appareils.</p></div>`
    );
  },
  /* gérer la frise : ordre et suppression */
  favEdit() {
    const rows = S.favs
      .map((f, i) => {
        const m = favMeta(f);
        if (!m) return '';
        return `<div class="item"><span class="tile">${m.a ? av(m.a, 'sm') : ic(m.i)}</span><span class="grow nm">${esc(m.l)}</span><button class="ib" data-a="favMove" data-i="${i}" data-n="-1" aria-label="Monter" ${i ? '' : 'disabled'} style="rotate:90deg">${ic('back')}</button><button class="ib" data-a="favMove" data-i="${i}" data-n="1" aria-label="Descendre" ${i < S.favs.length - 1 ? '' : 'disabled'} style="rotate:-90deg">${ic('back')}</button><button class="ib" data-a="favDel" data-i="${i}" aria-label="Retirer">${ic('x')}</button></div>`;
      })
      .join('');
    sheet(
      'Mes favoris',
      `<div class="body">${rows || '<p class="muted">Aucun favori.</p>'}<p class="muted small">Ajoute une page avec l’étoile en haut de l’écran.</p></div>`
    );
  },
  favMove(d) {
    const i = +d.i,
      j = i + +d.n;
    if (j < 0 || j >= S.favs.length) return;
    [S.favs[i], S.favs[j]] = [S.favs[j], S.favs[i]];
    favSave();
    render(true);
    A.favEdit();
  },
  favDel(d) {
    S.favs.splice(+d.i, 1);
    favSave();
    render(true);
    A.favEdit();
  }
});
