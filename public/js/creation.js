/* /RAM JA — la fenêtre « Nouveau tournoi » : la même depuis Tournois, Calendrier et Tableau de bord.
   Quatre choix : modèles officiels, mes modèles, tournoi vierge, animations.
   Tout lien vers /app#nouveau ou /app#animation l'ouvre sans quitter la page. */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ANIS = [
    ['americano', 'Americano', 'Nouveau partenaire à chaque manche, classement individuel aux points.'],
    ['mexicano', 'Mexicano', 'Équipes formées selon le classement : des matchs serrés.'],
    ['equipes', 'Americano par équipes', 'Paires fixes qui se rencontrent toutes.'],
    ['montee', 'Montée-descente', 'Les gagnants montent d’un terrain, les perdants descendent.']
  ];
  let dlg = null, data = null, tab = 'officiels', pick = null;
  const tabs = () => [['officiels', 'Modèles officiels'], ['mine', 'Mes modèles'], ['vierge', 'Vierge'], ['animation', 'Animations']];
  const card = (kind, id, tag, title, sub) => `<button class="tpl" type="button" data-k="${kind}" data-id="${esc(id)}"><span class="tag ${kind === 'animation' ? 'lime' : ''}">${esc(tag)}</span><b>${esc(title)}</b><small>${esc(sub)}</small></button>`;
  function body() {
    if (!data) return '<p class="muted">Chargement…</p>';
    if (pick) return `<form id="nvForm"><label class="nvlab" for="nvName">Nom ${pick.kind === 'animation' ? 'de l’animation' : 'du tournoi'}</label><input id="nvName" value="${esc(pick.name)}" maxlength="80" required>
      <p class="nverr" id="nvErr" hidden></p><div class="phead-act nvact"><button class="btn" type="button" id="nvBack">Retour</button><button class="btn primary" type="submit">Créer</button></div></form>`;
    if (tab === 'officiels') return `<div class="tpls">${data.presets.map(t => card('tpl', t.id, (t.fields && t.fields.category) || 'Modèle', t.name, t.desc || 'Modèle officiel')).join('')}</div>`;
    if (tab === 'mine') return data.mine.length ? `<div class="tpls">${data.mine.map(t => card('tpl', t.id, 'Mon modèle', t.name, t.desc || 'Modèle enregistré')).join('')}</div>` : '<p class="muted">Vous n’avez pas encore de modèle : enregistrez un tournoi comme modèle depuis ses réglages.</p>';
    if (tab === 'vierge') return `<div class="tpls">${card('vierge', '', 'Vierge', 'Tournoi officiel vierge', 'Je configure tout moi-même.')}</div>`;
    return `<div class="tpls">${ANIS.map(a => card('animation', a[0], 'Animation', a[1], a[2])).join('')}</div>`;
  }
  function draw() {
    dlg.querySelector('.nvtabs').hidden = !!pick;
    dlg.querySelector('.nvtabs').innerHTML = tabs().map(([k, l]) => `<button type="button" role="tab" aria-selected="${tab === k}" data-tab="${k}">${l}</button>`).join('');
    dlg.querySelector('.nvbody').innerHTML = body();
    if (pick) { const i = dlg.querySelector('#nvName'); i.focus(); i.select(); }
  }
  async function create(name) {
    const b = pick.kind === 'animation' ? { kind: 'animation', format: pick.id, name } : { name, template: pick.id || undefined };
    const err = dlg.querySelector('#nvErr'), r = await fetch('/api/tournaments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    const d = await r.json().catch(() => ({}));
    if (d.id) { location.href = '/t/' + d.id; return; }
    // essai terminé ou tournoi d'essai déjà utilisé : on explique et on propose les offres
    const shop = (d.access && d.access.shop) || (window.PadelAccess && window.PadelAccess.shop);
    err.hidden = false;
    err.innerHTML = esc(d.error || 'Création impossible.') + (shop ? ` <a href="${esc(shop)}" target="_blank" rel="noopener">Voir les offres /RAM JA</a>` : '');
  }
  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'nvdlg';
    dlg.setAttribute('aria-label', 'Nouveau tournoi');
    dlg.innerHTML = '<div class="nvhead"><h2>Nouveau tournoi</h2><button class="btn sm ghost" type="button" data-close aria-label="Fermer">Fermer</button></div><div class="nvtabs" role="tablist"></div><div class="nvbody"></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', e => {
      if (e.target === dlg || e.target.closest('[data-close]')) return dlg.close();
      const t = e.target.closest('[data-tab]');
      if (t) { tab = t.dataset.tab; return draw(); }
      if (e.target.closest('#nvBack')) { pick = null; return draw(); }
      const c = e.target.closest('.tpl');
      if (c) {
        const title = c.querySelector('b').textContent, kind = c.dataset.k;
        pick = { kind, id: c.dataset.id, name: kind === 'vierge' ? 'Mon tournoi' : kind === 'animation' ? title + ' du ' + new Date().toLocaleDateString('fr-FR', { weekday: 'long' }) : title };
        draw();
      }
    });
    dlg.addEventListener('submit', e => { e.preventDefault(); const n = dlg.querySelector('#nvName').value.trim(); if (n) create(n); });
  }
  async function open(start) {
    // la navigation douce (rail.js) remplace le contenu de la page : la fenêtre est recréée si besoin
    if (!dlg || !dlg.isConnected) build();
    tab = start || 'officiels'; pick = null; data = null;
    dlg.showModal();
    draw();
    {
      const d = await fetch('/api/tournaments').then(r => r.json()).catch(() => null);
      data = d ? { mine: d.mine || [], presets: d.presets || [] } : { mine: [], presets: [] };
      draw();
    }
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
