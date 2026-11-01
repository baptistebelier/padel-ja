/* /RAM Coach — coach/6-groupes.js : ce qui se fait depuis un groupe d'enseignement, et deux outils de l'accueil.
   - Programmer des séances : un pack, un cycle, un abonnement ou une formule à la séance donne le nombre de séances
     et le tarif ; les dates se règlent une par une (déplacer, retirer, ajouter). Les dates hors du créneau du groupe
     sont rangées dans g.extra, celles qu'on retire dans g.skip (comme une séance déplacée, data.js trainOn) ; un
     pack ou un cycle s'arrête après sa dernière date (g.to). Les séances apparaissent aussitôt dans le planning,
     l'Agenda et l'École de /RAM Club.
   - La discussion du groupe dans /RAM Club : la créer si elle manque (la supprimer : app/14-discussions.js).
   - Messages : conversations et groupes favoris, épinglés en haut (sur cet appareil).
   - Accueil : bilans à écrire sélectionnés comme des mails, puis retirés d'un coup (séance marquée « sans bilan »,
     brouillon effacé). */

/* ---------- favoris des Messages ---------- */
function coFavs() {
  if (!S.coFav) {
    try {
      S.coFav = JSON.parse(localStorage.getItem('coach-favs') || '[]');
    } catch (e) {
      S.coFav = [];
    }
  }
  return S.coFav;
}
const coIsFav = k => coFavs().includes(k);
/* une ligne de conversation avec son étoile : la ligne ouvre la conversation, l'étoile l'épingle en haut */
const coFavRow = (k, open, inner, label) =>
  `<div class="item cofr${coIsFav(k) ? ' fav' : ''}"><button class="cofav" ${open}>${inner}</button><button class="ib costar" data-a="coFav" data-k="${k}" aria-pressed="${coIsFav(k)}" aria-label="${coIsFav(k) ? 'Retirer ' + esc(label) + ' des favoris' : 'Mettre ' + esc(label) + ' en favori'}">${ic('star')}</button></div>`;

/* ---------- accueil : sélection des bilans à écrire ---------- */
function coSelBar() {
  const all = S.coBil || [],
    pick = (S.coPick || []).filter(id => all.includes(id)),
    every = all.length && pick.length === all.length;
  return `<div class="card cosbar"><button class="item cosel" data-a="coPickAll" aria-pressed="${!!every}"><span class="cochk" aria-hidden="true">${ic('check')}</span><span class="grow"><span class="nm">Tout sélectionner</span><br><span class="muted small">${pick.length ? plural(pick.length, 'bilan sélectionné', 'bilans sélectionnés') : 'Touche les bilans à retirer'}</span></span></button><button class="btn sm hot full" data-a="coPickDel" ${pick.length ? '' : 'disabled'}>${ic('trash')}Retirer des bilans à traiter</button><p class="muted small">Une séance retirée ne demande plus de bilan ; un brouillon retiré est effacé. Rien n'est envoyé aux élèves.</p></div>`;
}

/* ---------- formule d'un groupe : ce qu'il suit et où il en est ---------- */
function coGrpOffer(g) {
  const [t, ref] = (g.offre || '').split(':'),
    found = !g.offre
      ? null
      : t === 'pack'
        ? OFFRES.packs.find(p => p.id === ref)
        : t === 'abo'
          ? OFFRES.abos.find(a => a.id === ref)
          : foOf(ref),
    act = !found
      ? 'data-a="open" data-v="formules"'
      : `data-a="${t === 'pack' ? 'coPkEdit' : t === 'abo' ? 'coAbEdit' : 'coFoEdit'}" data-id="${ref}"`;
  return `<button class="cotile cotile-go" ${act}>${ic('ball')}<b class="cotxt">${found ? esc(ofLabel(t, ref)) : 'À choisir'}</b><span>Formule · modifier</span></button>`;
}
/* la jauge du cycle (ui/7-ecole.js), avec la taille du pack */
const coCycleBar = g => {
  const cur = REGLES.cycleCourant(g, TODAY),
    of = (cur && cur.offre) || g.offre || '',
    pk = of.startsWith('pack:') ? OFFRES.packs.find(p => p.id === of.slice(5)) : null;
  return cycleBar(g, pk ? ' · pack de ' + pk.seances : '');
};
/* ---------- les cycles d'un groupe : chaque séance rattachée à un cycle, même après coup ----------
   g.cycles (regles.js). Un cycle se crée depuis Programmer des séances, qui reprend les séances déjà faites. */
const coCycleSes = g => d => sesFind(g, d);
const coCycleNums = v =>
  String(v || '')
    .split(/[^\d]+/)
    .filter(Boolean)
    .map(Number)
    .filter(n => n > 0);
/* les séances du groupe qui ne sont dans aucun cycle */
function coHorsCycle(g) {
  const from = g.from || isoIn(-365);
  return coDates(g, from, g.to && g.to > isoIn(180) ? g.to : isoIn(180)).filter(
    d => !isCx(g, d) && !REGLES.cycleDe(g, d)
  );
}
function coCyclesHtml(g) {
  if (g.once) return '';
  const l = g.cycles || [],
    hors = coHorsCycle(g).filter(d => d <= TODAY).length,
    ligne = c => {
      const E = REGLES.cycleEtat(g, c, coCycleSes(g), TODAY),
        trop = c.n && c.n !== E.prevues;
      return `<div class="cokv"><span class="grow"><b>${esc(c.nom)}</b><br><span class="muted small">${E.faites} faites sur ${E.prevues}${E.aVerifier ? ' · ' + E.aVerifier + ' à vérifier' : ''}${(c.pay || []).length ? ' · paiement aux séances ' + c.pay.join(', ') : ''}</span>${trop ? `<br><span class="small" style="color:var(--hot)">${E.prevues} séances rattachées pour un pack de ${c.n}</span>` : ''}</span><button class="btn sm ghost" data-a="coCycleSeances" data-id="${g.id}" data-c="${c.id}">Séances</button><button class="ib" data-a="coPlan" data-id="${g.id}" data-c="${c.id}" aria-label="Modifier ${esc(c.nom)}">${ic('edit')}</button></div>`;
    };
  return `<span class="kicker" style="margin-top:12px">Cycles</span>${l.map(ligne).join('')}${hors && l.length ? `<p class="muted small">${plural(hors, 'séance passée', 'séances passées')} dans aucun cycle : rattache-les avec « Séances ».</p>` : ''}<button class="btn sm ghost full" data-a="coPlan" data-id="${g.id}" data-c="new">${ic('plus')}${l.length ? 'Nouveau cycle' : hors ? 'Créer le cycle avec les séances déjà faites' : 'Créer un cycle'}</button>`;
}
/* rattacher une date à un cycle : elle quitte l'autre cycle, et devient une séance du groupe si besoin */
function coCycleSet(g, c, list) {
  (g.cycles || []).forEach(x => x !== c && (x.dates = (x.dates || []).filter(d => !list.includes(d))));
  c.dates = [...new Set(list)].sort();
  c.dates.forEach(d => coDates(g, d, d).length || coDateOn(g, d));
}
/* un paiement par numéro de séance, parts égales */
function coPayPlan(prix, nums) {
  const part = Math.floor(((+prix || 0) * 100) / nums.length) / 100;
  return nums.map((s, i) => ({
    s,
    m: i === nums.length - 1 ? Math.round(((+prix || 0) - part * (nums.length - 1)) * 100) / 100 : part,
    ok: ''
  }));
}
/* la formule du cycle notée pour les élèves du groupe, avec ses numéros de séance ; un élève déjà noté ne change pas */
function coCycleAchats(g, c) {
  const [t, ref] = String(c.offre || '').split(':');
  if (t !== 'pack' && t !== 'abo') return 0;
  const o = (t === 'pack' ? OFFRES.packs : OFFRES.abos).find(x => x.id === ref);
  if (!o) return 0;
  const cle = g.id + ':' + c.id,
    d0 = (c.dates || [])[0] || TODAY,
    nums = (c.pay || []).length ? c.pay : (o.ech || []).length ? o.ech : [1];
  let n = 0;
  coStu(g).forEach(k => {
    const e = coElGet(k);
    if ((e.achats || []).some(a => a.cycle === cle)) return;
    const a = {
      id: 'h' + Date.now().toString(36) + n,
      t,
      ref,
      d: d0,
      nom: ofLabel(t, ref),
      prix: +o.prix || 0,
      cycle: cle,
      pay: { ech: coPayPlan(o.prix, nums) }
    };
    if (t === 'pack') a.n = o.seances;
    e.achats = (e.achats || []).concat(a);
    n++;
  });
  return n;
}
/* séances d'un cycle où cet élève a été présent : c'est elles qui déclenchent ses paiements */
function coCycleUsed(a, k) {
  const [gid, cid] = String(a.cycle || '').split(':'),
    g = grp(gid),
    c = g && (g.cycles || []).find(x => x.id === cid);
  return c ? c.dates.filter(d => !isCx(g, d) && ((sesFind(g, d) || {}).pres || {})[k] === 'P').length : 0;
}
/* sur la fiche d'une séance : son cycle, à tout moment */
function coSesCycle(g, d) {
  if (g.once || !(g.cycles || []).length) return '';
  const c = REGLES.cycleDe(g, d),
    x = c && REGLES.cycleEtat(g, c, coCycleSes(g), TODAY).seances.find(s => s.d === d);
  return `<div class="card"><div class="fld" style="margin:0"><label for="co-s-cy">Cycle de cette séance</label><select id="co-s-cy" data-g="${g.id}" data-d="${d}"><option value="">Aucun</option>${g.cycles.map(k => `<option value="${k.id}" ${c === k ? 'selected' : ''}>${esc(k.nom)}</option>`).join('')}</select></div>${x && x.num ? `<p class="muted small">Séance ${x.num} du cycle${(c.pay || []).includes(x.num) ? ' · paiement demandé à cette séance' : ''}</p>` : ''}</div>`;
}
document.addEventListener('change', e => {
  if (e.target.id !== 'co-s-cy') return;
  const g = grp(e.target.dataset.g),
    d = e.target.dataset.d,
    c = (g.cycles || []).find(x => x.id === e.target.value);
  if (c) coCycleSet(g, c, (c.dates || []).concat(d));
  else (g.cycles || []).forEach(x => (x.dates = (x.dates || []).filter(y => y !== d)));
  coSave(c ? 'Séance rattachée à ' + c.nom : 'Séance retirée du cycle');
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'co-cy-ses') return;
  e.preventDefault();
  const g = grp(e.target.dataset.id),
    c = g && (g.cycles || []).find(x => x.id === e.target.dataset.c);
  if (!c) return;
  coCycleSet(
    g,
    c,
    [...e.target.querySelectorAll('input:checked')].map(x => x.value)
  );
  closeSheet();
  coSave(plural(c.dates.length, 'séance') + ' dans ' + c.nom);
});
Object.assign(A, {
  coCycleSeances(d) {
    const g = grp(d.id),
      c = g && (g.cycles || []).find(x => x.id === d.c);
    if (!c) return;
    const E = REGLES.cycleEtat(g, c, coCycleSes(g), TODAY),
      lab = { done: 'Faite', vide: 'Pas d’appel', now: "Aujourd'hui", next: 'À venir', cx: 'Annulée' },
      etat = x => {
        const y = E.seances.find(s => s.d === x);
        if (y) return lab[y.etat];
        return x > TODAY
          ? 'À venir'
          : Object.values((sesFind(g, x) || {}).pres || {}).some(v => v === 'P')
            ? 'Faite'
            : 'Pas d’appel';
      },
      autre = x => {
        const k = REGLES.cycleDe(g, x);
        return k && k !== c ? ' · dans ' + esc(k.nom) : '';
      },
      dates = [
        ...new Set(
          coDates(g, g.from || isoIn(-365), g.to && g.to > isoIn(180) ? g.to : isoIn(180)).concat(c.dates || [])
        )
      ].sort();
    sheet(
      c.nom,
      `<form class="body" id="co-cy-ses" data-id="${g.id}" data-c="${c.id}"><p class="muted small">Coche les séances de ce cycle, même celles qui sont déjà passées.</p><div class="list">${dates.map(x => `<label class="chk" for="cs-${x}"><input type="checkbox" id="cs-${x}" value="${x}" ${(c.dates || []).includes(x) ? 'checked' : ''}>${fmtD(x)}<span class="muted small"> · ${etat(x)}${autre(x)}</span></label>`).join('')}</div><button class="btn full">Enregistrer</button></form>`
    );
  }
});

/* ---------- périodes sans cours (vacances scolaires, fermeture du club…) ----------
   g.off = [{ nom, du, au }] : le créneau du groupe ne donne pas de séance ces jours-là (data.js trainOn) ;
   une séance ajoutée à la main pendant une période (g.extra) a lieu quand même */
function coOffHtml(g) {
  if (g.once) return '';
  const hits = coVacHits().filter(x => x.g === g);
  const l = (g.off || []).slice().sort((a, b) => a.du.localeCompare(b.du)),
    past = o => o.au < TODAY;
  return `${hd(ic('ban') + 'Périodes sans cours', `<button class="chip" data-a="coOffAdd" data-id="${g.id}">${ic('plus')}Ajouter</button>`)}${
    l.length
      ? list(
          l
            .map(
              o =>
                `<div class="item"><span class="tile">${ic('cal')}</span><span class="grow${past(o) ? ' muted' : ''}"><span class="nm">${esc(o.nom || 'Pas de cours')}</span><br><span class="muted small">Du ${fmtD(o.du)} au ${fmtD(o.au)}</span></span><button class="ib" data-a="coOffDel" data-id="${g.id}" data-du="${o.du}" data-au="${o.au}" aria-label="Retirer la période ${esc(o.nom || '')}">${ic('x')}</button></div>`
            )
            .join('')
        )
      : `<div class="card"><p class="muted small">Vacances scolaires, fermeture du club : pendant ces périodes, le créneau du groupe ne donne pas de séance.</p></div>`
  }<div class="card"><div class="cokv"><span class="muted">Pendant les vacances du club</span><span class="cocyc"><span class="muted small">${g.vacClub ? 'Le cycle s’arrête' : 'Le cycle continue'}</span><button class="tg" role="switch" aria-checked="${!!g.vacClub}" data-a="coVacFollow" data-id="${g.id}" aria-label="${esc(g.name)} : suivre les vacances du club"></button></span></div>${hits.length ? `<p class="small">${plural(hits.length, 'séance tombe', 'séances tombent')} pendant des vacances : ${hits.map(x => fmtD(x.d)).join(', ')}.</p><button class="btn sm ghost full" data-a="coVacClear" data-id="${g.id}">${ic('trash')}Retirer ces séances</button>` : ''}</div>`;
}

/* ---------- vacances : celles de l'enseignant (OFFRES.conges) et celles de chaque club (OFFRES.vacClubs[club]) ----------
   rangées sur le compte de l'enseignant. Aucune séance n'est proposée pendant ses vacances ; un groupe qui suit les
   vacances du club (g.vacClub) n'en propose pas non plus pendant celles-ci. Une séance déjà programmée n'est jamais
   retirée d'office : elle est signalée, à traiter d'un geste. Copier les vacances du club est fait une fois, sans lien. */
const coVacClub = c => ((OFFRES.vacClubs || {})[c] || []).slice();
const coVacOff = g => (g.off || []).concat(OFFRES.conges || [], g.vacClub ? coVacClub(coClubOf(g)) : []);
/* les séances à venir qui tombent pendant des vacances */
function coVacHits() {
  const out = [],
    in_ = (d, l) => l.find(o => d >= o.du && d <= o.au);
  coGroups('', true)
    .filter(g => coIsGrp(g) && !coOver(g))
    .forEach(g => {
      const me = OFFRES.conges || [],
        cl = g.vacClub ? coVacClub(coClubOf(g)) : [];
      if (!me.length && !cl.length) return;
      coDates(g, isoIn(1), g.to && g.to < isoIn(365) ? g.to : isoIn(365)).forEach(d => {
        const o = !isCx(g, d) && (in_(d, me) || in_(d, cl));
        if (o) out.push({ g, d, o });
      });
    });
  return out.sort((a, b) => a.d.localeCompare(b.d));
}
function coVacList(kind, l) {
  return l.length
    ? l
        .slice()
        .sort((a, b) => a.du.localeCompare(b.du))
        .map(
          o =>
            `<div class="cokv"><span>${esc(o.nom || 'Vacances')}<br><span class="muted small">Du ${fmtD(o.du)} au ${fmtD(o.au)}</span></span><button class="ib" data-a="coVacDel" data-k="${kind}" data-du="${o.du}" data-au="${o.au}" aria-label="Retirer ${esc(o.nom || 'cette période')}">${ic('x')}</button></div>`
        )
        .join('')
    : '<p class="muted small">Aucune période.</p>';
}
function coVacCard() {
  const clubs = coClubList(),
    hits = coVacHits();
  return coPCard(
    'Disponibilités',
    'Mes vacances',
    `${coVacList('me', OFFRES.conges || [])}<div class="cotools"><button class="btn sm ghost" data-a="coVacAdd" data-k="me">${ic('plus')}Ajouter</button>${clubs.length ? `<button class="btn sm ghost" data-a="coVacCopy">${ic('calmove')}Calquer sur les vacances du club</button>` : ''}</div>${clubs
      .map(
        c =>
          `<span class="kicker" style="margin-top:12px">Vacances du club · ${esc(c.name)}</span>${coVacList(c.id, coVacClub(c.id))}<button class="btn sm ghost full" data-a="coVacAdd" data-k="${c.id}">${ic('plus')}Ajouter une période</button>`
      )
      .join(
        ''
      )}${hits.length ? `<span class="kicker" style="margin-top:12px">${plural(hits.length, 'séance programmée', 'séances programmées')} pendant des vacances</span><div class="list">${hits.map(x => `<button class="item" data-a="open" data-v="seance" data-id="${sesKey(x.g, x.d)}"><span class="tile">${ic('cal')}</span><span class="grow"><span class="nm">${esc(x.g.name)}</span><br><span class="muted small">${fmtD(x.d)} · ${esc(x.o.nom || 'Vacances')}</span></span></button>`).join('')}</div><button class="btn sm ghost full" data-a="coVacClear">${ic('trash')}Retirer ces séances</button>` : ''}<p class="muted small">Ces périodes sont les tiennes : un autre enseignant du club règle les siennes. Rien n'est retiré du planning sans ton geste.</p>`
  );
}
/* ---------- disponibilités : les périodes où je travaille, par jour et par lieu ----------
   le planning montre ce qui reste libre ; les élèves réservent sur ces plages depuis /RAM Club. */
const COJOURS = [1, 2, 3, 4, 5, 6, 0];
const hMinTxt = n => Math.floor(n / 60) + ' h' + (n % 60 ? ' ' + String(n % 60).padStart(2, '0') : '');
const coOccupe = d =>
  coSessions(d, d, 'me', 1)
    .filter(x => !isCx(x.g, x.d))
    .map(x => [hMin(x.g.h), hMin(x.g.h) + durMin(x.g.dur)]);
/* ce qui reste libre un jour donné (au moins une heure) ; rien pour un jour passé */
const coLibre = d => (d < TODAY ? [] : REGLES.plagesLibres(OFFRES.dispos, d, coOccupe(d), OFFRES.conges, 60));
const coLibreHtml = d =>
  coLibre(d)
    .map(
      p =>
        `<div class="cofree">${ic('clock')}<span>Libre ${hMinTxt(p.du)} – ${hMinTxt(p.au)}${p.lieu ? ' · ' + esc(p.lieu) : ''}</span></div>`
    )
    .join('');
function coDispoCard() {
  const l = OFFRES.dispos || [];
  return coPCard(
    'Réservation',
    'Mes disponibilités',
    `${
      COJOURS.filter(j => l.some(x => +x.jour === j))
        .map(j =>
          l
            .map((x, i) => [x, i])
            .filter(([x]) => +x.jour === j)
            .sort((a, b) => a[0].du.localeCompare(b[0].du))
            .map(
              ([x, i]) =>
                `<div class="cokv"><span>${DAYS[j]}<br><span class="muted small">${esc(x.du)} – ${esc(x.au)}${x.lieu ? ' · ' + esc(x.lieu) : ''}</span></span><button class="ib" data-a="coDispoDel" data-i="${i}" aria-label="Retirer ${DAYS[j]} ${esc(x.du)}">${ic('x')}</button></div>`
            )
            .join('')
        )
        .join('') ||
      '<p class="muted small">Indique quand tu travailles : ce qui reste libre s’affiche dans ton planning.</p>'
    }<button class="btn sm ghost full" data-a="coDispoAdd">${ic('plus')}Ajouter une période</button><p class="muted small">Les élèves réservent sur ces plages depuis ta fiche dans /RAM Club : il faut aussi une formule individuelle dans tes tarifs.</p>`
  );
}
/* page publique, agendas reliés, Calendly : chacun réserve par l'outil qu'il a, le temps de passer à l'appli */
const coResaUrl = () => location.origin + '/r/' + encodeURIComponent(RAM.club) + '/' + encodeURIComponent(ME());
const coCopie = (t, msg) =>
  navigator.clipboard
    ? navigator.clipboard.writeText(t).then(
        () => toast(msg),
        () => toast(t)
      )
    : toast(t);
function coOutilsCard() {
  const live = !!(window.RAM && RAM.live),
    ouverte = live && OFFRES.page === RAM.club,
    cals = OFFRES.icals || [];
  return coPCard(
    'Réservation',
    'Mes outils de réservation',
    `<span class="kicker">Page publique, sans compte</span>${
      ouverte
        ? `<p class="muted small">Ta page est ouverte. Pour le site ou la boutique Shopify, colle le bloc dans une section « Liquid personnalisé ».</p><div class="ctl" style="flex-wrap:wrap"><button class="btn sm grow" data-a="coResaLien">${ic('cal')}Copier le lien</button><button class="btn sm ghost grow" data-a="coResaBloc">${ic('edit')}Copier le bloc</button><button class="btn sm ghost grow" data-a="coResaPage" data-v="0">${ic('x')}Fermer la page</button></div>`
        : `<p class="muted small">Quelqu’un sans compte réserve un cours individuel sur tes plages libres : questionnaire, confirmation par e-mail, annulation jusqu’à 24 h avant.</p><button class="btn sm ghost full" data-a="coResaPage" data-v="1">${ic('cal')}Ouvrir ma page dans ce club</button>`
    }<span class="kicker" style="margin-top:12px">Google Agenda et autres</span><p class="muted small">Tes cours confirmés arrivent dans ton agenda : copie le lien, puis dans Google Agenda : Autres agendas, À partir de l’URL.</p><button class="btn sm ghost full" data-a="coAgendaLien">${ic('cal')}Copier le lien de mes cours</button><p class="muted small">Dans l’autre sens, ce qui est posé dans ton agenda n’est plus réservable dans l’appli : ajoute son adresse secrète au format iCal.</p>${cals.map((u, i) => `<div class="cokv"><span class="muted small">Agenda ${i + 1} relié</span><button class="ib" data-a="coIcalDel" data-i="${i}" aria-label="Retirer l’agenda ${i + 1}">${ic('x')}</button></div>`).join('')}${cals.length < 5 ? `<button class="btn sm ghost full" data-a="coIcalAdd">${ic('plus')}Relier un agenda</button>` : ''}<span class="kicker" style="margin-top:12px">Calendly</span><p class="muted small">Il reste en service : ton lien (« Lien de réservation » de ta fiche) est proposé à côté de la réservation dans l’appli, et chaque réservation Calendly arrive à ton planning.</p><button class="btn sm ghost full" data-a="coCalendly">${ic('plus')}Relier mon compte Calendly</button>`
  );
}
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id === 'co-ical') {
    e.preventDefault();
    OFFRES.icals = (OFFRES.icals || []).concat($('co-ic').value.trim());
    closeSheet();
    ofSave('Agenda relié');
  }
  if (f.id === 'co-cal') {
    e.preventDefault();
    if (!(window.RAM && RAM.live)) return toast('Démonstration : rien n’est relié');
    fetch('/api/coach/calendly', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: $('co-ct').value })
    })
      .then(r => r.json().then(x => (r.ok ? x : Promise.reject(new Error(x.error)))))
      .then(x => {
        closeSheet();
        toast('Calendly relié' + (x.email ? ' : ' + x.email : ''));
      })
      .catch(x => toast(x.message || 'Calendly indisponible'));
  }
});
Object.assign(A, {
  coResaPage(d) {
    if (!(window.RAM && RAM.live)) return toast('Démonstration : la page s’ouvre depuis ton compte');
    if (d.v === '1') OFFRES.page = RAM.club;
    else delete OFFRES.page;
    ofSave(d.v === '1' ? 'Page ouverte' : 'Page fermée');
  },
  coResaLien() {
    coCopie(coResaUrl(), 'Lien copié');
  },
  coResaBloc() {
    coCopie(
      `<iframe src="${coResaUrl()}" title="Réserver un cours" style="width:100%;height:1100px;border:0" loading="lazy"></iframe>`,
      'Bloc copié'
    );
  },
  coAgendaLien() {
    if (!(window.RAM && RAM.live)) return toast('Démonstration : le lien vient de ton compte');
    fetch('/api/coach/agenda-lien', { credentials: 'include' })
      .then(r => r.json())
      .then(x => coCopie(x.lien, 'Lien copié : il est privé, ne le partage pas'))
      .catch(() => toast('Lien indisponible'));
  },
  coIcalAdd() {
    sheet(
      'Relier un agenda',
      `<form class="body" id="co-ical"><div class="fld"><label for="co-ic">Adresse secrète au format iCal</label><input id="co-ic" required autocomplete="off" placeholder="https://calendar.google.com/calendar/ical/…"></div><button class="btn full">Relier</button><p class="muted small">Dans Google Agenda : Paramètres, ton agenda, Adresse secrète au format iCal. Seules les heures sont lues, jamais les titres. Les journées entières ne bloquent rien. Google, Outlook et iCloud seulement.</p></form>`
    );
  },
  coIcalDel(d) {
    OFFRES.icals = (OFFRES.icals || []).filter((x, i) => i !== +d.i);
    ofSave('Agenda retiré');
  },
  coCalendly() {
    sheet(
      'Relier mon compte Calendly',
      `<form class="body" id="co-cal"><div class="fld"><label for="co-ct">Jeton personnel Calendly</label><input id="co-ct" type="password" required autocomplete="off"></div><button class="btn full">Relier</button><p class="muted small">Dans Calendly : Intégrations, API et webhooks. Le jeton sert une seule fois, à inscrire /RAM auprès de Calendly : il n’est pas gardé.</p></form>`
    );
  }
});
Object.assign(A, {
  coDispoAdd() {
    sheet(
      'Période de travail',
      `<form class="body" id="co-dispo"><div class="fld"><label for="co-di-j">Jour</label><select id="co-di-j">${COJOURS.map(j => `<option value="${j}">${DAYS[j]}</option>`).join('')}</select></div><div class="row" style="gap:8px"><div class="fld grow"><label for="co-di-d">De</label><input id="co-di-d" type="time" required value="09:00"></div><div class="fld grow"><label for="co-di-a">À</label><input id="co-di-a" type="time" required value="12:00"></div></div>${O('co-di-l', 'Lieu (facultatif)', 'Le club, le nom d’un site…')}<button class="btn full">Enregistrer</button></form>`
    );
  },
  coDispoDel(d) {
    OFFRES.dispos = (OFFRES.dispos || []).filter((x, i) => i !== +d.i);
    ofSave('Période retirée');
  },
  coVacAdd(d) {
    sheet(
      d.k === 'me' ? 'Mes vacances' : 'Vacances du club',
      `<form class="body" id="co-vac" data-k="${d.k}">${O('co-va-n', 'Nom', 'Vacances de Noël, stage, fermeture…')}<div class="row" style="gap:8px"><div class="fld grow"><label for="co-va-d">Du</label><input id="co-va-d" type="date" required value="${isoIn(1)}"></div><div class="fld grow"><label for="co-va-a">Au</label><input id="co-va-a" type="date" required value="${isoIn(8)}"></div></div><button class="btn full">Enregistrer</button></form>`
    );
  },
  coVacDel(d) {
    const keep = l => (l || []).filter(o => !(o.du === d.du && o.au === d.au));
    if (d.k === 'me') OFFRES.conges = keep(OFFRES.conges);
    else OFFRES.vacClubs = Object.assign({}, OFFRES.vacClubs, { [d.k]: keep(coVacClub(d.k)) });
    ofSave('Période retirée');
  },
  /* la copie : une fois, à refaire si besoin. Plusieurs clubs : on choisit lequel */
  coVacCopy(d) {
    const clubs = coClubList();
    if (!d.c && clubs.length > 1)
      return sheet(
        'Quel club copier ?',
        `<div class="body"><div class="list">${clubs.map(c => `<button class="item" data-a="coVacCopy" data-c="${c.id}"><span class="tile">${ic('club')}</span><span class="grow"><span class="nm">${esc(c.name)}</span><br><span class="muted small">${plural(coVacClub(c.id).length, 'période')}</span></span></button>`).join('')}</div></div>`
      );
    const c = d.c || clubs[0].id,
      l = coVacClub(c);
    if (!l.length) return toast('Ce club n’a aucune période de vacances');
    const seen = new Set((OFFRES.conges || []).map(o => o.du + o.au));
    OFFRES.conges = (OFFRES.conges || []).concat(l.filter(o => !seen.has(o.du + o.au)));
    closeSheet();
    ofSave('Vacances du club copiées dans les tiennes');
  },
  coVacFollow(d) {
    const g = grp(d.id);
    if (g.vacClub) delete g.vacClub;
    else g.vacClub = true;
    coSave(g.vacClub ? 'Le groupe suit les vacances du club' : 'Le groupe continue pendant les vacances du club');
  },
  /* le geste : retirer les séances concernées (d'un groupe, ou toutes). Personne n'est prévenu, comme « Supprimer » */
  coVacClear(d) {
    const l = coVacHits().filter(x => !d.id || x.g.id === d.id);
    if (
      !confirm(
        plural(l.length, 'séance', 'séances') +
          ' retirée' +
          (l.length > 1 ? 's' : '') +
          ' du planning. Les élèves ne sont pas prévenus. Continuer ?'
      )
    )
      return;
    l.forEach(x => coDateOff(x.g, x.d));
    coSave(plural(l.length, 'séance retirée', 'séances retirées'));
  }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'co-dispo') return;
  e.preventDefault();
  const du = $('co-di-d').value,
    au = $('co-di-a').value;
  if (!du || !au || au <= du) return toast('La fin doit suivre le début');
  const o = { jour: +$('co-di-j').value, du, au },
    lieu = $('co-di-l').value.trim().slice(0, 60);
  if (lieu) o.lieu = lieu;
  OFFRES.dispos = (OFFRES.dispos || []).concat(o);
  closeSheet();
  ofSave('Période enregistrée');
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'co-vac') return;
  e.preventDefault();
  const k = e.target.dataset.k,
    nom = $('co-va-n').value.trim().slice(0, 60),
    du = $('co-va-d').value,
    au = $('co-va-a').value;
  if (!du || !au || au < du) return toast('La fin doit suivre le début');
  const o = { nom, du, au };
  if (k === 'me') OFFRES.conges = (OFFRES.conges || []).concat(o);
  else OFFRES.vacClubs = Object.assign({}, OFFRES.vacClubs, { [k]: coVacClub(k).concat(o) });
  closeSheet();
  ofSave('Période enregistrée');
});

/* ---------- lieu : en salle par défaut, un interrupteur pour la saison en extérieur ----------
   g.defLoc : lieu des prochaines séances ; g.loc[date] : un jour précis (« Passer en salle » s'il pleut).
   g.locPref : le lieu a été choisi par l'enseignant. Les groupes créés avant la règle « en salle par défaut »
   (où « Extérieur » n'était qu'une valeur par défaut) passent une fois en salle (coLocInit). */
const coLocTg = g => {
  const out = g.defLoc === 'Extérieur';
  return `<div class="cokv"><span class="muted coki">${ic(out ? 'sun' : 'home')}${out ? 'Saison en extérieur · « Passer en salle » s’il pleut' : 'En salle · saison en extérieur au printemps'}</span><span class="cocyc"><span class="muted small">Extérieur</span><button class="tg" role="switch" aria-checked="${out}" data-a="coLocSeason" data-id="${g.id}" aria-label="${esc(g.name)} : ${out ? 'repasser en salle' : 'passer la saison en extérieur'}"></button></span></div>`;
};
function coLocInit() {
  coGroups('', true).forEach(g => {
    if (g.locPref || g.old) return;
    if (g.defLoc !== 'En salle') g.defLoc = 'En salle';
    g.locPref = 1;
  });
}

/* ---------- reporter une séance, ou changer la date d'une seule ----------
   Reporter : la séance glisse à l'occurrence suivante du groupe (une semaine, deux pour un groupe une semaine sur
   deux, en sautant les périodes sans cours) et toutes les suivantes glissent avec elle, thèmes compris : la suite
   des thèmes prévus est gardée ; un cycle ou un pack se termine une occurrence plus tard.
   Changer la date : seule cette séance change de jour (avec son thème, son appel et son bilan). */
/* prochaine occurrence du créneau après une date, sans tenir compte de la fin du cycle */
function coNextOcc(g, after) {
  const free = Object.assign({}, g, { to: null });
  for (let i = 1; i <= 120; i++) {
    const d = isoIn(i, after);
    if (trainOn(free, d) && !(g.extra || []).includes(d)) return d;
  }
  return isoIn(7 * (g.every || 1), after);
}
/* une séance (thème, appel, bilan) passe d'une date à une autre */
function coSesMove(g, from, to) {
  (g.cycles || []).forEach(c => (c.dates = [...new Set((c.dates || []).map(x => (x === from ? to : x)))].sort()));
  const s = SEANCES.find(x => x.id === g.id + '.' + from && (x._club || '') === (g._club || ''));
  if (!s) return;
  const t = sesGet(g.id + '.' + to);
  Object.keys(s).forEach(k => !['id', 'g', 'd', '_club'].includes(k) && (t[k] = s[k]));
  SEANCES.splice(SEANCES.indexOf(s), 1);
}
/* une date du groupe disparaît, une autre apparaît (séance déplacée : skip et extra, comme data.js trainOn) */
function coDateOff(g, d) {
  (g.cycles || []).forEach(c => (c.dates = (c.dates || []).filter(x => x !== d)));
  if ((g.extra || []).includes(d)) g.extra = g.extra.filter(x => x !== d);
  if (trainOn(g, d)) g.skip = (g.skip || []).concat(d);
}
function coDateOn(g, d) {
  g.skip = (g.skip || []).filter(x => x !== d);
  if (!trainOn(g, d)) g.extra = (g.extra || []).concat(d).sort();
}

/* ---------- Programmer des séances ---------- */
/* les dates proposées : à partir d'une date, chaque semaine ou une semaine sur deux */
function coPlanDates(start, n, step, off) {
  const out = [],
    shut = d => (off || []).some(o => d >= o.du && d <= o.au);
  for (let d = start, k = 0; out.length < Math.min(n, 60) && k < 200; d = isoIn(step, d), k++)
    if (!shut(d)) out.push(d);
  return out;
}
/* les dates d'un cycle : les séances du groupe à partir de cette date (faites ou non), puis celles à proposer */
function coPlanDetect(g, start, n, step) {
  const deja = coDates(g, start, g.to && g.to > isoIn(180) ? g.to : isoIn(180)).filter(
    d => !isCx(g, d) && !REGLES.cycleDe(g, d)
  );
  const out = deja.slice(0, n);
  if (out.length >= n) return out;
  const suite = out.length ? isoIn(step || 7, out[out.length - 1]) : start;
  return out.concat(coPlanDates(suite, n - out.length, step || 7, coVacOff(g)));
}
/* première date utile : la prochaine séance du créneau du groupe */
function coPlanStart(g) {
  for (let i = 1; i < 15; i++) if (trainOn(g, isoIn(i)) && !(g.to && isoIn(i) > g.to)) return isoIn(i);
  for (let i = 1; i < 8; i++) if (coDow(isoIn(i)) === g.day) return isoIn(i);
  return isoIn(1);
}
/* nombre de séances et tarif d'un produit (formule, pack, abonnement) */
function coPlanOf(v) {
  const [t, ref] = String(v || '').split(':');
  if (t === 'pack') {
    const p = OFFRES.packs.find(x => x.id === ref);
    return p ? { n: p.seances, tarif: { mode: 'eleve', prix: Math.round((p.prix / p.seances) * 100) / 100 } } : {};
  }
  if (t === 'f') {
    const f = OFFRES.formules.find(x => x.id === ref);
    return f ? { n: 0, tarif: { mode: f.par === 'personne' ? 'eleve' : 'seance', prix: f.prix } } : {};
  }
  if (t === 'abo') {
    const a = OFFRES.abos.find(x => x.id === ref);
    return a ? { n: 0, abo: a } : {};
  }
  return {};
}
const coPlanRow = (d, i) =>
  `<div class="row coplr" style="gap:8px"><span class="muted small" style="width:28px">${i + 1}</span><input type="date" class="co-pd grow" value="${d}" aria-label="Date de la séance ${i + 1}"><button type="button" class="ib" data-a="coPlanRm" aria-label="Retirer cette date">${ic('x')}</button></div>`;
function coPlanPaint(dates) {
  const box = $('co-pl-dates');
  if (!box) return;
  box.innerHTML = dates.map(coPlanRow).join('') || '<p class="muted small">Aucune date : ajoute-en une.</p>';
  const n = $('co-pl-cnt');
  if (n) n.textContent = plural(dates.length, 'séance');
}
const coPlanRead = () =>
  [...document.querySelectorAll('#co-plan .co-pd')].map(i => i.value).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));

Object.assign(A, {
  /* saison en extérieur : les prochaines séances changent de lieu (un jour déjà réglé à la main l'est encore) ;
     élèves et parents prévenus */
  coLocSeason(d) {
    const g = grp(d.id);
    if (!g) return;
    const nl = g.defLoc === 'Extérieur' ? 'En salle' : 'Extérieur';
    g.defLoc = nl;
    g.locPref = 1;
    if (g.loc) Object.keys(g.loc).forEach(k => k > TODAY && g.loc[k] === nl && delete g.loc[k]);
    NOTIFS.unshift({
      by: g.coach,
      txt: `${g.name} : les prochains cours auront lieu ${nl === 'En salle' ? 'en salle' : 'en extérieur'}`,
      t: "À l'instant",
      n: 1,
      go: { v: 'agenda', ag: 'cours' },
      to: g.mem.slice()
    });
    coSave(`${g.name} : prochaines séances ${nl === 'En salle' ? 'en salle' : 'en extérieur'} · élèves prévenus`);
  },
  coShift(d) {
    const g = grp(d.id);
    if (!g) return;
    const L = coDates(g, d.d, g.to || isoIn(365)),
      next = coNextOcc(g, L[L.length - 1] || d.d);
    sheet(
      'Reporter la séance',
      `<div class="body"><p>La séance du <b>${fmtD(d.d)}</b> est reportée à la suivante, le <b>${fmtD(L[1] || next)}</b>. Les ${plural(L.length - 1, 'séance suivante', 'séances suivantes')} glissent aussi d'une occurrence, avec leurs thèmes${g.to ? ` : le cycle se termine le <b>${fmtD(next)}</b> au lieu du ${fmtD(g.to)}` : ''}.</p><p class="muted small">Les élèves et leurs parents sont prévenus dans /RAM Club.</p><button class="btn full" data-a="coShiftOk" data-id="${g.id}" data-d="${d.d}">${ic('cal')}Reporter</button><button class="btn full ghost" data-a="coMove" data-id="${g.id}" data-d="${d.d}">Changer seulement la date de cette séance</button></div>`
    );
  },
  coShiftOk(d) {
    const g = grp(d.id);
    closeSheet();
    if (!g) return;
    const L = coDates(g, d.d, g.to || isoIn(365)).filter(x => !isCx(g, x)),
      next = coNextOcc(g, L[L.length - 1] || d.d),
      N = L.slice(1).concat(next);
    // les séances glissent d'une occurrence, de la dernière à la première (sans écraser la suivante)
    for (let i = L.length - 1; i >= 0; i--) coSesMove(g, L[i], N[i]);
    coDateOff(g, d.d);
    if (g.to) g.to = next;
    else if (!trainOn(g, next)) coDateOn(g, next);
    NOTIFS.unshift({
      by: g.coach,
      txt: `${g.name} : la séance du ${fmtD(d.d)} est reportée au ${fmtD(N[0])}, les suivantes sont décalées`,
      t: "À l'instant",
      n: 1,
      go: { v: 'agenda', ag: 'cours' },
      to: g.mem.slice()
    });
    const top = S.stack[S.stack.length - 1];
    if (top && top.v === 'seance' && top.id === g.id + '.' + d.d) top.id = g.id + '.' + N[0];
    coSave(`Séance reportée au ${fmtD(N[0])} · ${plural(N.length, 'séance décalée', 'séances décalées')}`);
  },
  coMove(d) {
    const g = grp(d.id);
    if (!g) return;
    sheet(
      'Changer la date',
      `<form class="body" id="co-move" data-id="${g.id}" data-d="${d.d}"><p class="muted small">Seule la séance du ${fmtD(d.d)} change de jour, avec son thème, son appel et son bilan. Les autres séances${g.once ? '' : ' du groupe'} ne bougent pas.</p><div class="fld"><label for="co-mv-d">Nouvelle date</label><input id="co-mv-d" type="date" required value="${d.d}"></div>${g.once ? `<div class="fld"><label for="co-mv-h">Heure</label><select id="co-mv-h">${HOURS.map(h => `<option ${h === g.h ? 'selected' : ''}>${h}</option>`).join('')}</select></div>` : ''}<button class="btn full">Déplacer la séance</button></form>`
    );
  },
  coOffAdd(d) {
    const g = grp(d.id);
    if (!g) return;
    const n = coGroups('', true).filter(x => coIsGrp(x) && x.id !== g.id && coClubOf(x) === coClubOf(g)).length;
    sheet(
      'Période sans cours',
      `<form class="body" id="co-off" data-id="${g.id}">${O('co-of-n', 'Nom', 'Vacances de Noël, fermeture du club…')}<div class="row" style="gap:8px"><div class="fld grow"><label for="co-of-d">Du</label><input id="co-of-d" type="date" required value="${isoIn(1)}"></div><div class="fld grow"><label for="co-of-a">Au (inclus)</label><input id="co-of-a" type="date" required value="${isoIn(14)}"></div></div>${n ? `<div class="fld"><label class="chk" for="co-of-all"><input type="checkbox" id="co-of-all">Aussi pour mes ${plural(n, 'autre groupe', 'autres groupes')} de ce club</label></div>` : ''}<button class="btn full">Enregistrer la période</button><p class="muted small">Les séances de cette période disparaissent du planning, de l'Agenda et de l'École de /RAM Club. Un cycle ou un pack se décale tout seul si tu reprogrammes ses dates.</p></form>`
    );
  },
  coOffDel(d) {
    const g = grp(d.id);
    if (!g) return;
    g.off = (g.off || []).filter(o => !(o.du === d.du && o.au === d.au));
    if (!g.off.length) delete g.off;
    coSave('Période retirée : les cours reprennent ces jours-là');
  },
  /* cycle terminé ↔ en cours : un groupe en cours reprend son créneau (chaque semaine, ou une sur deux) ;
     un groupe qu'on termine s'arrête à sa dernière séance passée */
  coCycle(d) {
    const g = grp(d.id);
    if (!g) return;
    if (coOver(g)) {
      delete g.to;
      delete g.fini;
      const n = coDates(g, isoIn(1), isoIn(42))[0];
      coSave(`${g.name} est de nouveau en cours${n ? ' · prochaine séance le ' + fmtD(n) : ''}`);
    } else {
      g.to = coDates(g, g.from || isoIn(-365), TODAY).pop() || TODAY;
      g.fini = 1;
      coSave(g.name + ' : cycle terminé le ' + fmtD(g.to));
    }
  },
  coFav(d) {
    const l = coFavs(),
      i = l.indexOf(d.k);
    if (i >= 0) l.splice(i, 1);
    else l.unshift(d.k);
    try {
      localStorage.setItem('coach-favs', JSON.stringify(l));
    } catch (e) {}
    render(true);
    toast(i >= 0 ? 'Retiré des favoris' : 'En favori : tout en haut de la liste');
  },
  coSelMode() {
    S.coSel = !S.coSel;
    S.coPick = [];
    render(true);
  },
  coPick(d) {
    const l = (S.coPick = S.coPick || []),
      i = l.indexOf(d.id);
    if (i >= 0) l.splice(i, 1);
    else l.push(d.id);
    render(true);
  },
  coPickAll() {
    const all = S.coBil || [];
    S.coPick = (S.coPick || []).length === all.length ? [] : all.slice();
    render(true);
  },
  coPickDel() {
    const l = (S.coPick || []).filter(id => (S.coBil || []).includes(id));
    if (!l.length) return;
    l.forEach(id => {
      const dr = BROUILLONS.find(b => b.id === id);
      if (dr) BROUILLONS.splice(BROUILLONS.indexOf(dr), 1);
      else sesGet(id).noRecap = 1;
    });
    S.coSel = false;
    S.coPick = [];
    coSave(plural(l.length, 'bilan retiré', 'bilans retirés') + ' de la liste');
  },
  /* la discussion d'un groupe qui n'en a pas (ou plus) : la même que celle créée avec le groupe */
  coChanNew(d) {
    const g = grp(d.id);
    if (!g || chans.some(c => c.id === g.id)) return;
    const ch = { id: g.id, g: 'train', sport: g.sport, name: g.name, desc: g.sub || coSlot(g), kid: 0 };
    if (g._club) {
      if (CO_EXT[g._club] && CO_EXT[g._club].base)
        fetch('/api/ram/c/' + g._club + '/ops', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ops: [{ coll: 'chan', id: g.id, op: 'put', data: Object.assign({ at: Date.now() }, ch) }]
          })
        }).catch(() => {});
      return toast('Discussion créée dans ' + coClubName(g));
    }
    chans.push(Object.assign({ msgs: [{ by: 'club', x: 'Groupe ouvert. Bienvenue !', t: "À l'instant" }], un: 0 }, ch));
    coSave('Discussion du groupe créée dans /RAM Club');
  },
  /* Programmer des séances : produit, nombre, rythme, puis chaque date modifiable */
  coPlan(d) {
    const g = grp(d.id);
    if (!g) return;
    const courant =
        d.c === 'new' ? null : d.c ? (g.cycles || []).find(x => x.id === d.c) : REGLES.cycleCourant(g, TODAY),
      debutNew = (() => {
        const hors = coHorsCycle(g);
        return hors[0] || coPlanStart(g);
      })(),
      cur = courant
        ? courant.dates.slice().sort()
        : d.c === 'new'
          ? coPlanDetect(
              g,
              debutNew,
              (g.offre || '').startsWith('pack:')
                ? (OFFRES.packs.find(p => p.id === g.offre.slice(5)) || {}).seances || 10
                : 10
            )
          : coDates(g, isoIn(1), g.to && g.to > isoIn(1) ? g.to : isoIn(120)),
      opts = [['', 'Aucune en particulier']]
        .concat(
          OFFRES.packs.map(p => ['pack:' + p.id, 'Pack · ' + ofLabel('pack', p.id) + ' · ' + p.seances + ' séances'])
        )
        .concat(OFFRES.formules.map(f => ['f:' + f.id, 'À la séance · ' + ofLabel('f', f.id)]))
        .concat(OFFRES.abos.map(a => ['abo:' + a.id, 'Abonnement · ' + a.nom])),
      cyc = !!g.to || !!d.c || !!courant || (g.offre || '').startsWith('pack:');
    sheet(
      'Séances de ' + g.name,
      `<form class="body" id="co-plan" data-id="${g.id}" data-c="${courant ? courant.id : d.c === 'new' ? 'new' : ''}"><p class="muted small">Choisis une formule : un pack donne le nombre de séances et le tarif. Les séances déjà faites à partir de cette date sont reprises dans le cycle.</p>${O('co-pl-nom', 'Nom du cycle', 'Cycle automne, Pack 10 séances…', courant ? courant.nom : '')}${ofSel('co-pl-o', 'Formule suivie par le groupe', opts, (courant && courant.offre) || g.offre || '')}${O('co-pl-pay', 'Paiement demandé aux séances n° (facultatif)', '4  ou 1, 4, 8', ((courant && courant.pay) || []).join(', '))}<div class="fld"><label class="chk" for="co-pl-att"><input type="checkbox" id="co-pl-att">Noter ce pack ou cet abonnement pour les élèves du groupe</label></div><div class="row" style="gap:8px"><div class="fld grow"><label for="co-pl-s">À partir du</label><input id="co-pl-s" type="date" value="${cur[0] || coPlanStart(g)}"></div><div class="fld" style="width:96px"><label for="co-pl-n">Séances</label><input id="co-pl-n" type="number" inputmode="numeric" min="1" max="60" value="${cur.length || 10}"></div></div>${ofSel(
        'co-pl-r',
        'Rythme',
        [
          ['7', 'Chaque semaine'],
          ['14', 'Une semaine sur deux']
        ],
        g.every > 1 ? '14' : '7'
      )}<button type="button" class="btn sm ghost full" data-a="coPlanGen">${ic('cal')}Proposer les dates</button><span class="kicker" style="margin-top:12px">Dates · <span id="co-pl-cnt">${plural(cur.length, 'séance')}</span></span><div id="co-pl-dates" class="copl"></div><button type="button" class="btn sm ghost full" data-a="coPlanAdd">${ic('plus')}Ajouter une date</button><div class="fld"><label class="chk" for="co-pl-c"><input type="checkbox" id="co-pl-c" ${cyc ? 'checked' : ''}>Le groupe s'arrête après la dernière date (pack ou cycle)</label></div><button class="btn full">Enregistrer les séances</button><p class="muted small">Les séances apparaissent dans ton planning et dans l'Agenda et l'École de /RAM Club.</p></form>`
    );
    coPlanPaint(cur);
  },
  coPlanGen() {
    const o = coPlanOf($('co-pl-o').value),
      n = parseInt($('co-pl-n').value, 10) || o.n || 10,
      s = $('co-pl-s').value || TODAY;
    coPlanPaint(coPlanDetect(grp($('co-plan').dataset.id), s, n, +$('co-pl-r').value || 7));
  },
  coPlanAdd() {
    const l = coPlanRead(),
      last = l.slice().sort().pop();
    l.push(last ? isoIn(+$('co-pl-r').value || 7, last) : $('co-pl-s').value || isoIn(1));
    coPlanPaint(l);
  },
  coPlanRm(d, el) {
    const l = coPlanRead(),
      rows = [...document.querySelectorAll('#co-plan .coplr')],
      i = rows.indexOf(el && el.closest ? el.closest('.coplr') : null);
    if (i >= 0) l.splice(i, 1);
    coPlanPaint(l);
  }
});
/* choisir un pack remplit le nombre de séances ; le cycle s'arrête alors après la dernière date */
document.addEventListener('change', e => {
  if (e.target.id !== 'co-pl-o') return;
  const o = coPlanOf(e.target.value);
  if (o.n) {
    $('co-pl-n').value = o.n;
    $('co-pl-c').checked = true;
    A.coPlanGen();
  }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'co-move') return;
  e.preventDefault();
  const f = e.target,
    g = grp(f.dataset.id),
    from = f.dataset.d,
    to = $('co-mv-d').value;
  if (!g || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return;
  if (to !== from && !g.once && coDates(g, to, to).length) return toast('Le groupe a déjà une séance ce jour-là');
  coSesMove(g, from, to);
  if (g.once) {
    g.once = to;
    g.day = coDow(to);
    if ($('co-mv-h')) g.h = $('co-mv-h').value;
    g.sub = `${fmtD(to)} ${g.h} · ${g.dur}`;
  } else if (to !== from) {
    coDateOff(g, from);
    coDateOn(g, to);
    if (g.to && to > g.to) g.to = to;
    if (g.from && to < g.from) g.from = to;
  }
  closeSheet();
  const top = S.stack[S.stack.length - 1];
  if (top && top.v === 'seance') top.id = g.id + '.' + to;
  coSave('Séance déplacée au ' + fmtD(to));
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'co-off') return;
  e.preventDefault();
  const g = grp(e.target.dataset.id),
    nom = ($('co-of-n').value || '').trim().slice(0, 60),
    du = $('co-of-d').value,
    au = $('co-of-a').value;
  if (!g || !du || !au || au < du) return toast('Choisis une date de début et une date de fin après elle');
  const gs = [g].concat(
    $('co-of-all') && $('co-of-all').checked
      ? coGroups('', true).filter(x => coIsGrp(x) && x.id !== g.id && coClubOf(x) === coClubOf(g))
      : []
  );
  gs.forEach(x => {
    x.off = (x.off || []).filter(o => !(o.du === du && o.au === au)).concat({ nom, du, au });
  });
  closeSheet();
  coSave(`Pas de cours du ${fmtD(du)} au ${fmtD(au)}${gs.length > 1 ? ' · ' + plural(gs.length, 'groupe') : ''}`);
});
/* applique la liste des dates à venir au groupe : séances ajoutées (extra) et retirées (skip) */
function coPlanApply(g, list, cycle) {
  const keep = new Set(list),
    fut = d => d > TODAY;
  g.extra = (g.extra || []).filter(d => !fut(d) || keep.has(d));
  g.skip = (g.skip || []).filter(d => !keep.has(d));
  delete g.fini;
  if (cycle) g.to = list.length ? list[list.length - 1] : TODAY;
  else if (g.to && g.to >= TODAY) delete g.to;
  // un groupe sans séance faite (ni appel ni bilan) commence à sa première date programmée
  const used = SEANCES.some(x => x.g === g.id && (x._club || '') === (g._club || '') && (x.pres || x.recap));
  if (list.length && (g.from ? g.from > list[0] : !used)) g.from = list[0];
  // jusqu'à la dernière date choisie : après elle, un groupe sans fin reprend son créneau chaque semaine
  const end = list.length ? list[list.length - 1] : TODAY;
  // des dates passées choisies (cycle commencé avant d'être programmé) sont reprises ; une séance passée déjà
  // faite (appel ou bilan) n'est jamais retirée
  const done = d =>
    SEANCES.some(x => x.id === g.id + '.' + d && (x._club || '') === (g._club || '') && (x.pres || x.recap));
  for (let d = list.length && list[0] < isoIn(1) ? list[0] : isoIn(1); d <= end; d = isoIn(1, d)) {
    if (keep.has(d)) {
      if (!trainOn(g, d)) g.extra.push(d);
    } else if (trainOn(g, d) && (fut(d) || !done(d))) g.skip.push(d);
  }
  g.extra.sort();
  g.skip.sort();
}
document.addEventListener('submit', e => {
  if (e.target.id !== 'co-plan') return;
  e.preventDefault();
  const g = grp(e.target.dataset.id);
  if (!g) return;
  const list = [...new Set(coPlanRead())].sort(),
    o = $('co-pl-o').value,
    p = coPlanOf(o);
  if (o) g.offre = o;
  else delete g.offre;
  if (p.tarif) g.tarif = p.tarif;
  const cid = e.target.dataset.c,
    garder = $('co-pl-c').checked || !!cid,
    // les séances des autres cycles restent
    autres = (g.cycles || []).filter(x => x.id !== cid).flatMap(x => x.dates || []);
  coPlanApply(g, [...new Set(list.concat(autres))].sort(), $('co-pl-c').checked);
  let note = '';
  if (garder) {
    g.cycles = g.cycles || [];
    let c = g.cycles.find(x => x.id === cid);
    if (!c) g.cycles.push((c = { id: 'c' + Date.now().toString(36), dates: [] }));
    const pk = o.startsWith('pack:') ? OFFRES.packs.find(x => x.id === o.slice(5)) : null;
    c.nom = $('co-pl-nom').value.trim().slice(0, 60) || (pk ? ofLabel('pack', pk.id) : 'Cycle ' + g.cycles.length);
    if (o) c.offre = o;
    else delete c.offre;
    if (pk) c.n = pk.seances;
    else delete c.n;
    c.pay = coCycleNums($('co-pl-pay').value);
    coCycleSet(g, c, list);
    if ($('co-pl-att').checked) {
      const n = coCycleAchats(g, c);
      note = n ? ' · noté pour ' + plural(n, 'élève') : '';
    }
  }
  closeSheet();
  coSave(plural(list.length, 'séance programmée', 'séances programmées') + ' pour ' + g.name + note);
});
