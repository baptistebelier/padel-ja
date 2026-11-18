/* /Pista — lectures de données communes à toutes les pages de l'espace juge-arbitre.
   - Une seule demande à la fois par adresse, partagée entre le menu, la page et le panneau « Tournoi en cours »,
     avec une très courte réutilisation (3 s) pour les changements de page rapides.
   - Copie locale de la dernière réponse, rangée PAR COMPTE : affichée aussitôt, puis remplacée par le réseau.
     Elle n'est jamais montrée à un autre compte (changement de compte, connexion, déconnexion : tout est vidé).
   - Une demande qui échoue a un délai maximal, une relance automatique, puis un message avec « Réessayer » ;
     une copie ancienne reste affichée avec un signal discret, jamais présentée comme à jour.
   - Toute écriture (POST, PUT, DELETE…) vide la mémoire et les copies : la liste est juste aussitôt.
   - Une session expirée mène toujours à /connexion.
   Aucune dépendance. Chargé après theme.js. Testable sous Node : createDonnees(env). */
(function (root) {
  'use strict';
  const PREFIX = 'pja:copie:', UID_KEY = 'pja:uid';
  const PARTAGEES = new Set(['/api/me', '/api/tournaments', '/api/club-players', '/api/stats']);
  const COPIABLES = new Set(['/api/tournaments', '/api/club-players', '/api/stats']);   // /api/me : seulement l'identité
  const TTL = 3000, DELAI = 10000, RELANCE = 700, VIEILLE = 24 * 3600e3, MAX = 1.5e6;

  function createDonnees(env) {
    const DELAI_MAX = env.delai || DELAI;
    const raw = env.fetch, storage = env.storage, loc = env.location, now = env.now || Date.now;
    const wait = env.wait || ((ms) => new Promise(ok => setTimeout(ok, ms)));
    const vols = new Map();           // chemin → { at, p }   (demande partagée)
    let gen = 0;                      // monte à chaque écriture : une lecture partie avant une écriture ne range rien
    let jeton = 1;                    // identifie la page affichée : une réponse d'une page quittée est ignorée
    const st = { get: k => { try { return storage ? storage.getItem(k) : null; } catch (e) { return null; } },
      set: (k, v) => { try { storage && storage.setItem(k, v); } catch (e) { /* plein ou refusé : pas de copie */ } },
      del: k => { try { storage && storage.removeItem(k); } catch (e) {} },
      keys: () => { const o = []; try { for (let i = 0; i < storage.length; i++) o.push(storage.key(i)); } catch (e) {} return o; } };

    const uid = () => st.get(UID_KEY) || '';
    const cle = chemin => PREFIX + uid() + ':' + chemin;
    /* purger : plus aucune copie, d'aucun compte (les demandes en route ne sont pas touchées : seule une écriture les écarte) */
    function purger() { st.keys().filter(k => k && k.indexOf(PREFIX) === 0).forEach(st.del); }
    /* invalider : après une écriture, les copies de ce compte et la mémoire des demandes sont vidées */
    function invalider() { gen++; st.keys().filter(k => k && k.indexOf(PREFIX + uid() + ':') === 0).forEach(st.del); vols.clear(); }
    function setUid(id) {
      id = id ? String(id) : '';
      const avant = uid();
      if (id === avant) return false;
      purger();            // un autre compte (ou plus personne) : aucune copie de l'ancien ne survit
      if (id) st.set(UID_KEY, id); else st.del(UID_KEY);
      return true;
    }
    function copie(chemin) {
      if (!uid() || !COPIABLES.has(chemin)) return null;
      const t = st.get(cle(chemin)); if (!t) return null;
      try { const c = JSON.parse(t); return c && now() - c.at < VIEILLE ? c : null; } catch (e) { return null; }
    }
    function ranger(chemin, data) {
      if (!uid() || !COPIABLES.has(chemin)) return;
      const t = JSON.stringify({ at: now(), data });
      if (t.length < MAX) st.set(cle(chemin), t);
    }

    /* demande réseau unique et partagée ; délai maximal ; renvoie { ok, status, body, type } */
    function vol(chemin, force) {
      const v = vols.get(chemin);
      if (!force && v && (!v.fini || now() - v.at < TTL)) return v.p;
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const minuteur = setTimeout(() => { if (ctl) ctl.abort(); }, DELAI_MAX);
      const e = { at: now(), fini: false };
      e.p = raw(chemin, { credentials: 'same-origin', cache: 'no-store', signal: ctl ? ctl.signal : undefined })
        .then(r => r.text().then(body => ({ ok: r.ok, status: r.status, body, type: r.headers && r.headers.get ? r.headers.get('content-type') : '' })))
        .finally(() => { clearTimeout(minuteur); e.fini = true; });
      e.p.then(d => { if (!d.ok) vols.delete(chemin); }, () => vols.delete(chemin));   // erreur : jamais réutilisée
      vols.set(chemin, e);
      return e.p;
    }
    function aConnexion() { try { loc.href = '/connexion'; } catch (e) {} }

    /* lit une adresse : une relance automatique, puis une erreur (avec .status) ; 401 → connexion */
    async function lire(chemin, opt) {
      opt = opt || {};
      let derniere;
      for (let essai = 0; essai < 2; essai++) {
        try {
          const d = await vol(chemin, essai > 0 || opt.force);
          if (d.status === 401) { aConnexion(); const e = new Error('Session expirée'); e.status = 401; e.expiree = true; throw e; }
          if (!d.ok) { const e = new Error('Le serveur répond ' + d.status); e.status = d.status; if (d.status < 500) throw e; throw Object.assign(e, { relancer: true }); }
          let data; try { data = JSON.parse(d.body); } catch (x) { const e = new Error('Réponse illisible'); e.relancer = true; throw e; }
          if (chemin === '/api/me') { if (data && data.user === null) { setUid(''); aConnexion(); const e = new Error('Session expirée'); e.status = 401; e.expiree = true; throw e; } if (data && data.user && data.user.id != null) setUid(data.user.id); }
          return data;
        } catch (e) {
          if (e.expiree) throw e;
          derniere = e;
          if (essai === 0 && (e.relancer || !e.status)) await wait(RELANCE); else break;
        }
      }
      throw derniere || new Error('Échec');
    }

    /* page affichée : copie locale d'abord (si elle existe), puis réseau.
       o.rendre(data, { copie }) ; o.erreur(err, { copie }) : copie vraie = une copie ancienne reste à l'écran.
       Renvoie { relire() }. Les réponses d'une page quittée (jeton changé) sont ignorées. */
    function suivre(chemin, o) {
      const mien = jeton; let vu = false, frais = false;
      const vivant = () => mien === jeton;
      // le compte est confirmé par /api/me (demande partagée, rapide) : la copie rangée n'est montrée, et rien n'est rangé,
      // qu'une fois le compte connu. Un changement de compte a alors déjà vidé les copies de l'ancien.
      const moi = chemin === '/api/me' ? Promise.resolve(true) : lire('/api/me').then(() => true, () => false);
      const montrerCopie = moi.then(ok => {
        if (!ok || frais || !vivant()) return;
        const c = copie(chemin);
        if (c) { vu = true; try { o.rendre(c.data, { copie: true, at: c.at }); } catch (e) { console.error(e); } }
      });
      const aller = force => { const g = gen; return lire(chemin, { force }).then(async data => {
        if (!vivant()) return;
        frais = vu = true;
        try { o.rendre(data, { copie: false }); } catch (e) { console.error(e); }
        if (await moi && g === gen) ranger(chemin, data);
      }, async err => {
        await montrerCopie;
        if (vivant() && !err.expiree) { try { o.erreur && o.erreur(err, { copie: vu }); } catch (e) { console.error(e); } }
      }); };
      const p = aller(false);
      return { fini: Promise.all([p, montrerCopie]), relire: () => aller(true) };
    }
    const nouvellePage = () => ++jeton;

    /* écritures : la mémoire et les copies sont vidées avant et après */
    function enveloppe(f) {
      return function (input, init) {
        const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        let url; try { url = new URL(typeof input === 'string' ? input : input.url, loc.href); } catch (e) { return f(input, init); }
        if (url.origin !== loc.origin) return f(input, init);
        if (method !== 'GET') {
          invalider();
          const p = f(input, init);
          p.then(() => { invalider(); if (/^\/(api\/auth\/|deconnexion)/.test(url.pathname)) purger(); }, () => {});
          return p;
        }
        if (!PARTAGEES.has(url.pathname) || url.search) return f(input, init);
        // lecture partagée : même demande que celle du menu et de la page
        return vol(url.pathname).then(d => new Response(d.body, { status: d.status, headers: { 'Content-Type': d.type || 'application/json' } }));
      };
    }
    return { gen: () => gen, lire, suivre, copie, ranger, invalider, purger, setUid, uid, nouvellePage, enveloppe, _vols: vols, TTL, DELAI, RELANCE };
  }

  /* ---------- affichage commun : message d'échec avec Réessayer, signal discret d'une copie ancienne ---------- */
  function ui(D) {
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    return {
      /* remplace le contenu de `hote` par un message clair et un bouton Réessayer */
      erreur(hote, err, reessayer) {
        if (!hote) return;
        hote.innerHTML = `<div class="don-err" role="alert"><p>${esc(err && err.status >= 500 ? 'Le serveur ne répond pas pour l’instant.' : 'Les données n’ont pas pu être chargées.')}</p><button type="button" class="btn" data-don-retry>Réessayer</button></div>`;
        const b = hote.querySelector('[data-don-retry]');
        if (b) b.onclick = () => { b.disabled = true; b.textContent = 'Chargement…'; reessayer(); };
      },
      /* signal discret : les données affichées viennent de la dernière copie, pas du réseau */
      ancien(on, reessayer) {
        let b = document.getElementById('donAncien');
        if (!on) { if (b) b.remove(); return; }
        if (b) return;
        b = document.createElement('button'); b.type = 'button'; b.id = 'donAncien'; b.className = 'don-ancien'; b.setAttribute('role', 'status');
        b.textContent = 'Données peut-être anciennes · Réessayer';
        b.onclick = () => { b.remove(); reessayer(); };
        document.body.appendChild(b);
      }
    };
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { createDonnees, ui }; return; }
  if (typeof window === 'undefined' || window.Donnees) return;
  let storage = null; try { storage = window.localStorage; } catch (e) { /* stockage refusé */ }
  const D = createDonnees({ fetch: window.fetch.bind(window), storage, location: window.location });
  window.fetch = D.enveloppe(window.fetch.bind(window));
  const U = ui(D);
  /* page(chemin, rendre, hote) : copie locale puis réseau ; échec sans copie → message + Réessayer dans `hote` ;
     échec avec une copie à l'écran → signal discret « Données peut-être anciennes » */
  function page(chemin, rendre, hote) {
    const h = () => (typeof hote === 'string' ? document.querySelector(hote) : hote);
    const s = D.suivre(chemin, {
      rendre: (d, i) => { U.ancien(false); rendre(d, i); },
      erreur: (e, i) => { if (i.copie) U.ancien(true, () => s.relire()); else U.erreur(h(), e, () => s.relire()); }
    });
    return s;
  }
  window.Donnees = Object.assign(D, { ui: U, page });
  window.UIData = { clear: D.invalider };
  // connexion, inscription, déconnexion : plus aucune copie d'un compte précédent
  if (/^\/(connexion|inscription|deconnexion|mot-de-passe-oublie)\/?$/.test(window.location.pathname)) D.purger(), D.setUid('');
  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href="/deconnexion"]'); if (a) { D.purger(); D.setUid(''); } }, true);
  const css = document.createElement('style');
  css.textContent = '.don-err{display:grid;gap:10px;justify-items:start;padding:14px;border:2px solid var(--ui-accent-line,#E0284A);color:var(--ui-text,inherit)}.don-err p{margin:0;font-weight:700}'
    + '.don-ancien{position:fixed;z-index:80;right:12px;bottom:calc(70px + env(safe-area-inset-bottom,0px));min-height:44px;padding:8px 12px;border:2px solid var(--ui-accent-line,#E0284A);background:var(--ui-surface,#fff);color:var(--ui-text,#111);font:inherit;font-size:13px;font-weight:700;cursor:pointer}';
  document.head ? document.head.appendChild(css) : document.addEventListener('DOMContentLoaded', () => document.head.appendChild(css));
})(typeof window !== 'undefined' ? window : globalThis);
