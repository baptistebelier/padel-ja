/* Thème jour / nuit de l'interface : mémorisé sur l'appareil, sinon celui du système */
(function () {
  const KEY = 'padelja-theme';
  const root = document.documentElement;
  const saved = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const system = () => (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  function apply(t) {
    root.dataset.theme = t;
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = t === 'light' ? '#F6F1F1' : '#120A0C';
    document.querySelectorAll('[data-theme-toggle]').forEach(b => {
      b.setAttribute('aria-label', t === 'light' ? 'Passer en mode nuit' : 'Passer en mode jour');
      const s = b.querySelector('span'); if (s) s.textContent = t === 'light' ? 'Mode nuit' : 'Mode jour';
    });
  }
  apply(saved() || system());
  // style de l'interface : épuré, street dosé (par défaut) ou full street
  try { const st = localStorage.getItem('padelja-style'); if (st) root.dataset.style = st; } catch (e) {}
  // fond de l'interface : points (par défaut), motif /RAM padel, tennis, padel et tennis, ou uni
  try { const f = localStorage.getItem('padelja-fond'); if (f) root.dataset.fond = f; } catch (e) {}
  if (window.matchMedia) matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (!saved()) apply(system()); });
  window.UITheme = {
    toggle() { const t = root.dataset.theme === 'light' ? 'dark' : 'light'; try { localStorage.setItem(KEY, t); } catch (e) {} apply(t); }
  };
  document.addEventListener('click', e => { const b = e.target.closest('[data-theme-toggle]'); if (b) { e.preventDefault(); UITheme.toggle(); } });
  document.addEventListener('DOMContentLoaded', () => apply(root.dataset.theme));
})();

/* lectures partagées : une même donnée demandée par le menu et par la page (profil, liste des tournois…)
   ne part qu'une fois, et reste en mémoire 15 s pour s'afficher aussitôt quand on change de page.
   Toute écriture (POST, PUT, DELETE…) vide cette mémoire : on ne montre jamais une donnée périmée par sa propre action. */
(function () {
  const SHARED = new Set(['/api/me', '/api/tournaments', '/api/club-players', '/api/stats']);
  const TTL = 15000, memo = new Map(), raw = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    let url; try { url = new URL(typeof input === 'string' ? input : input.url, location.href); } catch (e) { return raw(input, init); }
    if (method !== 'GET') { memo.clear(); return raw(input, init); }
    if (url.origin !== location.origin || !SHARED.has(url.pathname) || url.search) return raw(input, init);
    const hit = memo.get(url.pathname);
    if (!hit || Date.now() - hit.at > TTL) {
      const p = raw(input, init).then(r => r.text().then(body => ({ ok: r.ok, status: r.status, body, type: r.headers.get('content-type') })));
      memo.set(url.pathname, { at: Date.now(), p });
      p.then(d => { if (!d.ok) memo.delete(url.pathname); }, () => memo.delete(url.pathname));   // erreur : pas gardée en mémoire
    }
    return memo.get(url.pathname).p.then(d => new Response(d.body, { status: d.status, headers: { 'Content-Type': d.type || 'application/json' } }));
  };
  window.UIData = { clear: () => memo.clear() };
})();

/* pas de zoom au pincement ni au double-tap dans l'interface (téléphone, iPad) ;
   seules les zones .pinch-zoom (tableau final) gèrent leur propre zoom */
(function () {
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', e => {
    if (e.touches.length > 1 && !(e.target.closest && e.target.closest('.pinch-zoom'))) e.preventDefault();
  }, { passive: false });
})();
