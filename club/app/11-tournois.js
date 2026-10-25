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
  /* classements inter-clubs : activité des adhérents, résultats en tournoi */
  async ranks(d) {
    const tab = d.t || S.rankTab || 'activity';
    S.rankTab = tab;
    if (!(window.RAM && RAM.live)) return toast('Classements disponibles dans l’appli de ton club');
    let data;
    try {
      const r = await fetch('/api/ram/classements?saison=' + encodeURIComponent(S.season || ''), {
        credentials: 'include'
      });
      data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Erreur ' + r.status);
    } catch (e) {
      return toast(e.message);
    }
    const mine = ((RAM.clubs || []).find(c => c.id === RAM.club) || {}).clubId,
      list = data[tab] || [],
      chips = [
        ['activity', 'Les plus actifs'],
        ['tournaments', 'Tournois']
      ]
        .map(([k, l]) => `<button class="chip" data-a="ranks" data-t="${k}" aria-pressed="${k === tab}">${l}</button>`)
        .join(''),
      rows = list
        .map(
          (c, i) =>
            `<div class="item ${c.id === mine ? 'me' : ''}"><span class="tile" style="font-weight:700">${i + 1}</span><span class="grow"><span class="nm">${esc(c.name)}</span>${c.id === mine ? ' <span class="tag lime">Mon club</span>' : ''}<br><span class="muted small">${
              tab === 'activity'
                ? c.members + ' adhérents dans l’appli'
                : c.players +
                  ' joueur' +
                  (c.players > 1 ? 's' : '') +
                  (c.titles ? ' · ' + c.titles + ' titre' + (c.titles > 1 ? 's' : '') : '')
            }</span></span><b>${tab === 'activity' ? c.avg + ' pts' : c.points + ' pts'}</b></div>`
        )
        .join('');
    sheet(
      'Classement des clubs',
      `<div class="body"><div class="chips">${chips}</div><p class="muted small">${
        tab === 'activity'
          ? 'Points d’investissement moyens par adhérent dans /RAM Club, saison ' +
            esc(data.season) +
            ' (clubs d’au moins 3 adhérents).'
          : 'Points gagnés en tournoi /RAM JA par les joueurs de chaque club, saison ' + esc(data.season) + '.'
      }</p>${rows || '<p class="muted small">Pas encore de classement cette saison.</p>'}</div>`
    );
  },
  /* ligue des animations de la saison : classement complet et barème */
  league() {
    const L = jaLeague();
    sheet(
      'Ligue des animations',
      `<div class="body"><p class="muted small">${L.count} animation${L.count > 1 ? 's' : ''} /RAM JA terminée${L.count > 1 ? 's' : ''} cette saison. Points selon la place : ${LIGUE_PTS.join(', ')} du 1er au 8e, plus 1 point par participation.</p>${leagueRows(L.rows)}</div>`
    );
  },
  /* s'inscrire : seul (animation) ou avec un partenaire du club, ou extérieur (tournoi) */
  /* d.k : un de mes enfants (sinon, moi) */
  jaIn(d) {
    const p = posts.find(x => x.id === d.id);
    if (!p || !p.ja) return;
    if (!(window.RAM && RAM.live)) return toast('Inscription possible dans l’appli de ton club');
    const kid = d.k && M[d.k] ? d.k : '',
      nm = kid ? esc(first(kid)) : '',
      kd = kid ? ` data-k="${kid}"` : '';
    if (p.ja.ani)
      return sheet(
        kid ? 'Inscrire ' + nm : 'Inscription',
        `<div class="body"><div class="note"><b>${esc(p.title)}</b><br>${p.d ? fmtD(p.d) : ''}${p.ja.time ? ' · ' + esc(p.ja.time) : ''}</div><p class="muted small">${kid ? nm + ' est inscrit' : 'Tu es inscrit'} directement auprès du juge-arbitre de l’animation.</p><button class="btn full" data-a="jaInOk" data-id="${p.id}"${kd}>${kid ? "Confirmer l'inscription de " + nm : 'Confirmer mon inscription'}</button></div>`
      );
    // partenaires : les adultes du club pour moi ; pour un enfant, tous les adhérents (enfants compris) sauf lui
    const self = kid || ME(),
      mates = (kid ? Object.keys(M).filter(k => k !== 'club') : adults())
        .filter(k => k !== self && M[k] && M[k].n)
        .sort((a, b) => M[a].n.localeCompare(M[b].n));
    sheet(
      kid ? 'Inscrire ' + nm : 'Inscrire ma paire',
      `<form class="body" id="ja-form" data-id="${p.id}" data-k="${kid}"><div class="note"><b>${esc(p.title)}</b>${p.ja.cat ? ' · ' + esc(p.ja.cat) : ''}<br>${p.d ? fmtD(p.d) : ''}${p.ja.time ? ' · ' + esc(p.ja.time) : ''}</div>
 <div class="fld"><label for="ja-mate">${kid ? 'Partenaire de ' + nm : 'Mon partenaire'}</label><select id="ja-mate"><option value="">Choisir…</option>${mates.map(k => `<option value="${k}">${esc(M[k].n)}${M[k].pad ? ' · padel n° ' + esc(M[k].pad) : ''}</option>`).join('')}<option value="ext">Partenaire hors du club…</option></select></div>
 <div id="ja-ext" class="stack" hidden><div class="two">${O('ja-last', 'Nom', 'DUPONT')}${O('ja-first', 'Prénom', 'Paul')}</div>${O('ja-lic', 'Licence (facultatif)', '1234567A')}${O('ja-club', 'Club (facultatif)', '')}</div>
 <p class="muted small">${kid ? 'La paire de ' + nm + ' est ajoutée' : 'Ta paire est ajoutée'} à la liste du juge-arbitre. Désinscription possible tant que le tirage n’est pas fait.</p><button class="btn full">${kid ? 'Inscrire ' + nm : 'Inscrire ma paire'}</button></form>`
    );
  },
  async jaInOk(d) {
    try {
      await jaCall('/api/ja/inscription', { tid: posts.find(x => x.id === d.id).ja.tid, kid: d.k || undefined });
      closeSheet();
      toast('Inscription envoyée au juge-arbitre');
    } catch (e) {
      toast(e.message);
    }
  },
  jaOut(d) {
    const p = posts.find(x => x.id === d.id);
    if (!p) return;
    const kid = d.k && M[d.k] ? d.k : '',
      nm = kid ? esc(first(kid)) : '';
    sheet(
      kid ? 'Désinscrire ' + nm : 'Me désinscrire',
      `<div class="body"><div class="note">${p.ja.ani ? (kid ? nm + ' quitte' : 'Tu quittes') + ' la liste des joueurs de l’animation.' : (kid ? 'La paire de ' + nm : 'Ta paire') + ' est retirée de la liste du juge-arbitre (avec son partenaire).'}</div><button class="btn full hot" data-a="jaOutOk" data-id="${p.id}"${kid ? ` data-k="${kid}"` : ''}>${kid ? 'Désinscrire ' + nm : 'Me désinscrire'}</button></div>`
    );
  },
  async jaOutOk(d) {
    try {
      await jaCall('/api/ja/desinscription', { tid: posts.find(x => x.id === d.id).ja.tid, kid: d.k || undefined });
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
    await jaCall('/api/ja/inscription', { tid: p.ja.tid, partner, kid: f.dataset.k || undefined });
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
    // essai ou pass /RAM JA épuisé : on explique pourquoi, et quoi faire, plutôt qu'une simple erreur
    if (r.status === 402) return jaAccessBlocked(d, o);
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
      `<div class="body"><div class="note ok">${ic('check')}<span><b>${esc(o.name)}</b> est créé dans /RAM JA et sera publié sur le mur dans un instant, avec les inscriptions dans l’appli.</p><p class="muted small">Le juge-arbitre gère ensuite le tirage, la programmation et les scores dans /RAM JA.</p><a class="btn full" href="${/^club\./.test(location.hostname) ? 'https://ja.riseandmove.fr' : ''}/t/${d.id}" target="_blank" rel="noopener">Ouvrir dans /RAM JA ${ic('link')}</a></div>`
    );
  } catch (e) {
    toast(e.message);
  }
}
/* création refusée par /RAM JA (essai gratuit ou pass déjà utilisé, accès terminé) : explication et solutions */
function jaAccessBlocked(d, o) {
  const a = d.access || {},
    shop = /^https:\/\//.test(a.shop || '') ? a.shop : '',
    why =
      a.state === 'trial'
        ? 'L’essai gratuit de /RAM JA comprend un seul tournoi, et il est déjà utilisé sur ton compte.'
        : a.state === 'pass'
          ? 'Ton pass tournoi /RAM JA est déjà utilisé.'
          : 'Ton accès /RAM JA est terminé : tes tournois restent consultables, mais tu ne peux plus en créer.';
  closeSheet();
  sheet(
    'Tournoi non créé',
    `<div class="body"><div class="note"><span><b>${esc(o.name)}</b> n’a pas été créé. Les tournois du club sont organisés avec /RAM JA, sur le compte de la personne qui les crée. ${why}</span></div>
 <span class="kicker">Pour l’organiser quand même</span>
 <p>1. Prendre une offre /RAM JA (pass tournoi ou abonnement du club), puis recommencer ici.</p>
 <p>2. Ou demander au juge-arbitre du club de le créer dans /RAM JA avec le nom du club : il apparaîtra tout seul sur le mur, avec les inscriptions dans l’appli.</span></div>
 ${shop ? `<a class="btn full" href="${esc(shop)}" target="_blank" rel="noopener">Voir les offres /RAM JA ${ic('link')}</a>` : ''}<button class="btn ghost full" data-a="close">Fermer</button></div>`
  );
}
