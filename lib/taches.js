/* =========================================================================
   /RAM — file de tâches : tout ce qui se fait « après » (notifications, e-mails, réservations Calendly)
   - Chaque tâche est écrite en base avant d'être faite : un redémarrage du serveur ne perd rien.
   - Une tâche qui échoue est retentée plus tard (30 s, 1 min, 2 min… 8 essais), puis notée « failed ».
   - dedupe_key : une même tâche (webhook renvoyé deux fois…) n'entre qu'une fois dans la file.
   - run_at : une tâche peut attendre son heure (rappels de cours).
   - Plusieurs serveurs peuvent vider la même file sans jamais prendre deux fois la même tâche
     (tasks_claim : FOR UPDATE SKIP LOCKED, voir supabase-taches.sql).
   ========================================================================= */
'use strict';

const MAX_ATTEMPTS = 8, LOCK_S = 120, BATCH = 20, POLL_MS = 3000;
const backoff = attempts => Math.min(30e3 * 2 ** Math.max(0, attempts - 1), 3600e3);

function createTaches({ store, log = () => {} }) {
  const handlers = new Map();
  let pending = [], flushT = null, timer = null, running = false, again = false, stopped = true;

  /* écrit les tâches du moment d'un seul coup (une annonce à 300 adhérents : une seule requête) */
  function flush() {
    flushT = null;
    const list = pending; pending = [];
    if (!list.length) return;
    store.tasksAdd(list.map(x => x.row)).then(
      () => { list.forEach(x => x.ok()); kick(); },
      // base injoignable : la tâche est faite tout de suite plutôt que perdue
      e => { log('File de tâches : écriture impossible, exécution directe : ' + e.message); list.forEach(x => { runNow(x.row).then(x.ok, x.ok); }); }
    );
  }
  async function runNow(row) {
    const fn = handlers.get(row.kind);
    if (fn) try { await fn(row.payload); } catch (e) { log(`Tâche ${row.kind} : ${e.message}`); }
  }
  /* ajouter une tâche ; opts.at : pas avant ce moment (ms) ; opts.key : une seule fois pour cette clé */
  function enqueue(kind, payload, opts = {}) {
    return new Promise(ok => {
      pending.push({ ok, row: { kind, payload: payload || {}, dedupe_key: opts.key || null, run_at: new Date(opts.at || Date.now()).toISOString() } });
      if (!flushT) flushT = setTimeout(flush, 30);
    });
  }
  async function one(t) {
    const fn = handlers.get(t.kind);
    try {
      if (!fn) throw new Error('aucun traitement pour « ' + t.kind + ' »');
      await fn(t.payload);
      await store.tasksDone(t.id);
    } catch (e) {
      const final = t.attempts >= MAX_ATTEMPTS;
      log(`Tâche ${t.kind} n° ${t.id}, essai ${t.attempts} : ${e.message}`);
      await store.tasksFail(t.id, String(e.message).slice(0, 500), new Date(Date.now() + backoff(t.attempts)).toISOString(), final).catch(() => {});
    }
  }
  /* vider ce qui est dû ; renvoie le nombre de tâches traitées */
  async function drain() {
    if (running) { again = true; return 0; }
    running = true;
    let n = 0;
    try {
      for (;;) {
        again = false;
        const list = await store.tasksClaim(BATCH, LOCK_S);
        if (!list.length && !again) break;
        await Promise.all(list.map(one));
        n += list.length;
      }
    } catch (e) { log('File de tâches : ' + e.message); }
    finally { running = false; }
    return n;
  }
  function kick() { if (!stopped) drain(); }
  return {
    enqueue, drain,
    on(kind, fn) { handlers.set(kind, fn); return this; },
    /* attendre que les écritures en cours soient faites (tests, arrêt du serveur) */
    settle() { if (flushT) { clearTimeout(flushT); flush(); } return Promise.resolve(); },
    start() {
      stopped = false;
      timer = setInterval(() => drain(), POLL_MS);
      if (timer.unref) timer.unref();
      const purge = () => store.tasksPurge(Date.now() - 30 * 864e5).catch(e => log('File de tâches : ' + e.message));
      const p = setInterval(purge, 24 * 3600e3); if (p.unref) p.unref();
      drain();
    },
    stop() { stopped = true; clearInterval(timer); },
    stats: () => store.tasksStats()
  };
}

module.exports = { createTaches, backoff, MAX_ATTEMPTS };
