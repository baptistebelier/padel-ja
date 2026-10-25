/* /RAM Club — app/5-actions.js : Table des actions (A) : chaque bouton data-a="…" de l'appli.
   Morceau de l'ancien app.js : les fichiers app/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
/* ---------- actions ---------- */
const A = {
  tab(d) {
    const o = ['home', 'chans', 'agenda', 'ecole', 'club', 'me'];
    S.dir = d.t === S.tab && !S.stack.length ? 0 : S.stack.length || o.indexOf(d.t) < o.indexOf(S.tab) ? -1 : 1;
    S.tab = d.t;
    S.stack = [];
    render();
  },
  back() {
    S.dir = -1;
    S.stack.pop();
    render();
  },
  open(d) {
    closeSheet();
    S.dir = 1;
    S.stack.push({ v: d.v, id: d.id });
    if (d.v === 'chan') chans.find(c => c.id === d.id).un = 0;
    if (d.v === 'grp') S.grpAll = false;
    render();
  },
  goClub(d) {
    S.dir = 1;
    S.tab = 'club';
    S.clubTab = d.t;
    S.stack = [];
    render();
  },
  member(d) {
    closeSheet();
    if (d.id === ME()) {
      A.tab({ t: 'me' });
      return;
    }
    S.dir = 1;
    S.stack.push({ v: 'member', id: d.id });
    render();
  },
  admin() {
    closeSheet();
    S.dir = 1;
    S.stack.push({ v: 'admin' });
    render();
  },
  seg(d, el) {
    if (S[d.k] === d.val) return;
    if (el) {
      const b = [...el.parentNode.children];
      S.dir = b.indexOf(el) > b.findIndex(x => x.getAttribute('aria-selected') === 'true') ? 1 : -1;
    }
    S[d.k] = d.val;
    render();
  },
  close() {
    closeSheet();
  },
  toast(d) {
    toast(d.msg);
  },
  like(d) {
    if (S.liked.has(d.id)) S.liked.delete(d.id);
    else {
      S.liked.add(d.id);
      S.pop = d.id;
    }
    render(true);
    S.pop = null;
  },
  comments(d) {
    sheet('Commentaires', commentsBody(posts.find(p => p.id === d.id)));
  },
  follow(d) {
    if (isMinor(d.id)) return;
    const on = !S.follow.has(d.id);
    on ? S.follow.add(d.id) : S.follow.delete(d.id);
    render(true);
    toast(
      on
        ? `Tu suis ${first(d.id)} : tu seras notifié de ses résultats et de ses messages`
        : `Tu ne suis plus ${first(d.id)}`
    );
  },
  notifs() {
    if (pending()) {
      toast("Les notifications s'ouvriront quand le club aura validé ton accès");
      return;
    }
    // les nouvelles (non lues) en haut, puis l'historique déjà lu ; toutes passent en « lues » à l'ouverture
    const row = (n, i) => {
      const r = n.conv && recs.find(x => x.id === n.conv),
        c = r && r.conv && r.conv[ME()],
        who =
          n.tier != null || n.frame
            ? `<span class="medal t${Math.max(0, n.tier || 0)}">${ic('trophy')}</span>`
            : av(n.by, 'sm');
      return r && r.st === 'soon' && r.lineup && r.lineup[ME()]
        ? `<div class="msg nrow">${who}<span class="grow"><span class="nm">${name(n.by)}</span> ${n.txt}<br><time>${ago(n)}</time><span class="ctl" style="margin-top:8px"><button class="btn sm grow ${c === 'ok' ? '' : 'ghost'}" data-a="conv" data-r="${r.id}" data-s="ok">Je suis dispo</button><button class="btn sm grow ${c === 'no' ? 'hot' : 'ghost'}" data-a="conv" data-r="${r.id}" data-s="no">Pas dispo</button></span><button class="nm" data-a="ngo" data-i="${i}" style="color:var(--accent)">Voir la rencontre</button></span></div>`
        : `<button class="msg nrow ${n.n ? 'unread' : ''}" data-a="ngo" data-i="${i}">${who}<span class="grow">${n.tier != null || n.frame ? '' : `<span class="nm">${name(n.by)}</span> `}${n.tier != null || n.frame ? esc(n.txt) : n.txt}<br><time>${ago(n)}</time></span>${n.n ? '<span class="st no">Nouveau</span>' : ''}</button>`;
    };
    const vis = NOTIFS.map((n, i) => [n, i]).filter(([n]) => !S.blocked.has(n.by) && nVis(n)),
      fresh = vis.filter(([n]) => n.n),
      old = vis.filter(([n]) => !n.n),
      part = (t, l) =>
        l.length ? `<span class="kicker nsec">${t}</span>${l.map(([n, i]) => row(n, i)).join('')}` : '';
    sheet(
      'Notifications',
      `<div class="body">${
        vis.length
          ? part(`Nouvelles · ${fresh.length}`, fresh) +
            part(fresh.length ? 'Déjà lues' : 'Dernières notifications', old)
          : empty('bell', 'Aucune notification', 'Suis des adhérents pour être prévenu de leurs résultats.')
      }<div class="note">Les notifications des 7 derniers jours sont gardées (au moins les 20 dernières), sur tous tes appareils. Tu choisis ce que tu reçois dans ton profil, rubrique « Mes notifications ».</div></div>`
    );
    $('sheet').classList.add('side');
    NOTIFS.forEach(n => (n.n = 0));
    render(true);
  },
  commAsk(d) {
    const c = COMMS.find(c => c.id === d.id),
      me = ME(),
      i = c.req.indexOf(me);
    if (i >= 0) {
      c.req.splice(i, 1);
      render(true);
      toast('Demande annulée');
      return;
    }
    c.req.push(me);
    render(true);
    toast('Demande envoyée · le responsable, les membres et le bureau sont prévenus');
  },
  commReq(d) {
    const c = COMMS.find(c => c.id === d.id),
      i = c.req.indexOf(d.u);
    if (i >= 0) c.req.splice(i, 1);
    if (d.ok && !c.mem.includes(d.u)) c.mem.push(d.u);
    NOTIFS.forEach(n => {
      if (n.go && n.go.v === 'comm' && n.go.id === c.id && n.by === d.u) n.n = 0;
    });
    render(true);
    toast(
      d.ok ? `${first(d.u)} rejoint la ${c.name.toLowerCase()} · prévenu` : `Demande de ${first(d.u)} refusée · prévenu`
    );
  },
  commLeave(d) {
    const c = COMMS.find(c => c.id === d.id),
      i = c.mem.indexOf(ME());
    if (i >= 0) c.mem.splice(i, 1);
    render(true);
    toast(`Tu as quitté la ${c.name.toLowerCase()}`);
  },
  delPartner(d) {
    const i = PARTNERS.findIndex(x => x.id === d.id);
    if (i < 0) return;
    const x = PARTNERS.splice(i, 1)[0],
      ads = posts.filter(p => p.kind === 'ad').map(p => [p, p.partners.slice()]);
    ads.forEach(([p]) => (p.partners = p.partners.filter(y => y !== d.id)));
    render(true);
    toast('Partenaire retiré', () => {
      PARTNERS.splice(i, 0, x);
      ads.forEach(([p, l]) => (p.partners = l));
    });
  },
  ngo(d) {
    const n = NOTIFS[+d.i],
      g = n && n.go;
    closeSheet();
    if (!n) return;
    if (!g) {
      if (n.by !== 'club') A.member({ id: n.by });
      return;
    }
    if (g.v === 'ecole' || (g.v === 'agenda' && g.ag === 'cours')) {
      S.ecTab = 'mine';
      A.tab({ t: 'ecole' });
      return;
    }
    if (g.v === 'agenda') {
      A.tab({ t: 'agenda' });
      return;
    }
    const ok =
      g.v === 'rec'
        ? recs.some(r => r.id === g.id)
        : g.v === 'post'
          ? posts.some(p => p.id === g.id && (canSee(p) || p.arch))
          : g.v === 'chan'
            ? chans.some(c => c.id === g.id && chanOk(c))
            : true;
    if (ok) A.open(g);
    else toast("Ce contenu n'est plus disponible");
  },
  unattach() {
    S.img = null;
    showAtt();
    const i = $('m-img');
    if (i) i.value = '';
  },
  unreply() {
    S.reply = null;
    showAtt();
  },
  undo() {
    const f = undoFn;
    undoFn = null;
    document.querySelectorAll('.tst.on').forEach(x => {
      if (x.querySelector('.undo')) banHide(x);
    });
    if (f) {
      f();
      render(true);
      toast('Suppression annulée');
    }
  },
  cmenu(d) {
    const p = posts.find(p => p.id === d.id),
      c = p && p.com[+d.i];
    if (!c) return;
    const mine = c.by === ME(),
      at = `data-id="${p.id}" data-i="${d.i}"`,
      items = [
        (mine || isAdmin()) && ['trash', 'Supprimer le commentaire', 'cdel', at, 1],
        !mine && ['flag', 'Signaler ce commentaire', 'creport', at],
        !mine && c.by !== 'club' && ['block', 'Bloquer ' + first(c.by), 'block', `data-id="${c.by}"`, 1]
      ].filter(Boolean);
    sheet(
      'Commentaire',
      `<div class="body"><div class="reacts big">${['👍', '❤️', '😂', '👏', '🎾'].map(e => `<button class="react ${c.my === e ? 'on' : ''}" data-a="creact" ${at} data-e="${e}" aria-label="Réagir avec ${e}">${e}</button>`).join('')}</div><div class="menu">${items.map(i => `<button class="${i[4] ? 'danger' : ''}" data-a="${i[2]}" ${i[3] || ''}>${ic(i[0])}${i[1]}</button>`).join('')}</div></div>`
    );
  },
  creact(d) {
    const p = posts.find(p => p.id === d.id),
      c = p && p.com[+d.i];
    if (!c) return;
    c.re = c.re || {};
    const e = d.e,
      was = c.my;
    if (was) {
      c.re[was]--;
      if (c.re[was] <= 0) delete c.re[was];
    }
    if (was === e) c.my = null;
    else {
      c.re[e] = (c.re[e] || 0) + 1;
      c.my = e;
    }
    sheet('Commentaires', commentsBody(p), true);
  },
  loc(d) {
    const g = grp(d.g);
    g.loc = g.loc || {};
    const nl = locOf(g, d.d) === 'En salle' ? 'Extérieur' : 'En salle';
    g.loc[d.d] = nl;
    NOTIFS.unshift({
      by: g.coach,
      txt: `${g.name} du ${fmtD(d.d)} : le cours aura lieu ${nl === 'En salle' ? 'en salle' : 'en extérieur'}`,
      t: "À l'instant",
      n: 1,
      go: { v: 'agenda', ag: 'cours' },
      to: g.mem.slice()
    });
    render(true);
    toast(
      `Cours du ${fmtD(d.d)} ${nl === 'En salle' ? 'en salle' : 'en extérieur'} · ${g.mem.length} élève${g.mem.length > 1 ? 's' : ''} et leurs parents notifiés`
    );
  },
  cresp(d) {
    const g = grp(d.g);
    g.resp = g.resp || {};
    const r = (g.resp[d.d] = g.resp[d.d] || {});
    r[d.u] = r[d.u] === d.s ? '' : d.s;
    if (r[d.u] !== 'no' && g.abs && g.abs[d.d]) g.abs[d.d] = g.abs[d.d].filter(x => x !== d.u);
    render(true);
    toast(
      r[d.u] === 'ok'
        ? "Présence confirmée · l'enseignant est prévenu"
        : r[d.u] === 'no'
          ? "Absence signalée · l'enseignant est prévenu"
          : 'Réponse retirée'
    );
  },
  cdel(d) {
    const p = posts.find(p => p.id === d.id),
      i = +d.i,
      c = p.com.splice(i, 1)[0];
    closeSheet();
    render(true);
    toast('Commentaire supprimé', () => p.com.splice(i, 0, c));
  },
  creport(d) {
    const p = posts.find(p => p.id === d.id),
      c = p.com[+d.i];
    REPORTS.push({ kind: 'com', author: c.by, by: ME(), excerpt: esc(c.x), com: c, pid: p.id });
    closeSheet();
    toast('Signalement envoyé au bureau du club');
  },
  react(d) {
    const l = msgList(d.ref),
      m = l && l[+d.i];
    if (!m) return;
    m.re = m.re || {};
    const e = d.e,
      was = m.my;
    if (was) {
      m.re[was]--;
      if (m.re[was] <= 0) delete m.re[was];
    }
    if (was === e) m.my = null;
    else {
      m.re[e] = (m.re[e] || 0) + 1;
      m.my = e;
    }
    if (!comBack(d.ref)) closeSheet();
    render(true);
  },
  reply(d) {
    const l = msgList(d.ref),
      m = l && l[+d.i];
    if (!m) return;
    S.reply = { by: m.by, x: m.x || 'Photo' };
    closeSheet();
    showAtt();
    const i = $('msg-input');
    if (i) i.focus();
  },
  pin(d) {
    const p = posts.find(p => p.id === d.id);
    p.pin = !p.pin;
    closeSheet();
    render(true);
    toast(p.pin ? 'Publication épinglée en haut du mur' : 'Publication détachée du haut du mur');
  },
  ics(d) {
    const p = posts.find(p => p.id === d.id),
      dt = s => s.replace(/-/g, ''),
      t = h => {
        const m = hMin(h);
        return String(Math.floor(m / 60)).padStart(2, '0') + String(m % 60).padStart(2, '0') + '00';
      },
      allDay = p.d2 || !p.h1;
    const body = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//RAM Club//FR',
      'BEGIN:VEVENT',
      'UID:' + p.id + '@appli-club',
      'DTSTAMP:' + dt(TODAY) + 'T000000Z',
      allDay ? 'DTSTART;VALUE=DATE:' + dt(p.d) : 'DTSTART:' + dt(p.d) + 'T' + t(p.h1),
      allDay ? 'DTEND;VALUE=DATE:' + dt(isoIn(1, p.d2 || p.d)) : 'DTEND:' + dt(p.d) + 'T' + t(p.h2 || p.h1),
      'SUMMARY:' + p.title.replace(/<[^>]+>/g, ''),
      'LOCATION:' + p.place,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
      a.download = 'evenement.ics';
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast("Ouvre le fichier pour l'ajouter à ton agenda");
    } catch (e) {
      toast("Ajout à l'agenda impossible ici");
    }
  },
  relance(d) {
    const r = recs.find(r => r.id === d.r),
      n = Object.keys(r.lineup || {}).filter(p => ((r.conv || {})[p] || 'wait') === 'wait').length;
    toast(`Relance envoyée à ${n} joueur${n > 1 ? 's' : ''}`);
  },
  recTab(d) {
    S.recTab = d.k;
    render(true);
  },
  planMine() {
    S.plan.mine = !S.plan.mine;
    render(true);
  },
  /* « Mon agenda » ou « Agenda du club » */
  planScope(d) {
    S.plan.scope = d.k;
    render(true);
  },
  clubInfo() {
    const I2 = CLUBINFO,
      num = a => a.map(String);
    sheet(
      'Infos du club',
      `<form class="body" id="info-form"><div class="two">${Sel('i-courts', 'Courts de tennis', num([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15]), String(I2.courts))}${Sel('i-pistes', 'Pistes de padel', num([0, 1, 2, 3, 4, 5, 6, 8]), String(I2.pistes))}</div>${F('i-house', 'Horaires du club-house', '', I2.house)}${F('i-secr', 'Horaires du secrétariat', '', I2.secr)}${F('i-addr', 'Adresse', '', I2.addr)}<span class="lb">Tarifs</span>${FORM.map((f, i) => `<div class="two">${O('i-fn' + i, 'Formule', '', f[0])}${O('i-fp' + i, 'Prix', '', f[2])}</div>`).join('')}${O('i-book', 'Lien de réservation des courts', 'https://…', I2.book)}${O('i-pay', 'Lien de paiement de la cotisation (HelloAsso…)', 'https://…', I2.pay)}${O('i-shop', 'Lien de la boutique', 'https://…', I2.shop)}<div class="fld"><span class="lb">Modules</span><label class="chk" for="i-actus"><input type="checkbox" id="i-actus" ${I2.mods.actus ? 'checked' : ''}>Actus (articles)</label><label class="chk" for="i-comm"><input type="checkbox" id="i-comm" ${I2.mods.comm ? 'checked' : ''}>Commissions</label><label class="chk" for="i-bar"><input type="checkbox" id="i-bar" ${I2.mods.bar ? 'checked' : ''}>Bar et club-house (carte, réservation des repas)</label>${Sel('i-cut', 'Réservations au bar jusqu’à la veille, à', ['12 h', '14 h', '16 h', '18 h', '19 h', '20 h', '21 h', '22 h'], (Number.isInteger(+I2.barCut) ? +I2.barCut : 20) + ' h')}${Sel('i-rate', 'Points bar gagnés par euro consommé', ['1', '2', '3', '4', '5', '10'], String(I2.barRate || 1))}<label class="chk" for="i-reset"><input type="checkbox" id="i-reset" ${I2.barReset ? 'checked' : ''}>Remettre les points bar à zéro à chaque saison (1er septembre)</label><p class="muted small">Un petit club peut masquer les modules dont il n'a pas besoin.</p></div><button class="btn full">Enregistrer</button></form>`
    );
  },
  readh() {
    const me = ME();
    if (JOINREQ.some(j => j.id === me)) return;
    JOINREQ.push({
      id: me,
      n: M[me].n,
      mail: (M[me].n || '').toLowerCase().replace(/[^a-z]+/g, '.') + '@exemple.fr',
      via: "une reprise d'adhésion"
    });
    NOTIFS.unshift({
      by: me,
      txt: `a repris son adhésion et demande à retrouver l'accès à l'appli pour la saison ${S.season}`,
      t: "À l'instant",
      n: 1,
      staff: 1,
      go: { v: 'join' }
    });
    render(true);
    toast('Demande envoyée · le bureau va réactiver ton accès');
  },
  revalid(d) {
    VALID[d.id] = S.season;
    NOTIFS.unshift({
      by: 'club',
      txt: `a validé ton adhésion pour la saison ${S.season} : tout l'appli t'est de nouveau ouverte`,
      t: "À l'instant",
      n: 1,
      to: [d.id],
      mine: 1
    });
    render(true);
    toast(`${first(d.id)} retrouve l'accès à l'appli pour ${S.season}`);
  },
  joinOk(d) {
    const j0 = JOINREQ[+d.i];
    if (j0 && j0.id && M[j0.id]) {
      JOINREQ.splice(+d.i, 1);
      A.revalid({ id: j0.id });
      return;
    }
    const j = JOINREQ.splice(+d.i, 1)[0],
      id = 'u' + Date.now();
    VALID[id] = S.season;
    M[id] = { n: j.n, r: 'NC', team: 'Nouvel adhérent', fol: 0, g: 'H', bd: '1990-01-01', res: [] };
    CLUBINFO.joined++;
    render(true);
    toast(`${j.n} a rejoint l'appli · prévenu par e-mail`);
  },
  joinNo(d) {
    const j = JOINREQ.splice(+d.i, 1)[0];
    render(true);
    toast(`Demande de ${j.n} refusée`);
  },
  impSend() {
    const n = (S.imp || []).length;
    S.invited = (S.invited || 0) + n;
    S.imp = null;
    render(true);
    toast(`${n} invitation${n > 1 ? 's' : ''} envoyée${n > 1 ? 's' : ''} par e-mail`);
  },
  kidVis(d) {
    M[d.id].resVis = d.v;
    render(true);
    toast(
      d.v === 'club'
        ? `Les résultats de ${first(d.id)} sont visibles par tout le club`
        : `Les résultats de ${first(d.id)} ne sont visibles que de son groupe et de ses encadrants`
    );
  },
  photoOk(d) {
    M[d.id].photoOk = !M[d.id].photoOk;
    render(true);
    toast(M[d.id].photoOk ? 'Autorisation photo donnée' : 'Autorisation photo retirée');
  },
  absence(d) {
    const k = d.id,
      ss = nextSessions(k, 3);
    if (!ss.length) {
      toast('Aucun cours à venir');
      return;
    }
    sheet(
      'Signaler une absence',
      `<form class="body" id="abs-form" data-k="${k}"><div class="fld"><label for="abs-s">Cours</label><select id="abs-s">${ss.map(s => `<option value="${s.g.id}|${s.iso}">${s.g.name} · ${fmtD(s.iso)} · ${s.g.h}</option>`).join('')}</select></div>${O('abs-why', 'Motif (facultatif)', 'Malade, voyage scolaire…')}<button class="btn full">Prévenir l'enseignant</button></form>`
    );
  },
  parent2(d) {
    sheet(
      'Inviter le second parent',
      `<form class="body" id="p2-form" data-k="${d.id}"><div class="fld"><label for="p2-mail">E-mail du second parent</label><input id="p2-mail" type="email" required autocomplete="off"></div><p class="muted small">Il recevra une invitation pour suivre ${first(d.id)} avec les mêmes droits que toi.</p><button class="btn full">Envoyer l'invitation</button></form>`
    );
  },
  kidDel(d) {
    sheet(
      'Supprimer le compte de ' + first(d.id),
      `<form class="body" id="kdel-form" data-k="${d.id}"><div class="note">Le compte, les résultats et les inscriptions de ${first(d.id)} seront supprimés sous 30 jours. Ses messages resteront affichés sous le nom « Ancien membre ».</div><div class="fld"><label class="chk" for="kdel-ok"><input type="checkbox" id="kdel-ok" required>Je confirme, en tant que représentant légal.</label></div><button class="btn full hot">Supprimer le compte</button></form>`
    );
  },
  att(d) {
    const g = grp(d.id);
    g.att = g.att || {};
    const a = (g.att[d.d] = g.att[d.d] || {}),
      v = d.s === '1';
    a[d.u] = a[d.u] === v ? undefined : v;
    render(true);
  },
  cancelCourse(d) {
    const g = grp(d.id);
    g.cancel = g.cancel || [];
    const i = g.cancel.indexOf(d.d),
      off = i < 0;
    if (off) g.cancel.push(d.d);
    else g.cancel.splice(i, 1);
    NOTIFS.unshift({
      by: g.coach,
      txt: `${g.name} du ${fmtD(d.d)} : ${off ? 'cours annulé' : 'cours rétabli'}`,
      t: "À l'instant",
      n: 1,
      go: { v: 'agenda', ag: 'cours' },
      to: g.mem.slice()
    });
    render(true);
    toast(
      off
        ? `Cours du ${fmtD(d.d)} annulé · ${g.mem.length} élève${g.mem.length > 1 ? 's' : ''} et leurs parents notifiés`
        : 'Cours rétabli · élèves et parents notifiés'
    );
  },
  grpBulk(d) {
    const g = grp(d.g),
      ids = d.ids.split(',').filter(Boolean);
    ids.forEach(x => {
      if (!g.mem.includes(x)) g.mem.push(x);
    });
    render(true);
    toast(
      `${ids.length} adhérent${ids.length > 1 ? 's' : ''} ajouté${ids.length > 1 ? 's' : ''} à ${g.name} et prévenu${ids.length > 1 ? 's' : ''}`
    );
  },
  plus() {
    if (pending()) {
      toast('Tu pourras publier dès que le club aura validé ton accès');
      return;
    }
    const st = isAdmin(),
      coach = S.role === 'coach',
      mng = st || S.role === 'cap',
      it = [
        ['score', 'Ajouter un résultat', 'result'],
        S.role !== 'kid' && ['search', 'Chercher une partie', 'newPost', 'data-k="play"'],
        // enseignants et bureau : plusieurs fourchettes de niveau dans une même publication
        st && ['users', 'Partie dirigée', 'nvNew', 'data-m="partie"'],
        st && ['school', 'Séance collective à thème', 'nvNew', 'data-m="cours"'],
        st && ['info', 'Annonce', 'newPost', 'data-k="annonce"'],
        st && ['cal', 'Événement', 'newPost', 'data-k="event"'],
        coach && ['ball', 'Stage', 'newPost', 'data-k="stage"'],
        coach && ['school', "Groupe d'entraînement", 'newPost', 'data-k="train"'],
        st && ['score', 'Tournoi', 'newPost', 'data-k="tournoi"'],
        st && ['poll', 'Sondage', 'newPost', 'data-k="poll"'],
        st && ['link', 'Publication avec lien', 'newPost', 'data-k="cta"'],
        st && ['club', 'Mettre en avant nos partenaires', 'newPost', 'data-k="ad"'],
        st && CLUBINFO.mods.actus && ['news', 'Actu', 'newPost', 'data-k="article"'],
        ...myComms().map(c => ['flag', 'Promouvoir · ' + c.name, 'newPost', `data-k="commpromo" data-c="${c.id}"`])
      ].filter(Boolean);
    sheet(
      'Publier',
      `<div class="body"><div class="menu">${it.map(i => `<button data-a="${i[2]}" ${i[3] || ''}>${ic(i[0])}${i[1]}</button>`).join('')}</div></div>`
    );
  },
  newPost(d) {
    const [t, b, cta] = forms(d.k, d.c);
    S.img = null;
    sheet(
      t,
      `<form class="body" id="adm-form" data-k="${d.k}" data-c="${d.c || ''}">${b}<button class="btn full">${cta}</button></form>`
    );
  },
  /* publications : menu, modification, suppression, signalement */
  pmenu(d) {
    const p = posts.find(p => p.id === d.id),
      mine = p.by === ME(),
      adm = isAdmin(),
      ev = p.kind === 'event' && adm && !p.done && !p.arch,
      at = `data-id="${p.id}"`;
    const rr = p.kind === 'result' && recs.find(r => r.id === p.rec),
      rg = rr && grp(rr.tid),
      rok = rr && (adm || (rg && (rg.cap === ME() || rg.mem.includes(ME()))));
    menuSheet('Options', [
      rok && ['image', rr.img ? 'Changer la photo de la rencontre' : 'Ajouter une photo', 'rimg', `data-id="${rr.id}"`],
      ev && p.reg !== 'ext' && ['users', 'Voir les inscrits', 'evList', at],
      ev &&
        p.reg !== 'ext' && ['check', p.closed ? 'Rouvrir les inscriptions' : 'Clore les inscriptions', 'evClose', at],
      ev && ['image', "Terminer l'événement", 'evDone', at],
      adm && p.kind !== 'ad' && ['flag', p.pin ? 'Détacher du haut du mur' : 'Épingler en haut du mur', 'pin', at],
      (mine || adm) &&
        ['annonce', 'event', 'cta', 'poll', 'comm'].includes(p.kind) &&
        !p.arch && ['edit', 'Modifier', 'pedit', at],
      (mine || adm) && ['trash', 'Supprimer', 'pdel', at, 1],
      !mine && ['flag', 'Signaler cette publication', 'preport', at],
      !mine && p.by !== 'club' && ['block', 'Bloquer ' + first(p.by), 'block', `data-id="${p.by}"`, 1]
    ]);
  },
  rimg(d) {
    S.img = null;
    const r = recs.find(r => r.id === d.id);
    if (!r) return;
    sheet(
      'Photo de la rencontre',
      `<form class="body" id="rimg-form" data-id="${r.id}"><p class="muted small">${teamName(grp(r.tid))} contre ${r.opp} · la photo s'affiche avec le résultat sur le mur et dans le détail de la rencontre.</p><div class="fld"><label for="a-img">${r.img ? 'Choisir une autre photo' : 'Choisir une photo'}</label><input type="file" id="a-img" accept="image/*"><div class="prev" id="a-prev" ${r.img ? `style="background-image:url(${r.img})"` : 'hidden'}></div>${r.img ? `<label class="chk" for="r-noimg"><input type="checkbox" id="r-noimg">Retirer la photo</label>` : ''}</div><button class="btn full">Enregistrer</button></form>`
    );
  },
  pedit(d) {
    S.img = null;
    const p = posts.find(p => p.id === d.id),
      plain = s =>
        String(s || '')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>');
    sheet(
      'Modifier',
      `<form class="body" id="edit-form" data-id="${p.id}">${p.kind === 'poll' ? F('e-title', 'Question', '', plain(p.q)) : F('e-title', 'Titre', '', plain(p.title)) + T('e-body', 'Texte', '', plain(p.body))}${p.kind === 'event' ? F('e-place', 'Lieu', '', plain(p.place)) : ''}${p.kind === 'poll' ? '' : `<div class="fld"><label for="a-img">${p.img ? 'Remplacer la photo de couverture' : 'Ajouter une photo de couverture'}</label><input type="file" id="a-img" accept="image/*"><div class="prev" id="a-prev" ${p.img ? `style="background-image:url(${p.img})"` : 'hidden'}></div>${p.img ? `<label class="chk" for="e-noimg"><input type="checkbox" id="e-noimg">Retirer la photo</label>` : ''}</div>`}<button class="btn full">Enregistrer</button></form>`
    );
  },
  pdel(d) {
    const i = posts.findIndex(p => p.id === d.id);
    if (i < 0) return;
    const p = posts.splice(i, 1)[0];
    closeSheet();
    if (view().v === 'post') S.stack.pop();
    render(true);
    toast('Publication supprimée', () => posts.splice(i, 0, p));
  },
  preport(d) {
    const p = posts.find(p => p.id === d.id);
    REPORTS.push({
      kind: 'post',
      author: p.by,
      by: ME(),
      excerpt: esc(String(p.title || p.q || p.body || (p.res && p.res.sc) || 'Publication').replace(/<[^>]+>/g, '')),
      post: p.id
    });
    closeSheet();
    toast('Signalement envoyé au bureau du club');
  },
  block(d) {
    S.blocked.add(d.id);
    S.follow.delete(d.id);
    closeSheet();
    render(true);
    toast(`${first(d.id)} est bloqué : tu ne vois plus ses publications ni ses messages`);
  },
  unblock(d) {
    S.blocked.delete(d.id);
    render(true);
    toast(`${first(d.id)} est débloqué`);
  },
  umenu(d) {
    menuSheet(name(d.id), [
      ['flag', 'Signaler ce profil', 'toast', 'data-msg="Signalement envoyé au bureau du club"'],
      S.blocked.has(d.id)
        ? ['check', 'Débloquer', 'unblock', `data-id="${d.id}"`]
        : ['block', 'Bloquer ' + first(d.id), 'block', `data-id="${d.id}"`, 1]
    ]);
  },
  mmenu(d) {
    try {
      localStorage.setItem('club-lp-help', '1');
    } catch (e) {}
    const h = $('lp-help');
    if (h) h.remove();
    const l = msgList(d.ref),
      m = l && l[+d.i];
    if (!m) return;
    const mine = m.by === ME(),
      at = `data-ref="${d.ref}" data-i="${d.i}"`,
      items = [
        !d.ref.startsWith('p:') && ['com', 'Répondre', 'reply', at],
        (mine || isAdmin()) && ['trash', 'Supprimer le message', 'mdel', at, 1],
        !mine && ['flag', 'Signaler ce message', 'mreport', at],
        !mine && m.by !== 'club' && ['block', 'Bloquer ' + first(m.by), 'block', `data-id="${m.by}"`, 1]
      ].filter(Boolean);
    sheet(
      'Message',
      `<div class="body"><div class="reacts big">${['👍', '❤️', '😂', '👏', '🎾'].map(e => `<button class="react ${m.my === e ? 'on' : ''}" data-a="react" ${at} data-e="${e}" aria-label="Réagir avec ${e}">${e}</button>`).join('')}</div><div class="menu">${items.map(i => `<button class="${i[4] ? 'danger' : ''}" data-a="${i[2]}" ${i[3] || ''}>${ic(i[0])}${i[1]}</button>`).join('')}</div></div>`
    );
  },
  mdel(d) {
    const l = msgList(d.ref);
    if (!l) return;
    const i = +d.i,
      m = l.splice(i, 1)[0];
    if (!comBack(d.ref)) closeSheet();
    render(true);
    toast(d.ref.startsWith('p:') ? 'Commentaire supprimé' : 'Message supprimé', () => {
      l.splice(i, 0, m);
      comBack(d.ref);
    });
  },
  mreport(d) {
    const l = msgList(d.ref),
      m = l[+d.i];
    REPORTS.push({ kind: 'msg', author: m.by, by: ME(), excerpt: esc(m.x || 'Photo'), msg: m, ref: d.ref });
    closeSheet();
    toast('Signalement envoyé au bureau du club');
  },
  repDel(d) {
    const r = REPORTS.splice(+d.i, 1)[0];
    if (r.kind === 'post') {
      const i = posts.findIndex(p => p.id === r.post);
      if (i >= 0) posts.splice(i, 1);
    } else if (r.kind === 'com') {
      const p = posts.find(p => p.id === r.pid),
        i = p ? p.com.indexOf(r.com) : -1;
      if (i >= 0) p.com.splice(i, 1);
    } else {
      const l = msgList(r.ref),
        i = l ? l.indexOf(r.msg) : -1;
      if (i >= 0) l.splice(i, 1);
    }
    render(true);
    toast('Contenu supprimé');
  },
  repIgn(d) {
    REPORTS.splice(+d.i, 1);
    render(true);
    toast('Signalement classé');
  },
  photo(d, el) {
    const u = el.style.backgroundImage.replace(/^url\(["']?|["']?\)$/g, '');
    closeSheet();
    const b = document.createElement('div');
    b.className = 'back anim viewer';
    b.id = 'sheet';
    b.innerHTML = `<button class="ib vclose" data-a="close" aria-label="Fermer la photo">${ic('x')}</button><img class="pz" src="${u}" alt="Photo en plein écran" draggable="false">`;
    $('layer').appendChild(b);
    pinchZoom(b.querySelector('.pz'));
  },
  /* événements, sondages, parties */
  rsvp(d) {
    const p = posts.find(p => p.id === d.id);
    p.my = p.my === d.r ? null : d.r;
    render(true);
    toast(
      p.kind === 'comm'
        ? p.my
          ? 'Noté · le responsable de la commission est prévenu'
          : 'Réponse retirée'
        : p.my === 'yes'
          ? 'Tu es inscrit · le club est prévenu'
          : p.my === 'maybe'
            ? 'Noté en peut-être'
            : p.my === 'wait'
              ? "Tu es sur la liste d'attente · prévenu si une place se libère"
              : 'Inscription retirée'
    );
  },
  evClose(d) {
    const p = posts.find(p => p.id === d.id);
    p.closed = !p.closed;
    closeSheet();
    render(true);
    toast(p.closed ? 'Inscriptions closes · les inscrits sont conservés' : 'Inscriptions rouvertes');
  },
  evList(d) {
    const p = posts.find(p => p.id === d.id),
      l = (p.ins || []).concat(p.my === 'yes' ? [ME()] : []),
      rest = Math.max(0, (p.yes || 0) - (p.ins || []).length),
      txt = l.map(name).join('\n');
    sheet(
      'Inscrits',
      `<div class="body"><span class="kicker">${(p.yes || 0) + (p.my === 'yes' ? 1 : 0)} inscrits · ${(p.maybe || 0) + (p.my === 'maybe' ? 1 : 0)} peut-être</span><div>${l.map(i => `<div class="item">${av(i, 'sm')}<span class="grow"><span class="nm">${name(i)}</span> ${bd(i, p.sport)}</span></div>`).join('')}${rest ? `<p class="muted small" style="padding-top:10px">et ${rest} autres adhérents (non détaillés dans cette démo).</p>` : ''}</div><button class="btn full ghost" data-a="copy" data-txt="${esc(txt)}">Copier la liste des noms</button></div>`
    );
  },
  setupGo(d) {
    closeSheet();
    S.stack = [];
    if (d.k === 'champ') {
      S.tab = 'club';
      S.clubTab = 'teams';
      S.recTab = 'champ';
    } else {
      S.tab = 'ecole';
      S.ecTab = 'manage';
    }
    render();
  },
  copy(d) {
    if (/Rejoins/.test(d.txt || '')) (S.setup = S.setup || {}).inv = true;
    (navigator.clipboard ? navigator.clipboard.writeText(d.txt) : Promise.reject())
      .then(() => toast('Liste copiée'))
      .catch(() => toast('Copie impossible ici : sélectionne les noms à la main'));
  },
  evDone(d) {
    S.imgs = [];
    sheet(
      "Terminer l'événement",
      `<form class="body" id="done-form" data-id="${d.id}"><div class="note">L'événement repasse en haut du mur avec le badge « Terminé », ton commentaire et les photos. Les commentaires des adhérents sont conservés, y compris dans les archives.</div><div class="fld"><label for="d-txt">Le mot du club (facultatif)</label><textarea id="d-txt" placeholder="Merci aux 60 participants, bravo aux vainqueurs…"></textarea></div><div class="fld"><label for="d-ph">Photos (10 maximum)</label><input type="file" id="d-ph" accept="image/*" multiple><div class="gal" id="d-prev"></div></div><button class="btn full">Terminer et publier sur le mur</button></form>`
    );
  },
  vote(d) {
    const p = posts.find(p => p.id === d.id);
    p.my = p.my === +d.i ? null : +d.i;
    render(true);
  },
  play(d) {
    const p = posts.find(p => p.id === d.id),
      y = p.play,
      arr = d.r === 'in' ? y.in : y.wait,
      i = arr.indexOf(ME());
    i >= 0 ? arr.splice(i, 1) : arr.push(ME());
    render(true);
    toast(
      d.r === 'in'
        ? i >= 0
          ? `${first(p.by)} est prévenu de ton désistement`
          : `C'est noté · ${first(p.by)} est prévenu`
        : i >= 0
          ? "Tu as quitté la liste d'attente"
          : "Tu es sur la liste d'attente · prévenu si une place se libère"
    );
  },
  /* canaux */
  mute(d) {
    const c = chans.find(c => c.id === d.id);
    c.mute = !c.mute;
    render(true);
    toast(c.mute ? `${c.name} en sourdine : plus de notifications` : `Notifications réactivées pour ${c.name}`);
  },
  /* équipes et rencontres */
  champ(d) {
    S.champ = d.id;
    render(true);
  },
  scoring() {
    S.scoring = !S.scoring;
    render(true);
  },
  game(d) {
    addGame(
      recs.find(r => r.id === d.r),
      +d.i,
      +d.s
    );
    render(true);
    S.flash = null;
  },
  ungame(d) {
    const r = recs.find(r => r.id === d.r),
      m = r.ms[+d.i],
      s = +d.s;
    let k = m.sets.length - 1;
    if (m.st === 'live' && k > 0 && m.sets[k][0] === 0 && m.sets[k][1] === 0 && m.sets[k - 1][s] > 0) {
      m.sets.pop();
      k--;
    }
    if (m.sets[k][s] > 0) {
      m.sets[k][s]--;
      const was = m.st === 'done';
      if (was) {
        m.st = 'live';
        delete m.w;
      }
      liveNote(
        r,
        'Score corrigé · ' + m.l,
        ours(m) + ' contre ' + m.b[0] + ' · ' + (setsTxt(m) || '0-0') + (was ? ' · le match reprend' : ''),
        'start',
        'match',
        m
      );
    } else toast('Aucun jeu à retirer pour ce joueur sur ce set');
    render(true);
  },
  start(d) {
    const r = recs.find(r => r.id === d.r),
      m = r.ms[+d.i];
    m.st = 'live';
    m.sets = [[0, 0]];
    render(true);
    liveStart(r, m);
  },
  endrec(d) {
    endRec(recs.find(r => r.id === d.r));
    render(true);
  },
  startRec(d) {
    const r = recs.find(r => r.id === d.r),
      g = grp(r.tid),
      T2 = g.mem.filter(p => r.lineup && r.lineup[p] === 'T'),
      pad = recSport(r) === 'Padel';
    if (!T2.length) {
      toast("Choisis d'abord les titulaires de la rencontre");
      return;
    }
    if (pad && T2.length % 2) {
      toast('En padel, convoque un nombre pair de titulaires : les matchs se jouent en double');
      return;
    }
    const rows = pad
      ? Array.from({ length: T2.length / 2 }, (_, i) =>
          O(
            'so-' + i,
            `Double ${i + 1} · adversaires de ${T2.slice(i * 2, i * 2 + 2)
              .map(first)
              .join(' et ')}`,
            'Noms de la paire adverse'
          )
        ).join('')
      : T2.map((p, i) => O('so-' + i, `Simple ${i + 1} · adversaire de ${first(p)}`, "Nom de l'adversaire")).join('') +
        (T2.length >= 2 ? O('so-d', 'Double · paire adverse', 'Noms de la paire adverse') : '');
    sheet(
      'Lancer la rencontre',
      `<form class="body" id="start-form" data-r="${r.id}"><div class="note">Les matchs sont créés à partir des titulaires. Tu saisis ensuite les scores jeu par jeu, visibles en direct par tous les adhérents.</div>${Sel('so-stb', 'Si un 3e set est nécessaire', ['Set classique', 'Super tie-break en 10 points'], pad ? 'Super tie-break en 10 points' : 'Set classique')}${rows}<button class="btn full">Lancer le direct</button></form>`
    );
  },
  delRec(d) {
    const i = recs.findIndex(r => r.id === d.r);
    if (i < 0) return;
    const r = recs.splice(i, 1)[0],
      ps = posts.map((p, k) => [p, k]).filter(([p]) => p.rec === d.r);
    ps.slice()
      .reverse()
      .forEach(([p, k]) => posts.splice(k, 1));
    S.dir = -1;
    S.stack.pop();
    render();
    toast('Rencontre supprimée du calendrier', () => {
      recs.splice(i, 0, r);
      ps.forEach(([p, k]) => posts.splice(k, 0, p));
    });
  },
  lineup(d) {
    const r = recs.find(r => r.id === d.r),
      L = r.lineup,
      was = L[d.id];
    if (was === d.s) {
      delete L[d.id];
      delete r.conv[d.id];
    } else {
      L[d.id] = d.s;
      if (!was) delete r.conv[d.id];
    }
    render(true);
    toast(
      was === d.s
        ? `${name(d.id)} retiré de la compo`
        : `${name(d.id)} convoqué comme ${d.s === 'T' ? 'titulaire' : 'remplaçant'}`
    );
  },
  conv(d) {
    const r = recs.find(r => r.id === d.r),
      me = ME();
    r.conv[me] = r.conv[me] === d.s ? 'wait' : d.s;
    render(true);
    toast(
      r.conv[me] === 'ok'
        ? 'Réponse envoyée : tu es disponible'
        : r.conv[me] === 'no'
          ? 'Réponse envoyée : tu es indisponible'
          : 'Réponse retirée'
    );
  },
  grpToggle(d) {
    const g = grp(d.g),
      i = g.mem.indexOf(d.id);
    let extra = '';
    if (i >= 0) {
      g.mem.splice(i, 1);
      recs
        .filter(r => r.tid === g.id && r.st === 'soon')
        .forEach(r => {
          if (r.lineup) delete r.lineup[d.id];
          if (r.conv) delete r.conv[d.id];
        });
      if (g.cap === d.id) {
        g.cap = g.mem[0] || null;
        extra = g.cap ? ` · ${first(g.cap)} devient capitaine` : ' · équipe sans capitaine';
      }
    } else g.mem.push(d.id);
    render(true);
    toast(
      i >= 0
        ? `${name(d.id)} retiré de ${g.name} et de ses compositions${extra}`
        : `${name(d.id)} ajouté à ${g.name} et prévenu`
    );
  },
  grpAll() {
    S.grpAll = !S.grpAll;
    render(true);
  },
  /* planning, archives, saison */
  planNav(d) {
    S.plan.d = isoIn(+d.n * (S.plan.mode === 'day' ? 1 : 7), S.plan.d);
    S.dir = +d.n;
    render(true);
    if (S.plan.mode === 'day') scrollFirst();
  },
  planDay(d) {
    S.plan.d = d.d;
    S.plan.mode = 'day';
    render(true);
    scrollFirst();
  },
  planMode(d) {
    S.plan.mode = d.m;
    render(true);
    if (d.m === 'day') scrollFirst();
  },
  planF(d) {
    S.plan[d.g][d.k] = !S.plan[d.g][d.k];
    render(true);
  },
  arch(d) {
    S.arch[d.k] = d.val;
    render(true);
  },
  season() {
    const e = +S.season.split('-')[1];
    sheet(
      'Changer de saison',
      `<form class="body" id="season-form"><div class="note">Clôturer ${S.season} envoie dans les archives tous les articles, tous les événements et toutes les rencontres terminées. Le journal, l'agenda et les résultats repartent de zéro. Les rencontres à venir et les équipes sont conservées.</div><div class="two">${Sel('y1', 'Première année', [e, e + 1, e + 2].map(String))}${Sel('y2', 'Seconde année', [e + 1, e + 2, e + 3].map(String))}</div><button class="btn full">Clôturer ${S.season} et lancer la prochaine</button></form>`
    );
  },
  delArt(d) {
    const i = arts.findIndex(a => a.id === d.id);
    if (i < 0) return;
    const a = arts.splice(i, 1)[0];
    S.dir = -1;
    S.stack.pop();
    render();
    toast('Actu supprimée', () => arts.splice(i, 0, a));
  },
  /* profil */
  theme(d) {
    setTheme(+d.i);
    render(true);
    toast(`Appli aux couleurs de ${club().name}`);
  },
  role(d) {
    S.role = d.r;
    S.scoring = false;
    S.tab = 'me';
    S.stack = [];
    S.chanTab = 'club';
    render();
    toast(`Tu vois l'appli en tant que : ${ROLE[d.r]}`);
  },
  share(d) {
    S.share[d.k] = !S.share[d.k];
    render(true);
    toast(S.share[d.k] ? `${MYCT[d.k][1]} visible par les adhérents` : `${MYCT[d.k][1]} masqué`);
  },
  nset(d) {
    S.nset[d.k] = !S.nset[d.k];
    render(true);
  },
  delRes(d) {
    const l = M[ME()].res,
      i = +d.i,
      r = l.splice(i, 1)[0],
      pi = posts.findIndex(p => p.res === r),
      p = pi >= 0 ? posts.splice(pi, 1)[0] : null;
    render(true);
    toast('Résultat supprimé de ton palmarès', () => {
      l.splice(i, 0, r);
      if (p) posts.splice(pi, 0, p);
    });
  },
  teamFinal(d) {
    const g = grp(d.id),
      f = g.final || {
        fmt: 'Poule',
        pp: '1er',
        pn: 6,
        tm: 'stade',
        tp: '1er',
        ts: 'Vainqueur',
        out: 'Maintien',
        div: '',
        txt: ''
      },
      P = PLACES.slice(0, 16),
      num = Array.from({ length: 15 }, (_, i) => String(i + 2));
    sheet(
      'Résultat final',
      `<form class="body" id="tf-form" data-id="${g.id}"><p class="muted small">${teamName(g)} · ${champOf(g).name} · ${g.sub}</p>${Sel('tf-fmt', 'Formule du championnat', ['Poule', 'Tableau final', 'Poule puis tableau final'], f.fmt)}
  <div class="two" id="tf-p">${Sel('tf-pp', 'Place en poule', P, f.pp)}${Sel('tf-pn', 'Équipes dans la poule', num, String(f.pn))}</div>
  <div id="tf-t"><div class="fld"><span class="lb">Classement au tableau final</span><div class="radio"><label for="tm-s"><input type="radio" name="tm" value="stade" id="tm-s" ${f.tm !== 'place' ? 'checked' : ''}>Stade atteint</label><label for="tm-p"><input type="radio" name="tm" value="place" id="tm-p" ${f.tm === 'place' ? 'checked' : ''}>Place précise</label></div></div><div id="tf-tsw">${Sel('tf-ts', 'Stade atteint', STAGES, f.ts)}</div><div id="tf-tpw">${Sel('tf-tp', 'Place finale', P, f.tp)}</div></div>
  ${Sel('tf-out', 'Bilan de la saison', ['Montée', 'Maintien', 'Descente'], f.out)}<div id="tf-d">${O('tf-div', 'Division de la saison prochaine (facultatif)', 'Régional 1', f.div)}</div>${O('tf-txt', 'Un mot pour le mur (facultatif)', 'Merci à tous les joueurs !', f.txt)}
  <p class="muted small">Le résultat est publié sur le mur du club. Une montée ou une première place donne le trophée Champion aux joueurs qui ont disputé au moins un match.</p><button class="btn full">Publier le résultat</button></form>`
    );
    tfSync();
  },
  result() {
    menuSheet('Ajouter un résultat', [
      ['score', 'Match de tennis', 'resultT'],
      ['ball', 'Tournoi de padel', 'resultP']
    ]);
  },
  resultP() {
    const mates = Object.keys(M)
      .filter(k => k !== 'club' && k !== ME() && M[k].role !== 'Jeune' && (M[k].pad || M[k].pl))
      .sort((a, b) => M[a].n.localeCompare(M[b].n));
    sheet(
      'Tournoi de padel',
      `<form class="body" id="pres-form"><div class="two">${Sel('pr-place', 'Place obtenue', PLACES)}${Sel('pr-cat', 'Catégorie', ['P25', 'P50', 'P100', 'P250', 'P500', 'P1000'], 'P100')}</div><div class="two">${Sel('pr-pub', 'Public', ['Adultes', 'Jeunes', 'Seniors +'])}${O('pr-age', 'Âge (facultatif)', '+45, 15-18 ans…')}</div><div class="two">${Dt('pr-d', 'Date du tournoi', 1, TODAY)}${F('pr-club', 'Club organisateur', 'Padel Club Tulle')}</div>
  <div class="fld"><span class="lb">Partenaire</span><div class="radio"><label for="pt-club"><input type="radio" name="pt" value="club" id="pt-club" checked>Du club</label><label for="pt-ext"><input type="radio" name="pt" value="ext" id="pt-ext">Extérieur</label></div></div>
  <div id="pt-c">${mates.length ? Who('pr-mate', 'Joueur du club (pratique le padel)', mates) : '<p class="muted small">Aucun autre joueur de padel au club.</p>'}</div><div id="pt-e" hidden>${O('pr-ext', 'Nom et prénom du partenaire', 'Julien Masson')}</div>
  <p class="muted small">Si ton partenaire est du club, le résultat s'ajoute aussi à son palmarès.</p><button class="btn full">${isMinor(ME()) ? 'Publier (visible par ton groupe et tes parents)' : 'Publier et notifier mes ' + M[ME()].fol + ' abonnés'}</button></form>`
    );
  },
  palm(d) {
    S.palm = d.s;
    render(true);
  },
  delPres(d) {
    const l = M[ME()].pres || [],
      i = +d.i,
      r = l.splice(i, 1)[0],
      pi = posts.findIndex(p => p.pres === r),
      p = pi >= 0 ? posts.splice(pi, 1)[0] : null;
    render(true);
    toast('Résultat supprimé de ton palmarès padel', () => {
      l.splice(i, 0, r);
      if (p) posts.splice(pi, 0, p);
    });
  },
  resultT() {
    const opt = `<option value="">–</option>` + [0, 1, 2, 3, 4, 5, 6, 7].map(n => `<option>${n}</option>`).join(''),
      row = (n, l) =>
        `<div class="setrow"><span class="nm">${l}</span><select id="s${n}a" aria-label="${l}, tes jeux">${opt}</select><span>/</span><select id="s${n}b" aria-label="${l}, jeux de l'adversaire">${opt}</select></div>`;
    sheet(
      'Ajouter un résultat',
      `<form class="body" id="res-form">${F('r-opp', 'Adversaire', 'Prénom Nom')}<div class="two">${Sel('r-rank', 'Son classement', RANKS, '15/1')}${Sel('r-ctx', 'Compétition', ['Tournoi', 'Championnat par équipes', 'Tournoi interne', 'Match amical'])}</div>${O('r-name', 'Nom du tournoi (facultatif)', 'Open de Brive')}<div class="fld"><label class="chk" for="r-fin"><input type="checkbox" id="r-fin">C'était la finale du tournoi</label></div>
  <div class="fld"><span class="lb">Score · tes jeux / ceux de l'adversaire</span>${row(1, '1er set')}${row(2, '2e set')}${row(3, '3e set')}<span class="muted small">Laisse le 3e set vide si le match s'est joué en deux sets.</span></div><button class="btn full">${isMinor(ME()) ? 'Publier (visible par ton groupe et tes parents)' : 'Publier et notifier mes ' + M[ME()].fol + ' abonnés'}</button></form>`
    );
  },
  rank(d) {
    const tn = d.k === 'tennis',
      me = M[ME()];
    sheet(
      tn ? 'Mon classement tennis' : 'Mon classement padel',
      `<form class="body" id="rank-form" data-k="${d.k}">` +
        (tn
          ? `<div class="fld"><label for="r-new">Classement</label><select id="r-new">${RANKS.map(r => `<option value="${r}" ${r === me.r ? 'selected' : ''}>${r === 'NC' ? 'Non classé' : r}</option>`).join('')}</select></div>`
          : `<div class="fld"><label for="r-pad">Classement national</label><input id="r-pad" inputmode="numeric" pattern="[0-9]*" placeholder="Laisse vide si non classé" value="${me.pad || ''}" autocomplete="off"></div><div class="fld"><label for="r-pl">Niveau de jeu</label><select id="r-pl">${['Aucun', ...LV].map((l, i) => `<option ${(me.pl || 0) === i ? 'selected' : ''}>${l}</option>`).join('')}</select><span class="muted small">${LVHELP}</span></div>`) +
        `<p class="muted small">Le classement n'est pas relié à Ten'Up : tu le mets à jour toi-même, et tes abonnés sont prévenus.</p><button class="btn full">Enregistrer</button></form>`
    );
  },
  editMe() {
    const me = M[ME()],
      sx = me.g === 'F' ? 'Femme' : 'Homme';
    sheet(
      'Mes informations',
      `<form class="body" id="me-form">${F('e-name', 'Prénom et nom', '', me.n)}<div class="fld"><label for="e-lic">Numéro de licence FFT</label><input id="e-lic" autocapitalize="characters" autocorrect="off" spellcheck="false" value="${esc(me.lic || '')}" placeholder="Facultatif" autocomplete="off"><span class="muted small">Il relie ton profil à tes tournois /RAM JA.</span></div><div class="two">${Sel('e-g', 'Sexe', ['Homme', 'Femme'], sx)}${Dt('e-bd', 'Date de naissance', 1, me.bd)}</div><div class="fld"><label for="e-tel">Téléphone</label><input id="e-tel" inputmode="tel" value="${esc(MYCT.tel[2])}" autocomplete="off"></div><div class="fld"><label for="e-mail">E-mail</label><input id="e-mail" type="email" value="${esc(MYCT.mail[2])}" autocomplete="off"></div><div class="two">${Sel('e-net', 'Réseau social', ['Instagram', 'Facebook', 'TikTok'], MYCT.soc[1])}${O('e-soc', 'Identifiant', '', MYCT.soc[2])}</div><p class="muted small">Téléphone, e-mail et réseau social ne sont visibles que si leur interrupteur est activé dans ton profil.</p><button class="btn full">Enregistrer</button></form>`
    );
  },
  addKid() {
    sheet(
      'Ajouter un enfant',
      `<form class="body" id="kid-form">${F('k-name', 'Prénom et nom', 'Zoé Roux')}<div class="two">${Sel('k-g', 'Sexe', ['Fille', 'Garçon'])}${Dt('k-bd', 'Date de naissance', 1, '2016-01-01')}</div>${Sel(
        'k-grp',
        'Groupe',
        GROUPS.filter(g => g.type === 'train').map(g => g.name)
      )}<div class="fld"><label class="chk" for="k-ok"><input type="checkbox" id="k-ok" required>Je suis son représentant légal et j'autorise la création de son compte.</label></div><p class="muted small">Un compte jeune n'a pas de messagerie privée et n'accède qu'aux annonces et aux canaux de son groupe. Tu peux le consulter et le supprimer à tout moment.</p><button class="btn full">Créer le compte jeune</button></form>`
    );
  },
  look() {
    const c = club();
    S.img = null;
    S.logoL = null;
    S.logoD = null;
    const lp = (id, u, l, h) =>
      `<div class="fld"><label for="${id}">${l}</label><input type="file" id="${id}" accept="image/png,image/svg+xml,image/webp,image/*"><div class="lkl ${id === 'lk-ll' ? 'dk' : 'lt'}" id="${id}-p" ${u ? '' : 'hidden'}>${u ? `<img src="${u}" alt="">` : ''}</div>${u ? `<label class="chk" for="${id}-x"><input type="checkbox" id="${id}-x">Retirer ce logo</label>` : ''}<span class="muted small">${h}</span></div>`;
    sheet(
      'Apparence du club',
      `<form class="body" id="look-form"><div class="two">${F('lk-name', 'Nom du club', '', c.name)}<div class="fld"><label for="lk-short">Sigle (4 lettres max)</label><input id="lk-short" required maxlength="4" value="${esc(c.short)}" autocomplete="off"></div></div><div class="two"><div class="fld"><label for="lk-acc">Couleur du club</label><input type="color" id="lk-acc" value="${c.accent}"></div><div class="fld"><label for="lk-acc2">Couleur d'accent</label><input type="color" id="lk-acc2" value="${c.accent2 || '#F5104C'}"></div></div>${Sel('lk-bg', 'Fond', ['Sombre', 'Clair'], c.dark ? 'Sombre' : 'Clair')}<div id="lk-prev"></div><p class="muted small">La couleur du club habille les boutons, le curseur et les titres ; la couleur d'accent fait les ombres et les détails. Le rouge d'alerte et le bleu du padel restent fixes pour être reconnaissables.</p>${lp('lk-ll', c.logoL, 'Logo clair (pour fond sombre)', "Logo entier, de préférence en PNG transparent. Affiché en haut de l'appli et dans le menu sur ordinateur.")}${lp('lk-ld', c.logoD, 'Logo sombre (pour fond clair)', "Le même logo en version foncée : l'appli prend celui qui ressort sur le fond du club.")}<div class="fld"><label for="lk-logo">Photo de profil du club</label><input type="file" id="lk-logo" accept="image/*"><div class="prev" id="a-prev" ${c.logo ? `style="background-image:url(${c.logo})"` : 'hidden'}></div><span class="muted small">Image carrée : elle accompagne les publications et les messages du club.</span></div><button class="btn full">Appliquer au club</button></form>`
    );
    lookPrev();
  },
  delAccount() {
    if (isMinor(ME())) {
      toast('Seul ton parent peut supprimer ton compte');
      return;
    }
    sheet(
      'Supprimer mon compte',
      `<form class="body" id="del-form"><div class="note">Ton profil, tes résultats et tes inscriptions seront supprimés sous 30 jours. Tes messages resteront affichés sous le nom « Ancien membre ». Un résultat de padel partagé reste dans le palmarès de ton partenaire, sans ton nom. Les comptes jeunes qui te sont rattachés seront aussi supprimés.</div><button type="button" class="btn sm ghost" data-a="toast" data-msg="Export préparé : tu le recevras par e-mail">Recevoir une copie de mes données</button><div class="fld"><label class="chk" for="del-ok"><input type="checkbox" id="del-ok" required>Je comprends que cette action est définitive.</label></div><button class="btn full hot">Supprimer définitivement mon compte</button></form>`
    );
  }
};
