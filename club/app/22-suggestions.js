/* /RAM Club et /RAM Coach — app/22-suggestions.js : liste déroulante sous les champs de noms.
   Chaque champ qui demande un adhérent, un joueur ou un club propose ce que l'appli connaît :
   - adhérents du club (fiches /RAM Club) ;
   - joueurs de la base /RAM JA (recherche au fil de la frappe, 2 lettres au moins) ;
   - annuaire des clubs commun à /RAM JA et /RAM Club.
   La liste s'ouvre juste sous le champ (au-dessus s'il n'y a pas la place) ; le champ reste libre. */
const SUGG = {
  'co-n': ['membres'], // /RAM Coach : nouvel élève (souvent déjà adhérent)
  'co-pn': ['membres'], // /RAM Coach : parent de l'élève
  'ev-ens-nom': ['membres', 'joueurs'], // stage : intervenant qui n'est pas enseignant du club
  'pr-ext': ['membres', 'joueurs'], // résultat de padel : partenaire extérieur
  'r-opp': ['membres', 'joueurs'], // résultat : adversaire
  'ja-last': ['joueurs'], // inscription à un tournoi /RAM JA : partenaire hors du club (nom)
  'ja-first': ['joueurs'], // … son prénom
  'ja-club': ['clubs'], // … son club
  'pr-club': ['clubs'], // résultat de padel : club organisateur
  'a-opp': ['clubs'], // rencontre par équipes : club adverse
  'l-q': ['membres'], // annuaire des adhérents : recherche
  'co-q': ['eleves', 'membres'] // /RAM Coach : rechercher un élève
};
const sgEsc = s =>
  String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const sgNom = s =>
  String(s || '')
    .replace(/<[^>]*>/g, '')
    .trim();
const sgFold = s =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
let sgClubs = null,
  sgBox = null,
  sgCur = null,
  sgItems = [],
  sgAct = -1,
  sgSeq = 0,
  sgT = null,
  sgSkip = false;
/* adhérents du club : fiches connues de l'appli, sans le club lui-même */
const sgMembres = () =>
  Object.keys(M)
    .filter(k => k !== 'club' && M[k] && sgNom(M[k].n))
    .map(k => ({
      v: sgNom(M[k].n),
      l: [M[k].role || 'Adhérent', M[k].pl ? 'niv ' + M[k].pl + ' padel' : M[k].r && M[k].r !== 'NC' ? M[k].r : '']
        .filter(Boolean)
        .join(' · '),
      d: { k }
    }))
    .sort((a, b) => a.v.localeCompare(b.v, 'fr'));
async function sgAnnuaire() {
  if (sgClubs) return sgClubs;
  const nous = typeof club === 'function' && club().name ? [{ v: sgNom(club().name), l: 'Mon club' }] : [];
  try {
    const r = await fetch('/api/clubs-directory', { credentials: 'include' });
    const d = r.ok ? await r.json() : {};
    sgClubs = nous.concat(
      (d.clubs || [])
        .filter(c => c.name)
        .map(c => ({
          v: c.name,
          l: [
            c.city,
            c.ramClub ? '/RAM Club' : c.tournaments ? c.tournaments + ' tournoi' + (c.tournaments > 1 ? 's' : '') : ''
          ]
            .filter(Boolean)
            .join(' · ')
        }))
    );
  } catch (e) {
    sgClubs = nous;
  }
  return sgClubs;
}
async function sgJoueurs(t, champ) {
  if (t.length < 2 || !(window.RAM && RAM.live)) return [];
  const r = await fetch('/api/players?q=' + encodeURIComponent(t), { credentials: 'include' }).catch(() => null);
  const d = r && r.ok ? await r.json() : {};
  return (d.players || [])
    .filter(p => p.source !== 'club')
    .map(p => ({
      v:
        champ === 'ja-last'
          ? String(p.last || '').toUpperCase()
          : champ === 'ja-first'
            ? p.first || ''
            : [p.first, p.last].filter(Boolean).join(' '),
      l: [
        champ === 'ja-last' ? p.first : champ === 'ja-first' ? String(p.last || '').toUpperCase() : 'Joueur /RAM JA',
        p.club,
        p.rank,
        p.licence ? 'lic. ' + p.licence : ''
      ]
        .filter(Boolean)
        .join(' · '),
      d: { p }
    }));
}
/* la liste est rangée dans le bloc du champ et accrochée sous lui : elle suit le champ quand la page défile
   ou quand le clavier du téléphone s'ouvre (une liste fixée à l'écran se décalait sur iPhone) */
function sgPlace() {
  const hote = sgCur.parentElement;
  if (getComputedStyle(hote).position === 'static') hote.style.position = 'relative';
  if (sgBox.parentElement !== hote) hote.appendChild(sgBox);
  sgBox.style.left = sgCur.offsetLeft + 'px';
  sgBox.style.top = sgCur.offsetTop + sgCur.offsetHeight + 4 + 'px';
  sgBox.style.width = sgCur.offsetWidth + 'px';
}
function sgDraw() {
  if (!sgBox) {
    sgBox = document.createElement('div');
    sgBox.className = 'sgbox';
    sgBox.setAttribute('role', 'listbox');
    document.body.appendChild(sgBox);
    sgBox.addEventListener('pointerdown', e => {
      e.preventDefault();
      const b = e.target.closest('[data-i]');
      if (b) sgPick(+b.dataset.i);
    });
  }
  sgBox.innerHTML = sgItems
    .map(
      (it, i) =>
        `<button type="button" role="option" data-i="${i}" aria-selected="${i === sgAct}"><b>${sgEsc(it.v)}</b>${it.l ? `<small>${sgEsc(it.l)}</small>` : ''}</button>`
    )
    .join('');
  sgBox.hidden = !sgItems.length || !sgCur;
  if (!sgBox.hidden) sgPlace();
}
async function sgUpdate(inp) {
  const src = SUGG[inp.id];
  if (!src) return;
  sgCur = inp;
  inp.setAttribute('autocomplete', 'off');
  inp.removeAttribute('list');
  const t = inp.value.trim(),
    my = ++sgSeq,
    f = x => !t || sgFold(x.v).includes(sgFold(t)) || sgFold(x.l).includes(sgFold(t));
  let l = [];
  if (src.includes('eleves') && typeof ELEVES !== 'undefined')
    l = l.concat(
      ELEVES.filter(x => x && x.n)
        .map(x => ({
          v: sgNom(x.n),
          l: ['Élève', x.sport, x.lvl ? 'niveau ' + x.lvl : ''].filter(Boolean).join(' · ')
        }))
        .filter(f)
    );
  if (src.includes('membres')) l = l.concat(sgMembres().filter(f));
  if (src.includes('clubs')) l = l.concat((await sgAnnuaire()).filter(f));
  if (src.includes('joueurs')) l = l.concat(await sgJoueurs(t, inp.id).catch(() => []));
  if (my !== sgSeq || sgCur !== inp || document.activeElement !== inp) return;
  const vus = new Set();
  l = l.filter(x => x.v && !vus.has(sgFold(x.v)) && vus.add(sgFold(x.v)));
  if (l.length === 1 && sgFold(l[0].v) === sgFold(t)) l = [];
  sgItems = l.slice(0, 8);
  sgAct = -1;
  sgDraw();
}
function sgClose() {
  if (sgBox) sgBox.hidden = true;
  sgItems = [];
  sgAct = -1;
}
function sgPick(i) {
  const it = sgItems[i],
    inp = sgCur;
  if (!it || !inp) return;
  sgSkip = true;
  inp.value = it.v;
  ['input', 'change'].forEach(t => inp.dispatchEvent(new Event(t, { bubbles: true })));
  sgSkip = false;
  // un joueur /RAM JA choisi pour un partenaire hors du club : nom, prénom, licence et club complétés
  const p = it.d && it.d.p;
  if (p && (inp.id === 'ja-last' || inp.id === 'ja-first')) {
    const met = (id, v) => {
      const x = $(id);
      if (x && v) x.value = v;
    };
    met('ja-last', String(p.last || '').toUpperCase());
    met('ja-first', p.first);
    met('ja-lic', p.licence);
    met('ja-club', p.club);
  }
  sgClose();
}
document.addEventListener('focusin', e => {
  if (e.target && e.target.tagName === 'INPUT' && SUGG[e.target.id]) sgUpdate(e.target);
});
document.addEventListener('input', e => {
  if (sgSkip || !e.target || !SUGG[e.target.id]) return;
  clearTimeout(sgT);
  sgT = setTimeout(() => sgUpdate(e.target), 160);
});
document.addEventListener('keydown', e => {
  if (!sgBox || sgBox.hidden || e.target !== sgCur) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    sgAct = (sgAct + (e.key === 'ArrowDown' ? 1 : -1) + sgItems.length) % sgItems.length;
    sgDraw();
  } else if (e.key === 'Enter' && sgAct >= 0) {
    e.preventDefault();
    sgPick(sgAct);
  } else if (e.key === 'Escape') sgClose();
});
document.addEventListener('focusout', e => {
  if (e.target !== sgCur) return;
  setTimeout(() => {
    if (document.activeElement !== sgCur) {
      sgClose();
      sgCur = null;
    }
  }, 150);
});
addEventListener('resize', () => sgBox && !sgBox.hidden && sgCur && sgPlace());
