/* /RAM Club — app/9-bar.js : Bar et club-house : actions et formulaires (carte tenue par le bureau,
   réservation des repas par les adhérents, commandes servies).
   Les fichiers app/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
const barId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
Object.assign(A, {
  barSet(d) {
    S.bar[d.k] = d.val;
    render(true);
  },
  /* ajouter ou modifier un article de la carte (bureau) */
  barEdit(d) {
    if (!isBureau()) return;
    const it = (d && d.id && barItem(d.id)) || { cat: 'Plat', moments: ['midi', 'soir'], resa: true, on: true },
      mo = barMoments(it),
      ck = (id, l, on) =>
        `<label class="chk" for="${id}"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}>${l}</label>`;
    S.img = it.img || null;
    sheet(
      it.id ? 'Modifier l’article' : 'Nouvel article',
      `<form class="body" id="bar-form" data-id="${it.id || ''}">${F('b-name', 'Nom', 'Croque-monsieur maison', it.name)}<div class="two">${Sel('b-cat', 'Catégorie', BAR_CATS, it.cat || 'Plat')}${O('b-price', 'Prix', '6 €', it.price)}</div>${O('b-desc', 'Description (facultative)', 'Ingrédients, taille…', it.desc)}
 <div class="fld"><label for="a-img">Photo (facultative)</label><input type="file" id="a-img" accept="image/*"><div class="prev" id="a-prev" ${it.img ? `style="background-image:url(${it.img})"` : 'hidden'}></div></div>
 <div class="fld"><span class="lb">Servi</span>${ck('b-midi', 'Le midi', mo.includes('midi'))}${ck('b-soir', 'Le soir', mo.includes('soir'))}</div>
 <div class="fld"><span class="lb">Réservation</span>${ck('b-resa', 'Réservable à l’avance (repas préparés pour le lendemain)', it.resa)}${ck('b-on', 'Disponible en ce moment', it.on !== false)}</div>
 <button class="btn full">${it.id ? 'Enregistrer' : 'Ajouter à la carte'}</button>${it.id ? `<button type="button" class="btn full ghost" data-a="barDel" data-id="${it.id}">${ic('trash')}Retirer de la carte</button>` : ''}</form>`
    );
  },
  barDel(d) {
    const i = BAR.findIndex(x => x.id === d.id);
    if (i < 0) return;
    const x = BAR.splice(i, 1)[0];
    closeSheet();
    render(true);
    toast('Article retiré de la carte', () => BAR.splice(i, 0, x));
  },
  /* réserver un article pour le jour et le moment choisis */
  barBook(d) {
    const it = barItem(d.id),
      B = S.bar;
    if (!it) return;
    if (!barOpen(B.d)) return toast('Les réservations pour ce jour sont closes');
    const kids = ((M[ME()] && M[ME()].kids) || []).filter(k => M[k]),
      who = kids.length ? Who('o-who', 'Pour', [ME(), ...kids]) : '';
    sheet(
      'Réserver',
      `<form class="body" id="order-form" data-id="${it.id}"><div class="note"><b>${esc(it.name)}</b>${it.price ? ' · ' + esc(it.price) : ''}<br>${barDay(B.d)} · ${MOMENT[B.m].toLowerCase()} · à régler au bar</div>${who}${Sel('o-qty', 'Quantité', ['1', '2', '3', '4', '5', '6'], '1')}${O('o-note', 'Précision (facultative)', 'Sans oignons, bien cuit…')}<p class="muted small">Tu peux annuler jusqu'à la veille, ${barCut()} h.</p><button class="btn full">Réserver</button></form>`
    );
  },
  barCancel(d) {
    const o = ORDERS.find(x => x.id === d.id);
    if (!o) return;
    if (!barOpen(o.date)) return toast('Trop tard pour annuler : la commande est déjà préparée');
    o.st = 'annule';
    render(true);
    toast('Réservation annulée', () => {
      o.st = 'ok';
    });
  },
  /* bureau : marquer une commande servie (ou revenir en arrière) */
  barServe(d) {
    const o = ORDERS.find(x => x.id === d.id);
    if (!o || !isBureau()) return;
    o.st = o.st === 'servi' ? 'ok' : 'servi';
    render(true);
  }
});
/* notification d'une réservation (bureau) : ouvre les commandes du jour concerné */
const barNgo = A.ngo;
A.ngo = d => {
  const n = NOTIFS[+d.i],
    g = n && n.go;
  if (g && g.v === 'bar') {
    closeSheet();
    n.n = 0;
    Object.assign(S.bar, { v: 'cmd', d: g.d || isoIn(1) });
    S.clubTab = 'bar';
    A.tab({ t: 'club' });
    return;
  }
  barNgo(d);
};
document.addEventListener('submit', e => {
  const f = e.target,
    val = id => {
      const x = $(id);
      return x ? x.value.trim() : '';
    };
  if (f.id === 'bar-form') {
    const moments = ['midi', 'soir'].filter(m => $('b-' + m).checked);
    if (!moments.length) return toast('Choisis au moins le midi ou le soir');
    const it = barItem(f.dataset.id) || { id: barId('b') };
    Object.assign(it, {
      name: val('b-name'),
      cat: val('b-cat'),
      price: val('b-price'),
      desc: val('b-desc'),
      moments,
      resa: $('b-resa').checked,
      on: $('b-on').checked
    });
    if (S.img) it.img = S.img;
    else delete it.img;
    S.img = null;
    if (!barItem(it.id)) BAR.push(it);
    closeSheet();
    render(true);
    toast(f.dataset.id ? 'Article mis à jour' : 'Article ajouté à la carte');
  }
  if (f.id === 'order-form') {
    const it = barItem(f.dataset.id),
      B = S.bar;
    if (!it) return;
    ORDERS.push({
      id: barId('o'),
      by: val('o-who') || ME(),
      item: it.id,
      name: it.name,
      price: it.price || '',
      date: B.d,
      moment: B.m,
      qty: +val('o-qty') || 1,
      note: val('o-note'),
      st: 'ok',
      at: Date.now()
    });
    closeSheet();
    render(true);
    toast(`Réservé : ${it.name}, ${barDay(B.d).toLowerCase()} ${MOMENT[B.m].toLowerCase()}`);
  }
});
