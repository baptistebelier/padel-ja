/* /RAM Club — ui/13-suivi.js : suivi personnel des élèves, partagé avec /RAM Coach.
   L'enseignant (dans /RAM Coach) écrit à un élève : messages, bilans de séance, analyses vidéo, contenus.
   L'élève (ou son parent) les reçoit dans École, Mon espace, et répond une fois la conversation ouverte
   par l'enseignant : texte ou vidéo à analyser. Données : SUIVI (un élément par envoi) et SEANCES. */
Object.assign(I, {
  video: '<path d="M3 6h13v12H3zM16 10l5-3v10l-5-3"/>',
  doc: '<path d="M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h7"/>',
  spark:
    '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.500 2.500M15.500 15.500L18 18M6 18l2.500-2.500M15.500 8.500L18 6"/>'
});
const SV_KIND = {
  msg: ['chat', 'Message'],
  bilan: ['doc', 'Bilan de séance'],
  video: ['video', 'Vidéo'],
  contenu: ['spark', "Contenu de l'enseignant"]
};
/* moi et mes enfants : ceux dont je reçois le suivi */
const svMine = () => [ME()].concat((M[ME()] && M[ME()].kids) || []);
/* nom d'un élève : son profil du club, sinon sa fiche (élève pas encore inscrit dans l'appli) */
const svName = id => (M[id] ? M[id].n : (ELEVES.find(e => e.id === id) || {}).n || 'Élève');
const svFirst = id => svName(id).split(' ')[0];
/* /RAM Coach (plusieurs clubs) : mes clés dans chaque club comptent comme « moi », et un envoi part dans le club de l'élève */
let svMe = k => k,
  svFrom = to => ({ by: ME() });
const svOf = id => SUIVI.filter(x => x.to === id).sort((a, b) => (a.at || 0) - (b.at || 0));
const svTime = at => {
  if (!at) return '';
  const d = new Date(at);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};
const svDay = at => {
  const d = new Date(at);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
/* liste des messages d'une conversation, au format des bulles du club (gardée tant qu'elle ne change pas) */
const DMC = {};
function dmList(id) {
  const src = svOf(id),
    sig = src.map(x => x.id + (x.at || '')).join();
  if (DMC[id] && DMC[id].sig === sig) return DMC[id].l;
  const l = src.map(x => ({ by: svMe(x.by), x: x.txt || '', at: x.at, t: svTime(x.at), _id: x.id, k: x.k, sv: x }));
  DMC[id] = { sig, l };
  return l;
}
/* l'enseignant écrit toujours ; l'élève (ou son parent) répond une fois que l'enseignant lui a écrit */
const dmOpened = id => svOf(id).some(x => !svMine().includes(x.by));
/* mon propre suivi (ou celui de mon enfant) : je suis l'élève, même si j'encadre aussi au club */
const dmStudent = id => svMine().includes(id);
const dmCanWrite = id => (dmStudent(id) ? dmOpened(id) : isAdmin());
const dmPlaceholder = id => (dmStudent(id) ? "Répondre à l'enseignant" : 'Écrire à ' + svFirst(id));
/* enseignants qui suivent cet élève (ceux qui lui ont écrit) */
const dmCoaches = id => [
  ...new Set(
    svOf(id)
      .map(x => x.by)
      .filter(k => !svMine().includes(k) && M[k])
  )
];
/* non lus : ce que les autres ont envoyé depuis ma dernière visite de la conversation (mémorisé sur l'appareil) */
let SV_SEEN = {};
try {
  SV_SEEN = JSON.parse(localStorage.getItem('club-suivi-vu') || '{}') || {};
} catch (e) {}
const svUnread = id => svOf(id).filter(x => svMe(x.by) !== ME() && (x.at || 0) > (SV_SEEN[id] || 0)).length;
function svSeen(id) {
  const l = svOf(id);
  SV_SEEN[id] = Math.max(SV_SEEN[id] || 0, l.length ? l[l.length - 1].at || 0 : 0);
  try {
    localStorage.setItem('club-suivi-vu', JSON.stringify(SV_SEEN));
  } catch (e) {}
}
const sesOf = id => SEANCES.find(s => s.id === id);
const sesLbl = s => {
  const g = s && grp(s.g);
  return s ? fmtD(s.d) + (g ? ' · ' + g.name : '') : '';
};
const svLink = u => (u && /^https?:\/\//i.test(u) ? u : '');
/* carte d'un envoi qui n'est pas un simple message : bilan, vidéo, contenu */
function svCard(x, mine) {
  const [icn, lbl] = SV_KIND[x.k] || SV_KIND.msg,
    s = x.ses && sesOf(x.ses),
    u = svLink(x.url),
    title = x.k === 'video' ? (x.re ? 'Analyse vidéo' : mine ? 'Ta vidéo envoyée' : 'Vidéo de ' + svFirst(x.by)) : lbl;
  return `<div class="card svc ${mine ? 'me' : ''}"><div class="row" style="gap:10px;align-items:flex-start"><span class="tile">${ic(icn)}</span><div class="grow"><span class="kicker">${title}</span>${s ? `<span class="muted small">${sesLbl(s)}${s.theme ? ' · ' + esc(s.theme) : ''}</span>` : ''}${x.txt ? `<p>${esc(x.txt)}</p>` : ''}${s && s.recap && x.k === 'bilan' ? `<p class="muted small"><b>Pour le groupe :</b> ${esc(s.recap)}</p>` : ''}${u ? `<a class="btn sm ghost" href="${esc(u)}" target="_blank" rel="noopener">${ic('video')}Voir la vidéo</a>` : ''}<span class="muted small svd">${fmtD(svDay(x.at))} · ${svTime(x.at)}${mine || !M[x.by] ? '' : ' · ' + first(x.by)}</span>${x.k === 'video' && !x.re && !dmStudent(x.to) && !SUIVI.some(y => y.re === x.id) ? `<button class="btn sm" data-a="svReply" data-id="${x.id}">${ic('edit')}Répondre par une analyse</button>` : ''}</div></div></div>`;
}
/* conversation privée : messages en bulles, bilans, vidéos et contenus en cartes */
function dmView(id) {
  const l = dmList(id),
    ref = 'd:' + id,
    canVid = dmStudent(id) && dmCanWrite(id);
  svSeen(id);
  const rows = l.map((m, i) => (m.k === 'msg' || !m.k ? msgRow(m, i, '', ref) : svCard(m.sv, m.by === ME()))).join('');
  return `<div class="pad chat dm">${
    rows ||
    empty(
      'chat',
      dmStudent(id) ? 'Pas encore de message' : 'Aucun échange',
      dmStudent(id)
        ? "Ton enseignant t'écrira ici : messages, bilans de séance, analyses vidéo."
        : 'Écris à ' + svFirst(id) + ' : le message arrive dans /RAM Club, École, Mon espace.'
    )
  }${canVid ? `<button class="btn full ghost" data-a="svVideo" data-id="${id}">${ic('video')}Envoyer une vidéo à analyser</button>` : ''}</div>`;
}
/* École, Mon espace : tout ce que l'enseignant m'a envoyé (et à mes enfants), et l'historique des séances */
function persoBody() {
  const ids = svMine().filter(k => M[k]),
    withSv = ids.filter(k => svOf(k).length || SEANCES.some(s => s.pres && s.pres[k]));
  if (!withSv.length)
    return empty(
      'user',
      'Ton espace personnel',
      'Les messages de ton enseignant, tes bilans de séance et les analyses de tes vidéos arriveront ici.'
    );
  return withSv
    .map(k => {
      const l = svOf(k),
        un = svUnread(k),
        last = l[l.length - 1],
        bil = l.filter(x => x.k !== 'msg').reverse(),
        hist = SEANCES.filter(s => s.pres && s.pres[k] && s.d <= TODAY).sort((a, b) => b.d.localeCompare(a.d)),
        nP = hist.filter(s => s.pres[k] === 'P').length,
        who = k === ME() ? '' : `<span class="kicker">Suivi de ${first(k)}</span>`;
      return (
        who +
        `<button class="item" data-a="open" data-v="dm" data-id="${k}"><span class="tile">${ic('chat')}</span><span class="grow"><span class="nm">Messages de l'enseignant</span><br><span class="muted small">${last ? esc((last.by === ME() ? 'Moi : ' : '') + (last.txt || SV_KIND[last.k][1])).slice(0, 70) : 'Aucun message pour le moment'}</span></span>${un ? `<span class="cnt">${un}</span>` : ''}</button>` +
        (dmCanWrite(k)
          ? `<button class="btn full ghost" data-a="svVideo" data-id="${k}">${ic('video')}Envoyer une vidéo à analyser</button>`
          : '') +
        (bil.length
          ? `<span class="kicker">Bilans, vidéos et contenus</span>` +
            bil
              .slice(0, S.svAll === k ? 99 : 3)
              .map(x => svCard(x, x.by === ME()))
              .join('') +
            (bil.length > 3 && S.svAll !== k
              ? `<button class="btn sm ghost full" data-a="svAll" data-id="${k}">Voir tout (${bil.length})</button>`
              : '')
          : '') +
        (hist.length
          ? `<span class="kicker">Historique des séances · ${nP} présence${nP > 1 ? 's' : ''} sur ${hist.length}</span>` +
            hist
              .slice(0, 8)
              .map(s => {
                const st = s.pres[k],
                  g = grp(s.g);
                return `<div class="card"><div class="row" style="gap:10px;align-items:flex-start"><span class="dblk"><b>${+s.d.slice(8)}</b>${MO[+s.d.slice(5, 7) - 1]}</span><div class="grow"><span class="nm">${g ? g.name : 'Séance'}</span> <span class="tag" ${st === 'P' ? '' : 'style="background:var(--hot);color:#fff"'}>${st === 'P' ? 'Présent' : st === 'E' ? 'Excusé' : 'Absent'}</span>${s.theme ? `<br><span class="muted small">${esc(s.theme)}</span>` : ''}${s.recap ? `<p class="small">${esc(s.recap)}</p>` : ''}</div></div></div>`;
              })
              .join('')
          : '')
      );
    })
    .join('');
}
/* ---------- École, Enseignants : la fiche publique de chaque enseignant ----------
   Remplie par l'enseignant dans /RAM Coach (Profil, Ma fiche enseignant), rangée dans son profil du club
   (M[clé].pro) : diplôme, année de début, âge (s'il le montre), téléphone, e-mail, site, lien de réservation,
   tarifs, présentation. Les enseignants des groupes apparaissent aussi, même sans fiche remplie. */
const proOf = k => (M[k] && M[k].pro) || {};
function proKeys() {
  const ks = new Set(Object.keys(M).filter(k => k !== 'club' && M[k].pro && M[k].pro.on));
  GROUPS.forEach(g => g.type === 'train' && g.coach && M[g.coach] && ks.add(g.coach));
  if (window.RAM && RAM.live) Object.keys(RAM.roles || {}).forEach(k => RAM.roles[k] === 'coach' && M[k] && ks.add(k));
  return [...ks].sort((a, b) => !!proOf(b).on - !!proOf(a).on || name(a).localeCompare(name(b)));
}
const proLines = t =>
  String(t || '')
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean);
function proBody(k) {
  const p = proOf(k),
    gs = GROUPS.filter(g => g.type === 'train' && g.coach === k),
    yrs = p.since ? +TODAY.slice(0, 4) - +p.since : 0,
    row = (l, v) => (v ? `<div class="prow"><span class="muted">${l}</span><span>${v}</span></div>` : ''),
    web = svLink(toUrlP(p.web)),
    book = svLink(toUrlP(p.book)),
    tel = String(p.tel || '').replace(/[^+\d]/g, '');
  return `<div class="pbody">${p.bio ? `<p>${esc(p.bio)}</p>` : ''}${row('Diplôme', esc(p.dip || ''))}${row('Enseigne depuis', p.since ? esc(p.since) + (yrs > 0 ? ` (${yrs} an${yrs > 1 ? 's' : ''})` : '') : '')}${row('Âge', p.age && M[k].bd ? age(k) + ' ans' : '')}${row('Sports', esc(p.sports || [...new Set(gs.map(g => g.sport))].join(', ')))}${row('Groupes', gs.map(g => esc(g.name)).join(', '))}${row('Téléphone', p.tel ? `<a href="tel:${tel}">${esc(p.tel)}</a>` : '')}${row('E-mail', p.mail ? `<a href="mailto:${esc(p.mail)}">${esc(p.mail)}</a>` : '')}${row('Site internet', web ? `<a href="${esc(web)}" target="_blank" rel="noopener">${esc(String(p.web).replace(/^https?:\/\//, ''))}</a>` : '')}${
    proLines(p.tarifs).length
      ? `<span class="kicker">Tarifs</span><ul class="ptar">${proLines(p.tarifs)
          .map(x => `<li>${esc(x)}</li>`)
          .join('')}</ul>`
      : ''
  }<div class="ctl" style="flex-wrap:wrap">${book ? `<a class="btn grow" href="${esc(book)}" target="_blank" rel="noopener">${ic('cal')}Réserver une séance</a>` : ''}${tel ? `<a class="btn grow ghost" href="tel:${tel}">${ic('phone')}Appeler</a>` : ''}${p.mail ? `<a class="btn grow ghost" href="mailto:${esc(p.mail)}">${ic('mail')}Écrire</a>` : ''}${k !== ME() ? `<button class="btn grow ghost" data-a="member" data-id="${k}">${ic('user')}Profil</button>` : ''}</div></div>`;
}
const toUrlP = u => (u ? (/^https?:\/\//i.test(u) ? u : 'https://' + u) : '');
/* une ligne par enseignant, qui s'ouvre comme un menu déroulant */
function profCard(k, open) {
  const p = proOf(k),
    gs = GROUPS.filter(g => g.type === 'train' && g.coach === k);
  return `<details class="card prof"${open ? ' open' : ''}><summary>${av(k, 'sm')}<span class="grow"><span class="nm">${esc(name(k))}</span><br><span class="muted small">${esc(p.dip || (gs.length ? gs.length + ' groupe' + (gs.length > 1 ? 's' : '') : 'Enseignant'))}${p.since ? ' · depuis ' + esc(p.since) : ''}</span></span><span class="chev" aria-hidden="true">${ic('back')}</span></summary>${proBody(k)}</details>`;
}
function profsBody() {
  const ks = proKeys();
  return ks.length
    ? `<p class="muted small">L'équipe pédagogique du club. Touche un enseignant pour voir ses coordonnées, ses tarifs et réserver une séance.</p>` +
        ks.map(k => profCard(k)).join('')
    : empty('school', 'Aucun enseignant', 'Les enseignants du club apparaîtront ici avec leur fiche.');
}
