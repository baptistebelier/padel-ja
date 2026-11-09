/* =========================================================================
   /RAM — réconciliation des fiches personnes (page Administration de /RAM JA)
   1. analyser() : ce qui désigne deux fois la même personne, et ce qui reste à vérifier à la main
      - fiche élève sans compte (/RAM Coach) et profil d'adhérent du même club au même nom → relier l'élève à l'adhérent ;
      - deux fiches élèves sans compte au même nom dans un club → les fusionner ;
      - deux fiches personnes (table players) de la même personne : même licence, ou même nom sans licence
        contradictoire et sans deux comptes différents → les fusionner ;
      - à vérifier seulement (jamais fusionné d'office) : même nom avec deux licences ou deux comptes différents,
        comptes différents au même nom.
   2. appliquer(ids) : sauvegarde complète d'abord (stockage des sauvegardes), puis les fusions choisies.
      Rien ne se perd : achats, niveaux, notes, groupes, séances, bilans, résultats de tournois passent sur la fiche gardée.
   ========================================================================= */
'use strict';
const { norm, licOf } = require('./fiches.js');

const copie = o => JSON.parse(JSON.stringify(o));
/* fiche élève gardée, complétée par l'autre (même règle que l'outil de fusion de /RAM Coach) */
function ficheFusionnee(garde, autre, nom) {
  const out = Object.assign({}, autre, garde, { n: nom || garde.n || autre.n });
  const achats = (garde.achats || []).slice();
  (autre.achats || []).forEach(h => { if (!achats.some(x => x.id === h.id || (x.ref === h.ref && x.d === h.d))) achats.push(h); });
  if (achats.length) out.achats = achats;
  if (garde.note && autre.note && garde.note !== autre.note) out.note = (garde.note + '\n' + autre.note).slice(0, 1000);
  if (garde.tech || autre.tech) out.tech = Object.assign({}, autre.tech, garde.tech);
  if (garde.lvlH || autre.lvlH) out.lvlH = [...(autre.lvlH || []), ...(garde.lvlH || [])].sort((a, b) => String(a.d).localeCompare(String(b.d)));
  delete out._ja;   // le serveur la rattache à nouveau (lib/fiches.js)
  return out;
}

function createReconciliation({ store, ram }) {
  async function contenu(spaceId) {
    const get = async coll => { const o = {}; ((ram.itemsOf && await ram.itemsOf(spaceId, coll)) || []).forEach(x => { o[x.id] = x.data; }); return o; };
    return { member: await get('member'), eleve: await get('eleve'), group: await get('group'), seance: await get('seance'), suivi: await get('suivi') };
  }
  /* tout ce qui porte la clé « de » passe sur « vers » : groupes, séances (appel, ajouts, retraits), suivi */
  function changeCle(K, de, vers) {
    const ops = [], lui = K.member[vers] ? 'mem' : 'ext';
    Object.entries(K.group).forEach(([id, g]) => {
      if (!(g.ext || []).includes(de) && !(g.mem || []).includes(de)) return;
      const n = copie(g);
      n.ext = (n.ext || []).filter(x => x !== de); n.mem = (n.mem || []).filter(x => x !== de);
      if (!n[lui].includes(vers)) n[lui].push(vers);
      ops.push({ coll: 'group', id, data: n });
    });
    Object.entries(K.seance).forEach(([id, s]) => {
      if (!(s.pres && s.pres[de]) && !(s.plus || []).includes(de) && !(s.out || []).includes(de)) return;
      const n = copie(s);
      if (n.pres && n.pres[de]) { n.pres[vers] = n.pres[vers] || n.pres[de]; delete n.pres[de]; }
      ['plus', 'out'].forEach(k => { if (n[k]) n[k] = [...new Set(n[k].map(x => (x === de ? vers : x)))]; });
      ops.push({ coll: 'seance', id, data: n });
    });
    Object.entries(K.suivi).forEach(([id, x]) => { if (x.to === de) ops.push({ coll: 'suivi', id, data: Object.assign({}, x, { to: vers }) }); });
    return ops;
  }

  /* relier une fiche élève sans compte à l'adhérent « vers » du même club (même personne, confirmée) */
  async function relier(spaceId, de, vers) {
    const K = await contenu(spaceId);
    if (!K.eleve[de] || !K.member[vers]) return false;
    await ram.serverPut(spaceId, 'eleve', vers, ficheFusionnee(K.eleve[vers] || {}, K.eleve[de], K.member[vers].n));
    for (const o of changeCle(K, de, vers)) { await ram.serverPut(spaceId, o.coll, o.id, o.data); K[o.coll][o.id] = o.data; }
    await ram.serverPut(spaceId, 'eleve', de, null);
    return true;
  }
  async function analyser() {
    const props = [], aVerifier = [];
    const spaces = await ram.spaces();
    // 1 et 2 : dans chaque club, élèves sans compte et adhérents du même nom
    for (const sp of spaces) {
      const K = await contenu(sp.id);
      const membres = Object.entries(K.member).filter(([, d]) => d && !d.req && d.n);
      const parNom = new Map();
      membres.forEach(([k, d]) => { const n = norm(d.n); (parNom.get(n) || parNom.set(n, []).get(n)).push(k); });
      const eleves = Object.entries(K.eleve).filter(([k, d]) => d && d.n && !K.member[k]);
      const elevesParNom = new Map();
      eleves.forEach(([k, d]) => { const n = norm(d.n); (elevesParNom.get(n) || elevesParNom.set(n, []).get(n)).push(k); });
      for (const [n, ks] of elevesParNom) {
        const m = parNom.get(n) || [];
        if (m.length === 1) ks.forEach(k => props.push({ id: `relier:${sp.id}:${k}:${m[0]}`, type: 'relier', club: sp.name, texte: `${K.eleve[k].n} : la fiche élève sans compte devient celle de l'adhérent du club (achats, groupes, séances et bilans compris).` }));
        else if (m.length > 1) aVerifier.push({ club: sp.name, texte: `${K.eleve[ks[0]].n} : fiche élève sans compte et ${m.length} adhérents du même nom. Reliez-la dans /RAM Coach à la bonne personne.` });
        else if (ks.length > 1 && new Set(ks.map(k => licOf(K.eleve[k].lic)).filter(Boolean)).size > 1) aVerifier.push({ club: sp.name, texte: `${K.eleve[ks[0]].n} : ${ks.length} fiches élèves du même nom avec des licences différentes : des homonymes, probablement. Rien n'est fusionné.` });
        else if (ks.length > 1) props.push({ id: `eleves:${sp.id}:${ks[0]}:${ks.slice(1).join(',')}`, type: 'eleves', club: sp.name, texte: `${K.eleve[ks[0]].n} : ${ks.length} fiches élèves du même nom dans ce club, réunies en une seule.` });
      }
    }
    // 3 : fiches personnes en double
    const fiches = await store.listAllPlayers();
    const groupes = new Map();
    fiches.forEach(p => { const k = p.name_key || (norm(p.last) + '|' + norm(p.first)); (groupes.get(k) || groupes.set(k, []).get(k)).push(p); });
    const parLic = new Map();
    fiches.filter(p => licOf(p.licence)).forEach(p => { const l = licOf(p.licence); (parLic.get(l) || parLic.set(l, []).get(l)).push(p); });
    const vus = new Set();
    const proposer = (l, raison) => {
      const comptes = new Set(l.map(p => p.user_id).filter(Boolean));
      if (comptes.size > 1) { aVerifier.push({ texte: `${l[0].first} ${l[0].last} : ${l.length} fiches ${raison} reliées à ${comptes.size} comptes différents. Une même personne avec plusieurs comptes : à vérifier avec elle avant de fusionner les comptes.` }); return; }
      const garde = l.slice().sort((a, b) => (b.user_id ? 1 : 0) - (a.user_id ? 1 : 0) || (a.created_at || 0) - (b.created_at || 0))[0];
      const autres = l.filter(p => p.id !== garde.id);
      if (!autres.length || l.every(p => vus.has(p.id))) return;
      l.forEach(p => vus.add(p.id));
      props.push({ id: `fiches:${garde.id}:${autres.map(p => p.id).join(',')}`, type: 'fiches', texte: `${garde.first} ${garde.last} : ${l.length} fiches ${raison}, réunies en une seule${garde.user_id ? ' (celle du compte)' : ''} avec tous ses résultats de tournois.` });
    };
    for (const l of parLic.values()) if (l.length > 1) proposer(l, 'avec la même licence');
    for (const l of groupes.values()) {
      if (l.length < 2) continue;
      const lics = new Set(l.map(p => licOf(p.licence)).filter(Boolean));
      if (lics.size > 1) { aVerifier.push({ texte: `${l[0].first} ${l[0].last} : ${l.length} fiches au même nom avec des licences différentes (${[...lics].join(', ')}) : des homonymes, probablement. Rien n'est fusionné.` }); continue; }
      proposer(l.filter(p => !vus.has(p.id)).length > 1 ? l.filter(p => !vus.has(p.id)) : l, 'au même nom');
    }
    // comptes au même nom (plusieurs comptes pour une même personne ?)
    const users = (await store.listUsers()).filter(u => !u.guest && u.name);
    const parNomU = new Map();
    users.forEach(u => { const k = norm(u.name); (parNomU.get(k) || parNomU.set(k, []).get(k)).push(u); });
    for (const l of parNomU.values()) if (l.length > 1) aVerifier.push({ texte: `${l[0].name} : ${l.length} comptes (${l.map(u => u.email).join(', ')}). Si c'est la même personne, elle garde un compte ; ses fiches sont alors réunies ci-dessus.` });
    return { propositions: props, aVerifier, fiches: fiches.length, clubs: spaces.length };
  }

  async function appliquer(ids, log = () => {}) {
    const { propositions } = await analyser(), choisies = propositions.filter(p => ids.includes(p.id));
    if (!choisies.length) return { fait: 0 };
    // sauvegarde complète avant toute fusion
    const nom = 'reconciliation-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    await store.putBackup(nom, JSON.stringify(await store.dumpAll()));
    let fait = 0;
    for (const p of choisies) {
      const [type, a, b, c] = p.id.split(':');
      try {
        if (type === 'relier' || type === 'eleves') {
          const K = await contenu(a);
          const cibles = type === 'relier' ? [[b, c]] : c.split(',').map(x => [x, b]);
          for (const [de, vers] of cibles) {
            if (!K.eleve[de]) continue;
            const garde = K.eleve[vers] || {}, nomGarde = (K.member[vers] && K.member[vers].n) || garde.n;
            await ram.serverPut(a, 'eleve', vers, ficheFusionnee(garde, K.eleve[de], nomGarde));
            for (const o of changeCle(K, de, vers)) { await ram.serverPut(a, o.coll, o.id, o.data); K[o.coll][o.id] = o.data; }
            await ram.serverPut(a, 'eleve', de, null);
          }
        } else if (type === 'fiches') {
          const garde = a, doublons = b.split(',');
          for (const d of doublons) {
            await store.moveParticipations(d, garde);
            for (const m of await store.listMemberships('player_id', d)) await store.saveMembership(Object.assign({}, m, { player_id: garde }));
            // compte relié à la fiche disparue : il reprend la fiche gardée
            const ids2 = await store.listIdentities();
            for (const r of ids2) if (r.identity && r.identity.player === d) { const idt = await store.getIdentity(r.owner); idt.player = garde; await store.saveIdentity(r.owner, idt); }
            // profils et fiches élèves reliés à la fiche disparue, dans tous les clubs
            for (const sp of await ram.spaces()) {
              for (const coll of ['member', 'eleve']) for (const x of (await ram.itemsOf(sp.id, coll)) || []) if (x.data._ja === d) await ram.serverPut(sp.id, coll, x.id, Object.assign({}, x.data, { _ja: garde }));
            }
            await store.deletePlayer(d);
          }
        }
        fait++; log('Fusion faite : ' + p.texte);
      } catch (e) { log('Fusion impossible (' + p.texte + ') : ' + e.message); }
    }
    return { fait, sauvegarde: nom };
  }
  return { analyser, appliquer, relier };
}

module.exports = { createReconciliation, ficheFusionnee };
