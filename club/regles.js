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
    // groupe sans créneau (un pack individuel et ses séances à planifier) : seulement les dates posées (extra)
    if (g.libre) return false;
    if ((g.skip || []).includes(iso) || (g.from && iso < g.from) || (g.to && iso > g.to)) return false;
    // un groupe sans date de début commence le jour de sa création (at) : pas de séances imaginaires avant
    if (!g.from && g.at && iso < isoOfAt(g.at)) return false;
    if (dowOf(iso) !== g.day) return false;
    // une semaine sur deux (every : 2), compté depuis la première séance
    return !(g.every > 1 && g.from) || Math.round((Date.parse(iso) - Date.parse(g.from)) / 6048e5) % g.every === 0;
  }
  /* heure d'une séance : celle réglée pour ce jour-là (g.hr[date], séance déplacée à une autre heure), sinon celle du créneau */
  const hAt = (g, iso) => (g && g.hr && iso && g.hr[iso]) || (g && g.h) || '';
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
     achats : [{ id, t: 'pack' | 'seance' | 'abo', ref, d, n (séances d'un pack), fin (abonnement), prix,
                 cycle ('groupe:cycle'), groupe, du (arrivée dans le groupe), sortie (départ du groupe), freq }]
     venues : séances où il est venu [{ d, min, n (élèves de la séance), sport, gid (groupe), cy (cycle) }], dans
     n'importe quel ordre.
     Un achat rattaché à un cycle (a.cycle) ou à un groupe (a.groupe) — attribué depuis le groupe — couvre les séances
     de ce cycle ou de ce groupe, quel que soit leur format, entre l'arrivée de l'élève (a.du) et son départ (a.sortie) ;
     il passe avant les achats individuels. Les autres achats se décomptent dans l'ordre, du plus ancien au plus récent :
     un pack ou une séance à l'unité couvre une séance de sa formule (même format, même durée), faite au plus tôt
     14 jours avant l'achat (« payé au mois ») ; un abonnement couvre les séances faites pendant sa durée, et au plus
     son nombre de séances quand sa fréquence est notée (a.freq séances par semaine).
     Une venue sans groupe connu (gid) se décompte comme avant, par sa formule.
     Renvoie { achats: [achat + { used }], couvre: Map(venue → achat) }. */
  const lienDe = a => {
    if (a.cycle) {
      const [g, c] = String(a.cycle).split(':');
      return { g, c };
    }
    return a.groupe ? { g: String(a.groupe), c: null } : null;
  };
  const gidOf = v => (v.gid != null ? v.gid : v.g && typeof v.g === 'object' ? v.g.id : v.g);
  /* nombre de séances d'un abonnement à fréquence notée : sa durée en semaines × sa fréquence ; sinon sans limite */
  function seancesAbo(a) {
    if (!(+a.freq > 0) || !a.fin || !a.d) return Infinity;
    const j = Math.round((Date.parse(a.fin) - Date.parse(a.d)) / 864e5) + 1;
    return Math.max(1, Math.round((j / 7) * +a.freq));
  }
  function couverture(achats, venues, offres) {
    const O = offres || {},
      byD = (a, b) => String(a.d).localeCompare(String(b.d)),
      all = (achats || []).slice().sort(byD),
      // les achats rattachés d'abord : les séances de leur groupe leur reviennent
      list = all.filter(lienDe).concat(all.filter(a => !lienDe(a)));
    const vs = (venues || []).slice().sort(byD),
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
    // une venue pour un achat rattaché : celle du bon groupe (et du bon cycle), pendant que l'élève y est ;
    // null : venue sans groupe connu, la règle de la formule s'applique
    const dansLien = (a, L, v) => {
      const gid = gidOf(v);
      if (gid == null) return null;
      if (String(gid) !== L.g || (L.c && v.cy != null && v.cy !== L.c)) return false;
      return (!a.du || v.d >= a.du) && (!a.sortie || v.d <= a.sortie);
    };
    const out = new Map();
    list.forEach(a => {
      const o = Object.assign({}, a, { used: 0 }),
        f = formuleOf(a),
        L = lienDe(a),
        ok = v => {
          const x = L ? dansLien(a, L, v) : null;
          return x === null ? fits(v, f) : x;
        };
      out.set(a, o);
      if (a.t === 'abo') {
        const max = seancesAbo(a);
        vs.forEach(v => {
          if (o.used < max && !couvre.has(v) && v.d >= (a.du || a.d) && (!a.fin || v.d <= a.fin) && ok(v)) {
            couvre.set(v, o);
            o.used++;
          }
        });
        return;
      }
      const max = a.t === 'pack' ? +a.n || 0 : 1,
        from = L ? '' : addDays(String(a.d), -14);
      for (const v of vs) {
        if (o.used >= max) break;
        if (couvre.has(v) || v.d < from || !ok(v)) continue;
        couvre.set(v, o);
        o.used++;
      }
    });
    // dans l'ordre des achats, comme avant
    return { achats: all.map(a => out.get(a)), couvre };
  }

  /* État d'une attribution (pack, abonnement, séance), après la couverture (a.used) :
     - « encours » : des séances restent ;
     - « utilise » : toutes les séances consommées, mais des paiements restent à régler (un abonnement qui a fait
       toutes ses séances avant sa date de fin est aussi « utilisé ») ;
     - « termine » : consommé et réglé, ou date de fin dépassée.
     Un élève parti du groupe (a.sortie) a consommé son attribution : ce qu'il a fait ; un paiement prévu à une séance
     qu'il ne fera pas n'est plus attendu. Un paiement retiré de la liste par l'enseignant (pay.off) ne bloque pas. */
  function etatAchat(a, today) {
    const used = +a.used || 0;
    if (a.t === 'abo' && a.fin && a.fin < today) return 'termine';
    const total = a.sortie ? used : a.t === 'pack' ? +a.n || 0 : a.t === 'abo' ? seancesAbo(a) : 1;
    if (used < total) return 'encours';
    const ech = a.pay && Array.isArray(a.pay.ech) && !a.pay.off ? a.pay.ech : [],
      solde = ech.filter(x => (+x.s || 0) <= total).every(x => x.ok);
    // abonnement au bout de ses séances avant sa date de fin : utilisé
    if (a.t === 'abo' && a.fin && !a.sortie) return 'utilise';
    return solde ? 'termine' : 'utilise';
  }
  const ETATS = { encours: 'En cours', utilise: 'Utilisé', termine: 'Terminé' };
  /* l'abonnement en cours d'un élève (le plus récent), ou rien : son étiquette « Abonné » */
  function aboEnCours(achats, today) {
    return (
      (achats || [])
        .filter(a => a.t === 'abo' && a.d <= today && (!a.fin || a.fin >= today) && !a.sortie)
        .sort((x, y) => String(y.d).localeCompare(String(x.d)))[0] || null
    );
  }

  /* Une seule source de présence : l'appel de /RAM Coach (s.pres : P présent, E excusé, A absent) et celui de
     /RAM Club (g.att[date][clé] : true présent, false absent) comptent pareil. Les deux applis écrivent désormais
     les deux ; pour un ancien appel fait seulement dans /RAM Club, g.att suffit. s.pres prime quand les deux existent. */
  function presDe(s, g, d) {
    const out = {},
      att = ((g && g.att) || {})[d] || {};
    Object.keys(att).forEach(k => {
      if (att[k] === true) out[k] = 'P';
      else if (att[k] === false) out[k] = 'A';
    });
    return Object.assign(out, (s && s.pres) || {});
  }
  function presents(s, g, d) {
    const p = presDe(s, g, d);
    return Object.keys(p).filter(k => p[k] === 'P');
  }

  /* Qui enseigne une séance : le remplaçant noté sur la séance (s.coach) prime ; sinon l'enseignant de son cycle
     (c.coach, par défaut celui du groupe) ; sinon celui du groupe. Changer l'enseignant d'un cycle ou d'un groupe ne
     touche pas les séances passées : l'ancien est gardé dans un historique coachH = [{ au: date, coach }]
     (« jusqu'au … inclus, c'était … » ; coach vide : le cycle suivait l'enseignant du groupe). */
  function coachAu(h, cur, d) {
    const x = (h || [])
      .slice()
      .sort((a, b) => String(a.au).localeCompare(String(b.au)))
      .find(e => d <= e.au);
    return x ? x.coach || '' : cur || '';
  }
  function coachDe(g, d, s) {
    if (s && s.coach) return s.coach;
    if (!g) return '';
    const c = !g.once ? cycleDe(g, d) : null,
      k = c ? coachAu(c.coachH, c.coach, d) : '';
    return k || coachAu(g.coachH, g.coach, d) || g.coach || '';
  }
  /* nouvel enseignant (o : un groupe ou un cycle), à partir du lendemain de « coupure » (la dernière date qui garde
     l'ancien) ; renvoie false si rien ne change */
  function changeCoach(o, nouveau, coupure) {
    const old = o.coach || '';
    if (old === (nouveau || '')) return false;
    // changé deux fois le même jour : le premier enseignant reste celui des séances passées
    const deja = (o.coachH || []).find(e => e.au === coupure);
    o.coachH = (o.coachH || []).filter(e => e.au < coupure).concat(deja || { au: coupure, coach: old });
    if (nouveau) o.coach = nouveau;
    else delete o.coach;
    return true;
  }
  /* la dernière date qui garde l'ancien enseignant : hier, ou aujourd'hui si la séance du jour a déjà son appel */
  const coupureDe = (today, faiteAujourdhui) => (faiteAujourdhui ? today : addDays(today, -1));

  /* Séances « à planifier » d'un cycle : un pack ou un cycle de N séances en a N, datées ou non. Celles qui n'ont pas
     encore de date n'ont pas d'enregistrement dans les séances (dont l'identifiant est « groupe.AAAA-MM-JJ ») : elles
     sont comptées par le cycle (c.n moins ses séances datées) et désignées « groupe.pK-cycle » (K : rang parmi les
     séances sans date, à partir de 1). Ce qu'on en sait déjà (thème, remplaçant) est gardé dans c.aplan[K-1].
     Quand l'enseignant lui donne une date, elle devient une séance ordinaire « groupe.AAAA-MM-JJ » du cycle et
     apparaît au planning ; son thème et son remplaçant la suivent. */
  function aPlanifier(g, c) {
    const n = Math.max(0, restant(g, c));
    return Array.from({ length: n }, (x, i) =>
      Object.assign({ k: 'p' + (i + 1) + '-' + c.id, rang: i + 1 }, (c.aplan || [])[i] || {})
    );
  }
  const PLAN_RE = /^p(\d+)-(.+)$/;
  /* « groupe.p2-c1 » → { g: 'groupe', rang: 2, c: 'c1' } ; null pour une séance datée */
  function planDe(id) {
    const i = String(id).lastIndexOf('.'),
      m = String(id)
        .slice(i + 1)
        .match(PLAN_RE);
    return i > 0 && m ? { g: String(id).slice(0, i), rang: +m[1], c: m[2] } : null;
  }

  /* Chiffre d'affaires réel d'une période [from, to].
     eleves : { clé: { achats } } ; seances : séances faites [{ g, d, presents: [clés], n: inscrits, sport }] (tout l'historique
     jusqu'à « to » : un pack acheté avant la période se décompte avec les séances d'avant).
     - encaisse : les achats datés de la période (prix payé) ;
     - aEncaisser : les séances de la période où un élève est venu sans achat qui la couvre, au prix de la formule
       correspondante (sans formule correspondante — un groupe payé par le club — rien n'est compté) ;
     - prepaye : la part des packs pas encore utilisée à la date « to » (séances dues aux élèves) ;
     - parMois : encaissé mois par mois (« 2026-10 »). */
  /* un paiement en plusieurs fois : à ces séances, avec les montants du pack s'ils font bien le prix ; sinon à parts égales */
  function planPaiement(prix, nums, montants) {
    const total = +prix || 0,
      somme = (montants || []).reduce((a, x) => a + (+x || 0), 0),
      bons = (montants || []).length === nums.length && Math.abs(somme - total) < 0.01,
      part = Math.floor((total * 100) / nums.length) / 100;
    return nums.map((s, i) => ({
      s,
      m: bons
        ? +montants[i]
        : i === nums.length - 1
          ? Math.round((total - part * (nums.length - 1)) * 100) / 100
          : part,
      ok: ''
    }));
  }
  /* un achat déjà noté, recalé sur le calendrier de son pack : ce qui est réglé ne bouge pas ; null s'il n'y a rien à changer */
  function replanAchat(a, pk) {
    const ech = a && a.pay && Array.isArray(a.pay.ech) ? a.pay.ech : null;
    if (!ech || !pk || !(pk.ech || []).length || !(+a.prix > 0) || ech.every(x => x.ok)) return null;
    const regle = ech.filter(x => x.ok),
      paye = regle.reduce((s, x) => s + (+x.m || 0), 0),
      reste = Math.round((+a.prix - paye) * 100) / 100,
      plan = planPaiement(a.prix, pk.ech, pk.echm),
      suite = plan.slice(regle.length);
    if (reste <= 0) return null;
    const fin = !suite.length
      ? [{ s: pk.ech[pk.ech.length - 1], m: reste, ok: '' }]
      : Math.abs(suite.reduce((s, x) => s + x.m, 0) - reste) < 0.01
        ? suite
        : planPaiement(
            reste,
            suite.map(x => x.s)
          );
    const out = regle.concat(fin),
      sign = l => JSON.stringify(l.map(x => [+x.s || 0, +x.m || 0, x.ok || '']));
    return sign(out) === sign(ech) ? null : out;
  }
  function chiffre({ eleves, seances, offres, from, to }) {
    const venues = {};
    (seances || []).forEach(x => {
      if (x.d > to) return;
      // format de la séance : ses inscrits (n), sinon ses présents (un duo reste un duo si l'un manque)
      const n = x.n || (x.presents || []).length,
        min = durMin(x.g && x.g.dur),
        sport = x.sport || (x.g && x.g.sport);
      const gid = x.gid != null ? x.gid : x.g && x.g.id,
        cy = x.cy != null ? x.cy : x.g && gid != null ? (cycleDe(x.g, x.d) || {}).id : undefined;
      (x.presents || []).forEach(k =>
        (venues[k] = venues[k] || []).push({ d: x.d, min, n, sport, gid: gid == null ? undefined : gid, cy })
      );
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
        // un achat sans échéances est réglé le jour de l'achat ; avec : chaque paiement à sa date, le reste à encaisser
        const ech = a.pay && Array.isArray(a.pay.ech) ? a.pay.ech : null,
          regle = ech ? ech.filter(x => x.ok).map(x => [x.ok, +x.m || 0]) : [[a.d, prixAchat(a, offres)]];
        regle.forEach(([d, p]) => {
          if (!(d >= from && d <= to)) return;
          encaisse += p;
          const m = String(d).slice(0, 7);
          parMois[m] = (parMois[m] || 0) + p;
        });
        if (ech && a.d <= to && !a.pay.off) ech.forEach(x => !x.ok && (aEncaisser += +x.m || 0));
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
        if (v.d < from || cov.couvre.has(v) || (((eleves || {})[k] || {}).payIgn || []).includes(v.d)) return;
        const f = formuleDe(offres, v.n, v.min, v.sport);
        if (!f) return;
        nonCouvertes++;
        aEncaisser += prixEleve(f, v.n);
      });
    });
    const r = n => Math.round(n * 100) / 100;
    return { encaisse: r(encaisse), aEncaisser: r(aEncaisser), prepaye: r(prepaye), nonCouvertes, parMois };
  }

  /* qui peut lire une discussion. ch.acces : tous, groupe (les membres du groupe) ou invite ; ch.plus et ch.moins : les
     ajouts et retraits à la main, qui priment sur la règle. Sans règle choisie : la discussion d'un groupe est réservée
     à ses membres, les autres sont ouvertes à tous. Le bureau et les enseignants passent avant cette règle (ctx.staff). */
  const chanRegle = ch => !!ch && !!(ch.acces || (ch.plus || []).length || (ch.moins || []).length);
  function chanOuvert(ch, g, keys) {
    if (!ch) return false;
    if ((ch.moins || []).some(k => keys.includes(k))) return false;
    if ((ch.plus || []).some(k => keys.includes(k))) return true;
    const acces = ch.acces || (g ? 'groupe' : 'tous');
    if (acces === 'invite') return false;
    if (acces === 'groupe')
      return !!g && [...(g.mem || []), ...(g.ext || []), g.coach, g.cap].some(k => k && keys.includes(k));
    return true;
  }

  /* réservation : les plages libres d'un coach un jour donné, en minutes depuis minuit.
     dispos : [{ jour (0 dimanche), du: '09:00', au: '12:00', lieu }] ; occupes : [[début, fin]] ses cours du jour ;
     conges : ses vacances [{ du, au }] ; mini : la durée la plus courte qu'on peut réserver */
  const hhmmMin = s => {
    const m = String(s || '').match(/^(\d{1,2}):(\d{2})$/);
    return m ? +m[1] * 60 + +m[2] : 0;
  };
  function plagesLibres(dispos, iso, occupes, conges, mini) {
    if ((conges || []).some(o => iso >= o.du && iso <= o.au)) return [];
    const wd = dowOf(iso),
      out = [];
    (dispos || [])
      .filter(x => +x.jour === wd)
      .forEach(x => {
        let l = [[hhmmMin(x.du), hhmmMin(x.au)]];
        (occupes || []).forEach(([a, b]) => {
          l = l.flatMap(([u, v]) =>
            b <= u || a >= v
              ? [[u, v]]
              : [
                  [u, a],
                  [b, v]
                ].filter(([p, q]) => q > p)
          );
        });
        l.forEach(([du, au]) => out.push({ du, au, lieu: x.lieu || '' }));
      });
    return out.filter(p => p.au - p.du >= (mini || 0)).sort((a, b) => a.du - b.du);
  }

  /* cycles d'un groupe : g.cycles = [{ id, nom, offre, n, pay: [numéros de séance], dates: [AAAA-MM-JJ] }]. Une séance
     appartient à un cycle par sa date : le compte ne dépend plus du créneau ni de la date de fin du groupe.
     Une séance passée n'est « faite » que si quelqu'un a été noté présent ; sans appel, elle est « à vérifier ».
     sesOf(date) : la séance de cette date (appel, thème) ou rien */
  const cycleDe = (g, iso) => (g.cycles || []).find(c => (c.dates || []).includes(iso)) || null;
  function cycleEtat(g, c, sesOf, today) {
    let num = 0;
    const seances = (c.dates || [])
      .slice()
      .sort()
      .map(d => {
        const cx = (g.cancel || []).includes(d),
          present = Object.values(presDe(sesOf && sesOf(d), g, d)).some(v => v === 'P');
        return {
          d,
          etat: cx ? 'cx' : d > today ? 'next' : present ? 'done' : d === today ? 'now' : 'vide',
          num: cx ? 0 : ++num
        };
      });
    const n = e => seances.filter(x => x.etat === e).length;
    // prevues : le pack entier, même sans date pour les prochaines séances ; posees : celles qui ont une date
    const prevues = Math.max(num, +c.n || 0);
    return {
      seances,
      prevues,
      posees: num,
      sansDate: prevues - num,
      faites: n('done'),
      aVerifier: n('vide'),
      aVenir: n('next') + n('now')
    };
  }
  /* ce qu'il reste à faire sur un cycle : 'obj' (objectifs à fixer : il commence dans les 14 jours ou a commencé,
     sans objectifs) ou 'bilan' (bilan de fin de cycle à écrire : toutes ses dates sont passées depuis moins de 60
     jours, sans bilan) ; null sinon. c.obj et c.bilan s'écrivent dans les réglages du cycle (/RAM Coach). */
  function cycleTodo(g, c, today) {
    const l = (c.dates || []).filter(d => !(g.cancel || []).includes(d)).sort();
    if (!l.length) return null;
    const fin = l[l.length - 1],
      plein = !(+c.n > 0) || l.length >= +c.n;
    if (fin <= today && plein) return !c.bilan && fin >= addDays(today, -60) ? 'bilan' : null;
    return !c.obj && l[0] <= addDays(today, 14) ? 'obj' : null;
  }
  /* le cycle en cours : le premier qui a encore une séance à venir, sinon le dernier */
  function cycleCourant(g, today) {
    const prem = c => [...(c.dates || [])].sort()[0] || '9999',
      l = (g.cycles || []).filter(c => (c.dates || []).length || c.n).sort((a, b) => prem(a).localeCompare(prem(b)));
    return (
      l.find(c => (c.dates || []).some(d => d >= today && !(g.cancel || []).includes(d)) || restant(g, c) > 0) ||
      l[l.length - 1] ||
      null
    );
  }
  /* séances d'un pack encore sans date */
  function restant(g, c) {
    return (+c.n || 0) - (c.dates || []).filter(d => !(g.cancel || []).includes(d)).length;
  }
  /* le cycle qui prend les prochaines séances posées : le plus récent, s'il reste de la place */
  function cycleOuvert(g) {
    const prem = c => [...(c.dates || [])].sort()[0] || '9999';
    const l = (g.cycles || []).filter(c => c.n).sort((a, b) => prem(b).localeCompare(prem(a)));
    return l.length && restant(g, l[0]) > 0 ? l[0] : null;
  }
  /* parmi les séances hors cycle du groupe : celles qui entrent dans ce cycle (jamais avant son début, jamais une
     séance retirée à la main) */
  function cycleAjouts(g, c, hors, today) {
    const d0 = [...(c.dates || [])].sort()[0] || today;
    return [...hors]
      .sort()
      .filter(d => d >= d0 && !(c.sans || []).includes(d))
      .slice(0, Math.max(0, restant(g, c)));
  }

  /* classements tennis, du plus bas au plus haut */
  const RANKS = [
    'NC',
    '40',
    '30/5',
    '30/4',
    '30/3',
    '30/2',
    '30/1',
    '30',
    '15/5',
    '15/4',
    '15/3',
    '15/2',
    '15/1',
    '15',
    '5/6',
    '4/6',
    '3/6',
    '2/6',
    '1/6',
    '0'
  ];

  return {
    seancesAbo,
    etatAchat,
    ETATS,
    aboEnCours,
    presDe,
    presents,
    coachAu,
    coachDe,
    changeCoach,
    coupureDe,
    aPlanifier,
    planDe,
    cycleDe,
    cycleTodo,
    cycleEtat,
    cycleCourant,
    cycleOuvert,
    cycleAjouts,
    RANKS,
    plagesLibres,
    hhmmMin,
    chanRegle,
    chanOuvert,
    trainOn,
    hAt,
    durMin,
    fmt,
    formuleDe,
    prixEleve,
    valeurGroupe,
    prixAchat,
    couverture,
    chiffre,
    planPaiement,
    replanAchat,
    isoOfAt,
    addDays,
    dowOf
  };
});
