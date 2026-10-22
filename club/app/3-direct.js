/* /RAM Club — app/3-direct.js : Bandeaux de notification, rencontres en direct et score, photos jointes.
   Morceau de l'ancien app.js : les fichiers app/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
/* Bandeau de notification qui descend du haut, puis remonte ; un toucher ouvre la cible, un glissé vers le haut le range */
/* Un seul bandeau visible à la fois : les suivants s'accumulent derrière avec un compteur « +N » qui ouvre la liste des notifications. Ceux du direct sont rouges */
function banner(n) {
  if (S.blocked.has(n.by) || !nVis(n) || (pending() && !n.mine)) return;
  const st = nstack(),
    cur = st.querySelector('.nban.on:not(.tst)');
  if (cur) {
    cur._q = (cur._q || 0) + 1;
    let c = cur.querySelector('.bq');
    if (!c) {
      c = document.createElement('span');
      c.className = 'bq';
      c.setAttribute('role', 'button');
      c.setAttribute('tabindex', '0');
      cur.appendChild(c);
    }
    c.textContent = '+' + cur._q;
    c.setAttribute(
      'aria-label',
      cur._q + ' autre' + (cur._q > 1 ? 's' : '') + ' notification' + (cur._q > 1 ? 's' : '') + ' : ouvrir la liste'
    );
    cur.classList.add('stk');
    clearTimeout(cur._t);
    cur._t = setTimeout(() => banHide(cur), 5000);
    return;
  }
  const r = n.go && n.go.v === 'rec' && recs.find(x => x.id === n.go.id),
    live = n.live || !!r,
    ttl = live ? 'Direct' + (r ? ' · ' + teamName(grp(r.tid)) : '') : name(n.by);
  const b = document.createElement('button');
  b.className = 'nban' + (live ? ' live' : '') + (n.tier != null ? ' troph' : '');
  b._n = n;
  b.innerHTML = n.head
    ? `<span class="lvb ${n.kind || ''}${n.tier != null ? ' medal t' + n.tier : ''}">${ic(n.kind === 'win' || n.tier != null ? 'trophy' : 'score')}</span><span class="grow"><span class="bk">${n.kick ? esc(n.kick) : `Direct · ${esc(n.team)} · ${esc(n.sc)}`}</span><span class="bh">${esc(n.head)}</span><span class="bd2">${esc(n.det)}</span></span>`
    : `${live ? `<span class="lvb">${ic('score')}</span>` : av(n.by, 'sm')}<span class="grow"><span class="nm">${ttl}</span> ${live && n.by !== 'club' ? name(n.by) + ' ' : ''}${esc(n.txt)}</span><time>maintenant</time>`;
  b.setAttribute('aria-label', 'Notification : ' + ttl + ' ' + n.txt);
  st.prepend(b);
  void b.offsetWidth;
  b.classList.add('on');
  b._t = setTimeout(() => banHide(b), 5000);
}
function banHide(b) {
  if (!b) {
    document.querySelectorAll('.nban.on').forEach(x => banHide(x));
    return;
  }
  clearTimeout(b._t);
  let p = b.previousElementSibling;
  while (p && !p.classList.contains('on')) p = p.previousElementSibling;
  if (p) b.classList.add('out');
  b.classList.remove('on');
  b.style.transform = '';
  setTimeout(() => b.remove(), 450);
}
/* Bandeau du direct : on voit tout de suite l'équipe, le score de la rencontre, ce qui vient de se passer et qui est concerné */
const deX = x => (/^[aeiouyhéèêâîô]/i.test(x) ? "d'" + x : 'de ' + x);
const ours = m => (m.a ? name(m.a) : m.an || club().short);
const setsTxt = m =>
  m.sets
    .filter(s => s[0] + s[1] > 0)
    .map(s => s.join('-'))
    .join(' ');
/* Qui reçoit quoi pendant un direct (réglage « Convocations et scores de mon équipe ») :
   - 'rec'   début et fin de rencontre : tous les adhérents qui ont gardé le réglage ;
   - 'match' détail match par match : joueurs de la compo, capitaine, bureau, parents d'un joueur, adhérents qui suivent le joueur, ou ceux qui ont activé « Détail des matchs en direct » ;
   - 'cap'   consignes de saisie : capitaine de l'équipe et bureau seulement. */
function liveFor(r, scope, m) {
  if (!S.nset.team) return false;
  const g = grp(r.tid),
    me = ME();
  if (scope === 'cap') return canTeam(g);
  if (scope !== 'match') return true;
  if (S.nset.live || canTeam(g)) return true;
  const compo = new Set([...Object.keys(r.lineup || {}), ...(r.ms || []).map(x => x.a).filter(Boolean)]),
    kids = M[me].kids || [];
  return compo.has(me) || kids.some(k => compo.has(k)) || !!(m && m.a && (S.follow.has(m.a) || kids.includes(m.a)));
}
function liveNote(r, head, det, kind, scope, m) {
  if (!liveFor(r, scope || 'rec', m)) return;
  const team = teamName(grp(r.tid)),
    sc = teamScore(r).join(' - '),
    n = {
      by: 'club',
      txt: `${team} · ${head} : ${det}`,
      head,
      det,
      kind,
      team,
      sc,
      t: "À l'instant",
      n: 1,
      go: { v: 'rec', id: r.id },
      live: 1
    };
  NOTIFS.unshift(n);
  if (NOTIFS.length > 30) NOTIFS.pop();
  banner(n);
}
const liveStart = (r, m) =>
  liveNote(
    r,
    `Début du ${m.l.toLowerCase()}`,
    `${ours(m)} contre ${m.b[0]}${m.court ? ' · ' + m.court : ''}`,
    'start',
    'match',
    m
  );
/* Une notification ciblée (changement de cours) n'apparaît que chez les élèves concernés et leurs parents */
let nVis = n => !n.to || n.to.includes(ME()) || (M[ME()].kids || []).some(k => n.to.includes(k));
const msgList = ref => {
  const [k, id] = ref.split(':');
  if (k === 'p') {
    const p = posts.find(p => p.id === id);
    return p ? p.com : null;
  }
  const o = k === 'c' ? chans.find(c => c.id === id) : recs.find(r => r.id === id);
  return o ? (k === 'c' ? o.msgs : o.chat) : null;
};
/* après une action sur un commentaire, on rouvre la fenêtre des commentaires au lieu de la fermer */
const comBack = ref => {
  if (!ref || !ref.startsWith('p:')) return false;
  const p = posts.find(p => p.id === ref.slice(2));
  if (!p) return false;
  sheet('Commentaires', commentsBody(p), true);
  return true;
};

/* ---------- score en direct ---------- */
function addGame(r, i, side) {
  const m = r.ms[i];
  if (m.st !== 'live') return;
  const k = m.sets.length - 1,
    st = m.sets[k];
  st[side]++;
  S.flash = [i, side, k];
  const a = st[side],
    b = st[1 - side];
  if (r.stb && k === 2 ? a >= 10 && a - b >= 2 : (a >= 6 && a - b >= 2) || a === 7) {
    const w = [0, 0];
    m.sets.forEach(s => w[s[0] > s[1] ? 0 : 1]++);
    if (w[side] === 2) {
      m.st = 'done';
      m.w = side;
      if (m.a && side === 0 && S.follow.has(m.a) && !liveFor(r, 'match', m))
        notify('follow', m.a, `a gagné son match contre ${m.b[0]}`, { v: 'rec', id: r.id }, true);
      liveNote(
        r,
        `${side === 0 ? 'Victoire' : 'Défaite'} ${deX(ours(m))}`,
        `${m.l} · ${side === 0 ? 'bat' : 'perd contre'} ${m.b[0]} ${setsTxt(m)}`,
        side === 0 ? 'win' : 'loss',
        'match',
        m
      );
      if (r.ms.every(x => x.st === 'done')) {
        if (S.scoring)
          liveNote(r, 'Tous les matchs sont terminés', 'Vérifie les scores puis clôture la rencontre', 'start', 'cap');
        else endRec(r);
      } else if (!S.scoring) {
        const n = r.ms.find(x => x.st === 'soon');
        if (n) {
          n.st = 'live';
          n.sets = [[0, 0]];
          liveStart(r, n);
        }
      }
    } else m.sets.push([0, 0]);
  }
}
/* Fin de rencontre : le résultat part tout seul sur le mur et la discussion du direct s'efface */
function endRec(r) {
  const auto = !S.scoring,
    v = view(),
    inp = $('msg-input'),
    draft = inp && v.v === 'rec' && v.id === r.id ? inp.value.trim() : '';
  r.st = 'done';
  delete r.chat;
  S.scoring = false;
  const s = teamScore(r);
  const pid = 'p' + Date.now();
  posts.unshift({
    id: pid,
    by: 'club',
    t: "À l'instant",
    kind: 'result',
    rec: r.id,
    likes: 0,
    com: draft ? [{ by: ME(), x: draft }] : []
  });
  notify('club', 'club', `a publié le résultat : ${teamName(grp(r.tid))} ${s[0]} à ${s[1]} contre ${r.opp}`, {
    v: 'post',
    id: pid
  });
  liveNote(
    r,
    `Fin de rencontre · ${s[0] > s[1] ? 'victoire' : s[0] < s[1] ? 'défaite' : 'match nul'} ${s[0]} à ${s[1]}`,
    `Contre ${r.opp} · ${draft ? 'ton message est publié en commentaire du résultat' : 'résultat publié sur le mur'}`,
    s[0] > s[1] ? 'win' : s[0] < s[1] ? 'loss' : 'start'
  );
  /* Le brouillon tapé dans le chat du direct n'est jamais perdu : il part en commentaire du résultat, et on le dit */
  if (draft)
    setTimeout(() => toast('La rencontre est terminée : ton message a été publié en commentaire du résultat'), 50);
}
/* Bandeau au-dessus du champ de message quand une photo est jointe */
function showAtt() {
  const a = $('att');
  if (!a) return;
  a.hidden = !S.img && !S.reply;
  a.innerHTML =
    (S.reply
      ? `<span class="quote grow">Réponse à ${S.reply.by === 'club' ? club().short : first(S.reply.by)} : ${esc(S.reply.x).slice(0, 70)}</span><button type="button" class="ib rnd" data-a="unreply" aria-label="Annuler la réponse">${ic('x')}</button>`
      : '') +
    (S.img
      ? `<span class="ph" style="background-image:url(${S.img})"></span><span class="grow"><span class="nm">Photo jointe</span><br><span class="muted small">Elle partira avec ton message.</span></span><button type="button" class="ib rnd" data-a="unattach" aria-label="Retirer la photo">${ic('x')}</button>`
      : '');
}
/* Pendant le direct, on ne redessine que les scores affichés, pas tout l'écran */
function liveRefresh(r) {
  const v = view();
  if ($('sheet')) return;
  if (v.v === 'rec') {
    if (v.id === r.id) render(true);
    return;
  }
  if (!['home', 'club', 'agenda'].includes(v.v)) return;
  if (r.st !== 'live') {
    render(true);
    return;
  }
  const s = teamScore(r);
  document.querySelectorAll(`[data-live="${r.id}"]`).forEach(e => (e.textContent = s.join(' - ')));
  document.querySelectorAll(`[data-live2="${r.id}"]`).forEach(e => (e.innerHTML = `<b>${s[0]}</b> · ${s[1]}`));
}
function shrinkLogo(file, cb) {
  const fr = new FileReader();
  fr.onload = () => {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, 600 / im.width, 240 / im.height),
        c = document.createElement('canvas');
      c.width = Math.round(im.width * k) || 600;
      c.height = Math.round(im.height * k) || 240;
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      cb(c.toDataURL('image/png'));
    };
    im.src = fr.result;
  };
  fr.readAsDataURL(file);
}
function shrink(file, cb) {
  const fr = new FileReader();
  fr.onload = () => {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, 900 / im.width),
        c = document.createElement('canvas');
      c.width = im.width * k;
      c.height = im.height * k;
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      cb(c.toDataURL('image/jpeg', 0.8));
    };
    im.src = fr.result;
  };
  fr.readAsDataURL(file);
}

