/* /RAM Club — ui/1-briques.js : Briques communes : catégories, classements, avatars, petits éléments réutilisés partout.
   Morceau de l'ancien ui.js : les fichiers ui/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
/* Briques d'interface et écrans */
const hue = id => [...id].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360;
const ini = id =>
  M[id].n
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2);
const av = (id, c = '') =>
  id === 'club'
    ? `<span class="av club ${c} ${club().logo ? 'logo' : ''}" ${club().logo ? `style="background-image:url(${club().logo})"` : ''}>${club().logo ? '' : club().short}</span>`
    : M[id].photo
      ? `<span class="av ${c}${frc(id)}" style="background-image:url(${M[id].photo})"></span>`
      : `<span class="av ${c}${frc(id)}" style="--h:${hue(id)}">${ini(id)}</span>`;
/* Jamais d'âge affiché : une catégorie à la place (U12, Senior, +45…) */
const catOf = id => {
  const a = age(id);
  if (a < 18) return 'U' + (Math.floor(a / 2) * 2 + 2);
  if (a < 35) return 'Senior';
  return '+' + (a >= 75 ? 75 : a >= 65 ? 65 : a >= 55 ? 55 : a >= 45 ? 45 : 35);
};
const seesMinors = () => isAdmin() || S.role === 'coach';
/* Les résultats d'un jeune ne sont visibles que de lui, de son groupe, de ses parents et des encadrants */
const kidOk = k =>
  ME() === k ||
  seesMinors() ||
  (M[ME()].kids || []).includes(k) ||
  GROUPS.some(g => g.type === 'train' && g.mem.includes(k) && g.mem.includes(ME()));
const RC = { Club: 'club', Enseignante: 'coach', Enseignant: 'coach', Président: 'pres', Capitaine: 'cap' };
/* Un seul classement par personne, choisi selon le sport de l'écran */
const rk = (id, sport) => {
  const m = M[id],
    tn = m.r && m.r !== 'NC' ? m.r + ' Tennis' : '',
    pd = m.pl ? 'Niv ' + m.pl + ' Padel' : '';
  return sport === 'Padel' ? pd || tn : tn || pd;
};
function bd(id, sport) {
  if (id === 'club') return '<span class="bds"><span class="bd club">Club</span></span>';
  const m = M[id],
    r = rk(id, sport);
  return `<span class="bds">${m.role ? `<span class="bd ${RC[m.role] || ''}">${m.role}</span>` : ''}${r ? `<span class="bd rk">${r}</span>` : ''}</span>`;
}
const who = id =>
  id === 'club' || id === ME()
    ? `<span class="nm">${name(id)}</span>`
    : `<button class="nm" data-a="member" data-id="${id}">${name(id)}</button>`;
const view = () => (S.stack.length ? S.stack[S.stack.length - 1] : { v: S.tab });
const segs = (k, tabs) =>
  `<div class="seg" role="tablist">${tabs.map(t => `<button role="tab" aria-selected="${S[k] === t[0]}" data-a="seg" data-k="${k}" data-val="${t[0]}">${t[2] ? ic(t[2]) : ''}${t[1]}</button>`).join('')}</div>`;
const sportTag = s => (s ? `<span class="tag ${s === 'Padel' ? 'padel' : 'tennis'}">${s}</span>` : '');
function teamTags(tid) {
  const g = grp(tid),
    c = champOf(g);
  if (!c) return '';
  return (
    sportTag(c.sport) +
    `<span class="tag ${g.gen === 'Femmes' ? 'f' : ''}">${g.gen}</span><span class="tag">${c.age}</span>`
  );
}
const stPill = r =>
  r.st === 'live'
    ? '<span class="live"><i></i>En direct</span>'
    : r.st === 'done'
      ? '<span class="bd">Terminé</span>'
      : '<span class="bd">À venir</span>';
const empty = (icn, t, s) =>
  `<div class="empty">${ic(icn)}<span class="nm" style="color:var(--fg)">${t}</span><span class="small">${s || ''}</span></div>`;
const gallery = ph =>
  ph && ph.length
    ? `<div class="gal ${ph.length === 1 ? 'one' : ''}">${ph.map((u, i) => `<button class="ph" style="background-image:url(${u})" data-a="photo" aria-label="Photo ${i + 1} sur ${ph.length}"></button>`).join('')}</div>`
    : '';

function recCard(r) {
  const g = grp(r.tid),
    s = teamScore(r);
  return `<button class="rec" data-a="open" data-v="rec" data-id="${r.id}"><span class="row" style="justify-content:space-between"><span class="tags">${teamTags(r.tid)}</span>${stPill(r)}</span>
 <span class="vs"><span class="t">${teamName(g)}<br><span class="muted small" style="font-weight:500">${club().name}</span></span><span class="n" data-live2="${r.id}">${r.st === 'soon' ? '–' : `<b>${s[0]}</b> · ${s[1]}`}</span><span class="t">${r.opp}</span></span>
 <span class="muted small">${r.comp} · ${r.when}</span></button>`;
}

