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
  if (window.matchMedia) matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (!saved()) apply(system()); });
  window.UITheme = {
    toggle() { const t = root.dataset.theme === 'light' ? 'dark' : 'light'; try { localStorage.setItem(KEY, t); } catch (e) {} apply(t); }
  };
  document.addEventListener('click', e => { const b = e.target.closest('[data-theme-toggle]'); if (b) { e.preventDefault(); UITheme.toggle(); } });
  document.addEventListener('DOMContentLoaded', () => apply(root.dataset.theme));
})();

/* pas de zoom au pincement ni au double-tap dans l'interface (téléphone, iPad) ;
   seules les zones .pinch-zoom (tableau final) gèrent leur propre zoom */
(function () {
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', e => {
    if (e.touches.length > 1 && !(e.target.closest && e.target.closest('.pinch-zoom'))) e.preventDefault();
  }, { passive: false });
})();
