/* =========================================================================
   /RAM JA — sauvegardes
   Export complet de toutes les données (comptes, tournois, réglages, joueurs)
   au format JSON, une fois par semaine, rangé dans un stockage privé :
   - en ligne : Supabase Storage, bucket privé « sauvegardes »
   - en local : dossier data/sauvegardes
   On garde les 12 dernières (environ 3 mois).
   ========================================================================= */
'use strict';
const KEEP = 12;
const WEEK = 7 * 24 * 3600e3;

const nameFor = d => `padel-ja-${d.toISOString().slice(0, 10)}-${d.toISOString().slice(11, 16).replace(':', 'h')}.json`;
const dateOf = name => { const m = /(\d{4}-\d\d-\d\d)-(\d\d)h(\d\d)/.exec(name); return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:00Z`) : 0; };

async function createBackup(store, reason) {
  const at = new Date();
  const data = await store.dumpAll();
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  const text = JSON.stringify({ app: 'padel-ja', version: 1, at: at.toISOString(), reason: reason || 'manuel', counts, data });
  const name = nameFor(at);
  await store.putBackup(name, text);
  // rotation : on supprime les plus anciennes au-delà de 12
  const all = await store.listBackups();
  for (const old of all.slice(KEEP)) await store.deleteBackup(old.name).catch(() => {});
  return { name, size: text.length, counts };
}

// vérifie toutes les 6 h (et 2 min après le démarrage) si la dernière sauvegarde a plus de 7 jours
function schedule(store, log) {
  const check = async () => {
    try {
      const last = (await store.listBackups())[0];
      if (last && Date.now() - dateOf(last.name) < WEEK) return;
      const b = await createBackup(store, 'hebdomadaire');
      log(`Sauvegarde hebdomadaire : ${b.name} (${Math.round(b.size / 1024)} Ko, ${b.counts.tournaments} tournois)`);
    } catch (e) { log('Sauvegarde hebdomadaire impossible : ' + e.message); }
  };
  setTimeout(check, 2 * 60e3).unref();
  setInterval(check, 6 * 3600e3).unref();
}

module.exports = { createBackup, schedule, dateOf, KEEP };
