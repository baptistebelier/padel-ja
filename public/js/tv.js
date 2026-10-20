/* PADEL JA — Écran TV (1920×1080, mis à l'échelle de la fenêtre) — charte /RAM */
(function () {
  'use strict';
  const E = Engine, A = App, esc = A.esc;
  const $ = s => document.querySelector(s);
  const stage = $('#stage');
  const VIEW_H = 860;
  let S = null, R = {}, view = null, rotIdx = 0, rotTimer = null, rotKey = '';

  function fit() {
    const k = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `translate(${(innerWidth - 1920 * k) / 2}px, ${(innerHeight - 1080 * k) / 2}px) scale(${k})`;
  }
  addEventListener('resize', fit); fit();
  document.addEventListener('dblclick', e => {
    if (e.target.closest('.dcard')) return;
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); else document.exitFullscreen();
  });

  const TITLES = { bracket: 'Tableau final', poules: 'Poules', schedule: 'Programmation', live: 'En direct', standings: 'Classement live', info: 'Le tournoi', draw: 'Tirage au sort' };

  A.connect(st => { S = st; R = A.R; $('#waiting').hidden = true; update(); }, ok => { if (!ok) $('#waiting').hidden = false; });
  setInterval(() => { $('#clock').textContent = A.hhmm(Date.now()); }, 1000);

  // tirage au sort : clavier (pavé numérique) aussi depuis la fenêtre TV
  const keys = A.cardKeys(() => { const c = S && E.currentPot(S.draw); return c ? c.pot.cards.length : 0; }, n => A.send('draw/flip', { n }).catch(() => {}),
    b => { const d = $('#dBufTv'); if (d) d.textContent = b ? 'Carte n° ' + b : ''; });
  document.addEventListener('keydown', e => { if (view === 'draw' && S && E.currentPot(S.draw)) keys(e); });

  /* ---------- rendu clé/valeur ---------- */
  const sigs = {};
  function keyed(el, sig, build, values) {
    if (sigs[el.id] !== sig) { el.innerHTML = build(); sigs[el.id] = sig; el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); }
    const v = values();
    el.querySelectorAll('[data-k]').forEach(x => { if (x.dataset.k in v) A.setText(x, v[x.dataset.k]); });
    el.querySelectorAll('[data-h]').forEach(x => {
      const h = v[x.dataset.h]; if (h == null) return;
      if (x.dataset.last !== h) { const first = x.dataset.last == null; x.innerHTML = h; x.dataset.last = h; if (!first) { x.classList.remove('bump'); void x.offsetWidth; x.classList.add('bump'); } }
    });
    el.querySelectorAll('[data-c]').forEach(x => { const c = v['c:' + x.dataset.c]; if (c != null && x.dataset.cls !== c) { x.dataset.cls = c; x.className = x.dataset.base + ' ' + c; } });
  }

  function update() {
    const t = S.tournament;
    $('#tName').textContent = t.name || '';
    $('#tSub').textContent = [t.category + ' ' + t.gender, t.club].filter(Boolean).join(' — ');
    const lg = t.logoLight || t.logo;   // fond sombre : version claire si elle existe
    const logo = $('#logo'); if (lg) { if (logo.src !== lg) logo.src = lg; logo.hidden = false; } else logo.hidden = true;
    // bandeau : message du JA, partenaires (logo et/ou nom), nom du tournoi
    const items = [];
    if (S.display.ticker) items.push(`<span class="ti-msg">${esc(S.display.ticker)}</span>`);
    (t.sponsors || []).forEach(sp => {
      if (!sp.logo && !sp.name) return;
      items.push(`<span class="ti-sp">${sp.logo ? `<img src="${sp.logo}" alt="">` : ''}${sp.name ? `<b>${esc(sp.name)}</b>` : ''}</span>`);
    });
    if (t.name) items.push(`<span class="ti-msg">${esc(t.name)} · ${esc(t.category)} ${esc(t.gender)}</span>`);
    const run = items.join('<i class="ti-sep">✦</i>') + '<i class="ti-sep">✦</i>';
    const tk = $('#tickIn');
    A.marquee(tk, `<div class="ti-run">${run}</div>`, 90);
    setupRotation();
    showView(currentView());
    [renderBracket, renderPoules, renderSchedule, renderLive, renderStandings, renderInfo, renderDraw].forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  }

  /* ---------- rotation ---------- */
  function rotList() {
    // écrans choisis par le JA, sauf ceux qui n'ont rien à montrer
    const want = S.display.rotateViews || ['bracket', 'poules', 'schedule', 'live', 'standings'];
    const ok = { bracket: S.matches.some(m => m.phase === 'TF'), poules: S.poules.length || S.matches.some(m => m.phase === 'Q'),
      schedule: true, live: true, standings: !!(S.draw && S.draw.built), info: true };
    const l = want.filter(v => ok[v]);
    return l.length ? l : ['schedule'];
  }
  function currentView() { return S.display.rotate ? rotList()[rotIdx % rotList().length] : S.display.tv; }
  function setupRotation() {
    const key = S.display.rotate + ':' + S.display.rotateSec;
    if (key === rotKey) return;
    rotKey = key; clearInterval(rotTimer);
    if (S.display.rotate) rotTimer = setInterval(() => { rotIdx++; showView(currentView()); }, Math.max(5, S.display.rotateSec || 20) * 1000);
  }
  function showView(v) {
    if (v === view) return;
    view = v;
    document.querySelectorAll('.view').forEach(x => x.classList.toggle('on', x.id === 'v-' + v));
    document.body.classList.toggle('pointer', v === 'draw');
    let title = TITLES[v] || '';
    if (v === 'poules' && !S.poules.length) title = 'Qualifications';
    A.setText($('#viewTitle'), title, 'slide');
  }

  /* ---------- helpers score ---------- */
  function setsHtml(m, side, compact) {
    const r = R[m.id]; if (!r) return '';
    if (r.woTeam) return r.woTeam === side ? '<i class="wo">WO</i>' : '';
    const sc = r.score; if (!sc) return '';
    let h = sc.sets.map(s => `<i class="${s.w === side ? 'w' : ''}">${s.stb ? s.stb[side] : s[side]}${s.tb && s.w !== side ? `<sup>${s.tb[side]}</sup>` : ''}</i>`).join('');
    if (r.state === 'live' && !sc.manual) {
      if (sc.mode === 'game') h += `<i class="cur">${sc.games[side]}</i>` + (compact ? '' : `<i class="pts">${sc.labels[side]}</i>`);
      else h += `<i class="pts tbp">${sc.points[side]}</i>`;
    }
    return h;
  }
  const tagOf = (m, tl) => {
    const r = R[m.id];
    if (r.state === 'live') return `<b class="live-dot"></b>En direct${m.court ? ' · ' + esc(A.courtName(m.court)) : ''}`;
    if (r.state === 'done') return r.woTeam ? 'Forfait' : 'Terminé';
    if (m.court && tl[m.id]) return `~${A.hhmm(tl[m.id].start)} · ${esc(A.courtName(m.court))}`;
    return '';
  };
  const rowCls = (m, side) => {
    const r = R[m.id], id = r[side];
    return [r.winner && r.winner === id && id !== 'BYE' ? 'win' : '', r.loser && r.loser === id && r.state === 'done' ? 'lose' : '', id === 'BYE' ? 'bye' : '', r.state === 'live' && r.score && r.score.server === side ? 'srv' : ''].join(' ');
  };
  const short = name => name.replace(' / ', '/');

  /* =====================================================================
     TABLEAU FINAL — arborescence en miroir, finale au centre
     ===================================================================== */
  function renderBracket() {
    const el = $('#bCards'), svg = $('#bLines');
    const main = S.matches.filter(m => m.phase === 'TF' && m.a === 1 && m.size <= 32);
    if (!main.length) { keyed(el, 'none', () => `<div class="empty"><span class="band lime">Tableau final</span><small>affiché après le tirage au sort</small></div>`, () => ({})); svg.innerHTML = ''; svg.dataset.l = ''; return; }
    const tl = E.timeline(S, R);
    const sizes = [...new Set(main.map(m => m.size))].sort((a, b) => b - a);
    // tableau classique de gauche à droite : 1er tour à gauche, finale à droite
    // les cases grandissent d'un tour à l'autre jusqu'au bord droit de l'écran
    const final = main.find(m => m.size === 2);
    const nCols = sizes.length;
    const top = 34, H = VIEW_H - 80, gapX = 44;
    const weights = sizes.map((sz, c) => 1 + 0.38 * c + (sz === 2 ? 0.25 : 0));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const usable = 1920 - 56 - gapX * (nCols - 1);
    const colWs = weights.map(w => usable * w / sumW);
    const n0 = main.filter(m => m.size === sizes[0]).length;
    const ch0 = Math.max(44, Math.min(112, H / n0 - 38));
    const pos = {};
    let x = 28;
    sizes.forEach((sz, c) => {
      const ms = main.filter(m => m.size === sz).sort((a, b) => a.idx - b.idx);
      const slot = H / ms.length;
      const w = colWs[c];
      const h = sz === 2 ? Math.min(260, H * 0.3) : Math.max(ch0, Math.min(slot - 46, ch0 * (1 + 0.5 * c), 220));
      ms.forEach((m, i) => { pos[m.id] = { x, y: top + slot * (i + 0.5) - h / 2, w, h, left: true, final: sz === 2 }; });
      x += w + gapX;
    });
    const fsOf = p => Math.round(Math.max(15, Math.min(p.final ? 46 : 40, p.h * 0.3, p.w * 0.085)));
    const champPos = final ? { x: pos[final.id].x, y: pos[final.id].y + pos[final.id].h + 70, w: pos[final.id].w } : null;
    const sig = S.draw.id + ':' + main.length;
    keyed(el, sig, () => {
      return main.map(m => {
        const p = pos[m.id]; if (!p) return '';
        const row = side => `<div class="bc-row" data-c="${m.id}${side}" data-base="bc-row"><span class="seed" data-k="${m.id}${side}s"></span><span class="nm" data-k="${m.id}${side}n"></span><span class="sets" data-h="${m.id}${side}h"></span></div>`;
        return `<div class="bc ${p.final ? 'final' : ''}" data-c="${m.id}" data-base="bc ${p.final ? 'final' : ''}" style="left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px;font-size:${fsOf(p)}px">
          ${p.final ? `<div class="f-title"><span class="band pink">Finale</span></div>` : ''}${row('A')}${row('B')}<div class="bc-tag" data-h="${m.id}t"></div></div>`;
      }).join('') + (final ? `<div class="champ" data-c="champ" data-base="champ" style="left:${champPos.x}px;top:${champPos.y}px;width:${champPos.w}px"><small class="band lime">Vainqueurs</small><div data-k="champN"></div></div>` : '');
    }, () => {
      const v = {};
      main.forEach(m => {
        const r = R[m.id];
        ['A', 'B'].forEach(s => {
          const id = r[s], fin = pos[m.id] && pos[m.id].final;
          v[m.id + s + 'n'] = r.staticBye && id === 'BYE' ? 'Exempt' : ((pos[m.id] ? pos[m.id].w : 0) >= 280 || fin ? A.sideName(m, s, 'last') : short(A.sideName(m, s, 'last')));
          v[m.id + s + 's'] = A.seedOf(id) || '';
          v[m.id + s + 'h'] = setsHtml(m, s, (pos[m.id] ? pos[m.id].w : 0) < 320 && !fin);
          v['c:' + m.id + s] = rowCls(m, s);
        });
        v[m.id + 't'] = tagOf(m, tl);
        v['c:' + m.id] = 'st-' + r.state + (r.staticBye ? ' isbye' : '');
      });
      if (final) { const r = R[final.id]; v.champN = r.state === 'done' ? A.pairName(r.winner, 'initial') : ''; v['c:champ'] = r.state === 'done' ? 'show' : ''; }
      return v;
    });
    let lines = '';
    main.forEach(m => {
      const p = pos[m.id]; if (!p || p.final) return;
      const parent = S.matches.find(x => x.phase === 'TF' && x.a === 1 && ((x.srcA && x.srcA.from === m.id) || (x.srcB && x.srcB.from === m.id)));
      const q = parent && pos[parent.id]; if (!q) return;
      const done = R[m.id].state === 'done' || R[m.id].state === 'bye';
      const y1 = p.y + p.h / 2, y2 = q.y + q.h / 2;
      const x1 = p.left ? p.x + p.w : p.x, x2 = p.left ? q.x : q.x + q.w, mx = (x1 + x2) / 2;
      lines += `<path d="M${x1} ${y1}H${mx}V${y2}H${x2}" class="${done ? 'done' : ''}"/>`;
    });
    if (svg.dataset.l !== lines) { svg.innerHTML = lines; svg.dataset.l = lines; }
  }

  /* =====================================================================
     POULES / QUALIFICATIONS
     ===================================================================== */
  function renderPoules() {
    const el = $('#poulesGrid');
    if (S.poules.length) {
      const n = S.poules.length;
      const k = S.draw.formula === 'poules_tf' ? (+S.tournament.pouleQualif || 2) : 0;
      const tl = E.timeline(S, R);
      const data = S.poules.map(P => ({ P, st: E.pouleStandings(S, R, P.id), ms: S.matches.filter(m => m.phase === 'P' && m.poule === P.id) }));
      const sig = 'p:' + S.draw.id + ':' + data.map(d => d.st.rows.map(x => x.pair).join(',')).join('|');
      const cols = n <= 2 ? n : n <= 4 ? 2 : n <= 6 ? 3 : 4;
      el.style.setProperty('--pcols', cols);
      keyed(el, sig, () => data.map(({ P, st }) => `<div class="pcard">
          <div class="pc-h"><span class="band lime">Poule ${P.id}</span><em data-k="pd${P.id}"></em></div>
          <div class="pc-rows"><div class="pc-r hd"><span></span><span></span><span>J</span><span>Pts</span><span>Sets</span><span>Jeux</span></div>
          ${st.rows.map((x, i) => `<div class="pc-r ${i < k ? 'q' : ''}"><b>${i + 1}</b><span class="nm">${esc(A.pairName(x.pair, 'initial'))}</span><span data-k="pj${x.pair}"></span><span class="pts" data-k="pp${x.pair}"></span><span data-k="ps${x.pair}"></span><span data-k="pg${x.pair}"></span></div>`).join('')}</div>
          <div class="pc-next" data-h="pn${P.id}"></div></div>`).join(''), () => {
        const v = {};
        data.forEach(({ P, st, ms }) => {
          st.rows.forEach(x => { v['pj' + x.pair] = x.played; v['pp' + x.pair] = x.pts; v['ps' + x.pair] = (x.sw - x.sl > 0 ? '+' : '') + (x.sw - x.sl); v['pg' + x.pair] = (x.gw - x.gl > 0 ? '+' : '') + (x.gw - x.gl); });
          v['pd' + P.id] = st.complete ? 'Terminée' : `${ms.filter(m => R[m.id].state === 'done').length}/${ms.length} matchs`;
          const live = ms.filter(m => R[m.id].state === 'live');
          const next = ms.filter(m => R[m.id].state === 'ready' || R[m.id].state === 'waiting').sort((a, b) => (tl[a.id] ? tl[a.id].start : 9e15) - (tl[b.id] ? tl[b.id].start : 9e15))[0];
          v['pn' + P.id] = live.map(m => `<div class="pl"><b class="live-dot"></b>${esc(short(A.sideName(m, 'A')))} <i>${esc(E.scoreText(R[m.id]))}</i> ${esc(short(A.sideName(m, 'B')))}</div>`).join('') +
            (next && !live.length ? `<div class="pn">Prochain : ${esc(short(A.sideName(next, 'A')))} — ${esc(short(A.sideName(next, 'B')))} ${tl[next.id] ? '· ~' + A.hhmm(tl[next.id].start) : ''}</div>` : '');
        });
        return v;
      });
      return;
    }
    const q = S.matches.filter(m => m.phase === 'Q');
    if (!q.length) { keyed(el, 'none', () => '<div class="empty"><span class="band lime">Poules</span><small>pas de poules ni de qualifications</small></div>', () => ({})); return; }
    const sizes = [...new Set(q.map(m => m.size))].sort((a, b) => b - a);
    el.style.setProperty('--pcols', 1);
    keyed(el, 'q:' + S.draw.id, () => `<div class="qcols">${sizes.map(sz => {
      const ms = q.filter(m => m.size === sz).sort((a, b) => a.idx - b.idx);
      return `<div class="qcol"><h4>${ms[0].qfinal ? 'Tour décisif' : 'Tour ' + ms[0].depth}</h4><div class="qcol-in">${ms.map(m => `<div class="qm" data-c="${m.id}" data-base="qm">
        <div class="bc-row" data-c="${m.id}A" data-base="bc-row"><span class="nm" data-k="${m.id}An"></span><span class="sets" data-h="${m.id}Ah"></span></div>
        <div class="bc-row" data-c="${m.id}B" data-base="bc-row"><span class="nm" data-k="${m.id}Bn"></span><span class="sets" data-h="${m.id}Bh"></span></div></div>`).join('')}</div></div>`;
    }).join('')}<div class="qcol qout"><h4>Qualifiés</h4><div class="qcol-in">${q.filter(m => m.qfinal).sort((a, b) => a.idx - b.idx).map((m, i) => `<div class="qq"><b>Q${i + 1}</b><span data-k="${m.id}w"></span></div>`).join('')}</div></div></div>`, () => {
      const v = {};
      q.forEach(m => {
        const r = R[m.id];
        ['A', 'B'].forEach(s => { v[m.id + s + 'n'] = r.staticBye && r[s] === 'BYE' ? 'Exempt' : short(A.sideName(m, s, 'last')); v[m.id + s + 'h'] = setsHtml(m, s, true); v['c:' + m.id + s] = rowCls(m, s); });
        v['c:' + m.id] = 'st-' + r.state + (r.staticBye ? ' isbye' : '');
        if (m.qfinal) v[m.id + 'w'] = r.winner && r.winner !== 'BYE' ? A.pairName(r.winner, 'initial') : 'À déterminer';
      });
      return v;
    });
  }

  /* =====================================================================
     PROGRAMMATION — colonnes par terrain
     ===================================================================== */
  function renderSchedule() {
    const el = $('#schedGrid');
    if (!S.draw || !S.draw.built) { keyed(el, 'none', () => '<div class="empty"><span class="band lime">Programmation</span><small>à venir</small></div>', () => ({})); return; }
    const tl = E.timeline(S, R), PS = E.pairsStatus(S, R, tl);
    const cols = S.courts.map(c => {
      const q = S.matches.filter(m => m.court === c.id && !R[m.id].staticBye).sort((a, b) => a.order - b.order);
      const done = q.filter(m => R[m.id].state === 'done');
      return { c, last: done[done.length - 1], todo: q.filter(m => R[m.id].state !== 'done').slice(0, 5) };
    });
    const sig = 'sch:' + cols.map(x => x.c.id + x.c.name + '|' + (x.last ? x.last.id : '') + '|' + x.todo.map(m => m.id + R[m.id].state).join(',')).join(';');
    keyed(el, sig, () => cols.map(({ c, last, todo }) => `
      <div class="scol">
        <div class="scol-h">${esc(c.name)}</div>
        ${last ? `<div class="sres"><span>Dernier :</span> <b data-k="${last.id}rw"></b> <i data-k="${last.id}rs"></i></div>` : ''}
        ${todo.map((m, i) => `
          <div class="smatch ${i === 0 ? 'first' : ''}" data-c="${m.id}" data-base="smatch ${i === 0 ? 'first' : ''}">
            <div class="sm-top"><span class="sm-time" data-h="${m.id}tm"></span><span class="sm-round">${esc(E.matchLabel(m))} · ${R[m.id].fk}</span></div>
            ${['A', 'B'].map(s => `<div class="sm-row" data-c="${m.id}${s}" data-base="sm-row"><span data-k="${m.id}${s}n"></span><span class="sets" data-h="${m.id}${s}h"></span></div>`).join('')}
          </div>`).join('') || '<div class="sfree">Terrain libre</div>'}
      </div>`).join(''), () => {
      const v = {};
      cols.forEach(({ last, todo }) => {
        if (last) { const r = R[last.id]; v[last.id + 'rw'] = A.pairName(r.winner); v[last.id + 'rs'] = E.winnerScoreText(r); }
        todo.forEach(m => {
          const r = R[m.id];
          v[m.id + 'tm'] = r.state === 'live' ? '<b class="live-dot"></b>En cours' : (tl[m.id] ? '~' + A.hhmm(tl[m.id].start) : '');
          ['A', 'B'].forEach(s => {
            v[m.id + s + 'n'] = A.sideName(m, s, 'initial');
            const st = PS[r[s]];
            v[m.id + s + 'h'] = r.state === 'live' ? setsHtml(m, s) : (st && st.state === 'rest' ? `<em class="rst">Repos ${A.dur(st.restLeft)}</em>` : '');
            v['c:' + m.id + s] = rowCls(m, s);
          });
          v['c:' + m.id] = 'st-' + r.state;
        });
      });
      return v;
    });
    el.style.setProperty('--cols', Math.max(1, cols.length));
  }

  /* =====================================================================
     SCORES EN DIRECT
     ===================================================================== */
  function renderLive() {
    const el = $('#liveGrid');
    const items = [];
    S.courts.forEach(c => {
      const q = S.matches.filter(m => m.court === c.id && !R[m.id].staticBye).sort((a, b) => a.order - b.order);
      const m = q.find(x => R[x.id].state === 'live') || q.find(x => R[x.id].state === 'ready');
      if (m) items.push({ c, m });
    });
    const sig = 'live:' + items.map(x => x.c.id + x.m.id).join(',');
    keyed(el, sig, () => items.length ? items.map(({ c, m }) => `
      <div class="lpanel" data-c="${m.id}" data-base="lpanel">
        <div class="lp-h"><b>${esc(c.name)}</b><span>${esc(E.matchLabel(m))} · ${R[m.id].fk}</span><em data-h="${m.id}st"></em></div>
        ${['A', 'B'].map(s => `<div class="lp-row" data-c="${m.id}${s}" data-base="lp-row"><span class="ball"></span><span class="nm" data-k="${m.id}${s}n"></span><span class="flag" data-k="${m.id}${s}f"></span><span class="sets" data-h="${m.id}${s}h"></span></div>`).join('')}
      </div>`).join('') : '<div class="empty"><span class="band pink">Aucun match</span><small>en cours pour le moment</small></div>', () => {
      const v = {};
      items.forEach(({ m }) => {
        const r = R[m.id];
        const fl = r.score && !r.score.manual && r.state === 'live' ? E.pointFlags(r.fk, m.points, m.firstServer) : {};
        ['A', 'B'].forEach(s => { v[m.id + s + 'n'] = A.sideName(m, s, 'initial'); v[m.id + s + 'h'] = setsHtml(m, s); v[m.id + s + 'f'] = fl[s] || (fl.decisive && r.score.server === s ? 'Point décisif' : ''); v['c:' + m.id + s] = rowCls(m, s); });
        v[m.id + 'st'] = r.state === 'live' ? '<b class="live-dot"></b>En direct' : 'À suivre';
        v['c:' + m.id] = 'st-' + r.state;
      });
      return v;
    });
    el.style.setProperty('--n', Math.max(1, items.length));
    const done = S.matches.filter(m => R[m.id].state === 'done' && m.endedAt).sort((a, b) => b.endedAt - a.endedAt).slice(0, 6);
    keyed($('#lastRes'), 'lr:' + done.map(m => m.id).join(','), () => `<h3><span class="band lime">Résultats</span></h3>` + done.map(m => {
      const r = R[m.id];
      return `<div class="lr"><small>${esc(E.matchLabel(m))}</small><b>${esc(A.pairName(r.winner, 'last'))}</b><span>bat ${esc(A.pairName(r.loser, 'last'))}</span><i>${esc(E.winnerScoreText(r))}</i></div>`;
    }).join(''), () => ({}));
  }

  /* =====================================================================
     CLASSEMENT
     ===================================================================== */
  function renderStandings() {
    const el = $('#standGrid');
    // classement en temps réel : blocs de places qui se scindent au fil des tours, avec les points FFT
    const LS = E.liveStandings(S, R);
    const pts = g => (g.ptsHi == null ? '' : g.exact || g.ptsHi === g.ptsLo ? `${g.ptsHi} pts` : `${g.ptsLo} à ${g.ptsHi} pts`);
    el.style.setProperty('--fs', LS.N > 24 ? '18px' : LS.N > 16 ? '21px' : '25px');
    keyed(el, 'st:' + JSON.stringify(LS.groups.map(g => [g.lo, g.hi, g.pairs])), () => LS.groups.length ? LS.groups.map(g => `
      <div class="rkb ${g.exact ? 'exact' : ''} ${g.exact && g.lo <= 3 ? 'p' + g.lo : ''}">
        <div class="rkb-h"><b>${g.exact ? g.lo + (g.lo === 1 ? 'er' : 'e') : `Places ${g.lo}–${g.hi}`}</b><span>${pts(g)}</span></div>
        <div class="rkb-p">${g.pairs.map(p => `<div>${esc(A.pairName(p, 'initial'))}</div>`).join('')}</div></div>`).join('')
      : '<div class="empty"><span class="band lime">Classement</span><small>après le tirage au sort</small></div>', () => ({}));
  }

  /* =====================================================================
     FICHE TOURNOI
     ===================================================================== */
  function renderInfo() {
    const t = S.tournament, el = $('#infoBox');
    const fmt = k => (k ? `${k} — ${E.FORMATS[k].name}` : '');
    const sel = E.selection(S);
    const d = t.dateStart ? new Date(t.dateStart).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const f = t.formula || 'tf';
    const rows = [['Date', d], ['Club', [t.club, t.address].filter(Boolean).join(' — ')], ['Juge-arbitre', [t.ja, t.jaNumber].filter(Boolean).join(' · ')],
      ['Formule', `${E.FORMULAS[f]} · ${sel.main.length} paires`],
      f.startsWith('poules') ? ['Poules', fmt(t.formatPoule || t.formatMain)] : null, f === 'qualif_tf' ? ['Qualifs', fmt(t.formatQualif || t.formatMain)] : null,
      f !== 'poules' ? ['Tableau', fmt(t.formatMain)] : null, f !== 'poules' && t.formatQuarter ? ['1/4 de finale', fmt(t.formatQuarter)] : null, f !== 'poules' && t.formatSemi ? ['1/2 finales', fmt(t.formatSemi)] : null, f !== 'poules' ? ['Finale', fmt(t.formatFinal || t.formatSemi || t.formatMain)] : null,
      ['Balles', t.balls], ['Dotation', t.prize], ['Infos', t.notes]].filter(r => r && r[1]);
    const lg = t.logoLight || t.logo;
    keyed(el, 'info:' + JSON.stringify(rows) + t.name + t.category + (lg || '').length, () => `
      <div class="info-l">${lg ? `<img src="${lg}">` : '<img src="/img/ram-logo-rouge-blanc.png" class="ramimg">'}<h1>${esc(t.name)}</h1><div class="cat"><span class="band lime">${esc(t.category)}</span> <span class="band pink">${esc(t.gender)}</span></div></div>
      <div class="info-r">${rows.map(r => `<div class="ir"><span>${esc(r[0])}</span><b>${esc(r[1])}</b></div>`).join('')}</div>`, () => ({}));
  }

  /* =====================================================================
     TIRAGE AU SORT — cartes cliquables
     ===================================================================== */
  function renderDraw() {
    const el = $('#drawBox');
    const D = S.draw;
    if (!D) { keyed(el, 'nodraw', () => `<div class="empty"><span class="band pink">Tirage au sort</span><small>à venir · ${E.selection(S).main.length} paires inscrites</small></div>`, () => ({})); return; }
    const ps = A.potState();
    const cur = E.currentPot(D) || (ps && ps.linger ? ps : null);
    if (!cur) {
      keyed(el, 'drawdone:' + D.id + JSON.stringify(D.sessions.map(s => s.fill)), () => `<div class="dd-done"><h2><span class="band lime">Tirage terminé</span></h2><div class="dd-res">${D.sessions.map(s => resultHtml(s, D)).join('')}</div></div>`, () => ({}));
      return;
    }
    const { session, pot } = cur;
    if (!$('#potTv') || sigs.drawBox !== 'live:' + D.id) {
      sigs.drawBox = 'live:' + D.id;
      el.innerHTML = `<div class="dl-main"><div class="dl-head"><span class="tag" id="dSess"></span><h2 id="dPot"></h2><div class="dl-hint" id="dHint"></div></div>
        <div id="potTv" class="pot-tv"></div><div class="dbuffer" id="dBufTv"></div></div><aside class="dl-side" id="dSide"></aside>`;
    }
    $('#dSess').textContent = session.label + (D.sessions.length > 1 ? ` · étape ${D.sessions.indexOf(session) + 1}/${D.sessions.length}` : '');
    const potHtml = `<span class="band lime">${esc(pot.label)}</span>`;
    if ($('#dPot').dataset.h !== potHtml) { $('#dPot').innerHTML = potHtml; $('#dPot').dataset.h = potHtml; $('#dPot').classList.remove('slide'); void $('#dPot').offsetWidth; $('#dPot').classList.add('slide'); }
    const left = pot.cards.length - pot.next;
    $('#dHint').textContent = `${pot.hint ? pot.hint + ' — ' : ''}${left} carte${left > 1 ? 's' : ''} face cachée`;
    A.renderPot($('#potTv'), { width: 1180, height: 600, maxW: 250, gap: 26, onFlip: n => A.send('draw/flip', { n }).catch(() => {}), onRefresh: () => S && update() });
    const side = resultHtml(session, D);
    const sd = $('#dSide'); if (sd.dataset.h !== side) { sd.innerHTML = side; sd.dataset.h = side; }
  }

  function resultHtml(s, D) {
    const lastPos = D.last && D.last.session === s.key ? String(D.last.pos) : null;
    if (s.kind === 'poules') {
      return `<div class="rs"><h4>${esc(s.label)}</h4><div class="rs-poules">${s.letters.map((L, i) => `<div><h5>Poule ${L}</h5>${Array.from({ length: s.sizes[i] }, (_, r) => {
        const tk = s.fill[`${L}:${r}`];
        return `<p class="${tk ? '' : 'empty'} ${lastPos === `${L}:${r}` ? 'new' : ''}">${tk ? esc(A.pairName(tk, 'last')) : '—'}</p>`; }).join('')}</div>`).join('')}</div></div>`;
    }
    // premier tour du tableau, sous forme de matchs : on voit qui jouera contre qui
    const slots = E.sessionSlots(s);
    const nM = slots.length / 2, cols = nM > 16 ? 2 : 1;
    const line = i => {
      const tk = slots[i], ts = tk && A.seedOf(tk);
      return `<div class="fr-l ${tk === 'BYE' ? 'bye' : ''} ${tk ? 'shown' : ''} ${lastPos === String(i) ? 'new' : ''}"><b>${i + 1}</b>${ts ? `<i>${ts}</i>` : ''}<span>${tk ? esc(A.pairName(tk, 'last')) : ''}</span></div>`;
    };
    return `<div class="rs"><h4>${esc(s.label)} · 1er tour</h4><div class="fr" style="--rows:${Math.ceil(nM / cols)};--cols:${cols}">${Array.from({ length: nM }, (_, k) =>
      `<div class="fr-m">${line(2 * k)}${line(2 * k + 1)}</div>`).join('')}</div></div>`;
  }
})();
