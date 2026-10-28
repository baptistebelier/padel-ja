/* =========================================================================
   /RAM — règles communes de l'enseignement, écrites une seule fois
   Chargées par le serveur (connecteur, Calendly : require) et par l'appli (/RAM Club et /RAM Coach :
   variable REGLES), pour que l'écran et le serveur donnent toujours le même résultat :
   - trainOn : ce groupe a-t-il cours ce jour-là ? (créneau chaque semaine, cycle, séances déplacées,
     vacances, une semaine sur deux, séance ponctuelle) ;
   - durMin : durée d'un groupe en minutes (« 1 h 30 ») ;
   - formuleDe : la formule de l'enseignant qui correspond à une séance (nombre d'élèves et durée) ;
   - couverture : ce que chaque achat d'un élève couvre (pack décompté, séance à l'unité, abonnement) ;
   - chiffre : chiffre d'affaires réel (les achats) et ce qui reste à encaisser.
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.REGLES = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const isoOfAt = t => {
    const d = new Date(t);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };
  const dowOf = iso => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).getDay();
  };
  const addDays = (iso, n) => {
    const [y, m, d] = iso.split('-').map(Number);
    return isoOfAt(new Date(y, m - 1, d + n));
  };

  /* groupe chaque semaine (ou toutes les every semaines) : entre from et to s'ils sont donnés (un cycle), avec ses
     séances déplacées (extra : en plus, skip : pas ce jour-là) ; séance ponctuelle : sa seule date (once) */
  function trainOn(g, iso) {
    if (g.once) return g.once === iso;
    if ((g.extra || []).includes(iso)) return true;
    // périodes sans cours (vacances scolaires…) : du … au …, bornes comprises
    if ((g.off || []).some(o => iso >= o.du && iso <= o.au)) return false;
    if ((g.skip || []).includes(iso) || (g.from && iso < g.from) || (g.to && iso > g.to)) return false;
    // un groupe sans date de début commence le jour de sa création (at) : pas de séances imaginaires avant
    if (!g.from && g.at && iso < isoOfAt(g.at)) return false;
    if (dowOf(iso) !== g.day) return false;
    // une semaine sur deux (every : 2), compté depuis la première séance
    return !(g.every > 1 && g.from) || Math.round((Date.parse(iso) - Date.parse(g.from)) / 6048e5) % g.every === 0;
  }
  /* « 1 h 30 », « 1 h », « 45 min » → minutes (1 h par défaut) */
  function durMin(d) {
    const m = String(d || '').match(/(\d+) h(?: (\d+))?|(\d+) min/);
    return m ? (m[3] ? +m[3] : +m[1] * 60 + (+m[2] || 0)) : 60;
  }
  /* format d'une séance : 1 individuel, 2 duo, 3 collectif (3 élèves ou plus) */
  const fmt = n => (n >= 3 ? 3 : Math.max(1, n || 1));
  /* formule de l'enseignant pour une séance de n élèves et de min minutes (même format, même durée) */
  const formuleDe = (offres, n, min, sport) =>
    ((offres && offres.formules) || []).find(
      f => fmt(f.joueurs) === fmt(n) && +f.duree === +min && (!sport || !f.sport || f.sport === sport)
    ) || null;
  /* prix d'une séance pour UN élève selon une formule (par personne, ou la séance partagée entre les élèves) */
  const prixEleve = (f, n) => (!f ? 0 : f.par === 'personne' ? +f.prix || 0 : (+f.prix || 0) / Math.max(1, n || 1));
  /* ce que rapporte une séance selon le tarif réglé sur le groupe (ancien calcul, gardé comme « valeur des séances ») */
  function valeurGroupe(g, presents) {
    const t = (g && g.tarif) || {};
    return t.mode === 'heure'
      ? ((+t.prix || 0) * durMin(g.dur)) / 60
      : t.mode === 'eleve'
        ? (+t.prix || 0) * (presents || 0)
        : +t.prix || 0;
  }
  /* prix payé pour un achat : celui noté, sinon celui du produit */
  function prixAchat(a, offres) {
    if (a.prix != null && a.prix !== '') return +a.prix || 0;
    const O = offres || {},
      l = a.t === 'pack' ? O.packs : a.t === 'abo' ? O.abos : O.formules;
    return +((l || []).find(x => x.id === a.ref) || {}).prix || 0;
  }

  /* Ce que les achats d'un élève couvrent.
     achats : [{ id, t: 'pack' | 'seance' | 'abo', ref, d, n (séances d'un pack), fin (abonnement), prix }]
     venues : séances où il est venu [{ d, min, n (élèves de la séance), sport }], dans n'importe quel ordre.
     Les séances se décomptent dans l'ordre, du plus ancien achat au plus récent. Un pack ou une séance à l'unité
     couvre une séance de sa formule (même format, même durée), faite au plus tôt 14 jours avant l'achat
     (« payé au mois ») ; un abonnement couvre les séances faites pendant sa durée.
     Renvoie { achats: [achat + { used }], couvre: Map(venue → achat) }. */
  function couverture(achats, venues, offres) {
    const O = offres || {},
      list = (achats || []).slice().sort((a, b) => String(a.d).localeCompare(String(b.d)));
    const vs = (venues || []).slice().sort((a, b) => String(a.d).localeCompare(String(b.d))),
      couvre = new Map();
    const formuleOf = a => {
      if (a.t === 'pack') {
        const p = (O.packs || []).find(x => x.id === a.ref);
        return p ? (O.formules || []).find(f => f.id === p.formule) || null : null;
      }
      if (a.t === 'abo') {
        const b = (O.abos || []).find(x => x.id === a.ref);
        return b && b.formule ? (O.formules || []).find(f => f.id === b.formule) || null : null;
      }
      return (O.formules || []).find(f => f.id === a.ref) || null;
    };
    const fits = (v, f) => !f || (+v.min === +f.duree && fmt(v.n) === fmt(f.joueurs));
    const out = list.map(a => {
      const o = Object.assign({}, a, { used: 0 }),
        f = formuleOf(a);
      if (a.t === 'abo') {
        vs.forEach(v => {
          if (!couvre.has(v) && v.d >= a.d && (!a.fin || v.d <= a.fin) && fits(v, f)) {
            couvre.set(v, o);
            o.used++;
          }
        });
        return o;
      }
      const max = a.t === 'pack' ? +a.n || 0 : 1,
        from = addDays(String(a.d), -14);
      for (const v of vs) {
        if (o.used >= max) break;
        if (couvre.has(v) || v.d < from || !fits(v, f)) continue;
        couvre.set(v, o);
        o.used++;
      }
      return o;
    });
    return { achats: out, couvre };
  }

  /* Chiffre d'affaires réel d'une période [from, to].
     eleves : { clé: { achats } } ; seances : séances faites [{ g, d, presents: [clés], n: inscrits, sport }] (tout l'historique
     jusqu'à « to » : un pack acheté avant la période se décompte avec les séances d'avant).
     - encaisse : les achats datés de la période (prix payé) ;
     - aEncaisser : les séances de la période où un élève est venu sans achat qui la couvre, au prix de la formule
       correspondante (sans formule correspondante — un groupe payé par le club — rien n'est compté) ;
     - prepaye : la part des packs pas encore utilisée à la date « to » (séances dues aux élèves) ;
     - parMois : encaissé mois par mois (« 2026-10 »). */
  function chiffre({ eleves, seances, offres, from, to }) {
    const venues = {};
    (seances || []).forEach(x => {
      if (x.d > to) return;
      // format de la séance : ses inscrits (n), sinon ses présents (un duo reste un duo si l'un manque)
      const n = x.n || (x.presents || []).length,
        min = durMin(x.g && x.g.dur),
        sport = x.sport || (x.g && x.g.sport);
      (x.presents || []).forEach(k => (venues[k] = venues[k] || []).push({ d: x.d, min, n, sport, g: x.g }));
    });
    const keys = new Set(Object.keys(eleves || {}).concat(Object.keys(venues)));
    let encaisse = 0,
      aEncaisser = 0,
      prepaye = 0,
      nonCouvertes = 0;
    const parMois = {};
    keys.forEach(k => {
      const achats = ((eleves || {})[k] || {}).achats || [];
      achats.forEach(a => {
        if (!(a.d >= from && a.d <= to)) return;
        const p = prixAchat(a, offres);
        encaisse += p;
        const m = String(a.d).slice(0, 7);
        parMois[m] = (parMois[m] || 0) + p;
      });
      const cov = couverture(
        achats.filter(a => a.d <= to),
        venues[k] || [],
        offres
      );
      cov.achats.forEach(a => {
        if (a.t === 'pack' && +a.n > a.used) prepaye += ((+a.n - a.used) * prixAchat(a, offres)) / +a.n;
      });
      (venues[k] || []).forEach(v => {
        if (v.d < from || cov.couvre.has(v)) return;
        const f = formuleDe(offres, v.n, v.min, v.sport);
        if (!f) return;
        nonCouvertes++;
        aEncaisser += prixEleve(f, v.n);
      });
    });
    const r = n => Math.round(n * 100) / 100;
    return { encaisse: r(encaisse), aEncaisser: r(aEncaisser), prepaye: r(prepaye), nonCouvertes, parMois };
  }

  return {
    trainOn,
    durMin,
    fmt,
    formuleDe,
    prixEleve,
    valeurGroupe,
    prixAchat,
    couverture,
    chiffre,
    isoOfAt,
    addDays,
    dowOf
  };
});
