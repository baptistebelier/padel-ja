/* ---------- /RAM Club en vrai : compte /RAM, club réel, synchronisation ----------
   Servie par le serveur /RAM JA (club.riseandmove.fr ou /club/), l'appli :
   1. lit la session /RAM (le même compte que /RAM JA) ;
   2. charge le club de l'adhérent (ou propose d'en créer un / d'en rejoindre un avec le code) ;
   3. remplace les données de démo par celles du club ;
   4. après chaque action, compare l'état de l'appli à la dernière version connue et envoie
      les différences (petites opérations) ; toutes les quelques secondes, récupère ce que
      les autres ont changé.
   Sans serveur (GitHub Pages) ou sans club, l'appli reste la démo. */
(function () {
  if (window.RAM) return; // déjà chargé (jamais deux synchronisations dans la même page)
  const JA = 'https://ja.riseandmove.fr';
  const onClubHost = /^club\./.test(location.hostname);
  const served = onClubHost || location.pathname.startsWith('/club'); // sinon : démo sans serveur
  const here = () => location.href.split('#')[0];
  // page de connexion propre à /RAM Club (même compte /RAM que /RAM JA), puis retour à l'endroit quitté
  const loginUrl = () =>
    (onClubHost ? '' : '/club') + '/connexion?retour=' + encodeURIComponent(location.pathname + location.search);
  const e = s =>
    String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const J = o => JSON.stringify(o);
  const copy = o => (o === undefined ? undefined : JSON.parse(J(o)));
  const isObj = o => o && typeof o === 'object' && !Array.isArray(o);
  const LS = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch (x) {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch (x) {}
    }
  };

  const R = (window.RAM = {
    user: undefined,
    clubs: [],
    club: null,
    key: null,
    role: null,
    rev: 0,
    base: new Map(),
    bad: new Map(),
    snap: new Map(),
    notified: new Set(),
    fol: {},
    roles: {},
    scores: {},
    live: false
  });
  let readyFn;
  window.ramReady = new Promise(r => {
    readyFn = r;
  });

  async function api(path, body) {
    const r = await fetch(
      path,
      body
        ? { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: J(body) }
        : { credentials: 'include' }
    );
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || 'Erreur ' + r.status), { status: r.status });
    return d;
  }

  /* ---------- dates : « Il y a 5 min », « Hier », « 10:44 » ---------- */
  const isoOf = d =>
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  function rel(at) {
    if (!at) return '';
    const d = new Date(at),
      now = new Date(),
      s = (now - d) / 1000,
      days = Math.round((new Date(isoOf(now)) - new Date(isoOf(d))) / 864e5);
    if (s < 60) return "À l'instant";
    if (s < 3600) return 'Il y a ' + Math.floor(s / 60) + ' min';
    if (days === 0) return 'Il y a ' + Math.floor(s / 3600) + ' h';
    if (days === 1) return 'Hier';
    if (days < 7) return DAYS[d.getDay()];
    return fmtD(isoOf(d));
  }
  function clock(at) {
    if (!at) return '';
    const d = new Date(at),
      days = Math.round((new Date(isoOf(new Date())) - new Date(isoOf(d))) / 864e5);
    return days === 0
      ? String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
      : days === 1
        ? 'Hier'
        : days < 7
          ? DA[d.getDay()]
          : fmtD(isoOf(d), 1);
  }
  const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---------- traduction appli ⇄ serveur, collection par collection ----------
     « partagé » = ce que le serveur garde ; les réponses personnelles (inscription, vote, like,
     réaction) y sont rangées par adhérent (myBy, likers, reBy), jamais en simple compteur. */
  const others = (map, me) => Object.entries(map || {}).filter(([k]) => k !== me);
  const POST_LOCAL = ['t', 'my', 'yes', 'maybe', 'wl', 'likes', 'com', 'ins'];
  function postOut(p, prev) {
    const s = copy(p);
    POST_LOCAL.forEach(k => delete s[k]);
    if (!p.at && !R.base.has('post/' + p.id)) p.at = Date.now();
    if (p.at) s.at = p.at;
    const my = Object.assign({}, (prev && prev.myBy) || {});
    if (p.my == null) delete my[R.key];
    else my[R.key] = p.my;
    if (Object.keys(my).length) s.myBy = my;
    else delete s.myBy;
    const lk = ((prev && prev.likers) || []).filter(k => k !== R.key);
    if (S.liked.has(p.id)) lk.push(R.key);
    if (lk.length) s.likers = lk;
    else delete s.likers;
    if (Array.isArray(s.opts)) s.opts = s.opts.map(o => [o[0], 0]);
    return s;
  }
  function postIn(s) {
    const p = copy(s),
      o = others(s.myBy, R.key),
      n = v => o.filter(([, x]) => x === v).length;
    delete p.myBy;
    delete p.likers;
    p.my = s.myBy && s.myBy[R.key] != null ? s.myBy[R.key] : null;
    p.yes = n('yes');
    p.maybe = n('maybe');
    p.wl = n('wait');
    p.ins = o
      .filter(([, x]) => x === 'yes')
      .map(([k]) => k)
      .filter(k => M[k]);
    if (Array.isArray(p.opts)) p.opts = p.opts.map((x, i) => [x[0], n(i)]);
    const lk = s.likers || [];
    p.likes = lk.filter(k => k !== R.key).length;
    if (lk.includes(R.key)) S.liked.add(p.id);
    else S.liked.delete(p.id);
    p.t = rel(s.at);
    p.com = [];
    return p;
  }
  function msgOut(m, ref, prev) {
    const s = { ref, by: m.by, at: m.at || (m.at = Date.now()) };
    ['x', 'img', 'rep'].forEach(k => {
      if (m[k] != null && m[k] !== '') s[k] = copy(m[k]);
    });
    const re = Object.assign({}, (prev && prev.reBy) || {});
    if (m.my) re[R.key] = m.my;
    else delete re[R.key];
    if (Object.keys(re).length) s.reBy = re;
    return s;
  }
  function msgIn(s, id) {
    const m = {
      _id: id,
      by: s.by,
      at: s.at,
      t: s.at
        ? String(new Date(s.at).getHours()).padStart(2, '0') +
          ':' +
          String(new Date(s.at).getMinutes()).padStart(2, '0')
        : ''
    }; // heure ; le jour est donné par les séparateurs
    ['x', 'img', 'rep'].forEach(k => {
      if (s[k] != null) m[k] = copy(s[k]);
    });
    const re = {};
    Object.values(s.reBy || {}).forEach(v => {
      re[v] = (re[v] || 0) + 1;
    });
    if (Object.keys(re).length) m.re = re;
    m.my = (s.reBy || {})[R.key] || null;
    return m;
  }
  const strip = (o, keys) => {
    const s = copy(o);
    keys.forEach(k => delete s[k]);
    return s;
  };

  /* éléments de l'appli à surveiller : [collection, id, objet local, version partagée] */
  function collect() {
    const out = [],
      add = (coll, id, s) => out.push([coll, id, JSON.parse(J(Object.assign({}, s, { id })))]);
    const prev = (c, id) => (R.base.get(c + '/' + id) || {}).data;
    const at = (o, coll) => {
      if (!o.at && !R.base.has(coll + '/' + o.id)) o.at = Date.now();
    };
    const c = club();
    add('conf', 'main', {
      name: c.name,
      short: c.short,
      label: c.label || c.name,
      dark: !!c.dark,
      accent: c.accent,
      accent2: c.accent2 || null,
      hot: c.hot,
      logo: c.logo || null,
      logoL: c.logoL || null,
      logoD: c.logoD || null,
      bg: c.bg,
      card: c.card,
      card2: c.card2,
      line: c.line,
      fg: c.fg,
      muted: c.muted,
      info: strip(CLUBINFO, ['joined', 'members', 'code']),
      form: FORM,
      season: S.season
    });
    posts.forEach(p => {
      if (!p.id) p.id = newId('p');
      add('post', p.id, postOut(p, prev('post', p.id)));
    });
    chans.forEach(ch => {
      at(ch, 'chan');
      add('chan', ch.id, strip(ch, ['msgs', 'un', 'mute']));
    });
    GROUPS.forEach(g => {
      at(g, 'group');
      add('group', g.id, g);
    });
    OLDG.forEach(g => {
      at(g, 'group');
      add('group', g.id, Object.assign(copy(g), { old: 1 }));
    });
    CHAMPS.forEach(x => {
      at(x, 'champ');
      add('champ', x.id, x);
    });
    OLDC.forEach(x => {
      at(x, 'champ');
      add('champ', x.id, Object.assign(copy(x), { old: 1 }));
    });
    recs.forEach(r => {
      at(r, 'rec');
      add('rec', r.id, strip(r, ['chat']));
    });
    arts.forEach(a => {
      at(a, 'art');
      add('art', a.id, a);
    });
    PARTNERS.forEach(x => {
      at(x, 'partner');
      add('partner', x.id, x);
    });
    COMMS.forEach(x => {
      at(x, 'comm');
      add('comm', x.id, x);
    });
    REPORTS.forEach(r => {
      if (!r.id) r.id = newId('rp');
      add(
        'report',
        r.id,
        Object.assign(strip(r, ['com', 'msg']), { mid: (r.com || r.msg || {})._id || r.mid || null })
      );
    });
    if (typeof CLAIMS !== 'undefined') CLAIMS.forEach(x => add('claim', x.id, x));
    // bar : la carte, et mes réservations (le bureau voit et tient toutes celles du club)
    BAR.forEach(x => {
      at(x, 'bar');
      add('bar', x.id, x);
    });
    ORDERS.forEach(x => {
      at(x, 'order');
      add('order', x.id, x);
    });
    // bons d'échange des points bar
    REDEEMS.forEach(x => {
      at(x, 'redeem');
      add('redeem', x.id, x);
    });
    Object.keys(M).forEach(k => {
      if (k === 'club') return;
      const s = strip(M[k], ['fol']);
      s.valid = VALID[k] || '';
      // abonnements (« fo ») : publics, dans le profil de celui qui suit → nombre d'abonnés et notification en direct pour tous
      if (k === R.key) {
        s.fo = [...S.follow].filter(x => M[x] && x !== R.key);
        const ct = {};
        ['tel', 'mail'].forEach(x => {
          if (S.share[x] && MYCT[x][2]) ct[x] = MYCT[x][2];
        });
        if (S.share.soc && MYCT.soc[2]) ct.soc = [MYCT.soc[1], MYCT.soc[2]];
        s.ct = ct;
      }
      add('member', k, s);
    });
    if (typeof STATS !== 'undefined')
      Object.keys(STATS).forEach(k => {
        const s = STATS[k];
        if (M[k] && k !== 'club' && (k === R.key || R.base.has('stats/' + k) || s.k.size || Object.keys(s.c).length)) {
          add('stats', k, { c: s.c, k: [...s.k], got: s.got, lvl: s.lvl });
        }
      });
    const read = Object.assign({}, (prev('prefs', R.key) || {}).read || {});
    chans.forEach(ch => {
      if (!ch.un) {
        const last = Math.max(0, ...(ch.msgs || []).map(m => m.at || 0));
        if (last) read[ch.id] = Math.max(read[ch.id] || 0, last);
      }
    });
    add('prefs', R.key, {
      nh: notifStore(),
      seen: Object.assign({}, SEEN.at),
      follow: [...S.follow],
      blocked: [...S.blocked],
      nset: S.nset,
      share: S.share,
      ct: MYCT,
      mute: chans.filter(ch => ch.mute).map(ch => ch.id),
      read,
      setup: S.setup || {},
      invited: S.invited || 0,
      motif: S.motif || 'ram-mixte'
    });
    // messages : groupes, direct des rencontres, commentaires des publications
    const box = (ref, list) =>
      (list || []).forEach(m => {
        if (!m._id) m._id = newId('m');
        add('msg', m._id, msgOut(m, ref, prev('msg', m._id)));
      });
    chans.forEach(ch => box('c:' + ch.id, ch.msgs));
    recs.forEach(r => box('r:' + r.id, r.chat));
    posts.forEach(p => box('p:' + p.id, p.com));
    return out;
  }
  /* ---------- historique des notifications, partagé entre mes appareils ----------
     Rangé dans mes réglages (privés) : { id: { by, txt, at, go…, r: 1 si lue } }. L'identifiant est tiré du contenu :
     la même notification produite sur deux appareils (trophée, like…) n'en fait qu'une. */
  const NKEEP = ['by', 'txt', 'go', 'kick', 'head', 'det', 'tier', 'kind', 'live', 'frame', 'conv', 'to', 'team', 'sc'];
  function nid(n) {
    const s = [n.kick || '', n.by || '', n.txt || '', n.go ? (n.go.v || '') + '/' + (n.go.id || '') : ''].join('|');
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return 'n' + h.toString(36) + s.length.toString(36);
  }
  function stamp() {
    NOTIFS.forEach(n => {
      if (!n.at) n.at = Date.now();
      if (!n.id) n.id = nid(n);
    });
    // une même notification arrivée deux fois : on garde la plus récente
    const seen = new Set();
    for (let i = 0; i < NOTIFS.length; i++) {
      if (seen.has(NOTIFS[i].id)) NOTIFS.splice(i--, 1);
      else seen.add(NOTIFS[i].id);
    }
    trimNotifs();
  }
  function notifStore() {
    stamp();
    const out = {};
    NOTIFS.forEach(n => {
      const o = { at: n.at };
      NKEEP.forEach(k => {
        if (n[k] != null) o[k] = copy(n[k]);
      });
      if (!n.n) o.r = 1;
      out[n.id] = o;
    });
    return out;
  }
  // bandeaux déjà montrés sur cet appareil : une notification venue d'un autre appareil s'affiche une fois ici aussi
  const shown = new Set(
    (() => {
      try {
        return JSON.parse(LS.get('ram-nshown') || '[]');
      } catch (x) {
        return [];
      }
    })()
  );
  const _banner = banner;
  banner = n => {
    if (n && R.live) {
      if (!n.id) n.id = nid(n);
      if (shown.has(n.id)) return;
      shown.add(n.id);
      LS.set('ram-nshown', J([...shown].slice(-200)));
    }
    _banner(n);
  };
  function mergeNotifs(nh, initial) {
    stamp();
    const byId = new Map(NOTIFS.map(n => [n.id, n])),
      arrived = [];
    Object.keys(nh || {}).forEach(id => {
      const o = nh[id],
        cur = byId.get(id);
      if (!isObj(o)) return;
      if (cur) {
        if (o.r) cur.n = 0; // lue sur un autre appareil
        if ((o.at || 0) > (cur.at || 0)) cur.at = o.at;
        return;
      }
      const n = Object.assign(copy(o), { id, n: o.r ? 0 : 1, t: '' });
      delete n.r;
      NOTIFS.push(n);
      byId.set(id, n);
      if (!initial && n.n) arrived.push(n);
    });
    trimNotifs();
    if (initial) arrived.forEach(n => shown.add(n.id));
    else arrived.forEach(n => banner(n));
  }
  /* dernière visite de chaque onglet (pastilles du menu, « Nouveau » sur le mur), partagée entre mes appareils */
  let seenTab = null;
  function markSeen() {
    const t = S.tab;
    if (!['home', 'agenda', 'ecole', 'club'].includes(t)) {
      seenTab = t;
      return;
    }
    const now = Date.now();
    if (t !== seenTab) {
      seenTab = t;
      SEEN.prev[t] = SEEN.at[t] != null ? SEEN.at[t] : now; // ce qui est plus récent que la dernière visite est « nouveau »
      SEEN.at[t] = now;
      if (t === 'ecole') NOTIFS.forEach(n => n.go && (n.go.v === 'ecole' || n.go.ag === 'cours') && (n.n = 0));
    } else if (!S.stack.length && tabNews(t)) SEEN.at[t] = now; // arrivé pendant qu'on regarde l'onglet
  }

  /* conteneurs de messages encore affichés : un message absent d'un conteneur présent a été supprimé */
  function openRefs() {
    const s = new Set();
    chans.forEach(ch => ch.msgs && s.add('c:' + ch.id));
    recs.forEach(r => r.chat && s.add('r:' + r.id));
    posts.forEach(p => p.com && s.add('p:' + p.id));
    return s;
  }

  /* différences entre deux versions → opérations (set, unset, add, rm) */
  /* un champ vide créé à l'affichage (lineup: {}, cancel: []) vaut un champ absent : rien à envoyer */
  const empty = v => (Array.isArray(v) && !v.length) || (isObj(v) && !Object.keys(v).length);
  function diff(a, b, p = [], out = []) {
    Object.keys(b).forEach(k => {
      const x = a[k],
        y = b[k];
      // nouvelle liste ou nouvel objet : détaillés champ par champ (« ma réaction », « mon like »), pour rester une réponse personnelle
      if (!(k in a)) {
        if (empty(y)) return;
        if (isObj(y)) diff({}, y, p.concat(k), out);
        else if (Array.isArray(y) && y.every(v => typeof v === 'string') && new Set(y).size === y.length)
          y.forEach(v => out.push({ p: p.concat(k), t: 'add', v }));
        else out.push({ p: p.concat(k), t: 'set', v: y });
      } else if (J(x) === J(y)) return;
      else if (isObj(x) && isObj(y)) diff(x, y, p.concat(k), out);
      else if (
        Array.isArray(x) &&
        Array.isArray(y) &&
        x.concat(y).every(v => typeof v === 'string') &&
        new Set(x).size === x.length &&
        new Set(y).size === y.length
      ) {
        const rm = x.filter(v => !y.includes(v)),
          ad = y.filter(v => !x.includes(v));
        if (J(x.filter(v => !rm.includes(v)).concat(ad)) === J(y)) {
          rm.forEach(v => out.push({ p: p.concat(k), t: 'rm', v }));
          ad.forEach(v => out.push({ p: p.concat(k), t: 'add', v }));
        } else out.push({ p: p.concat(k), t: 'set', v: y });
      } else out.push({ p: p.concat(k), t: 'set', v: y });
    });
    Object.keys(a).forEach(k => {
      if (!(k in b) && !empty(a[k])) out.push({ p: p.concat(k), t: 'unset' });
    });
    return out;
  }

  /* ---------- appliquer ce qui arrive du serveur ---------- */
  const LISTS = {
    post: () => posts,
    chan: () => chans,
    art: () => arts,
    partner: () => PARTNERS,
    comm: () => COMMS,
    rec: () => recs,
    report: () => REPORTS,
    claim: () => (typeof CLAIMS !== 'undefined' ? CLAIMS : []),
    bar: () => BAR,
    order: () => ORDERS,
    redeem: () => REDEEMS
  };
  function place(list, obj, desc) {
    const i = list.findIndex(x => x.id === obj.id);
    if (i >= 0) {
      list[i] = obj;
      return;
    }
    const j = list.findIndex(x => (desc ? (x.at || 0) < (obj.at || 0) : (x.at || 0) > (obj.at || 0)));
    if (j < 0) list.push(obj);
    else list.splice(j, 0, obj);
  }
  const drop = (list, id) => {
    const i = list.findIndex(x => x.id === id);
    if (i >= 0) list.splice(i, 1);
  };
  function msgBox(ref) {
    const [k, id] = [ref.slice(0, 1), ref.slice(2)];
    if (k === 'c') {
      const c = chans.find(x => x.id === id);
      return c && (c.msgs = c.msgs || []);
    }
    if (k === 'r') {
      const r = recs.find(x => x.id === id);
      return r && r.st === 'live' ? (r.chat = r.chat || []) : null;
    }
    if (k === 'p') {
      const p = posts.find(x => x.id === id);
      return p && p.com;
    }
    return null;
  }
  let fresh = []; // nouveautés arrivées pendant cette synchronisation (pour notifier)
  function applyItem(it, initial) {
    const key = it.coll + '/' + it.id,
      s = it.data,
      id = it.id;
    if (it.coll === 'member' && s && !s.res) s.res = [];
    if (it.del) R.base.delete(key);
    else R.base.set(key, { data: s });
    switch (it.coll) {
      case 'conf': {
        CLUBS.length = 1;
        const c = CLUBS[0] || (CLUBS[0] = {});
        Object.keys(c).forEach(k => delete c[k]);
        [
          'name',
          'short',
          'label',
          'dark',
          'accent',
          'accent2',
          'hot',
          'logo',
          'logoL',
          'logoD',
          'bg',
          'card',
          'card2',
          'line',
          'fg',
          'muted'
        ].forEach(k => {
          if (s[k] != null) c[k] = s[k];
        });
        Object.keys(CLUBINFO).forEach(k => delete CLUBINFO[k]);
        Object.assign(CLUBINFO, copy(s.info || {}));
        CLUBINFO.mods = CLUBINFO.mods || { actus: true, comm: true };
        if (CLUBINFO.mods.bar == null) CLUBINFO.mods.bar = false; // bar : activé par le bureau dans « Infos du club »
        if (R.code) CLUBINFO.code = R.code;
        FORM.length = 0;
        (s.form || []).forEach(f => FORM.push(copy(f)));
        S.season = s.season || S.season;
        setTheme(0);
        return;
      }
      case 'post': {
        if (it.del) {
          drop(posts, id);
          return;
        }
        const p = postIn(s),
          old = posts.find(x => x.id === id);
        if (old) p.com = old.com;
        else if (!initial && s.by !== R.key) fresh.push(['post', p]);
        place(posts, p, true);
        R.base.forEach((v, k2) => {
          if (k2.startsWith('msg/') && v.data && v.data.ref === 'p:' + id && !p.com.some(m => m._id === k2.slice(4)))
            place2(p.com, msgIn(v.data, k2.slice(4)));
        });
        return;
      }
      case 'msg': {
        if (it.del) {
          [...chans.map(c => c.msgs), ...recs.map(r => r.chat), ...posts.map(p => p.com)].forEach(l => {
            if (!l) return;
            const i = l.findIndex(m => m._id === id);
            if (i >= 0) l.splice(i, 1);
          });
          return;
        }
        const l = msgBox(s.ref);
        if (!l) return;
        const m = msgIn(s, id),
          i = l.findIndex(x => x._id === id);
        if (i >= 0) {
          l[i] = m;
          return;
        }
        place2(l, m);
        if (!initial && s.by !== R.key) fresh.push(['msg', m, s.ref]);
        return;
      }
      case 'chan': {
        if (it.del) {
          drop(chans, id);
          return;
        }
        const old = chans.find(x => x.id === id),
          c = Object.assign(copy(s), { msgs: old ? old.msgs : [], un: old ? old.un : 0, mute: old ? old.mute : false });
        if (!old)
          R.base.forEach((v, k2) => {
            if (k2.startsWith('msg/') && v.data && v.data.ref === 'c:' + id) place2(c.msgs, msgIn(v.data, k2.slice(4)));
          });
        place(chans, c, false);
        return;
      }
      case 'group':
      case 'champ': {
        const [cur, old] = it.coll === 'group' ? [GROUPS, OLDG] : [CHAMPS, OLDC];
        drop(cur, id);
        drop(old, id);
        if (it.del) return;
        const o = copy(s);
        const arch = !!o.old;
        delete o.old;
        place(arch ? old : cur, o, false);
        return;
      }
      case 'rec': {
        if (it.del) {
          drop(recs, id);
          return;
        }
        const old = recs.find(x => x.id === id),
          r = copy(s);
        if (r.st === 'live') {
          r.chat = old && old.chat ? old.chat : [];
          if (!old || !old.chat)
            R.base.forEach((v, k2) => {
              if (k2.startsWith('msg/') && v.data && v.data.ref === 'r:' + id)
                place2(r.chat, msgIn(v.data, k2.slice(4)));
            });
        }
        place(recs, r, false);
        return;
      }
      case 'report': {
        if (it.del) {
          drop(REPORTS, id);
          return;
        }
        const r = copy(s);
        if (r.mid) {
          const all = [...chans.map(c => c.msgs), ...recs.map(x => x.chat), ...posts.map(p => p.com)]
            .filter(Boolean)
            .flat();
          const m = all.find(x => x._id === r.mid);
          if (m) r[r.kind === 'com' ? 'com' : 'msg'] = m;
        }
        place(REPORTS, r, false);
        return;
      }
      case 'member': {
        if (it.del) {
          delete M[id];
          delete VALID[id];
          delete CT[id];
          return;
        }
        const m = copy(s);
        VALID[id] = m.valid || '';
        delete m.valid;
        if (m.ct && id !== R.key) CT[id] = m.ct;
        else delete CT[id];
        delete m.ct;
        m.res = m.res || [];
        m.fol = Math.max(0, (R.fol[id] || 0) - (S.follow.has(id) ? 1 : 0));
        M[id] = m;
        return;
      }
      case 'prefs': {
        if (it.del || id !== R.key) return;
        S.follow = new Set(s.follow || []);
        S.blocked = new Set(s.blocked || []);
        if (s.nset) Object.assign(S.nset, s.nset);
        if (s.share) Object.assign(S.share, s.share);
        if (s.ct)
          ['tel', 'mail', 'soc'].forEach(k => {
            if (s.ct[k]) MYCT[k] = s.ct[k];
          });
        S.setup = s.setup || {};
        S.invited = s.invited || 0;
        Object.keys(s.seen || {}).forEach(k => {
          SEEN.at[k] = Math.max(SEEN.at[k] || 0, +s.seen[k] || 0);
        });
        mergeNotifs(s.nh, initial);
        if (s.motif && typeof setMotif === 'function') setMotif(s.motif);
        R.prefs = s;
        return;
      }
      case 'stats': {
        if (typeof STATS === 'undefined') return;
        if (it.del) {
          delete STATS[id];
          return;
        }
        STATS[id] = {
          c: copy(s.c || {}),
          k: new Set(s.k || []),
          got: copy(s.got || {}),
          lvl: s.lvl == null ? null : s.lvl
        };
        countsOf(id);
        return;
      }
      default: {
        const list = LISTS[it.coll] && LISTS[it.coll]();
        if (!list) return;
        if (it.del) drop(list, id);
        else place(list, copy(s), it.coll === 'art');
      }
    }
  }
  function place2(list, m) {
    const j = list.findIndex(x => (x.at || 0) > (m.at || 0));
    if (j < 0) list.push(m);
    else list.splice(j, 0, m);
  }

  /* ---------- tout ce qui dépend des autres éléments, recalculé après chaque arrivée ---------- */
  function derive() {
    // abonnés de chacun = adhérents qui le suivent (sans moi : l'écran du profil m'ajoute s'il le faut)
    Object.keys(M).forEach(k => {
      if (k === 'club') return;
      M[k].fol = Object.keys(M).filter(
        j => j !== 'club' && j !== R.key && j !== k && (M[j].fo || []).includes(k)
      ).length;
    });
    JOINREQ.length = 0;
    Object.keys(M).forEach(k => {
      if (k !== 'club' && M[k].req && VALID[k] !== S.season)
        JOINREQ.push({ id: k, n: M[k].n, mail: M[k].mail || '', via: M[k].via || 'le code du club' });
    });
    const mem = Object.keys(M).filter(k => k !== 'club');
    CLUBINFO.joined = mem.filter(
      k => VALID[k] === S.season || R.roles[k] === 'bureau' || R.roles[k] === 'coach'
    ).length;
    if (!(CLUBINFO.members >= CLUBINFO.joined)) CLUBINFO.members = CLUBINFO.joined;
    // rôle dans l'appli : bureau → gestion complète, enseignant, capitaine d'une équipe, adhérent
    S.role =
      R.role === 'bureau'
        ? 'admin'
        : R.role === 'coach'
          ? 'coach'
          : GROUPS.some(g => g.type === 'team' && g.cap === R.key)
            ? 'cap'
            : 'mem';
    if (R.role === 'bureau' || R.role === 'coach') VALID[R.key] = S.season;
    const read = (R.prefs && R.prefs.read) || {},
      mute = (R.prefs && R.prefs.mute) || [];
    chans.forEach(c => {
      c.mute = mute.includes(c.id);
      const v = view();
      if (v.v === 'chan' && v.id === c.id) {
        c.un = 0;
        return;
      }
      // non lus : messages des autres arrivés après ma dernière lecture (ou après l'ouverture de l'appli)
      const since = read[c.id] || R.loadAt || 0;
      c.un = (c.msgs || []).filter(m => m.at > since && m.by !== R.key).length;
    });
    posts.forEach(p => {
      if (p.at) p.t = rel(p.at);
    });
  }

  /* ---------- envoi et réception ---------- */
  let busy = false,
    again = false,
    timer = null,
    pushT = null;
  /* ---------- droits, comme le serveur les vérifie ----------
     Sur un élément dont je ne suis pas l'auteur (publication d'un autre, groupe, rencontre…), je n'envoie
     que ce qui me concerne : ma réponse, mon like, ma réaction, ma présence. Le reste des différences
     (copie un peu ancienne, détail recalculé à l'affichage) n'est jamais envoyé : il serait refusé et
     ferait échouer mon action avec lui. */
  const staffMe = () => R.role === 'bureau' || R.role === 'coach';
  function mayWrite(coll, id, d) {
    if (!d) return false;
    const k = R.key,
      staff = staffMe(),
      capOf = tid => {
        const g = grp(tid);
        return !!g && g.cap === k;
      };
    switch (coll) {
      case 'conf':
        return R.role === 'bureau';
      case 'post':
        return (
          staff ||
          d.by === k ||
          (d.by === 'club' &&
            (d.kind === 'result' || d.kind === 'match') &&
            (() => {
              const r = recs.find(x => x.id === d.rec);
              return !!r && capOf(r.tid);
            })()) ||
          (d.by === 'club' && d.kind === 'teamfinal' && capOf(d.tid))
        );
      case 'msg':
        return staff || d.by === k;
      case 'chan':
      case 'champ':
      case 'art':
      case 'partner':
      case 'report':
        return staff;
      case 'group':
        return staff || d.cap === k || d.coach === k;
      case 'rec':
        return staff || capOf(d.tid);
      case 'comm':
        return staff || d.resp === k;
      case 'member':
        return staff || id === k || d.parent === k;
      case 'prefs':
        return id === k;
      case 'stats':
        return staff || id === k;
      case 'claim':
        return staff || d.by === k;
      case 'bar':
        return R.role === 'bureau';
      case 'order':
      case 'redeem':
        return R.role === 'bureau' || myKeys().includes(d.by);
    }
    return false;
  }
  const myKeys = () => [R.key].concat((M[R.key] && M[R.key].kids) || []);
  const selfOp = op => {
    const K = myKeys();
    return (op.p || []).some(x => K.includes(x)) || ((op.t === 'add' || op.t === 'rm') && K.includes(op.v));
  };
  const SELF_OK = ['post', 'msg', 'rec', 'group', 'comm'];
  function patchLocal(data, patch) {
    const out = copy(data || {});
    patch.forEach(op => {
      let o = out;
      op.p.slice(0, -1).forEach(x => {
        if (!isObj(o[x])) o[x] = {};
        o = o[x];
      });
      const x = op.p[op.p.length - 1];
      if (op.t === 'set') o[x] = copy(op.v);
      else if (op.t === 'unset') delete o[x];
      else if (op.t === 'add') {
        if (!Array.isArray(o[x])) o[x] = [];
        if (!o[x].some(v => J(v) === J(op.v))) o[x].push(copy(op.v));
      } else if (op.t === 'rm' && Array.isArray(o[x])) o[x] = o[x].filter(v => J(v) !== J(op.v));
    });
    return out;
  }
  function ops() {
    const list = [],
      seen = new Set(),
      refs = openRefs();
    collect().forEach(([coll, id, s]) => {
      const k = coll + '/' + id;
      seen.add(k);
      R.snap.set(k, J(s));
      const b = R.base.get(k);
      if (R.bad.get(k) === J(s)) return; // déjà refusé tel quel : on n'insiste pas
      if (!b) {
        if (mayWrite(coll, id, s)) list.push({ coll, id, op: 'put', data: s });
        return;
      }
      if (J(b.data) === J(s)) return;
      let patch = diff(b.data || {}, s);
      if (!(mayWrite(coll, id, b.data) && mayWrite(coll, id, s)))
        patch = SELF_OK.includes(coll) ? patch.filter(selfOp) : [];
      // profil et trophées des autres : le bureau n'envoie que ses actions de gestion (validation, trophée décerné),
      // jamais une copie locale un peu ancienne qui écraserait leurs abonnements, coordonnées ou compteurs
      if (coll === 'member' && id !== R.key && !(b.data && b.data.parent === R.key))
        patch = R.role === 'bureau' ? patch.filter(op => ['valid', 'req', 'mail', 'via'].includes(op.p[0])) : [];
      if (coll === 'stats' && id !== R.key)
        patch = patch.filter(op => op.p[0] === 'k' && op.t === 'add' && /^award:/.test(op.v));
      if (patch.length) list.push({ coll, id, op: 'patch', patch, after: patchLocal(b.data, patch), _s: s });
    });
    R.base.forEach((b, k) => {
      if (seen.has(k)) return;
      const [coll, id] = [k.slice(0, k.indexOf('/')), k.slice(k.indexOf('/') + 1)];
      if (coll === 'conf' || coll === 'prefs' || coll === 'stats') return;
      if (coll === 'msg' && !(b.data && refs.has(b.data.ref))) return; // conteneur fermé (direct terminé…) : on garde
      if (coll === 'member' && !M[id] && id === R.key) return;
      if (!mayWrite(coll, id, b.data) || (coll === 'member' && R.role !== 'bureau' && b.data.parent !== R.key)) return; // pas à moi : on ne supprime pas
      list.push({ coll, id, op: 'del' });
    });
    return list;
  }
  async function tick() {
    if (!R.live) return;
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      const list = ops();
      if (list.length) {
        const sent = list.map(o => {
          const x = Object.assign({}, o);
          delete x._s;
          delete x.after;
          return x;
        });
        const r = await api('/api/ram/c/' + R.club + '/ops', { ops: sent });
        const bad = new Set((r.rejected || []).map(x => x.coll + '/' + x.id));
        list.forEach(o => {
          if (bad.has(o.coll + '/' + o.id)) R.bad.set(o.coll + '/' + o.id, J(o.data || o._s));
        });
        list.forEach(o => {
          const k = o.coll + '/' + o.id;
          if (bad.has(k)) return;
          if (o.op === 'del') R.base.delete(k);
          else R.base.set(k, { data: o.op === 'put' ? o.data : o.after });
        });
        if (bad.size) {
          console.warn('/RAM Club : refusé ' + J(r.rejected));
          toast("Une modification n'a pas été enregistrée : elle n'est pas autorisée pour ton compte");
          // on revient à la version du serveur pour ces éléments
          list
            .filter(o => bad.has(o.coll + '/' + o.id))
            .forEach(o => {
              const b = R.base.get(o.coll + '/' + o.id);
              applyItem(b ? { coll: o.coll, id: o.id, data: b.data } : { coll: o.coll, id: o.id, del: 1 }, false);
            });
          derive();
          safeRender();
        }
      }
      await pull();
    } catch (x) {
      if (x.status === 401 || x.status === 404) {
        stop();
        toast(x.status === 401 ? 'Ta session /RAM a expiré : reconnecte-toi' : 'Tu ne fais plus partie de ce club');
      } else console.warn('/RAM Club : synchronisation', x.message);
    } finally {
      busy = false;
      if (again) {
        again = false;
        setTimeout(tick, 50);
      }
    }
  }
  /* ---------- notifications de ce qui me concerne ----------
     On compare chaque élément avant / après la mise à jour : quelqu'un aime ma publication, la commente,
     rejoint ma partie, réagit à mon message, me convoque, répond à ma convocation, demande à entrer… */
  const added = (x, y) => (y || []).filter(v => !(x || []).includes(v));
  const removed = (x, y) => (x || []).filter(v => !(y || []).includes(v));
  const ttl = p =>
    String(p.title || p.q || '')
      .replace(/<[^>]+>/g, '')
      .trim();
  const quoted = p => (ttl(p) ? ` « ${ttl(p)} »` : '');
  // une même action ne notifie qu'une fois (même si elle arrive deux fois), mais on est de nouveau prévenu si elle se répète plus tard
  // (se désister puis revenir sur une partie, retirer puis remettre un like…)
  const recent = new Map();
  const once = (k, fn) => {
    const t = Date.now(),
      last = recent.get(k);
    if (last && t - last < 400) return;
    recent.set(k, t);
    fn();
  };
  const goRef = ref =>
    ref.startsWith('c:')
      ? { v: 'chan', id: ref.slice(2) }
      : ref.startsWith('r:')
        ? { v: 'rec', id: ref.slice(2) }
        : { v: 'post', id: ref.slice(2) };
  const known = k => k === 'club' || !!M[k];
  function notifyDiff(coll, id, a, b) {
    if (!b) return;
    const me = R.key,
      kids = (M[me] && M[me].kids) || [];
    if (coll === 'post' && a) {
      const go = { v: 'post', id },
        mine = b.by === me,
        clubEv = b.by === 'club' && isAdmin();
      if (mine)
        added(a.likers, b.likers).forEach(
          k =>
            k !== me &&
            known(k) &&
            once(`like/${id}/${k}`, () => notify('mine', k, 'aime ta publication' + quoted(b), go))
        );
      if (mine || clubEv) {
        const ma = a.myBy || {},
          mb = b.myBy || {};
        Object.keys(mb).forEach(k => {
          const v = mb[k];
          if (k === me || ma[k] === v || !known(k)) return;
          const t =
            b.kind === 'event'
              ? v === 'yes'
                ? (b.stage ? "s'inscrit au stage" : "s'inscrit à") + quoted(b)
                : v === 'wait'
                  ? "se met en liste d'attente pour" + quoted(b)
                  : ''
              : b.kind === 'comm' && v === 'yes'
                ? 'est intéressé par' + quoted(b)
                : '';
          if (t) once(`rsvp/${id}/${k}/${v}`, () => notify(mine ? 'mine' : 'club', k, t, go));
        });
        added(a.vol, b.vol).forEach(
          k =>
            k !== me &&
            known(k) &&
            once(`vol/${id}/${k}`, () =>
              notify(mine ? 'mine' : 'club', k, 'se propose comme bénévole pour' + quoted(b), go)
            )
        );
      }
      if (mine && b.play && a.play) {
        const y = b.play,
          when = `${y.date} à ${y.time}`;
        added(a.play.in, y.in).forEach(
          k =>
            k !== me && known(k) && once(`play/${id}/${k}`, () => notify('play', k, `rejoint ta partie du ${when}`, go))
        );
        removed(a.play.in, y.in).forEach(
          k =>
            k !== me &&
            known(k) &&
            once(`out/${id}/${k}`, () => notify('play', k, `se désiste de ta partie du ${when}`, go))
        );
        added(a.play.wait, y.wait).forEach(
          k =>
            k !== me &&
            known(k) &&
            once(`wait/${id}/${k}`, () => notify('play', k, `se met en liste d'attente pour ta partie du ${when}`, go))
        );
      }
    }
    // tournoi /RAM JA : inscrit par son partenaire, puis résultat à la clôture
    if (coll === 'post' && a && b.kind === 'jatour' && b.ja && a.ja) {
      const go = { v: 'post', id },
        keys = [me, ...kids],
        inn = j => (j.list || []).find(x => keys.includes(x.k1) || keys.includes(x.k2));
      if (!inn(a.ja) && inn(b.ja))
        once(`jain/${id}`, () =>
          notify('mine', 'club', `: tu es inscrit au tournoi « ${b.title} » (${fmtD(b.d)})`, go)
        );
      if (a.ja.status !== 'done' && b.ja.status === 'done') {
        const r = (b.ja.results || []).find(x => (x.k || []).some(k => keys.includes(k)));
        if (r || inn(b.ja))
          once(`jares/${id}`, () =>
            notify(
              'mine',
              'club',
              r
                ? `: résultat du tournoi « ${b.title} » : ${jaPlace(r.place, r.lo)} place`
                : `: le tournoi « ${b.title} » est terminé, les résultats sont publiés`,
              go
            )
          );
      }
      // horaire de mon match : nouveau, ou déplacé de plus d'un quart d'heure, ou changement de terrain
      const na = (inn(a.ja) || {}).next,
        nb = (inn(b.ja) || {}).next;
      if (nb && !nb.live && (!na || Math.abs(nb.at - na.at) >= 15 * 60000 || nb.court !== na.court))
        once(`janext/${id}/${nb.at}/${nb.court}`, () =>
          notify('team', 'club', `: ton match du tournoi « ${b.title} » : ${jaNext(nb)}`, go)
        );
      if (a.ja.status === 'open' && b.ja.status === 'drawn' && inn(b.ja))
        once(`jadraw/${id}`, () => notify('mine', 'club', `: le tirage du tournoi « ${b.title} » est fait`, go));
    }
    // publications par niveaux : l'enseignant voit arriver les inscriptions ; chacun est prévenu quand sa date est validée
    if (coll === 'post' && a && b.kind === 'niveaux' && b.nv && a.nv) {
      const go = { v: 'post', id },
        what = b.nv.mode === 'cours' ? 'la séance' : 'la partie';
      (b.nv.dates || []).forEach(d => {
        const sa = nvState(a.nv, d),
          sb = nvState(b.nv, d);
        if (b.by === me)
          b.nv.tiers.forEach(t =>
            added(sa.lists[t.id], sb.lists[t.id]).forEach(
              k =>
                k !== me &&
                known(k) &&
                once(`nv/${id}/${d}/${k}`, () =>
                  notify('mine', k, `s'inscrit à ${what} du ${fmtD(d)} (${nvRange(t, b.nv.sport).toLowerCase()})`, go)
                )
            )
          );
        if (!sa.win && sb.win) {
          const t = b.nv.tiers.find(x => x.id === sb.win),
            mine = Object.keys(sb.status).find(x => x.endsWith('|' + me));
          if (b.by === me || mine)
            once(`nvok/${id}/${d}`, () =>
              notify(
                b.by === me ? 'mine' : 'play',
                // l'enseignant voit qui a complété la fourchette ; les inscrits voient l'enseignant
                b.by === me ? sb.lists[t.id][t.places - 1] || 'club' : b.by,
                b.by === me
                  ? `complète ${what} du ${fmtD(d)} (${nvRange(t, b.nv.sport).toLowerCase()}) : les autres fourchettes passent en liste d'attente`
                  : sb.status[mine] === 'ok'
                    ? `valide ${what} du ${fmtD(d)} : tu y es inscrit`
                    : `: ${what} du ${fmtD(d)} est complète dans une autre fourchette, tu es en liste d'attente`,
                go
              )
            );
        }
      });
    }
    if (coll === 'msg') {
      if (a && b.by === me)
        Object.keys(b.reBy || {}).forEach(k => {
          const e = b.reBy[k];
          if (k !== me && known(k) && (a.reBy || {})[k] !== e)
            once(`re/${id}/${k}/${e}`, () =>
              notify(
                'mine',
                k,
                `a réagi ${e} à ton ${b.ref.startsWith('p:') ? 'commentaire' : 'message'}`,
                goRef(b.ref)
              )
            );
        });
      if (!a && b.by !== me && b.ref.startsWith('p:') && known(b.by)) {
        const p = posts.find(x => x.id === b.ref.slice(2));
        if (p && p.by === me)
          once(`com/${id}`, () =>
            notify('mine', b.by, `a commenté ta publication : « ${String(b.x || 'Photo').slice(0, 70)} »`, {
              v: 'post',
              id: p.id
            })
          );
        else if (p && b.rep && b.rep.by === me)
          once(`com/${id}`, () =>
            notify('mine', b.by, `t'a répondu : « ${String(b.x || '').slice(0, 70)} »`, { v: 'post', id: p.id })
          );
      }
    }
    if (coll === 'rec' && a) {
      const g = grp(b.tid),
        team = g ? teamName(g) : "L'équipe",
        go = { v: 'rec', id },
        la = a.lineup || {},
        lb = b.lineup || {},
        by = g && g.cap && known(g.cap) ? g.cap : 'club';
      [me, ...kids].forEach(k => {
        if (lb[k] && la[k] !== lb[k])
          once(`conv/${id}/${k}/${lb[k]}`, () =>
            notify(
              'team',
              by,
              `${k === me ? 'te convoque' : 'convoque ' + first(k)} comme ${lb[k] === 'T' ? 'titulaire' : 'remplaçant'} : ${team} – ${b.opp}${b.when ? ', ' + b.when : ''}`,
              go
            )
          );
      });
      if (g && canTeam(g))
        Object.keys(b.conv || {}).forEach(k => {
          const v = b.conv[k];
          if (k !== me && known(k) && (a.conv || {})[k] !== v && (v === 'ok' || v === 'no'))
            once(`rep/${id}/${k}/${v}`, () =>
              notify(
                'team',
                k,
                v === 'ok' ? `est dispo pour ${team} – ${b.opp}` : `n'est pas dispo pour ${team} – ${b.opp}`,
                go
              )
            );
        });
      const mineTeam = g && (g.mem.includes(me) || g.mem.some(k => kids.includes(k)));
      if (mineTeam && a.st !== 'live' && b.st === 'live')
        once(`live/${id}`, () => notify('team', 'club', `${team} – ${b.opp} : la rencontre commence en direct`, go));
      if (mineTeam && a.st === 'live' && b.st === 'done')
        once(`end/${id}`, () => {
          const s = teamScore(b);
          notify('team', 'club', `${team} – ${b.opp} : fin de la rencontre, ${s[0]} à ${s[1]}`, go);
        });
    }
    if (coll === 'group' && a && added(a.mem, b.mem).some(k => k === me || kids.includes(k)))
      once(`grp/${id}/${(b.mem || []).length}`, () =>
        notify(
          'team',
          known(b.coach) ? b.coach : known(b.cap) ? b.cap : 'club',
          `t'a ajouté à ${b.type === 'team' ? teamName(b) : b.name}`,
          { v: b.type === 'team' ? 'team' : 'grp', id }
        )
      );
    if (coll === 'comm' && a) {
      if (isBureau() || b.resp === me)
        added(a.req, b.req).forEach(
          k =>
            k !== me &&
            known(k) &&
            once(`creq/${id}/${k}`, () =>
              notify('club', k, `souhaite rejoindre la ${String(b.name).toLowerCase()}`, { v: 'comm', id })
            )
        );
      if (added(a.mem, b.mem).includes(me))
        once(`cmem/${id}`, () =>
          notify('club', known(b.resp) ? b.resp : 'club', `t'a accepté dans la ${String(b.name).toLowerCase()}`, {
            v: 'comm',
            id
          })
        );
    }
    // bar : un bon d'échange pris avec des points est signalé au bureau
    if (coll === 'redeem' && !a && isBureau() && b.by !== me && known(b.by) && b.st === 'ok')
      once(`redeem/${id}`, () =>
        notify('club', b.by, `prend ${b.name} avec ${b.pts} points (bon ${barCode(Object.assign({ id }, b))})`, {
          v: 'bar',
          d: TODAY
        })
      );
    // bar : le bureau est prévenu de chaque nouvelle réservation (pour préparer les commandes du lendemain)
    if (coll === 'order' && !a && isBureau() && b.by !== me && known(b.by) && b.st !== 'annule')
      once(`order/${id}`, () =>
        notify(
          'club',
          b.by,
          `réserve ${b.qty} × ${b.name} · ${barDay(b.date).toLowerCase()}, ${MOMENT[b.moment].toLowerCase()}`,
          {
            v: 'bar',
            d: b.date
          }
        )
      );
    if (coll === 'member' && a && id !== me && added(a.fo, b.fo).includes(me) && known(id))
      once(`fo/${id}`, () => notify('mine', id, 'te suit désormais', { v: 'member', id }));
    if (coll === 'member' && id !== me && isBureau() && b.req && !(a && a.req) && b.valid !== S.season)
      once(`join/${id}`, () => notify('club', id, 'demande à rejoindre le club', { v: 'join' }));
  }
  /* commentaires ouverts : on redessine la fenêtre en gardant le texte en cours de saisie */
  function refreshComments(pid) {
    const p = posts.find(x => x.id === pid);
    if (!p) return;
    const inp = document.getElementById('com-input'),
      txt = inp ? inp.value : '',
      focus = document.activeElement === inp;
    sheet('Commentaires', commentsBody(p), true);
    const ni = document.getElementById('com-input');
    if (ni) {
      ni.value = txt;
      if (focus) ni.focus({ preventScroll: true });
    }
    const l = document.getElementById('com-list');
    if (l) l.scrollTo({ top: l.scrollHeight, behavior: 'smooth' });
  }

  /* compteurs d'actions recomptés par le serveur : ce sont eux que l'on affiche (trophées, paliers) */
  function countsOf(k) {
    const c = R.counts && R.counts[k];
    if (!c || typeof STATS === 'undefined' || typeof ST !== 'function' || !M[k]) return;
    const s = ST(k);
    Object.assign(s.c, c);
    s.c.ap = Object.entries(c).reduce((a, [x, n]) => a + (x === 'streak' || x === 'autre' ? 0 : n), 0);
  }
  function applyCounts(cnt) {
    R.counts = cnt;
    Object.keys(cnt).forEach(countsOf);
  }
  /* trophées : vérifiés après chaque synchronisation, avec les compteurs du serveur et les trophées décernés
     par le club ; un palier atteint depuis n'importe quel appareil (ou grâce aux autres : likes, abonnés…)
     donne sa notification, gardée dans l'historique de tous mes appareils */
  function trophyCheck() {
    if (typeof check !== 'function' || !M[R.key] || pending()) return;
    try {
      check();
    } catch (x) {
      console.warn('/RAM Club : trophées', x.message);
    }
  }
  async function pull() {
    const d = await api('/api/ram/c/' + R.club + '/sync?since=' + R.rev);
    // accès validé par le bureau ou rôle changé : ce qu'on a le droit de voir change, on recharge tout le club
    if (d.me && (d.me.valid !== R.valid || d.me.role !== R.role)) {
      const opened = d.me.valid && !R.valid;
      await start(R.club);
      if (opened) toast('Ton accès au club est validé : bienvenue !');
      return;
    }
    // scores d'investissement calculés par le serveur : identiques pour tous les comptes
    if (d.counts) applyCounts(d.counts);
    if (d.wallet) {
      const ch = !R.wallet || R.wallet.earned !== d.wallet.earned;
      R.wallet = d.wallet;
      if (ch && !d.items.length && S.tab === 'club') render(true);
    }
    if (d.scores) {
      const ch = Object.keys(d.scores).some(k => d.scores[k] !== R.scores[k]);
      R.scores = d.scores;
      if (ch && !d.items.length) render(true);
    }
    if (!d.items.length) {
      R.rev = d.rev;
      if (d.counts) trophyCheck();
      return;
    }
    const local = new Map(collect().map(([coll, id, s]) => [coll + '/' + id, J(s)]));
    const before = new Map(
      d.items.map(it => {
        const b = R.base.get(it.coll + '/' + it.id);
        return [it.coll + '/' + it.id, b ? b.data : null];
      })
    );
    fresh = [];
    d.items.forEach(it => {
      const k = it.coll + '/' + it.id,
        b = R.base.get(k);
      // modifié ici depuis le dernier envoi : on garde la version locale (elle partira au prochain envoi)
      // (seulement pour ce qui est à moi : une copie divergente d'un élément des autres est remplacée par la version du serveur)
      if (
        b &&
        local.has(k) &&
        local.get(k) !== R.snap.get(k) &&
        local.get(k) !== J(b.data) &&
        !it.del &&
        mayWrite(it.coll, it.id, b.data)
      ) {
        R.base.set(k, { data: it.data });
        return;
      }
      applyItem(it, false);
    });
    R.rev = d.rev;
    derive();
    trophyCheck(); // compteurs, trophées décernés par le club
    // nouveau message dans la discussion ouverte : il apparaît avec une animation et l'écran défile jusqu'à lui
    const v0 = view(),
      here = v0.v === 'chan' ? 'c:' + v0.id : v0.v === 'rec' ? 'r:' + v0.id : '';
    let toBottom = false;
    fresh.forEach(([kind, o, ref]) => {
      if (kind === 'msg' && ref === here) {
        o._pop = 1;
        toBottom = true;
      }
    });
    fresh.forEach(([kind, o, ref]) => {
      // une seule notification par message ou publication, même s'il arrive deux fois
      const nk = kind + '/' + (o._id || o.id);
      if (R.notified.has(nk)) return;
      R.notified.add(nk);
      if (kind === 'post' && canSee(o)) {
        // publications d'un adhérent : ses abonnés sont prévenus (résultats détaillés) ; celles du club : tout le monde
        const type = o.by === 'club' ? 'club' : o.kind === 'play' ? 'play' : S.follow.has(o.by) ? 'follow' : '';
        const r = o.res,
          pr = o.pres;
        const txt =
          o.kind === 'perf' && r
            ? `${r.w ? (r.fin ? 'remporte le tournoi' : 'gagne') : r.fin ? 'perd en finale' : 'perd'} contre ${r.opp} (${r.or}) : ${r.sc}${r.perf ? ' · perf !' : ''}`
            : o.kind === 'padel' && pr
              ? `termine ${pr.place === '1er' ? '1er' : pr.place} en ${pr.cat} à ${pr.club}`
              : o.kind === 'play'
                ? `cherche des joueurs : ${o.play.sport.toLowerCase()}, ${o.play.date} à ${o.play.time}`
                : /^Classement/.test(ttl(o))
                  ? `met à jour son ${ttl(o).replace(/^Classement/, 'classement')}`
                  : 'a publié sur le mur';
        if (pr && pr.pid === R.key)
          notify(
            'mine',
            o.by,
            `a publié votre résultat : ${pr.place === '1er' ? '1re' : pr.place} place en ${pr.cat} à ${pr.club}`,
            { v: 'post', id: o.id }
          ); // partenaire de padel
        else if (type) notify(type, o.by, txt, { v: 'post', id: o.id });
      }
      if (kind === 'msg' && ref.startsWith('c:')) {
        const c = chans.find(x => x.id === ref.slice(2));
        const v = view();
        if (c && !(v.v === 'chan' && v.id === c.id)) {
          if (!c.mute && chanOk(c)) notify('chan', o.by, 'a écrit dans ' + c.name, { v: 'chan', id: c.id }, false);
        }
      }
    });
    // tout ce qui me concerne dans ce qui a changé : likes, commentaires, réactions, inscriptions, convocations…
    d.items.forEach(it => {
      if (!it.del) {
        try {
          notifyDiff(it.coll, it.id, before.get(it.coll + '/' + it.id), it.data);
        } catch (x) {
          console.warn('/RAM Club : notification', x.message);
        }
      }
    });
    // commentaires ouverts : les nouveaux commentaires s'y affichent aussitôt
    const cf = document.getElementById('com-form');
    if (cf && fresh.some(([kind, , ref]) => kind === 'msg' && ref === 'p:' + cf.dataset.id))
      refreshComments(cf.dataset.id);
    safeRender();
    if (toBottom) {
      const m = document.getElementById('main');
      setTimeout(() => {
        m.scrollTo({ top: m.scrollHeight, behavior: 'smooth' });
        // filet : si le défilement doux n'a pas abouti (appareil lent, appli en arrière-plan), on va directement en bas
        setTimeout(() => {
          if (m.scrollHeight - m.clientHeight - m.scrollTop > 40) m.scrollTop = m.scrollHeight;
        }, 700);
      }, 30);
    }
  }
  /* redessine sans gêner : pas pendant la saisie dans l'écran, ni sous une fenêtre ouverte */
  let pend = false;
  function safeRender() {
    const a = document.activeElement;
    if ($('sheet') || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest('#main'))) {
      pend = true;
      return;
    }
    pend = false;
    ramRender(true);
  }
  document.addEventListener('focusout', () =>
    setTimeout(() => {
      if (pend && R.live) safeRender();
    }, 300)
  );
  function schedule() {
    clearTimeout(timer);
    const v = view(),
      hot = v.v === 'chan' || v.v === 'rec' || recs.some(r => r.st === 'live');
    // connexion en direct ouverte : les nouveautés arrivent aussitôt, la vérification régulière n'est qu'un filet de sécurité
    const direct = es && es.readyState === 1;
    timer = setTimeout(
      () => {
        tick().finally(schedule);
      },
      document.hidden ? 60000 : direct ? 30000 : hot ? 3000 : 10000
    );
  }
  /* connexion en direct avec le serveur (comme une messagerie) : prévenu à chaque changement du club */
  let es = null;
  function listen() {
    if (es) es.close();
    if (!window.EventSource) return;
    es = new EventSource('/api/ram/c/' + R.club + '/events', { withCredentials: true });
    es.onmessage = ev => {
      let d = {};
      try {
        d = JSON.parse(ev.data);
      } catch (x) {}
      if (d.rev < 0) {
        stop();
        toast('Tu ne fais plus partie de ce club');
        return;
      }
      if (d.rev > R.rev) tick();
    };
    es.onopen = () => {
      tick();
      schedule();
    }; // reconnecté : on rattrape ce qui a pu être manqué
    es.onerror = () => schedule(); // coupé : vérification rapprochée en attendant la reconnexion
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && R.live) {
      tick();
      schedule();
    }
  });
  function stop() {
    R.live = false;
    clearTimeout(timer);
    if (es) {
      es.close();
      es = null;
    }
  }

  /* chaque affichage peut suivre une action : on envoie les changements juste après */
  const ramRender = render;
  render = function (keep) {
    if (R.live) markSeen();
    ramRender(keep);
    if (R.live) {
      clearTimeout(pushT);
      pushT = setTimeout(tick, 120);
    }
  };

  /* ---------- démarrage dans un vrai club ---------- */
  function wipe() {
    [posts, chans, GROUPS, CHAMPS, OLDG, OLDC, recs, arts, PARTNERS, COMMS, REPORTS, NOTIFS, JOINREQ, FORM].forEach(
      l => {
        l.length = 0;
      }
    );
    Object.keys(M).forEach(k => {
      if (k !== 'club') delete M[k];
    });
    [VALID, CT].forEach(o => Object.keys(o).forEach(k => delete o[k]));
    if (typeof XP !== 'undefined') Object.keys(XP).forEach(k => delete XP[k]);
    if (typeof STATS !== 'undefined') Object.keys(STATS).forEach(k => delete STATS[k]);
    if (typeof CLAIMS !== 'undefined') CLAIMS.length = 0;
    BAR.length = 0;
    ORDERS.length = 0;
    REDEEMS.length = 0;
    ['tel', 'mail'].forEach(k => {
      MYCT[k][2] = '';
    });
    MYCT.soc = ['at', 'Instagram', ''];
    S.liked.clear();
    [SEEN.at, SEEN.prev].forEach(o => Object.keys(o).forEach(k => delete o[k]));
    seenTab = null;
    S.follow = new Set();
    S.blocked = new Set();
    S.share = { tel: false, mail: false, soc: false };
    S.tab = 'home';
    S.stack = [];
    S.scoring = false;
    S.setup = {};
    S.invited = 0;
    TODAY = isoOf(new Date());
    S.plan.d = TODAY;
  }
  async function start(id) {
    const d = await api('/api/ram/c/' + id + '/sync?since=0');
    stop();
    wipe();
    R.club = id;
    R.key = d.me.key;
    R.role = d.me.role;
    R.valid = d.me.valid;
    R.loadAt = Date.now();
    R.code = d.club.code;
    R.fol = d.fol || {};
    R.roles = d.roles || {};
    R.scores = d.scores || {};
    R.counts = d.counts || {};
    R.jaTitles = d.jaTitles || {}; // titres de juge-arbitre /RAM JA des adhérents (badge)
    R.wallet = d.wallet || null; // points bar (gagnés en consommant au bar), calculés par le serveur
    R.base = new Map();
    R.bad = new Map();
    window.RAM_KEY = R.key;
    const order = [
      'conf',
      'member',
      'prefs',
      'stats',
      'chan',
      'group',
      'champ',
      'rec',
      'post',
      'art',
      'partner',
      'comm',
      'claim',
      'bar',
      'order',
      'redeem',
      'msg',
      'report'
    ];
    d.items.sort((a, b) => order.indexOf(a.coll) - order.indexOf(b.coll)).forEach(it => applyItem(it, true));
    applyCounts(R.counts);
    trophyCheck();
    if (!M[R.key]) M[R.key] = { n: 'Moi', r: 'NC', team: '', fol: 0, g: 'H', bd: '', res: [] };
    R.rev = d.rev;
    R.live = true;
    LS.set('ram-club', id);
    derive();
    ramRender();
    schedule();
    listen();
    api('/api/me/player')
      .then(d => {
        R.ja = d;
        render(true);
      })
      .catch(() => {}); // fiche /RAM JA rattachée, ou celles qui pourraient être la mienne
  }

  /* ---------- actions propres au vrai club ---------- */
  const _joinNo = A.joinNo,
    _joinOk = A.joinOk,
    _readh = A.readh,
    _delAccount = A.delAccount;
  // demande validée : l'e-mail et la mention « demande » quittent le profil visible du club
  A.joinOk = d => {
    const j = JOINREQ[+d.i];
    _joinOk(d);
    if (R.live && j && M[j.id]) {
      ['req', 'mail', 'via'].forEach(k => delete M[j.id][k]);
      render(true);
    }
  };
  A.joinNo = d => {
    if (!R.live) return _joinNo(d);
    const j = JOINREQ[+d.i];
    if (!j) return;
    api('/api/ram/c/' + R.club + '/remove', { key: j.id }).then(
      () => {
        R.base.delete('member/' + j.id);
        delete M[j.id];
        derive();
        ramRender(true);
        toast(`Demande de ${j.n} refusée`);
      },
      x => toast(x.message)
    );
  };
  A.readh = d => {
    _readh(d);
    if (R.live) {
      const m = M[ME()];
      m.req = 1;
      m.via = "une reprise d'adhésion";
      render(true);
    }
  };
  A.ramRole = d =>
    api('/api/ram/c/' + R.club + '/role', { key: d.id, role: d.r }).then(
      () => {
        R.roles[d.id] = d.r;
        const m = M[d.id];
        if (m && d.r !== 'mem' && VALID[d.id] !== S.season) VALID[d.id] = S.season;
        render(true);
        toast(`${first(d.id)} : ${{ bureau: 'membre du bureau', coach: 'enseignant', mem: 'adhérent' }[d.r]}`);
      },
      x => toast(x.message)
    );
  A.ramRemove = d =>
    sheet(
      'Retirer ' + first(d.id),
      `<div class="body"><div class="note">${e(name(d.id))} n'aura plus accès à l'appli du club. Ses messages restent affichés.</div><button class="btn full hot" data-a="ramRemoveOk" data-id="${d.id}">Retirer du club</button></div>`
    );
  A.ramRemoveOk = d =>
    api('/api/ram/c/' + R.club + '/remove', { key: d.id }).then(
      () => {
        closeSheet();
        R.base.delete('member/' + d.id);
        delete M[d.id];
        S.stack.pop();
        derive();
        ramRender();
        toast('Adhérent retiré du club');
      },
      x => toast(x.message)
    );
  A.delAccount = d => {
    if (!R.live) return _delAccount(d);
    sheet(
      'Quitter le club',
      `<div class="body"><div class="note">Tu quittes ${e(club().name)} : ton profil et tes réglages sont retirés de l'appli du club. Tes messages restent affichés. Ton compte /RAM (le même que /RAM JA) est conservé.</div><button class="btn full hot" data-a="ramLeave">Quitter ${e(club().name)}</button></div>`
    );
  };
  A.ramLeave = () =>
    api('/api/ram/c/' + R.club + '/remove', { key: R.key }).then(
      () => {
        closeSheet();
        stop();
        LS.set('ram-club', '');
        location.reload();
      },
      x => toast(x.message)
    );
  /* actualisation manuelle (tirer vers le bas) : on envoie ce qui attend, puis on recharge tout le club
     depuis le serveur, en restant sur l'écran ouvert */
  window.ramRefresh = async () => {
    if (!R.live) return false;
    await tick().catch(() => {});
    const tab = S.tab,
      stack = S.stack.slice(),
      ct = S.clubTab,
      ag = S.ecTab;
    await start(R.club);
    S.tab = tab;
    S.stack = stack.filter(
      v =>
        !v.id ||
        (v.v === 'post'
          ? posts
          : v.v === 'rec'
            ? recs
            : v.v === 'chan'
              ? chans
              : v.v === 'member'
                ? Object.keys(M).map(id => ({ id }))
                : [{ id: v.id }]
        ).some(x => x.id === v.id)
    );
    S.clubTab = ct;
    S.ecTab = ag;
    ramRender();
    return true;
  };
  A.ramSwitch = d => {
    closeSheet();
    start(d.id).catch(x => toast(x.message));
  };
  /* mes clubs : le principal (celui de ma licence, repris par /RAM JA) et les secondaires (adhérent, autre sport…) */
  const ROLE_L = { bureau: 'Bureau', coach: 'Enseignant', mem: 'Adhérent' };
  A.ramClubs = () => {
    const main = R.clubs.find(c => c.main),
      row = c =>
        `<div class="item"><button class="grow" data-a="ramSwitch" data-id="${c.id}" style="text-align:left;display:flex;gap:10px;align-items:center">${ic(c.id === R.club ? 'check' : 'club')}<span class="grow"><span class="nm">${e(c.name)}</span><br><span class="muted small">${ROLE_L[c.role] || ''}${c.id === R.club ? ' · ouvert' : ''}</span></span></button>${c.main ? '<span class="tag lime">Principal</span>' : `<button class="btn sm ghost" data-a="ramMain" data-id="${c.id}">Principal</button>`}</div>`;
    sheet(
      'Mes clubs',
      `<div class="body">${main ? `<span class="kicker">Club principal · licence</span>${row(main)}` : ''}${
        R.clubs.filter(c => !c.main).length
          ? `<span class="kicker">${main ? 'Clubs secondaires' : 'Mes clubs'}</span>${R.clubs
              .filter(c => !c.main)
              .map(row)
              .join('')}`
          : ''
      }<p class="muted small">Le club principal est celui de ta licence : c’est lui qui apparaît sur ta fiche joueur /RAM JA. Tu peux être adhérent d’autres clubs (par exemple un club de tennis et un club de padel).</p><div class="menu"><button data-a="ramStart">${ic('plus')}Rejoindre ou créer un autre club</button></div></div>`
    );
  };
  A.ramMain = d =>
    api('/api/ram/main', { id: d.id }).then(
      async () => {
        R.clubs = (await api('/api/ram/clubs')).clubs;
        A.ramClubs();
        toast('Club principal enregistré : il apparaît sur ta fiche joueur /RAM JA');
      },
      x => toast(x.message)
    );
  A.ramStart = () => onboard();
  A.ramCopy = () => {
    const t = `Rejoins ${club().name} sur /RAM Club : ${location.origin}${onClubHost ? '/' : '/club/'} · code du club ${R.code}`;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject())
      .then(() => {
        (S.setup = S.setup || {}).inv = true;
        render(true);
        toast('Invitation copiée');
      })
      .catch(() => toast('Copie impossible ici : note le code ' + R.code));
  };

  /* ---------- créer un club ou rejoindre le sien ---------- */
  function onboard() {
    sheet(
      'Ton club sur /RAM Club',
      `<div class="body">
      <form id="ram-join" class="stack"><span class="kicker">Rejoindre mon club</span><p class="muted small">Le bureau de ton club te donne son code (par exemple TPC-4821).</p>
        <div class="fld"><label for="rj-code">Code du club</label><input id="rj-code" required autocomplete="off" autocapitalize="characters" placeholder="TPC-4821"></div>
        <button class="btn full">Envoyer ma demande</button></form>
      <form id="ram-new" class="stack" style="margin-top:22px"><span class="kicker">Créer l'appli de mon club</span><p class="muted small">Tu seras au bureau : tu valides les adhérents et tu gères le club.</p>
        <div class="two"><div class="fld"><label for="rn-name">Nom du club</label><input id="rn-name" required maxlength="60" autocomplete="organization" placeholder="TC Les Tilleuls"></div>
        <div class="fld"><label for="rn-short">Sigle</label><input id="rn-short" required maxlength="4" autocomplete="off" autocapitalize="characters" placeholder="TCT"></div></div>
        <button class="btn full ghost">Créer le club</button></form>
      <p class="muted small" style="margin-top:14px">Sans club, l'appli reste en démonstration avec un club fictif.</p></div>`
    );
    // annuaire commun aux deux applis : clubs déjà connus de /RAM JA (tournois) proposés à la création ;
    // un club déjà présent sur /RAM Club est signalé, pour le rejoindre plutôt que le créer en double
    fetch('/api/clubs-directory', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const inp = $('rn-name');
        if (!inp || !d.clubs) return;
        const dl = document.createElement('datalist');
        dl.id = 'rn-clubs';
        dl.innerHTML = d.clubs
          .map(
            c =>
              `<option value="${e(c.name)}">${c.ramClub ? 'Déjà sur /RAM Club' : c.tournaments + ' tournoi' + (c.tournaments > 1 ? 's' : '') + ' /RAM JA'}</option>`
          )
          .join('');
        inp.after(dl);
        inp.setAttribute('list', 'rn-clubs');
        const hint = document.createElement('p');
        hint.className = 'muted small';
        inp.closest('form').querySelector('.two').after(hint);
        const fold = s =>
          String(s || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .trim();
        inp.addEventListener('input', () => {
          const c = d.clubs.find(x => x.ramClub && fold(x.name) === fold(inp.value));
          hint.textContent = c
            ? `${c.name} est déjà sur /RAM Club : demande son code au bureau pour le rejoindre.`
            : '';
        });
      })
      .catch(() => {});
  }
  document.addEventListener(
    'submit',
    ev => {
      const f = ev.target;
      if (f.id !== 'ram-join' && f.id !== 'ram-new') return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      const go =
        f.id === 'ram-join'
          ? api('/api/ram/join', { code: $('rj-code').value })
          : api('/api/ram/clubs', { name: $('rn-name').value, short: $('rn-short').value });
      go.then(
        async c => {
          closeSheet();
          R.clubs = (await api('/api/ram/clubs')).clubs;
          await start(c.id);
          toast(
            f.id === 'ram-join'
              ? `Demande envoyée à ${c.name} · le bureau va valider ton accès`
              : `${c.name} est créé · code à donner aux adhérents : ${c.code}`
          );
        },
        x => toast(x.message)
      );
    },
    true
  );

  /* ---------- écrans : compte /RAM, bandeau de démo, gestion d'un adhérent ---------- */
  window.ramTeam = () =>
    Object.keys(M).filter(k => k !== 'club' && (R.roles[k] === 'bureau' || R.roles[k] === 'coach'));
  function accountCard() {
    const u = R.user,
      logo = `<img src="${ramLogo()}" alt="/RAM Club" class="ram-acc-logo">`;
    if (!u)
      return `${logo}<div class="grow"><b>Compte /RAM</b><span>Connecte-toi avec ton compte /RAM : le même que pour /RAM JA.</span></div><a class="btn sm" href="${loginUrl()}">Se connecter</a>`;
    const nm = e([u.first, u.last].filter(Boolean).join(' ') || u.name || u.email);
    return `${logo}<div class="grow"><b>Compte /RAM</b><span>${nm} · ${e(u.email || '')}</span><small>${R.live ? `<button class="nm" data-a="ramClubs" style="color:var(--accent)">${R.clubs.length > 1 ? `Mes clubs (${R.clubs.length}) · changer` : 'Mes clubs · en rejoindre un autre'}</button>` : `<button class="nm" data-a="ramStart" style="color:var(--accent)">Créer ou rejoindre mon club</button>`}</small></div><button class="btn sm ghost" data-a="logout">Se déconnecter</button>`;
  }
  function fill() {
    const el = document.getElementById('ramAccount');
    if (!el || el.dataset.done || R.user === undefined || !served) return;
    el.dataset.done = '1';
    el.hidden = false;
    el.innerHTML = accountCard();
  }
  new MutationObserver(fill).observe(document.getElementById('main'), { childList: true, subtree: true });

  const _home = V.home;
  V.home = function () {
    const h = _home.apply(this, arguments);
    if (R.live) {
      const ask = jaAsk();
      return ask ? '<div class="pad" style="padding-bottom:0">' + ask + '</div>' + h : h;
    } // « Est-ce toi ? » aussi sur l'accueil
    if (!served || R.user === undefined) return h;
    const card = R.user
      ? `<div class="card"><span class="kicker">Démonstration</span><p>Tu regardes un club fictif. Crée l'appli de ton club ou rejoins-le avec son code.</p><button class="btn full" data-a="ramStart">Créer ou rejoindre mon club</button></div>`
      : `<div class="card"><span class="kicker">Démonstration</span><p>Tu regardes un club fictif. Connecte-toi avec ton compte /RAM pour retrouver ton club.</p><a class="btn full" href="${loginUrl()}">Se connecter</a></div>`;
    return '<div class="pad" style="padding-bottom:0">' + card + '</div>' + h;
  };
  /* ---------- lien avec /RAM JA : ma fiche joueur et mes tournois ---------- */
  R.ja = null;
  R.jaHist = {};
  window.ramPlayerSync = body =>
    api('/api/me/player', body).then(
      d => {
        R.ja = d;
        render(true);
        return d;
      },
      x => {
        toast(x.message);
        throw x;
      }
    );
  A.ramLink = d =>
    ramPlayerSync({ player: d.id }).then(
      () => toast('Profil relié à ta fiche /RAM JA : tes tournois apparaissent dans ton palmarès'),
      () => {}
    );
  /* « Mes informations » : le compte /RAM (prénom, nom) et la fiche joueur /RAM JA suivent le profil */
  window.ramProfileSync = ({ name, licence }) => {
    const w = String(name || '')
        .trim()
        .split(/\s+/),
      first = w.shift() || '',
      last = w.join(' ');
    return api('/api/me', { first, last })
      .then(d => {
        if (d.user) R.user = Object.assign({}, R.user, d.user);
        return ramPlayerSync({ licence });
      })
      .catch(() => {});
  };
  A.ramDismiss = d => ramPlayerSync({ dismiss: d.id }).catch(() => {});
  const jaPlace = (p, lo) => (p === 1 ? '1er' : p + 'e') + (lo && lo !== p ? '–' + lo + 'e' : '');
  function jaHist(pid) {
    if (R.jaHist[pid] === undefined) {
      R.jaHist[pid] = null;
      api('/api/players/' + encodeURIComponent(pid)).then(
        d => {
          R.jaHist[pid] = d.history || [];
          render(true);
        },
        () => {
          R.jaHist[pid] = [];
        }
      );
    }
    return R.jaHist[pid];
  }
  /* « Est-ce toi ? » : fiches /RAM JA au même nom ou à la même licence, avec leurs derniers tournois */
  function jaAsk() {
    if (!R.ja) return ''; // même avec sa fiche, le compte peut reprendre une fiche existante à son nom
    return (R.ja.candidates || [])
      .map(p => {
        const t = (p.history || [])
          .slice(0, 3)
          .map(
            x =>
              `${e(x.tournament || 'un tournoi')}${x.club ? ' à ' + e(x.club) : ''}${x.date ? ' (' + e(x.date) + ')' : ''}`
          )
          .join(', ');
        return `<div class="card"><span class="kicker">Est-ce toi ?</span><p>Es-tu <b>${e(p.first)} ${e(p.last)}</b>${p.licence ? ' (licence ' + e(p.licence) + ')' : ''}, qui a joué ${t || 'des tournois /RAM JA'} ?</p><p class="muted small">Relie ton profil à cette fiche : tes résultats /RAM JA apparaîtront dans ton palmarès, pour tout le club.</p><div class="ctl"><button class="btn sm grow" data-a="ramLink" data-id="${e(p.id)}">Oui, c'est moi</button><button class="btn sm ghost grow" data-a="ramDismiss" data-id="${e(p.id)}">Non</button></div></div>`;
      })
      .join('');
  }
  /* tournois /RAM JA d'un adhérent relié à sa fiche (« _ja », écrit par le serveur seulement) */
  function jaCards(id) {
    let h = id === ME() ? jaAsk() : '';
    if (id === ME() && R.ja && R.ja.linked) {
      const p = R.ja.linked;
      h += `<div class="card"><span class="kicker">Fiche /RAM JA</span><p><b>${e(p.last)} ${e(p.first)}</b>${p.licence ? ' · licence ' + e(p.licence) : ''}${p.club ? ' · ' + e(p.club) : ''} · ${(p.history || []).length} tournoi${(p.history || []).length > 1 ? 's' : ''}</p><p class="muted small">Elle suit ton profil : nom, licence et classement padel sont mis à jour pour les juges-arbitres.</p></div>`;
    }
    const pid = (M[id] || {})._ja;
    if (pid) {
      const hs = jaHist(pid);
      h += `<div class="stack"><span class="kicker">Tournois /RAM JA</span><div class="palm">${hs === null ? '<p class="muted small">Chargement…</p>' : hs.length ? hs.map(x => `<div class="res"><span class="wl wide ${x.place === 1 ? 'w' : 'pl'}">${jaPlace(x.place, x.placeLo)}</span><span class="grow"><span class="nm">${e(x.tournament || 'Tournoi')}</span>${x.category ? ` <span class="bd rk">${e(x.category)}</span>` : ''}<br><span class="muted small">${[x.club, x.date, x.partner ? 'avec ' + x.partner : '', x.points ? x.points + ' pts' : ''].filter(Boolean).map(e).join(' · ')}</span></span></div>`).join('') : '<p class="muted small">Aucun tournoi clôturé pour le moment.</p>'}</div></div>`;
    }
    return h;
  }
  window.ramJaAsk = jaAsk;
  const _profile = profile;
  profile = function (id) {
    let h = _profile(id);
    if (!R.live) return h;
    const ja = jaCards(id),
      anchor = '<div class="stack"><span class="kicker">Palmarès de la saison</span>';
    if (ja) h = h.includes(anchor) ? h.replace(anchor, () => ja + anchor) : h + ja;
    if (id === ME() && isBureau() && R.code)
      h = h.replace(
        '<div class="phero">',
        `<div class="card"><span class="kicker">Code du club</span><p><b style="font-size:22px;letter-spacing:.06em">${e(R.code)}</b></p><p class="muted small">Donne ce code aux adhérents : ils l'entrent dans l'appli, puis tu valides leur demande.</p><button class="btn sm ghost" data-a="ramCopy">Copier l'invitation</button></div><div class="phero">`
      );
    if (id !== ME() && isBureau() && !isMinor(id) && R.roles[id]) {
      const r = R.roles[id],
        chip = (v, l) =>
          `<button class="chip" data-a="ramRole" data-id="${id}" data-r="${v}" aria-pressed="${r === v}">${l}</button>`;
      h = h.replace(
        /<\/div>$/,
        `<div class="card"><span class="kicker">Accès à l'appli</span><div class="chips">${chip('mem', 'Adhérent')}${chip('coach', 'Enseignant')}${chip('bureau', 'Bureau')}</div><p class="muted small">Le bureau gère tout le club. Un enseignant gère les groupes, les stages et publie au nom du club. Le capitaine d'une équipe se choisit dans l'équipe.</p><button class="btn sm ghost" style="color:var(--hot-tx)" data-a="ramRemove" data-id="${id}">Retirer du club</button></div></div>`
      );
    }
    return h;
  };

  /* ---------- lancement ---------- */
  (async () => {
    if (!served) {
      R.user = null;
      readyFn();
      return;
    }
    // première ouverture après une mise à jour : des fichiers de l'ancienne version peuvent venir du cache
    // (TODAY n'y était pas modifiable) → on vide le cache et on recharge, une seule fois
    try {
      TODAY = TODAY;
    } catch (x) {
      if (!sessionStorage.getItem('ram-refresh')) {
        sessionStorage.setItem('ram-refresh', '1');
        try {
          await Promise.all((await caches.keys()).map(k => caches.delete(k)));
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) await reg.update();
        } catch (y) {}
        location.reload();
        return;
      }
      R.user = null;
      readyFn();
      return;
    }
    try {
      const me = await api('/api/me');
      R.user = me.user && !me.user.guest ? me.user : null;
      if (R.user) {
        R.clubs = (await api('/api/ram/clubs')).clubs;
        const want = LS.get('ram-club'),
          c = R.clubs.find(x => x.id === want) || R.clubs[0];
        if (c) await start(c.id);
      }
    } catch (x) {
      console.warn('/RAM Club : démarrage', x.message);
      if (R.user === undefined) R.user = null;
    }
    readyFn();
    if (!R.live) {
      render(true);
      fill();
    }
  })();
})();
