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
      return `<button class="item" data-a="open" data-v="post" data-id="${p.id}"><span class="tile">${ic('users')}</span><span class="grow"><span class="nm">${esc(p.nv.theme || NV_MODE[p.nv.mode])}</span><br><span class="muted small">${fmtD(d)} à ${esc(p.nv.time)}${t ? ` · ${n} inscrit${n > 1 ? 's' : ''}${nvCapTxt(t) || ' sur ' + nvCap(t)}` : ''}</span></span></button>`;
    })
    .join('');
const resaHeure = n => Math.floor(n / 60) + ' h' + (n % 60 ? ' ' + String(n % 60).padStart(2, '0') : '');
const resaLundi = w => isoIn(7 * w - ((REGLES.dowOf(TODAY) + 6) % 7), TODAY);
function resaLoad(k, de) {
  const id = k + '|' + de;
  if (!RESA[id]) {
    RESA[id] = { wait: 1 };
    fetch('/api/reservation/creneaux?c=' + encodeURIComponent(RAM.club) + '&k=' + encodeURIComponent(k) + '&de=' + de, {
      credentials: 'include'
    })
      .then(r => r.json().then(d => (r.ok ? d : Promise.reject(new Error(d.error || 'Réservation indisponible')))))
      .then(d => (RESA[id] = d))
      .catch(e => (RESA[id] = { err: e.message }))
      .then(() => view().v === 'resa' && render(true));
  }
  return RESA[id];
}
V.resa = k => {
  if (!(window.RAM && RAM.live))
    return `<div class="pad"><div class="card"><p>Démonstration : la réservation fonctionne dans l'appli de votre club.</p></div></div>`;
  const w = Math.max(0, S.resaW || 0),
    de = resaLundi(w),
    c = resaLoad(k, de),
    fin = isoIn(6, de);
  if (c.wait)
    return `<div class="pad"><div class="card"><p class="muted small">Chargement du planning…</p></div></div>`;
  if (c.err) return `<div class="pad">${empty('cal', 'Réservation indisponible', esc(c.err))}</div>`;
  if (!c.ouvert || !c.formules.length)
    return `<div class="pad">${empty('cal', 'Pas encore de réservation', 'Cet enseignant n’a pas encore ouvert ses créneaux.')}</div>`;
  const f = c.formules.find(x => x.id === S.resaF) || c.formules[0],
    jours = c.jours
      .map(j => {
        const lib = [];
        j.libres.forEach(p => {
          for (let t = p.du; t + f.duree <= p.au; t += 30) lib.push({ t, lieu: p.lieu });
        });
        const cases = lib
          .map(x => ({
            t: x.t,
            h: `<button class="chip rsl" data-a="resaPick" data-k="${k}" data-d="${j.d}" data-t="${x.t}" data-l="${esc(x.lieu)}">${resaHeure(x.t)}</button>`
          }))
          .concat(j.pris.map(x => ({ t: x.du, h: resaPrisHtml(k, j.d, x, c) })))
          .sort((a, b) => a.t - b.t)
          .map(x => x.h)
          .join('');
        return `<section class="rsd${j.d === TODAY ? ' today' : ''}"><h3 class="kicker">${fmtD(j.d)}${j.d === TODAY ? " · aujourd'hui" : ''}</h3><div class="rss">${cases || '<span class="muted small">Rien de libre</span>'}</div></section>`;
      })
      .join(''),
    coll = resaCollectifs(k, de, fin),
    mes = (c.mes || []).map(x => resaCoursHtml(x)).join('');
  return `<div class="pad rsw">${mes ? `<div class="card"><span class="kicker">Mes cours avec ${esc(first(k))}</span><div class="list">${mes}</div></div>` : ''}<div class="card"><div class="fld"><label for="rs-f">Formule</label><select id="rs-f">${c.formules.map(x => `<option value="${esc(x.id)}" ${x.id === f.id ? 'selected' : ''}>${esc(x.nom)} · ${x.duree % 60 ? Math.floor(x.duree / 60) + ' h ' + (x.duree % 60) : x.duree / 60 + ' h'} · ${x.prix} €</option>`).join('')}</select></div><p class="small"><b>Durée : ${f.duree < 60 ? f.duree + ' min' : resaHeure(f.duree)}</b></p>${c.packs ? '<p class="muted small">Un pack déjà acheté chez cet enseignant se décompte tout seul.</p>' : ''}</div><div class="row" style="justify-content:space-between"><button class="ib rnd" data-a="resaWeek" data-n="-1" aria-label="Semaine précédente" ${w ? '' : 'disabled'}>${ic('back')}</button><span class="h3">Du ${fmtD(de, 1)} au ${fmtD(fin, 1)}</span><button class="ib rnd" style="rotate:180deg" data-a="resaWeek" data-n="1" aria-label="Semaine suivante" ${w < 8 ? '' : 'disabled'}>${ic('back')}</button></div><div class="rsj">${jours}</div>${coll ? `<div class="card"><span class="kicker">Collectifs de la semaine</span><div class="list">${coll}</div></div>` : ''}</div>`;
};
TITLES.resa = () => ['Réserver un cours', M[view().id] ? 'Avec ' + name(view().id) : ''];
Object.assign(A, {
  resaWeek(d) {
    S.resaW = Math.max(0, Math.min(8, (S.resaW || 0) + +d.n));
    render(true);
  },
  resaPick(d) {
    const c = RESA[view().id + '|' + resaLundi(Math.max(0, S.resaW || 0))],
      f = c.formules.find(x => x.id === S.resaF) || c.formules[0],
      kids = ((M[ME()] && M[ME()].kids) || []).filter(k => M[k]);
    sheet(
      'Confirmer le cours',
      `<form class="body" id="rs-go" data-k="${d.k}" data-d="${d.d}" data-t="${d.t}" data-f="${esc(f.id)}"><p><b>${fmtD(d.d)} à ${resaHeure(+d.t)}</b><br>${esc(f.nom)} avec ${esc(name(d.k))} · ${f.prix} €${d.l ? ' · ' + esc(d.l) : ''}</p>${kids.length ? Who('rs-p', 'Pour', [ME(), ...kids]) : ''}${T('rs-o', 'Objectif de la séance', 'Ce que tu veux travailler', '')}<button class="btn full">Réserver</button><p class="muted small">Confirmé tout de suite : l’enseignant reçoit une notification et le cours arrive dans ton agenda. Tu peux annuler jusqu’à 24 h avant.</p></form>`
    );
  }
});
document.addEventListener('change', e => {
  if (e.target.id !== 'rs-f') return;
  S.resaF = e.target.value;
  render(true);
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
Object.assign(A, {
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
