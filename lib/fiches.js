/* =========================================================================
   /RAM — fiches joueurs /RAM JA nourries par /RAM Club
   - Profil sportif : sexe, année de naissance, niveau padel (1 à 10), classement tennis et
     classement padel du profil /RAM Club recopiés sur la fiche joueur du compte (depuis son club
     principal : celui de sa licence).
   - Enfants sans compte : un jeune inscrit au club par ses parents reçoit sa propre fiche joueur
     (rattachée à son profil du club par « _ja »), pour ses tournois /RAM JA.
   Recopie après chaque changement d'un espace /RAM Club ; seules les fiches qui changent sont écrites.
   ========================================================================= */
'use strict';
const crypto = require('crypto');

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const split = n => { const w = String(n || '').trim().split(/\s+/); return { first: w.shift() || '', last: w.join(' ').toUpperCase() }; };

/* profil sportif tiré du profil /RAM Club (rien n'est effacé si le profil ne le dit pas) */
function sportOf(d, pl) {
  const by = parseInt(String(d.bd || '').slice(0, 4), 10), lv = +d.pl;
  const out = {
    sex: d.g === 'F' ? 'F' : d.g === 'H' ? 'H' : pl.sex || null,
    birth_year: by > 1900 && by < 2100 ? by : pl.birth_year || null,
    padel_level: lv >= 1 && lv <= 10 ? lv : pl.padel_level || null,
    tennis_rank: d.r ? String(d.r).slice(0, 12) : pl.tennis_rank || null
  };
  if (d.pad) out.rank = String(d.pad).slice(0, 12);   // classement padel (numéro)
  return out;
}
const same = (pl, o) => Object.keys(o).every(k => (pl[k] ?? null) === (o[k] ?? null));

function createFiches({ store, ram, mainClubOf }) {
  const api = {
    async syncSpace(spaceId) {
      const sp = (await ram.spaces()).find(s => s.id === spaceId);
      if (!sp) return;
      const items = await ram.memberItems(spaceId); if (!items) return;
      for (const m of items) {
        const d = m.data;
        if (m.user_id) {
          // adulte avec compte : sa fiche suit le profil de son club principal
          const main = await mainClubOf(m.user_id).catch(() => null);
          if (main && sp.club_id && main !== sp.club_id) continue;
          const id = await store.getIdentity(m.user_id).catch(() => null);
          const pl = id && id.player ? await store.getPlayer(id.player).catch(() => null) : null;
          if (!pl) continue;
          const o = sportOf(d, pl);
          if (!same(pl, o)) await store.savePlayer(Object.assign(pl, o, { updated_at: Date.now() }));
        } else if (d.parent) {
          // enfant sans compte : sa fiche joueur, reliée à son profil du club
          const known = d._ja ? await store.getPlayer(d._ja).catch(() => null) : null;
          let pl = known;
          const n = split(d.n);
          if (!n.last && !n.first) continue;
          if (!pl) pl = { id: 'j' + crypto.randomBytes(9).toString('base64url').replace(/[^\w]/g, '').slice(0, 12), created_at: Date.now(), created_by: 'ramclub', rank: '', user_id: null };
          const o = Object.assign({ last: n.last || pl.last || '', first: n.first || pl.first || '', licence: String(d.lic || pl.licence || '').replace(/\s+/g, '').toUpperCase(), club_id: sp.club_id || pl.club_id || null }, sportOf(d, pl));
          const fresh = !known;   // pas encore de fiche (ou fiche effacée) : créée et reliée
          if (fresh || !same(pl, o)) {
            Object.assign(pl, o, { updated_at: Date.now() });
            pl.name_key = norm(pl.last) + '|' + norm(pl.first);
            pl.search = norm(`${pl.last} ${pl.first} ${pl.licence}`);
            await store.savePlayer(pl);
          }
          if (fresh) await ram.serverPut(spaceId, 'member', m.key, Object.assign({}, d, { _ja: pl.id }));
        }
      }
    },
    async syncAllSpaces() { await ram.eachSpace(id => api.syncSpace(id)); },
    watch(log) {
      const timers = new Map();
      let chain = Promise.resolve();
      ram.onChange(spaceId => {
        clearTimeout(timers.get(spaceId));
        timers.set(spaceId, setTimeout(() => { timers.delete(spaceId); chain = chain.then(() => api.syncSpace(spaceId)).catch(e => log && log('Fiches joueurs : ' + e.message)); }, 3000));
      });
    }
  };
  return api;
}

module.exports = { createFiches, sportOf };
