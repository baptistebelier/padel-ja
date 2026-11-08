/* /RAM JA — panneau « Tournoi en cours » : plusieurs tournois peuvent se jouer en même temps (un tournoi interne
   dure des semaines) ; ce panneau déroulant liste tous les tournois en cours et ouvre celui à éditer.
   Placé dans le bloc « Tournoi en cours » de l'éditeur, en tête des pages animation et tournoi interne,
   et sur le tableau de bord (emplacement [data-encours]). */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ici = (location.pathname.match(/^\/t\/([\w-]+)\/?$/) || [])[1] || '';
  const KIND = { interne: 'Tournoi interne', animation: 'Animation' };
  const enCours = t => !t.closed && !t.example && (t.drawn || t.kind === 'interne' && t.players);
  let liste = null;
  const ic = '<svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const etat = t => t.drawn ? (t.kind === 'animation' ? 'Manche ' + (t.rounds || 0) : t.done + '/' + t.matches + ' matchs') : 'Inscriptions';
  function html() {
    const l = liste.filter(t => enCours(t) || t.id === ici);
    if (l.length < 2) return '';
    const cur = l.find(t => t.id === ici);
    return `<details class="enc">
      <summary><span class="enc-t"><small>${l.length} tournois en cours</small><b>${esc(cur ? cur.name || 'Sans nom' : 'Choisir un tournoi')}</b></span>${ic}</summary>
      <div class="enc-l" role="list">${l.map(t => `<a role="listitem" href="/t/${esc(t.id)}"${t.id === ici ? ' aria-current="page"' : ''}><b>${esc(t.name || 'Sans nom')}</b><small>${esc([KIND[t.kind] || 'Tournoi', etat(t), t.adjoint ? 'adjoint' : ''].filter(Boolean).join(' · '))}</small></a>`).join('')}</div>
    </details>`;
  }
  function poser() {
    if (!liste) return;
    const h = html();
    // éditeur : sous le nom du tournoi ; pages animation et interne : avant l'en-tête de la page ; tableau de bord : son emplacement
    const cibles = [...document.querySelectorAll('[data-encours]')];
    const side = document.querySelector('.side-t');
    if (side) cibles.push(side);
    else if (ici) { const ph = document.querySelector('main .phead, main .page-h, .phead'); if (ph) cibles.push(ph); }
    cibles.forEach(c => {
      const avant = c.classList.contains('phead') || c.classList.contains('page-h');
      let box = avant ? (c.previousElementSibling && c.previousElementSibling.classList.contains('enc-box') ? c.previousElementSibling : null) : c.querySelector(':scope > .enc-box');
      if (!h) { if (box) box.remove(); return; }
      if (!box) { box = document.createElement('div'); box.className = 'enc-box'; if (avant) c.before(box); else c.appendChild(box); }
      if (box.dataset.h !== h) { box.dataset.h = h; box.innerHTML = h; }
    });
  }
  const css = document.createElement('style');
  css.textContent = '[data-encours]:empty{display:none}.side-t .enc summary{background:rgba(255,255,255,.08);color:#fff;border-color:rgba(255,255,255,.4)}.enc .enc-t b,.enc .enc-t small{color:inherit;font:inherit;text-transform:none;font-style:normal}.enc .enc-t b{font-weight:800;font-size:14px}.enc .enc-t small{font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.75}.enc-l a b{color:var(--ui-text,#111);font:inherit;font-weight:700;font-style:normal;text-transform:none}.enc-l a small{color:var(--ui-text-mut,#666);display:block}.enc-box{margin:8px 0}.enc{position:relative}.enc summary{list-style:none;display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 10px;border:2px solid var(--ui-accent-line,#E0284A);border-radius:var(--ui-r-sm,8px);background:var(--ui-surface,#fff);color:var(--ui-text,#111);min-height:44px}.enc summary::-webkit-details-marker{display:none}.enc-t{display:flex;flex-direction:column;min-width:0;flex:1}.enc-t small{font-size:11px;opacity:.7;text-transform:uppercase;letter-spacing:.05em}.enc-t b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.enc summary .ic{width:18px;height:18px;flex:none}.enc[open] summary .ic{transform:rotate(180deg)}.enc-l{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:70;display:grid;gap:2px;padding:4px;max-height:320px;overflow-y:auto;background:var(--ui-surface,#fff);color:var(--ui-text,#111);border:2px solid var(--ui-accent-line,#E0284A);border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.25);min-width:240px}.enc-l a{display:flex;flex-direction:column;padding:9px 10px;border-radius:7px;color:inherit;text-decoration:none;min-height:44px;justify-content:center}.enc-l a small{font-size:12px;opacity:.7}.enc-l a:hover,.enc-l a[aria-current]{background:var(--ui-surface-2,#f2f2f2)}.enc-l a[aria-current] b{color:var(--ui-accent-text,#E0284A)}';
  document.head.appendChild(css);
  // un clic ailleurs referme le panneau
  document.addEventListener('click', e => document.querySelectorAll('details.enc[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }));
  fetch('/api/tournaments').then(r => (r.ok ? r.json() : null)).then(d => { if (!d) return; liste = d.tournaments || []; poser(); new MutationObserver(poser).observe(document.body, { childList: true, subtree: true }); }).catch(() => {});
})();
