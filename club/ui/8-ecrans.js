/* /RAM Club — ui/8-ecrans.js : Table des écrans (V) : chaque écran de l'appli et son contenu.
   Morceau de l'ancien ui.js : les fichiers ui/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
/* ---------- écrans ---------- */
const V = {
  home() {
    const v = M[ME()],
      feed = posts.filter(canSee).sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0));
    const st = (a, attrs, inner, l, cls) =>
      `<button class="story" data-a="${a}" ${attrs}><span class="ring ${cls || ''}"><span>${inner}</span></span><span class="sl">${l}</span></button>`;
    return `<div class="stories">${recs
      .filter(r => r.st === 'live' && !r.arch)
      .map(r =>
        st(
          'open',
          `data-v="rec" data-id="${r.id}"`,
          `<span class="lsq-k">Direct</span><b class="lsq-s" data-live="${r.id}">${teamScore(r).join(' - ')}</b>`,
          teamName(grp(r.tid)),
          'lsq'
        )
      )
      .join('')}${(() => {
      const F = typeof favStrip === 'function' ? favStrip(st) : null;
      if (F && F.any) return F.tiles + F.tail;
      return (
        (S.role === 'kid' ? '' : st('newPost', 'data-k="play"', ic('search'), 'Chercher une partie', 'calm')) +
        chans
          .filter(c => chanOk(c) && c.g !== 'club' && (S.role === 'kid' || !c.kid || (v.kids && v.kids.length)))
          .slice(0, 4)
          .map(c =>
            st(
              'open',
              `data-v="chan" data-id="${c.id}"`,
              ic(c.g === 'team' ? 'users' : 'ball'),
              c.name,
              c.un && !c.mute ? '' : 'calm'
            )
          )
          .join('') +
        (CLUBINFO.mods.actus ? st('goClub', 'data-t="actus"', ic('news'), 'Actus', 'calm') : '') +
        (F ? F.tail : '')
      );
    })()}</div>
  ${isAdmin() && CLUBINFO.joined < CLUBINFO.members ? `<div class="pad" style="padding-bottom:4px"><button class="note" data-a="open" data-v="join" style="width:100%;text-align:left">${CLUBINFO.joined} adhérents sur ${CLUBINFO.members} ont rejoint l'appli. <b style="color:var(--accent)">Inviter les autres</b></button></div>` : ''}
  <div class="feed">${feed.length ? feed.map(postHTML).join('') : empty('home', 'Le mur est vide', 'Les annonces et les résultats du club apparaîtront ici.')}</div>`;
  },
  chans() {
    const list = chans.filter(c => c.g === S.chanTab && chanOk(c));
    return (
      segs('chanTab', [
        ['club', 'Club', 'club'],
        ['train', 'Entraînements', 'ball'],
        ['team', 'Équipes', 'users']
      ]) +
      '<div class="lis">' +
      (list.length
        ? list
            .map(c => {
              const l = c.msgs.filter(m => !S.blocked.has(m.by)).slice(-1)[0];
              return `<div class="li ${c.mute ? 'dim' : ''}"><button class="go" data-a="open" data-v="chan" data-id="${c.id}"><span class="tile">${ic(c.g === 'team' ? 'users' : c.g === 'train' ? 'ball' : 'chat')}</span><span class="grow"><span class="nm">${c.name}</span> <span class="muted small">· ${c.desc}</span><span class="last">${l ? (l.by === 'club' ? club().short : first(l.by)) + ' : ' + (l.img && !l.x ? 'Photo' : esc(l.x)) : 'Aucun message'}</span></span>${c.un ? `<span class="un">${c.un}</span>` : ''}</button>${muteBtn(c)}</div>`;
            })
            .join('')
        : empty('chat', 'Aucun groupe ici', "Tes groupes s'ouvrent selon ton entraînement et ton équipe.")) +
      '</div>' +
      `<div class="pad">${isAdmin() ? `<button class="btn full ghost" data-a="newPost" data-k="chan">Créer un groupe de discussion</button>` : ''}<div class="note">Les groupes d'entraînement et d'équipe s'ouvrent selon ton inscription. Le haut-parleur coupe les notifications d'un groupe.</div></div>`
    );
  },
  chan(id) {
    const c = chans.find(c => c.id === id);
    return `<div class="chat">${lpHelp()}${c.kid && S.role !== 'kid' ? `<div class="note">Tu lis ce canal en tant que parent de Léo.</div>` : ''}${c.msgs.map((m, i) => msgRow(m, i, c.sport, 'c:' + c.id, S.sent && i === c.msgs.length - 1)).join('') || empty('chat', 'Aucun message', 'Lance la discussion.')}${typingSlot('c:' + c.id)}</div>`;
  },
  /* les modes de l'agenda (Événements, Semaine, Jour, Liste) deviennent des onglets, comme sur les autres pages */
  agenda() {
    const h = agendaView(),
      // en haut de la page : « Mon agenda » / « Agenda du club » ; les vues (À venir, Semaine…) restent dessous
      m = h.match(
        /<div class="chips plan-scope">((?:<button class="chip" data-a="planScope"[^>]*>[\s\S]*?<\/button>)+)<\/div>/
      );
    if (!m) return h;
    return (
      `<div class="seg" role="tablist">${m[1].replace(/class="chip"/g, 'role="tab"').replace(/aria-pressed=/g, 'aria-selected=')}</div>` +
      h.replace(m[0], '')
    );
  },
  ecole() {
    const staff = isAdmin(),
      coach = S.role === 'coach' || !!S.super,
      tabs = [
        ['mine', 'Mes cours', 'cal'],
        ['stages', 'Stages', 'ball']
      ].concat(staff ? [['manage', coach ? 'Mes groupes' : 'Gestion', 'edit']] : []);
    if (!tabs.some(t => t[0] === S.ecTab)) S.ecTab = 'mine';
    return segs('ecTab', tabs) + `<div class="pad">${ecoleBody(S.ecTab)}</div>`;
  },
  archive() {
    return archView();
  },
  teamarch(id) {
    return teamArch(id);
  },
  rec: recView,
  team: teamView,
  champ(id) {
    const c = CHAMPS.find(c => c.id === id) || OLDC.find(c => c.id === id);
    return `<div class="pad">${c ? champBody(c, isAdmin() && CHAMPS.includes(c)) : empty('folder', 'Championnat clôturé', 'Il se trouve dans les archives de la saison.')}</div>`;
  },
  post(id) {
    const p = posts.find(p => p.id === id);
    return `<div class="feed" style="padding-top:8px">${p ? postHTML(p) : empty('home', 'Publication supprimée', '')}</div>`;
  },
  club: clubView,
  list: listView,
  art(id) {
    const a = arts.find(a => a.id === id);
    return `<div class="pad"><div class="row" style="gap:8px"><span class="kicker">${a.cat} · ${a.date}</span>${sportTag(a.sport)}</div><h2 class="tilt">${a.title}</h2>${a.img ? `<button class="ph wide" style="background-image:url(${a.img})" data-a="photo" aria-label="Photo de l'article"></button>` : ''}<div class="prose"><p><b>${a.lead}</b></p>${a.body.map(p => `<p>${p}</p>`).join('')}</div>${isAdmin() && !a.arch ? `<button class="btn full ghost" data-a="delArt" data-id="${a.id}">Supprimer l'article</button>` : ''}</div>`;
  },
  lock() {
    return lockView(view());
  },
  admin() {
    const it = (a, icn, t, s, extra) =>
      `<button class="item" data-a="${a}" ${extra || ''}><span class="tile">${ic(icn)}</span><span class="grow"><span class="nm">${t}</span><br><span class="muted small">${s}</span></span></button>`;
    const grps = type =>
      GROUPS.filter(g => g.type === type)
        .map(g =>
          it(
            'open',
            'users',
            g.name,
            `${g.mem.length} membre${g.mem.length > 1 ? 's' : ''} · ${g.sub}`,
            `data-v="grp" data-id="${g.id}"`
          )
        )
        .join('');
    if (false) {
      const mine = [];
      return `<div class="pad"><div class="note">En tant qu'enseignante, tu gères tes groupes : appel, annulation d'un cours, message au groupe.</div><div class="card adm-sec"><span class="kicker">Mes groupes</span>${mine.map(g => it('open', 'ball', g.name, g.sub, `data-v="grp" data-id="${g.id}"`)).join('')}</div></div>`;
    }
    if (!isAdmin()) {
      const mine = GROUPS.filter(g => g.type === 'team' && g.cap === ME());
      return `<div class="pad"><div class="note">En tant que capitaine, tu gères ton équipe : effectif, calendrier, convocations et scores en direct.</div><div class="card adm-sec"><span class="kicker">Mes équipes</span>${mine.map(g => it('open', 'users', teamName(g), g.sub, `data-v="team" data-id="${g.id}"`)).join('')}</div></div>`;
    }
    const nj = JOINREQ.length;
    return `<div class="pad">${setupCard()}<div class="card adm-sec"><span class="kicker">Adhérents</span>${it('open', 'users', 'Faire entrer les adhérents', nj ? `${nj} demande${nj > 1 ? 's' : ''} à valider · code ${CLUBINFO.code}` : `Code du club ${CLUBINFO.code} · import d'une liste`, 'data-v="join"')}</div>
  <div class="card adm-sec"><span class="kicker">Publier sur le mur</span>${it('newPost', 'info', 'Annonce', 'Un message du club à tous les adhérents', 'data-k="annonce"')}${it('newPost', 'cal', 'Événement', "Avec inscription dans l'appli ou sur Ten'Up", 'data-k="event"')}${it('newPost', 'score', 'Tournoi', "Tennis ou padel, catégories, lien Ten'Up", 'data-k="tournoi"')}${it('newPost', 'poll', 'Sondage', "Jusqu'à six réponses, date de clôture", 'data-k="poll"')}${it('newPost', 'link', 'Publication avec lien', 'Un titre, un texte et un gros bouton vers un site', 'data-k="cta"')}${CLUBINFO.mods.actus ? it('newPost', 'news', 'Actu', 'Un récit, un portrait, un compte rendu', 'data-k="article"') : ''}</div>
  <div class="card adm-sec"><span class="kicker">Championnats et équipes</span>${CHAMPS.map(c => {
    const n = GROUPS.filter(g => g.champ === c.id).length;
    return it(
      'open',
      'folder',
      c.name,
      `${n} équipe${n > 1 ? 's' : ''} · ${c.sport} · ${c.age}`,
      `data-v="champ" data-id="${c.id}"`
    );
  }).join(
    ''
  )}${it('newPost', 'plus', 'Créer un championnat', 'Puis ajoute ses équipes, leurs capitaines et leur calendrier', 'data-k="champ"')}</div>
  <div class="card adm-sec"><span class="kicker">Groupes</span>${grps('train')}${S.role === 'coach' || S.super ? it('newPost', 'plus', "Créer un groupe d'entraînement", 'Jour, heure, lieu et critères', 'data-k="train"') : ''}${it('newPost', 'chat', 'Créer un groupe de discussion', 'Covoiturage, petites annonces, bénévoles…', 'data-k="chan"')}</div>
  <div class="card adm-sec"><span class="kicker">Le club</span>${it('open', 'info', 'Aide · guide du bureau', 'Tout ce que fait l’appli, rubrique par rubrique', 'data-v="aide"') + it('open', 'flag', 'Signalements', REPORTS.length ? `${REPORTS.length} contenu${REPORTS.length > 1 ? 's' : ''} à examiner` : 'Aucun contenu signalé', 'data-v="reports"')}${it('clubInfo', 'info', 'Infos du club', 'Courts, horaires, adresse, tarifs, liens, modules')}${
    CLUBINFO.mods.comm && isBureau()
      ? it(
          'goClub',
          'flag',
          'Commissions',
          (() => {
            const n = COMMS.reduce((a, c) => a + c.req.length, 0);
            return n ? `${n} demande${n > 1 ? 's' : ''} en attente` : `${COMMS.length} commissions`;
          })(),
          'data-t="comm"'
        )
      : ''
  }${it('open', 'club', 'Partenaires', `${PARTNERS.length} partenaires · les mettre en avant sur le mur`, 'data-v="partners"')}${it('look', 'edit', 'Apparence', 'Nom, sigle, logo et couleur du club')}${it('season', 'folder', 'Saison ' + S.season, 'Clôturer la saison en cours et lancer la prochaine')}</div></div>`;
  },
  grp(id) {
    const g = grp(id),
      crit = [],
      rkk = g.type === 'train' && g.lo && g.hi,
      a = rIdx(g.lo),
      b = rIdx(g.hi),
      i0 = Math.min(a, b),
      i1 = Math.max(a, b),
      coachOk = g.type === 'train' && (isAdmin() || (S.role === 'coach' && g.coach === ME())),
      edit = isAdmin() || coachOk || canTeam(g);
    if (g.gen === 'Hommes' || g.gen === 'Femmes') crit.push(g.gen);
    if (rkk) crit.push(RANKS[i0] + ' à ' + RANKS[i1]);
    const fit = p => {
      if (g.gen === 'Hommes' && M[p].g !== 'H') return false;
      if (g.gen === 'Femmes' && M[p].g !== 'F') return false;
      if (rkk) {
        const i = rIdx(M[p].r);
        if (i < i0 || i > i1) return false;
      }
      return true;
    };
    const list = Object.keys(M).filter(k => k !== 'club' && (g.mem.includes(k) || S.grpAll || !crit.length || fit(k))),
      sp = g.sport || (champOf(g) || {}).sport,
      prop = crit.length ? Object.keys(M).filter(k => k !== 'club' && !g.mem.includes(k) && fit(k)) : [];
    let h = `<div class="pad">`;
    if (coachOk) {
      const iso = nextSessionOf(g),
        cx = (g.cancel || []).includes(iso),
        ab = (g.abs || {})[iso] || [],
        att = (g.att || {})[iso] || {};
      h += `<div class="card"><span class="kicker">Prochain cours</span><span class="h3">${fmtD(iso)} · ${g.h}</span>${cx ? '<span class="st no">Cours annulé · élèves et parents prévenus</span>' : ''}
   <div class="ctl"><button class="btn sm grow ${cx ? '' : 'hot'}" data-a="cancelCourse" data-id="${g.id}" data-d="${iso}">${cx ? 'Rétablir le cours' : 'Annuler le cours'}</button>${chans.some(c => c.id === g.id) ? `<button class="btn sm ghost grow" data-a="open" data-v="chan" data-id="${g.id}">Écrire au groupe</button>` : ''}</div>
   ${
     cx
       ? ''
       : `<span class="kicker">Appel</span>${
           g.mem.length
             ? g.mem
                 .map(p => {
                   const pr = att[p],
                     abs = ab.includes(p);
                   return `<div class="item cv">${av(p, 'sm')}<span class="grow"><span class="nm">${name(p)}</span>${abs ? '<br><span class="st no">Absence signalée par un parent</span>' : ''}</span><span class="tri"><button class="btn sm grow ${pr === true ? '' : 'ghost'}" data-a="att" data-id="${g.id}" data-d="${iso}" data-u="${p}" data-s="1" aria-pressed="${pr === true}">Présent</button><button class="btn sm grow ${pr === false ? 'hot' : 'ghost'}" data-a="att" data-id="${g.id}" data-d="${iso}" data-u="${p}" data-s="0" aria-pressed="${pr === false}">Absent</button></span></div>`;
                 })
                 .join('')
             : '<p class="muted small">Aucun élève dans ce groupe.</p>'
         }`
   }</div>`;
    }
    h += `<div><span class="kicker">${g.type === 'team' ? 'Équipe' : "Groupe d'entraînement"} · ${g.mem.length} membre${g.mem.length > 1 ? 's' : ''}</span><p class="muted small" style="margin-top:6px">Un membre ajouté est prévenu et accède au groupe de discussion.</p></div>${crit.length ? `<div class="vis">${ic('eye')}Adhérents proposés ${crit.map(c => `<span class="tag">${c}</span>`).join('')}<button class="chip" data-a="grpAll" aria-pressed="${!!S.grpAll}">Tout le club</button></div>` : ''}${prop.length && edit ? `<button class="btn full ghost" data-a="grpBulk" data-g="${g.id}" data-ids="${prop.join(',')}">Ajouter d'un coup les ${prop.length} adhérents proposés</button>` : ''}
  <div>${
    list.length
      ? list
          .map(p => {
            const on = g.mem.includes(p);
            return `<div class="item">${av(p, 'sm')}<span class="grow"><span class="nm">${name(p)}</span> ${bd(p, sp)}</span>${edit ? `<button class="btn sm ${on ? '' : 'ghost'}" data-a="grpToggle" data-g="${g.id}" data-id="${p}" aria-pressed="${on}">${on ? 'Membre' : 'Ajouter'}</button>` : ''}</div>`;
          })
          .join('')
      : empty('users', 'Aucun adhérent ne correspond', 'Élargis à tout le club.')
  }</div></div>`;
    return h;
  },
  reports() {
    const K = { post: 'Publication', msg: 'Message', com: 'Commentaire' };
    return `<div class="pad"><div class="note">Chaque adhérent peut signaler une publication, un message ou un commentaire. Le bureau décide de le supprimer ou de l'ignorer. Si le problème vient d'un membre du bureau ou d'un encadrant, l'adhérent peut s'adresser à l'éditeur de l'appli ou à la plateforme publique Signal-sports.</div>${REPORTS.length ? REPORTS.map((r, i) => `<div class="card"><span class="kicker">${K[r.kind]} de ${name(r.author)} · signalé par ${first(r.by)}</span><p>${r.excerpt}</p><div class="ctl"><button class="btn sm hot grow" data-a="repDel" data-i="${i}">Supprimer le contenu</button><button class="btn sm ghost grow" data-a="repIgn" data-i="${i}">Ignorer</button></div></div>`).join('') : empty('shield', 'Aucun signalement', 'Rien à examiner pour le moment.')}<a class="btn ghost full" href="https://signal-sports.sports.gouv.fr" target="_blank" rel="noopener">Signal-sports ${ic('link')}</a></div>`;
  },
  legal() {
    return `<div class="pad"><h2 class="tilt sm">Conditions <em>et confidentialité</em></h2><div class="note">Texte d'exemple. Les vraies conditions devront être rédigées et validées par un juriste avant la mise en ligne.</div><div class="prose"><p><b>Qui voit quoi.</b> Ton nom, ton classement et tes résultats sont visibles par les adhérents du club. Ton téléphone, ton e-mail et ton réseau social sont masqués tant que tu ne les actives pas. Aucun âge n'est affiché, seulement une catégorie.</p><p><b>Mineurs.</b> Le compte d'un jeune de moins de 15 ans est créé par son représentant légal, qui peut le consulter et le supprimer. Un compte jeune n'a ni messagerie privée ni abonnés, n'apparaît pas dans l'annuaire, et ses résultats ne sont visibles que de son groupe, de ses parents et des encadrants. Le parent décide de l'autorisation photo.</p><p><b>Signalement.</b> Publications, messages et commentaires peuvent être signalés. Le bureau du club les examine ; un recours existe auprès de l'éditeur et de la plateforme publique Signal-sports.</p><p><b>Suppression et départ.</b> Un compte supprimé l'est sous 30 jours ; ses messages restent sous le nom « Ancien membre ». Un adhérent qui quitte le club sort de l'appli et ses données sont effacées après le délai fixé par le club.</p></div></div>`;
  },
  join() {
    const I2 = CLUBINFO;
    return `<div class="pad"><div class="card"><span class="kicker">Code du club</span><span class="h3" style="font-size:32px;letter-spacing:.08em">${I2.code}</span><p class="muted small">L'adhérent télécharge l'appli, entre ce code, et sa demande arrive ici pour validation.</p><button class="btn sm" data-a="copy" data-txt="Rejoins ${esc(club().name)} sur l'appli du club avec le code ${I2.code}">Copier l'invitation</button></div>
  <div><span class="kicker">Demandes à valider · ${JOINREQ.length}</span>${
    JOINREQ.length
      ? JOINREQ.map(
          (j, i) =>
            `<div class="item cv"><span class="av sm" style="--h:${hue(j.n)}">${j.n
              .split(' ')
              .map(w => w[0])
              .join(
                ''
              )}</span><span class="grow"><span class="nm">${esc(j.n)}</span><br><span class="muted small">${esc(j.mail)} · via ${j.via}</span></span><span class="tri"><button class="btn sm grow" data-a="joinOk" data-i="${i}">Valider</button><button class="btn sm ghost grow" data-a="joinNo" data-i="${i}">Refuser</button></span></div>`
        ).join('')
      : '<p class="muted small" style="padding-top:8px">Aucune demande en attente.</p>'
  }</div>${(() => {
    const l = Object.keys(M).filter(
      k => k !== 'club' && VALID[k] && VALID[k] !== S.season && !JOINREQ.some(j => j.id === k)
    );
    return l.length
      ? `<div><span class="kicker">Pas encore revalidés pour ${S.season} · ${l.length}</span><p class="muted small">Ils n'ont accès qu'à leur profil. Réactive ceux qui ont repris leur adhésion, ou attends leur demande.</p>${l.map(k => `<div class="item">${av(k, 'sm')}<span class="grow"><span class="nm">${name(k)}</span><br><span class="muted small">Dernière saison : ${VALID[k]}</span></span><button class="btn sm" data-a="revalid" data-id="${k}">Réactiver</button></div>`).join('')}</div>`
      : '';
  })()}
  <div class="card"><span class="kicker">Importer la liste des adhérents</span><p class="muted small">Un fichier CSV, une ligne par adhérent : prénom ; nom ; e-mail. Depuis Excel : Fichier, Enregistrer sous, CSV. Chaque adhérent reçoit une invitation par e-mail.</p><div class="fld"><label for="imp-file">Fichier</label><input type="file" id="imp-file" accept=".csv,text/csv,text/plain"></div><div id="imp-prev"></div></div>
  <div class="stats"><div><b>${I2.joined}</b><span>Dans l'appli</span></div><div><b>${I2.members}</b><span>Adhérents</span></div><div><b>${S.invited || 0}</b><span>Invités</span></div><div><b>${JOINREQ.length}</b><span>À valider</span></div></div></div>`;
  },
  comm(id) {
    const c = COMMS.find(c => c.id === id),
      me = ME(),
      can = isBureau() || c.resp === me,
      isM = c.mem.includes(me),
      pend = c.req.includes(me);
    return `<div class="pad"><div class="phero"><span class="kicker">Commission</span><h2 class="tilt">${c.name}</h2><p>${c.desc}</p></div>
  ${can ? c.req.map(r => `<div class="card reqc"><span class="row">${av(r, 'sm')}<span class="grow"><span class="nm">${name(r)}</span> souhaite rejoindre la commission</span></span><div class="ctl"><button class="btn sm grow" data-a="commReq" data-id="${c.id}" data-u="${r}" data-ok="1">Accepter</button><button class="btn sm ghost grow" data-a="commReq" data-id="${c.id}" data-u="${r}" data-ok="">Refuser</button></div></div>`).join('') : ''}
  <div><span class="kicker">Responsable</span><button class="item" data-a="member" data-id="${c.resp}">${av(c.resp, 'sm')}<span class="grow"><span class="nm">${name(c.resp)}</span> ${bd(c.resp)}</span><span class="bd cap">Responsable</span></button></div>
  <div><span class="kicker">Membres · ${c.mem.length}</span>${
    c.mem
      .filter(x => x !== c.resp)
      .map(
        x =>
          `<button class="item" data-a="member" data-id="${x}">${av(x, 'sm')}<span class="grow"><span class="nm">${name(x)}</span> ${bd(x)}</span></button>`
      )
      .join('') || '<p class="muted small" style="padding-top:8px">Pas encore d\'autre membre.</p>'
  }</div>
  ${S.role === 'kid' ? '' : isM ? (c.resp === me ? '' : `<button class="btn full ghost" data-a="commLeave" data-id="${c.id}">Quitter la commission</button>`) : pend ? `<span class="btn ext full" aria-disabled="true">Demande envoyée · en attente de réponse</span><button class="btn sm ghost" data-a="commAsk" data-id="${c.id}">Annuler ma demande</button>` : `<button class="btn full" data-a="commAsk" data-id="${c.id}">Demander à rejoindre</button>`}
  ${can ? `<button class="btn full ghost" data-a="newPost" data-k="commpromo" data-c="${c.id}">Promouvoir sur le mur</button>` : ''}</div>`;
  },
  partners() {
    return `<div class="pad"><p class="muted">Les entreprises qui soutiennent ${club().name}.</p>${PARTNERS.length ? `<div class="pgrid">${PARTNERS.map(x => `<div class="pcard">${plogo(x, 'big')}<span class="nm">${x.name}</span><span class="muted small">${x.desc || ''}</span>${isAdmin() ? `<label class="btn sm ghost">Changer le logo<input type="file" accept="image/*" data-plogo="${x.id}" hidden></label><button class="btn sm ghost" data-a="delPartner" data-id="${x.id}">Retirer</button>` : ''}</div>`).join('')}</div>` : empty('club', 'Aucun partenaire', 'Ajoute le premier partenaire du club.')}
  ${isAdmin() ? `<div class="ctl"><button class="btn grow" data-a="newPost" data-k="partner">Ajouter un partenaire</button><button class="btn grow ghost" data-a="newPost" data-k="ad">Créer une pub</button></div>` : ''}</div>`;
  },
  member(id) {
    return profile(id);
  },
  me() {
    return profile(ME());
  }
};
