/* /RAM JA — juges-arbitres adjoints d'un tournoi (tournoi FFT, animation, tournoi interne).
   Toute page qui contient un emplacement [data-adjoints] l'affiche : la liste des adjoints, et pour le
   juge-arbitre principal l'invitation par e-mail et le retrait. Un adjoint a les mêmes droits que le
   juge-arbitre principal, sauf supprimer le tournoi et choisir les adjoints. */
(function () {
  'use strict';
  const tid = location.pathname.split('/')[2];
  if (!tid) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let data = null, charge = null, msg = '';
  const lire = () => (charge = charge || fetch('/api/t/' + tid + '/adjoints').then(r => (r.ok ? r.json() : null)).then(d => { data = d; tout(); }).catch(() => {}));
  const html = () => {
    if (!data) return '<p class="muted small">Chargement…</p>';
    const l = data.adjoints || [];
    return `<span class="eyebrow">Équipe d’arbitrage</span><h3>Juges-arbitres adjoints</h3>
      <p class="muted small">Un adjoint gère le tournoi comme vous (inscriptions, tirage, programmation, scores), avec son propre compte /RAM JA. Il ne peut pas supprimer le tournoi.</p>
      ${l.length ? `<div class="adj-l">${l.map(e => `<div class="adj-p"><span class="adj-n">${esc(e)}</span>${data.proprio ? `<button type="button" class="ghost adj-x" data-adj-x="${esc(e)}">Retirer</button>` : ''}</div>`).join('')}</div>` : '<p class="muted small">Aucun adjoint pour le moment.</p>'}
      ${data.proprio ? `<form class="adj-f" data-adj-f><input type="email" name="e" placeholder="E-mail de l’adjoint" required autocomplete="off" aria-label="E-mail du juge-arbitre adjoint"><button class="btn">Inviter</button></form><p class="muted small">Il reçoit un e-mail et une notification ; le tournoi apparaît dans ses tournois dès qu’il se connecte avec cette adresse.</p>` : '<p class="note">Vous êtes juge-arbitre adjoint de ce tournoi.</p>'}
      ${msg ? `<p class="muted small" role="status">${esc(msg)}</p>` : ''}`;
  };
  function tout() {
    document.querySelectorAll('[data-adjoints]').forEach(el => {
      const h = html();
      if (el.dataset.adjH === h) return;
      el.dataset.adjH = h;
      el.innerHTML = h;
    });
  }
  async function envoyer(body, ok) {
    const r = await fetch('/api/t/' + tid + '/adjoints', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    msg = r.ok ? ok : d.error || 'Refusé';
    if (r.ok) data = d;
    tout();
  }
  document.addEventListener('submit', e => {
    const f = e.target;
    if (!f.matches || !f.matches('[data-adj-f]')) return;
    e.preventDefault();
    const em = f.e.value.trim();
    envoyer({ email: em }, em + ' est invité comme juge-arbitre adjoint');
  });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-adj-x]');
    if (!b) return;
    if (confirm('Retirer ' + b.dataset.adjX + ' des juges-arbitres adjoints ?')) envoyer({ email: b.dataset.adjX, remove: true }, 'Adjoint retiré');
  });
  // les pages redessinent leur contenu : l'emplacement est rempli à chaque fois qu'il réapparaît
  new MutationObserver(() => { if (document.querySelector('[data-adjoints]')) { if (data) tout(); else lire(); } }).observe(document.documentElement, { childList: true, subtree: true });
  const css = document.createElement('style');
  css.textContent = '.adj-l{display:grid;gap:6px;margin:8px 0}.adj-p{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--ui-r-sm,8px);background:var(--ui-surface-2,#f3f3f3)}.adj-n{flex:1;min-width:0;overflow-wrap:anywhere;font-weight:600}.adj-f{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.adj-f input{flex:1 1 220px}';
  document.head.appendChild(css);
  if (document.readyState !== 'loading') lire();
  else document.addEventListener('DOMContentLoaded', lire);
})();
