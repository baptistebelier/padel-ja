/* /RAM Club — ui/2-publications.js : Publications du mur : visibilité, événements, tournois, partenaires, messages.
   Morceau de l'ancien ui.js : les fichiers ui/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
/* ---------- publications ---------- */
function postSport(p) {
  if (p.sport) return p.sport;
  if (p.play) return p.play.sport;
  if (p.rec) {
    const r = recs.find(r => r.id === p.rec);
    return r ? recSport(r) : '';
  }
  if (p.art) {
    const a = arts.find(a => a.id === p.art);
    return (a && a.sport) || '';
  }
  return '';
}
/* Règles de visibilité : appliquées à tous sauf au bureau, qui voit tout */
function ruleOk(rule) {
  if (!rule || isAdmin()) return true;
  const v = M[ME()],
    a = age(ME());
  if (rule.pub === 'Bureau uniquement') return false;
  if (rule.pub === 'Équipe pédagogique' && !(v.role || '').startsWith('Enseignant')) return false;
  if (rule.pub === 'Parents' && !(v.kids && v.kids.length)) return false;
  if ((rule.gen === 'Hommes' && v.g !== 'H') || (rule.gen === 'Femmes' && v.g !== 'F')) return false;
  if ((rule.age === 'Jeunes' && a >= 18) || (rule.age === 'Adultes' && a < 18)) return false;
  if ((rule.prat === 'Compétiteurs' && v.r === 'NC') || (rule.prat === 'Loisir' && v.r !== 'NC')) return false;
  if (rule.tn || rule.pd) {
    const t = rule.tn && rIdx(v.r) >= rule.tn[0] && rIdx(v.r) <= rule.tn[1],
      p = rule.pd && v.pl != null && v.pl >= rule.pd[0] && v.pl <= rule.pd[1];
    if (!t && !p) return false;
  }
  return true;
}
/* Publications d'un jeune : visibles de son groupe et de ses encadrants, ou de tout le club pour ses résultats si un parent l'a choisi */
function canSee(p) {
  if (p.arch || S.blocked.has(p.by) || !ruleOk(p.rule)) return false;
  if (isMinor(p.by) && !kidOk(p.by) && !((p.kind === 'perf' || p.kind === 'padel') && M[p.by].resVis === 'club'))
    return false;
  if (p.art) {
    const a = arts.find(a => a.id === p.art);
    if (!a || a.arch) return false;
  }
  if (p.rec) {
    const r = recs.find(r => r.id === p.rec);
    if (!r || r.arch) return false;
  }
  if (p.kind !== 'play' || p.by === ME()) return true;
  if (S.role === 'kid') return false;
  const y = p.play,
    v = M[ME()];
  if (y.sport === 'Padel') return v.pl != null && v.pl >= y.lo && v.pl <= y.hi;
  return rIdx(v.r) >= rIdx(y.lo) && rIdx(v.r) <= rIdx(y.hi);
}
const shortDate = p => {
  if (!p.d) return p.date;
  const a = p.d.split('-').map(Number),
    b = p.d2 && p.d2.split('-').map(Number);
  return b ? `${a[2]} ${MO[a[1] - 1]} → ${b[2]} ${MO[b[1] - 1]}` : `${a[2]} ${MO[a[1] - 1]}`;
};

function evBox(p) {
  const y = (p.yes || 0) + (p.my === 'yes' ? 1 : 0),
    m = (p.maybe || 0) + (p.my === 'maybe' ? 1 : 0),
    wl = (p.wl || 0) + (p.my === 'wait' ? 1 : 0),
    int = p.reg !== 'ext',
    past = p.done || p.arch,
    full = p.cap && y >= p.cap && p.my !== 'yes',
    meta = `<div class="meta"><span>${ic('clock')}${p.date}</span><span>${ic('pin')}${p.place}</span></div>`,
    cnt = int
      ? `<div class="cnts"><span><b>${y}${p.cap && !past ? '/' + p.cap : ''}</b>${past ? 'participant' : 'inscrit'}${y > 1 ? 's' : ''}</span>${past ? '' : `<span><b>${m}</b>peut-être</span>`}${wl && !past ? `<span><b>${wl}</b>en attente</span>` : ''}</div>`
      : '';
  if (past)
    return `<div class="ev">${meta}${cnt}${p.arch ? `<span class="muted small">Archivé · saison ${p.arch}</span>` : ''}</div>${p.done && p.done.txt ? `<p><b>Le mot du club.</b> ${p.done.txt}</p>` : ''}${p.done ? gallery(p.done.photos) : ''}`;
  const reg = !int
    ? `<a class="btn full" href="${p.tenup || 'https://tenup.fft.fr'}" target="_blank" rel="noopener">S'inscrire sur Ten'Up ${ic('link')}</a><span class="muted small">L'inscription se fait sur Ten'Up, le site de la FFT. Le lien s'ouvre en dehors de l'appli.</span>`
    : cnt +
      (p.closed
        ? `<span class="btn ext full" aria-disabled="true">Inscriptions closes</span>${p.my === 'yes' ? '<span class="muted small">Tu fais partie des inscrits.</span>' : ''}`
        : full
          ? `<div class="ctl"><button class="btn grow" disabled>Complet</button><button class="btn grow ${p.my === 'wait' ? 'on' : 'ghost'}" data-a="rsvp" data-id="${p.id}" data-r="wait">${p.my === 'wait' ? "Quitter l'attente" : "Liste d'attente"}</button></div>`
          : `<div class="ctl"><button class="btn grow ${p.my === 'yes' ? 'on' : ''}" data-a="rsvp" data-id="${p.id}" data-r="yes">${p.my === 'yes' ? 'Je me désinscris' : "Je m'inscris"}</button><button class="btn grow ${p.my === 'maybe' ? 'on' : 'ghost'}" data-a="rsvp" data-id="${p.id}" data-r="maybe" aria-pressed="${p.my === 'maybe'}">Peut-être</button></div>`);
  const vol =
    int && !p.comm
      ? `<div class="volu"><span class="grow small">${(p.vol || []).length ? `<b>${p.vol.length} bénévole${p.vol.length > 1 ? 's' : ''}</b> · ` : ''}Tu veux aider à l'organisation ?</span><button class="btn sm ${(p.vol || []).includes(ME()) ? 'on' : 'ghost'}" data-a="volu" data-id="${p.id}">${(p.vol || []).includes(ME()) ? 'Je suis bénévole' : "Je m'inscris comme bénévole"}</button></div>`
      : '';
  return `<div class="ev">${meta}${reg}${vol}${p.pay ? `<a class="btn ghost full" href="${p.pay}" target="_blank" rel="noopener">Payer en ligne ${ic('link')}</a>` : ''}<button class="btn sm ghost" data-a="ics" data-id="${p.id}">${ic('cal')}Ajouter à mon agenda</button></div>`;
}

/* Fiche d'un tournoi : tableau, catégorie, classements, limite de participants, fin des inscriptions */
const trnAge = t => (t.pub === 'Jeunes' ? `${t.a1} à ${t.a2} ans` : t.pub === 'Seniors +' ? t.vet : 'Seniors');
function trnBox(p) {
  const t = p.trn,
    pad = t.sport === 'Padel',
    row = (l, v) => `<div class="price"><span class="muted">${l}</span><b class="tv">${v}</b></div>`,
    past = t.dl && t.dl < TODAY;
  return `<div class="card" style="background:var(--card2);gap:8px"><div class="tags" style="display:flex">${sportTag(t.sport)}<span class="tag ${t.gen === 'Femmes' ? 'f' : ''}">${t.gen}</span><span class="tag">${trnAge(t)}</span>${pad ? `<span class="tag padel">${t.cat}</span>` : `<span class="tag">${t.fmt}</span><span class="tag">${t.open ? 'Open' : 'Limité'}</span>`}</div>
 <div>${row('Tableau', t.gen)}${row('Catégorie', trnAge(t))}${pad ? row('Catégorie de tournoi', t.cat) : row('Format', t.fmt === 'TMC' ? 'TMC (multi-chances)' : 'Traditionnel') + row('Classements', t.open ? 'Open, tous classements' : t.lo + ' à ' + t.hi)}${row('Participants', t.max ? t.max + ' ' + (pad ? 'paires' : 'joueurs') + ' maximum' : 'Sans limite')}${row('Fin des inscriptions', t.dl ? fmtD(t.dl) + (past ? ' · terminé' : '') : 'Non précisée')}</div></div>`;
}
function postBody(p) {
  const k = p.kind;
  if (k === 'teamfinal') return tfPost(p);
  if (k === 'annonce' || k === 'event' || k === 'cta') {
    const usePoster = p.img || k === 'event';
    return (
      (usePoster
        ? `<div class="poster ${p.img ? 'photo' : ''}" ${p.img ? `style="background-image:url(${p.img})" data-a="photo" role="button" tabindex="0" aria-label="Agrandir la photo"` : ''}>${p.done ? '<span class="bd done">Terminé</span>' : ''}<span class="kicker" style="color:var(--fg)">${k === 'event' ? (p.trn ? 'Tournoi · ' + p.trn.sport : 'Événement') : club().name}</span><span class="big">${p.title}</span>${k === 'event' ? `<span class="datepill">${ic('cal')}${shortDate(p)}</span>` : ''}</div>`
        : `<h2 class="tilt sm">${p.title}<i class="dd"></i></h2>`) +
      `<p>${p.body}</p>${k === 'event' ? (p.trn ? trnBox(p) : '') + evBox(p) : ''}${k === 'cta' ? `<a class="btn full" href="${p.url}" target="_blank" rel="noopener">${p.label} ${ic('link')}</a><span class="muted small">Ouvre ${p.url.replace(/^https?:\/\//, '').split('/')[0]} en dehors de l'appli.</span>` : ''}`
    );
  }
  if (k === 'comm') {
    const c = COMMS.find(c => c.id === p.comm),
      y = (p.yes || 0) + (p.my === 'yes' ? 1 : 0),
      m = (p.maybe || 0) + (p.my === 'maybe' ? 1 : 0);
    return `<div class="poster ${p.img ? 'photo' : ''}" ${p.img ? `style="background-image:url(${p.img})" data-a="photo" role="button" tabindex="0" aria-label="Agrandir la photo"` : ''}><span class="kicker" style="color:var(--fg)">Commission</span><span class="big">${p.title}</span></div><p>${p.body}</p><div class="cnts"><span><b>${y}</b>intéressé${y > 1 ? 's' : ''}</span><span><b>${m}</b>peut-être</span></div>
  <div class="ctl"><button class="btn grow ${p.my === 'yes' ? 'on' : ''}" data-a="rsvp" data-id="${p.id}" data-r="yes">${p.my === 'yes' ? 'Intéressé' : "Ça m'intéresse"}</button><button class="btn grow ${p.my === 'maybe' ? 'on' : 'ghost'}" data-a="rsvp" data-id="${p.id}" data-r="maybe">Peut-être</button></div>${c ? `<button class="btn sm ghost" data-a="open" data-v="comm" data-id="${c.id}">Voir la ${c.name.toLowerCase()}</button>` : ''}`;
  }
  if (k === 'padel') {
    const r = p.pres;
    return `<div class="perf"><span class="stamp ${r.place === '1er' ? '' : 'win'}">${r.place === '1er' ? 'Titre !' : r.place}</span><span class="kicker">Tournoi de padel · ${r.cat}${r.age ? ' · ' + r.age : r.pub !== 'Adultes' ? ' · ' + r.pub : ''}</span><span class="sc">${r.place === '1er' ? '1re' : r.place} place</span><span>${partnerTxt(r)} · ${r.club}, ${fmtD(r.d)}</span></div>`;
  }
  if (k === 'perf') {
    const r = p.res;
    return `<div class="perf ${r.w ? '' : 'lost'}"><span class="stamp ${r.perf ? '' : r.w ? 'win' : 'lose'}">${r.fin ? (r.w ? 'Titre !' : 'Finaliste') : r.perf ? 'Perf !' : r.w ? 'Victoire' : 'Défaite'}</span><span class="kicker">${esc(r.ctx)}</span><span class="sc">${esc(r.sc)}</span><span>${r.w ? 'Victoire' : 'Défaite'} contre <b>${esc(r.opp)}</b> <span class="bd rk">${esc(r.or)}</span></span></div>`;
  }
  if (k === 'play') {
    const y = p.play,
      inn = y.in.includes(ME()),
      full = y.in.length >= y.places,
      wt = y.wait.includes(ME());
    return (
      `<span class="kicker">Recherche de partie · ${y.sport}</span><h2 class="tilt sm">${y.fmt} <em>${y.sport === 'Padel' ? 'niveau ' + y.lo + ' à ' + y.hi : y.lo + ' à ' + y.hi}</em></h2><div class="ev"><div class="meta"><span>${ic('cal')}${y.date} · ${y.time}</span><span>${ic('clock')}${y.dur}</span></div>
  <div class="row"><span class="dots" aria-hidden="true">${Array.from({ length: y.places }, (_, i) => `<i class="${i < y.in.length ? 'on' : ''}"></i>`).join('')}</span><span>${y.in.length} place${y.in.length > 1 ? 's' : ''} prise${y.in.length > 1 ? 's' : ''} sur ${y.places}${y.wait.length ? ` · ${y.wait.length} en attente` : ''}</span></div>
  ${y.in.length ? `<div class="row" style="flex-wrap:wrap;gap:6px 12px">${y.in.map(i => `<span class="row" style="gap:6px">${av(i, 'sm')}${name(i)}</span>`).join('')}</div>` : ''}` +
      (p.by === ME()
        ? `<span class="muted small">Ta recherche reste en ligne jusqu'au créneau. Seuls les joueurs de cette fourchette la voient.</span>`
        : `<div class="ctl">${inn ? `<button class="btn on grow" data-a="play" data-id="${p.id}" data-r="in">Je ne peux plus</button>` : full ? `<button class="btn grow" disabled>Complet</button><button class="btn ${wt ? 'on' : 'ghost'} grow" data-a="play" data-id="${p.id}" data-r="wait" aria-pressed="${wt}">${wt ? "Quitter l'attente" : "Liste d'attente"}</button>` : `<button class="btn grow" data-a="play" data-id="${p.id}" data-r="in">Compte sur moi</button>`}</div>`) +
      `</div>`
    );
  }
  if (k === 'poll') {
    const tot = p.opts.reduce((a, o, i) => a + o[1] + (p.my === i ? 1 : 0), 0),
      closed = p.close && p.close < TODAY;
    return `<span class="kicker">Sondage${closed ? ' · clos' : p.close ? " · jusqu'au " + fmtD(p.close) : ''}</span><h2 class="h3">${p.q}</h2><div class="poll">${p.opts
      .map((o, i) => {
        const n = o[1] + (p.my === i ? 1 : 0),
          pc = tot ? Math.round((n * 100) / tot) : 0;
        return `<button class="opt" style="--p:${pc}%" ${closed ? 'disabled' : `data-a="vote" data-id="${p.id}" data-i="${i}"`} aria-pressed="${p.my === i}"><i></i><span>${o[0]}</span><span>${pc} %</span></button>`;
      })
      .join(
        ''
      )}</div><span class="muted small">${tot} vote${tot > 1 ? 's' : ''} · ${closed ? 'le sondage est clos' : p.my === null ? 'touche une réponse pour voter' : 'touche ta réponse pour la retirer'}</span>`;
  }
  if (k === 'match' || k === 'result') {
    const r = recs.find(r => r.id === p.rec),
      g = grp(r.tid),
      s = teamScore(r),
      w = s[0] > s[1],
      d = s[0] === s[1];
    return (
      (k === 'result'
        ? `<button class="rlink" data-a="open" data-v="rec" data-id="${r.id}"><span class="kicker">Résultat publié automatiquement</span><h2 class="tilt sm">${d ? 'Match nul' : w ? 'Victoire' : 'Défaite'} <em>${s[0]} à ${s[1]}</em><i class="dd"></i></h2><p>${teamName(g)} ${d ? 'partage les points avec' : w ? "s'impose contre" : "s'incline contre"} ${r.opp}. ${w ? 'Félicite les joueurs en commentaire.' : "Un mot d'encouragement en commentaire leur fera plaisir."}</p><span class="nm" style="color:var(--accent)">Voir le détail des matchs ${ic('back')}</span></button>`
        : `<p>${p.body}</p>`) +
      (r.img
        ? `<button class="ph wide" style="background-image:url(${r.img})" data-a="photo" aria-label="Photo d'équipe"></button>`
        : '') +
      recCard(r)
    );
  }
  if (k === 'journal') {
    const a = arts.find(a => a.id === p.art);
    return `<button class="teaser" data-a="open" data-v="art" data-id="${a.id}">${a.img ? `<span class="ph wide" style="background-image:url(${a.img})"></span>` : ''}<span class="kicker">Actus du club · ${a.cat}</span><span class="h3">${a.title}</span><span class="muted">${a.lead}</span><span class="nm" style="color:var(--accent)">Lire l'actu</span></button>`;
  }
  return '';
}
/* Bandeau partenaires : pas une publication, une frise colorée qui défile */
const plogo = (x, c) =>
  x.logo
    ? `<img class="${c || ''}" src="${x.logo}" alt="" style="${x.dark ? 'background:#0B0B0B;padding:4px' : ''}">`
    : `<span class="adl ${c || ''}">${x.name
        .split(' ')
        .filter(w => w.length > 2)
        .map(w => w[0])
        .join('')
        .slice(0, 2)}</span>`;
function adBand(p) {
  const ps = p.partners.map(id => PARTNERS.find(x => x.id === id)).filter(Boolean);
  if (!ps.length) return '';
  const items = ps
    .map(x => `<button class="adi" data-a="open" data-v="partners">${plogo(x)}<span>${x.name}</span></button>`)
    .join('');
  return `<section class="adband ${p.color === 'hot' ? 'hot' : ''}" aria-label="${esc(p.title)}"><div class="adh"><span>${p.title}</span>${isAdmin() ? `<button class="ib" data-a="pmenu" data-id="${p.id}" aria-label="Options du bandeau">${ic('more')}</button>` : ''}</div><div class="adw"><div class="track">${items}${items.replace(/<button /g, '<button tabindex="-1" aria-hidden="true" ')}</div></div></section>`;
}
function commList() {
  const can = c => isBureau() || c.resp === ME();
  return `<div class="pad"><p class="muted">Les commissions font vivre le club. Touche une commission pour voir ses membres et demander à la rejoindre.</p>${COMMS.map(c => `<button class="card" data-a="open" data-v="comm" data-id="${c.id}" style="width:100%;text-align:left"><span class="row"><span class="tile">${ic('users')}</span><span class="grow"><span class="h3">${c.name}</span><br><span class="muted small">Responsable : ${name(c.resp)} · ${c.mem.length} membre${c.mem.length > 1 ? 's' : ''}</span></span>${can(c) && c.req.length ? `<span class="un" style="background:var(--hot);color:var(--on-hot)">${c.req.length}</span>` : ''}</span><span class="muted small">${c.desc}</span></button>`).join('')}${isBureau() ? `<button class="btn full ghost" data-a="newPost" data-k="comm">Créer une commission</button>` : ''}</div>`;
}
function postHTML(p) {
  if (p.kind === 'ad') return adBand(p);
  const liked = S.liked.has(p.id),
    sp = postSport(p);
  return `<article class="post">${sp ? `<span class="sp ${sp === 'Padel' ? 'padel' : ''}">${sp}</span>` : ''}<div class="hd">${av(p.by)}<div class="grow"><div class="row" style="gap:6px;flex-wrap:wrap">${who(p.by)}${bd(p.by, sp)}</div><div class="muted small">${p.pin ? '<span class="bd pin">Épinglé</span> ' : ''}${p.t}</div></div><button class="ib" data-a="pmenu" data-id="${p.id}" aria-label="Options de la publication">${ic('more')}</button></div>
 ${isAdmin() && p.vis && p.vis.length ? `<div class="vis">${ic('eye')}Visible par ${p.vis.map(v => `<span class="tag">${v}</span>`).join('')}</div>` : ''}${isMinor(p.by) ? `<div class="vis">${ic('shield')}Visible par son groupe, ses parents et les encadrants</div>` : ''}${postBody(p)}
 <div class="acts"><button class="act ${liked ? 'on' : ''} ${S.pop === p.id ? 'pop' : ''}" data-a="like" data-id="${p.id}" aria-pressed="${liked}" aria-label="J'aime">${ic('heart')}${p.likes + (liked ? 1 : 0)}</button><button class="act" data-a="comments" data-id="${p.id}" aria-label="Commentaires">${ic('com')}${p.com.length}</button></div></article>`;
}
/* Message : le texte est lu par les lecteurs d'écran ; un appui ouvre réactions, réponse, signalement */
/* Aide à l'appui long : affichée jusqu'à la première utilisation (mémorisée sur l'appareil) */
const lpHelp = () => {
  let seen = false;
  try {
    seen = localStorage.getItem('club-lp-help') === '1';
  } catch (e) {}
  return seen
    ? ''
    : '<p class="muted small lphelp" id="lp-help">Reste appuyé sur un message pour réagir, répondre ou le signaler.</p>';
};
/* Messages façon WhatsApp : une bulle carrée qui contient le nom, les badges, le message et l'heure ; seul l'avatar reste dehors.
   Quand la même personne enchaîne (le même jour), le nom n'apparaît qu'en haut de la série et l'avatar à côté du dernier message, dont la bulle a une pointe vers lui. Mes messages : à droite, sans avatar ni nom. */
const msgCont = (l, i) => {
  const m = l[i],
    p = l[i - 1];
  return !!m && !!p && p.by === m.by && !S.blocked.has(p.by) && !(m.at && p.at && dayOf(m.at) !== dayOf(p.at));
};
/* Séparateur de jour entre les messages : Aujourd'hui, Hier, Lundi, 14 oct */
const dayOf = at => {
  const d = new Date(at);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
function dayLbl(at) {
  const d = dayOf(at),
    t = new Date(),
    n = Math.round((new Date(dayOf(+t)) - new Date(d)) / 864e5);
  return n === 0 ? "Aujourd'hui" : n === 1 ? 'Hier' : n < 7 ? DAYS[new Date(at).getDay()] : fmtD(d);
}
const msgRow = (m, i, sport, ref, fresh) => {
  if (S.blocked.has(m.by)) return '';
  const l = msgList(ref) || [],
    p = l[i - 1],
    newDay = m.at && (!p || !p.at || dayOf(p.at) !== dayOf(m.at)),
    cont = !newDay && l[i] === m && msgCont(l, i),
    last = !(l[i] === m && msgCont(l, i + 1)),
    mine = m.by === ME(),
    pop = fresh || m._pop;
  delete m._pop;
  return `${newDay ? `<div class="daysep"><span>${dayLbl(m.at)}</span></div>` : ''}<div class="msg ${mine ? 'me' : ''} ${cont ? 'cont' : ''} ${last ? 'last' : ''} ${pop ? 'in' : ''}">${mine ? '' : last ? av(m.by, 'sm') : '<span class="avsp" aria-hidden="true"></span>'}<div class="grow"><div class="bubw"><div class="bub${last ? ' tail' : ''}" data-lp="mmenu" data-ref="${ref}" data-i="${i}">${mine || cont ? '' : `<div class="hd">${who(m.by)}${bd(m.by, sport)}</div>`}${m.rep ? `<span class="quote">${m.rep.by === 'club' ? club().short : first(m.rep.by)} : ${esc(m.rep.x).slice(0, 80)}</span>` : ''}${m.img ? `<button class="ph mph" style="background-image:url(${m.img})" data-a="photo" aria-label="Agrandir la photo"></button>` : ''}${m.x ? `<span class="tx">${esc(m.x)}</span>` : ''}<time>${m.t || ''}</time></div><button class="bmore" data-a="mmenu" data-ref="${ref}" data-i="${i}" aria-label="Options du message">${ic('more')}</button></div>${
    m.re && Object.keys(m.re).length
      ? `<div class="reacts">${Object.entries(m.re)
          .map(
            ([e, n]) =>
              `<button class="react ${m.my === e ? 'on' : ''}" data-a="react" data-ref="${ref}" data-i="${i}" data-e="${e}" aria-label="Réaction ${e}, ${n}">${e} ${n}</button>`
          )
          .join('')}</div>`
      : ''
  }</div></div>`;
};
const muteBtn = c =>
  `<button class="ib ${c.mute ? 'off' : ''}" data-a="mute" data-id="${c.id}" aria-pressed="${!!c.mute}" aria-label="${c.mute ? 'Réactiver les notifications de ' + c.name : 'Mettre ' + c.name + ' en sourdine'}">${ic(c.mute ? 'mute' : 'sound')}</button>`;
/* Un compte jeune ne voit que les annonces et les canaux de son groupe */
const chanOk = c => S.role !== 'kid' || c.id === 'annonces' || c.kid;

