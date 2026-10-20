/* PADEL JA — utilitaires communs aux écrans (connexion temps réel, noms, thème, cartes du tirage) */
(function () {
  'use strict';
  const qs = new URLSearchParams(location.search);
  const listeners = [];
  const App = { state: null, rev: 0, canUndo: false, R: {}, pairs: {}, connected: false };

  // tournoi courant : /t/<id>/...
  const tm = location.pathname.match(/^\/t\/([\w-]+)/);
  App.tid = tm ? tm[1] : '';
  App.page = '/t/' + App.tid;            // pages (tv, overlay…)
  App.base = '/api/t/' + App.tid;        // API du tournoi
  const key = qs.get('k') || '';         // clé de diffusion (écran sur un autre appareil)
  const pinKey = 'padelja-pin-' + App.tid;
  let pin = qs.get('pin') || (function () { try { return localStorage.getItem(pinKey) || ''; } catch (e) { return ''; } })();
  const authQs = () => { const p = []; if (key) p.push('k=' + encodeURIComponent(key)); if (pin) p.push('pin=' + encodeURIComponent(pin)); return p.length ? '?' + p.join('&') : ''; };
  const authHeaders = () => ({ 'Content-Type': 'application/json', 'X-Pin': pin, 'X-Key': key });

  App.LINGER = 4000;
  App.key = key;
  App.setPin = v => { pin = v; try { localStorage.setItem(pinKey, v); } catch (e) {} };
  App.pin = () => pin;

  /* ---------- mode hors ligne ----------
     Si le réseau coupe (wifi du club…), chaque action est mise en file d'attente sur l'appareil,
     appliquée tout de suite à l'écran, puis envoyée dans l'ordre dès que la connexion revient.
     Le dernier état connu est gardé pour pouvoir rouvrir la page sans réseau. */
  const qKey = 'padelja-queue-' + App.tid, sKey = 'padelja-state-' + App.tid;
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let queue = lsGet(qKey, []), serverState = null, statusFn = null;
  App.pending = () => queue.length;
  const notify = () => { statusFn && statusFn(App.connected); document.dispatchEvent(new CustomEvent('padelja-queue', { detail: queue.length })); };
  function show(state) {
    // état du serveur + actions encore en attente
    const s = JSON.parse(JSON.stringify(state));
    queue.forEach(a => { try { Engine.reduce(s, a); } catch (e) {} });
    App.state = s;
    App.pairs = {}; s.pairs.forEach(p => { App.pairs[p.id] = p; });
    App.R = Engine.resolve(s);
    applyTheme(s.tournament);
    listeners.forEach(fn => fn(s));
  }
  let flushing = false;
  async function flush() {
    if (flushing || !queue.length) return;
    flushing = true;
    try {
      while (queue.length) {
        let r;
        try { r = await fetch(App.base + '/action', { method: 'POST', headers: authHeaders(), body: JSON.stringify(queue[0]) }); }
        catch (e) { break; }                                   // toujours hors ligne : on réessaiera
        if (r.status >= 500) break;
        if (!r.ok) { const d = await r.json().catch(() => ({})); App.toast && App.toast('Action hors ligne refusée : ' + (d.error || r.status), 'err'); }
        queue.shift(); lsSet(qKey, queue); notify();
      }
      if (!queue.length) App.toast && App.toast('Connexion rétablie : toutes les actions ont été envoyées', 'ok');
    } finally { flushing = false; }
  }
  addEventListener('online', flush);
  setInterval(flush, 8000);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('/sw.js').catch(() => {});

  App.connect = function (onState, onStatus) {
    if (onState) listeners.push(onState);
    if (onStatus) statusFn = onStatus;
    const cached = lsGet(sKey, null);   // ouverture sans réseau : dernier état connu
    if (cached && cached.state) { serverState = Engine.migrate(cached.state); App.rev = cached.rev || 0; show(serverState); }
    const open = () => {
      const es = new EventSource(App.base + '/events' + authQs());
      es.onopen = flush;
      es.onmessage = ev => {
        const d = JSON.parse(ev.data);
        d.state = Engine.migrate(d.state);
        serverState = d.state; App.rev = d.rev; App.canUndo = d.canUndo;
        lsSet(sKey, { rev: d.rev, state: d.state });
        App.connected = true; onStatus && onStatus(true);
        show(d.state);
        if (queue.length) flush();
      };
      es.onerror = () => { App.connected = false; onStatus && onStatus(false); };
    };
    open();
  };

  App.send = async function (type, payload) {
    const action = { type, payload };
    let r;
    try { r = await fetch(App.base + '/action', { method: 'POST', headers: authHeaders(), body: JSON.stringify(action) }); }
    catch (e) { r = null; }
    if (!r || (r.status >= 502 && r.status <= 504)) {          // réseau coupé : file d'attente
      if (type === 'noop') throw new Error('Hors ligne');
      queue.push(action); lsSet(qKey, queue);
      if (serverState) show(serverState);
      notify();
      App.toast && App.toast('Hors ligne : action gardée, envoi au retour du réseau', 'err');
      return { queued: true };
    }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { App.toast && App.toast(d.error || 'Erreur', 'err'); throw new Error(d.error); }
    return d;
  };
  App.check = () => fetch(App.base + '/action', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ type: 'noop' }) }).then(r => r.status);
  App.undo = () => fetch(App.base + '/undo', { method: 'POST', headers: authHeaders() }).catch(() => { App.toast && App.toast('Hors ligne : « Annuler » sera possible au retour du réseau', 'err'); });
  App.api = (url, opts) => fetch(url, Object.assign({ headers: authHeaders() }, opts || {})).then(r => r.json());

  /* ---------- noms ---------- */
  const cap = s => (s || '').trim();
  App.player = (pl, style) => {
    if (!pl) return '';
    const last = cap(pl.last).toUpperCase(), first = cap(pl.first);
    if (style === 'last') return last || first;
    if (style === 'initial') return (first ? first[0].toUpperCase() + '. ' : '') + last;
    return (first ? first + ' ' : '') + last;
  };
  App.pairName = (id, style) => {
    if (id === 'BYE') return 'Exempt';
    if (id && id.indexOf(':') >= 0) return Engine.tokenLabel(id);
    const p = App.pairs[id];
    if (!p) return '';
    return App.player(p.p1, style || 'last') + ' / ' + App.player(p.p2, style || 'last');
  };
  App.srcLabel = src => {
    if (!src) return 'À déterminer';
    if (src.poule) return (src.rank === 1 ? '1er' : src.rank + 'e') + ' poule ' + src.poule;
    if (src.from) {
      const s = App.state.matches.find(x => x.id === src.from);
      if (s) return (src.take === 'W' ? 'Vainqueur M' : 'Perdant M') + s.num;
    }
    if (src.pair) return App.pairName(src.pair);
    return 'À déterminer';
  };
  App.sideName = (m, side, style) => {
    const r = App.R[m.id]; const id = r && r[side];
    if (id) return App.pairName(id, style);
    return App.srcLabel(side === 'A' ? m.srcA : m.srcB);
  };
  App.seedOf = id => {
    const D = App.state && App.state.draw;
    if (!D || !id || !Engine.isPair(id)) return null;
    const tf = D.sessions.find(s => s.key === 'tf');
    const n = D.seedNo[id];
    if (!tf || !n) return null;
    // n° de TS dans le tableau final uniquement pour les entrées directes
    const direct = D.formula === 'qualif_tf' ? n <= tf.seeds : D.formula === 'tf' && n <= tf.seeds;
    return direct ? n : null;
  };
  App.courtName = id => { const c = App.state.courts.find(c => c.id === id); return c ? c.name : ''; };
  App.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  App.hhmm = t => { if (!t || !isFinite(t)) return '--:--'; const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  App.dur = ms => { if (ms == null) return ''; const m = Math.floor(ms / 60000); return m >= 60 ? Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0') : m + "'"; };

  /* ---------- badge de repos d'une paire ---------- */
  App.restBadge = st => {
    if (!st) return '';
    const e = App.esc;
    if (st.state === 'playing') return `<span class="rest rest-playing" title="En train de jouer">En jeu</span>`;
    if (st.state === 'rest') return `<span class="rest rest-rest" title="Repos obligatoire : peut rejouer à ${App.hhmm(st.restUntil)}">Repos · ${e(App.dur(st.restLeft))}</span>`;
    if (st.state === 'ready') return `<span class="rest rest-ready" title="Peut rejouer — en attente depuis ${e(App.dur(st.waiting))}">Prête · ${e(App.dur(st.waiting))}</span>`;
    if (st.state === 'fresh') return `<span class="rest rest-fresh" title="Pas encore jouée">Pas jouée</span>`;
    return '';
  };

  /* ---------- bandeau défilant continu ----------
     Le contenu est répété autant de fois que nécessaire pour remplir le bandeau,
     puis doublé : le défilement boucle sans trou et rien n'« apparaît » à l'écran. */
  App.marquee = (el, html, speed) => {
    speed = speed || 80;                                 // pixels par seconde
    const box = el.parentElement;
    const vw = box.clientWidth || 1920;
    if (el.dataset.mq === html && +el.dataset.vw === vw) return;
    el.dataset.mq = html; el.dataset.vw = vw;
    el.innerHTML = `<div class="mq-u">${html}</div>`;
    const build = () => {
      const uw = el.firstElementChild.scrollWidth || 1;
      const half = Array(Math.max(1, Math.ceil(vw / uw) + 1)).fill(html).join('');
      el.innerHTML = `<div class="mq-u">${half}</div><div class="mq-u" aria-hidden="true">${half}</div>`;
      const w = el.firstElementChild.scrollWidth;
      el.style.animation = 'none'; void el.offsetWidth;
      el.style.animation = `mqx ${Math.max(8, w / speed)}s linear infinite`;
    };
    // attendre les logos pour mesurer la vraie largeur
    const imgs = [...el.querySelectorAll('img')].filter(i => !i.complete);
    if (!imgs.length) build();
    else Promise.all(imgs.map(i => new Promise(r => { i.onload = i.onerror = r; }))).then(() => { if (el.dataset.mq === html) build(); });
  };

  /* ---------- texte animé : ne s'anime que si la valeur change ---------- */
  App.setText = (el, v, cls) => {
    if (!el) return;
    v = String(v == null ? '' : v);
    if (el.textContent === v) return;
    const first = !el.dataset.init;
    el.textContent = v; el.dataset.init = '1';
    if (!first) { el.classList.remove(cls || 'bump'); void el.offsetWidth; el.classList.add(cls || 'bump'); }
  };

  /* ---------- cartes du tirage au sort ---------- */
  App.potState = () => {
    const D = App.state && App.state.draw; if (!D) return null;
    // la dernière carte d'un chapeau reste visible quelques secondes
    if (D.last && Date.now() - D.last.at < App.LINGER) {
      for (const s of D.sessions) for (let j = 0; j < s.pots.length; j++) {
        const p = s.pots[j];
        if (p.cards.some(c => c.at === D.last.at && c.n === D.last.n) && p.next >= p.cards.length) return { session: s, pot: p, index: j, linger: D.last.at + App.LINGER - Date.now() };
      }
    }
    const cur = Engine.currentPot(D);
    if (cur) return cur;
    // tirage terminé : on montre le dernier chapeau tiré
    for (let i = D.sessions.length - 1; i >= 0; i--) {
      const s = D.sessions[i];
      for (let j = s.pots.length - 1; j >= 0; j--) return { session: s, pot: s.pots[j], index: j, finished: true };
    }
    return null;
  };

  App.renderPot = (el, opts) => {
    opts = opts || {};
    const D = App.state.draw, cur = App.potState();
    if (!cur) { el.innerHTML = ''; el.dataset.key = ''; return null; }
    const { session, pot, index } = cur;
    clearTimeout(el._linger);
    if (cur.linger && opts.onRefresh) el._linger = setTimeout(opts.onRefresh, cur.linger + 50);
    const key = D.id + session.key + index;
    const n = pot.cards.length;
    const cols = n <= 4 ? n : n <= 8 ? 4 : n <= 12 ? 6 : 8;
    const rows = Math.ceil(n / cols);
    const gap = opts.gap || 14;
    let dw = Math.min(opts.maxW || 160, ((opts.width || 700) - gap * (cols - 1)) / cols);
    if (opts.height) dw = Math.min(dw, ((opts.height - gap * (rows - 1)) / rows) / 1.33);
    el.style.setProperty('--dcols', cols); el.style.setProperty('--dw', dw + 'px'); el.style.setProperty('--dh', dw * 1.33 + 'px'); el.style.setProperty('--dgap', gap + 'px');
    if (el.dataset.key !== key) {
      el.dataset.key = key;
      el.innerHTML = `<div class="dcards">${pot.cards.map(c => `<div class="dcard" data-n="${c.n}"><div class="face front"><span class="num">${c.n}</span></div><div class="face back"></div></div>`).join('')}</div>`;
      el.querySelectorAll('.dcard').forEach(card => card.addEventListener('click', () => {
        if (!card.classList.contains('flipped') && opts.onFlip) opts.onFlip(+card.dataset.n);
      }));
    }
    pot.cards.forEach(c => {
      const card = el.querySelector(`.dcard[data-n="${c.n}"]`); if (!card) return;
      const flipped = c.pos != null;
      if (flipped && !card.classList.contains('flipped')) {
        const ts = App.seedOf(c.token);
        card.querySelector('.back').innerHTML = `<small>Carte n°${c.n}</small><b>${Engine.isPair(c.token) ? App.esc(App.player(App.pairs[c.token].p1, 'last')) + '<br>' + App.esc(App.player(App.pairs[c.token].p2, 'last')) : App.esc(App.pairName(c.token))}</b><span class="dest">${App.esc(Engine.posLabel(session, c.pos))}</span>${ts ? `<span class="ts">TS ${ts}</span>` : ''}`;
        card.classList.add('flipped');
      } else if (!flipped && card.classList.contains('flipped')) card.classList.remove('flipped');
    });
    return cur;
  };

  /* saisie d'un numéro de carte au clavier (pavé numérique) */
  App.cardKeys = (getMax, onFlip, onBuffer) => {
    let buf = '', timer = null;
    const commit = () => { clearTimeout(timer); if (buf) { const n = +buf; buf = ''; onBuffer && onBuffer(''); onFlip(n); } };
    return e => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        buf += e.key; onBuffer && onBuffer(buf);
        clearTimeout(timer);
        const max = getMax();
        if (+buf * 10 > max) commit(); else timer = setTimeout(commit, 900);
        return true;
      }
      if (e.key === 'Enter' && buf) { e.preventDefault(); commit(); return true; }
      return false;
    };
  };

  function applyTheme(t) {
    const c = (t && t.colors) || {};
    const r = document.documentElement.style;
    if (c.bg) r.setProperty('--bg', c.bg);
    if (c.primary) r.setProperty('--primary', c.primary);
    if (c.accent) r.setProperty('--accent', c.accent);
    if (c.accent2) r.setProperty('--accent2', c.accent2);
    // habillage (écran TV, overlay, aperçu) : police des titres, style, ombres, contours, fond
    const b = document.body;
    if (!b || !b.hasAttribute('data-look')) return;
    const L = Object.assign({}, Engine.DEFAULT_LOOK, (t && t.look) || {});
    r.setProperty('--display', `"${Engine.LOOK_FONTS[L.font] || 'Anton'}", "Anton", "Impact", sans-serif`);
    const cls = ['look-style-' + L.style, 'look-bg-' + L.bg, 'look-corners-' + L.corners, 'look-font-' + L.font,
      L.shadows ? '' : 'look-noshadow', L.borders ? '' : 'look-noborder', L.deco ? '' : 'look-nodeco'].filter(Boolean);
    b.className.split(/\s+/).filter(c => c.startsWith('look-')).forEach(c => b.classList.remove(c));
    cls.forEach(c => b.classList.add(c));
  }

  window.App = App;
})();
