/* =========================================================================
   École, Mon espace : mes séances et ce qui reste à payer
   Ce que mon enseignant a noté dans /RAM Coach (packs, abonnement, paiements), en lecture seule, pour moi et
   mes enfants. En ligne : lu sur le serveur (/api/ram/c/:club/achats, lib/mes-achats.js), qui n'en renvoie
   qu'un résumé ; en démonstration : même calcul (regles.js resumeAchats) sur les fiches de démo.
   Aucune facture, aucune relance : seulement de quoi savoir où l'on en est.
   ========================================================================= */
const MES_ACHATS = { club: null, at: 0, eleves: [] };
function mesAchatsListe() {
  if (window.RAM && RAM.live && RAM.club) {
    // lu à l'ouverture de Mon espace, au plus une fois par minute
    if (MES_ACHATS.club !== RAM.club || Date.now() - MES_ACHATS.at > 60000) {
      const club = RAM.club;
      MES_ACHATS.at = Date.now();
      if (MES_ACHATS.club !== club) MES_ACHATS.eleves = [];
      MES_ACHATS.club = club;
      fetch('/api/ram/c/' + encodeURIComponent(club) + '/achats', { credentials: 'include' })
        .then(r => (r.ok ? r.json() : { eleves: [] }))
        .then(d => {
          const avant = JSON.stringify(MES_ACHATS.eleves);
          MES_ACHATS.eleves = (d && d.eleves) || [];
          if (MES_ACHATS.club === club && JSON.stringify(MES_ACHATS.eleves) !== avant) render(true);
        })
        .catch(() => {});
    }
    return MES_ACHATS.eleves;
  }
  if (typeof ELEVES === 'undefined') return [];
  const groupes = GROUPS.concat(typeof COURS !== 'undefined' ? COURS : []);
  return svMine()
    .map(k => {
      const e = ELEVES.find(x => x.id === k);
      if (!e || !(e.achats || []).length) return null;
      const r = REGLES.resumeAchats(k, e.achats, SEANCES, groupes, {}, TODAY);
      return { key: k, nom: first(k), achats: r.achats, termines: r.termines };
    })
    .filter(x => x && (x.achats.length || x.termines));
}
const maEur = n => (Math.round(n * 100) / 100).toLocaleString('fr-FR') + ' €';
const maS = n => n + ' séance' + (n > 1 ? 's' : '');
function mesAchatLigne(a) {
  const titre = esc(a.nom || (a.t === 'pack' ? 'Pack' : a.t === 'abo' ? 'Abonnement' : 'Séance')),
    cpt =
      a.t === 'abo'
        ? (a.fin ? 'Jusqu’au ' + fmtD(a.fin, true) + ' · ' : '') +
          (a.mois && a.mois.quota
            ? a.mois.fait + '/' + a.mois.quota + ' ce mois-ci'
            : a.n
              ? a.used + ' sur ' + maS(a.n)
              : maS(a.used) + ' faite' + (a.used > 1 ? 's' : ''))
        : a.n > 1
          ? a.etat === 'encours'
            ? a.used + ' sur ' + a.n + ' séances faites · encore ' + (a.n - a.used)
            : 'Toutes les séances sont faites'
          : a.used
            ? 'Faite'
            : 'À venir',
    mq = a.t === 'abo' && a.mois && a.mois.quota ? a.mois : null,
    pct = mq ? Math.min(100, Math.round((mq.fait / mq.quota) * 100)) : a.n ? Math.min(100, Math.round((a.used / a.n) * 100)) : 0,
    pay = a.aPayer
      ? `<span class="tag mesach-due">À payer : ${maEur(a.aPayer)}</span>`
      : a.reste
        ? `<span class="muted small">Reste à régler plus tard : ${maEur(a.reste)}</span>`
        : '';
  return `<div class="mesach-l"><div class="mesach-t"><b>${titre}</b>${a.t === 'abo' ? ' <span class="tag">Abonné</span>' : ''}</div><span class="muted small">${cpt}</span>${mq ? `<span class="mesach-bar${mq.depasse ? ' depasse' : ''}" role="img" aria-label="${mq.fait} sur ${mq.quota} ce mois-ci"><i style="width:${pct}%"></i></span>` : a.n > 1 ? `<span class="mesach-bar" role="img" aria-label="${a.used} sur ${a.n}"><i style="width:${pct}%"></i></span>` : ''}${pay ? '<div class="mesach-p">' + pay + '</div>' : ''}</div>`;
}
function mesAchatsCarte() {
  const l = mesAchatsListe();
  if (!l.length) return '';
  mesAchatsStyle();
  return l
    .map(e => {
      const qui = e.key === ME() ? 'Mes séances et paiements' : 'Séances et paiements de ' + esc(e.nom || first(e.key)),
        aPayer = e.achats.reduce((s, a) => s + (+a.aPayer || 0), 0);
      return `<div class="card mesach"><div class="calh">${ic('euro')}<b>${qui}</b></div>${aPayer ? `<p class="mesach-tot">À payer maintenant : <b>${maEur(aPayer)}</b></p>` : ''}${e.achats.map(mesAchatLigne).join('') || `<p class="muted small">Rien en cours.</p>`}<p class="muted small">Noté par ton enseignant${e.termines ? ' · ' + e.termines + (e.termines > 1 ? ' achats terminés' : ' achat terminé') : ''}. Une question ? Écris-lui dans Messages de l’enseignant.</p></div>`;
    })
    .join('');
}
function mesAchatsStyle() {
  if (document.getElementById('mesach-css')) return;
  const s = document.createElement('style');
  s.id = 'mesach-css';
  s.textContent =
    '.mesach .mesach-l{padding:10px 0;border-top:1px solid currentColor;border-color:color-mix(in srgb,currentColor 18%,transparent);display:flex;flex-direction:column;gap:4px;min-width:0}' +
    '.mesach .mesach-t{display:flex;flex-wrap:wrap;align-items:center;gap:6px;overflow-wrap:anywhere}' +
    '.mesach .mesach-bar{display:block;height:8px;border:1.5px solid currentColor;border-radius:4px;overflow:hidden;max-width:320px}' +
    '.mesach .mesach-bar i{display:block;height:100%;background:currentColor}' +
    '.mesach .mesach-bar.depasse{border-color:#FF3D6B}.mesach .mesach-bar.depasse i{background:#FF3D6B}' +
    '.mesach .mesach-p{margin-top:2px}.mesach .mesach-tot{margin:4px 0 6px;font-size:16px}' +
    '.mesach .tag.mesach-due{font-size:13px}.mesach .small{font-size:13px}';
  document.head.appendChild(s);
}
/* en tête de Mon espace, au-dessus des messages de l'enseignant */
{
  const base = persoBody;
  persoBody = () => mesAchatsCarte() + base();
}
