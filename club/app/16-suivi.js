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
