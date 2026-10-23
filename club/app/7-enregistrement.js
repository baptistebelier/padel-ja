/* /RAM Club — app/7-enregistrement.js : Enregistrement de tous les formulaires envoyés.
   Morceau de l'ancien app.js : les fichiers app/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target,
    val = id => {
      const x = $(id);
      return x ? x.value.trim() : '';
    },
    g = id => esc(val(id)),
    home = msg => {
      closeSheet();
      S.tab = 'home';
      S.stack = [];
      render();
      toast(msg);
    };
  if (f.id === 'composer') {
    const inp = $('msg-input'),
      x = inp.value.trim(),
      img = S.img;
    if (!x && !img) return;
    const v = view(),
      c = v.v === 'chan' ? chans.find(c => c.id === v.id) : null,
      list = v.v === 'rec' ? recs.find(r => r.id === v.id).chat : c && c.msgs;
    if (!list) return;
    list.push({ by: c && c.ro && isAdmin() ? 'club' : ME(), x, img, t: "À l'instant", rep: S.reply || undefined });
    S.img = null;
    S.reply = null;
    showAtt();
    inp.value = '';
    S.sent = true;
    render(true);
    S.sent = false;
    $('main').scrollTop = $('main').scrollHeight;
    inp.focus();
    return;
  }
  if (f.id === 'com-form') {
    const x = val('com-input');
    if (!x) return;
    const p = posts.find(p => p.id === f.dataset.id);
    p.com.push({ by: ME(), x, _pop: 1, t: "À l'instant" });
    sheet('Commentaires', commentsBody(p), true);
    const l = $('com-list');
    l.scrollTop = l.scrollHeight;
    render(true);
    return;
  }
  if (f.id === 'edit-form') {
    const p = posts.find(p => p.id === f.dataset.id);
    if (p.kind === 'poll') p.q = g('e-title');
    else {
      p.title = g('e-title');
      p.body = g('e-body');
      if ($('e-place')) p.place = g('e-place');
      if ($('e-noimg') && $('e-noimg').checked) delete p.img;
      if (S.img) p.img = S.img;
      S.img = null;
    }
    closeSheet();
    render(true);
    toast('Publication modifiée');
    return;
  }
  if (f.id === 'done-form') {
    const i = posts.findIndex(p => p.id === f.dataset.id),
      p = posts[i],
      n = Math.min(S.imgs.length, 10);
    p.done = { txt: g('d-txt'), photos: S.imgs.slice(0, 10) };
    S.imgs = [];
    p.t = "À l'instant";
    posts.splice(i, 1);
    posts.unshift(p);
    home(`Événement terminé · publié sur le mur${n ? ' avec ' + n + ' photo' + (n > 1 ? 's' : '') : ''}`);
    return;
  }
  if (f.id === 'start-form') {
    const r = recs.find(r => r.id === f.dataset.r),
      gr = grp(r.tid),
      T2 = gr.mem.filter(p => r.lineup[p] === 'T'),
      pad = recSport(r) === 'Padel',
      last = p => M[p].n.split(' ').slice(1).join(' ') || M[p].n;
    r.ms = pad
      ? Array.from({ length: Math.ceil(T2.length / 2) }, (_, i) => ({
          l: 'Double ' + (i + 1),
          an: T2.slice(i * 2, i * 2 + 2)
            .map(last)
            .join(' / '),
          b: [val('so-' + i) || 'Paire adverse ' + (i + 1), ''],
          sets: [],
          st: 'soon'
        }))
      : T2.map((p, i) => ({
          l: 'Simple ' + (i + 1),
          a: p,
          b: [val('so-' + i) || 'Adversaire ' + (i + 1), ''],
          sets: [],
          st: 'soon'
        })).concat(
          T2.length >= 2
            ? [
                {
                  l: 'Double',
                  an: T2.slice(0, 2).map(last).join(' / '),
                  b: [val('so-d') || 'Paire adverse', ''],
                  sets: [],
                  st: 'soon'
                }
              ]
            : []
        );
    r.stb = val('so-stb').startsWith('Super');
    r.ms.slice(0, 2).forEach(m => {
      m.st = 'live';
      m.sets = [[0, 0]];
    });
    r.st = 'live';
    r.chat = [];
    S.scoring = true;
    closeSheet();
    render();
    liveNote(
      r,
      `Début de la rencontre contre ${r.opp}`,
      r.ms
        .filter(m => m.st === 'live')
        .map(m => `${m.l} : ${ours(m)}`)
        .join(' · '),
      'start'
    );
    return;
  }
  if (f.id === 'me-form') {
    const me = M[ME()];
    me.n = val('e-name') || me.n;
    me.lic = (val('e-lic') || '').replace(/\s+/g, '').toUpperCase();
    if (window.ramProfileSync) ramProfileSync({ name: me.n, licence: me.lic });
    me.g = val('e-g') === 'Femme' ? 'F' : 'H';
    if (val('e-bd')) me.bd = val('e-bd');
    MYCT.tel[2] = val('e-tel');
    MYCT.mail[2] = val('e-mail');
    MYCT.soc[1] = val('e-net');
    MYCT.soc[2] = val('e-soc');
    closeSheet();
    render(true);
    toast('Informations mises à jour');
    return;
  }
  if (f.id === 'kid-form') {
    const id = 'k' + Date.now(),
      gr = GROUPS.find(x => x.name === val('k-grp'));
    M[id] = {
      n: g('k-name'),
      r: 'NC',
      role: 'Jeune',
      team: gr.name,
      fol: 0,
      g: val('k-g') === 'Fille' ? 'F' : 'H',
      bd: val('k-bd'),
      parent: ME(),
      photoOk: false,
      res: []
    };
    (M[ME()].kids = M[ME()].kids || []).push(id);
    gr.mem.push(id);
    closeSheet();
    render(true);
    toast(`Compte jeune créé · ${first(id)} rejoint ${gr.name}`);
    return;
  }
  if (f.id === 'look-form') {
    (S.setup = S.setup || {}).look = true;
    const c = club(),
      acc = $('lk-acc').value,
      dark = val('lk-bg') === 'Sombre',
      dv = derive(acc, BASE[dark].bg);
    ['bg', 'card', 'card2', 'line', 'fg', 'muted'].forEach(k => delete c[k]);
    Object.assign(c, {
      name: val('lk-name') || c.name,
      short: (val('lk-short') || c.short).slice(0, 4).toUpperCase(),
      accent: dv.col,
      accent2: $('lk-acc2').value,
      dark
    });
    if (S.img) c.logo = S.img;
    if (S.logoL) c.logoL = S.logoL;
    if (S.logoD) c.logoD = S.logoD;
    if ($('lk-ll-x') && $('lk-ll-x').checked) delete c.logoL;
    if ($('lk-ld-x') && $('lk-ld-x').checked) delete c.logoD;
    S.img = S.logoL = S.logoD = null;
    setTheme(S.club);
    closeSheet();
    render(true);
    toast(
      dv.adj ? `Appliqué avec la couleur ajustée ${dv.col} pour rester lisible` : `Appli aux couleurs de ${c.name}`
    );
    return;
  }
  if (f.id === 'info-form') {
    (S.setup = S.setup || {}).info = true;
    const I2 = CLUBINFO;
    I2.courts = +val('i-courts');
    I2.pistes = +val('i-pistes');
    I2.house = g('i-house');
    I2.secr = g('i-secr');
    I2.addr = g('i-addr');
    FORM.forEach((x, i) => {
      x[0] = g('i-fn' + i) || x[0];
      x[2] = g('i-fp' + i) || x[2];
    });
    I2.book = esc(toUrl(val('i-book')));
    I2.pay = esc(toUrl(val('i-pay')));
    I2.shop = esc(toUrl(val('i-shop')));
    I2.mods = { actus: $('i-actus').checked, comm: $('i-comm').checked, bar: $('i-bar').checked };
    I2.barCut = parseInt(val('i-cut'), 10) || 20;
    closeSheet();
    render(true);
    toast('Infos du club mises à jour');
    return;
  }
  if (f.id === 'abs-form') {
    const [gid, iso] = val('abs-s').split('|'),
      gr = grp(gid),
      k = f.dataset.k;
    gr.abs = gr.abs || {};
    gr.abs[iso] = gr.abs[iso] || [];
    if (!gr.abs[iso].includes(k)) gr.abs[iso].push(k);
    gr.resp = gr.resp || {};
    (gr.resp[iso] = gr.resp[iso] || {})[k] = 'no';
    closeSheet();
    render(true);
    toast(`Absence signalée · ${name(gr.coach)} est prévenu${M[gr.coach].g === 'F' ? 'e' : ''}`);
    return;
  }
  if (f.id === 'p2-form') {
    closeSheet();
    toast(`Invitation envoyée à ${val('p2-mail')}`);
    return;
  }
  if (f.id === 'kdel-form') {
    closeSheet();
    toast(`Demande enregistrée : le compte de ${first(f.dataset.k)} sera supprimé sous 30 jours`);
    return;
  }
  if (f.id === 'del-form') {
    closeSheet();
    toast('Demande enregistrée. Dans la vraie appli, ton compte serait supprimé sous 30 jours.');
    return;
  }
  if (f.id === 'season-form') {
    const y1 = +val('y1'),
      y2 = +val('y2'),
      old = S.season;
    if (y2 !== y1 + 1) {
      toast('Une saison couvre deux années qui se suivent');
      return;
    }
    const inv = typeof seasonTrophies === 'function' ? seasonTrophies(old) : 0;
    GROUPS.forEach(gr => {
      if (gr.final) {
        (gr.hist = gr.hist || []).push(gr.final);
        delete gr.final;
      }
    });
    let n = 0;
    arts.forEach(a => {
      if (!a.arch) {
        a.arch = old;
        n++;
      }
    });
    recs.forEach(r => {
      if (!r.arch && r.st === 'done') {
        r.arch = old;
        n++;
      }
    });
    posts.forEach(p => {
      if (!p.arch && p.kind === 'event') {
        p.arch = old;
        n++;
      }
    });
    S.season = y1 + '-' + y2;
    newSeason(old);
    S.arch = { s: old, t: 'arts' };
    closeSheet();
    S.tab = 'club';
    S.clubTab = 'club';
    S.stack = [{ v: 'archive' }];
    render();
    toast(
      `Saison ${old} clôturée · ${n} éléments archivés${inv ? ` · trophée Invaincu pour ${inv} joueur${inv > 1 ? 's' : ''}` : ''} · saison ${S.season} lancée : le mur, les groupes, les équipes et les palmarès repartent de zéro · chaque adhérent doit faire revalider son accès`
    );
    return;
  }
  if (f.id === 'rimg-form') {
    const r = recs.find(r => r.id === f.dataset.id);
    if ($('r-noimg') && $('r-noimg').checked) {
      delete r.img;
      closeSheet();
      render(true);
      toast('Photo retirée');
      return;
    }
    if (!S.img) {
      toast('Choisis une photo');
      return;
    }
    r.img = S.img;
    S.img = null;
    closeSheet();
    render(true);
    toast('Photo ajoutée au résultat de la rencontre');
    return;
  }
  if (f.id === 'tf-form') {
    const gr = grp(f.dataset.id),
      fm = val('tf-fmt'),
      tm = f.querySelector('input[name="tm"]:checked').value,
      F2 = {
        season: S.season,
        fmt: fm,
        pp: val('tf-pp'),
        pn: +val('tf-pn'),
        tm,
        tp: val('tf-tp'),
        ts: val('tf-ts'),
        out: val('tf-out'),
        div: val('tf-out') === 'Maintien' ? '' : val('tf-div'),
        txt: val('tf-txt'),
        from: gr.sub,
        champ: champOf(gr).name
      };
    if (fm !== 'Tableau final' && PLACES.indexOf(F2.pp) + 1 > F2.pn) {
      toast("La place en poule dépasse le nombre d'équipes");
      return;
    }
    gr.final = F2;
    const i = posts.findIndex(p => p.kind === 'teamfinal' && p.tid === gr.id && !p.arch);
    if (i >= 0) posts.splice(i, 1);
    posts.unshift({
      id: 'p' + Date.now(),
      by: 'club',
      t: "À l'instant",
      kind: 'teamfinal',
      tid: gr.id,
      final: F2,
      sport: champOf(gr).sport,
      likes: 0,
      com: []
    });
    const won =
        F2.out === 'Montée' ||
        (fm !== 'Tableau final' && F2.pp === '1er' && fm === 'Poule') ||
        (fm !== 'Poule' && (tm === 'place' ? F2.tp === '1er' : F2.ts === 'Vainqueur')),
      nc = won && typeof teamChampion === 'function' ? teamChampion(gr) : 0;
    home(
      `Championnat clôturé · résultat publié sur le mur${nc ? ` · trophée Champion pour ${nc} joueur${nc > 1 ? 's' : ''}` : ''}`
    );
    return;
  }
  if (f.id === 'rank-form') {
    const me = M[ME()],
      tn = f.dataset.k === 'tennis';
    let title, body;
    if (tn) {
      const o = me.r,
        n = val('r-new');
      if (o === n) {
        closeSheet();
        return;
      }
      me.r = n;
      title = `Classement tennis <em>${n === 'NC' ? 'non classé' : n}</em>`;
      body = `${first(ME())} passe de ${o} à ${n}.`;
    } else {
      const num = val('r-pad').replace(/\D/g, ''),
        lv = val('r-pl'),
        np = num ? +num : null,
        nl = lv === 'Aucun' ? null : LV.indexOf(lv) + 1;
      if (np === (me.pad || null) && nl === (me.pl || null)) {
        closeSheet();
        return;
      }
      me.pad = np;
      me.pl = nl;
      // la fiche joueur /RAM JA reprend le classement padel (vu par les juges-arbitres)
      if (window.ramPlayerSync) ramPlayerSync({ rank: np ? String(np) : '' }).catch(() => {});
      title = `Classement padel <em>${np ? 'n° ' + np : 'non classé'}</em>`;
      body = np
        ? `${first(ME())} est désormais n° ${np} au classement padel${nl ? ', niveau ' + nl : ''}.`
        : `${first(ME())} n'est pas classé en padel${nl ? ', niveau ' + nl : ''}.`;
    }
    posts.unshift({
      id: 'p' + Date.now(),
      by: ME(),
      t: "À l'instant",
      kind: 'annonce',
      sport: tn ? 'Tennis' : 'Padel',
      title,
      body,
      likes: 0,
      com: []
    });
    closeSheet();
    render(true);
    toast(`Classement mis à jour · ${me.fol} abonnés notifiés`);
    return;
  }
  if (f.id === 'pres-form') {
    const me = M[ME()],
      ext = f.querySelector('input[name="pt"]:checked').value === 'ext',
      d = val('pr-d');
    if (d > TODAY) {
      toast('La date du tournoi est dans le futur');
      return;
    }
    if (ext && !val('pr-ext')) {
      toast('Indique le nom et le prénom de ton partenaire');
      return;
    }
    const r = {
      place: val('pr-place'),
      cat: val('pr-cat'),
      pub: val('pr-pub'),
      age: g('pr-age'),
      d,
      club: g('pr-club'),
      pid: ext ? null : val('pr-mate') || null,
      ext: ext ? g('pr-ext') : null
    };
    (me.pres = me.pres || []).unshift(r);
    if (r.pid) {
      const m2 = M[r.pid];
      (m2.pres = m2.pres || []).unshift({ ...r, pid: ME(), ext: null });
    }
    posts.unshift({
      id: 'p' + Date.now(),
      by: ME(),
      t: "À l'instant",
      kind: 'padel',
      sport: 'Padel',
      pres: r,
      likes: 0,
      com: []
    });
    S.palm = 'padel';
    home(
      `Résultat publié${r.pid ? ' · ajouté aussi au palmarès de ' + first(r.pid) : ''} · ${me.fol} abonnés notifiés`
    );
    return;
  }
  if (f.id === 'res-form') {
    const me = M[ME()],
      sets = [1, 2, 3]
        .map(n => [val('s' + n + 'a'), val('s' + n + 'b')])
        .filter(s => s[0] !== '' && s[1] !== '')
        .map(s => [+s[0], +s[1]]);
    if (sets.length < 2) {
      toast('Indique au moins les deux premiers sets');
      return;
    }
    const bad = sets.findIndex(s => !setOk(s[0], s[1]));
    if (bad >= 0) {
      toast(`Le ${bad + 1}${bad ? 'e' : 'er'} set est impossible : un set se termine 6-0 à 6-4, 7-5 ou 7-6`);
      return;
    }
    let mine = 0,
      theirs = 0;
    sets.forEach(s => (s[0] > s[1] ? mine++ : theirs++));
    if (sets.length === 2 && mine === 1) {
      toast('Un set partout : ajoute le 3e set');
      return;
    }
    if (sets.length === 3 && sets[0][0] > sets[0][1] === sets[1][0] > sets[1][1]) {
      toast('Le match était déjà gagné en deux sets : retire le 3e');
      return;
    }
    const w = mine > theirs ? 1 : 0,
      or = val('r-rank'),
      perf = !!w && rIdx(or) > rIdx(me.r),
      nm = val('r-name'),
      r = {
        w,
        opp: val('r-opp'),
        or,
        sc: sets.map(s => s.join('-')).join(' '),
        ctx: val('r-ctx') + (nm ? ' · ' + nm : ''),
        perf,
        fin: !!($('r-fin') && $('r-fin').checked)
      };
    me.res.unshift(r);
    posts.unshift({ id: 'p' + Date.now(), by: ME(), t: "À l'instant", kind: 'perf', res: r, likes: 0, com: [] });
    home(perf ? `Perf à ${or} publiée · ${me.fol} abonnés notifiés` : `Résultat publié · ${me.fol} abonnés notifiés`);
    return;
  }
  if (f.id === 'adm-form') {
    const k = f.dataset.k,
      cid = f.dataset.c,
      V2 = $('v-pub')
        ? readVis()
        : { vis: [], rule: null, sport: $('v-sport') && val('v-sport') !== 'Tennis et padel' ? val('v-sport') : '' },
      img = S.img,
      base = {
        id: 'p' + Date.now(),
        by: 'club',
        t: "À l'instant",
        likes: 0,
        com: [],
        sport: V2.sport,
        vis: V2.vis,
        rule: V2.rule
      };
    if (k === 'annonce') {
      posts.unshift({ ...base, kind: 'annonce', title: g('a-title'), body: g('a-body'), img });
      S.img = null;
      home(
        V2.vis.length
          ? 'Annonce publiée · adhérents concernés notifiés'
          : 'Annonce publiée · tous les adhérents notifiés'
      );
      return;
    }
    if (k === 'event' || k === 'stage') {
      const reg = f.querySelector('input[name="a-reg"]:checked').value,
        d1 = val('a-d1'),
        d2 = val('a-d2'),
        one = $('a-same').checked || !d2 || d2 === d1,
        cp = val('ev-cap');
      if (d1 < TODAY) {
        toast('Cette date est déjà passée');
        return;
      }
      if (!one && d2 < d1) {
        toast('La date de fin est avant la date de début');
        return;
      }
      if (hMin(val('a-h2')) <= hMin(val('a-h1'))) {
        toast("L'heure de fin doit être après l'heure de début");
        return;
      }
      posts.unshift({
        ...base,
        ...(k === 'stage' ? { stage: true, by: S.role === 'coach' ? ME() : 'club' } : {}),
        kind: 'event',
        reg,
        title: g('a-title'),
        d: d1,
        d2: one ? '' : d2,
        h1: val('a-h1'),
        h2: val('a-h2'),
        date: (one ? fmtD(d1) : `Du ${fmtD(d1, 1)} au ${fmtD(d2, 1)}`) + ' · ' + val('a-h1') + ' – ' + val('a-h2'),
        place: g('a-place'),
        body: g('a-body'),
        img,
        yes: 0,
        maybe: 0,
        my: null,
        ins: [],
        cap: reg === 'int' && cp !== 'Sans limite' ? +cp : 0,
        tenup: esc(toUrl(val('a-ten'))),
        pay: esc(toUrl(val('a-pay')))
      });
      S.img = null;
      home(
        reg === 'int'
          ? "Événement publié · inscriptions ouvertes dans l'appli"
          : "Événement publié · inscription sur Ten'Up"
      );
      return;
    }
    if (k === 'comm') {
      const id = 'cm' + Date.now(),
        r = val('a-cap');
      COMMS.push({ id, name: g('a-title'), desc: g('a-body'), resp: r, mem: [r], req: [] });
      closeSheet();
      S.dir = 1;
      S.stack.push({ v: 'comm', id });
      render();
      toast('Commission créée');
      return;
    }
    if (k === 'commpromo') {
      posts.unshift({
        ...base,
        kind: 'comm',
        comm: cid,
        title: g('a-title'),
        body: g('a-body'),
        img,
        yes: 0,
        maybe: 0,
        my: null
      });
      S.img = null;
      home('Commission mise en avant sur le mur');
      return;
    }
    if (k === 'partner') {
      PARTNERS.push({ id: 'pa' + Date.now(), name: g('a-title'), desc: g('a-body'), logo: img || null });
      S.img = null;
      closeSheet();
      render(true);
      toast('Partenaire ajouté');
      return;
    }
    if (k === 'ad') {
      const sel = [...f.querySelectorAll('input[name="ad-p"]:checked')].map(x => x.value);
      if (!sel.length) {
        toast('Coche au moins un partenaire');
        return;
      }
      posts.unshift({
        ...base,
        kind: 'ad',
        partners: sel,
        title: g('a-title') || 'Nos partenaires',
        color: val('ad-col') === 'Rouge' ? 'hot' : ''
      });
      home('Bandeau partenaires publié sur le mur');
      return;
    }
    if (k === 'tournoi') {
      const sp = val('tr-sport'),
        pad = sp === 'Padel',
        pub = val('tr-pub'),
        d1 = val('a-d1'),
        d2 = val('a-d2'),
        one = $('a-same').checked || !d2 || d2 === d1,
        dl = val('tr-dl'),
        a1 = parseInt(val('tr-a1')),
        a2 = parseInt(val('tr-a2')),
        open = pad || $('tr-open').checked,
        lo = val('tr-lo'),
        hi = val('tr-hi'),
        mx = val('tr-max');
      if (!one && d2 < d1) {
        toast('La date de fin est avant la date de début');
        return;
      }
      if (d1 < TODAY) {
        toast('Cette date est déjà passée');
        return;
      }
      if (dl > d1) {
        toast('La fin des inscriptions doit être avant le début du tournoi');
        return;
      }
      if (pub === 'Jeunes' && a1 > a2) {
        toast("L'âge minimum est plus grand que l'âge maximum");
        return;
      }
      const trn = {
        sport: sp,
        gen: val('tr-gen'),
        pub,
        a1,
        a2,
        vet: val('tr-vet-s'),
        fmt: pad ? '' : val('tr-fmt').split(' (')[0],
        open,
        lo: RANKS[Math.min(rIdx(lo), rIdx(hi))],
        hi: RANKS[Math.max(rIdx(lo), rIdx(hi))],
        cat: pad ? val('tr-cat') : '',
        max: mx === 'Sans limite' ? 0 : +mx,
        dl
      };
      posts.unshift({
        ...base,
        sport: sp,
        kind: 'event',
        reg: 'ext',
        trn,
        tenup: esc(toUrl(val('tr-url'))),
        title: g('a-title'),
        d: d1,
        d2: one ? '' : d2,
        h1: val('a-h1'),
        h2: '20 h',
        date: (one ? fmtD(d1) : `Du ${fmtD(d1, 1)} au ${fmtD(d2, 1)}`) + ' · ' + val('a-h1'),
        place: g('a-place'),
        body: g('a-body'),
        img
      });
      S.img = null;
      home("Tournoi publié · inscriptions sur Ten'Up");
      return;
    }
    if (k === 'cta') {
      let u = val('a-url');
      if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
      posts.unshift({
        ...base,
        kind: 'cta',
        title: g('a-title'),
        body: g('a-body'),
        label: g('a-label'),
        url: esc(u),
        img
      });
      S.img = null;
      home('Publication en ligne · adhérents concernés notifiés');
      return;
    }
    if (k === 'poll') {
      const o = [1, 2, 3, 4, 5, 6].map(n => g('a-o' + n)).filter(Boolean);
      if (new Set(o.map(x => x.toLowerCase())).size < o.length) {
        toast('Deux réponses sont identiques : modifie-en une');
        return;
      }
      const cl = val('a-close');
      if (cl && cl < TODAY) {
        toast('La date de clôture est déjà passée');
        return;
      }
      posts.unshift({ ...base, kind: 'poll', q: g('a-title'), opts: o.map(t => [t, 0]), my: null, close: cl || '' });
      home('Sondage publié · adhérents concernés notifiés');
      return;
    }
    if (k === 'article') {
      const a = {
        id: 'a' + Date.now(),
        img,
        sport: V2.sport,
        cat: val('a-cat'),
        title: g('a-title'),
        date: "Aujourd'hui",
        lead: g('a-lead'),
        body: g('a-body').split(/\n+/).filter(Boolean)
      };
      arts.unshift(a);
      posts.unshift({ ...base, kind: 'journal', art: a.id });
      S.img = null;
      home('Actu publiée');
      return;
    }
    if (k === 'chan') {
      const id = 'ch' + Date.now(),
        gg = { 'Club': 'club', 'Entraînements': 'train', 'Équipes': 'team' }[val('c-g')];
      chans.push({
        id,
        g: gg,
        name: g('a-title'),
        desc: g('a-body'),
        ro: $('c-ro').checked ? 1 : 0,
        un: 0,
        msgs: [{ by: 'club', x: 'Groupe ouvert. Bienvenue !', t: "À l'instant" }]
      });
      closeSheet();
      S.tab = 'chans';
      S.chanTab = gg;
      S.stack = [];
      render();
      toast('Groupe de discussion créé');
      return;
    }
    if (k === 'champ') {
      const id = 'c' + Date.now();
      CHAMPS.push({
        id,
        name: g('a-title'),
        sport: val('a-sport'),
        age: val('a-age'),
        season: g('a-season') || 'Saison ' + S.season
      });
      closeSheet();
      S.dir = 1;
      S.stack.push({ v: 'champ', id });
      render();
      toast('Championnat créé · ajoute ses équipes');
      return;
    }
    if (k === 'team' || k === 'train') {
      const id = 'g' + Date.now(),
        nm = g('a-title');
      const o =
        k === 'team'
          ? {
              id,
              type: k,
              champ: cid,
              name: nm,
              gen: val('a-gen'),
              sub: g('a-sub'),
              cap: val('a-cap'),
              mem: [val('a-cap')]
            }
          : {
              id,
              type: k,
              name: nm,
              sport: val('t-sport'),
              day: DAYS.indexOf(val('t-day')),
              h: val('a-h1'),
              dur: val('t-dur'),
              coach: val('t-coach'),
              defLoc: val('t-loc'),
              gen: val('a-gen'),
              lo: val('v-lo'),
              hi: val('v-hi'),
              sub: val('t-day') + ' ' + val('a-h1') + ' · ' + val('t-dur') + ' · ' + first(val('t-coach')),
              mem: []
            };
      GROUPS.push(o);
      chans.push({
        id,
        g: k,
        sport: k === 'team' ? champOf(o).sport : o.sport,
        name: k === 'team' ? teamName(o) : nm,
        desc: o.sub,
        kid: (o.mem || []).some(isMinor) ? 1 : 0,
        un: 0,
        msgs: [{ by: 'club', x: 'Canal ouvert. Bienvenue à tous !', t: "À l'instant" }]
      });
      closeSheet();
      S.dir = 1;
      S.stack.push({ v: k === 'team' ? 'team' : 'grp', id });
      render();
      toast(`${nm} créé · son canal de discussion est ouvert`);
      return;
    }
    if (k === 'fixture') {
      const tm = grp(cid);
      if (tm.final) {
        closeSheet();
        toast("Ce championnat est clôturé : impossible d'ajouter une rencontre");
        return;
      }
      recs.push({
        id: 'r' + Date.now(),
        d: val('a-d1'),
        h: val('a-h1'),
        tid: cid,
        opp: g('a-opp'),
        comp: tm.sub + (val('a-comp') ? ' · ' + g('a-comp') : ''),
        when: fmtD(val('a-d1')) + ' · ' + val('a-h1') + ' · ' + val('a-loc').toLowerCase(),
        st: 'soon',
        lineup: {},
        conv: {}
      });
      closeSheet();
      render(true);
      toast("Rencontre ajoutée au calendrier · l'équipe est prévenue");
      return;
    }
    if (k === 'play') {
      const pad = val('p-sport') === 'Padel',
        fmt = pad ? 'Double' : val('a-fmt'),
        others = adults().filter(x => x !== ME());
      let lo, hi, n, txt;
      if (pad) {
        const a = LV.indexOf(val('l-lo')) + 1,
          b = LV.indexOf(val('l-hi')) + 1;
        lo = Math.min(a, b);
        hi = Math.max(a, b);
        n = others.filter(x => M[x].pl >= lo && M[x].pl <= hi).length;
        txt = 'de niveau ' + lo + ' à ' + hi;
      } else {
        const a = rIdx(val('v-lo')),
          b = rIdx(val('v-hi')),
          i0 = Math.min(a, b),
          i1 = Math.max(a, b);
        lo = RANKS[i0];
        hi = RANKS[i1];
        n = others.filter(x => rIdx(M[x].r) >= i0 && rIdx(M[x].r) <= i1).length;
        txt = 'de ' + lo + ' à ' + hi;
      }
      posts.unshift({
        id: 'p' + Date.now(),
        by: ME(),
        t: "À l'instant",
        kind: 'play',
        likes: 0,
        com: [],
        play: {
          sport: pad ? 'Padel' : 'Tennis',
          date: fmtD(val('a-d1')),
          time: val('a-h1'),
          dur: val('a-dur'),
          fmt,
          lo,
          hi,
          places: fmt === 'Simple' ? 1 : +val('a-pl'),
          in: [],
          wait: []
        }
      });
      home(`Recherche publiée · visible par ${n} adhérent${n > 1 ? 's' : ''} ${txt}`);
      return;
    }
  }
});
