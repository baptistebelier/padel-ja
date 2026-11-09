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
/* bilans de fin de cycle (c.bilan, écrits dans /RAM Coach) des groupes de l'élève, comme les bilans de séance */
function cycBilans(k) {
  const l = GROUPS.filter(g => g.type === 'train' && [...(g.mem || []), ...(g.ext || [])].includes(k)).flatMap(g =>
    (g.cycles || []).filter(c => c.bilan).map(c => ({ g, c }))
  );
  return l.length
    ? `<span class="kicker">Bilans de fin de cycle</span>` +
        l
          .map(
            ({ g, c }) =>
              `<div class="card svc"><div class="row" style="gap:10px;align-items:flex-start"><span class="tile">${ic('doc')}</span><div class="grow"><span class="kicker">${esc(g.name)} · ${esc(c.nom || 'Cycle')}</span>${c.theme ? `<span class="muted small">${esc(c.theme)}</span>` : ''}<p>${esc(c.bilan)}</p></div></div></div>`
          )
          .join('')
    : '';
}
/* École, Mon espace : tout ce que l'enseignant m'a envoyé (et à mes enfants), et l'historique des séances */
function persoBody() {
  const ids = svMine().filter(k => M[k]),
    withSv = ids.filter(k => svOf(k).length || SEANCES.some(s => s.pres && s.pres[k]) || cycBilans(k));
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
        cycBilans(k) +
        (hist.length
          ? `<span class="kicker">Historique des séances · ${nP} présence${nP > 1 ? 's' : ''} sur ${hist.length}</span>` +
            evDays(
              hist.slice(0, 8),
              s => s.d,
              s => {
                const st = s.pres[k],
                  g = grp(s.g);
                return evCard({
                  cat: 'ens',
                  fixe: true,
                  t: g ? g.h : '',
                  title: g ? g.name : 'Séance',
                  lines: [s.theme && ['ladder', esc(s.theme)], s.recap && ['doc', esc(s.recap)]],
                  tags: st === 'P' ? evTag('Présent') : evCx(st === 'E' ? 'Excusé' : 'Absent')
                });
              }
            )
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
    gs = GROUPS.filter(g => g.type === 'train' && g.coach === k && !g.once && !(g.to && g.to < TODAY)),
    off = proOffers(k),
    yrs = p.since ? +TODAY.slice(0, 4) - +p.since : 0,
    tile = (i, v, l) => (v ? `<div class="ptile">${ic(i)}<b>${v}</b><span>${l}</span></div>` : ''),
    web = svLink(toUrlP(p.web)),
    tel = String(p.tel || '').replace(/[^+\d]/g, ''),
    bouton = (cl, href, i, t, v, ext) =>
      `<a class="pbtn ${cl}" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}><span class="pbi">${ic(i)}</span><span class="pbt"><b>${t}</b><span class="small">${esc(v)}</span></span></a>`,
    contacts = [
      tel ? bouton('pb-tel', 'tel:' + tel, 'phone', 'Appeler', p.tel) : '',
      p.mail ? bouton('pb-mail', 'mailto:' + p.mail, 'mail', 'Écrire un mail', p.mail) : '',
      web
        ? bouton(
            'pb-web',
            web,
            'globe',
            'Site internet',
            String(p.web)
              .replace(/^https?:\/\//, '')
              .replace(/\/$/, ''),
            1
          )
        : ''
    ].join(''),
    tarifs =
      off && off.formules.length
        ? proOffersHtml(off)
        : proLines(p.tarifs).length
          ? `<ul class="ptar">${proLines(p.tarifs)
              .map(x => `<li>${esc(x)}</li>`)
              .join('')}</ul>`
          : '';
  return `<div class="pbody">${p.bio ? `<p>${esc(p.bio)}</p>` : ''}<div class="ptiles">${tile('diploma', esc(p.dip || ''), 'Diplôme')}${tile('cal', p.since ? (yrs > 0 ? yrs + ' an' + (yrs > 1 ? 's' : '') : esc(p.since)) : '', p.since ? 'Enseigne depuis ' + esc(p.since) : '')}${tile('ball', esc(p.sports || [...new Set(gs.map(g => g.sport))].join(', ')), 'Sports')}${tile('user', p.age && M[k].bd ? age(k) + ' ans' : '', 'Âge')}</div>${contacts ? `<div class="pbtns">${contacts}</div>` : ''}${gs.length ? `<button class="item" data-a="proGroups" data-id="${k}"><span class="tile">${ic('users')}</span><span class="grow"><span class="nm">Ses groupes</span><br><span class="muted small">${gs.length} groupe${gs.length > 1 ? 's' : ''}</span></span></button>` : ''}${
    tarifs
      ? `<details class="ptarifs"><summary><span class="tile">${ic('euro')}</span><span class="grow nm">Tarifs</span><span class="chev" aria-hidden="true">${ic('back')}</span></summary>${tarifs}</details>`
      : ''
  }${k !== ME() ? `<div class="ctl"><button class="btn grow ghost" data-a="member" data-id="${k}">${ic('user')}Profil</button></div>` : ''}</div>`;
}
/* le raccourci en haut de la carte, même repliée : la réservation de l'appli dès que l'enseignant a des disponibilités ;
   sinon son outil (Calendly…), pour qu'on puisse toujours réserver */
function proBook(k) {
  if (k === ME()) return '';
  const off = proOffers(k),
    book = svLink(toUrlP(proOf(k).book));
  if (off && off.resa)
    return `<button type="button" class="btn sm pres" data-a="open" data-v="resa" data-id="${k}" aria-label="Réserver un cours avec ${esc(name(k))}">${ic('cal')}Réserver</button>`;
  return book
    ? `<a class="btn sm pres" href="${esc(book)}" target="_blank" rel="noopener" aria-label="${proBookTxt(book)}">${ic('cal')}Réserver</a>`
    : '';
}
/* le lien de son outil de réservation (Calendly, Google…) : tant que la réservation de l'appli n'est pas ouverte */
const proBookTxt = u =>
  /calendly\.com/i.test(u)
    ? 'Réserver sur Calendly'
    : /google\./i.test(u)
      ? 'Réserver sur Google'
      : 'Réserver une séance';
/* formules et tarifs d'un enseignant (rangés sur son compte /RAM), lus une fois par enseignant */
const PRO_OFF = {};
function proOffers(k) {
  if (!(window.RAM && RAM.live)) return typeof OFFRES !== 'undefined' && k === ME() ? OFFRES : null;
  if (!(k in PRO_OFF)) {
    PRO_OFF[k] = null;
    fetch('/api/coach/formules/public?c=' + encodeURIComponent(RAM.club) + '&k=' + encodeURIComponent(k), {
      credentials: 'include'
    })
      .then(r => r.json())
      .then(d => {
        PRO_OFF[k] = d.formules;
        if (d.formules && d.formules.formules.length) render(true);
      })
      .catch(() => {});
  }
  return PRO_OFF[k];
}
/* la période d'un abonnement et son engagement, en bon français (« tous les 6 mois », « engagement 12 mois ») */
const abPer = a =>
  ({ mois: 'par mois', trimestre: 'par trimestre', '6 mois': 'tous les 6 mois', an: 'par an' })[a.periode] ||
  'par ' + a.periode;
function abEng(a) {
  const n = +a.duree || 1,
    m = { mois: 1, trimestre: 3, '6 mois': 6 }[a.periode];
  if (n <= 1) return '';
  return m ? `engagement ${n * m} mois` : `engagement ${n} ${a.periode === 'an' ? 'ans' : a.periode}`;
}
function proOffersHtml(o) {
  const e = n => (Math.round(n * 100) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' €',
    mn = n => (n % 60 ? (n >= 60 ? Math.floor(n / 60) + ' h ' + (n % 60) : n + ' min') : n / 60 + ' h'),
    kind = f => (f.joueurs === 1 ? 'individuel' : f.joueurs === 2 ? 'duo' : 'collectif à ' + f.joueurs),
    line = (t, p, sub) =>
      `<li><span class="ptl"><b>${t}</b><span class="ptp">${p}</span></span>${sub ? `<span class="muted small">${sub}</span>` : ''}</li>`,
    // vendu sur la boutique : le lien d'achat
    achat = x =>
      x.url && svLink(toUrlP(x.url))
        ? ` · <a href="${esc(svLink(toUrlP(x.url)))}" target="_blank" rel="noopener">Acheter</a>`
        : '';
  const seance = o.formules
    .map(f => {
      const pk = o.packs.filter(p => p.formule === f.id);
      return line(
        `${esc(f.nom)} · ${mn(f.duree)}`,
        e(f.prix) + (f.par === 'personne' && f.joueurs > 1 ? ' / pers.' : ''),
        pk.map(p => `${esc(p.nom || 'Pack')} : ${p.seances} séances, ${e(p.prix)}${achat(p)}`).join('<br>')
      );
    })
    .join('');
  const seen = {},
    abRows = o.abos.filter(a => !a.ens || (seen[a.ens] ? false : (seen[a.ens] = 1)));
  const abos = abRows
    .map(a => {
      if (a.ens) {
        const l = o.abos.filter(x => x.ens === a.ens),
          min = Math.min(...l.map(x => +x.prix || 0));
        return line(
          esc(a.ens),
          (l.length > 1 ? 'dès ' : '') + e(min),
          l.map(x => `${esc(x.nom)} : ${e(x.prix)} ${abPer(x)}${achat(x)}`).join('<br>')
        );
      }
      const f = o.formules.find(x => x.id === a.formule),
        eng = abEng(a),
        det = [
          a.parSemaine ? `${a.parSemaine} séance${a.parSemaine > 1 ? 's' : ''} par semaine` : '',
          f ? `cours ${kind(f)} de ${mn(f.duree)}` : '',
          /* le nom dit souvent déjà l'engagement : « Academy Training (6 mois) » */
          eng && !new RegExp('\\b' + (+a.duree || 0) + '\\s*(mois|ans?)\\b', 'i').test(a.nom) ? eng : ''
        ].filter(Boolean);
      return line(esc(a.nom), `${e(a.prix)} ${abPer(a)}`, det.join(' · ') + achat(a));
    })
    .join('');
  return `${seance ? `<span class="ptt">À la séance et en pack</span><ul class="ptar">${seance}</ul>` : ''}${abos ? `<span class="ptt">Abonnements</span><ul class="ptar">${abos}</ul>` : ''}`;
}
const toUrlP = u => (u ? (/^https?:\/\//i.test(u) ? u : 'https://' + u) : '');
/* une ligne par enseignant, qui s'ouvre comme un menu déroulant */
function profCard(k, open) {
  const p = proOf(k),
    gs = GROUPS.filter(g => g.type === 'train' && g.coach === k && !g.once && !(g.to && g.to < TODAY));
  return `<details class="card prof"${open ? ' open' : ''}><summary>${av(k, 'sm')}<span class="grow"><span class="nm">${esc(name(k))}</span><br><span class="muted small">${esc(p.dip || (gs.length ? gs.length + ' groupe' + (gs.length > 1 ? 's' : '') : 'Enseignant'))}${p.since ? ' · depuis ' + esc(p.since) : ''}</span></span>${proBook(k)}<span class="chev" aria-hidden="true">${ic('back')}</span></summary>${proBody(k)}</details>`;
}
function profsBody() {
  const ks = proKeys();
  return ks.length
    ? `<p class="muted small">L'équipe pédagogique du club. Touche un enseignant pour voir ses coordonnées, ses tarifs et réserver une séance.</p>` +
        ks.map(k => profCard(k)).join('')
    : empty('school', 'Aucun enseignant', 'Les enseignants du club apparaîtront ici avec leur fiche.');
}
