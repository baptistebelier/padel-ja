/* =========================================================================
   /RAM — migrations des données, faites une seule fois au démarrage du serveur
   Chaque migration a un nom ; une fois réussie, elle est notée dans les réglages du serveur
   (table server_settings, clé « migrations ») et ne repasse plus. En cas d'échec, elle
   recommence au démarrage suivant (chaque migration peut repasser sans rien abîmer).
   ========================================================================= */
'use strict';

/* les cours particuliers (groupes à date unique, once) quittent la collection « group » pour « cours » :
   même identifiant, même contenu ; le groupe est retiré avant que le cours n'apparaisse (les appareils
   rangent les deux dans la même liste) */
async function coursHorsDesGroupes(ram, log) {
  let n = 0;
  await ram.eachSpace(async id => {
    for (const it of await ram.itemsOf(id, 'group')) {
      if (!it.data || !it.data.once) continue;
      await ram.serverPut(id, 'group', it.id, null);
      await ram.serverPut(id, 'cours', it.id, it.data);
      n++;
    }
  });
  if (n && log) log(`Coach : ${n} cours particulier${n > 1 ? 's' : ''} rangé${n > 1 ? 's' : ''} à part des groupes`);
  return n;
}

/* un cycle individuel (pack d'un seul élève) n'a plus de groupe : l'ancien groupe sans créneau (libre) à un seul élève,
   auquel l'achat de l'élève était rattaché (achat.groupe, achat.cycle), est remplacé par des cours particuliers rattachés
   à cet achat (g.achat), un par date posée. Les séances (présences, bilans), heures, durées, annulations et appels du
   groupe suivent chaque cours ; l'achat (prix, paiements) ne change que par la perte de son lien au groupe, son décompte
   reste le même (une séance rattachée à un achat ne se décompte que de lui). Le groupe n'est supprimé qu'une fois tout copié.
   Un groupe dont des séances sans date portent déjà un thème ou un remplaçant (c.aplan) reste tel quel : rien n'est perdu.
   Peut repasser : les identifiants des cours sont fixes (« groupe_date »). */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const dowIso = d => { const [y, m, j] = d.split('-').map(Number); return new Date(y, m - 1, j).getDay(); };
async function cyclesIndividuelsSansGroupe(ram, log) {
  let nb = 0, gardes = 0;
  await ram.eachSpace(async id => {
    const groupes = (await ram.itemsOf(id, 'group')).filter(x => x.data && x.data.libre && !x.data.once);
    if (!groupes.length) return;
    const eleves = new Map((await ram.itemsOf(id, 'eleve')).map(x => [x.id, x.data])), seances = await ram.itemsOf(id, 'seance');
    for (const { id: gid, data: g } of groupes) {
      const ks = [].concat(g.mem || [], g.ext || []);
      if (ks.length !== 1) continue;
      const k = ks[0], el = eleves.get(k), lies = el ? (el.achats || []).filter(a => a.groupe === gid || String(a.cycle || '').split(':')[0] === gid) : [];
      if (!lies.length) continue;
      if ((g.cycles || []).some(c => (c.aplan || []).some(p => p && Object.keys(p).length))) { gardes++; continue; }
      const dates = new Set([].concat(g.extra || [], ...(g.cycles || []).map(c => c.dates || [])));
      seances.filter(s => s.data && s.data.g === gid && ISO.test(String(s.data.d))).forEach(s => dates.add(s.data.d));
      const achatDe = d => {
        const cy = (g.cycles || []).find(c => (c.dates || []).includes(d));
        return (cy && lies.find(a => a.cycle === gid + ':' + cy.id)) || lies.find(a => a.groupe === gid && !a.cycle) || lies[0];
      };
      for (const d of [...dates].filter(x => ISO.test(String(x))).sort()) {
        const a = achatDe(d), cy = (g.cycles || []).find(c => (c.dates || []).includes(d)), cid = gid + '_' + d;
        const c = {
          type: 'train', name: g.name, sport: g.sport, once: d, day: dowIso(d), h: (g.hr && g.hr[d]) || g.h, dur: (g.du && g.du[d]) || (cy && cy.dur) || g.dur,
          defLoc: g.defLoc, locPref: g.locPref, coach: g.coach, mem: (g.mem || []).slice(), ext: (g.ext || []).slice(),
          tarif: { mode: 'seance', prix: 0 }, at: g.at, achat: a.id, couvert: a.t
        };
        if (g.loc && g.loc[d]) c.loc = g.loc[d];
        if (g._club) c._club = g._club;
        c.sub = d.split('-').reverse().join('/') + ' ' + c.h + ' · ' + c.dur;
        if ((g.cancel || []).includes(d)) c.cancel = [d];
        // toute autre donnée rangée par date (appel de /Buvette, thème…) suit sa séance
        Object.keys(g).forEach(key => { const v = g[key]; if (!['hr', 'du', 'loc'].includes(key) && v && typeof v === 'object' && !Array.isArray(v) && v[d] !== undefined) c[key] = { [d]: v[d] }; });
        await ram.serverPut(id, 'cours', cid, c);
        const s = seances.find(x => x.data && x.data.g === gid && x.data.d === d);
        if (s) await ram.serverPut(id, 'seance', cid + '.' + d, Object.assign({}, s.data, { id: cid + '.' + d, g: cid }));
      }
      for (const s of seances) if (s.data && s.data.g === gid && ISO.test(String(s.data.d))) await ram.serverPut(id, 'seance', s.id, null);
      // l'achat ne tient plus à un groupe : il se décompte par les séances qui lui sont rattachées
      const neuf = Object.assign({}, el, { achats: (el.achats || []).map(a => { if (!lies.includes(a)) return a; const b = Object.assign({}, a); delete b.groupe; delete b.cycle; return b; }) });
      await ram.serverPut(id, 'eleve', k, neuf);
      eleves.set(k, neuf);
      await ram.serverPut(id, 'group', gid, null);
      nb++;
    }
  });
  if (log && (nb || gardes)) log(`Coach : ${nb} cycle${nb > 1 ? 's' : ''} individuel${nb > 1 ? 's' : ''} sorti${nb > 1 ? 's' : ''} de leur groupe${gardes ? ', ' + gardes + ' laissé' + (gardes > 1 ? 's' : '') + ' tel' + (gardes > 1 ? 's' : '') + ' quel' + (gardes > 1 ? 's' : '') + ' (séances sans date déjà détaillées)' : ''}`);
  return nb;
}

async function run(store, steps, log) {
  const done = Object.assign({}, (await store.getSetting('migrations')) || {});
  for (const [name, fn] of steps) {
    if (done[name]) continue;
    try { await fn(); done[name] = Date.now(); await store.saveSetting('migrations', done); }
    catch (e) { if (log) log(`Migration « ${name} » : ${e.message}`); return; }
  }
}

module.exports = { run, coursHorsDesGroupes, cyclesIndividuelsSansGroupe };
