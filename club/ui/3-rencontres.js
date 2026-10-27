/* /RAM Club — ui/3-rencontres.js : Rencontres par équipes et résultat final dans le championnat.
   Morceau de l'ancien ui.js : les fichiers ui/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
/* ---------- rencontre ---------- */
function recView(id) {
  const r = recs.find(r => r.id === id),
    g = grp(r.tid),
    sport = recSport(r),
    s = teamScore(r),
    live = r.st === 'live',
    can = canTeam(g),
    me = ME();
  let h = `<div class="pad"><div class="hero"><div class="row" style="justify-content:space-between"><span class="tags">${teamTags(r.tid)}</span>${stPill(r)}</div><span class="kicker">${r.comp}</span>
 <div class="vs"><span class="t"><span class="cl" style="vertical-align:-4px">${ic('home')}</span> ${teamName(g)}</span><span class="n">${r.st === 'soon' ? '–' : `<b>${s[0]}</b> · ${s[1]}`}</span><span class="t">${r.opp}</span></div><span class="muted small">${r.when}</span></div>`;
  if (r.img)
    h += `<button class="ph wide" style="background-image:url(${r.img})" data-a="photo" aria-label="Photo d'équipe"></button>`;
  if (r.ms) {
    h += `<div class="row" style="justify-content:space-between"><span class="legend"><span class="cl">${ic('home')}</span>Joueur de ${club().name}</span>${live && can ? `<button class="btn sm ${S.scoring ? 'on' : ''}" data-a="scoring">${S.scoring ? 'Quitter la saisie' : 'Saisir les scores'}</button>` : ''}</div>`;
    h += r.ms
      .map((m, i) => {
        const cur = m.sets.length - 1;
        const line = side => {
          const b2 = x => (x ? `<span class="bd rk">${x}</span>` : '');
          const pl =
            side === 0
              ? `<span class="cl">${ic('home')}</span>` +
                (m.a
                  ? `${who(m.a)}${b2(sport === 'Padel' && M[m.a].pl ? 'Niv ' + M[m.a].pl : M[m.a].r)}`
                  : `<span class="nm">${m.an}</span>${b2(m.ar)}`)
              : `<span class="cl none"></span><span class="o">${esc(m.b[0])}</span>${b2(m.b[1])}`;
          const cells = [0, 1, 2]
            .map(k => {
              const st = m.sets[k];
              if (!st) return '<span class="s e">–</span>';
              const w = st[side] > st[1 - side],
                isCur = m.st === 'live' && k === cur,
                fl = S.flash && S.flash[0] === i && S.flash[1] === side && S.flash[2] === k;
              return `<span class="s ${isCur ? 'cur' : w ? 'w' : ''} ${fl ? 'flash' : ''}">${st[side]}</span>`;
            })
            .join('');
          return `<div class="line ${side ? 'away' : ''}"><span class="who">${pl}</span>${cells}</div>`;
        };
        let ctl = '';
        if (live && S.scoring && m.st === 'live')
          ctl = `<div class="ctl"><button class="btn sm ghost" data-a="ungame" data-r="${r.id}" data-i="${i}" data-s="0" aria-label="Retirer un jeu à ${club().short}">−1</button><button class="btn sm grow" data-a="game" data-r="${r.id}" data-i="${i}" data-s="0">+1 ${club().short}</button><button class="btn sm ghost grow" data-a="game" data-r="${r.id}" data-i="${i}" data-s="1">+1 adversaire</button><button class="btn sm ghost" data-a="ungame" data-r="${r.id}" data-i="${i}" data-s="1" aria-label="Retirer un jeu à l'adversaire">−1</button></div>`;
        if (live && S.scoring && m.st === 'done')
          ctl = `<button class="btn sm ghost" data-a="ungame" data-r="${r.id}" data-i="${i}" data-s="${m.w}">Corriger : retirer le dernier jeu</button>`;
        if (live && S.scoring && m.st === 'soon')
          ctl = `<button class="btn sm ghost" data-a="start" data-r="${r.id}" data-i="${i}">Lancer le match</button>`;
        return `<div class="board"><div class="bh"><span class="kicker">${m.l}${m.court ? ' · ' + m.court : ''}</span>${m.st === 'live' ? '<span class="st no">● En jeu</span>' : m.st === 'done' ? '<span class="st ok">Terminé</span>' : '<span class="st wait">À suivre</span>'}</div>${line(0)}${line(1)}${ctl}</div>`;
      })
      .join('');
    if (live && S.scoring && r.ms.every(m => m.st === 'done'))
      h += `<button class="btn full" data-a="endrec" data-r="${r.id}">Clôturer la rencontre et publier le résultat</button>`;
    if (live)
      h += `<div class="note">${S.scoring ? "Chaque jeu ajouté s'affiche aussitôt chez tous les adhérents. Le bouton −1 corrige une erreur, même après la fin d'un set ou d'un match." : can ? 'Les scores se mettent à jour en direct. Tu peux les saisir depuis le bord du court.' : 'Les scores se mettent à jour en direct, saisis par le capitaine ou le club.'}</div>`;
  }
  if (live && r.chat)
    h += `<div><h2 class="tilt sm">Le <em>direct</em><i class="dd"></i></h2><p class="muted small" style="margin-top:6px">Discussion ouverte le temps de la rencontre. Elle s'efface au dernier point.</p></div><div class="chat" style="padding:0">${r.chat.length ? r.chat.map((m, i) => msgRow(m, i, sport, 'r:' + r.id, S.sent && i === r.chat.length - 1)).join('') : '<span class="muted small">Sois le premier à encourager l\'équipe.</span>'}${typingSlot('r:' + r.id)}</div>`;
  if (r.st === 'soon') {
    const L = r.lineup || (r.lineup = {}),
      C = r.conv || (r.conv = {}),
      cnt = x => g.mem.filter(p => L[p] === x).length,
      nT = cnt('T'),
      nR = cnt('R'),
      stt = { ok: ['ok', 'Dispo'], no: ['no', 'Pas dispo'], wait: ['wait', 'En attente'] };
    if (L[me])
      h += `<div class="card"><span class="kicker">Ta convocation</span><span class="h3">Tu es ${L[me] === 'T' ? 'titulaire' : 'remplaçant'}</span><div class="ctl"><button class="btn grow ${C[me] === 'ok' ? '' : 'ghost'}" data-a="conv" data-r="${r.id}" data-s="ok">Je suis dispo</button><button class="btn grow ${C[me] === 'no' ? 'hot' : 'ghost'}" data-a="conv" data-r="${r.id}" data-s="no">Pas dispo</button></div></div>`;
    h +=
      `<div><h2 class="tilt sm">La <em>compo</em><i class="dd"></i></h2><p class="muted small" style="margin-top:6px">${nT} titulaire${nT > 1 ? 's' : ''} · ${nR} remplaçant${nR > 1 ? 's' : ''}${can ? ". Touche Titulaire ou Remplaçant pour convoquer un joueur : il est prévenu et répond dans l'appli." : ''}</p></div><div>` +
      g.mem
        .filter(p => can || L[p])
        .map(p => {
          const z = stt[C[p] || 'wait'];
          return `<div class="item cv">${av(p, 'sm')}<span class="grow"><span class="nm">${name(p)}</span> <span class="bd rk">${sport === 'Padel' && M[p].pl ? 'Niv ' + M[p].pl : M[p].r}</span><br>${L[p] ? `<span class="st ${z[0]}">${L[p] === 'T' ? 'Titulaire' : 'Remplaçant'} · ${z[1]}</span>` : '<span class="st wait">Non convoqué</span>'}</span>${can ? `<span class="tri"><button class="btn sm grow ${L[p] === 'T' ? '' : 'ghost'}" data-a="lineup" data-r="${r.id}" data-id="${p}" data-s="T" aria-pressed="${L[p] === 'T'}">Titulaire</button><button class="btn sm grow ${L[p] === 'R' ? '' : 'ghost'}" data-a="lineup" data-r="${r.id}" data-id="${p}" data-s="R" aria-pressed="${L[p] === 'R'}">Remplaçant</button></span>` : ''}</div>`;
        })
        .join('') +
      `</div>`;
    if (!can && !g.mem.some(p => L[p]))
      h += empty('users', 'Compo pas encore publiée', 'Le capitaine la publiera avant la rencontre.');
    if (can) {
      const nw = g.mem.filter(p => L[p] && (C[p] || 'wait') === 'wait').length;
      h += `<div class="stack">${nw ? `<button class="btn full ghost" data-a="relance" data-r="${r.id}">Relancer ${nw} joueur${nw > 1 ? 's' : ''} sans réponse</button><p class="muted small">Une relance automatique part aussi la veille de la rencontre.</p>` : ''}<button class="btn full" data-a="startRec" data-r="${r.id}">Lancer la rencontre en direct</button><button class="btn full ghost" data-a="delRec" data-r="${r.id}">Supprimer la rencontre</button></div>`;
    }
  }
  if (r.st === 'done' && can)
    h += `<div class="fld"><label for="rec-ph">${r.img ? "Remplacer la photo d'équipe" : "Ajouter la photo d'équipe"}</label><input type="file" id="rec-ph" data-r="${r.id}" accept="image/*"><span class="muted small">Une seule photo par rencontre. Elle s'affiche aussi sur la publication du résultat.</span></div>`;
  if (r.ms && r.st === 'done')
    h += `<div class="note">La discussion du direct est fermée. Pour féliciter les joueurs, commente la publication du résultat sur le mur.</div>`;
  return h + '</div>';
}

function champBody(c, edit) {
  const ts = GROUPS.filter(g => g.champ === c.id);
  return `<div><span class="tags">${sportTag(c.sport)}<span class="tag">${c.age}</span></span><p class="muted small" style="margin-top:6px">${ts.length} équipe${ts.length > 1 ? 's' : ''} engagée${ts.length > 1 ? 's' : ''} · ${c.season}</p></div>
 <div>${
   ts.length
     ? ts
         .map(g => {
           const n = recs.filter(r => r.tid === g.id && !r.arch).length;
           return `<button class="item" data-a="open" data-v="team" data-id="${g.id}"><span class="tile">${ic('users')}</span><span class="grow"><span class="nm">${teamName(g)}</span><br><span class="muted small">${g.sub} · capitaine ${g.cap ? first(g.cap) : 'à désigner'} · ${n} rencontre${n > 1 ? 's' : ''}</span></span></button>`;
         })
         .join('')
     : empty('users', 'Aucune équipe engagée', edit ? 'Ajoute la première équipe de ce championnat.' : '')
 }</div>
 ${edit ? `<button class="btn full ghost" data-a="newPost" data-k="team" data-c="${c.id}">Ajouter une équipe</button>` : ''}`;
}
/* ---------- résultat final d'une équipe dans son championnat ---------- */
const STAGES = [
  'Vainqueur',
  'Finaliste',
  'Demi-finaliste',
  'Quart de finaliste',
  '8e de finaliste',
  '16e de finaliste'
];
const fem = p => (p === '1er' ? '1re' : p);
function finalPlace(f) {
  const a = [];
  if (f.fmt !== 'Tableau final') a.push(`${fem(f.pp)} de poule sur ${f.pn} équipes`);
  if (f.fmt !== 'Poule')
    a.push(
      f.tm === 'place'
        ? `${fem(f.tp)} place du tableau final`
        : f.ts === 'Vainqueur'
          ? 'Vainqueur du tableau final'
          : f.ts + ' au tableau final'
    );
  return a.join(' · ');
}
const finalHead = f =>
  f.out === 'Montée'
    ? `Bravo, l'équipe monte en ${f.div || 'division supérieure'} !`
    : f.out === 'Descente'
      ? `L'équipe descend en ${f.div || 'division inférieure'}`
      : `L'équipe se maintient en ${f.from}`;
const finalCard = f =>
  f
    ? `<div class="card fin ${f.out === 'Montée' ? 'up' : f.out === 'Descente' ? 'down' : ''}"><span class="kicker">Résultat final · saison ${f.season}</span><span class="h3" style="display:block">${finalHead(f)}</span><span class="muted small">${finalPlace(f)}</span>${f.txt ? `<p>${esc(f.txt)}</p>` : ''}</div>`
    : '';
function tfPost(p) {
  const g = grp(p.tid),
    f = p.final;
  return `<div class="poster ${f.out === 'Montée' ? 'up' : ''}"><span class="kicker" style="color:var(--fg)">Fin de championnat · ${teamName(g)}</span><span class="big">${f.out === 'Montée' ? 'Montée !' : f.out === 'Descente' ? 'Descente' : 'Maintien'}</span></div><h2 class="h3">${finalHead(f)}</h2><p class="muted small">${f.champ} · ${finalPlace(f)}</p>${f.txt ? `<p>${esc(f.txt)}</p>` : ''}<button class="btn full ghost" data-a="open" data-v="team" data-id="${g.id}">Voir la saison de l'équipe</button>`;
}
function teamArch(key) {
  const [id, s] = key.split('|'),
    g = grp(id),
    h = (g.hist || []).find(x => x.season === s),
    R = recs.filter(r => r.arch === s && r.tid === id);
  return `<div class="pad"><p class="muted small">${champOf(g).name} · saison ${s}</p>${h ? finalCard(h) : '<div class="note">Le résultat final de cette saison n\'a pas été renseigné.</div>'}<div class="stack"><span class="kicker">Rencontres de la saison · ${R.length}</span>${R.length ? R.map(recCard).join('') : empty('cal', 'Aucune rencontre archivée', '')}</div></div>`;
}
function teamView(id) {
  const g = grp(id),
    c = champOf(g),
    cal = recs.filter(r => r.tid === id && !r.arch),
    can = canTeam(g);
  return `<div class="pad"><div><div class="tags" style="display:flex">${teamTags(id)}</div><p class="muted small" style="margin-top:8px">${c.name} · ${g.sub}</p></div>${finalCard(g.final)}
 <div class="stack"><span class="kicker">Calendrier</span>${cal.length ? cal.map(recCard).join('') : empty('cal', 'Aucune rencontre programmée', can ? 'Ajoute la première ci-dessous.' : '')}${g.final ? '<p class="muted small">Championnat clôturé : plus aucune rencontre ne peut être ajoutée.</p>' : ''}</div>
 <div><span class="kicker">Effectif · ${g.mem.length}</span>${g.mem.map(p => `<div class="item">${av(p, 'sm')}<span class="grow">${who(p)} ${bd(p, c.sport)}</span>${p === g.cap && M[p].role !== 'Capitaine' ? '<span class="bd cap">Capitaine</span>' : ''}</div>`).join('') || empty('users', 'Effectif vide', '')}</div>
 ${can ? `<div class="card"><span class="kicker">Gérer l'équipe</span><div class="fld"><label for="cap-sel">Capitaine</label><select id="cap-sel" data-team="${id}">${g.mem.map(p => `<option value="${p}" ${p === g.cap ? 'selected' : ''}>${name(p)}</option>`).join('')}</select></div><div class="ctl">${g.final ? '' : '<button class="btn sm grow" data-a="newPost" data-k="fixture" data-c="' + id + '">Ajouter une rencontre</button>'}<button class="btn sm ghost grow" data-a="open" data-v="grp" data-id="${id}">Gérer l'effectif</button></div><button class="btn sm full ${g.final ? 'ghost' : ''}" data-a="teamFinal" data-id="${id}">${g.final ? 'Modifier le résultat final' : 'Clôturer le championnat'}</button></div>` : ''}</div>`;
}
