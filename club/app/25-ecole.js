/* /Buvette — app/25-ecole.js : l'École à portée de main (24/11/2026).
   - Jouer : 4e onglet « École » (mes cours avec la présence, collectifs, stages, enseignants ; Mes groupes ou Gestion pour
     l'enseignant et le bureau). La page École ouverte depuis Club reste là.
   - Messages : l'onglet « Entraînements » devient « École » : les conversations avec l'enseignant (messages, bilans, vidéos,
     contenus, venus de /Dojo) en tête, puis les groupes de discussion des cours. */

/* ---------- Jouer > École ---------- */
const BV_JOU3 = [
  ['parties', 'Parties', 'ball'],
  ['equipes', 'Équipes', 'users'],
  ['resultats', 'Résultats', 'trophy']
];
const BV_JOU4 = BV_JOU3.concat([['ecole', 'École', 'school']]);
const bvJouSeg = tabs => segs('jouTab', tabs).replace('class="seg ico"', 'class="seg"');
/* les rubriques de l'école, dans l'ordre ; « Mes groupes » (enseignant) ou « Gestion » (bureau) en plus */
function bvEcoleRubriques() {
  const staff = isAdmin(),
    coach = S.role === 'coach' || !!S.super;
  return [
    ['mine', 'Mes cours'],
    ['coll', 'Collectifs'],
    ['stages', 'Stages'],
    ['profs', 'Enseignants']
  ].concat(staff ? [['manage', coach ? 'Mes groupes' : 'Gestion']] : []);
}
function bvJouerEcole() {
  const rub = bvEcoleRubriques();
  if (!S.jouEc || !rub.some(r => r[0] === S.jouEc)) S.jouEc = 'mine';
  const chips = rub
    .map(
      ([k, l]) =>
        `<button class="chip" data-a="seg" data-k="jouEc" data-val="${k}" aria-pressed="${S.jouEc === k}">${l}</button>`
    )
    .join('');
  return `<div class="pad bvjecole"><div class="chips bvfch" role="group" aria-label="Rubriques de l’école">${chips}</div>${ecoleBody(S.jouEc)}</div>`;
}
const bvJouerAvantEcole = V.jouer;
V.jouer = () => {
  if (S.jouTab === 'ecole') return bvJouSeg(BV_JOU4) + bvJouerEcole();
  return bvJouerAvantEcole().replace(bvJouSeg(BV_JOU3), bvJouSeg(BV_JOU4));
};

/* ---------- Messages > École ---------- */
/* conversations de suivi visibles : la mienne et celles de mes enfants (élève, parent), et celles des élèves à qui j'ai écrit
   (enseignant) ; une conversation n'apparaît qu'une fois que quelque chose y a été envoyé */
function bvDmFils() {
  if (typeof SUIVI === 'undefined' || typeof svOf !== 'function') return [];
  const mine = svMine().filter(k => svOf(k).length),
    eleves = [...new Set(SUIVI.filter(x => svMe(x.by) === ME()).map(x => x.to))].filter(k => !svMine().includes(k));
  const fils = mine.concat(eleves).map(k => {
    const l = svOf(k);
    return { k, last: l[l.length - 1], un: svUnread(k) };
  });
  return fils.sort((a, b) => ((b.last && b.last.at) || 0) - ((a.last && a.last.at) || 0));
}
function bvDmLigne(f) {
  const k = f.k,
    eleve = svMine().includes(k),
    profs = eleve ? dmCoaches(k).map(first) : [],
    titre = eleve
      ? k === ME()
        ? profs.length
          ? profs.join(', ')
          : 'Mon enseignant'
        : 'Suivi de ' + svFirst(k)
      : svName(k),
    sous = eleve ? (k === ME() ? 'Mon enseignant' : profs.join(', ') || 'Enseignant') : 'Élève',
    x = f.last,
    qui = x ? (svMe(x.by) === ME() ? 'Toi' : M[x.by] ? first(x.by) : 'Enseignant') : '',
    quoi = x ? (x.k && x.k !== 'msg' ? (SV_KIND[x.k] || ['', 'Envoi'])[1] : x.txt || 'Message') : 'Aucun message';
  return `<div class="li"><button class="go" data-a="open" data-v="dm" data-id="${esc(k)}"><span class="tile">${ic('school')}</span><span class="grow"><span class="nm">${esc(titre)}</span> <span class="muted small">· ${esc(sous)}</span><span class="last">${esc(qui ? qui + ' : ' : '')}${esc(quoi)}</span></span>${f.un ? `<span class="un">${f.un}</span>` : ''}</button></div>`;
}
const bvChansAvantEcole = V.chans;
V.chans = () => {
  if (S.chanTab === 'train') S.chanTab = 'ecole';
  if (S.chanTab !== 'ecole') return bvChansEcoleOnglet(bvChansAvantEcole());
  // la liste des groupes de cours (ancien onglet Entraînements), puis les conversations avec l'enseignant en tête
  S.chanTab = 'train';
  let h;
  try {
    h = bvChansAvantEcole();
  } finally {
    S.chanTab = 'ecole';
  }
  h = bvChansEcoleOnglet(h);
  const fils = bvDmFils();
  if (!fils.length) return h;
  const sansGroupe = !chans.some(c => c.g === 'train' && chanOk(c));
  if (sansGroupe) h = h.replace(/<div class="empty[\s\S]*?Aucun groupe ici[\s\S]*?<\/div>\s*<\/div>/, '');
  const bloc =
    `<div class="kicker bvdmk">Avec ton enseignant${fils.length > 1 && !fils.every(f => svMine().includes(f.k)) ? ' · tes élèves' : ''}</div>` +
    fils.map(bvDmLigne).join('') +
    (sansGroupe ? '' : '<div class="kicker bvdmk">Groupes des cours</div>');
  return h.replace('<div class="lis">', '<div class="lis">' + bloc);
};
/* l'onglet : « École » à la place d'« Entraînements », avec les non-lus des conversations de suivi */
function bvChansEcoleOnglet(h) {
  const nDm = bvDmFils().reduce((a, f) => a + (f.un || 0), 0);
  return h.replace(
    /(<button role="tab" aria-selected=")(true|false)(" aria-label=")Entraînements(" data-a="seg" data-k="chanTab" data-val=")train(">)([\s\S]*?)<span class="lb">Entraînements<\/span>(?:<span class="cnt">(\d+)<\/span>)?/,
    (m, a, sel, b, c, d, icone, nGr) => {
      const n = nDm + (+nGr || 0); // une seule pastille : groupes des cours et conversations avec l'enseignant
      return `${a}${S.chanTab === 'ecole' ? 'true' : 'false'}${b}École${c}ecole${d}${icone}<span class="lb">École</span>${n ? `<span class="cnt">${n}</span>` : ''}`;
    }
  );
}
