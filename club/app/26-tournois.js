/* /Buvette — app/26-tournois.js : les tournois du club, rangés à part (demande de Baptiste, 25/11/2026).
   Un tournoi ou une animation créé dans /Pista (publication « jatour ») et un tournoi interne (« jaint ») ne vont plus
   tout seuls sur le mur : ils sont dans Jouer > Tournois (à venir) et dans Club > Tournois (vue liste ou calendrier,
   filtres et tri). Le bureau et l'équipe pédagogique peuvent les mettre sur le mur (champ « promo », gardé par le
   serveur quand /Pista met la publication à jour). Ce fichier n'est chargé que par index.html (/Buvette). */
I.medal = '<path d="M8 3h8l-2 6h-4zM12 9a6 6 0 100 12 6 6 0 000-12zM12 13v4M10 15h4"/>';
I.filter = I.filter || '<path d="M4 5h16l-6 8v5l-4 2v-7z"/>';
TITLES.tournois = () => ['Tournois', 'Club'];

/* ce qu'on sait d'un tournoi pour le ranger, le filtrer et l'afficher */
function trInfo(p) {
  const ja = p.ja || {},
    interne = p.kind === 'jaint',
    type = interne ? 'interne' : ja.ani ? 'animation' : 'homologue';
  return {
    p,
    ja,
    type,
    sport: p.sport || ja.sport || 'Padel',
    cat: interne ? 'Interne' : ja.ani ? ja.fmt || 'Animation' : ja.cat || '',
    tmc: !ja.ani && ja.tab === 'tmc',
    d: p.d || '',
    fin: p.d2 || p.d || '',
    heure: ja.time || '',
    heureFin: ja.fin || '',
    statut: ja.status || ''
  };
}
const trTous = () => posts.filter(p => estTournoi(p) && !p.arch && canSee(p)).map(trInfo);
const trAvenir = t => !t.fin || t.fin >= TODAY;
const trCatNum = c => parseInt(String(c).replace(/\D/g, ''), 10) || 9999; // animations et internes après P25…P2000
function trResume() {
  const n = trTous().filter(trAvenir).length;
  return n ? `${n} à venir` : 'Calendrier, résultats';
}

/* ---------- une ligne de tournoi : date, nom, catégorie, horaires, état ; bouton « mur » pour le bureau ---------- */
const TR_STATUT = { open: 'Inscriptions ouvertes', drawn: 'Tirage fait', live: 'En cours', done: 'Terminé' };
const trHeure = h => (h ? h.replace(':', ' h ').replace(/ h 00$/, ' h') : '');
function trLigne(t, avecMur) {
  const p = t.p,
    j = t.d ? new Date(t.d + 'T12:00:00') : null,
    jour = j ? j.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }).replace('.', '') : 'Date à venir',
    mois = j ? j.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '') : '',
    horaires = t.heure ? trHeure(t.heure) + (t.heureFin ? ' – ' + trHeure(t.heureFin) : '') : '',
    infos = [
      t.cat,
      t.type === 'homologue' && t.ja.gender,
      t.tmc && 'TMC',
      t.type !== 'homologue' && t.sport,
      horaires,
      t.fin && t.d && t.fin !== t.d ? "jusqu'au " + fmtD(t.fin, 1) : ''
    ]
      .filter(Boolean)
      .map(esc)
      .join(' · '),
    etat = TR_STATUT[t.statut] || '',
    mur =
      avecMur && isAdmin()
        ? `<button class="btn sm ${p.promo ? 'on' : 'ghost'} trmur" data-a="trMur" data-id="${p.id}" aria-pressed="${!!p.promo}">${ic(p.promo ? 'check' : 'plus')}${p.promo ? 'Sur le mur' : 'Mettre sur le mur'}</button>`
        : '';
  return `<div class="trl"><button class="item trrow" data-a="open" data-v="post" data-id="${p.id}"><span class="u2d trd"><b>${esc(jour)}</b><span>${esc(mois)}</span></span><span class="grow"><span class="nm">${esc(p.title || 'Tournoi')}</span><br><span class="muted small">${infos}</span>${etat ? `<br><span class="tag${t.statut === 'live' ? ' hot' : ''}">${etat}</span>` : ''}</span>${ic('back')}</button>${mur}</div>`;
}
A.trMur = d => {
  if (!isAdmin()) return;
  const p = posts.find(x => x.id === d.id);
  if (!p) return;
  p.promo = p.promo ? null : Date.now();
  if (p.promo) {
    // en tête du mur, comme une publication neuve
    posts.splice(posts.indexOf(p), 1);
    posts.unshift(p);
  }
  render(true);
  toast(p.promo ? 'Tournoi mis sur le mur : les adhérents le voient sur l’Accueil' : 'Tournoi retiré du mur');
};

/* ---------- Jouer > Tournois : ce qui arrive, le plus proche d'abord ---------- */
function trJouer() {
  const l = trTous()
    .filter(trAvenir)
    .sort((a, b) => (a.d || '9').localeCompare(b.d || '9'));
  return `<div class="pad trj">${
    l.length
      ? `<span class="kicker">Tournois à venir · ${l.length}</span><div class="card trliste">${l.map(t => trLigne(t, true)).join('')}</div>`
      : empty(
          'medal',
          'Aucun tournoi à venir',
          'Les tournois et animations du club créés dans /Pista apparaissent ici.'
        )
  }<button class="btn ghost full" data-a="open" data-v="tournois">${ic('cal')}Tous les tournois, calendrier et résultats</button></div>`;
}

/* ---------- Club > Tournois : vue liste ou calendrier, filtres et tri ---------- */
if (!S.trv) S.trv = 'liste';
if (!S.trf) S.trf = { quand: 'avenir', sport: '', type: '', cat: '' };
if (!S.trs) S.trs = 'date';
if (!S.trm) S.trm = TODAY.slice(0, 7);
const TR_TYPES = [
  ['', 'Tous'],
  ['homologue', 'Homologués'],
  ['tmc', 'TMC'],
  ['interne', 'Internes'],
  ['animation', 'Animations']
];
function trFiltre(l, sansQuand) {
  const f = S.trf;
  return l.filter(
    t =>
      (sansQuand || f.quand === 'tout' || (f.quand === 'passes' ? !trAvenir(t) : trAvenir(t))) &&
      (!f.sport || t.sport === f.sport) &&
      (!f.type || (f.type === 'tmc' ? t.tmc : t.type === f.type)) &&
      (!f.cat || t.cat === f.cat)
  );
}
function trTri(l) {
  const s = S.trs,
    parDate = (a, b) => (a.d || '9').localeCompare(b.d || '9');
  if (s === 'recents') return l.sort((a, b) => parDate(b, a));
  if (s === 'cat')
    return l.sort((a, b) => trCatNum(a.cat) - trCatNum(b.cat) || a.cat.localeCompare(b.cat) || parDate(a, b));
  if (s === 'nom') return l.sort((a, b) => String(a.p.title || '').localeCompare(String(b.p.title || ''), 'fr'));
  return l.sort(parDate);
}
function trFiltres(tous) {
  const f = S.trf,
    chip = (cle, val, lb) =>
      `<button class="chip" data-a="trF" data-k="${cle}" data-val="${esc(val)}" aria-pressed="${f[cle] === val}">${esc(lb)}</button>`,
    groupe = (titre, html) =>
      `<div class="trfg"><span class="kicker">${titre}</span><div class="chips wrap">${html}</div></div>`,
    sports = [...new Set(tous.map(t => t.sport))].sort(),
    cats = [
      ...new Set(
        tous
          .filter(t => t.type !== 'interne')
          .map(t => t.cat)
          .filter(Boolean)
      )
    ].sort((a, b) => trCatNum(a) - trCatNum(b) || a.localeCompare(b));
  return `<details class="more trfil"${f.sport || f.type || f.cat ? ' open' : ''}><summary>${ic('filter')}Filtres et tri${
    [f.sport, f.type, f.cat].filter(Boolean).length
      ? ` <span class="tag">${[f.sport, f.type, f.cat].filter(Boolean).length}</span>`
      : ''
  }</summary><div class="in">${
    S.trv === 'liste'
      ? groupe(
          'Quand',
          chip('quand', 'avenir', 'À venir') + chip('quand', 'passes', 'Passés') + chip('quand', 'tout', 'Tous')
        )
      : ''
  }${sports.length > 1 ? groupe('Sport', chip('sport', '', 'Tous') + sports.map(s => chip('sport', s, s)).join('')) : ''}${groupe(
    'Type',
    TR_TYPES.map(x => chip('type', x[0], x[1])).join('')
  )}${cats.length ? groupe('Catégorie', chip('cat', '', 'Toutes') + cats.map(c => chip('cat', c, c)).join('')) : ''}${
    S.trv === 'liste'
      ? groupe(
          'Trier par',
          [
            ['date', 'Date'],
            ['recents', 'Plus récents'],
            ['cat', 'Catégorie'],
            ['nom', 'Nom']
          ]
            .map(
              x =>
                `<button class="chip" data-a="trS" data-val="${x[0]}" aria-pressed="${S.trs === x[0]}">${x[1]}</button>`
            )
            .join('')
        )
      : ''
  }</div></details>`;
}
A.trF = d => {
  S.trf[d.k] = S.trf[d.k] === d.val && d.k !== 'quand' ? '' : d.val;
  render(true);
};
A.trS = d => {
  S.trs = d.val;
  render(true);
};
/* calendrier du mois : chaque tournoi sur ses jours ; toucher un tournoi l'ouvre */
function trCalendrier(l) {
  const [y, m] = S.trm.split('-').map(Number),
    premier = new Date(y, m - 1, 1),
    nbJours = new Date(y, m, 0).getDate(),
    decal = (premier.getDay() + 6) % 7,
    iso = j => `${y}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`,
    titre = premier.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  let cases = '';
  for (let i = 0; i < decal; i++) cases += '<div class="trc vide" aria-hidden="true"></div>';
  for (let j = 1; j <= nbJours; j++) {
    const d = iso(j),
      ce = l.filter(t => t.d && d >= t.d && d <= (t.fin || t.d));
    cases += `<div class="trc${d === TODAY ? ' today' : ''}${ce.length ? ' plein' : ''}"><span class="trcj">${j}</span>${ce
      .slice(0, 3)
      .map(
        t =>
          `<button class="trce" data-a="open" data-v="post" data-id="${t.p.id}" title="${esc(t.p.title || '')}">${esc(t.cat || t.p.title || '')}</button>`
      )
      .join('')}${ce.length > 3 ? `<span class="trplus">+${ce.length - 3}</span>` : ''}</div>`;
  }
  const duMois = l
    .filter(t => t.d && t.d.slice(0, 7) <= S.trm && (t.fin || t.d).slice(0, 7) >= S.trm)
    .sort((a, b) => a.d.localeCompare(b.d));
  return `<div class="card trcal"><div class="trcalh"><button class="ib" data-a="trMois" data-n="-1" aria-label="Mois précédent">${ic('back')}</button><b>${titre}</b><button class="ib trsuiv" data-a="trMois" data-n="1" aria-label="Mois suivant">${ic('back')}</button></div><div class="trgrille">${[
    'L',
    'M',
    'M',
    'J',
    'V',
    'S',
    'D'
  ]
    .map(x => `<span class="trjs">${x}</span>`)
    .join('')}${cases}</div></div>${
    duMois.length
      ? `<span class="kicker">Ce mois-ci · ${duMois.length}</span><div class="card trliste">${duMois.map(t => trLigne(t, true)).join('')}</div>`
      : `<p class="muted small">Aucun tournoi ce mois-ci avec ces filtres.</p>`
  }`;
}
A.trMois = d => {
  const [y, m] = S.trm.split('-').map(Number),
    n = new Date(y, m - 1 + Number(d.n), 1);
  S.trm = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  render(true);
};
V.tournois = () => {
  const tous = trTous(),
    seg = segs('trv', [
      ['liste', 'Liste', 'list'],
      ['cal', 'Calendrier', 'cal']
    ]).replace('class="seg ico"', 'class="seg"');
  if (S.trv === 'cal')
    return seg + `<div class="pad trpage">${trFiltres(tous)}${trCalendrier(trFiltre(tous, true))}</div>`;
  const l = trTri(trFiltre(tous));
  return (
    seg +
    `<div class="pad trpage">${trFiltres(tous)}${
      l.length
        ? `<span class="kicker">${{ avenir: 'À venir', passes: 'Passés', tout: 'Tous les tournois' }[S.trf.quand]} · ${l.length}</span><div class="card trliste">${l
            .map(t => trLigne(t, true))
            .join('')}</div>`
        : empty(
            'medal',
            'Aucun tournoi',
            tous.length
              ? 'Aucun tournoi avec ces filtres.'
              : 'Les tournois et animations du club créés dans /Pista apparaissent ici.'
          )
    }</div>`
  );
};
