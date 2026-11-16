/* /RAM JA — Éditeur du juge-arbitre (charte /RAM) */
(function () {
  'use strict';
  const E = Engine, A = App, esc = A.esc;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const TABS = ['tournoi', 'inscriptions', 'tirage', 'tableaux', 'programmation', 'direct', 'diffusion'];
  let S = null, R = {}, tab = 'tournoi', modal = null, templates = null, dragging = false;
  const send = (t, p) => A.send(t, p).catch(() => {});

  /* ---------------- toasts ---------------- */
  A.toast = (msg, kind) => {
    const d = document.createElement('div');
    d.className = 'toast ' + (kind || '');
    d.textContent = msg;
    $('#toasts').appendChild(d);
    setTimeout(() => d.classList.add('out'), 2600);
    setTimeout(() => d.remove(), 3100);
  };

  /* ---------------- navigation ---------------- */
  function setTab(t) {
    if (!TABS.includes(t)) t = 'tournoi';
    tab = t;
    $$('#nav button[data-tab]').forEach(b => { b.classList.toggle('on', b.dataset.tab === t); b.setAttribute('aria-selected', b.dataset.tab === t); });
    psSecSync(t);
    // téléphone : une section rangée dans « Plus » allume le bouton « Plus »
    const plusOn = !!$('#nav button.m-plus[data-tab="' + t + '"]');
    $$('#nav [data-plus]').forEach(b => b.classList.toggle('on', plusOn));
    $$('#moreSheet [data-goto]').forEach(b => b.classList.toggle('on', b.dataset.goto === t));
    $$('.tab').forEach(s => s.classList.toggle('on', s.id === 'tab-' + t));
    try { localStorage.setItem('padelja-tab', t); } catch (e) {}
    render();
  }
  $$('#nav button[data-tab]').forEach(b => b.onclick = () => setTab(b.dataset.tab));

  /* téléphone : sélecteur « Section ▾ » sous la barre du haut ; il ouvre la liste
     des sections dans une fenêtre du bas (r-sheet). */
  const secLabel = b => esc(b.querySelector('.lg') ? b.querySelector('.lg').textContent : b.dataset.tab);
  const secIcon = b => (b.querySelector('svg') || {}).outerHTML || '';
  (function sectionPicker() {
    const appbar = $('#appbar');
    if (!appbar) return;
    const bar = document.createElement('div'); bar.className = 'ps-secbar';
    bar.innerHTML = '<span class="r-selectw"><button type="button" class="r-select" id="psSec" aria-haspopup="dialog"></button></span>';
    appbar.after(bar);
    const wrap = document.createElement('div'); wrap.className = 'ps-secwrap'; wrap.id = 'psSecs'; wrap.hidden = true;
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-label', 'Sections du tournoi');
    wrap.innerHTML = '<div class="r-sheet"><b>Sections</b><div class="r-list">' + $$('#nav button[data-tab]').map(b =>
      `<button type="button" class="r-row" data-sec-tab="${b.dataset.tab}"><span class="r-row__ic">${secIcon(b)}</span><span class="r-row__txt"><b>${secLabel(b)}</b></span></button>`).join('') + '</div></div>';
    document.body.appendChild(wrap);
    const close = () => { wrap.hidden = true; };
    $('#psSec').onclick = () => { wrap.hidden = false; };
    wrap.addEventListener('click', e => {
      if (e.target === wrap) return close();
      const r = e.target.closest('[data-sec-tab]'); if (!r) return;
      close(); setTab(r.dataset.secTab); scrollTo({ top: 0 });
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !wrap.hidden) close(); });
  })();
  /* ---------- pictos au trait des boutons-icônes et des menus « … » ---------- */
  const psIc = d => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const PSI = {
    play: psIc('<path d="M7 4l13 8-13 8z"/>'), edit: psIc('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'),
    more: psIc('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'),
    up: psIc('<path d="M6 15l6-6 6 6"/>'), down: psIc('<path d="M6 9l6 6 6-6"/>'), x: psIc('<path d="M6 6l12 12M18 6L6 18"/>'),
    flag: psIc('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'), del: psIc('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    undo: psIc('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'), paste: psIc('<rect x="6" y="4" width="12" height="17"/><path d="M9 4V2h6v2M9 10h6M9 14h6"/>'),
    left: psIc('<path d="M15 6l-6 6 6 6"/>'), right: psIc('<path d="M9 6l6 6-6 6"/>')
  };
  /* menu « … » : liste d'actions (r-menu) sous le bouton ; Échap ou un clic ailleurs le ferme.
     items : [libellé, picto, action, danger] ; les entrées fausses sont ignorées */
  let psMenuEl = null;
  function psMenuClose() { if (psMenuEl) { psMenuEl.remove(); psMenuEl = null; } }
  function psMenu(btn, items) {
    const was = psMenuEl && psMenuEl._for === btn; psMenuClose(); if (was) return;
    const m = document.createElement('div'); m.className = 'r-menu ps-pop'; m.setAttribute('role', 'menu'); m._for = btn; m._t = Date.now();
    const list = items.filter(Boolean);
    m.innerHTML = list.map(([l, ic, , d], i) => `<button type="button" role="menuitem" data-i="${i}"${d ? ' class="danger"' : ''}>${ic || ''}<span>${esc(l)}</span></button>`).join('');
    document.body.appendChild(m); psMenuEl = m;
    const r = btn.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
    m.style.top = (r.bottom + h + 8 > innerHeight && r.top - h - 4 > 0 ? r.top - h - 4 : r.bottom + 4) + 'px';
    m.onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; const f = list[+b.dataset.i][2]; psMenuClose(); f(); };
    m.querySelector('button').focus();
  }
  document.addEventListener('click', e => { if (psMenuEl && !psMenuEl.contains(e.target) && !(psMenuEl._for && psMenuEl._for.contains(e.target))) psMenuClose(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && psMenuEl) { const b = psMenuEl._for; psMenuClose(); if (b) b.focus(); } });
  // le défilement ferme le menu, sauf celui que le clic d'ouverture vient de provoquer
  addEventListener('scroll', () => { if (psMenuEl && Date.now() - psMenuEl._t > 400) psMenuClose(); }, { passive: true });
  /* carte de terrain du Direct (maquette, point 5) : une ligne par paire, une case par set, le set gagné en citron */
  function psCourtCard(c, m, PS) {
    const r = R[m.id], sc = r.score;
    const tag = { live: '<span class="tag ps-st-live">En direct</span>', done: '<span class="tag ps-st-done">Terminé</span>', ready: '<span class="tag">Prêt</span>' }[r.state] || '<span class="tag">En attente</span>';
    const sets = sc ? sc.sets : [];
    const cur = r.state === 'live' && sc && !sc.manual && !sc.winner && sc.mode === 'game';
    const line = side => {
      const boxes = sets.map(s => `<i class="${s.w === side ? 'w' : ''}">${s.stb ? s.stb[side] : s[side]}</i>`).join('') + (cur ? `<i class="cur">${sc.games[side]}</i>` : '');
      const strong = r.winner ? r.winner === r[side] : sc && sc.server === side && r.state === 'live';
      return `<div class="ps-cl${strong ? ' on' : ''}"><span>${esc(A.sideName(m, side))}</span>${r.state === 'ready' || r.state === 'waiting' ? A.restBadge(PS[r[side]]) : ''}<span class="ps-sets">${boxes}</span></div>`;
    };
    return `<div class="lcard ps-court st-${r.state}" data-o="${m.id}" role="button" tabindex="0" aria-label="${esc(c.name)} : saisir le score">
      <div class="ps-ch"><b>${esc(c.name)}</b><small>${esc(E.matchLabel(m))}</small>${tag}</div>${line('A')}${line('B')}
      ${r.state === 'ready' ? `<div class="btns"><button class="accent sm" data-st="${m.id}">${PSI.play}Lancer</button></div>` : ''}</div>`;
  }
  /* ---------- en-tête, intercalaires et colonnes de droite (maquette « Refonte /Pista ») ---------- */
  const secName = t => { const b = $('#nav button[data-tab="' + t + '"] .lg'); return b ? b.textContent : t; };
  // une seule action citron par en-tête : sur Inscriptions, « Ajouter » est déjà dans la Saisie rapide et Écran TV garde le citron
  const PS_ACT = { tournoi: 'Enregistrer', programmation: 'Programmation automatique', direct: 'Saisir un score', diffusion: 'Ouvrir l’écran TV' };
  function psTitles(t) {
    $('#hTag').textContent = [t.name || 'Tournoi', [t.category, t.gender].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
    $('#hName').textContent = secName(tab);
    $('#abTitle').textContent = secName(tab);
    $('#abSub').textContent = t.name || 'Tournoi';
    const act = $('#psAct');
    const lab = tab === 'tirage' && S && !S.draw ? 'Lancer le tirage' : PS_ACT[tab];
    if (act) { act.hidden = !lab; act.lastChild.textContent = lab || ''; }
    document.body.dataset.psTab = tab;
  }
  (function psInit() {
    // en-tête : Annuler, PDF, action de l'écran, Écran TV ; Overlay et l'aide passent dans « … »
    $('#btnPrint').textContent = 'PDF';
    const act = document.createElement('button');
    act.type = 'button'; act.id = 'psAct'; act.className = 'accent'; act.hidden = true;
    act.innerHTML = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg><span></span>';
    act.onclick = () => {
      if (tab === 'programmation') return $('#schedAuto').click();
      if (tab === 'tirage') { const d = $('#doDraw'); if (d) d.click(); return; }
      if (tab === 'diffusion') return $('#btnTv').click();
      if (tab === 'tournoi') { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); return A.toast('Fiche enregistrée', 'ok'); }
      if (tab === 'inscriptions') { const i = $('#addPair input[name="l1"]'); if (i) { i.scrollIntoView({ block: 'center' }); i.focus(); } return; }
      if (tab === 'direct') {
        const m = S && S.matches.find(x => R[x.id] && R[x.id].state === 'live') || S && S.matches.find(x => R[x.id] && R[x.id].state === 'ready');
        if (m) openMatchModal(m.id); else A.toast('Aucun match en cours');
      }
    };
    $('#btnTv').before(act);
    const more = document.createElement('button');
    more.type = 'button'; more.id = 'psMore'; more.className = 'sq'; more.setAttribute('aria-label', 'Plus d\'actions : overlay, export, aide');
    more.innerHTML = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';
    $('#btnHelp').after(more);
    // Programmation : « Vider (non commencés) » passe dans ce menu « … » ; ailleurs, la feuille des actions
    more.onclick = () => tab === 'programmation' ? psMenu(more, [['Vider les matchs non commencés', PSI.x, () => $('#schedClear').click(), true], ['Autres actions', PSI.more, () => $('#abMore').click()]]) : $('#abMore').click();
    // « ‹ » du sous-menu (44 px) : replie la colonne 2 ; « › » dans l'en-tête la rouvre (choix gardé sur l'appareil)
    const fold = document.createElement('button'); fold.type = 'button'; fold.className = 'ps-fold'; fold.setAttribute('aria-label', 'Replier le menu du tournoi'); fold.innerHTML = PSI.left;
    $('.side-t').appendChild(fold);
    const unfold = document.createElement('button'); unfold.type = 'button'; unfold.className = 'ps-unfold'; unfold.setAttribute('aria-label', 'Afficher le menu du tournoi'); unfold.innerHTML = PSI.right;
    $('.top').prepend(unfold);
    const setFold = on => { document.body.classList.toggle('ps-folded', on); try { localStorage.setItem('pista-sous-menu', on ? 'replie' : ''); } catch (e) {} };
    try { if (localStorage.getItem('pista-sous-menu') === 'replie') document.body.classList.add('ps-folded'); } catch (e) {}
    fold.onclick = () => { setFold(true); unfold.focus(); };
    unfold.onclick = () => { setFold(false); fold.focus(); };
    // « Coller une liste depuis Excel / MOJA » : bouton-icône à côté de « Ajouter la paire », il ouvre la zone de collage
    const add = $('#addPair > button.accent'), paste = $('#tab-inscriptions details.paste');
    if (add && paste) {
      add.innerHTML = psIc('<path d="M12 5v14M5 12h14"/>') + 'Ajouter la paire';
      const pb = document.createElement('button'); pb.type = 'button'; pb.className = 'ps-ib ps-pastebtn'; pb.setAttribute('aria-label', 'Coller une liste depuis Excel ou MOJA'); pb.title = 'Coller une liste depuis Excel / MOJA'; pb.innerHTML = PSI.paste;
      const row = document.createElement('div'); row.className = 'ps-addrow'; add.before(row); row.append(add, pb);
      pb.onclick = () => { paste.open = !paste.open; pb.setAttribute('aria-expanded', paste.open); if (paste.open) $('#pasteArea').focus(); };
      paste.classList.add('ps-paste');
    }
    // Inscriptions : intercalaires Retenues / Attente / Forfaits sur la liste
    const list = $('#tblMain').closest('.card');
    list.classList.add('ps-inslist'); list.dataset.psList = 'main';
    $('#addPair').closest('.card').classList.add('ps-insform');
    const it = document.createElement('div'); it.className = 'r-itabs ps-itabs'; it.id = 'psInsTabs'; it.setAttribute('role', 'tablist');
    list.before(it);
    it.addEventListener('click', e => { const b = e.target.closest('[data-l]'); if (!b) return; list.dataset.psList = b.dataset.l; $$('button', it).forEach(x => x.setAttribute('aria-selected', x === b)); });
    // Programmation : intercalaires Terrains et horaires / Ordre des matchs
    const sec = $('#tab-programmation'); sec.dataset.psView = 'sched';
    $('#sched').closest('.card').classList.add('ps-schedcard');
    const pt = document.createElement('div'); pt.className = 'r-itabs ps-itabs'; pt.setAttribute('role', 'tablist');
    pt.innerHTML = '<button type="button" role="tab" data-v="sched" aria-selected="true">Terrains et horaires</button><button type="button" role="tab" data-v="order" aria-selected="false">Ordre des matchs</button>';
    $('#orderCard').before(pt);
    pt.addEventListener('click', e => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      sec.dataset.psView = b.dataset.v; $$('button', pt).forEach(x => x.setAttribute('aria-selected', x === b));
      if (b.dataset.v === 'order') { $('#orderBody').hidden = false; $('#orderCard').classList.add('open'); }
    });
    // Écran TV & stream (maquette, écran 3) : vues en tuiles avec picto, Stream (overlay) avec le fond en segmenté, carte Télécommande
    const dif = $('#tab-diffusion'), dg = $('.grid2', dif);
    if (dg) {
      const VIEW_IC = { bracket: '<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M12 13v4M8 21h8M9 17h6"/>', poules: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
        schedule: '<rect x="3" y="5" width="18" height="16"/><path d="M3 10h18M8 3v4M16 3v4"/>', live: '<circle cx="12" cy="12" r="2.5"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4"/>',
        standings: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>', info: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>', stats: '<path d="M4 20h16M7 16v-5M12 16V6M17 16v-8"/>', draw: '<path d="M4 7h3l10 10h3M4 17h3l3-3M14 10l3-3h3M17 4l3 3-3 3M17 14l3 3-3 3"/>' };
      $$('#tvViews [data-tv]').forEach(b => { const k = b.querySelector('b'); b.title = 'Touche ' + (k ? k.textContent : ''); if (k) k.replaceWith(document.createRange().createContextualFragment(psIc(VIEW_IC[b.dataset.tv] || ''))); });
      const [tvc, stc] = $$(':scope > .card', dg);
      $('h3', tvc).innerHTML = psIc('<rect x="3" y="5" width="18" height="12"/><path d="M8 21h8M12 17v4"/>') + 'Télévision';
      $('#tvViews').insertAdjacentHTML('beforebegin', '<span class="ps-lbl">Vue affichée</span>');
      $('h3', stc).innerHTML = psIc('<circle cx="12" cy="12" r="2.5"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>') + 'Stream (overlay)';
      // fond de l'overlay en segmenté : Vert, Transparent, Bleu (le choix passe par la liste d'origine, cachée)
      const obg = $('#overlayBg'), obgLab = obg.closest('label');
      obgLab.hidden = true;
      obgLab.insertAdjacentHTML('afterend', `<div class="ps-obgw span2"><span class="ps-lbl">Fond</span><div class="seg ps-obg" role="tablist" aria-label="Fond de l'overlay">${[['green', 'Vert'], ['transparent', 'Transparent'], ['blue', 'Bleu']].map(([v, l]) => `<button type="button" role="tab" data-obg="${v}">${l}</button>`).join('')}</div></div>`);
      $$('[data-obg]', stc).forEach(b => b.onclick = () => { obg.value = b.dataset.obg; obg.dispatchEvent(new Event('change')); $$('[data-obg]', stc).forEach(x => x.setAttribute('aria-selected', x === b)); });
      const ob2 = $('#btnOverlay2'); if (ob2) { ob2.closest('label').replaceWith(ob2); ob2.classList.add('ps-obtn'); ob2.innerHTML = psIc('<path d="M12 15V3M7 8l5-5 5 5M4 15v6h16v-6"/>') + 'Ouvrir l’overlay'; }
      const t2 = $('#btnTv2'); if (t2) t2.closest('.btns').hidden = true;   // « Ouvrir l'écran TV » est dans l'en-tête
      // colonne de droite : Stream, puis Télécommande (code PIN et liens dans une zone qui s'ouvre)
      const side = document.createElement('div'); side.className = 'ps-dcol';
      stc.before(side); side.appendChild(stc);
      const rc = document.createElement('section'); rc.className = 'card';
      rc.innerHTML = `<h3>${psIc('<rect x="7" y="2" width="10" height="20"/><path d="M11 18h2"/>')}Télécommande</h3><p class="muted small">Changez la vue et saisissez les scores depuis votre téléphone : ouvrez le lien de la télécommande et tapez le code PIN.</p>
        <div class="btns"><button type="button" id="psRcShow" aria-expanded="false">${psIc('<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2"/>')}Afficher le code</button></div>`;
      side.appendChild(rc);
      const urls = $('#urls'); rc.appendChild(urls); urls.hidden = true;
      $('#psRcShow', rc).onclick = () => { urls.hidden = !urls.hidden; $('#psRcShow', rc).setAttribute('aria-expanded', !urls.hidden); };
    }
    // Direct : colonne de droite Repos des joueurs (jauges) et À suivre
    const side = document.createElement('aside'); side.className = 'ps-dside';
    side.innerHTML = '<section class="card"><h3><svg class="pic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/></svg>Repos des joueurs</h3><div id="psRest" class="ps-rest"></div></section>'
      + '<section class="card"><h3><svg class="pic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>À suivre</h3><div id="psNext" class="ps-next"></div></section>';
    $('#liveList').closest('.card').after(side);
  })();
  function psInsTabs(sel) {
    const it = $('#psInsTabs'); if (!it) return;
    const cur = $('#tblMain').closest('.card').dataset.psList || 'main';
    it.innerHTML = [['main', 'Retenues', sel.main.length + '/' + S.tournament.maxPairs], ['wait', 'Attente', sel.waiting.length], ['wd', 'Forfaits', sel.withdrawn.length]]
      .map(([k, l, n]) => `<button type="button" role="tab" data-l="${k}" aria-selected="${k === cur}">${l} · ${n}</button>`).join('');
  }
  function psDirect(tl, PS) {
    const rest = $('#psRest'), next = $('#psNext'); if (!rest || !next) return;
    if (!PS) { rest.innerHTML = '<p class="muted">Aucune paire en jeu pour l\'instant.</p>'; next.innerHTML = '<p class="muted">Aucun match programmé.</p>'; return; }
    // une ligne par paire qui a joué ou joue : jauge verte (peut rejouer) ou rose (repos en cours)
    const order = { playing: 0, rest: 1, ready: 2 };
    const l = Object.values(PS).filter(x => x.state in order).sort((a, b) => order[a.state] - order[b.state] || (a.restLeft || 0) - (b.restLeft || 0)).slice(0, 8);
    rest.innerHTML = l.map(x => {
      const tot = x.restUntil && x.lastEnd ? x.restUntil - x.lastEnd : 0;
      // repos : jauge rose qui se vide avec le temps restant ; prête : jauge verte pleine ; en jeu : étiquette, sans jauge
      const pct = x.state === 'rest' ? (tot ? Math.max(4, Math.round(100 * x.restLeft / tot)) : 100) : 100;
      const txt = x.state === 'rest' ? 'prête dans ' + A.dur(x.restLeft) : 'peut rejouer';
      const fin = x.state === 'playing' ? '<span class="tag ps-enjeu">En jeu</span>' : `<small>${txt}</small><span class="r-gauge ${x.state === 'ready' ? 'r-gauge--green' : ''}"><i style="width:${pct}%"></i></span>`;
      return `<div class="ps-rrow ps-r-${x.state}"><b>${esc(A.pairName(x.pair, 'initial'))}</b>${fin}</div>`;
    }).join('') || '<p class="muted">Aucune paire n\'a encore joué.</p>';
    // à suivre : les prochains matchs programmés, par heure
    const nx = S.matches.filter(m => m.court && R[m.id] && (R[m.id].state === 'ready' || R[m.id].state === 'waiting') && tl[m.id]).sort((a, b) => tl[a.id].start - tl[b.id].start).slice(0, 5);
    next.innerHTML = nx.map(m => `<button type="button" class="r-row" data-o="${m.id}"><span class="ps-nh">${A.hhmm(tl[m.id].start)}</span><span class="r-row__txt"><b>${esc(A.sideName(m, 'A'))}</b><span class="ps-contre">contre ${esc(A.sideName(m, 'B'))}</span><small>M${m.num} · ${esc(A.courtName(m.court))}</small></span></button>`).join('') || '<p class="muted">Aucun match programmé.</p>';
    $$('[data-o]', next).forEach(b => b.onclick = () => openMatchModal(b.dataset.o));
  }
  function psSecSync(t) {
    if (S) psTitles(S.tournament);
    const btn = document.getElementById('psSec'), b = $('#nav button[data-tab="' + t + '"]');
    if (!btn || !b) return;
    const all = $$('#nav button[data-tab]'), i = all.indexOf(b) + 1;
    btn.innerHTML = '<span class="ps-sec-t"><small>Section</small><b>' + secIcon(b) + secLabel(b) + '</b></span><em>' + i + '/' + all.length + '</em>';
    btn.setAttribute('aria-label', 'Section : ' + (b.querySelector('.lg') || b).textContent.trim() + ', changer de section');
    $$('#psSecs [data-sec-tab]').forEach(r => { if (r.dataset.secTab === t) r.setAttribute('aria-current', 'true'); else r.removeAttribute('aria-current'); });
  }

  // état de la connexion : barre latérale + pastille visible partout (téléphone compris) quand on est hors ligne
  const offPill = document.createElement('div'); offPill.className = 'offline-pill'; offPill.hidden = true; document.body.appendChild(offPill);
  const showConn = ok => {
    const n = A.pending(), c = $('#conn');
    c.className = 'conn ' + (ok && !n ? 'on' : 'off');
    c.textContent = ok ? (n ? `Envoi de ${n} action(s)…` : 'Connecté · sauvegarde auto') : (n ? `Hors ligne · ${n} en attente` : 'Hors ligne');
    offPill.hidden = ok && !n;
    offPill.textContent = ok ? `Envoi de ${n} action(s) en attente…` : `Hors ligne${n ? ` · ${n} action${n > 1 ? 's' : ''} en attente` : ''} — tout est gardé sur cet appareil`;
  };
  A.connect(() => { S = A.state; R = A.R; render(); }, showConn);
  document.addEventListener('padelja-queue', () => showConn(A.connected));
  // rafraîchit les chronos de repos
  setInterval(() => { if (S && !dragging && !modal && (tab === 'direct' || tab === 'programmation')) render(); }, 15000);

  function render() {
    if (!S) return;
    const t = S.tournament;
    $('#hName').textContent = t.name || 'Tournoi';
    $('#hTag').textContent = `${t.category} · ${t.gender}`;
    $('#abTitle').textContent = t.name || 'Tournoi';
    $('#abSub').textContent = `${t.category} ${t.gender}${t.closed ? ' · clôturé' : ''}`;
    const nM = S.matches.length, nD = S.matches.filter(m => m.status === 'done').length;
    $('#sName').textContent = t.name || 'Tournoi';
    $('#sSub').textContent = [t.category, t.gender, t.dateStart && new Date(t.dateStart).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ');
    $('#sState').textContent = t.closed ? 'Clôturé' : S.draw && nM ? (nD < nM ? `${nD}/${nM} matchs joués` : 'Matchs terminés') : `${S.pairs.filter(p => !p.withdrawn).length} paires inscrites`;
    $('#sState').className = 'side-st' + (t.closed ? ' fin' : S.draw && nM && nD < nM ? ' live' : '');
    $('#hSub').textContent = [E.FORMULAS[t.formula || 'tf'], t.club, t.dateStart && new Date(t.dateStart).toLocaleDateString('fr-FR')].filter(Boolean).join(' · ');
    psTitles(t);
    // pastille du nombre de paires sur Inscriptions ; point citron sur Direct quand un match se joue
    const nIns = $('#nav [data-tab="inscriptions"]'), nDir = $('#nav [data-tab="direct"]');
    if (nIns) { let pc = $('.r-pastille', nIns); if (!pc) { pc = document.createElement('span'); pc.className = 'r-pastille'; nIns.appendChild(pc); } pc.textContent = S.pairs.filter(p => !p.withdrawn).length; }
    if (nDir) { const on = S.matches.some(m => R[m.id] && R[m.id].state === 'live'); let d = $('.ps-dot', nDir); if (on && !d) { d = document.createElement('span'); d.className = 'ps-dot'; d.setAttribute('aria-label', 'match en cours'); nDir.appendChild(d); } if (!on && d) d.replaceWith(); }
    $('#btnUndo').disabled = !A.canUndo || !!t.closed;
    $('#closedBar').hidden = !t.closed;
    if (t.closed) $('#closedAt').textContent = 'le ' + new Date(t.closedAt).toLocaleDateString('fr-FR');
    document.body.classList.toggle('is-closed', !!t.closed);
    const ann = [`${t.name}`, `${t.category} ${t.gender}`, t.club, t.balls && 'Balles : ' + t.balls, t.prize].concat((t.sponsors || []).map(s => s.name)).concat('/RAM — Rise And Move').filter(Boolean).join('   ·   ');
    A.marquee($('#annonce'), `<span>${esc(ann)}</span>`, 60);
    ({ tournoi: renderTournoi, inscriptions: renderInscriptions, tirage: renderTirage, tableaux: renderTableaux, programmation: renderSched,
       direct: renderDirect, diffusion: renderDiffusion })[tab]();
    if (modal) modal.render();
  }

  /* =====================================================================
     01 · FICHE TOURNOI
     ===================================================================== */
  const fmtOptions = empty => (empty ? `<option value="">${empty}</option>` : '') +
    E.FORMAT_KEYS.map(k => `<option value="${k}">${k} — ${E.FORMATS[k].name}</option>`).join('');
  $$('select.fmt').forEach(s => { s.innerHTML = fmtOptions(s.dataset.empty); });
  $('#durs').innerHTML = Object.keys(E.DEFAULT_DUR).map(k => `<label>Format ${k}<input type="number" min="5" max="240" data-d="${k}"></label>`).join('');

  $$('[data-f]').forEach(el => el.addEventListener('change', () => {
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'number') v = +v;
    send('tournament/update', { [el.dataset.f]: v });
  }));
  $$('[data-c]').forEach(el => el.addEventListener('change', () => send('tournament/update', { colors: Object.assign({}, S.tournament.colors, { [el.dataset.c]: el.value }) })));
  $$('[data-d]').forEach(el => el.addEventListener('change', () => send('tournament/update', { durations: Object.assign({}, S.tournament.durations, { [el.dataset.d]: +el.value }) })));
  $('#ramColors').onclick = () => send('tournament/update', { colors: Object.assign({}, E.RAM_COLORS), look: Object.assign({}, E.DEFAULT_LOOK) });
  $$('[data-look]').forEach(el => el.addEventListener('change', () => {
    const v = el.type === 'checkbox' ? el.checked : el.value;
    send('tournament/update', { look: Object.assign({}, E.DEFAULT_LOOK, S.tournament.look, { [el.dataset.look]: v }) });
  }));
  /* image réduite automatiquement (logos légers, quel que soit le fichier d'origine) */
  function loadImage(file, maxH, maxW) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Choisissez une image (PNG, JPG, SVG…)'));
      const rd = new FileReader();
      rd.onload = () => {
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, maxH / img.height, maxW / img.width);
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('Image illisible'));
        img.src = rd.result;
      };
      rd.readAsDataURL(file);
    });
  }
  /* logo du club / tournoi en 3 versions : chaque écran prend la plus lisible sur son fond */
  const LOGOS = [['logo', 'Couleur', 'Version principale'], ['logoLight', 'Claire / blanche', 'Sur fond sombre : écran TV, overlay'], ['logoDark', 'Sombre / noire', 'Sur fond clair : impressions et PDF']];
  function renderLogos() {
    const t = S.tournament;
    $('#logos3').innerHTML = LOGOS.map(([k, l, h]) => `<div class="lg3">
      <label class="lg3-box ${k}" title="Choisir une image">${t[k] ? `<img src="${t[k]}" alt="">` : '<em>+ Logo</em>'}<input type="file" accept="image/*" hidden data-lg="${k}"></label>
      <b>${l}</b><small>${h}</small>${t[k] ? `<button class="ghost sm" data-lgrm="${k}">Retirer</button>` : ''}</div>`).join('');
    $$('[data-lg]').forEach(inp => inp.onchange = e => {
      loadImage(e.target.files[0], 260, 700).then(src => send('tournament/update', { [inp.dataset.lg]: src })).catch(err => A.toast(err.message, 'err'));
      e.target.value = '';
    });
    $$('[data-lgrm]').forEach(b => b.onclick = () => send('tournament/update', { [b.dataset.lgrm]: '' }));
    // sponsor principal du tournoi (mis en avant sur la fiche tournoi de l'écran TV)
    $('#spmLogo').innerHTML = `<label class="lg3-box spm-box" title="Choisir le logo du sponsor">${t.sponsorLogo ? `<img src="${t.sponsorLogo}" alt="">` : '<em>+ Logo du sponsor</em>'}<input type="file" accept="image/*" hidden id="spmFile"></label>
      ${t.sponsorLogo ? '<button class="ghost sm" id="spmRm">Retirer le logo</button>' : ''}`;
    $('#spmFile').onchange = e => {
      loadImage(e.target.files[0], 300, 800).then(src => send('tournament/update', { sponsorLogo: src })).catch(err => A.toast(err.message, 'err'));
      e.target.value = '';
    };
    if ($('#spmRm')) $('#spmRm').onclick = () => send('tournament/update', { sponsorLogo: '' });
  }
  $('#addCourt').onclick = () => send('court/add', {});

  /* ---------- clôture, réouverture, remises à zéro ---------- */
  const closeT = async () => {
    const left = S.matches.filter(m => !R[m.id].staticBye && R[m.id].state !== 'done').length;
    const msg = (left ? `Attention : ${left} match(s) ne sont pas terminés : les paires concernées seront classées à la place la moins favorable.\n\n` : '') +
      'Clôturer le tournoi ?\n\nLes joueurs et leurs résultats seront enregistrés dans la base de joueurs (fiches, historiques, saisie semi-automatique). Le tournoi passera en lecture seule ; vous pourrez le rouvrir.';
    if (!confirm(msg)) return;
    const d = await A.api('/api/tournaments/' + A.tid + '/close', { method: 'POST' });
    if (d.error) return A.toast(d.error, 'err');
    A.toast(d.guest ? 'Tournoi clôturé (mode démo : aucun joueur enregistré)' : `Tournoi clôturé : ${d.saved} joueur(s) enregistré(s) dans la base`, 'ok');
  };
  const reopenT = () => confirm('Rouvrir le tournoi pour le modifier ? Les résultats seront réenregistrés à la prochaine clôture.') &&
    A.api('/api/tournaments/' + A.tid + '/reopen', { method: 'POST' }).then(() => A.toast('Tournoi rouvert', 'ok'));
  $('#reopen2').onclick = reopenT;
  $('#rzScores').onclick = () => confirm('Effacer tous les scores ? Le tirage et la programmation sont conservés.') && send('tournament/reset', { level: 'scores' });
  $('#rzDraw').onclick = () => confirm('Recommencer le tirage au sort ? Tous les matchs et scores seront supprimés ; les inscriptions sont conservées.') && send('tournament/reset', { level: 'draw' });
  $('#rzAll').onclick = () => confirm('TOUT remettre à zéro ? Les paires inscrites, le tirage et les scores seront supprimés. Seule la configuration est conservée.') &&
    confirm('Confirmez-vous la suppression de toutes les inscriptions ?') && send('tournament/reset', { level: 'all' });
  function renderManage() {
    const t = S.tournament, closed = !!t.closed;
    const left = S.draw && S.draw.built ? S.matches.filter(m => !R[m.id].staticBye && R[m.id].state !== 'done').length : null;
    $('#closeBox').innerHTML = closed
      ? `<div class="alert ok">Tournoi clôturé le ${new Date(t.closedAt).toLocaleString('fr-FR')}. Les joueurs et leurs résultats sont dans la base.</div><div class="btns"><button class="ghost" id="reopenBtn">Rouvrir le tournoi</button></div>`
      : `<p class="muted small">À la fin du tournoi, clôturez-le : il passe dans « Tournois clôturés » et chaque joueur est enregistré avec sa place et ses points FFT (fiche, historique, saisie semi-automatique dans vos prochains tournois et ceux des autres juges-arbitres /RAM JA).</p>
         ${left ? `<div class="alert warn">${left} match(s) restant(s) à jouer.</div>` : ''}
         <div class="btns"><button class="accent" id="closeBtn" ${S.draw && S.draw.built ? '' : 'disabled title="Effectuez d\'abord le tirage"'}>Clôturer le tournoi</button></div>`;
    if ($('#closeBtn')) $('#closeBtn').onclick = closeT;
    if ($('#reopenBtn')) $('#reopenBtn').onclick = reopenT;
    ['rzScores', 'rzDraw', 'rzAll'].forEach(k => { $('#' + k).disabled = closed; });
    $('#rzScores').disabled = closed || !S.matches.length;
  }

  /* ---------- partenaires ---------- */
  const sponsors = () => (S.tournament.sponsors || []).map(x => Object.assign({}, x));
  const saveSponsors = list => send('tournament/update', { sponsors: list });
  $('#addSponsor').onclick = () => saveSponsors(sponsors().concat({ id: 's' + Date.now().toString(36), name: '', logo: '' }));
  function renderSponsors() {
    const box = $('#sponsors'), list = sponsors();
    if (box.contains(document.activeElement) && box.dataset.n === String(list.length)) return;   // saisie en cours
    box.dataset.n = list.length;
    box.innerHTML = list.map((s, i) => `<div class="sp-row" data-i="${i}">
      <span class="sp-num">${i + 1}</span>
      <label class="sp-logo">${s.logo ? `<img src="${s.logo}" alt="">` : '<em>+ Logo</em>'}<input type="file" accept="image/*" hidden></label>
      <input class="spn-name" placeholder="Nom (facultatif)" value="${esc(s.name)}">
      ${s.logo ? '<button class="ghost sm" data-rmlogo title="Retirer le logo">Sans logo</button>' : '<span></span>'}
      <button class="ghost sm danger" data-rm title="Supprimer ce partenaire" aria-label="Supprimer ce partenaire"><svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`).join('') || '<p class="muted small">Aucun partenaire pour l\'instant.</p>';
    $$('.sp-row', box).forEach(row => {
      const i = +row.dataset.i;
      $('.spn-name', row).onchange = e => { const l = sponsors(); l[i].name = e.target.value; saveSponsors(l); };
      $('input[type=file]', row).onchange = e => loadImage(e.target.files[0], 120, 480).then(src => { const l = sponsors(); l[i].logo = src; saveSponsors(l); }).catch(err => A.toast(err.message, 'err'));
      const rl = $('[data-rmlogo]', row); if (rl) rl.onclick = () => { const l = sponsors(); l[i].logo = ''; saveSponsors(l); };
      $('[data-rm]', row).onclick = () => { const l = sponsors(); l.splice(i, 1); saveSponsors(l); };
    });
  }

  /* ---------- réglages mémorisés dans le compte ---------- */
  let profile = null, guest = false;
  const loadProfile = () => A.api('/api/profile').then(d => { profile = d.profile; guest = d.guest; if (tab === 'tournoi') renderProfileInfo(); });
  loadProfile();
  function renderProfileInfo() {
    $('#profApply').disabled = !profile;
    $('#profSave').disabled = guest;
    $('#profInfo').textContent = guest ? 'Créez un compte pour mémoriser vos réglages.'
      : profile ? `Réglages mémorisés : ${profile.club || 'club sans nom'}, ${(profile.courts || []).length} terrain(s), ${(profile.sponsors || []).length} partenaire(s)${profile.logo ? ', logo' : ''}.`
      : 'Aucun réglage mémorisé pour l\'instant.';
  }
  $('#profSave').onclick = () => A.api('/api/profile', { method: 'POST', body: JSON.stringify({ tid: A.tid }) }).then(d => {
    if (d.error) return A.toast(d.error, 'err');
    profile = d.profile; renderProfileInfo(); A.toast('Réglages mémorisés pour vos prochains tournois', 'ok');
  });
  $('#profApply').onclick = () => profile && confirm('Remplacer le club, les terrains, le logo, les couleurs et les partenaires de ce tournoi par vos réglages mémorisés ?') && send('profile/apply', { profile });

  function loadTemplates() { return A.api('/api/templates').then(d => { templates = d; if (tab === 'tournoi') renderTemplates(); }); }
  loadTemplates();
  $('#tplSave').onclick = () => {
    openModal(() => `<span class="eyebrow">Modèle</span><h3>Enregistrer ce format</h3>
      <p class="muted">Le modèle mémorise la catégorie, la formule, le nombre de paires, les formats de chaque phase, les terrains et les horaires. Les joueurs ne sont pas enregistrés.</p>
      <form id="tf" class="form"><label class="span2">Nom<input name="name" required placeholder="Ex : Soirée P100 — 4 terrains"></label>
      <label class="span2">Description<input name="desc" placeholder="Ex : 1 set à 9 jeux, 1/2 et finale en 2 sets + super tie-break"></label>
      <div class="span2 btns"><button class="accent">Enregistrer</button><button type="button" class="ghost" data-close>Annuler</button></div></form>`, box => {
      $('#tf', box).onsubmit = e => { e.preventDefault(); A.api('/api/templates', { method: 'POST', body: JSON.stringify({ name: e.target.name.value, desc: e.target.desc.value, tid: A.tid }) }).then(d => { templates = d; closeModal(); renderTemplates(); A.toast('Modèle enregistré', 'ok'); }); };
      $('[name=name]', box).focus();
    }, { static: true });
  };

  function renderTemplates() {
    if (!templates || !S) return;   // modèles reçus avant le tournoi : affichés au premier rendu
    const cur = S.tournament.template;
    const card = (t, mine) => `<div class="tpl ${cur === t.name ? 'cur' : ''}" data-id="${t.id}" data-mine="${mine ? 1 : ''}">
      <span class="tag ${mine ? 'lime' : ''}">${mine ? 'Mon modèle' : 'Prêt à l\'emploi'} · ${esc(t.fields.category || '')}</span>
      <b>${esc(t.name)}</b><p>${esc(t.desc || describeTpl(t))}</p>
      <div class="btns"><button class="sm ${cur === t.name ? 'accent' : ''}" data-apply>${cur === t.name ? 'Appliqué' : 'Appliquer'}</button>${mine ? '<button class="sm ghost danger" data-del>Supprimer</button>' : ''}</div></div>`;
    $('#tplList').innerHTML = templates.mine.map(t => card(t, true)).join('') + templates.presets.map(t => card(t, false)).join('');
    $$('#tplList .tpl').forEach(el => {
      const t = (el.dataset.mine ? templates.mine : templates.presets).find(x => x.id === el.dataset.id);
      $('[data-apply]', el).onclick = () => {
        if (S.draw) return A.toast('Annulez d\'abord le tirage', 'err');
        send('template/apply', { template: t }).then(() => A.toast('Modèle appliqué : ' + t.name, 'ok'));
      };
      const d = $('[data-del]', el); if (d) d.onclick = () => confirm('Supprimer ce modèle ?') && A.api('/api/templates?id=' + t.id, { method: 'DELETE' }).then(x => { templates = x; renderTemplates(); });
    });
  }
  function describeTpl(t) {
    const f = t.fields;
    return `${E.FORMULAS[f.formula] || ''} · ${f.maxPairs} paires · ${(t.courts || []).length} terrains dès ${f.startTime} · format ${f.formatMain}${f.formatFinal ? ', finale ' + f.formatFinal : ''}`;
  }

  function fill(el, v) { if (document.activeElement === el) return; if (el.type === 'checkbox') el.checked = !!v; else if (el.type !== 'file') el.value = v == null ? '' : v; }

  function planChips(P) {
    const c = [];
    c.push(`<span><b>${P.N}</b>paires</span>`);
    if (P.formula === 'qualif_tf') c.push(`<span><b>${P.direct}</b>entrées directes</span>`, `<span><b>${P.qualifPairs}</b>en qualifs (${P.qualifSize} places)</span>`, `<span><b>${P.Q}</b>qualifiés</span>`);
    if (P.sizes) c.push(`<span><b>${P.nP}</b>poule${P.nP > 1 ? 's' : ''} (${P.sizes.join(' · ')})</span>`, `<span><b>${P.matches}</b>matchs de poule</span>`);
    if (P.tfSize) c.push(`<span><b>${P.tfSize}</b>places au TF (${P.tfEntrants} entrants)</span>`);
    return c.join('');
  }

  /* durée réelle moyenne par format (du lancement à la fin du match), recalculée à chaque match terminé */
  function renderRealDurs() {
    if (!S || !$('#realDurs')) return;
    const by = {}, now = Date.now(), add = (fk, key, v) => { const x = by[fk] = by[fk] || { done: [], live: [], quick: 0 }; if (key === 'quick') x.quick++; else x[key].push(v); };
    S.matches.forEach(m => {
      const r = R[m.id]; if (!r || m.wo || !m.startedAt) return;
      if (r.state === 'done' && m.endedAt) {
        const min = (m.endedAt - m.startedAt) / 60000;
        if (min < 1) add(r.fk, 'quick');            // score saisi d'un coup : pas de durée à mesurer
        else if (min <= 300) add(r.fk, 'done', min);
      } else if (m.status === 'live') add(r.fk, 'live', (now - m.startedAt) / 60000);
    });
    const keys = Object.keys(by).sort(), cur = S.tournament.durations || {};
    const avgOf = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
    $('#realDurs').innerHTML = `<h4>Durées réelles de ce tournoi <small class="muted">du lancement (bouton lecture) à la fin du match, mise à jour en continu</small></h4>` + (keys.length
      ? `<div class="rd-list">${keys.map(k => {
        const x = by[k], g = k[0], est = cur[g] || E.DEFAULT_DUR[g], avg = x.done.length ? avgOf(x.done) : null;
        return `<div class="rd"><b>${k}</b>
          ${avg != null ? `<span><strong>${avg} min</strong> en moyenne · ${x.done.length} match${x.done.length > 1 ? 's' : ''} terminé${x.done.length > 1 ? 's' : ''}</span>` : '<span class="muted">Pas encore de match terminé</span>'}
          ${x.live.length ? `<span class="rd-live">${x.live.length} en cours · depuis ${x.live.map(v => Math.floor(v) + ' min').join(', ')}</span>` : ''}
          ${x.quick ? `<small class="muted">${x.quick} score${x.quick > 1 ? 's' : ''} saisi${x.quick > 1 ? 's' : ''} en moins d'une minute, non compté${x.quick > 1 ? 's' : ''}</small>` : ''}
          <small class="muted">Prévu : ${est} min (format ${g})</small>${avg != null && avg !== est ? `<button class="ghost sm" data-rd="${g}" data-v="${avg}">Prévoir ${avg} min</button>` : ''}</div>`;
      }).join('')}</div>`
      : '<p class="muted small">Lancez un match avec le bouton lecture : sa durée s\'affiche ici en direct, puis la moyenne par format dès qu\'il est terminé.</p>');
    $$('[data-rd]').forEach(b => b.onclick = () => send('tournament/update', { durations: Object.assign({}, S.tournament.durations, { [b.dataset.rd]: +b.dataset.v }) }));
  }
  setInterval(() => { if (tab === 'tournoi') renderRealDurs(); }, 30000);   // les chronos des matchs en cours avancent

  function renderTournoi() {
    const t = S.tournament;
    renderTemplates();
    renderRealDurs();
    $$('[data-f]').forEach(el => fill(el, t[el.dataset.f]));
    $$('input[name=psReg]').forEach(x => { x.checked = x.value === (t.regMode || ''); });
    $$('[data-c]').forEach(el => fill(el, (t.colors || {})[el.dataset.c]));
    $$('[data-d]').forEach(el => fill(el, (t.durations || {})[el.dataset.d]));
    $$('#tab-tournoi [data-show]').forEach(el => el.classList.toggle('hide', !el.dataset.show.split(' ').includes(t.formula || 'tf')));
    $('#planBox').innerHTML = planChips(E.plan(S));
    renderLogos();
    renderSponsors();
    renderProfileInfo();
    renderManage();
    const look = Object.assign({}, E.DEFAULT_LOOK, t.look);
    $$('[data-look]').forEach(el => fill(el, look[el.dataset.look]));
    const pf = $('#lookPrev'); if (!pf.src) pf.src = A.page + '/tv';

    const cat = E.CATEGORIES[t.category] || {};
    $('#ruleCat').textContent = t.category + ' ' + t.gender;
    const warn = E.checkRules(S);
    $('#rules').innerHTML = `
      <ul class="rules">
        <li><b>Formats autorisés :</b> ${(cat.formats || []).join(', ')}${cat.finalFormats ? ` — finale : ${cat.finalFormats.join(', ')}` : ''}</li>
        <li><b>Sélection des paires :</b> ${cat.selection === 'weight' ? 'au classement (poids de paire), égalité → date d\'inscription' : 'par ordre d\'inscription (date / heure)'}</li>
        <li><b>Nb minimum de paires :</b> ${cat.minPairs ? cat.minPairs[t.gender] : '-'}</li>
        <li><b>Balles :</b> ${cat.balls || '-'}${cat.classBalls ? ' — classement : ' + cat.classBalls : ''}</li>
        <li><b>Juge-arbitrage :</b> ${cat.ja || '-'} · <b>Durée max :</b> ${cat.days || '-'} jour(s)</li>
        ${cat.forbid ? `<li><b>Interdits :</b> ${cat.forbid}</li>` : ''}
        ${cat.note ? `<li>${cat.note}</li>` : ''}
        <li><b>Têtes de série :</b> TS1 en bas, TS2 en haut, puis chapeaux 3-4 / 5-8 / 9-16. Poules : 1 TS par poule. Qualifs : autant de TS que de qualifiés.</li>
        <li><b>Minimum 3 matchs par paire</b> (5 en formats E/F).</li>
      </ul>
      ${warn.map(w => `<div class="alert ${w.lvl}">${esc(w.msg)}</div>`).join('') || '<div class="alert ok">Configuration conforme aux règles saisies.</div>'}
      <p class="muted small">Résumé du Guide de la compétition padel 2027 — en cas de doute, le guide fait foi.</p>`;

    $('#courts').innerHTML = S.courts.map(c => `
      <div class="court-row" data-id="${c.id}">
        <span class="c-logo"><label class="c-logo-pick" title="Logo du partenaire du terrain (naming)">${c.logo ? `<img src="${esc(c.logo)}" alt="">` : '<em>+ Logo</em>'}<input type="file" accept="image/*" hidden data-clogo></label>${c.logo ? '<button class="c-logo-rm" data-clogorm title="Retirer le logo" aria-label="Retirer le logo"><svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' : ''}</span>
        <input value="${esc(c.name)}" data-k="name"><input type="time" value="${esc(c.start)}" data-k="start">
        <button class="ghost sm danger" data-rm aria-label="Supprimer"><svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>`).join('');
    $$('#courts .court-row').forEach(row => {
      $$('input[data-k]', row).forEach(inp => inp.onchange = () => send('court/update', { id: row.dataset.id, fields: { [inp.dataset.k]: inp.value } }));
      // logo du partenaire du terrain (naming) : affiché sur l'écran TV (programmation, direct)
      $('[data-clogo]', row).onchange = e => {
        const f = e.target.files[0]; e.target.value = '';
        loadImage(f, 200, 500).then(src => send('court/update', { id: row.dataset.id, fields: { logo: src } })).catch(err => A.toast(err.message, 'err'));
      };
      const rmLogo = $('[data-clogorm]', row);
      if (rmLogo) rmLogo.onclick = () => send('court/update', { id: row.dataset.id, fields: { logo: '' } });
      $('[data-rm]', row).onclick = () => confirm('Supprimer ce terrain ?') && send('court/remove', { id: row.dataset.id });
    });
  }

  /* =====================================================================
     02 · INSCRIPTIONS
     ===================================================================== */
  const form = $('#addPair');
  const resetDate = () => { form.date.value = E.localNow(); };
  resetDate();
  form.onsubmit = async e => {
    e.preventDefault();
    const pl = n => Object.assign({ last: form['l' + n].value.trim(), first: form['f' + n].value.trim(), rank: form['r' + n].value.trim(), licence: form['i' + n].value.trim(), club: form['k' + n].value.trim() },
      form['pid' + n].value ? { playerId: form['pid' + n].value } : {});
    await send('pair/add', { p1: pl(1), p2: pl(2), registeredAt: form.date.value || E.localNow(), wc: form.wc.checked });
    form.reset(); resetDate(); setKnown(1, null); setKnown(2, null); form.l1.focus();
    A.toast('Paire ajoutée', 'ok');
  };
  $$('input', form).forEach(i => i.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (sug.open && sug.active >= 0) return pickSuggestion(sug.n, sug.items[sug.active]);
    form.requestSubmit();
  }));

  /* ---------- saisie semi-automatique depuis la base de joueurs ---------- */
  const sug = { open: false, n: 0, items: [], active: -1, timer: null, seq: 0 };
  function setKnown(n, p) {
    form['pid' + n].value = p ? p.id : '';
    $('#known' + n).textContent = p ? `· connu (${p.tournaments || 0} tournoi${p.tournaments > 1 ? 's' : ''})` : '';
  }
  function closeSug() { [1, 2].forEach(n => { $('#sug' + n).hidden = true; }); sug.open = false; sug.active = -1; }
  function pickSuggestion(n, p) {
    form['l' + n].value = p.last || ''; form['f' + n].value = p.first || ''; form['r' + n].value = p.rank || ''; form['i' + n].value = p.licence || ''; if (p.club != null) form['k' + n].value = p.club || '';
    setKnown(n, p); closeSug();
    (n === 1 ? form.l2 : form.date).focus();
  }
  function showSug(n) {
    const box = $('#sug' + n);
    if (!sug.items.length) { box.hidden = true; sug.open = false; return; }
    box.innerHTML = sug.items.map((p, i) => `<div class="sg ${i === sug.active ? 'on' : ''}" data-i="${i}">${p.photo && /^(https?:\/\/|\/)[^"'()\s]+$/.test(p.photo) ? `<i class="sg-pp" style="background-image:url('${esc(p.photo)}')"></i>` : `<i class="sg-pp">${esc(((p.first || '')[0] || '') + ((p.last || '')[0] || '')).toUpperCase()}</i>`}<b>${esc(p.last)}</b> ${esc(p.first)}${p.mail ? ` <span>${esc(p.mail)}</span>` : ''}
      <span>${p.licence ? 'Lic. ' + esc(p.licence) : ''}${p.rank ? ' · Clt ' + esc(p.rank) : ''}</span><em>${p.source === 'club' ? '/Buvette · ' + esc(p.club || '') : (p.club ? esc(p.club) + ' · ' : '') + p.tournaments + ' tournoi' + (p.tournaments > 1 ? 's' : '')}</em></div>`).join('');
    box.hidden = false; sug.open = true; sug.n = n;
    // règle commune aux trois applis : la liste prend la largeur exacte et le style du champ tapé, collée dessous
    const inp = sug.inp && document.body.contains(sug.inp) ? sug.inp : null;
    if (inp && box.offsetParent) {
      const r = inp.getBoundingClientRect(), pr = box.offsetParent.getBoundingClientRect(), cs = getComputedStyle(inp);
      Object.assign(box.style, { left: r.left - pr.left + 'px', right: 'auto', width: r.width + 'px', top: r.bottom - pr.top + 'px', borderRadius: cs.borderRadius, fontFamily: cs.fontFamily, boxSizing: 'border-box' });
    }
    $$('.sg', box).forEach(el => el.onmousedown = e => { e.preventDefault(); pickSuggestion(n, sug.items[+el.dataset.i]); });
  }
  ['l', 'f', 'i'].forEach(k => [1, 2].forEach(n => {
    const inp = form[k + n];
    inp.addEventListener('input', () => {
      sug.inp = inp;
      setKnown(n, null);
      const q = inp.value.trim();
      clearTimeout(sug.timer);
      if (q.length < 2) return closeSug();
      sug.timer = setTimeout(async () => {
        const my = ++sug.seq;
        const d = await A.api('/api/players?q=' + encodeURIComponent(q)).catch(() => ({ players: [] }));
        if (my !== sug.seq) return;
        sug.items = d.players || []; sug.active = sug.items.length ? 0 : -1; showSug(n);
      }, 180);
    });
    inp.addEventListener('keydown', e => {
      if (!sug.open || sug.n !== n) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sug.active = (sug.active + (e.key === 'ArrowDown' ? 1 : -1) + sug.items.length) % sug.items.length; showSug(n); }
      if (e.key === 'Escape') closeSug();
    });
    inp.addEventListener('blur', () => setTimeout(closeSug, 150));
  }));

  /* ---------- fiche joueur : statistiques et historique (tous clubs) ---------- */
  async function openPlayer(pl) {
    let id = pl.playerId;
    if (!id && (pl.licence || pl.last)) {
      const d = await A.api('/api/players?q=' + encodeURIComponent(pl.licence || pl.last)).catch(() => ({ players: [] }));
      const hit = (d.players || []).find(x => (pl.licence && x.licence === pl.licence) || ((x.last || '').toUpperCase() === (pl.last || '').toUpperCase() && (x.first || '').toLowerCase() === (pl.first || '').toLowerCase()));
      if (hit) id = hit.id;
    }
    if (!id) return A.toast('Joueur pas encore dans la base : il y sera ajouté à la clôture du tournoi', 'ok');
    const d = await A.api('/api/players/' + id);
    if (d.error) return A.toast(d.error, 'err');
    openModal(() => playerHtml(d), null, { static: true });
  }
  A.openPlayer = openPlayer;
  function playerHtml(d) {
    const p = d.player, h = d.history;
    const wins = h.filter(x => x.place === 1).length, pts = h.reduce((s, x) => s + (x.points || 0), 0);
    const best = h.length ? Math.min(...h.map(x => x.place)) : null, clubs = new Set(h.map(x => x.club)).size;
    const place = x => (x.place === 1 ? '1er' : x.placeLo && x.placeLo !== x.place ? `${x.placeLo}-${x.place}e` : x.place + 'e');
    return `<span class="eyebrow">Fiche joueur</span><h3>${esc(p.last)} ${esc(p.first)}</h3>
      <div class="muted">${p.licence ? 'Licence ' + esc(p.licence) : 'Licence non renseignée'}${p.rank ? ' · classement ' + esc(p.rank) : ''}${p.club ? ' · ' + esc(p.club) : ''}</div>
      <div class="kpis" style="margin-top:14px"><div><b>${h.length}</b><span>tournois</span></div><div><b>${wins}</b><span>victoire${wins > 1 ? 's' : ''}</span></div>
        <div><b>${best ? best + (best === 1 ? 'er' : 'e') : '-'}</b><span>meilleur résultat</span></div><div><b>${clubs}</b><span>club${clubs > 1 ? 's' : ''}</span></div></div>
      <h4>Historique</h4>
      <table class="tbl"><thead><tr><th>Date</th><th>Tournoi</th><th>Club</th><th>Place</th><th>Points</th><th>Partenaire</th></tr></thead><tbody>
      ${h.map(x => `<tr><td>${x.date ? new Date(x.date).toLocaleDateString('fr-FR') : ''}</td><td>${esc(x.tournament)} <span class="rk">${esc(x.category || '')}</span></td>
        <td>${esc(x.club || '')} ${x.mine ? '' : '<span class="tag ghost">Autre club</span>'}</td><td><b>${place(x)}</b> <span class="rk">/ ${x.pairs}</span></td><td>${x.points ?? '-'}</td><td>${esc(x.partner || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Aucun tournoi clôturé pour l\'instant.</td></tr>'}
      </tbody></table><p class="muted small">Total : ${pts} points FFT estimés sur ces tournois (barème 2027).</p>
      <div class="btns"><button class="accent" data-close>Fermer</button></div>`;
  }

  $('#pasteBtn').onclick = () => {
    const lines = $('#pasteArea').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const list = [];
    lines.forEach(l => {
      const c = l.split(/\t|;|,/).map(x => x.trim());
      if (c.length < 4) return;
      list.push({ p1: { last: c[0], first: c[1], rank: c[2], licence: '' }, p2: { last: c[3], first: c[4] || '', rank: c[5] || '', licence: '' },
        registeredAt: c[6] ? toLocalInput(c[6]) : E.localNow() });
    });
    if (!list.length) return A.toast('Aucune ligne reconnue', 'err');
    send('pairs/import', { list }); $('#pasteArea').value = ''; A.toast(list.length + ' paire(s) importée(s)', 'ok');
  };
  function toLocalInput(s) {
    const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2})[:h](\d{2}))?/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${(m[4] || '00').padStart(2, '0')}:${m[5] || '00'}`; }
    return s.replace(' ', 'T').slice(0, 16);
  }

  const fmtDate = s => s ? new Date(s).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
  const plCell = (pl, k) => `<span class="pl-link" data-pl="${k}" title="Fiche joueur"><b>${esc((pl.last || '').toUpperCase())}</b> ${esc(pl.first || '')}</span> <span class="rk">${pl.rank ? esc(pl.rank) : 'NC'}</span>${pl.playerId ? ' <span class="known-dot" title="Joueur connu de la base"><svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"><circle cx="4" cy="4" r="4"/></svg></span>' : ''}`;

  function pairRows(list, kind) {
    if (!list.length) return `<tr><td class="muted empty">Aucune paire</td></tr>`;
    return `<thead><tr><th>#</th><th>Joueur 1</th><th>Joueur 2</th><th>Poids</th><th>Inscription</th><th></th></tr></thead><tbody>` +
      list.map((p, i) => {
        const ts = A.seedOf(p.id);
        return `<tr data-id="${p.id}">
          <td class="num">${kind === 'main' && ts ? `<span class="ts">TS${ts}</span>` : i + 1}</td>
          <td>${plCell(p.p1, 'p1')}</td><td>${plCell(p.p2, 'p2')}</td>
          <td class="num"><b>${E.weightOf(p) >= 99999 ? 'NC' : E.weightOf(p)}</b></td>
          <td>${fmtDate(p.registeredAt)} ${p.wc ? '<span class="tag">WC</span>' : ''}${p.src ? '<span class="tag lime" title="Inscrite par les joueurs depuis l’appli /Buvette">/Buvette</span>' : ''}</td>
          <td class="acts"><button class="ps-more" data-a="more" data-kind="${kind}" aria-haspopup="menu" aria-label="Actions de la paire ${esc(p.p1.last || '')} / ${esc(p.p2.last || '')}">${PSI.more}</button></td></tr>`;
      }).join('') + '</tbody>';
  }

  function renderInscriptions() {
    const sel = E.selection(S);
    $('#mainTitle').textContent = `Paires retenues — ${sel.main.length} / ${S.tournament.maxPairs}` + (S.draw ? ' · tirage effectué' : '');
    $('#selMode').textContent = sel.mode === 'weight' ? 'Sélection au poids (P500 et +)' : 'Sélection par date d\'inscription (P25 à P250)';
    $('#waitTitle').textContent = `Liste d'attente — ${sel.waiting.length}`;
    $('#wdTitle').textContent = `Forfaits / retraits — ${sel.withdrawn.length}`;
    $('#tblMain').innerHTML = pairRows(sel.main, 'main');
    $('#tblWait').innerHTML = pairRows(sel.waiting, 'wait');
    $('#tblWd').innerHTML = pairRows(sel.withdrawn, 'wd');
    $$('#tab-inscriptions tr[data-id]').forEach(tr => {
      const id = tr.dataset.id;
      $$('[data-pl]', tr).forEach(el => el.onclick = () => openPlayer(A.pairs[id][el.dataset.pl]));
      // un seul « … » par ligne (maquette, point 6) : Modifier la paire, Déclarer forfait (ou Réintégrer), Retirer
      $$('[data-a="more"]', tr).forEach(b => b.onclick = () => psMenu(b, [
        ['Modifier la paire', PSI.edit, () => openPairModal(id)],
        b.dataset.kind === 'wd' ? ['Réintégrer', PSI.undo, () => send('pair/withdraw', { id, value: false })]
          : ['Déclarer forfait', PSI.flag, () => { if (S.draw && S.draw.entrants.includes(id)) openReplaceModal(id); else send('pair/withdraw', { id, value: true }); }],
        ['Retirer', PSI.del, () => { if (confirm('Supprimer définitivement cette paire ?')) send('pair/remove', { id }); }, true]
      ]));
    });
    psInsTabs(sel);
  }

  function openPairModal(id) {
    const p = A.pairs[id]; if (!p) return;
    openModal(() => `<span class="eyebrow">Paire</span><h3>Modifier la paire</h3>
      <form id="pf" class="form">
        ${[1, 2].map(n => { const pl = p['p' + n]; return `
          <label>NOM ${n}<input name="l${n}" value="${esc(pl.last)}"></label><label>Prénom ${n}<input name="f${n}" value="${esc(pl.first)}"></label>
          <label>Classement ${n}<input name="r${n}" value="${esc(pl.rank)}"></label><label>Licence ${n}<input name="i${n}" value="${esc(pl.licence)}"></label><label>Club ${n}<input name="k${n}" value="${esc(pl.club || '')}"></label>`; }).join('')}
        <label>Date d'inscription<input type="datetime-local" name="date" value="${esc(p.registeredAt)}"></label>
        <label class="chk"><input type="checkbox" name="wc" ${p.wc ? 'checked' : ''}> Wild-card</label>
        <label class="span2">Note<input name="note" value="${esc(p.note)}"></label>
        <div class="span2 btns"><button class="accent">Enregistrer</button><button type="button" class="ghost" data-close>Annuler</button></div>
      </form>`, box => {
      $('#pf', box).onsubmit = e => {
        e.preventDefault(); const f = e.target;
        const pl = n => ({ last: f['l' + n].value.trim(), first: f['f' + n].value.trim(), rank: f['r' + n].value.trim(), licence: f['i' + n].value.trim(), club: f['k' + n].value.trim() });
        send('pair/update', { id, fields: { p1: pl(1), p2: pl(2), registeredAt: f.date.value, wc: f.wc.checked, note: f.note.value } });
        closeModal();
      };
    }, { static: true });
  }

  function openReplaceModal(id) {
    const sel = E.selection(S);
    openModal(() => `<span class="eyebrow">Forfait</span><h3>${esc(A.pairName(id, 'initial'))}</h3>
      <p>Cette paire est engagée dans le tirage. Choisissez :</p>
      <div class="form"><label class="span2">Remplacer par une paire de la liste d'attente (même place)
        <select id="rpSel">${sel.waiting.map(p => `<option value="${p.id}">${esc(A.pairName(p.id, 'initial'))} — poids ${E.weightOf(p)}</option>`).join('') || '<option value="">Liste d\'attente vide</option>'}</select></label></div>
      <div class="btns"><button class="accent" id="rpGo" ${sel.waiting.length ? '' : 'disabled'}>Remplacer</button>
      <button class="ghost" id="rpWo">Garder et déclarer WO sur le match</button><button class="ghost" data-close>Annuler</button></div>`, box => {
      $('#rpGo', box).onclick = () => { send('draw/replace', { oldId: id, newId: $('#rpSel', box).value }); closeModal(); };
      $('#rpWo', box).onclick = () => { closeModal(); const m = S.matches.find(m => (R[m.id].A === id || R[m.id].B === id) && !['done', 'bye'].includes(R[m.id].state)); if (m) openMatchModal(m.id); };
    }, { static: true });
  }

  /* =====================================================================
     03 · TIRAGE AU SORT (cartes)
     ===================================================================== */
  let drawBuf = '';
  let psDrawSel = null;
  function renderTirage() {
    const P = E.plan(S), D = S.draw, el = $('#drawPanel');
    if (!D) {
      const seedOpts = []; for (let s = 1; s <= (P.tfSize || 2) / 2; s *= 2) seedOpts.push(s);
      const def = P.formula === 'qualif_tf' ? Math.min(E.defaultSeeds(P.tfEntrants), P.direct) : E.defaultSeeds(P.N);
      const showSeeds = P.formula === 'tf' || P.formula === 'qualif_tf';
      el.innerHTML = `<div class="card">
        <span class="eyebrow">${esc(E.FORMULAS[P.formula])}</span><h3>Préparer le tirage</h3>
        <div class="plan" style="margin-bottom:18px">${planChips(P)}</div>
        <div class="form">
          <label>Méthode<select id="dMethod"><option value="physical">Tirage réel : cartes numérotées</option><option value="auto">Tirage par l'ordinateur</option></select></label>
          ${showSeeds ? `<label>Têtes de série au tableau final<select id="seeds">${seedOpts.map(s => `<option ${s === def ? 'selected' : ''} value="${s}">${s}${s === def ? ' (règle FFT)' : ''}</option>`).join('')}</select></label>` : '<span></span>'}
        </div>
        <div class="alert info" style="margin-top:14px">
          <b>Tirage réel :</b> pour chaque chapeau, des cartes numérotées apparaissent face cachée. Le logiciel a associé au hasard chaque numéro à une paire du chapeau.
          Tirez un numéro dans la vraie vie (papier, balle…), puis cliquez sur la carte ou tapez son numéro au pavé numérique : elle se retourne et la paire prend la place suivante du chapeau.
          ${P.formula.startsWith('poules') && S.tournament.pouleMethod === 'serpentin' ? '<br><b>Poules en serpentin :</b> le placement est imposé, il n\'y a pas de cartes.' : ''}
        </div>
        <div class="btns"><button class="accent big" id="doDraw" ${P.N < 2 ? 'disabled' : ''}>Lancer le tirage</button></div>
      </div>`;
      $('#doDraw').onclick = () => {
        const method = $('#dMethod').value, seeds = $('#seeds') ? +$('#seeds').value : undefined;
        if (method === 'auto') send('draw/create', { seeds });
        else send('draw/prepare', { method, seeds }).then(() => send('display/set', { tv: 'draw', rotate: false }));
      };
      return;
    }
    const ps = A.potState();
    const cur = E.currentPot(D) || (ps && ps.linger ? ps : null);
    const started = S.matches.some(m => m.points.length || m.status !== 'pending');
    if (!cur) {
      // tirage terminé (maquette, écran 2) : intercalaires par étape (poules, qualifications, tableau final), poules côte à côte avec les têtes de série,
      // à droite les réglages et la liste des têtes de série
      if (!D.sessions.some(s => s.key === psDrawSel)) psDrawSel = D.sessions[0] && D.sessions[0].key;
      const seeds = E.selection(S).main.filter(p => A.seedOf(p.id)).sort((a, b) => A.seedOf(a.id) - A.seedOf(b.id));
      el.innerHTML = `<div class="ps-bento"><div class="ps-bmain">
        ${D.sessions.length > 1 ? `<div class="r-itabs ps-itabs" role="tablist">${D.sessions.map(s => `<button type="button" role="tab" data-ss="${s.key}" aria-selected="${s.key === psDrawSel}">${s.kind === 'poules' ? 'Poules · ' + s.letters.length : esc(s.label)}</button>`).join('')}</div>` : ''}
        <section class="card ps-drawres"><div class="row-between"><span class="muted">Tirage terminé${S.draw.at ? ' le ' + new Date(S.draw.at).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''}</span><span class="tag ps-valid">Tirage validé</span></div>
          ${sessionsPreview(D, D.sessions.length > 1 ? psDrawSel : null)}
          <div class="btns"><button class="accent" id="goTab">Voir les tableaux</button><button id="tvDraw">Récapitulatif sur la TV</button>
            <button id="drawReset" ${started ? 'disabled title="Des matchs ont commencé"' : ''}>Annuler le tirage</button></div></section></div>
        <aside class="ps-bside">
          <section class="card"><h3>${psIc('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>')}Réglages du tirage</h3>
            <p class="muted small">${esc(E.FORMULAS[S.draw.formula || S.tournament.formula] || '')}${S.tournament.pouleMethod && String(S.draw.formula || '').startsWith('poules') ? ' · ' + (S.tournament.pouleMethod === 'serpentin' ? 'poules en serpentin (placement imposé)' : 'poules par rang (tirage)') : ''}</p>
            <p class="muted small">Pour changer ces réglages, annulez le tirage puis modifiez la formule dans la fiche du tournoi.</p></section>
          <section class="card"><h3>${psIc('<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>')}Têtes de série</h3>
            <div class="ps-seeds">${seeds.map(p => `<div class="ps-seed"><span class="r-pastille r-pastille--rose">${A.seedOf(p.id)}</span><span>${esc(A.pairName(p.id, 'last'))}</span><b>${E.weightOf(p) >= 99999 ? 'NC' : E.weightOf(p)}</b></div>`).join('') || '<p class="muted small">Aucune tête de série.</p>'}</div></section>
        </aside></div>`;
      $$('[data-ss]', el).forEach(b => b.onclick = () => { psDrawSel = b.dataset.ss; renderTirage(); });
      $('#goTab').onclick = () => setTab('tableaux');
      $('#tvDraw').onclick = () => send('display/set', { tv: 'draw', rotate: false });
      $('#drawReset').onclick = () => confirm('Annuler le tirage et tous les matchs ?') && send('draw/reset');
      return;
    }
    const { session, pot } = cur;
    const left = pot.cards.length - pot.next;
    if (!$('#potZone')) {
      el.innerHTML = `<div class="draw-live"><div class="card">
          <div class="pot-head"><div><span class="eyebrow" id="potSess"></span><h3 id="potLabel"></h3><div class="muted" id="potHint"></div></div>
            <div class="btns" style="margin:0"><button class="ghost" id="flipRand" title="L'ordinateur choisit une carte">Carte au hasard</button><button class="ghost" id="drawAuto">Terminer par l'ordinateur</button></div></div>
          <div class="pot-zone" id="potZone"></div>
          <div class="dbuffer" id="dBuf"></div>
          <p class="muted small" style="text-align:center">Cliquez sur la carte tirée ou tapez son numéro (pavé numérique). Plusieurs chiffres : tapez-les à la suite, puis Entrée.</p>
          <div class="btns"><button class="ghost" id="tvDraw">Afficher sur la TV</button><button class="ghost danger" id="drawReset">Annuler le tirage</button></div>
        </div>
        <div class="card"><span class="eyebrow">Tirage au sort</span><h3>Progression</h3><ul class="pots" id="potList"></ul><div id="drawPrev" style="margin-top:16px"></div></div></div>`;
      $('#flipRand').onclick = () => send('draw/flipRandom');
      $('#drawAuto').onclick = () => confirm('Laisser l\'ordinateur tirer toutes les cartes restantes ?') && send('draw/auto');
      $('#tvDraw').onclick = () => send('display/set', { tv: 'draw', rotate: false });
      $('#drawReset').onclick = () => confirm('Annuler le tirage ?') && send('draw/reset');
    }
    $('#potSess').textContent = `${session.label} · ${D.sessions.length > 1 ? 'étape ' + (D.sessions.indexOf(session) + 1) + '/' + D.sessions.length : ''}`;
    $('#potLabel').innerHTML = `<span class="band lime">${esc(pot.label)}</span>`;
    $('#potHint').textContent = `${pot.hint ? pot.hint + ' · ' : ''}${left} carte${left > 1 ? 's' : ''} à retourner`;
    const zone = $('#potZone');
    A.renderPot(zone, { width: zone.clientWidth - 20 || 700, maxW: 150, onFlip: n => send('draw/flip', { n }), onRefresh: () => tab === 'tirage' && render() });
    $('#dBuf').textContent = drawBuf ? 'Carte n° ' + drawBuf + '…' : '';
    $('#potList').innerHTML = D.sessions.map(s => s.pots.map(p => {
      const st = p.next >= p.cards.length ? 'done' : p === pot ? 'cur' : '';
      return `<li class="${st}"><span>${esc(D.sessions.length > 1 ? s.label + ' · ' : '')}${esc(p.label)}</span><span>${p.next}/${p.cards.length}</span></li>`;
    }).join('')).join('');
    $('#drawPrev').innerHTML = sessionsPreview(D, session.key);
  }

  function sessionsPreview(D, only) {
    return D.sessions.filter(s => !only || s.key === only).map(s => {
      const lastPos = D.last && D.last.session === s.key ? String(D.last.pos) : null;
      if (s.kind === 'poules') {
        return `<h4>${esc(s.label)}</h4><div class="pgrid">${s.letters.map((L, i) => `<div><div class="ps-ph"><b>Poule ${L}</b><small>Poids</small></div>${Array.from({ length: s.sizes[i] }, (_, r) => {
          const tk = s.fill[`${L}:${r}`], pp = tk && A.pairs[tk], ts = tk && A.seedOf(tk);
          return `<p class="ps-pr${tk ? '' : ' empty'}${ts ? ' ts1' : ''}"><i>${r + 1}</i><span>${tk ? esc(A.pairName(tk, 'last')) : '—'}${ts ? '<span class="tag ps-ts">TS</span>' : ''}</span><b>${pp ? (E.weightOf(pp) >= 99999 ? 'NC' : E.weightOf(pp)) : ''}</b></p>`; }).join('')}</div>`).join('')}</div>`;
      }
      return `<h4>${esc(s.label)} · ${s.size} places</h4><div class="lines">${E.sessionSlots(s).map((tk, i) => {
        const ts = tk && A.seedOf(tk);
        return `<div class="${tk === 'BYE' ? 'bye' : ''} ${lastPos === String(i) ? 'new' : ''}"><b>${i + 1}</b><span>${tk ? (ts ? `<span class="ts">${ts}</span>` : '') + esc(A.pairName(tk, 'last')) : '<span class="muted">—</span>'}</span></div>`;
      }).join('')}</div>`;
    }).join('');
  }

  const drawKeys = A.cardKeys(() => { const c = E.currentPot(S.draw); return c ? c.pot.cards.length : 0; },
    n => send('draw/flip', { n }), b => { drawBuf = b; const d = $('#dBuf'); if (d) d.textContent = b ? 'Carte n° ' + b + '…' : ''; });

  /* =====================================================================
     04 · TABLEAUX
     ===================================================================== */
  function matchMini(m) {
    const r = R[m.id], sc = r.score;
    const row = side => {
      const id = r[side];
      const w = r.winner && r.winner === id && id !== 'BYE';
      const sets = sc ? sc.sets.map(s => `<i class="${s.w === side ? 'w' : ''}">${s.stb ? s.stb[side] : s[side]}</i>`).join('') : '';
      const cur = r.state === 'live' && sc && !sc.manual ? `<i class="cur">${sc.mode === 'game' ? sc.games[side] : sc.points[side]}</i>` : '';
      const ts = m.phase === 'TF' ? A.seedOf(id) : null;
      return `<div class="mrow ${w ? 'win' : ''} ${id === 'BYE' ? 'bye' : ''}">${ts ? `<span class="ts">${ts}</span>` : ''}<span class="nm">${esc(A.sideName(m, side))}</span><span class="sc">${r.woTeam === side ? '<i>WO</i>' : ''}${sets}${cur}</span></div>`;
    };
    if (r.staticBye && r.state !== 'waiting') return `<div class="mm bye-m">${row(r.A === 'BYE' ? 'B' : 'A')}<div class="mrow bye"><span class="nm">Exempt</span></div></div>`;
    return `<div class="mm st-${r.state}" data-m="${m.id}"><div class="mhead"><span>M${m.num}</span><span>${m.court ? esc(A.courtName(m.court)) : ''}</span><span>${r.fk}</span></div>${row('A')}${row('B')}</div>`;
  }

  function bracketCols(list) {
    const sizes = [...new Set(list.map(m => m.size))].sort((a, b) => b - a);
    return sizes.map(sz => {
      const ms = list.filter(m => m.size === sz).sort((a, b) => a.idx - b.idx);
      const title = ms[0].phase === 'Q' ? (ms[0].qfinal ? 'Tour décisif' : 'Tour ' + ms[0].depth) : E.ROUND_NAMES[sz];
      return `<div class="bcol"><h4>${title}</h4><div class="bcol-in">${ms.map(matchMini).join('')}</div></div>`;
    }).join('');
  }

  /* classement en temps réel : blocs de places qui se scindent au fil des tours */
  const ptsTxt = g => (g.ptsHi == null ? '' : g.exact || g.ptsHi === g.ptsLo ? `${g.ptsHi} pts` : `${g.ptsLo} à ${g.ptsHi} pts`);
  function rankBlocks(LS) {
    return LS.groups.map(g => `<div class="rk-block ${g.exact ? 'exact' : ''} ${g.lo === 1 && g.exact ? 'p1' : ''}">
      <div class="rk-h"><b>${g.exact ? g.lo + (g.lo === 1 ? 'er' : 'e') : `Places ${g.lo} – ${g.hi}`}</b><span>${ptsTxt(g)}</span></div>
      ${g.pairs.map(p => `<div class="rk-p">${esc(A.pairName(p, 'initial'))}</div>`).join('')}</div>`).join('');
  }

  function renderTableaux() {
    const has = !!(S.draw && S.draw.built);
    // poules
    $('#tabPoules').innerHTML = has && S.poules.length ? `<div class="card"><span class="eyebrow">Phase de poules</span><h3>Poules</h3><div class="poules-ed">${S.poules.map(P => {
      const st = E.pouleStandings(S, R, P.id);
      const k = S.draw.formula === 'poules_tf' ? (+S.tournament.pouleQualif || 2) : 0;
      const ms = S.matches.filter(m => m.phase === 'P' && m.poule === P.id).sort((a, b) => a.depth - b.depth || a.idx - b.idx);
      return `<div data-pp="${P.id}"><h4>Poule ${P.id} ${st.complete ? '<span class="tag lime">Terminée</span>' : ''}</h4>
        <table class="tbl ptab"><thead><tr><th>#</th><th>Paire</th><th>J</th><th>V</th><th>Pts</th><th>Sets</th><th>Jeux</th></tr></thead><tbody>
        ${st.rows.map(x => `<tr class="${x.rank <= k ? 'q' : ''}"><td class="rank">${x.rank}</td><td>${esc(A.pairName(x.pair, 'initial'))}</td><td>${x.played}</td><td>${x.won}</td><td class="pts">${x.pts}</td><td>${x.sw - x.sl >= 0 ? '+' : ''}${x.sw - x.sl}</td><td>${x.gw - x.gl >= 0 ? '+' : ''}${x.gw - x.gl}</td></tr>`).join('')}
        </tbody></table><div class="pmatches">${ms.map(matchMini).join('')}</div></div>`;
    }).join('')}</div></div>` : '';
    const q = has ? S.matches.filter(m => m.phase === 'Q') : [];
    $('#cardQualif').hidden = !q.length;
    $('#qualifEd').innerHTML = bracketCols(q);
    const main = has ? S.matches.filter(m => m.phase === 'TF' && m.a === 1) : [];
    $('#cardTf').hidden = has && !main.length;
    $('#bracketEd').innerHTML = has ? bracketCols(main) : '<p class="muted">Les tableaux apparaîtront après le tirage au sort.</p>';
    const LS = has ? E.liveStandings(S, R) : { groups: [] };
    $('#liveRank').hidden = !LS.groups.length;
    $('#liveRankEd').innerHTML = rankBlocks(LS);
    const cls = has ? S.matches.filter(m => m.phase === 'TF' && m.a !== 1) : [];
    $('#classCard').hidden = !cls.length;
    const groups = {};
    cls.forEach(m => { const k = m.a + '-' + (m.a + m.size - 1); (groups[k] = groups[k] || []).push(m); });
    $('#classEd').innerHTML = Object.keys(groups).sort((a, b) => parseInt(a) - parseInt(b) || parseInt(b.split('-')[1]) - parseInt(a.split('-')[1]))
      .map(k => `<div class="cgroup"><h4>${E.matchLabel(groups[k][0])}</h4>${groups[k].sort((a, b) => a.idx - b.idx).map(matchMini).join('')}</div>`).join('');
    $$('#tab-tableaux [data-m]').forEach(el => el.onclick = () => openMatchModal(el.dataset.m));
    psTabTabs(has, q, main, cls, LS);
  }
  /* intercalaires des Tableaux (finition 8) : Poule A… Qualifications, Tableau final, Classement, Points FFT ; une seule partie affichée */
  let psTabSel = null;
  function psTabTabs(has, q, main, cls, LS) {
    const sec = $('#tab-tableaux');
    let it = $('#psTabTabs');
    if (!it) { it = document.createElement('div'); it.className = 'r-itabs ps-itabs'; it.id = 'psTabTabs'; it.setAttribute('role', 'tablist'); $('#tabPoules').before(it);
      it.addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) { psTabSel = b.dataset.t; renderTableaux(); } }); }
    const tabs = (has ? S.poules : []).map(P => ['P' + P.id, 'Poule ' + P.id]);
    if (q.length) tabs.push(['Q', 'Qualifications']);
    if (main.length) tabs.push(['TF', 'Tableau final']);
    if (cls.length) tabs.push(['CL', 'Classement']);
    if (LS.groups.length) tabs.push(['RK', 'Points FFT']);
    const parts = { Q: '#cardQualif', TF: '#cardTf', CL: '#classCard', RK: '#liveRank' };
    sec.classList.toggle('ps-tabbed', tabs.length > 1);
    if (tabs.length < 2) { it.hidden = true; $$('[data-pp]', sec).forEach(d => { d.hidden = false; }); return; }
    if (!tabs.some(t => t[0] === psTabSel)) {
      // par défaut : le tableau final dès que les poules sont jouées ou qu'il a commencé, sinon la première partie
      const tfOn = main.some(m => R[m.id] && R[m.id].state !== 'waiting');
      psTabSel = tfOn && main.length ? 'TF' : tabs[0][0];
    }
    it.hidden = false;
    it.innerHTML = tabs.map(([k, l]) => `<button type="button" role="tab" data-t="${k}" aria-selected="${k === psTabSel}">${l}</button>`).join('');
    const pc = $('#tabPoules > .card'); if (pc) pc.hidden = psTabSel[0] !== 'P';
    $$('[data-pp]', sec).forEach(d => { d.hidden = 'P' + d.dataset.pp !== psTabSel; });
    Object.entries(parts).forEach(([k, s]) => { const el = $(s); if (el && tabs.some(t => t[0] === k)) el.hidden = k !== psTabSel; });
  }

  /* =====================================================================
     MODALE MATCH : score en direct, saisie manuelle, WO, remplacement
     ===================================================================== */
  /* « Saisir un score » (maquette, écran 4) : panneau plein à droite (fenêtre du bas au téléphone).
     Choix du match, grille des sets (cases modifiables), « Pendant le match » : +1 jeu et +1 set par paire,
     Abandon ou forfait, Annuler / Valider le score. Le point par point, le serveur, le format, le terrain,
     l'overlay, les remplacements et la remise à zéro restent dans « Plus d'options ». */
  function openMatchModal(id) {
    const draft = {};   // cases du score en cours de frappe : gardées quand l'état du tournoi se met à jour
    $('#modal').classList.add('ps-side');
    openModal(() => {
      const m = S.matches.find(x => x.id === id); if (!m) return '<p>Match introuvable</p>';
      const r = R[m.id];
      const can = r.A && r.B && r.state !== 'bye';
      const sc = r.score;
      const flags = can && !m.manual && !m.wo ? E.pointFlags(r.fk, m.points, m.firstServer) : {};
      const live = sc && !sc.manual ? sc : null;
      const PS = E.pairsStatus(S, R);
      const off = !can || r.state === 'done';
      // valeurs des cases : saisie en cours, sinon score enregistré (sets finis, puis jeux du set en cours)
      const msets = (m.manual && m.manual.sets) || [];
      const base = side => { const out = (sc ? sc.sets : []).map(s => s.stb ? s.stb[side] : s[side]); if (live && !live.winner && live.mode === 'game' && out.length < 3) out.push(live.games[side]); return out; };
      const vA = base('A'), vB = base('B');
      const val = (side, i) => draft[side + i] != null ? draft[side + i] : msets[i] ? msets[i][side === 'A' ? 0 : 1] : (side === 'A' ? vA : vB)[i] != null ? (side === 'A' ? vA : vB)[i] : '';
      const won = (i, side) => sc && sc.sets[i] && sc.sets[i].w === side;
      const cells = side => [0, 1, 2].map(i => `<input class="ps-set${won(i, side) ? ' w' : ''}" name="${side}${i}" type="number" inputmode="numeric" min="0" max="99" value="${esc(val(side, i))}" aria-label="Set ${i + 1}, ${esc(A.sideName(m, side))}">`).join('');
      const choix = S.matches.filter(x => x.id === id || (R[x.id] && (R[x.id].state === 'live' || R[x.id].state === 'ready') && x.court)).sort((a, b) => a.num - b.num);
      const restWarn = r.state === 'ready' ? ['A', 'B'].filter(s => PS[r[s]] && PS[r[s]].state === 'rest').map(s => `${A.pairName(r[s])} : repos obligatoire jusqu'à ${A.hhmm(PS[r[s]].restUntil)}`) : [];
      const replaceable = side => {
        const src = side === 'A' ? m.srcA : m.srcB;
        if (!src || !src.pair || !E.isPair(src.pair) || r.state === 'done' || m.points.length) return '';
        const w = E.selection(S).waiting; if (!w.length) return '';
        return `<label>Remplacer ${esc(A.pairName(src.pair))} (forfait) par<select data-rep="${src.pair}"><option value="">—</option>${w.map(p => `<option value="${p.id}">${esc(A.pairName(p.id))}</option>`).join('')}</select></label>`;
      };
      const state = ({ waiting: 'En attente', ready: 'Prêt', live: 'En direct', done: 'Terminé', bye: 'Exempt' })[r.state];
      return `
        <div class="ps-mh"><h3>Saisir un score</h3><button type="button" class="ps-ib" data-close aria-label="Fermer (Échap)">${PSI.x}</button></div>
        <label class="ps-mf">Match<select data-pick>${choix.map(x => `<option value="${x.id}" ${x.id === id ? 'selected' : ''}>${esc(x.court ? A.courtName(x.court) : 'Non programmé')} · M${x.num} · ${esc(E.matchLabel(x))}</option>`).join('')}</select></label>
        <div class="ps-mst"><span class="tag ${r.state === 'live' ? 'ps-st-live' : r.state === 'done' ? 'ps-st-done' : ''}">${state}</span><span class="muted">Format ${r.fk} · ${esc(E.FORMATS[r.fk].name)}${live && live.decisivePoint ? ' · <b class="hot">point décisif</b>' : ''}</span></div>
        ${restWarn.map(w => `<div class="alert err">${esc(w)} — accord écrit des 4 joueurs requis pour jouer avant.</div>`).join('')}
        <form class="ps-grid" data-man autocomplete="off">
          <span></span>${[1, 2, 3].map(i => `<small>Set ${i}</small>`).join('')}
          ${['A', 'B'].map(side => `<div class="ps-gn${r.winner && r.winner === r[side] ? ' win' : ''}">${live && live.server === side && !live.winner ? '<i class="ps-srv" aria-label="au service"></i>' : ''}${esc(A.sideName(m, side, 'initial'))}${live && !live.winner ? ` <span class="ps-pts">${live.labels[side]}</span>` : ''}${flags[side] ? `<em class="ps-flag">${flags[side]}</em>` : ''}</div>${cells(side)}`).join('<hr>')}
        </form>
        <h4>Pendant le match</h4>
        <div class="ps-during">${['A', 'B'].map(side => `<span>${esc(A.sideName(m, side, 'initial'))}</span>
          <button type="button" data-gm="${side}" ${off ? 'disabled' : ''} title="Donne le jeu en cours (Maj + ${side === 'A' ? '←' : '→'})">${psIc('<path d="M12 5v14M5 12h14"/>')}+1 jeu</button>
          <button type="button" data-st1="${side}" ${off ? 'disabled' : ''} title="Donne le set en cours">${psIc('<path d="M12 5v14M5 12h14"/>')}+1 set</button>`).join('')}</div>
        <label class="chk ps-ab"><input type="checkbox" data-ab> Abandon ou forfait</label>
        <div class="btns ps-wo" hidden>${['A', 'B'].map(side => `<button type="button" class="danger" data-wo="${side}" ${can ? '' : 'disabled'}>Forfait de ${esc(A.sideName(m, side))}</button>`).join('')}</div>
        <details class="ps-opts"><summary>Plus d'options</summary>
          <div class="ps-pp">${['A', 'B'].map(side => `<button type="button" class="pt" data-pt="${side}" ${off ? 'disabled' : ''}>+ Point ${esc(A.sideName(m, side, 'initial'))} ${side === 'A' ? '(← ou 1)' : '(→ ou 2)'}</button>`).join('')}</div>
          <div class="btns">
            <button type="button" data-undo ${m.points.length ? '' : 'disabled'}>Annuler le point</button>
            ${['A', 'B'].map(side => `<button type="button" data-ugm="${side}" ${can ? '' : 'disabled'}>− Jeu ${esc(A.sideName(m, side, 'initial'))}</button>`).join('')}
            ${['A', 'B'].map(side => `<button type="button" data-win="${side}" ${!can || (r.winner && r.winner === r[side]) ? 'disabled' : ''} title="Désigne le vainqueur sans saisir de score : le tableau avance">Vainqueur : ${esc(A.sideName(m, side, 'initial'))}</button>`).join('')}
          </div>
          <div class="form ps-oform">
            <label>1er serveur<select data-srv><option value="A" ${m.firstServer === 'A' ? 'selected' : ''}>${esc(A.sideName(m, 'A'))}</option><option value="B" ${m.firstServer === 'B' ? 'selected' : ''}>${esc(A.sideName(m, 'B'))}</option></select></label>
            <label>Format<select data-fmt><option value="">Par défaut</option>${E.FORMAT_KEYS.map(k => `<option ${m.format === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
            ${r.state !== 'done' && m.status !== 'live' ? `<label>Terrain<select data-court><option value="">Non programmé</option>${S.courts.map(c => `<option value="${c.id}" ${m.court === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
            ${replaceable('A')}${replaceable('B')}
          </div>
          <div class="btns"><button type="button" data-stream>Envoyer sur l'overlay</button><button type="button" data-reset>Réinitialiser le score</button></div>
          ${m.manual && m.manual.noScore ? '<p class="muted small">Vainqueur désigné sans score : saisissez le score dans les cases quand vous l\'avez.</p>' : ''}
          <p class="muted small">Super jeu décisif : saisir les points (ex. 10-8). Clavier : ← → pour un point, Maj + ← → pour un jeu.</p>
        </details>
        <div class="btns ps-mact"><button type="button" data-close>Annuler</button><button type="button" class="accent" data-valid ${can ? '' : 'disabled'}>${psIc('<path d="M5 12l5 5 9-10"/>')}Valider le score</button></div>`;
    }, box => {
      const m = S.matches.find(x => x.id === id);
      if (!m) return;
      $$('.ps-set', box).forEach(i => i.oninput = () => { draft[i.name] = i.value; });
      const pk = $('[data-pick]', box); if (pk) pk.onchange = () => { if (pk.value !== id) openMatchModal(pk.value); };
      $$('[data-pt]', box).forEach(b => b.onclick = () => send('match/point', { id, team: b.dataset.pt }));
      $$('[data-gm]', box).forEach(b => b.onclick = () => send('match/game', { id, team: b.dataset.gm }));
      $$('[data-st1]', box).forEach(b => b.onclick = () => send('match/set', { id, team: b.dataset.st1 }));
      $$('[data-ugm]', box).forEach(b => b.onclick = () => send('match/ungame', { id, team: b.dataset.ugm }));
      $$('[data-win]', box).forEach(b => b.onclick = () => {
        const done = R[id].state === 'done';
        if (done && !confirm('Le match a déjà un vainqueur. Le remplacer par ' + A.sideName(m, b.dataset.win) + ' ?')) return;
        send('match/winner', { id, team: b.dataset.win }).then(() => A.toast('Vainqueur : ' + A.sideName(m, b.dataset.win) + ' — le score reste modifiable dans les cases', 'ok'));
      });
      const ab = $('[data-ab]', box), wo = $('.ps-wo', box);
      if (ab) { ab.checked = !!draft.ab; wo.hidden = !ab.checked; ab.onchange = () => { draft.ab = ab.checked; wo.hidden = !ab.checked; }; }
      const u = $('[data-undo]', box); if (u) u.onclick = () => send('match/undoPoint', { id });
      $('[data-srv]', box).onchange = e => send('match/server', { id, team: e.target.value });
      $('[data-fmt]', box).onchange = e => send('match/format', { id, format: e.target.value || null });
      const ct = $('[data-court]', box); if (ct) ct.onchange = e => send('schedule/move', { id, court: e.target.value || null });
      $('[data-stream]', box).onclick = () => { send('display/set', { stream: id }); A.toast('Match envoyé sur l\'overlay', 'ok'); };
      const valid = () => {
        const f = $('[data-man]', box);
        A.send('match/manual', { id, sets: [0, 1, 2].map(i => [f['A' + i].value, f['B' + i].value]) }).then(() => { Object.keys(draft).forEach(k => delete draft[k]); A.toast('Score validé', 'ok'); closeModal(); }, () => {});
      };
      $('[data-man]', box).onsubmit = e => { e.preventDefault(); valid(); };
      $('[data-valid]', box).onclick = valid;
      $$('[data-wo]', box).forEach(b => b.onclick = () => confirm('Déclarer le forfait (WO) de ' + A.sideName(m, b.dataset.wo) + ' ?') && send('match/wo', { id, team: b.dataset.wo }));
      $('[data-reset]', box).onclick = () => confirm('Effacer le score de ce match ?') && send('match/reset', { id });
      $$('[data-rep]', box).forEach(s => s.onchange = () => s.value && send('draw/replace', { oldId: s.dataset.rep, newId: s.value }));
    }, { matchId: id });
  }

  function startMatch(id) {
    const PS = E.pairsStatus(S, R), r = R[id];
    const resting = ['A', 'B'].filter(s => PS[r[s]] && PS[r[s]].state === 'rest');
    if (resting.length && !confirm(resting.map(s => `${A.pairName(r[s])} est en repos obligatoire jusqu'à ${A.hhmm(PS[r[s]].restUntil)}.`).join('\n') + '\n\nLancer quand même (accord écrit des 4 joueurs) ?')) return;
    send('match/start', { id }).then(() => openMatchModal(id));
  }

  /* ---------------- modale générique ---------------- */
  function openModal(html, bind, opts) {
    opts = opts || {};
    if (!opts.matchId) $('#modal').classList.remove('ps-side');
    modal = {
      opts,
      render() {
        if (opts.static && $('#modalBox').dataset.ready) return;
        const box = $('#modalBox');
        const focusName = document.activeElement && box.contains(document.activeElement) ? document.activeElement.name : null;
        const det = $$('details', box).map(d => d.open);
        box.innerHTML = html();
        $$('details', box).forEach((d, i) => { if (det[i] != null) d.open = det[i]; });
        box.dataset.ready = '1';
        $$('[data-close]', box).forEach(b => b.onclick = closeModal);
        bind && bind(box);
        if (focusName && box.querySelector(`[name="${focusName}"]`)) box.querySelector(`[name="${focusName}"]`).focus();
      }
    };
    delete $('#modalBox').dataset.ready;
    $('#modal').hidden = false;
    modal.render();
  }
  function closeModal() { modal = null; $('#modal').hidden = true; $('#modal').classList.remove('ps-side'); delete $('#modalBox').dataset.ready; }
  $('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });

  /* =====================================================================
     05 · PROGRAMMATION
     ===================================================================== */
  $('#schedAuto').onclick = () => send('schedule/auto');
  $('#schedClear').onclick = () => confirm('Retirer des terrains tous les matchs non commencés ?') && send('schedule/clear');

  /* carte de match (maquette, point 4) : ▶ et ✎ visibles en 44 px, Monter / Descendre / Retirer du créneau dans « … » */
  function schedCard(m, tl, PS) {
    const r = R[m.id], t = tl[m.id];
    const team = (s, pre) => `<div class="sc-t"><span>${pre}${esc(A.sideName(m, s))}</span>${r.state === 'ready' || r.state === 'waiting' ? A.restBadge(PS[r[s]]) : ''}</div>`;
    const etat = r.state === 'live' ? '<span class="tag ps-st-live">En cours</span>' : r.state === 'done' ? '<span class="tag ps-st-done">Joué · ' + esc(E.scoreText(r)) + '</span>' : '';
    const menu = r.state !== 'done' && m.status !== 'live';
    return `<div class="scard st-${r.state}" draggable="${r.state === 'done' ? 'false' : 'true'}" data-id="${m.id}">
      <div class="sc-top"><span>${t ? (r.state === 'live' ? 'Depuis ' + A.hhmm(m.startedAt) : r.state === 'done' ? '' : A.hhmm(t.start)) : ''}${t && r.state !== 'done' ? ' · ' : ''}M${m.num} · ${r.fk}</span><span class="tag ps-sc-lbl">${esc(E.matchLabel(m))}</span></div>
      ${team('A', '')}${team('B', 'contre ')}
      <div class="sc-bot">${etat}
        <span class="sc-acts">
          ${r.state === 'ready' && m.court ? `<button class="accent ps-ib" data-start aria-label="Lancer le match M${m.num}">${PSI.play}</button>` : ''}
          <button class="ps-ib" data-open aria-label="Score du match M${m.num}">${PSI.edit}</button>
          ${menu ? `<button class="ps-more" data-more aria-label="Plus d'actions pour M${m.num}" aria-haspopup="menu">${PSI.more}</button>` : ''}
        </span></div></div>`;
  }

  /* ---------- ordre des matchs (M1, M2…) : glisser-déposer ---------- */
  let orderDrag = null;
  /* sections repliables, repliées par défaut : on voit le titre, un clic les déplie */
  function foldable(card, body, key) {
    const set = open => { body.hidden = !open; card.classList.toggle('open', open); try { localStorage.setItem(key, open ? '1' : '0'); } catch (e) {} };
    let open = false; try { open = localStorage.getItem(key) === '1'; } catch (e) {}
    set(open);
    card.querySelector('.fold-h').addEventListener('click', e => { if (e.target.closest('button:not(.fold-tg), a, input, select')) return; set(body.hidden); });
  }
  foldable($('#orderCard'), $('#orderBody'), 'padelja-order-open');
  foldable($('.tpl-card'), $('#tplBody'), 'padelja-tpl-open');
  (function psFiche() {
    // Fiche (maquette, écran 1) : colonne de droite « Inscriptions sur /Buvette » (choix en cases) et « Formats préenregistrés »
    const tt = $('#tab-tournoi'), fside = document.createElement('aside'); fside.className = 'ps-fside';
    const regSel = $('[data-f="regMode"]'), regLab = regSel && regSel.closest('label'), whereLab = $('[data-f="regWhere"]') && $('[data-f="regWhere"]').closest('label');
    const REG = [['', 'Dans l’appli /Buvette du club'], ['ext', 'Ailleurs (préciser où)'], ['none', 'Ne pas publier sur /Buvette']];
    fside.innerHTML = `<section class="card ps-reg"><h3>${psIc('<path d="M12 15V3M7 8l5-5 5 5M4 15v6h16v-6"/>')}Inscriptions sur /Buvette</h3>
      <div class="ps-radios" role="radiogroup" aria-label="Où les joueurs s'inscrivent">${REG.map(([v, l]) => `<label><input type="radio" name="psReg" value="${v}">${l}</label>`).join('')}</div>
      <div class="ps-where"></div><p class="muted small">Les joueurs du club voient le tournoi et s’inscrivent depuis leur téléphone.</p></section>`;
    tt.appendChild(fside);
    if (regLab) { regLab.hidden = true; [...regSel.options].forEach((o, i) => { o.textContent = REG[i] ? REG[i][1] : o.textContent; }); }
    if (whereLab) $('.ps-where', fside).appendChild(whereLab);
    $$('input[name=psReg]', fside).forEach(r => r.onchange = () => { if (!regSel || !r.checked) return; regSel.value = r.value; regSel.dispatchEvent(new Event('change')); });
    const tplc = $('.tpl-card');
    if (tplc) { fside.appendChild(tplc); $('#tplBody').hidden = false; tplc.classList.add('open'); const h = $('h3', tplc); if (h) { const pc = h.querySelector('.pic'); h.textContent = 'Formats préenregistrés'; if (pc) h.prepend(pc); } const sv = $('#tplSave'); if (sv) sv.innerHTML = psIc('<path d="M12 5v14M5 12h14"/>') + 'Enregistrer comme modèle'; }
  })();

  /* RGPD : texte prêt à afficher pour informer les joueurs */
  if ($('#rgpdCopy')) $('#rgpdCopy').onclick = () => {
    const txt = 'Information : vos nom, prénom, numéro de licence, classement, club et résultats sont enregistrés par le juge-arbitre dans le logiciel /RAM JA '
      + 'pour organiser ce tournoi, puis conservés dans sa base de joueurs pendant 3 ans après votre dernier tournoi (historique, inscriptions plus rapides). '
      + 'Vous pouvez à tout moment demander à les consulter, les corriger ou les supprimer auprès du juge-arbitre ou de /RAM JA (ja.riseandmove.fr).';
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => A.toast('Texte copié : collez-le sur la fiche ou l\'affiche du tournoi', 'ok'))
      .catch(() => window.prompt('Copiez ce texte :', txt));
  };

  /* page Tournoi : chaque section se replie (choix mémorisé sur l'appareil) ;
     sur ordinateur (souris, pavé tactile), une seule carte avec des onglets */
  (function tournSections() {
    const wrap = $('#tsecs'), tabs = $('#tsecTabs');
    if (!wrap) return;
    const secs = $$('.tsec', wrap), KEY = 'padelja-sec-', TAB = 'padelja-sec-tab';
    // onglets : ordinateur, et tout écran assez large (iPad en paysage), même au doigt
    const tabMode = () => matchMedia('(hover: hover) and (pointer: fine) and (min-width: 721px), (min-width: 1101px)').matches;
    // grand écran : ces onglets passent dans la colonne de gauche, sous « Tournoi » (deux niveaux de menu, pas trois)
    const sub = document.createElement('div');
    sub.className = 'subnav'; sub.id = 'tsecNav'; sub.setAttribute('aria-label', 'Parties de la fiche tournoi');
    const navT = $('#nav button[data-tab="tournoi"]');
    if (navT) navT.after(sub);
    const pick = id => {
      secs.forEach(c => c.classList.toggle('cur', c.dataset.sec === id));
      $$('.tsec-tab', tabs).forEach(b => { b.classList.toggle('on', b.dataset.sec === id); b.setAttribute('aria-selected', b.dataset.sec === id); });
      $$('button', sub).forEach(b => b.classList.toggle('on', b.dataset.sec === id));
      try { localStorage.setItem(TAB, id); } catch (e) {}
    };
    if (window.Pictos) Pictos.decorate(wrap);   // pictogrammes à la place des numéros 01, 02…
    tabs.classList.add('r-itabs');
    secs.forEach((card, ci) => {
      const id = card.dataset.sec, head = document.createElement('div'), title = document.createElement('div'), body = document.createElement('div');
      head.className = 'row-between fold-h'; body.className = 'fold-b';
      card.insertBefore(head, card.firstChild);
      title.append(card.querySelector('.eyebrow'), card.querySelector('h3'));
      head.append(title);
      head.insertAdjacentHTML('beforeend', '<button class="ghost sq fold-tg" type="button" aria-label="Afficher / masquer"><svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>');
      while (head.nextSibling) body.append(head.nextSibling);
      card.append(body);
      if (id === 'formule') {  // deux colonnes sur grand écran : réglages à gauche, formats et durées à droite
        const cols = document.createElement('div'), l = document.createElement('div'), r = document.createElement('div');
        cols.className = 'fcols'; l.className = 'fcol-l'; r.className = 'fcol-r';
        [...body.children].forEach(n => (n.matches('.form, #planBox') ? l : r).append(n));
        cols.append(l, r); body.append(cols);
      }
      card.classList.add('foldable');
      let open = true; try { open = localStorage.getItem(KEY + id) !== '0'; } catch (e) {}
      card.classList.toggle('open', open);
      head.addEventListener('click', e => {
        if (tabMode() || e.target.closest('button:not(.fold-tg), a, input, select')) return;
        const o = !card.classList.contains('open');
        card.classList.toggle('open', o);
        try { localStorage.setItem(KEY + id, o ? '1' : '0'); } catch (e) {}
      });
      tabs.insertAdjacentHTML('beforeend', `<button type="button" role="tab" class="tsec-tab" data-sec="${id}">${String(ci + 1).padStart(2, '0')} · ${card.dataset.label}</button>`);
      sub.insertAdjacentHTML('beforeend', `<button type="button" data-sec="${id}">${card.dataset.label}</button>`);
    });
    $$('.tsec-tab', tabs).forEach(b => b.onclick = () => pick(b.dataset.sec));
    $$('button', sub).forEach(b => b.onclick = () => { if (tab !== 'tournoi') setTab('tournoi'); pick(b.dataset.sec); scrollTo({ top: 0 }); });
    let cur = ''; try { cur = localStorage.getItem(TAB) || ''; } catch (e) {}
    pick(secs.some(c => c.dataset.sec === cur) ? cur : secs[0].dataset.sec);
  })();

  /* tableaux de données : jamais plus larges que leur carte, on fait défiler à l'intérieur */
  const wrapTables = () => document.querySelectorAll('table.tbl').forEach(t => {
    if (t.parentElement.classList.contains('tbl-wrap')) return;
    const w = document.createElement('div'); w.className = 'tbl-wrap'; t.before(w); w.appendChild(t);
  });
  wrapTables();
  new MutationObserver(wrapTables).observe(document.querySelector('main') || document.body, { childList: true, subtree: true });

  /* tableau final : zoom au pincement à deux doigts (le reste de l'interface ne zoome pas) */
  (function bracketZoom() {
    const el = $('#bracketEd'), reset = $('#bzReset');
    if (!el) return;
    let z = 1, start = null;
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    function set(nz, cx) {
      nz = Math.min(2.5, Math.max(0.4, nz));
      const mx = cx - el.getBoundingClientRect().left, sl = el.scrollLeft, k = nz / z;
      z = nz; el.style.setProperty('--bz', z);
      el.scrollLeft = (sl + mx) * k - mx; // garde le point entre les doigts sous les doigts
      if (reset) reset.hidden = Math.abs(z - 1) < 0.03;
    }
    el.addEventListener('touchstart', e => { if (e.touches.length === 2) start = { d: dist(e.touches), z }; }, { passive: true });
    el.addEventListener('touchmove', e => {
      if (e.touches.length !== 2 || !start) return;
      e.preventDefault();
      set(start.z * dist(e.touches) / start.d, (e.touches[0].clientX + e.touches[1].clientX) / 2);
    }, { passive: false });
    el.addEventListener('touchend', e => { if (e.touches.length < 2) start = null; });
    if (reset) reset.addEventListener('click', () => set(1, el.getBoundingClientRect().left));
  })();
  $('#orderReset').onclick = () => confirm('Revenir à l\'ordre standard des matchs ?') && send('order/reset');
  $('#orderTpl').onclick = () => { setTab('tournoi'); setTimeout(() => $('#tplSave').click(), 50); };

  function renderOrder() {
    const real = !!(S.draw && S.draw.built);
    const X = real ? S : E.previewStructure(S);
    const box = $('#orderList');
    if (!X) { box.innerHTML = '<p class="muted">Ajoutez des paires (ou réglez le nombre de paires) pour voir l\'ordre des matchs.</p>'; $('#orderWarn').innerHTML = ''; return; }
    const RX = real ? R : E.resolve(X);
    const list = E.orderedMatches(X, RX);
    const byId = {}; X.matches.forEach(m => { byId[m.id] = m; });
    const src = s => {
      if (!s) return '';
      if (s.poule) return (s.rank === 1 ? '1er' : s.rank + 'e') + ' poule ' + s.poule;
      if (s.from) return (s.take === 'W' ? 'V. M' : 'P. M') + byId[s.from].num;
      return real ? A.pairName(s.pair, 'last') : (s.pair === 'BYE' ? 'Exempt' : 'Tirage');
    };
    const custom = Array.isArray(S.order) && S.order.length;
    $('#orderState').textContent = (custom ? '· ordre personnalisé' : '· ordre standard') + (real ? '' : ` · aperçu avant tirage (${list.length} matchs)`);
    $('#orderReset').disabled = !custom;
    const issues = E.orderIssues(X, RX);
    $('#orderWarn').innerHTML = issues.length ? `<div class="alert warn">${issues.map(i => `M${i.num} est placé avant M${i.after.join(', M')} dont il dépend`).join(' · ')} : il sera programmé après eux sur les terrains.</div>` : '';
    const bad = new Set(issues.map(i => i.id));
    const sig = list.map(m => m.id + (RX[m.id].state) + (real ? (RX[m.id].A || '') + (RX[m.id].B || '') : '')).join(',') + custom + issues.length;
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    box.innerHTML = list.map((m, i) => {
      const r = RX[m.id];
      const who = real && r.A && r.B ? `${esc(A.pairName(r.A, 'last'))} – ${esc(A.pairName(r.B, 'last'))}` : `${esc(src(m.srcA))} – ${esc(src(m.srcB))}`;
      return `<div class="ord ph-${m.phase} ${m.a === 1 && m.phase === 'TF' ? 'main' : ''} ${bad.has(m.id) ? 'bad' : ''} st-${r.state}" draggable="true" data-k="${E.matchKey(m)}">
        <b>M${m.num}</b><div><span class="ord-l">${esc(E.matchLabel(m))}</span><span class="ord-w">${who}</span></div>
        <span class="ord-btn"><button class="sm ghost" data-mv="-1" title="Avancer" aria-label="Avancer"><svg class="ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg></button><button class="sm ghost" data-mv="1" title="Reculer" aria-label="Reculer"><svg class="ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button></span></div>`;
    }).join('');
    const keysNow = () => $$('.ord', box).map(el => el.dataset.k);
    const commit = keys => send('order/set', { keys });
    $$('.ord', box).forEach(el => {
      el.ondragstart = e => { orderDrag = el; dragging = true; el.classList.add('drag'); e.dataTransfer.setData('text/plain', el.dataset.k); };
      el.ondragend = () => { dragging = false; el.classList.remove('drag'); $$('.ord.over', box).forEach(x => x.classList.remove('over')); };
      el.ondragover = e => { e.preventDefault(); if (el !== orderDrag) el.classList.add('over'); };
      el.ondragleave = () => el.classList.remove('over');
      el.ondrop = e => {
        e.preventDefault(); el.classList.remove('over');
        if (!orderDrag || orderDrag === el) return;
        const keys = keysNow().filter(k => k !== orderDrag.dataset.k);
        const r = el.getBoundingClientRect();
        const after = e.clientX > r.left + r.width / 2;
        keys.splice(keys.indexOf(el.dataset.k) + (after ? 1 : 0), 0, orderDrag.dataset.k);
        dragging = false; commit(keys);
      };
      $$('[data-mv]', el).forEach(b => b.onclick = () => {
        const keys = keysNow(), i = keys.indexOf(el.dataset.k), j = i + +b.dataset.mv;
        if (j < 0 || j >= keys.length) return;
        [keys[i], keys[j]] = [keys[j], keys[i]]; commit(keys);
      });
    });
  }

  function renderSched() {
    renderOrder();
    if (!S.draw || !S.draw.built) { $('#sched').innerHTML = '<p class="muted">Effectuez le tirage au sort pour programmer les matchs.</p>'; $('#schedWarn').innerHTML = ''; return; }
    const tl = E.timeline(S, R), PS = E.pairsStatus(S, R, tl);
    const W = E.dayChecks(S, R, tl);
    $('#schedWarn').innerHTML = W.slice(0, 6).map(w => `<div class="alert ${w.lvl}">${esc(w.msg)}</div>`).join('') + (W.length > 6 ? `<div class="muted small">+ ${W.length - 6} autre(s) alerte(s) — onglet Direct & repos</div>` : '');
    const list = S.matches.filter(m => !R[m.id].staticBye);
    const unsched = list.filter(m => !m.court && R[m.id].state !== 'done').sort((a, b) => a.num - b.num);
    const col = (cid, title, items, sub) => `<div class="scol" data-court="${cid}"><div class="scol-h"><b>${esc(title)}</b><small>${sub || ''}</small></div><div class="scol-b">${items.map(m => schedCard(m, tl, PS)).join('') || '<div class="drop-hint">Déposez un match ici</div>'}</div></div>`;
    $('#sched').innerHTML = col('', 'À programmer', unsched, unsched.length + ' match(s)') +
      S.courts.map(c => {
        const items = list.filter(m => m.court === c.id).sort((a, b) => a.order - b.order);
        const last = items.length ? tl[items[items.length - 1].id] : null;
        return col(c.id, c.name, items, `Début ${c.start}${last ? ' · fin ~' + A.hhmm(last.end) : ''}`);
      }).join('');
    $$('#sched .scard').forEach(card => {
      const id = card.dataset.id, m = S.matches.find(x => x.id === id);
      card.ondragstart = e => { dragging = true; e.dataTransfer.setData('text/plain', id); card.classList.add('drag'); };
      card.ondragend = () => { dragging = false; card.classList.remove('drag'); };
      const b = (s, fn) => { const el = $(s, card); if (el) el.onclick = e => { e.stopPropagation(); fn(); }; };
      b('[data-start]', () => startMatch(id));
      b('[data-open]', () => openMatchModal(id));
      const mb = $('[data-more]', card);
      if (mb) mb.onclick = e => { e.stopPropagation(); psMenu(mb, [
        m.court && ['Monter', PSI.up, () => send('schedule/move', { id, court: m.court, index: Math.max(0, m.order - 1) })],
        m.court && ['Descendre', PSI.down, () => send('schedule/move', { id, court: m.court, index: m.order + 1 })],
        m.court && ['Retirer du créneau', PSI.x, () => send('schedule/move', { id, court: null })],
        !m.court && ['Ouvrir le match', PSI.edit, () => openMatchModal(id)]
      ]); };
      card.ondblclick = () => openMatchModal(id);
    });
    $$('#sched .scol').forEach(colEl => {
      colEl.ondragover = e => { e.preventDefault(); colEl.classList.add('over'); };
      colEl.ondragleave = () => colEl.classList.remove('over');
      colEl.ondrop = e => {
        e.preventDefault(); colEl.classList.remove('over'); dragging = false;
        const id = e.dataTransfer.getData('text/plain');
        const court = colEl.dataset.court || null;
        const cards = $$('.scard', colEl).filter(c => c.dataset.id !== id);
        let index = cards.length;
        for (let i = 0; i < cards.length; i++) { const r = cards[i].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { index = i; break; } }
        send('schedule/move', { id, court, index });
      };
    });
  }

  /* =====================================================================
     06 · DIRECT & REPOS
     ===================================================================== */
  function renderDirect() {
    if (!S.draw || !S.draw.built) { $('#liveList').innerHTML = '<p class="muted">Aucun match pour l\'instant.</p>'; $('#allMatches').innerHTML = ''; $('#restTbl').innerHTML = ''; $('#dayChecks').innerHTML = ''; psDirect(null, null); return; }
    const tl = E.timeline(S, R), PS = E.pairsStatus(S, R, tl);
    $('#liveList').innerHTML = S.courts.map(c => {
      const q = S.matches.filter(m => m.court === c.id && !R[m.id].staticBye).sort((a, b) => a.order - b.order);
      const cur = q.find(m => R[m.id].state === 'live') || q.find(m => R[m.id].state === 'ready' || R[m.id].state === 'waiting');
      if (!cur) return `<div class="lcard ps-court"><div class="ps-ch"><b>${esc(c.name)}</b><span class="tag ps-st-free">Libre</span></div><p class="muted">Aucun match programmé</p></div>`;
      return psCourtCard(c, cur, PS);
    }).join('');
    // la carte s'ouvre sur la saisie du score ; ▶ lance un match prêt
    $$('#liveList [data-o]').forEach(b => { b.onclick = e => { if (!e.target.closest('[data-st]')) openMatchModal(b.dataset.o); }; b.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === b) { e.preventDefault(); openMatchModal(b.dataset.o); } }; });
    $$('#liveList [data-st]').forEach(b => b.onclick = e => { e.stopPropagation(); startMatch(b.dataset.st); });

    const order = { playing: 0, rest: 1, ready: 2, fresh: 3, idle: 4 };
    const rows = Object.values(PS).sort((a, b) => order[a.state] - order[b.state] || (b.waiting || 0) - (a.waiting || 0));
    $('#restTbl').innerHTML = `<thead><tr><th>Paire</th><th>État</th><th>Joués</th><th>Fin dernier match</th><th>Prochain match</th></tr></thead><tbody>` + rows.map(x => {
      const nm = x.next && S.matches.find(m => m.id === x.next);
      return `<tr><td>${esc(A.pairName(x.pair, 'initial'))}</td><td>${A.restBadge(x) || '<span class="muted small">Éliminée / terminé</span>'}</td><td>${x.played}</td>
        <td>${x.lastEnd ? A.hhmm(x.lastEnd) + ' <span class="muted small">(' + x.lastFk + ')</span>' : '-'}</td>
        <td>${nm ? `M${nm.num} · ${nm.court ? esc(A.courtName(nm.court)) + ' ' : ''}${tl[nm.id] ? '~' + A.hhmm(tl[nm.id].start) : ''}` : '-'}</td></tr>`;
    }).join('') + '</tbody>';

    const W = E.dayChecks(S, R, tl);
    $('#dayChecks').innerHTML = W.map(w => `<div class="alert ${w.lvl}">${esc(w.msg)}</div>`).join('') || '<div class="alert ok">Aucune infraction détectée sur le nombre de matchs par jour et les horaires.</div>';

    const all = S.matches.filter(m => !R[m.id].staticBye).sort((a, b) => a.num - b.num);
    $('#allMatches').innerHTML = `<thead><tr><th>N°</th><th>Tour</th><th>Équipe 1</th><th>Équipe 2</th><th>Score</th><th>Terrain</th><th>État</th></tr></thead><tbody>` +
      all.map(m => { const r = R[m.id]; return `<tr data-m="${m.id}" class="click"><td>M${m.num}</td><td>${esc(E.matchLabel(m))}</td>
        <td class="${r.winner && r.winner === r.A ? 'wtxt' : ''}">${esc(A.sideName(m, 'A'))}</td><td class="${r.winner && r.winner === r.B ? 'wtxt' : ''}">${esc(A.sideName(m, 'B'))}</td>
        <td>${esc(E.scoreText(r))}</td><td>${esc(A.courtName(m.court))} ${tl[m.id] && r.state !== 'done' ? '~' + A.hhmm(tl[m.id].start) : ''}</td>
        <td><span class="pill st-${r.state}">${({ waiting: 'Attente', ready: 'Prêt', live: 'En cours', done: 'Terminé' })[r.state] || ''}</span></td></tr>`; }).join('') + '</tbody>';
    $$('#allMatches [data-m]').forEach(tr => tr.onclick = () => openMatchModal(tr.dataset.m));
    psDirect(tl, PS);
  }

  /* =====================================================================
     07 · DIFFUSION
     ===================================================================== */
  $$('#tvViews [data-tv]').forEach(b => b.onclick = () => send('display/set', { tv: b.dataset.tv, rotate: false }));
  $('#rotate').onchange = e => send('display/set', { rotate: e.target.checked });
  const VIEWS = [['bracket', 'Tableau final'], ['poules', 'Poules / qualifs'], ['schedule', 'Programmation'], ['live', 'Scores en direct'], ['standings', 'Classement'], ['info', 'Fiche tournoi'], ['stats', 'Stats du club']];
  $('#rotViews').innerHTML = VIEWS.map(([k, l]) => `<label class="chk"><input type="checkbox" value="${k}"> ${l}</label>`).join('');
  $$('#rotViews input').forEach(cb => cb.onchange = () => {
    const sel = $$('#rotViews input').filter(x => x.checked).map(x => x.value);
    if (!sel.length) { cb.checked = true; return A.toast('Gardez au moins un écran dans la rotation', 'err'); }
    send('display/set', { rotateViews: sel });
  });
  $('#rotateSec').onchange = e => send('display/set', { rotateSec: +e.target.value || 20 });
  $('#ticker').onchange = e => send('display/set', { ticker: e.target.value });
  $('#streamSel').onchange = e => send('display/set', { stream: e.target.value || null });
  $('#overlayBg').onchange = e => send('display/set', { overlay: e.target.value });
  const openTv = () => window.open(A.page + '/tv', 'padelja-tv-' + A.tid, 'popup,width=1280,height=720');
  const openOverlay = () => window.open(A.page + '/overlay', 'padelja-overlay-' + A.tid, 'popup,width=1280,height=720');
  $('#btnTv').onclick = openTv; $('#btnTv2').onclick = openTv;
  $('#btnOverlay').onclick = openOverlay; $('#btnOverlay2').onclick = openOverlay;

  let info = null;
  fetch(A.base + '/info').then(r => r.json()).then(d => { info = d; if (tab === 'diffusion') render(); });

  function renderDiffusion() {
    const d = S.display;
    $$('#tvViews [data-tv]').forEach(b => b.classList.toggle('on', b.dataset.tv === d.tv && !d.rotate));
    const rv = d.rotateViews || ['bracket', 'poules', 'schedule', 'live', 'standings'];
    $$('#rotViews input').forEach(cb => { cb.checked = rv.includes(cb.value); });
    fill($('#rotate'), d.rotate); fill($('#rotateSec'), d.rotateSec); fill($('#ticker'), d.ticker); fill($('#overlayBg'), d.overlay);
    $$('[data-obg]').forEach(b => b.setAttribute('aria-selected', b.dataset.obg === (d.overlay || 'green')));
    const opts = S.matches.filter(m => R[m.id] && (R[m.id].state === 'live' || R[m.id].state === 'ready' || m.id === d.stream)).sort((a, b) => a.num - b.num);
    const sel = $('#streamSel');
    if (document.activeElement !== sel) sel.innerHTML = `<option value="">— Aucun —</option>` + opts.map(m => `<option value="${m.id}" ${m.id === d.stream ? 'selected' : ''}>M${m.num} · ${esc(A.sideName(m, 'A'))} vs ${esc(A.sideName(m, 'B'))}${m.court ? ' · ' + esc(A.courtName(m.court)) : ''}</option>`).join('');
    const m = d.stream && S.matches.find(x => x.id === d.stream);
    if (m) {
      const r = R[m.id], sc = r.score;
      const fl = sc && !sc.manual ? E.pointFlags(r.fk, m.points, m.firstServer) : {};
      const side = s => `<div class="sp-team ${sc && sc.server === s ? 'srv' : ''}">
        <div class="sp-name">${esc(A.sideName(m, s, 'initial'))}</div>
        <div class="sp-score">${sc ? sc.sets.map(x => `<span>${x.stb ? x.stb[s] : x[s]}</span>`).join('') : ''}${sc && !sc.winner && !sc.manual ? `<span class="g">${sc.mode === 'game' ? sc.games[s] : ''}</span><span class="p">${sc.labels[s]}</span>` : ''}</div>
        ${fl[s] ? `<div class="flag">${fl[s]}</div>` : ''}
        <button class="pt big" data-spt="${s}" ${r.state === 'live' || r.state === 'ready' ? '' : 'disabled'}>+ Point</button>
        <div class="games-row"><button class="ghost" data-sgm="${s}" ${r.state === 'live' || r.state === 'ready' ? '' : 'disabled'}>+ Jeu</button><button class="ghost" data-sugm="${s}">− Jeu</button></div></div>`;
      $('#streamPad').innerHTML = `<div class="sp">${side('A')}${side('B')}</div>
        <div class="btns"><button class="ghost" id="spUndo"><svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg> Annuler (Retour arrière)</button><button class="ghost" id="spSrv">Changer 1er serveur (S)</button></div>
        <p class="muted small">Raccourcis : <b>←</b> ou <b>1</b> point équipe 1 · <b>→</b> ou <b>2</b> point équipe 2 · <b>Retour arrière</b> annuler · <b>S</b> serveur.</p>`;
      $$('[data-spt]').forEach(b => b.onclick = () => send('match/point', { id: m.id, team: b.dataset.spt }));
      $$('[data-sgm]').forEach(b => b.onclick = () => send('match/game', { id: m.id, team: b.dataset.sgm }));
      $$('[data-sugm]').forEach(b => b.onclick = () => send('match/ungame', { id: m.id, team: b.dataset.sugm }));
      $('#spUndo').onclick = () => send('match/undoPoint', { id: m.id });
      $('#spSrv').onclick = () => send('match/server', { id: m.id, team: m.firstServer === 'A' ? 'B' : 'A' });
    } else $('#streamPad').innerHTML = '<p class="muted">Choisissez un match à diffuser (« prêt » ou « en cours »).</p>';
    if (info && info.key) {
      const bases = [info.origin].concat(info.online ? [] : info.lan.map(ip => `http://${ip}:${info.port}`));
      const link = (label, path, note) => `<div><b>${label}</b>${note ? ` <span class="muted small">${note}</span>` : ''}<br>${bases.map(b => `<code>${esc(b + A.page + path)}</code>`).join(' ')}</div>`;
      $('#urls').innerHTML = `<h4>Liens à ouvrir sur un autre appareil</h4>
        ${link('Écran TV', '/tv?k=' + info.key, '(smart TV, PC branché à la télé…)')}
        ${link('Overlay OBS', '/overlay?k=' + info.key + '&bg=transparent', '(source navigateur, fond transparent)')}
        ${link('Overlay d\'un terrain', '/overlay?k=' + info.key + '&court=' + (S.courts[0] ? S.courts[0].id : 'c1'))}
        ${link('Télécommande téléphone', '/remote', '(saisie des scores)')}
        <div><b>Code PIN télécommande</b> : <span class="pin">${info.pin}</span></div>
        <p class="muted small">La clé contenue dans ces liens permet seulement d'afficher le tournoi (et de retourner les cartes du tirage). Ne la diffusez pas publiquement.</p>`;
    }
  }

  /* =====================================================================
     IMPRESSIONS / EXPORTS
     ===================================================================== */
  const DOCS = [
    ['tableau', 'Tableau final', 'Arborescence du tableau, scores'],
    ['poules', 'Poules', 'Classements et résultats des poules'],
    ['qualifs', 'Qualifications', 'Tableau de qualification'],
    ['programmation', 'Programmation', 'Ordre des matchs par terrain, horaires'],
    ['resultats', 'Résultats', 'Tous les matchs avec scores'],
    ['classement', 'Classement final', 'Places de chaque paire'],
    ['inscrits', 'Liste des inscrits', 'Paires, classements, poids, dates'],
    ['fiche', 'Fiche tournoi', 'Infos, formats, règlement']
  ];
  $('#btnPrint').onclick = () => openModal(() => `<span class="eyebrow">Impression</span><h3>Imprimer ou enregistrer en PDF</h3>
    <p class="muted">Le document s'ouvre dans une nouvelle fenêtre. Choisissez « Enregistrer au format PDF » ou « Microsoft Print to PDF » comme imprimante pour obtenir un PDF.</p>
    <div class="docs">${DOCS.map(d => `<button class="ghost" data-doc="${d[0]}">${d[1]}<small>${d[2]}</small></button>`).join('')}</div>
    <h4>Exports tableur</h4><div class="btns"><button class="ghost" id="csvRes">Résultats (.csv Excel)</button><button class="ghost" id="csvPairs">Inscrits (.csv Excel)</button><button class="ghost" data-close>Fermer</button></div>`, box => {
    $$('[data-doc]', box).forEach(b => b.onclick = () => window.open(A.page + '/print?doc=' + b.dataset.doc, 'padelja-print', 'popup,width=1100,height=800'));
    $('#csvRes', box).onclick = () => downloadCsv('resultats', resultsRows());
    $('#csvPairs', box).onclick = () => downloadCsv('inscrits', pairsRows());
  }, { static: true });

  function resultsRows() {
    const tl = E.timeline(S, R);
    const rows = [['N°', 'Phase', 'Tour', 'Équipe 1', 'Équipe 2', 'Vainqueur', 'Score', 'Format', 'Terrain', 'Début', 'Fin']];
    S.matches.filter(m => !R[m.id].staticBye).sort((a, b) => a.num - b.num).forEach(m => {
      const r = R[m.id];
      rows.push(['M' + m.num, { P: 'Poules', Q: 'Qualifications', TF: 'Tableau final' }[m.phase], E.matchLabel(m), A.sideName(m, 'A'), A.sideName(m, 'B'),
        r.winner && r.winner !== 'BYE' ? A.pairName(r.winner) : '', E.winnerScoreText(r), r.fk, A.courtName(m.court),
        m.startedAt ? A.hhmm(m.startedAt) : (tl[m.id] ? '~' + A.hhmm(tl[m.id].start) : ''), m.endedAt ? A.hhmm(m.endedAt) : '']);
    });
    return rows;
  }
  function pairsRows() {
    const rows = [['Statut', 'NOM 1', 'Prénom 1', 'Clt 1', 'Licence 1', 'NOM 2', 'Prénom 2', 'Clt 2', 'Licence 2', 'Poids', 'Inscription', 'WC']];
    const sel = E.selection(S);
    [['Retenue', sel.main], ['Attente', sel.waiting], ['Forfait', sel.withdrawn]].forEach(([st, l]) => l.forEach(p => rows.push([st, p.p1.last, p.p1.first, p.p1.rank, p.p1.licence, p.p2.last, p.p2.first, p.p2.rank, p.p2.licence, E.weightOf(p), p.registeredAt, p.wc ? 'oui' : ''])));
    return rows;
  }
  function downloadCsv(name, rows) {
    const csv = '﻿' + rows.map(r => r.map(v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${(S.tournament.name || 'tournoi').replace(/[^\w\- ]+/g, '').trim()}_${name}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* =====================================================================
     BOUTONS GÉNÉRAUX & RACCOURCIS
     ===================================================================== */
  /* ---------- barre d'application (téléphone) + menu « ⋯ » ---------- */
  const sheet = $('#moreSheet');
  const closeSheet = () => { sheet.classList.remove('open'); setTimeout(() => { sheet.hidden = true; }, 220); };
  const openSheet = () => { sheet.hidden = false; requestAnimationFrame(() => sheet.classList.add('open')); };
  $('#abMore').onclick = openSheet;
  $$('#nav [data-plus]').forEach(b => b.onclick = openSheet);   // téléphone : « Plus » ouvre les sections rangées
  $('#abTv').onclick = () => $('#btnTv').click();
  sheet.addEventListener('click', e => {
    if (e.target === sheet) return closeSheet();
    const g = e.target.closest('[data-goto]');
    if (g) { closeSheet(); return setTab(g.dataset.goto); }
    const b = e.target.closest('[data-act]'); if (!b) return;
    closeSheet();
    if (b.dataset.act !== 'close') setTimeout(() => $('#' + b.dataset.act).click(), 60);
  });

  $('#btnUndo').onclick = () => A.undo();
  $('#btnExport').onclick = () => { location.href = A.base + '/export'; };
  $('#btnImport').onclick = () => $('#fileImport').click();
  $('#fileImport').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { try { const st = JSON.parse(rd.result); if (!st.tournament) throw 0; send('state/replace', { state: st }); A.toast('Tournoi importé', 'ok'); } catch (_) { A.toast('Fichier invalide', 'err'); } };
    rd.readAsText(f); e.target.value = '';
  };
  $('#btnDemo').onclick = () => confirm('Remplir ce tournoi avec 16 paires fictives (remplace les inscriptions actuelles) ?') && send('demo/load', { n: 16 });
  fetch('/api/me').then(r => r.json()).then(d => { if (d.user && d.user.guest) $('#guestBar').hidden = false; });
  $('#btnHelp').onclick = showHelp;

  function showHelp() {
    openModal(() => `<span class="eyebrow">Aide</span><h3>Raccourcis clavier</h3>
      <table class="tbl"><tbody>
      <tr><td><kbd>Alt</kbd>+<kbd>1</kbd>…<kbd>7</kbd></td><td>Changer d'onglet</td></tr>
      <tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd></td><td>Annuler la dernière action</td></tr>
      <tr><td><kbd>Entrée</kbd></td><td>Valider une inscription</td></tr>
      <tr><td><kbd>1</kbd>…<kbd>9</kbd> (pavé numérique)</td><td>Tirage au sort : retourner la carte portant ce numéro (plusieurs chiffres puis Entrée)</td></tr>
      <tr><td><kbd>←</kbd> / <kbd>1</kbd> · <kbd>→</kbd> / <kbd>2</kbd></td><td>Point équipe 1 / équipe 2 (fiche match ouverte, ou onglet 7)</td></tr>
      <tr><td><kbd>Maj</kbd>+<kbd>←</kbd> · <kbd>Maj</kbd>+<kbd>→</kbd></td><td>Jeu pour l'équipe 1 / l'équipe 2 (score suivi aux jeux)</td></tr>
      <tr><td><kbd>Retour arrière</kbd></td><td>Annuler le dernier point</td></tr>
      <tr><td><kbd>S</kbd></td><td>Changer le premier serveur</td></tr>
      <tr><td><kbd>T</kbd> <kbd>O</kbd> <kbd>P</kbd> <kbd>D</kbd> <kbd>C</kbd> <kbd>I</kbd> <kbd>S</kbd> <kbd>G</kbd></td><td>Écran TV : Tableau · Poules · Programmation · Direct · Classement · Infos · Stats du club · Tirage (onglet 7)</td></tr>
      <tr><td><kbd>R</kbd></td><td>Rotation automatique de l'écran TV (onglet 7)</td></tr>
      <tr><td><kbd>Échap</kbd></td><td>Fermer la fenêtre</td></tr>
      </tbody></table><div class="btns"><button class="accent" data-close>OK</button></div>`, null, { static: true });
  }

  document.addEventListener('keydown', e => {
    const inField = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (e.altKey && /^[1-7]$/.test(e.key)) { e.preventDefault(); setTab(TABS[+e.key - 1]); return; }
    if (e.key === 'Escape' && modal) { closeModal(); return; }
    if (inField || !S) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); A.undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '?') return showHelp();
    if (!modal && tab === 'tirage' && S.draw && E.currentPot(S.draw)) { if (drawKeys(e)) return; }
    const target = modal && modal.opts.matchId ? modal.opts.matchId : (tab === 'diffusion' ? S.display.stream : null);
    if (target) {
      const m = S.matches.find(x => x.id === target);
      if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); return send('match/game', { id: target, team: e.key === 'ArrowLeft' ? 'A' : 'B' }); }
      if (e.key === 'ArrowLeft' || e.key === '1') { e.preventDefault(); return send('match/point', { id: target, team: 'A' }); }
      if (e.key === 'ArrowRight' || e.key === '2') { e.preventDefault(); return send('match/point', { id: target, team: 'B' }); }
      if (e.key === 'Backspace') { e.preventDefault(); return send('match/undoPoint', { id: target }); }
      if (e.key.toLowerCase() === 's' && m) return send('match/server', { id: target, team: m.firstServer === 'A' ? 'B' : 'A' });
    }
    if (modal) return;
    if (tab === 'diffusion') {
      const map = { t: 'bracket', o: 'poules', p: 'schedule', d: 'live', c: 'standings', i: 'info', s: 'stats', g: 'draw' };
      const k = e.key.toLowerCase();
      if (map[k]) return send('display/set', { tv: map[k], rotate: false });
      if (k === 'r') return send('display/set', { rotate: !S.display.rotate });
    }
  });

  let saved = 'tournoi';
  try { saved = localStorage.getItem('padelja-tab') || 'tournoi'; } catch (e) {}
  setTab(saved);
})();
