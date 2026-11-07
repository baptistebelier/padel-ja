/* /RAM Club — app/21-equipes.js : championnats par équipes (gérés dans /RAM JA, page « Équipes »).
   - fiche de l'équipe : format des rencontres, règlement, titulaires et remplaçants
   - profil de chaque adhérent : ses rencontres jouées, victoires et défaites, en simple et en double,
     à domicile et à l'extérieur (rencontres de la saison et des saisons archivées présentes dans l'appli) */
const recDomicile = r => (r.dom != null ? !!r.dom : /domicile/i.test(r.when || ''));
const dansMatch = (m, id) => (Array.isArray(m.a) ? m.a.includes(id) : m.a === id);
/* les matchs joués par un adhérent dans les rencontres terminées */
function statsEquipe(id) {
  const z = () => ({ j: 0, v: 0, d: 0 }),
    s = { dom: z(), ext: z(), simple: z(), double: z(), tot: z(), rencontres: 0 };
  recs.forEach(r => {
    let joue = false;
    (r.ms || []).forEach(m => {
      if (m.st !== 'done' || !dansMatch(m, id)) return;
      joue = true;
      const ok = m.w === 0;
      [
        s.tot,
        recDomicile(r) ? s.dom : s.ext,
        Array.isArray(m.a) || /double/i.test(m.l || '') ? s.double : s.simple
      ].forEach(x => {
        x.j++;
        ok ? x.v++ : x.d++;
      });
    });
    if (joue) s.rencontres++;
  });
  return s;
}
function equipeStats(id) {
  const s = statsEquipe(id);
  if (!s.tot.j) return '';
  const pc = x => (x.j ? Math.round((x.v / x.j) * 100) + ' %' : '—'),
    ligne = (l, x) =>
      `<tr><th scope="row">${l}</th><td>${x.j}</td><td>${x.v}</td><td>${x.d}</td><td>${pc(x)}</td></tr>`;
  return `<div class="card eq-st"><span class="kicker">Rencontres par équipes · ${s.rencontres} rencontre${s.rencontres > 1 ? 's' : ''}</span><table><thead><tr><th></th><th scope="col">Matchs</th><th scope="col">Gagnés</th><th scope="col">Perdus</th><th scope="col">Réussite</th></tr></thead><tbody>${ligne('À domicile', s.dom)}${ligne('À l’extérieur', s.ext)}${s.simple.j && s.double.j ? ligne('En simple', s.simple) + ligne('En double', s.double) : ''}${ligne('Total', s.tot)}</tbody></table></div>`;
}
/* fiche de l'équipe : format et règlement du championnat, rôle de chaque joueur */
function equipeInfos(g) {
  const c = champOf(g) || {},
    f = c.fmt || {},
    fmt = [f.s ? f.s + ' simple' + (f.s > 1 ? 's' : '') : '', f.d ? f.d + ' double' + (f.d > 1 ? 's' : '') : '']
      .filter(Boolean)
      .join(' et ');
  const pts = f.pv != null ? `Victoire ${f.pv} pts · nul ${f.pn} · défaite ${f.pd}` : '';
  if (!fmt && !f.match && !c.regle && !pts) return '';
  return `<div class="card"><span class="kicker">Format et règlement</span>${fmt ? `<p><b>Par rencontre :</b> ${fmt}${f.match ? ' · ' + esc(f.match) : ''}</p>` : ''}${pts ? `<p class="muted small">${pts}</p>` : ''}${c.regle ? `<details class="eq-regle"><summary>Lire le règlement</summary><p>${esc(c.regle).replace(/\n/g, '<br>')}</p></details>` : ''}</div>`;
}
const roleEquipe = (g, k) =>
  (g.roster || {})[k] === 'R'
    ? '<span class="bd">Remplaçant</span>'
    : g.roster && g.roster[k] === 'T'
      ? '<span class="bd">Titulaire</span>'
      : '';
