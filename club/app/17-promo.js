/* /RAM Club — app/17-promo.js : promouvoir des événements de l'agenda du club sur le mur.
   Bureau, enseignants et animateurs : « … » sur une carte de l'agenda du club → Promouvoir sur le mur,
   ou Sélectionner plusieurs événements → une seule publication qui les présente en liste. */
const promoKey = (i, iso) => i.v + '|' + i.id + '|' + iso;
const canPromo = () => isAdmin() || (typeof isAnim === 'function' && isAnim());
const sansBalise = s => String(s || '').replace(/<[^>]*>/g, '');
/* l'élément de l'agenda derrière une clé « post|p12|2026-11-20 » (null s'il est passé ou supprimé) */
function promoItem(k) {
  const [v, id, iso] = String(k).split('|');
  if (!iso || iso < TODAY || typeof planItems !== 'function') return null;
  const i = planItems(iso).find(x => x.v === v && x.id === id);
  return i ? { i, iso } : null;
}
/* une carte de l'agenda du club, avec son bouton « … » ; en mode sélection, un toucher la coche */
function promoCard(i, iso, card) {
  if (!canPromo()) return card;
  const k = esc(promoKey(i, iso));
  if (S.promoSel) {
    const on = S.promoSel.includes(promoKey(i, iso));
    return `<div class="promo-w sel${on ? ' on' : ''}">${card.replace(/data-a="open" data-v="[^"]*" data-id="[^"]*"/, `data-a="promoPick" data-k="${k}" aria-pressed="${on}"`)}<span class="promo-ck" aria-hidden="true">${on ? ic('check') : ''}</span></div>`;
  }
  return `<div class="promo-w">${card}<button class="promo-more" data-a="promoMenu" data-k="${k}" aria-label="Options de ${esc(sansBalise(i.title))}">${ic('more')}</button></div>`;
}
/* barre du mode sélection, en haut de l'agenda */
function promoBar() {
  if (!S.promoSel || !canPromo()) return '';
  const n = S.promoSel.length;
  return `<div class="promo-bar" role="region" aria-label="Sélection d'événements"><span class="grow"><b>${n} événement${n > 1 ? 's' : ''}</b> sélectionné${n > 1 ? 's' : ''}<br><span class="muted small">Touche les cartes à promouvoir ensemble</span></span><button class="btn sm ghost" data-a="promoCancel">Annuler</button><button class="btn sm" data-a="promoNext" ${n ? '' : 'disabled'}>Promouvoir</button></div>`;
}
/* la fenêtre de publication : titre, message, aperçu des événements */
function promoAsk(keys) {
  const l = keys
    .map(promoItem)
    .filter(Boolean)
    .sort((a, b) => (a.iso + (a.i.t || '')).localeCompare(b.iso + (b.i.t || '')));
  if (!l.length) {
    toast('Ces événements sont passés');
    return;
  }
  S.promoKeys = l.map(x => promoKey(x.i, x.iso));
  const titre = l.length > 1 ? "À l'agenda du club" : 'À ne pas manquer';
  sheet(
    'Promouvoir sur le mur',
    `<div class="body"><p class="muted small">La publication part en haut du mur du club, au nom du club, et les adhérents sont prévenus comme pour une annonce.</p><div class="fld"><label for="promo-t">Titre</label><input id="promo-t" value="${titre}" maxlength="80" autocomplete="off"></div><div class="fld"><label for="promo-m">Message (facultatif)</label><textarea id="promo-m" rows="2" maxlength="400" placeholder="Venez nombreux !"></textarea></div><span class="kicker">${l.length} événement${l.length > 1 ? 's' : ''}</span><div class="promo-l">${l.map(x => `<span class="promo-d">${evLabel(x.iso)}</span><div class="promo-sn">${esc(sansBalise(x.i.title))}${x.i.t && !x.i.all ? ' · ' + esc(x.i.t) : ''}</div>`).join('')}</div><button class="btn full" data-a="promoGo">Publier sur le mur</button></div>`
  );
}
Object.assign(A, {
  promoMenu(d) {
    const [v, id] = String(d.k).split('|'),
      p = v === 'post' && posts.find(x => x.id === id),
      modif =
        p &&
        p.kind === 'event' &&
        !p.arch &&
        (p.by === ME() || canModerate() || (isAdmin() && (p.by === 'club' || p.stage)));
    menuSheet(p && p.stage ? 'Stage' : 'Événement', [
      modif && ['edit', p.stage ? 'Modifier le stage' : 'Modifier', 'pedit', `data-id="${esc(id)}"`],
      ['news', 'Promouvoir sur le mur', 'promoOne', `data-k="${esc(d.k)}"`],
      ['check', 'Sélectionner plusieurs événements', 'promoSelStart', `data-k="${esc(d.k)}"`]
    ]);
  },
  promoOne(d) {
    closeSheet();
    promoAsk([d.k]);
  },
  promoSelStart(d) {
    closeSheet();
    S.promoSel = [d.k];
    render(true);
  },
  promoPick(d) {
    const i = S.promoSel.indexOf(d.k);
    if (i >= 0) S.promoSel.splice(i, 1);
    else S.promoSel.push(d.k);
    render(true);
  },
  promoCancel() {
    S.promoSel = null;
    render(true);
  },
  promoNext() {
    if (S.promoSel && S.promoSel.length) promoAsk(S.promoSel);
  },
  promoGo() {
    const ev = (S.promoKeys || []).map(k => {
      const [v, id, d] = k.split('|');
      return { v, id, d };
    });
    if (!ev.length) return;
    posts.unshift({
      id: 'p' + Date.now(),
      by: 'club',
      t: "À l'instant",
      likes: 0,
      com: [],
      kind: 'promo',
      title: esc(
        (($('promo-t') || {}).value || '').trim() || (ev.length > 1 ? "À l'agenda du club" : 'À ne pas manquer')
      ),
      body: esc((($('promo-m') || {}).value || '').trim()),
      ev
    });
    S.promoSel = null;
    S.promoKeys = null;
    closeSheet();
    S.tab = 'home';
    S.stack = [];
    render();
    toast(ev.length > 1 ? `${ev.length} événements promus sur le mur` : 'Événement promu sur le mur');
  }
});
/* la publication sur le mur : titre, message, et les événements encore à venir, chacun ouvre sa fiche */
function promoPost(p) {
  const rows = (p.ev || [])
    .map(e => promoItem(e.v + '|' + e.id + '|' + e.d))
    .filter(Boolean)
    .map(x => planCard(x.i, x.iso));
  return `<h2 class="tilt sm">${p.title}<i class="dd"></i></h2>${p.body ? `<p>${p.body}</p>` : ''}${rows.length ? `<div class="promo-l">${rows.join('')}</div>` : '<p class="muted small">Ces événements sont passés.</p>'}`;
}
