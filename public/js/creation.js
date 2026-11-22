/* /Pista — la fenêtre « Nouveau tournoi » (maquette /Pista, écran 5) : la même depuis Tournois, Calendrier et Tableau de bord.
   Fenêtre centrée, segmenté Officiels / Mes modèles / Vierge / Animations / Interne, tuiles sur deux colonnes,
   le premier modèle présélectionné en citron ; le nom se règle dessous, puis « Continuer » crée le tournoi.
   Tout lien vers /app#nouveau ou /app#animation l'ouvre sans quitter la page. */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ANIS = [
    ['americano', 'Americano', 'Nouveau partenaire à chaque manche, classement individuel aux points.'],
    ['mexicano', 'Mexicano', 'Équipes formées selon le classement : des matchs serrés.'],
    ['equipes', 'Americano par équipes', 'Paires fixes qui se rencontrent toutes.'],
    ['montee', 'Montée-descente', 'Les gagnants montent d’un terrain, les perdants descendent.']
  ];
  // tournoi interne d'un club : tableau à élimination joué sur plusieurs semaines, suivi par les adhérents dans /Buvette
  const INTERNES = [
    ['Tennis', 'Tournoi interne de tennis', 'Simple, tableau à élimination, matchs organisés par les joueurs sur plusieurs semaines.'],
    ['Padel', 'Tournoi interne de padel', 'Par équipes de deux, tableau à élimination sur plusieurs semaines.']
  ];
  const TABS = [['officiels', 'Officiels'], ['mine', 'Mes modèles'], ['vierge', 'Vierge'], ['animation', 'Animations'], ['interne', 'Interne']];
  const X = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const GO = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  let dlg = null, data = null, tab = 'officiels', pick = null, named = false;
  // les tuiles d'un onglet : [type, identifiant, étiquette, titre, détail]
  function items() {
    if (!data) return [];
    if (tab === 'officiels') return data.presets.map(t => ['tpl', t.id, (t.fields && t.fields.category) || 'Modèle', t.name, t.desc || 'Modèle officiel']);
    if (tab === 'mine') return data.mine.map(t => ['tpl', t.id, 'Mon modèle', t.name, t.desc || 'Modèle enregistré']);
    if (tab === 'interne') return INTERNES.map(a => ['interne', a[0], 'Interne', a[1], a[2]]);
    if (tab === 'vierge') return [['vierge', '', 'Vierge', 'Tournoi officiel vierge', 'Je configure tout moi-même.']];
    return ANIS.map(a => ['animation', a[0], 'Animation', a[1], a[2]]);
  }
  const nameFor = (kind, title) => kind === 'vierge' ? 'Mon tournoi' : kind === 'animation' ? title + ' du ' + new Date().toLocaleDateString('fr-FR', { weekday: 'long' }) : kind === 'interne' ? title + ' ' + new Date().getFullYear() : title;
  function choose(it) {
    pick = it ? { kind: it[0], id: it[1], title: it[3] } : null;
    const i = dlg.querySelector('#nvName');
    if (pick && !named) i.value = nameFor(pick.kind, pick.title);
    dlg.querySelector('#nvGo').disabled = !pick;
    dlg.querySelector('#nvLab').textContent = pick && pick.kind === 'animation' ? 'Nom de l’animation' : 'Nom du tournoi';
  }
  function draw() {
    dlg.querySelector('.nvtabs').innerHTML = TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${tab === k}" data-tab="${k}">${l}</button>`).join('');
    const l = items();
    if (!pick || !l.some(it => it[0] === pick.kind && it[1] === pick.id)) choose(l[0]);
    const body = !data ? '<p class="muted">Chargement…</p>'
      : !l.length ? '<p class="muted">Vous n’avez pas encore de modèle : enregistrez un tournoi comme modèle depuis sa fiche (« Enregistrer comme modèle »).</p>'
      : `<div class="tpls nvtiles">${l.map(([kind, id, tag, title, sub]) => `<button class="tpl${pick && pick.kind === kind && pick.id === id ? ' cur' : ''}" type="button" aria-pressed="${!!(pick && pick.kind === kind && pick.id === id)}" data-k="${kind}" data-id="${esc(id)}"><span class="tag">${esc(tag)}</span><b>${esc(title)}</b><small>${esc(sub)}</small></button>`).join('')}</div>`
        + (tab === 'interne' ? '<p class="muted small">Les adhérents suivent le tableau en direct dans /Buvette, saisissent leurs résultats et sont prévenus de leur prochain match.</p>' : '');
    dlg.querySelector('.nvbody').innerHTML = body;
  }
  async function create(name) {
    const b = pick.kind === 'animation' ? { kind: 'animation', format: pick.id, name } : pick.kind === 'interne' ? { kind: 'interne', sport: pick.id, name } : { name, template: pick.id || undefined };
    const err = dlg.querySelector('#nvErr'), r = await fetch('/api/tournaments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    const d = await r.json().catch(() => ({}));
    if (d.id) { location.href = '/t/' + d.id; return; }
    // essai terminé ou tournoi d'essai déjà utilisé : on explique et on propose les offres
    const shop = (d.access && d.access.shop) || (window.PadelAccess && window.PadelAccess.shop);
    err.hidden = false;
    err.innerHTML = esc(d.error || 'Création impossible.') + (shop ? ` <a href="${esc(shop)}" target="_blank" rel="noopener">Voir les offres /Pista</a>` : '');
  }
  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'nvdlg';
    dlg.setAttribute('aria-labelledby', 'nvTitle');
    dlg.innerHTML = `<div class="nvhead"><h2 id="nvTitle">Nouveau tournoi</h2><button class="nvx" type="button" data-close aria-label="Fermer">${X}</button></div>
      <div class="nvtabs seg" role="tablist" aria-label="Partir de"></div><div class="nvbody"></div>
      <form id="nvForm" class="nvform"><label class="nvlab" id="nvLab" for="nvName">Nom du tournoi</label><input id="nvName" maxlength="80" required>
        <p class="muted small">Le modèle remplit la fiche, la formule et les formats de jeu. Tout reste modifiable.</p>
        <p class="nverr" id="nvErr" hidden></p>
        <div class="phead-act nvact"><button class="btn" type="button" data-close>Fermer</button><button class="btn primary" type="submit" id="nvGo">${GO}Continuer</button></div></form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', e => {
      if (e.target === dlg || e.target.closest('[data-close]')) return dlg.close();
      const t = e.target.closest('[data-tab]');
      if (t) { tab = t.dataset.tab; return draw(); }
      const c = e.target.closest('.tpl');
      if (c) { const it = items().find(x => x[0] === c.dataset.k && String(x[1]) === c.dataset.id); choose(it); draw(); }
    });
    dlg.querySelector('#nvName').addEventListener('input', () => { named = true; });
    dlg.addEventListener('submit', e => { e.preventDefault(); const n = dlg.querySelector('#nvName').value.trim(); if (n && pick) create(n); });
  }
  async function open(start) {
    // la navigation douce (rail.js) remplace le contenu de la page : la fenêtre est recréée si besoin
    if (!dlg || !dlg.isConnected) build();
    tab = start || 'officiels'; pick = null; data = null; named = false;
    dlg.querySelector('#nvErr').hidden = true;
    dlg.showModal();
    draw();
    const d = await fetch('/api/tournaments').then(r => r.json()).catch(() => null);
    data = d ? { mine: d.mine || [], presets: d.presets || [] } : { mine: [], presets: [] };
    draw();
  }
  window.PadelCreate = { open };
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href="/app#nouveau"],a[href="/app#animation"],a[href="#nouveau"],a[href="#animation"]');
    if (!a) return;
    // avant la navigation douce de rail.js
    e.preventDefault(); e.stopPropagation();
    open(/animation/.test(a.getAttribute('href')) ? 'animation' : 'officiels');
  }, true);
  // arrivée depuis une autre page ou un ancien lien
  if (location.hash === '#nouveau' || location.hash === '#animation') addEventListener('load', () => { open(location.hash === '#animation' ? 'animation' : 'officiels'); history.replaceState(null, '', location.pathname); });
})();
