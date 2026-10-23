/* =========================================================================
   /RAM — progression des adhérents : compteurs d'actions, trophées et points d'investissement,
   par club et par saison (table member_progress, cf. supabase-clubs.sql)
   - Calculée par le serveur à partir des données de l'espace /RAM Club (lib/ram-score.js) :
     les appareils ne l'envoient jamais, personne ne peut la gonfler à la main.
   - Recopiée après chaque changement d'un espace (même déclencheur que les adhésions) :
     seules les lignes qui ont changé sont écrites.
   ========================================================================= */
'use strict';
const crypto = require('crypto');

const rowId = (clubId, userId, season) => 'g' + crypto.createHash('sha1').update([clubId, userId, season].join('|')).digest('hex').slice(0, 16);
const sameJson = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});

function createProgression({ store, ram }) {
  const api = {
    /* progression des adhérents d'un espace /RAM Club relié au référentiel des clubs */
    async syncSpace(spaceId) {
      const sp = (await ram.spaces()).find(s => s.id === spaceId);
      if (!sp || !sp.club_id) return;
      const list = await ram.progress(spaceId); if (!list || !list.length) return;
      const season = list[0].season;
      const existing = (await store.listProgress('club_id', sp.club_id)).filter(r => r.season === season);
      const keep = new Set(), now = Date.now();
      for (const p of list) {
        const id = rowId(sp.club_id, p.user_id, p.season);
        keep.add(id);
        const cur = existing.find(r => r.id === id);
        const row = { id, club_id: sp.club_id, user_id: p.user_id, season: p.season, points: p.points, counts: p.counts || {}, trophies: p.trophies || {}, updated_at: now };
        if (cur && cur.points === row.points && sameJson(cur.counts, row.counts) && sameJson(cur.trophies, row.trophies)) continue;
        await store.saveProgress(row);
      }
      // adhérent parti du club : sa ligne de la saison en cours disparaît (les saisons passées restent)
      for (const r of existing) if (!keep.has(r.id)) await store.deleteProgress(r.id);
    },
    async syncAllSpaces() { await ram.eachSpace(id => api.syncSpace(id)); },
    /* recopie différée : plusieurs changements rapprochés d'un même espace = un seul calcul */
    watch(log) {
      const timers = new Map();
      let chain = Promise.resolve();
      ram.onChange(spaceId => {
        clearTimeout(timers.get(spaceId));
        timers.set(spaceId, setTimeout(() => { timers.delete(spaceId); chain = chain.then(() => api.syncSpace(spaceId)).catch(e => log && log('Progression : ' + e.message)); }, 3000));
      });
    },
    ofUser: userId => store.listProgress('user_id', userId)
  };
  return api;
}

module.exports = { createProgression };
