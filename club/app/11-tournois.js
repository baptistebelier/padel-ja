/* /RAM Club — app/11-tournois.js : s'inscrire à un tournoi ou une animation /RAM JA depuis le club.
   L'inscription part au serveur /RAM JA, qui ajoute la paire au tournoi et met à jour la publication.
   Les fichiers app/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
async function jaCall(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Erreur ' + r.status);
  return d;
}
Object.assign(A, {
  /* s'inscrire : seul (animation) ou avec un partenaire du club, ou extérieur (tournoi) */
  jaIn(d) {
    const p = posts.find(x => x.id === d.id);
    if (!p || !p.ja) return;
    if (!(window.RAM && RAM.live)) return toast('Inscription possible dans l’appli de ton club');
    if (p.ja.ani)
      return sheet(
        'Inscription',
        `<div class="body"><div class="note"><b>${esc(p.title)}</b><br>${p.d ? fmtD(p.d) : ''}${p.ja.time ? ' · ' + esc(p.ja.time) : ''}</div><p class="muted small">Tu es inscrit directement auprès du juge-arbitre de l’animation.</p><button class="btn full" data-a="jaInOk" data-id="${p.id}">Confirmer mon inscription</button></div>`
      );
    const me = ME(),
      mates = adults()
        .filter(k => k !== me && M[k])
        .sort((a, b) => M[a].n.localeCompare(M[b].n));
    sheet(
      'Inscrire ma paire',
      `<form class="body" id="ja-form" data-id="${p.id}"><div class="note"><b>${esc(p.title)}</b>${p.ja.cat ? ' · ' + esc(p.ja.cat) : ''}<br>${p.d ? fmtD(p.d) : ''}${p.ja.time ? ' · ' + esc(p.ja.time) : ''}</div>
 <div class="fld"><label for="ja-mate">Mon partenaire</label><select id="ja-mate"><option value="">Choisir…</option>${mates.map(k => `<option value="${k}">${esc(M[k].n)}${M[k].pad ? ' · padel n° ' + esc(M[k].pad) : ''}</option>`).join('')}<option value="ext">Partenaire hors du club…</option></select></div>
 <div id="ja-ext" class="stack" hidden><div class="two">${O('ja-last', 'Nom', 'DUPONT')}${O('ja-first', 'Prénom', 'Paul')}</div>${O('ja-lic', 'Licence (facultatif)', '1234567A')}${O('ja-club', 'Club (facultatif)', '')}</div>
 <p class="muted small">Ta paire est ajoutée à la liste du juge-arbitre. Tu peux te désinscrire tant que le tirage n’est pas fait.</p><button class="btn full">Inscrire ma paire</button></form>`
    );
  },
  async jaInOk(d) {
    try {
      await jaCall('/api/ja/inscription', { tid: posts.find(x => x.id === d.id).ja.tid });
      closeSheet();
      toast('Inscription envoyée au juge-arbitre');
    } catch (e) {
      toast(e.message);
    }
  },
  jaOut(d) {
    const p = posts.find(x => x.id === d.id);
    if (!p) return;
    sheet(
      'Me désinscrire',
      `<div class="body"><div class="note">${p.ja.ani ? 'Tu quittes la liste des joueurs de l’animation.' : 'Ta paire est retirée de la liste du juge-arbitre (ton partenaire aussi).'}</div><button class="btn full hot" data-a="jaOutOk" data-id="${p.id}">Me désinscrire</button></div>`
    );
  },
  async jaOutOk(d) {
    try {
      await jaCall('/api/ja/desinscription', { tid: posts.find(x => x.id === d.id).ja.tid });
      closeSheet();
      toast('Désinscription prise en compte');
    } catch (e) {
      toast(e.message);
    }
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'ja-mate' && $('ja-ext')) $('ja-ext').hidden = e.target.value !== 'ext';
});
document.addEventListener('submit', async e => {
  const f = e.target;
  if (f.id !== 'ja-form') return;
  const p = posts.find(x => x.id === f.dataset.id),
    v = id => ($(id) ? $(id).value.trim() : ''),
    mate = v('ja-mate');
  if (!mate) return toast('Choisis ton partenaire');
  const partner =
    mate === 'ext'
      ? { last: v('ja-last'), first: v('ja-first'), licence: v('ja-lic'), club: v('ja-club') }
      : { key: mate };
  if (mate === 'ext' && !partner.last) return toast('Indique le nom de ton partenaire');
  try {
    await jaCall('/api/ja/inscription', { tid: p.ja.tid, partner });
    closeSheet();
    toast('Paire inscrite : le juge-arbitre la voit dans sa liste');
  } catch (x) {
    toast(x.message);
  }
});
/* « Nouveau tournoi » du club, organisé avec /RAM JA : création dans /RAM JA (même compte /RAM) ;
   /RAM JA le publie ensuite sur le mur, avec les inscriptions dans l'appli */
async function jaCreateTournament(o) {
  try {
    const r = await fetch('/api/tournaments', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: o.name })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.id) throw new Error(d.error || 'Création impossible dans /RAM JA');
    await jaCall('/api/t/' + d.id + '/action', {
      type: 'tournament/update',
      payload: {
        name: o.name,
        club: club().name,
        category: o.cat,
        gender: { Hommes: 'Messieurs', Femmes: 'Dames', Mixte: 'Mixte' }[o.gen] || 'Messieurs',
        dateStart: o.d1,
        dateEnd: o.d2 || o.d1,
        deadline: o.dl ? o.dl + 'T20:00' : '',
        maxPairs: o.max || 16,
        regMode: ''
      }
    });
    closeSheet();
    S.tab = 'home';
    S.stack = [];
    render();
    sheet(
      'Tournoi créé dans /RAM JA',
      `<div class="body"><div class="note ok">${ic('check')}<span><b>${esc(o.name)}</b> est créé dans /RAM JA et sera publié sur le mur dans un instant, avec les inscriptions dans l’appli.</span></div><p class="muted small">Le juge-arbitre gère ensuite le tirage, la programmation et les scores dans /RAM JA.</p><a class="btn full" href="${/^club\./.test(location.hostname) ? 'https://ja.riseandmove.fr' : ''}/t/${d.id}" target="_blank" rel="noopener">Ouvrir dans /RAM JA ${ic('link')}</a></div>`
    );
  } catch (e) {
    toast(e.message);
  }
}
