/* PADEL JA — Éditeur du juge-arbitre (charte /RAM) */
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
    $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $$('.tab').forEach(s => s.classList.toggle('on', s.id === 'tab-' + t));
    try { localStorage.setItem('padelja-tab', t); } catch (e) {}
    render();
  }
  $$('#nav button').forEach(b => b.onclick = () => setTab(b.dataset.tab));

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
    $('#btnUndo').disabled = !A.canUndo || !!t.closed;
    $('#closedBar').hidden = !t.closed;
    if (t.closed) $('#closedAt').textContent = 'le ' + new Date(t.closedAt).toLocaleDateString('fr-FR');
    document.body.classList.toggle('is-closed', !!t.closed);
    const ann = [`${t.name}`, `${t.category} ${t.gender}`, t.club, t.balls && 'Balles : ' + t.balls, t.prize].concat((t.sponsors || []).map(s => s.name)).concat('/RAM — Rise And Move').filter(Boolean).join('   ✦   ');
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
  }
  $('#addCourt').onclick = () => send('court/add', {});

  /* ---------- clôture, réouverture, remises à zéro ---------- */
  const closeT = async () => {
    const left = S.matches.filter(m => !R[m.id].staticBye && R[m.id].state !== 'done').length;
    const msg = (left ? `⚠ ${left} match(s) ne sont pas terminés : les paires concernées seront classées à la place la moins favorable.\n\n` : '') +
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
      : `<p class="muted small">À la fin du tournoi, clôturez-le : il passe dans « Tournois clôturés » et chaque joueur est enregistré avec sa place et ses points FFT (fiche, historique, saisie semi-automatique dans vos prochains tournois et ceux des autres juges-arbitres Padel JA).</p>
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
      <button class="ghost sm danger" data-rm title="Supprimer ce partenaire">✕</button></div>`).join('') || '<p class="muted small">Aucun partenaire pour l\'instant.</p>';
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
    $('#realDurs').innerHTML = `<h4>Durées réelles de ce tournoi <small class="muted">du lancement ▶ à la fin du match, mise à jour en continu</small></h4>` + (keys.length
      ? `<div class="rd-list">${keys.map(k => {
        const x = by[k], g = k[0], est = cur[g] || E.DEFAULT_DUR[g], avg = x.done.length ? avgOf(x.done) : null;
        return `<div class="rd"><b>${k}</b>
          ${avg != null ? `<span><strong>${avg} min</strong> en moyenne · ${x.done.length} match${x.done.length > 1 ? 's' : ''} terminé${x.done.length > 1 ? 's' : ''}</span>` : '<span class="muted">Pas encore de match terminé</span>'}
          ${x.live.length ? `<span class="rd-live">${x.live.length} en cours · depuis ${x.live.map(v => Math.floor(v) + ' min').join(', ')}</span>` : ''}
          ${x.quick ? `<small class="muted">${x.quick} score${x.quick > 1 ? 's' : ''} saisi${x.quick > 1 ? 's' : ''} en moins d'une minute, non compté${x.quick > 1 ? 's' : ''}</small>` : ''}
          <small class="muted">Prévu : ${est} min (format ${g})</small>${avg != null && avg !== est ? `<button class="ghost sm" data-rd="${g}" data-v="${avg}">Prévoir ${avg} min</button>` : ''}</div>`;
      }).join('')}</div>`
      : '<p class="muted small">Lancez un match avec ▶ : sa durée s\'affiche ici en direct, puis la moyenne par format dès qu\'il est terminé.</p>');
    $$('[data-rd]').forEach(b => b.onclick = () => send('tournament/update', { durations: Object.assign({}, S.tournament.durations, { [b.dataset.rd]: +b.dataset.v }) }));
  }
  setInterval(() => { if (tab === 'tournoi') renderRealDurs(); }, 30000);   // les chronos des matchs en cours avancent

  function renderTournoi() {
    const t = S.tournament;
    renderTemplates();
    renderRealDurs();
    $$('[data-f]').forEach(el => fill(el, t[el.dataset.f]));
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
        <span class="c-logo"><label class="c-logo-pick" title="Logo du partenaire du terrain (naming)">${c.logo ? `<img src="${esc(c.logo)}" alt="">` : '<em>+ Logo</em>'}<input type="file" accept="image/*" hidden data-clogo></label>${c.logo ? '<button class="c-logo-rm" data-clogorm title="Retirer le logo" aria-label="Retirer le logo">✕</button>' : ''}</span>
        <input value="${esc(c.name)}" data-k="name"><input type="time" value="${esc(c.start)}" data-k="start">
        <button class="ghost sm danger" data-rm>✕</button>
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
    const pl = n => Object.assign({ last: form['l' + n].value.trim(), first: form['f' + n].value.trim(), rank: form['r' + n].value.trim(), licence: form['i' + n].value.trim() },
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
    form['l' + n].value = p.last || ''; form['f' + n].value = p.first || ''; form['r' + n].value = p.rank || ''; form['i' + n].value = p.licence || '';
    setKnown(n, p); closeSug();
    (n === 1 ? form.l2 : form.date).focus();
  }
  function showSug(n) {
    const box = $('#sug' + n);
    if (!sug.items.length) { box.hidden = true; sug.open = false; return; }
    box.innerHTML = sug.items.map((p, i) => `<div class="sg ${i === sug.active ? 'on' : ''}" data-i="${i}"><b>${esc(p.last)}</b> ${esc(p.first)}
      <span>${p.licence ? 'Lic. ' + esc(p.licence) : ''}${p.rank ? ' · Clt ' + esc(p.rank) : ''}</span><em>${p.tournaments} tournoi${p.tournaments > 1 ? 's' : ''}</em></div>`).join('');
    box.hidden = false; sug.open = true; sug.n = n;
    $$('.sg', box).forEach(el => el.onmousedown = e => { e.preventDefault(); pickSuggestion(n, sug.items[+el.dataset.i]); });
  }
  ['l', 'f', 'i'].forEach(k => [1, 2].forEach(n => {
    const inp = form[k + n];
    inp.addEventListener('input', () => {
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
    const place = x => (x.place === 1 ? '🏆 1er' : x.placeLo && x.placeLo !== x.place ? `${x.placeLo}-${x.place}e` : x.place + 'e');
    return `<span class="eyebrow">Fiche joueur</span><h3>${esc(p.last)} ${esc(p.first)}</h3>
      <div class="muted">${p.licence ? 'Licence ' + esc(p.licence) : 'Licence non renseignée'}${p.rank ? ' · classement ' + esc(p.rank) : ''}</div>
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
  const plCell = (pl, k) => `<span class="pl-link" data-pl="${k}" title="Fiche joueur"><b>${esc((pl.last || '').toUpperCase())}</b> ${esc(pl.first || '')}</span> <span class="rk">${pl.rank ? esc(pl.rank) : 'NC'}</span>${pl.playerId ? ' <span class="known-dot" title="Joueur connu de la base">●</span>' : ''}`;

  function pairRows(list, kind) {
    if (!list.length) return `<tr><td class="muted empty">Aucune paire</td></tr>`;
    return `<thead><tr><th>#</th><th>Joueur 1</th><th>Joueur 2</th><th>Poids</th><th>Inscription</th><th></th></tr></thead><tbody>` +
      list.map((p, i) => {
        const ts = A.seedOf(p.id);
        return `<tr data-id="${p.id}">
          <td class="num">${kind === 'main' && ts ? `<span class="ts">TS${ts}</span>` : i + 1}</td>
          <td>${plCell(p.p1, 'p1')}</td><td>${plCell(p.p2, 'p2')}</td>
          <td class="num"><b>${E.weightOf(p) >= 99999 ? 'NC' : E.weightOf(p)}</b></td>
          <td>${fmtDate(p.registeredAt)} ${p.wc ? '<span class="tag">WC</span>' : ''}</td>
          <td class="acts">
            <button class="ghost sm" data-a="edit" title="Modifier">✎</button>
            ${kind === 'wd' ? '<button class="ghost sm" data-a="restore">Réintégrer</button>' : '<button class="ghost sm" data-a="wd" title="Forfait / retrait">Forfait</button>'}
            <button class="ghost sm danger" data-a="del" title="Supprimer">✕</button>
          </td></tr>`;
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
      $$('[data-a]', tr).forEach(b => b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'edit') openPairModal(id);
        if (a === 'restore') send('pair/withdraw', { id, value: false });
        if (a === 'del' && confirm('Supprimer définitivement cette paire ?')) send('pair/remove', { id });
        if (a === 'wd') { if (S.draw && S.draw.entrants.includes(id)) openReplaceModal(id); else send('pair/withdraw', { id, value: true }); }
      });
    });
  }

  function openPairModal(id) {
    const p = A.pairs[id]; if (!p) return;
    openModal(() => `<span class="eyebrow">Paire</span><h3>Modifier la paire</h3>
      <form id="pf" class="form">
        ${[1, 2].map(n => { const pl = p['p' + n]; return `
          <label>NOM ${n}<input name="l${n}" value="${esc(pl.last)}"></label><label>Prénom ${n}<input name="f${n}" value="${esc(pl.first)}"></label>
          <label>Classement ${n}<input name="r${n}" value="${esc(pl.rank)}"></label><label>Licence ${n}<input name="i${n}" value="${esc(pl.licence)}"></label>`; }).join('')}
        <label>Date d'inscription<input type="datetime-local" name="date" value="${esc(p.registeredAt)}"></label>
        <label class="chk"><input type="checkbox" name="wc" ${p.wc ? 'checked' : ''}> Wild-card</label>
        <label class="span2">Note<input name="note" value="${esc(p.note)}"></label>
        <div class="span2 btns"><button class="accent">Enregistrer</button><button type="button" class="ghost" data-close>Annuler</button></div>
      </form>`, box => {
      $('#pf', box).onsubmit = e => {
        e.preventDefault(); const f = e.target;
        const pl = n => ({ last: f['l' + n].value.trim(), first: f['f' + n].value.trim(), rank: f['r' + n].value.trim(), licence: f['i' + n].value.trim() });
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
      el.innerHTML = `<div class="card"><div class="row-between"><div><span class="eyebrow">Tirage terminé</span><h3>Tableaux constitués</h3></div>
        <div class="btns"><button class="accent" id="goTab">Voir les tableaux</button><button class="ghost" id="tvDraw">Récap. sur la TV</button>
        <button class="ghost danger" id="drawReset" ${started ? 'disabled title="Des matchs ont commencé"' : ''}>Annuler le tirage</button></div></div>
        ${sessionsPreview(D)}</div>`;
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
        <div class="card"><span class="eyebrow">Progression</span><ul class="pots" id="potList"></ul><div id="drawPrev" style="margin-top:16px"></div></div></div>`;
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
        return `<h4>${esc(s.label)}</h4><div class="pgrid">${s.letters.map((L, i) => `<div><h5>Poule ${L}</h5>${Array.from({ length: s.sizes[i] }, (_, r) => {
          const tk = s.fill[`${L}:${r}`];
          return `<p class="${tk ? '' : 'empty'}">${r + 1}. ${tk ? esc(A.pairName(tk, 'last')) : '—'}</p>`; }).join('')}</div>`).join('')}</div>`;
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
      return `<div><h4>Poule ${P.id} ${st.complete ? '<span class="tag lime">Terminée</span>' : ''}</h4>
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
  }

  /* =====================================================================
     MODALE MATCH : score en direct, saisie manuelle, WO, remplacement
     ===================================================================== */
  function openMatchModal(id) {
    openModal(() => {
      const m = S.matches.find(x => x.id === id); if (!m) return '<p>Match introuvable</p>';
      const r = R[m.id];
      const can = r.A && r.B && r.state !== 'bye';
      const sc = r.score;
      const flags = can && !m.manual && !m.wo ? E.pointFlags(r.fk, m.points, m.firstServer) : {};
      const live = sc && !sc.manual ? sc : null;
      const PS = E.pairsStatus(S, R);
      const team = side => `
        <div class="lteam ${r.winner && r.winner === r[side] ? 'win' : ''}">
          <div class="lname">${live && live.server === side && !live.winner ? '<span class="ball">●</span>' : ''}${esc(A.sideName(m, side, 'initial'))}</div>
          <div>${r.state !== 'done' && r.state !== 'live' ? A.restBadge(PS[r[side]]) : ''}</div>
          <div class="lsets">${(sc ? sc.sets : []).map(s => `<span class="${s.w === side ? 'w' : ''}">${s.stb ? s.stb[side] : s[side]}${s.tb && s.w !== side ? `<sup>${s.tb[side]}</sup>` : ''}</span>`).join('')}
            ${live && !live.winner ? `<span class="g">${live.mode === 'game' ? live.games[side] : ''}</span><span class="p">${live.labels[side]}</span>` : ''}</div>
          ${flags[side] ? `<div class="flag">${flags[side]}</div>` : ''}
          <button class="pt" data-pt="${side}" ${!can || r.state === 'done' ? 'disabled' : ''}>+ Point ${side === 'A' ? '(← ou 1)' : '(→ ou 2)'}</button>
          <div class="games-row"><button class="ghost" data-gm="${side}" ${!can || r.state === 'done' ? 'disabled' : ''} title="Donne le jeu en cours (Maj + ${side === 'A' ? '←' : '→'})">+ Jeu</button>
            <button class="ghost" data-ugm="${side}" ${!can ? 'disabled' : ''} title="Retire le dernier jeu gagné">− Jeu</button></div>
          <button class="win-btn" data-win="${side}" ${!can || (r.winner && r.winner === r[side]) ? 'disabled' : ''} title="Désigne le vainqueur sans saisir de score : le tableau avance">🏆 Vainqueur</button>
        </div>`;
      const replaceable = side => {
        const src = side === 'A' ? m.srcA : m.srcB;
        if (!src || !src.pair || !E.isPair(src.pair) || r.state === 'done' || m.points.length) return '';
        const w = E.selection(S).waiting; if (!w.length) return '';
        return `<label>Remplacer ${esc(A.pairName(src.pair))} (forfait) par<select data-rep="${src.pair}"><option value="">—</option>${w.map(p => `<option value="${p.id}">${esc(A.pairName(p.id))}</option>`).join('')}</select></label>`;
      };
      const msets = (m.manual && m.manual.sets) || [];
      const restWarn = r.state === 'ready' ? ['A', 'B'].filter(s => PS[r[s]] && PS[r[s]].state === 'rest').map(s => `${A.pairName(r[s])} : repos obligatoire jusqu'à ${A.hhmm(PS[r[s]].restUntil)}`) : [];
      return `
        <div class="row-between"><div><span class="eyebrow">M${m.num} · ${m.court ? esc(A.courtName(m.court)) : 'non programmé'}</span><h3>${esc(E.matchLabel(m))}</h3></div>
          <span class="pill st-${r.state}">${({ waiting: 'En attente', ready: 'Prêt', live: 'En cours', done: 'Terminé', bye: 'Exempt' })[r.state]}</span></div>
        <div class="muted">Format ${r.fk} — ${E.FORMATS[r.fk].name}${live && live.decisivePoint ? ' · <b class="hot">POINT DÉCISIF</b>' : ''}</div>
        ${restWarn.map(w => `<div class="alert err" style="margin-top:10px">${esc(w)} — accord écrit des 4 joueurs requis pour jouer avant.</div>`).join('')}
        <div class="lscore">${team('A')}<div class="vs">VS</div>${team('B')}</div>
        <div class="btns">
          <button class="ghost" data-undo ${m.points.length ? '' : 'disabled'}>↶ Annuler le point</button>
          <label class="inline">1er serveur <select data-srv><option value="A" ${m.firstServer === 'A' ? 'selected' : ''}>${esc(A.sideName(m, 'A'))}</option><option value="B" ${m.firstServer === 'B' ? 'selected' : ''}>${esc(A.sideName(m, 'B'))}</option></select></label>
          <label class="inline">Format <select data-fmt><option value="">Par défaut</option>${E.FORMAT_KEYS.map(k => `<option ${m.format === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
          ${r.state !== 'done' && m.status !== 'live' ? `<label class="inline">Terrain <select data-court><option value="">Non programmé</option>${S.courts.map(c => `<option value="${c.id}" ${m.court === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
          <button class="ghost" data-stream>Envoyer sur l'overlay</button>
        </div>
        ${m.manual && m.manual.noScore ? '<div class="alert info" style="margin-top:10px">Vainqueur désigné sans score. Vous pouvez saisir le score ci-dessous quand vous l\'avez.</div>' : ''}
        <details ${m.manual ? 'open' : ''}><summary>Saisie rapide du score final</summary>
          <form class="manual" data-man>${[0, 1, 2].map(i => `<span>Set ${i + 1}</span><input type="number" min="0" max="99" name="a${i}" value="${msets[i] ? msets[i][0] : ''}"><b>-</b><input type="number" min="0" max="99" name="b${i}" value="${msets[i] ? msets[i][1] : ''}">`).join('')}
          <button class="accent">Valider</button></form>
          <p class="muted small">Super jeu décisif : saisir les points (ex. 10-8). Équipe 1 à gauche.</p>
        </details>
        <div class="form" style="margin-top:12px">${replaceable('A')}${replaceable('B')}</div>
        <div class="btns">
          <button class="ghost danger" data-wo="A" ${can ? '' : 'disabled'}>WO ${esc(A.sideName(m, 'A'))}</button>
          <button class="ghost danger" data-wo="B" ${can ? '' : 'disabled'}>WO ${esc(A.sideName(m, 'B'))}</button>
          <button class="ghost" data-reset>Réinitialiser</button>
          <button class="ghost" data-close>Fermer (Échap)</button>
        </div>`;
    }, box => {
      const m = S.matches.find(x => x.id === id);
      $$('[data-pt]', box).forEach(b => b.onclick = () => send('match/point', { id, team: b.dataset.pt }));
      $$('[data-gm]', box).forEach(b => b.onclick = () => send('match/game', { id, team: b.dataset.gm }));
      $$('[data-ugm]', box).forEach(b => b.onclick = () => send('match/ungame', { id, team: b.dataset.ugm }));
      $$('[data-win]', box).forEach(b => b.onclick = () => {
        const done = R[id].state === 'done';
        if (done && !confirm('Le match a déjà un vainqueur. Le remplacer par ' + A.sideName(m, b.dataset.win) + ' ?')) return;
        send('match/winner', { id, team: b.dataset.win }).then(() => A.toast('Vainqueur : ' + A.sideName(m, b.dataset.win) + ' — score modifiable dans « Saisie rapide du score final »', 'ok'));
      });
      const u = $('[data-undo]', box); if (u) u.onclick = () => send('match/undoPoint', { id });
      $('[data-srv]', box).onchange = e => send('match/server', { id, team: e.target.value });
      $('[data-fmt]', box).onchange = e => send('match/format', { id, format: e.target.value || null });
      const ct = $('[data-court]', box); if (ct) ct.onchange = e => send('schedule/move', { id, court: e.target.value || null });
      $('[data-stream]', box).onclick = () => { send('display/set', { stream: id }); A.toast('Match envoyé sur l\'overlay', 'ok'); };
      $('[data-man]', box).onsubmit = e => { e.preventDefault(); const f = e.target; send('match/manual', { id, sets: [0, 1, 2].map(i => [f['a' + i].value, f['b' + i].value]) }); };
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
  function closeModal() { modal = null; $('#modal').hidden = true; delete $('#modalBox').dataset.ready; }
  $('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });

  /* =====================================================================
     05 · PROGRAMMATION
     ===================================================================== */
  $('#schedAuto').onclick = () => send('schedule/auto');
  $('#schedClear').onclick = () => confirm('Retirer des terrains tous les matchs non commencés ?') && send('schedule/clear');

  function schedCard(m, tl, PS) {
    const r = R[m.id], t = tl[m.id];
    const team = s => `<div class="sc-t"><span>${esc(A.sideName(m, s))}</span>${r.state === 'ready' || r.state === 'waiting' ? A.restBadge(PS[r[s]]) : ''}</div>`;
    return `<div class="scard st-${r.state}" draggable="${r.state === 'done' ? 'false' : 'true'}" data-id="${m.id}">
      <div class="sc-top"><b>M${m.num}</b><span>${esc(E.matchLabel(m))}</span><span class="fmt">${r.fk}</span></div>
      ${team('A')}${team('B')}
      <div class="sc-bot"><span class="time">${t ? (r.state === 'live' ? '● En cours depuis ' + A.hhmm(m.startedAt) : r.state === 'done' ? '✓ ' + esc(E.scoreText(r)) : '~' + A.hhmm(t.start)) : ''}</span>
        <span class="sc-acts">
          ${r.state === 'ready' && m.court ? `<button class="sm accent" data-start title="Lancer le match">▶</button>` : ''}
          ${r.state !== 'done' && m.status !== 'live' ? `<button class="sm ghost" data-up title="Monter">▲</button><button class="sm ghost" data-down title="Descendre">▼</button>` : ''}
          ${m.court && r.state !== 'done' && m.status !== 'live' ? `<button class="sm ghost" data-un title="Retirer du terrain">✕</button>` : ''}
          <button class="sm ghost" data-open title="Score">✎</button>
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
        <span class="ord-btn"><button class="sm ghost" data-mv="-1" title="Avancer">▲</button><button class="sm ghost" data-mv="1" title="Reculer">▼</button></span></div>`;
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
    $('#sched').innerHTML = col('', 'Non programmés', unsched, unsched.length + ' match(s)') +
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
      b('[data-up]', () => m.court && send('schedule/move', { id, court: m.court, index: Math.max(0, m.order - 1) }));
      b('[data-down]', () => m.court && send('schedule/move', { id, court: m.court, index: m.order + 1 }));
      b('[data-un]', () => send('schedule/move', { id, court: null }));
      b('[data-open]', () => openMatchModal(id));
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
    if (!S.draw || !S.draw.built) { $('#liveList').innerHTML = '<p class="muted">Aucun match pour l\'instant.</p>'; $('#allMatches').innerHTML = ''; $('#restTbl').innerHTML = ''; $('#dayChecks').innerHTML = ''; return; }
    const tl = E.timeline(S, R), PS = E.pairsStatus(S, R, tl);
    $('#liveList').innerHTML = S.courts.map(c => {
      const q = S.matches.filter(m => m.court === c.id && !R[m.id].staticBye).sort((a, b) => a.order - b.order);
      const cur = q.find(m => R[m.id].state === 'live') || q.find(m => R[m.id].state === 'ready' || R[m.id].state === 'waiting');
      if (!cur) return `<div class="lcard"><h4>${esc(c.name)}</h4><p class="muted">Aucun match programmé</p></div>`;
      const r = R[cur.id], sc = r.score;
      const line = side => `<div class="lc-row ${sc && sc.server === side && r.state === 'live' ? 'srv' : ''}"><span>${esc(A.sideName(cur, side))}</span>
        ${r.state !== 'live' ? A.restBadge(PS[r[side]]) : ''}
        <b>${sc ? sc.sets.map(s => s.stb ? s.stb[side] : s[side]).join(' ') : ''} ${r.state === 'live' && sc && !sc.manual ? `<em>${sc.mode === 'game' ? sc.games[side] : ''}</em> <u>${sc.labels[side]}</u>` : ''}</b>
        <button class="pt sm" data-pt="${side}" data-id="${cur.id}" ${r.state === 'live' || r.state === 'ready' ? '' : 'disabled'} title="+1 point">+1</button><button class="ghost sm" data-gm="${side}" data-id="${cur.id}" ${r.state === 'live' || r.state === 'ready' ? '' : 'disabled'} title="+1 jeu">+J</button></div>`;
      return `<div class="lcard st-${r.state}"><h4>${esc(c.name)} <span>M${cur.num} · ${esc(E.matchLabel(cur))} · ${r.fk}</span></h4>${line('A')}${line('B')}
        <div class="btns">${r.state === 'ready' ? `<button class="accent sm" data-st="${cur.id}">▶ Lancer</button>` : ''}<button class="ghost sm" data-u="${cur.id}">↶</button><button class="ghost sm" data-o="${cur.id}">Détails</button></div></div>`;
    }).join('');
    $$('#liveList [data-pt]').forEach(b => b.onclick = () => send('match/point', { id: b.dataset.id, team: b.dataset.pt }));
    $$('#liveList [data-gm]').forEach(b => b.onclick = () => send('match/game', { id: b.dataset.id, team: b.dataset.gm }));
    $$('#liveList [data-u]').forEach(b => b.onclick = () => send('match/undoPoint', { id: b.dataset.u }));
    $$('#liveList [data-o]').forEach(b => b.onclick = () => openMatchModal(b.dataset.o));
    $$('#liveList [data-st]').forEach(b => b.onclick = () => startMatch(b.dataset.st));

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
  }

  /* =====================================================================
     07 · DIFFUSION
     ===================================================================== */
  $$('#tvViews [data-tv]').forEach(b => b.onclick = () => send('display/set', { tv: b.dataset.tv, rotate: false }));
  $('#rotate').onchange = e => send('display/set', { rotate: e.target.checked });
  const VIEWS = [['bracket', 'Tableau final'], ['poules', 'Poules / qualifs'], ['schedule', 'Programmation'], ['live', 'Scores en direct'], ['standings', 'Classement'], ['info', 'Fiche tournoi']];
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
        <div class="btns"><button class="ghost" id="spUndo">↶ Annuler (Retour arrière)</button><button class="ghost" id="spSrv">Changer 1er serveur (S)</button></div>
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
  $('#abMore').onclick = () => { sheet.hidden = false; requestAnimationFrame(() => sheet.classList.add('open')); };
  $('#abTv').onclick = () => $('#btnTv').click();
  sheet.addEventListener('click', e => {
    if (e.target === sheet) return closeSheet();
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
      <tr><td><kbd>T</kbd> <kbd>O</kbd> <kbd>P</kbd> <kbd>D</kbd> <kbd>C</kbd> <kbd>I</kbd> <kbd>G</kbd></td><td>Écran TV : Tableau · Poules · Programmation · Direct · Classement · Infos · Tirage (onglet 7)</td></tr>
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
      const map = { t: 'bracket', o: 'poules', p: 'schedule', d: 'live', c: 'standings', i: 'info', g: 'draw' };
      const k = e.key.toLowerCase();
      if (map[k]) return send('display/set', { tv: map[k], rotate: false });
      if (k === 'r') return send('display/set', { rotate: !S.display.rotate });
    }
  });

  let saved = 'tournoi';
  try { saved = localStorage.getItem('padelja-tab') || 'tournoi'; } catch (e) {}
  setTab(saved);
})();
