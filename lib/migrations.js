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

async function run(store, steps, log) {
  const done = Object.assign({}, (await store.getSetting('migrations')) || {});
  for (const [name, fn] of steps) {
    if (done[name]) continue;
    try { await fn(); done[name] = Date.now(); await store.saveSetting('migrations', done); }
    catch (e) { if (log) log(`Migration « ${name} » : ${e.message}`); return; }
  }
}

module.exports = { run, coursHorsDesGroupes };
