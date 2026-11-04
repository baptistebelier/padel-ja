/* /RAM Club — app/16-suivi.js : conversation privée avec l'enseignant et envoi de vidéos à analyser
   (écrans dans ui/13-suivi.js ; /RAM Coach utilise les mêmes). */
V.dm = dmView;
TITLES.dm = () => {
  const id = view().id;
  if (dmStudent(id)) {
    const c = dmCoaches(id);
    return [
      id === ME() ? 'Mon enseignant' : 'Enseignant de ' + first(id),
      c.length ? c.map(name).join(', ') : 'Suivi personnel'
    ];
  }
  return [svName(id), 'Suivi de l’élève'];
};
const svNew = (to, k, extra) => {
  const x = Object.assign(
    { id: 'sv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), to, by: ME(), k, at: Date.now() },
    svFrom(to),
    extra
  );
  SUIVI.push(x);
  return x;
};
A.svAll = d => {
  S.svAll = S.svAll === d.id ? '' : d.id;
  render(true);
};
/* l'élève envoie une vidéo (lien) et sa question ; l'enseignant répond par une analyse */
A.svVideo = d => {
  sheet(
    'Vidéo à analyser',
    `<form class="body" id="sv-video" data-id="${d.id}">${F('sv-url', 'Lien de la vidéo', 'YouTube, Google Drive, iCloud…')}${T('sv-q', 'Ta question', 'Ce que tu veux que l’enseignant regarde')}<p class="muted small">Dépose d'abord la vidéo sur ton espace en ligne (YouTube en non répertorié, Google Drive…) et colle son lien ici.</p><button class="btn full">${ic('send')}Envoyer à l'enseignant</button></form>`
  );
};
A.svReply = d => {
  const x = SUIVI.find(s => s.id === d.id);
  if (!x) return;
  sheet(
    'Analyse vidéo',
    `<form class="body" id="sv-ana" data-id="${x.id}">${T('sv-txt', 'Ton analyse', 'Ce qui va, ce qui est à corriger (avec le moment de la vidéo)')}${O('sv-url', 'Lien de la vidéo annotée (facultatif)', '')}<button class="btn full">${ic('send')}Envoyer à ${svFirst(x.to)}</button></form>`
  );
};
document.addEventListener('submit', e => {
  const f = e.target,
    v = view();
  if (f.id === 'composer' && v.v === 'dm') {
    e.preventDefault();
    const inp = $('msg-input'),
      x = inp.value.trim();
    if (!x || !dmCanWrite(v.id)) return;
    svNew(v.id, 'msg', { txt: x });
    inp.value = '';
    S.sent = true;
    render(true);
    S.sent = false;
    $('main').scrollTop = $('main').scrollHeight;
    inp.focus();
    return;
  }
  if (f.id === 'sv-video') {
    e.preventDefault();
    const u = toUrl($('sv-url').value.trim()),
      q = $('sv-q').value.trim();
    if (!u) return;
    svNew(f.dataset.id, 'video', { url: u, txt: q });
    closeSheet();
    render(true);
    toast("Vidéo envoyée à l'enseignant");
  }
  if (f.id === 'sv-ana') {
    e.preventDefault();
    const src = SUIVI.find(s => s.id === f.dataset.id),
      t = $('sv-txt').value.trim(),
      u = toUrl($('sv-url').value.trim());
    if (!src || !t) return;
    svNew(src.to, 'video', { re: src.id, txt: t, url: u || undefined });
    closeSheet();
    render(true);
    toast('Analyse envoyée à ' + svFirst(src.to));
  }
});

/* ---------- réserver un cours : la semaine de l'enseignant ----------
   ce qui est libre et ce qui est pris viennent du serveur (lib/reservation.js) : les cours pris, sans aucun nom */
const RESA = {};
/* une plage prise : se mettre sur la liste d'attente, ou en sortir */
const resaPrisHtml = (k, d, x, c) => {
  const on = (c.attente || []).some(a => a.d === d && a.du === x.du);
  return `<span class="rsp">${resaHeure(x.du)} – ${resaHeure(x.au)} · pris${d < TODAY ? '' : `<button class="chip rsa" data-a="resaWait" data-k="${k}" data-d="${d}" data-du="${x.du}" data-au="${x.au}" aria-pressed="${on}">${ic('bell')}${on ? 'Prévenu' : 'Me prévenir'}</button>`}</span>`;
};
/* un cours réservé : l'annuler jusqu'à 24 h avant ; un collectif se quitte depuis sa publication */
const resaCoursHtml = (x, avec) =>
  `<div class="item"><span class="tile">${ic('cal')}</span><span class="grow"><span class="nm">${esc(x.nom)}</span><br><span class="muted small">${fmtD(x.d)} à ${esc(x.h)}${avec && M[x.coach] ? ' · ' + esc(name(x.coach)) : ''}${x.pour && x.pour !== ME() && M[x.pour] ? ' · pour ' + esc(first(x.pour)) : ''}${x.annulable || x.post ? '' : ' · moins de 24 h avant : contacte ton enseignant'}</span></span>${x.annulable ? `<button class="chip" data-a="resaCancel" data-id="${esc(x.id)}">Annuler</button>` : x.post ? `<button class="chip" data-a="open" data-v="post" data-id="${esc(x.post)}">Voir</button>` : ''}</div>`;
/* les collectifs de cet enseignant cette semaine, à mon niveau : ils s'ouvrent dans leur publication */
const resaCollectifs = (k, de, fin) =>
  posts
    .filter(p => p.kind === 'niveaux' && p.nv && p.by === k && !p.arch && canSee(p))
    .flatMap(p => (p.nv.dates || []).filter(d => d >= de && d <= fin && d >= TODAY).map(d => ({ p, d })))
    .map(({ p, d }) => {
      const t = nvMyTier(p.nv, ME()),
        n = t ? nvState(p.nv, d).lists[t.id].length : 0;
      return `<button class="item${p.nv.demande ? ' rsdem' : ''}" data-a="open" data-v="post" data-id="${p.id}"><span class="tile">${ic('users')}</span><span class="grow"><span class="nm">${p.nv.demande ? 'Demande d’un élève · ' : ''}${esc(p.nv.theme || NV_MODE[p.nv.mode])}</span><br><span class="muted small">${fmtD(d)} à ${esc(p.nv.time)}${t ? (p.nv.demande ? ` · ${(x => `${x} place${x > 1 ? 's' : ''} restante${x > 1 ? 's' : ''}`)(Math.max(0, nvCap(t) - n))}` : ` · ${n} inscrit${n > 1 ? 's' : ''}${nvCapTxt(t) || ' sur ' + nvCap(t)}`) : ''}</span></span></button>`;
    })
    .join('');
const resaHeure = n => Math.floor(n / 60) + ' h' + (n % 60 ? ' ' + String(n % 60).padStart(2, '0') : '');
/* le mois affiché : celui d'aujourd'hui, ou un des trois suivants */
const resaMoisDe = m => {
  const [y, mo] = TODAY.split('-').map(Number),
    d = new Date(y, mo - 1 + m, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
};
const resaNb = de => {
  const [y, m] = de.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
const RESA_FRAIS = 20000;
setInterval(() => {
  if (view().v === 'resa' && !$('sheet') && !document.hidden) render(true);
}, RESA_FRAIS);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && view().v === 'resa' && !$('sheet')) {
    Object.keys(RESA).forEach(k => RESA[k] && RESA[k].lu && (RESA[k].lu = 1));
    render(true);
  }
});
function resaLoad(k, de) {
  const id = k + '|' + de,
    vieux = RESA[id] && RESA[id].lu && Date.now() - RESA[id].lu > RESA_FRAIS;
  if (!RESA[id] || vieux) {
    // une plage annulée par l'enseignant redevient libre : on relit, en gardant l'affichage en attendant
    if (vieux) RESA[id].lu = Date.now();
    else RESA[id] = { wait: 1 };
    fetch(
      '/api/reservation/creneaux?c=' +
        encodeURIComponent(RAM.club) +
        '&k=' +
        encodeURIComponent(k) +
        '&de=' +
        de +
        '&n=' +
        resaNb(de),
      {
        credentials: 'include'
      }
    )
      .then(r => r.json().then(d => (r.ok ? d : Promise.reject(new Error(d.error || 'Réservation indisponible')))))
      .then(d => (RESA[id] = Object.assign(d, { lu: Date.now() })))
      .catch(e => (RESA[id] = { err: e.message }))
      .then(() => view().v === 'resa' && render(true));
  }
  return RESA[id];
}
V.resa = k => {
  if (!(window.RAM && RAM.live))
    return `<div class="pad"><div class="card"><p>Démonstration : la réservation fonctionne dans l'appli de votre club.</p></div></div>`;
  const w = Math.max(0, Math.min(3, S.resaM || 0)),
    de = resaMoisDe(w),
    c = resaLoad(k, de),
    fin = isoIn(resaNb(de) - 1, de);
  if (c.wait)
    return `<div class="pad"><div class="card"><p class="muted small">Chargement du planning…</p></div></div>`;
  if (c.err) return `<div class="pad">${empty('cal', 'Réservation indisponible', esc(c.err))}</div>`;
  if (!c.ouvert || !c.formules.length)
    return `<div class="pad">${empty('cal', 'Pas encore de réservation', 'Cet enseignant n’a pas encore ouvert ses créneaux.')}</div>`;
  const f = c.formules.find(x => x.id === S.resaF) || c.formules[0],
    durTxt = f.duree < 60 ? f.duree + ' min' : resaHeure(f.duree),
    heures = j => {
      const l = [];
      j.libres.forEach(p => {
        for (let t = p.du; t + f.duree <= p.au; t += 30) l.push({ t, lieu: p.lieu });
      });
      return l;
    },
    dispo = new Set(c.jours.filter(j => heures(j).length).map(j => j.d));
  // le jour ouvert : celui choisi s'il a encore de la place, sinon le premier disponible du mois
  const jd = dispo.has(S.resaD)
      ? S.resaD
      : c.jours.map(j => j.d).find(d => dispo.has(d)) || (S.resaD >= de && S.resaD <= fin ? S.resaD : ''),
    jour = c.jours.find(j => j.d === jd),
    vide = (REGLES.dowOf(de) + 6) % 7,
    titreMois = new Date(de + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const cases =
    Array.from({ length: vide }, () => '<span></span>').join('') +
    c.jours
      .map(j => {
        const n = +j.d.slice(8),
          on = dispo.has(j.d);
        return on
          ? `<button class="rsj${j.d === jd ? ' on' : ''}${j.d === TODAY ? ' today' : ''}" data-a="resaJour" data-d="${j.d}" aria-pressed="${j.d === jd}" aria-label="${fmtD(j.d)}">${n}</button>`
          : `<span class="rsj off${j.d === TODAY ? ' today' : ''}">${n}</span>`;
      })
      .join('');
  const creneaux = jour
    ? heures(jour)
        .map(x =>
          +S.resaT === x.t && S.resaTd === jour.d
            ? `<div class="rst2"><span>${resaHeure(x.t)}</span><button class="rsgo" data-a="resaPick" data-k="${k}" data-d="${jour.d}" data-t="${x.t}" data-l="${esc(x.lieu)}">Suivant</button></div>`
            : `<button class="rst rsl" data-a="resaSel" data-d="${jour.d}" data-t="${x.t}">${resaHeure(x.t)}</button>`
        )
        .join('')
    : '';
  const pris =
    jour && jour.pris.length
      ? `<span class="kicker rsk">Déjà pris</span><div class="rss">${jour.pris.map(x => resaPrisHtml(k, jour.d, x, c)).join('')}</div>`
      : '';
  const coll = resaCollectifs(k, de, fin),
    mes = (c.mes || []).map(x => resaCoursHtml(x)).join('');
  const qui = M[k] ? name(k) : '';
  return `<div class="pad rsw">${mes ? `<div class="card"><span class="kicker">Mes cours avec ${esc(first(k))}</span><div class="list">${mes}</div></div>` : ''}
<div class="card rshd">${M[k] ? av(k) : ''}<div class="grow"><span class="kicker">Votre enseignant</span><span class="h3">${esc(qui)}</span></div></div>
<div class="card"><div class="rshead"><span class="rsnum">1</span><span class="rst-h">Choisissez votre formule</span></div><div class="rsfs">${c.formules
    .map(
      x =>
        `<button class="rsf" data-a="resaFo" data-id="${esc(x.id)}" aria-pressed="${x.id === f.id}"><span class="nm">${esc(x.nom)}</span><span class="muted small">${x.duree % 60 ? Math.floor(x.duree / 60) + ' h ' + (x.duree % 60) : x.duree / 60 + ' h'}</span><b>${x.prix} €</b></button>`
    )
    .join(
      ''
    )}</div>${c.packs ? '<p class="muted small">Un pack déjà acheté chez cet enseignant se décompte tout seul.</p>' : ''}</div>
<div class="rsb"><div class="card rscal"><div class="rshead"><span class="rsnum">2</span><span class="rst-h">Choisissez un jour</span></div><div class="rsm"><button class="ib rnd" data-a="resaMois" data-n="-1" aria-label="Mois précédent" ${w ? '' : 'disabled'}>${ic('back')}</button><b>${esc(titreMois)}</b><button class="ib rnd" style="rotate:180deg" data-a="resaMois" data-n="1" aria-label="Mois suivant" ${w < 3 ? '' : 'disabled'}>${ic('back')}</button></div><div class="rsg">${['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map(x => `<span class="rsdow">${x}</span>`).join('')}${cases}</div></div>
<div class="card rsh"><div class="rshead"><span class="rsnum">3</span><span class="rst-h">Choisissez un horaire</span></div>${
    jour
      ? `<p class="rsday">${esc(new Date(jour.d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))}</p><p class="muted small">Durée : ${durTxt}</p><div class="rsts">${creneaux || '<p class="muted small">Plus de place ce jour-là.</p>'}</div>${pris}`
      : '<p class="muted small">Aucun créneau libre ce mois-ci : essayez le mois suivant.</p>'
  }</div></div>${coll ? `<div class="card"><span class="kicker">Collectifs du mois</span><div class="list">${coll}</div></div>` : ''}</div>`;
};
TITLES.resa = () => ['Réserver un cours', M[view().id] ? 'Avec ' + name(view().id) : ''];
Object.assign(A, {
  resaMois(d) {
    S.resaM = Math.max(0, Math.min(3, (S.resaM || 0) + +d.n));
    S.resaD = S.resaT = S.resaTd = null;
    render(true);
  },
  resaFo(d) {
    S.resaF = d.id;
    S.resaT = S.resaTd = null;
    render(true);
  },
  resaJour(d) {
    S.resaD = d.d;
    S.resaT = S.resaTd = null;
    render(true);
  },
  resaSel(d) {
    S.resaT = +d.t;
    S.resaTd = d.d;
    render(true);
  },
  resaPick(d) {
    const c = RESA[view().id + '|' + resaMoisDe(Math.max(0, Math.min(3, S.resaM || 0)))],
      f = c.formules.find(x => x.id === S.resaF) || c.formules[0],
      kids = ((M[ME()] && M[ME()].kids) || []).filter(k => M[k]);
    sheet(
      'Confirmer le cours',
      `<form class="body" id="rs-go" data-k="${d.k}" data-d="${d.d}" data-t="${d.t}" data-f="${esc(f.id)}"><p><b>${fmtD(d.d)} à ${resaHeure(+d.t)}</b><br>${esc(f.nom)} avec ${esc(name(d.k))} · ${f.prix} €${d.l ? ' · ' + esc(d.l) : ''}</p>${kids.length ? Who('rs-p', 'Pour', [ME(), ...kids]) : ''}${T('rs-o', 'Objectif de la séance', 'Ce que tu veux travailler', '')}<button class="btn full">Réserver</button><p class="muted small">Confirmé tout de suite : l’enseignant reçoit une notification et le cours arrive dans ton agenda. Tu peux annuler jusqu’à 24 h avant.</p>${f.url ? `<a class="btn sm ghost full" href="${esc(f.url)}" target="_blank" rel="noopener">${ic('euro')}Payer cette séance sur la boutique</a>` : ''}${(c.demandes || []).length ? `<button type="button" class="btn sm ghost full" data-a="resaAsk" data-k="${d.k}" data-d="${d.d}" data-t="${d.t}">${ic('users')}Chercher des partenaires sur ce créneau</button>` : ''}</form>`
    );
  }
});
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id !== 'rs-go') return;
  e.preventDefault();
  const objectif = $('rs-o').value.trim(),
    bouton = f.querySelector('.btn.full');
  if (objectif.length < 3) return toast('Indique l’objectif de la séance');
  bouton.disabled = true;
  fetch('/api/reservation/reserver', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      c: RAM.club,
      k: f.dataset.k,
      d: f.dataset.d,
      t: +f.dataset.t,
      formule: f.dataset.f,
      objectif,
      pour: $('rs-p') ? $('rs-p').value : undefined
    })
  })
    .then(r => r.json().then(x => ({ ok: r.ok, x })))
    .then(({ ok, x }) => {
      resaOublie();
      S.resaT = S.resaTd = null;
      closeSheet();
      render(true);
      toast(ok ? 'Cours réservé le ' + fmtD(f.dataset.d) + ' à ' + x.h : x.error || 'Réservation impossible');
    })
    .catch(() => {
      bouton.disabled = false;
      toast('Réservation impossible, réessaie');
    });
});
/* après un changement : tout se relit au serveur */
const resaOublie = () => Object.keys(RESA).forEach(k => delete RESA[k]);
const resaPost = (route, corps) =>
  fetch('/api/reservation/' + route, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ c: RAM.club }, corps))
  }).then(r => r.json().then(x => (r.ok ? x : Promise.reject(new Error(x.error || 'Action impossible')))));
/* proposer un collectif ou une partie dirigée : les élèves de mon niveau sont prévenus */
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id !== 'rs-ask') return;
  e.preventDefault();
  f.querySelector('.btn.full').disabled = true;
  resaPost('demander', {
    k: f.dataset.k,
    d: f.dataset.d,
    t: +f.dataset.t,
    formule: $('rs-af').value,
    mode: $('rs-am').value,
    theme: $('rs-at').value,
    pour: $('rs-ap') ? $('rs-ap').value : undefined
  })
    .then(() => {
      resaOublie();
      closeSheet();
      render(true);
      toast('Demande envoyée : les élèves de ton niveau sont prévenus');
    })
    .catch(x => {
      f.querySelector('.btn.full').disabled = false;
      toast(x.message);
    });
});
Object.assign(A, {
  resaAsk(d) {
    const c = RESA[view().id + '|' + resaMoisDe(Math.max(0, Math.min(3, S.resaM || 0)))],
      kids = ((M[ME()] && M[ME()].kids) || []).filter(k => M[k]);
    sheet(
      'Chercher des partenaires',
      `<form class="body" id="rs-ask" data-k="${d.k}" data-d="${d.d}" data-t="${d.t}"><p><b>${fmtD(d.d)} à ${resaHeure(+d.t)}</b> avec ${esc(name(d.k))}</p><div class="fld"><label for="rs-af">Formule</label><select id="rs-af">${c.demandes.map(x => `<option value="${esc(x.id)}">${esc(x.nom)} · ${x.joueurs} joueurs · ${x.prix} €${x.par === 'personne' ? ' par personne' : ''}</option>`).join('')}</select></div>${Sel(
        'rs-am',
        'Type',
        [
          ['partie', 'Partie dirigée'],
          ['cours', 'Séance collective']
        ].map(x => x[1])
      )}${kids.length ? Who('rs-ap', 'Pour', [ME(), ...kids]) : ''}${O('rs-at', 'Thème (facultatif)', 'Volée, jeu au filet…')}<button class="btn full">Envoyer la demande</button><p class="muted small">Les élèves de ton niveau sont prévenus. La demande entre au planning de l’enseignant quand le groupe est complet ; d’ici là, le créneau reste réservable par d’autres.</p></form>`
    );
    const m = $('rs-am');
    if (m) [...m.options].forEach((o, i) => (o.value = i ? 'cours' : 'partie'));
  },
  resaWait(d) {
    resaPost('attendre', { k: d.k, d: d.d, du: +d.du, au: +d.au })
      .then(x => {
        resaOublie();
        render(true);
        toast(x.attente ? 'Tu seras prévenu si cette plage se libère' : 'Tu n’es plus sur la liste d’attente');
      })
      .catch(e => toast(e.message));
  },
  resaCancel(d) {
    if (!confirm('Annuler ce cours ? Ton enseignant est prévenu et le créneau redevient libre.')) return;
    resaPost('annuler', { id: d.id })
      .then(() => {
        resaOublie();
        render(true);
        toast('Cours annulé');
      })
      .catch(e => toast(e.message));
  }
});
/* Mon espace : mes cours réservés, le planning de mes enseignants (groupe, cours ou formule chez eux) */
function resaMine() {
  if (!(window.RAM && RAM.live)) return '';
  if (!RESA.cours) {
    RESA.cours = [];
    fetch('/api/reservation/mes?c=' + encodeURIComponent(RAM.club), { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        RESA.cours = d.cours || [];
        if (RESA.cours.length) render(true);
      })
      .catch(() => {});
  }
  if (!RESA.mes) {
    RESA.mes = [];
    fetch('/api/reservation/enseignants?c=' + encodeURIComponent(RAM.club), { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        RESA.mes = d.enseignants || [];
        if (RESA.mes.length) render(true);
      })
      .catch(() => {});
  }
  return (
    RESA.cours.map(x => resaCoursHtml(x, true)).join('') +
    RESA.mes
      .filter(k => M[k])
      .map(
        k =>
          `<button class="item" data-a="open" data-v="resa" data-id="${k}"><span class="tile">${ic('cal')}</span><span class="grow"><span class="nm">Planning de ${esc(name(k))}</span><br><span class="muted small">Ses créneaux libres, réserver un cours</span></span></button>`
      )
      .join('')
  );
}
