/* /RAM Club — ui/5-club.js : Onglet Club : actus, archives, équipes, commissions.
   Morceau de l'ancien ui.js : les fichiers ui/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
/* ---------- club ---------- */
const artCard = a =>
  `<button class="art" data-a="open" data-v="art" data-id="${a.id}">${a.img ? `<span class="ph wide" style="background-image:url(${a.img})"></span>` : ''}<span class="row" style="gap:8px"><span class="kicker">${a.cat} · ${a.date}</span>${sportTag(a.sport)}</span><span class="h3">${a.title}</span><span class="muted">${a.lead}</span></button>`;
function archView() {
  const seasons = [...new Set([...arts, ...recs, ...posts].filter(x => x.arch).map(x => x.arch))].sort().reverse();
  if (!seasons.length)
    return `<div class="pad">${empty('folder', 'Aucune saison archivée', 'Les saisons clôturées se rangeront ici.')}</div>`;
  const s = seasons.includes(S.arch.s) ? S.arch.s : seasons[0],
    t = S.arch.t,
    AR = arts.filter(a => a.arch === s),
    R = recs.filter(r => r.arch === s),
    E = posts.filter(p => p.arch === s && p.kind === 'event'),
    no = empty('folder', 'Rien dans cette rubrique', 'Pour la saison ' + s + '.');
  let b = '';
  if (t === 'arts') b = AR.length ? AR.map(artCard).join('') : no;
  const TS = [...GROUPS, ...OLDG].filter(
    g => g.type === 'team' && ((g.hist || []).some(h => h.season === s) || R.some(r => r.tid === g.id))
  );
  if (t === 'recs')
    b = TS.length
      ? [...CHAMPS, ...OLDC.filter(c => !CHAMPS.includes(c))]
          .map(c => {
            const l = TS.filter(g => g.champ === c.id);
            return l.length
              ? `<span class="kicker">${c.name}</span>` +
                  l
                    .map(g => {
                      const h = (g.hist || []).find(x => x.season === s),
                        n = R.filter(r => r.tid === g.id).length;
                      return `<button class="item" data-a="open" data-v="teamarch" data-id="${g.id}|${s}"><span class="tile ${h && h.out === 'Montée' ? 'up' : ''}">${ic(h && h.out === 'Montée' ? 'trophy' : 'users')}</span><span class="grow"><span class="nm">${teamName(g)}</span><br><span class="muted small">${h ? finalHead(h) + ' · ' + finalPlace(h) : 'Résultat final non renseigné'} · ${n} rencontre${n > 1 ? 's' : ''}</span></span></button>`;
                    })
                    .join('')
              : '';
          })
          .join('')
      : no;
  if (t === 'evs')
    b = E.length
      ? E.map(p => {
          const [y, m, d] = (p.d || TODAY).split('-').map(Number);
          return `<button class="item" data-a="open" data-v="post" data-id="${p.id}"><span class="dblk"><b>${d}</b>${MO[m - 1]}</span><span class="grow"><span class="h3">${p.title}</span><br><span class="muted small">${p.date} · ${p.place}</span></span></button>`;
        }).join('')
      : no;
  return `<div class="pad"><div class="stack"><span class="kicker">Saison en cours : ${S.season}</span><div class="chips">${seasons.map(x => `<button class="chip" data-a="arch" data-k="s" data-val="${x}" aria-pressed="${x === s}">${x}</button>`).join('')}</div>
 <div class="chips">${[
   ['arts', 'Articles', AR.length],
   ['recs', 'Championnats', TS.length],
   ['evs', 'Événements', E.length]
 ]
   .map(
     x =>
       `<button class="chip" data-a="arch" data-k="t" data-val="${x[0]}" aria-pressed="${x[0] === t}">${x[1]} · ${x[2]}</button>`
   )
   .join('')}</div></div><div class="stack">${b}</div></div>`;
}
/* Équipes : un fil chronologique (en direct, à venir, résultats), mois par mois, filtrable par équipe ; les championnats à part */
function teamsBody() {
  const chip = (k, l) =>
    `<button class="chip" data-a="recTab" data-k="${k}" aria-pressed="${S.recTab === k}">${l}</button>`;
  if (S.recTab !== 'champ') S.recTab = 'now';
  const tabs = `<div class="chips">${chip('now', 'Fil des rencontres')}${chip('champ', 'Championnats')}</div>`;
  if (S.recTab === 'champ') {
    const c = CHAMPS.find(c => c.id === S.champ) || CHAMPS[0];
    if (!c)
      return `<div class="pad">${tabs}${empty('folder', 'Aucun championnat cette saison', isAdmin() ? 'Crée les championnats de la nouvelle saison, puis engage les équipes.' : 'Les équipes de la saison ne sont pas encore engagées.')}${isAdmin() ? '<button class="btn full ghost" data-a="newPost" data-k="champ">Créer un championnat</button>' : ''}</div>`;
    return `<div class="pad">${tabs}<div class="chips">${CHAMPS.map(x => `<button class="chip" data-a="champ" data-id="${x.id}" aria-pressed="${x.id === c.id}">${x.name}</button>`).join('')}</div>${champBody(c)}</div>`;
  }
  const teams = GROUPS.filter(g => g.type === 'team'),
    tf = teams.some(g => g.id === S.recTeam) ? S.recTeam : '';
  const tchips =
    teams.length > 1
      ? `<div class="chips">${['', ...teams.map(g => g.id)].map(id => `<button class="chip" data-a="recTeam" data-k="${id}" aria-pressed="${tf === id}">${id ? teamName(grp(id)) : 'Toutes les équipes'}</button>`).join('')}</div>`
      : '';
  const all = recs.filter(r => !r.arch && (!tf || r.tid === tf)),
    live = all.filter(r => r.st === 'live'),
    soon = all.filter(r => r.st !== 'done' && r.st !== 'live').sort((x, y) => x.d.localeCompare(y.d)),
    done = all.filter(r => r.st === 'done').sort((x, y) => y.d.localeCompare(x.d));
  const month = d => {
    const t = new Date(d + 'T12:00:00');
    return isNaN(t) ? '' : t.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  };
  const byMonth = l => {
    let cur = null,
      h = '';
    l.forEach(r => {
      const m = month(r.d);
      if (m !== cur) {
        cur = m;
        if (m) h += `<div class="tl-month">${m}</div>`;
      }
      h += recCard(r);
    });
    return h;
  };
  const sec = (t, i, body, cls) =>
    `<section class="tl-sec${cls ? ' ' + cls : ''}"><span class="kicker">${ic(i)}${t}</span>${body}</section>`;
  if (!all.length)
    return `<div class="pad">${tabs}${tchips}${empty('score', 'Aucune rencontre cette saison', 'Le calendrier se remplit depuis la page de chaque équipe.')}</div>`;
  return `<div class="pad">${tabs}${tchips}<div class="tl">${live.length ? sec('En direct', 'score', live.map(recCard).join(''), 'tl-live') : ''}${sec('À venir', 'cal', soon.length ? byMonth(soon) : '<p class="muted small">Aucune rencontre programmée.</p>')}${done.length ? sec('Résultats', 'trophy', byMonth(done)) : ''}</div></div>`;
}
function clubView() {
  const I2 = CLUBINFO,
    tl = [
      I2.mods.actus && ['actus', 'Actus', 'news'],
      ['teams', 'Équipes', 'users'],
      ['club', 'Le club', 'club'],
      I2.mods.comm && ['comm', 'Commissions', 'flag']
    ].filter(Boolean);
  if (!tl.some(x => x[0] === S.clubTab)) S.clubTab = tl[0][0];
  const tabs = segs('clubTab', tl),
    t = S.clubTab;
  if (t === 'teams') return tabs + teamsBody();
  if (t === 'comm') return tabs + commList();
  if (t === 'actus') {
    const l = arts.filter(a => !a.arch);
    return (
      tabs +
      `<div class="pad">${l.length ? l.map(artCard).join('') : empty('news', "Pas encore d'actu cette saison", 'Les actus du club apparaîtront ici.')}</div>`
    );
  }
  const lk = (u, l) =>
    u ? `<a class="btn ghost grow" href="${u}" target="_blank" rel="noopener">${l} ${ic('link')}</a>` : '';
  return (
    tabs +
    `<div class="pad"><div class="poster"><span class="kicker" style="color:var(--fg)">Tennis · Padel · saison ${S.season}</span><span class="big">${club().name.replace(' ', '<br>')}</span></div>
 <div class="stats"><div><b>${I2.courts}</b><span>Courts</span></div><div><b>${I2.pistes}</b><span>Pistes padel</span></div><div><b>${I2.members}</b><span>Adhérents</span></div><div><b>${GROUPS.filter(g => g.type === 'team').length}</b><span>Équipes</span></div></div>
 <div class="note">${I2.joined} adhérents sur ${I2.members} ont rejoint l'appli.${isAdmin() ? ` <button class="nm" data-a="open" data-v="join" style="color:var(--accent)">Inviter les autres</button>` : ''}</div>
 <div class="ctl">${S.role === 'kid' ? '' : `<button class="btn grow" data-a="open" data-v="list">${ic('users')}Les adhérents</button>`}<button class="btn ghost grow" data-a="open" data-v="partners">Partenaires</button></div>
 ${I2.book || I2.pay || I2.shop ? `<div class="ctl" style="flex-wrap:wrap">${lk(I2.book, 'Réserver un court')}${lk(I2.pay, 'Payer ma cotisation')}${lk(I2.shop, 'Boutique')}</div>` : ''}
 <div><h2 class="tilt sm">Formules <em>et tarifs</em><i class="dd"></i></h2><div class="card" style="margin-top:10px;gap:0">${FORM.map(f => `<div class="price"><span><span class="nm">${f[0]}</span><br><span class="muted small">${f[1]}</span></span><b>${f[2]}</b></div>`).join('')}</div></div>
 <button class="btn full" data-a="toast" data-msg="Demande envoyée au secrétariat du club">Demander une inscription</button>
 <div class="card" style="gap:0"><div class="price"><span class="nm">Club-house</span><span class="muted">${I2.house}</span></div><div class="price"><span class="nm">Secrétariat</span><span class="muted">${I2.secr}</span></div><div class="price"><span class="nm">Adresse</span><span class="muted">${I2.addr}</span></div></div>
 <div><span class="kicker">L'équipe du club</span>${(window.ramTeam ? ramTeam() : ['hugo', 'sarah', 'mehdi', 'marc']).map(p => `<div class="item">${av(p, 'sm')}<span class="grow">${who(p)} ${bd(p)}</span></div>`).join('')}</div>
 <button class="btn full ghost" data-a="open" data-v="archive">${ic('folder')}Archives des saisons</button></div>`
  );
}
function listView() {
  if (S.role === 'kid')
    return `<div class="pad">${empty('users', 'Liste réservée aux adultes', "Les comptes jeunes ne voient pas l'annuaire du club.")}</div>`;
  const L = S.list,
    q = L.q.trim().toLowerCase(),
    ids = Object.keys(M).filter(
      k =>
        k !== 'club' &&
        !S.blocked.has(k) &&
        (!isMinor(k) || seesMinors()) &&
        (L.f === 'all' || (L.f === 'tennis' ? M[k].r !== 'NC' : M[k].pad != null)) &&
        (!q || M[k].n.toLowerCase().includes(q))
    );
  const cmp = {
    tennis: (a, b) => rIdx(M[b].r) - rIdx(M[a].r),
    padel: (a, b) => (M[a].pad || 1e9) - (M[b].pad || 1e9),
    name: (a, b) => M[a].n.localeCompare(M[b].n)
  };
  if (!cmp[L.sort]) L.sort = 'tennis';
  ids.sort(cmp[L.sort]);
  const o = (v, l, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`,
    sp = L.sort === 'padel' || L.f === 'padel' ? 'Padel' : '';
  return `<div class="pad"><div class="fld"><label for="l-q">Rechercher un adhérent</label><input id="l-q" type="search" value="${esc(L.q)}" placeholder="Nom ou prénom" autocomplete="off"></div>
 <div class="two"><div class="fld"><label for="l-sort">Trier par</label><select id="l-sort">${o('tennis', 'Classement tennis', L.sort)}${o('padel', 'Classement padel', L.sort)}${o('name', 'Nom', L.sort)}</select></div><div class="fld"><label for="l-f">Pratique</label><select id="l-f">${o('all', 'Tennis et padel', L.f)}${o('tennis', 'Tennis', L.f)}${o('padel', 'Padel', L.f)}</select></div></div>
 ${seesMinors() ? '' : '<p class="muted small">Les jeunes du club n\'apparaissent pas dans cette liste.</p>'}
 <div id="l-res"><span class="kicker">${ids.length} adhérent${ids.length > 1 ? 's' : ''}</span>${ids.length ? ids.map(p => `<button class="item" data-a="member" data-id="${p}">${av(p, 'sm')}<span class="grow"><span class="nm">${M[p].n}</span> ${bd(p, sp)}<br><span class="muted small">${catOf(p)}${sp && M[p].pad ? ' · classement padel n° ' + M[p].pad : ''}</span></span></button>`).join('') : empty('search', 'Aucun adhérent trouvé', "Vérifie l'orthographe ou change le filtre.")}</div></div>`;
}

