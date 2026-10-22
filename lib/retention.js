/* =========================================================================
   /RAM JA — durée de conservation (RGPD)
   Base de joueurs partagée : un joueur sans tournoi clôturé depuis 3 ans est
   supprimé avec son historique (annoncé dans la politique de confidentialité).
   ========================================================================= */
'use strict';
const YEARS = 3;
const SPAN = YEARS * 365.25 * 864e5;

// joueurs dont le dernier tournoi (ou, sans tournoi, la création de la fiche) date de plus de 3 ans
function stalePlayers({ players, parts }, now = Date.now()) {
  const last = {};
  parts.forEach(x => { last[x.player_id] = Math.max(last[x.player_id] || 0, x.closed_at || 0); });
  // une fiche rattachée à un compte /RAM vit aussi longtemps que le compte (son titulaire la gère lui-même)
  return players.filter(p => !p.user_id && (last[p.id] || p.created_at || now) < now - SPAN).map(p => p.id);
}

async function purgePlayers(store, now) {
  if (!store.playerActivity) return 0;
  const ids = stalePlayers(await store.playerActivity(), now).slice(0, 500);   // 500 par passage au plus
  for (const id of ids) await store.deletePlayer(id);
  return ids.length;
}

// une fois par jour (et 5 min après le démarrage)
function schedule(store, log) {
  const run = () => purgePlayers(store)
    .then(n => { if (n) log(`RGPD : ${n} joueur(s) sans tournoi depuis ${YEARS} ans supprimé(s)`); })
    .catch(e => { if (!/players|participations|404|PGRST20|does not exist/.test(e.message)) log('Purge RGPD impossible : ' + e.message); });
  setTimeout(run, 5 * 60e3).unref();
  setInterval(run, 24 * 3600e3).unref();
}

module.exports = { stalePlayers, purgePlayers, schedule, YEARS };
