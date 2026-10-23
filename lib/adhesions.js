/* =========================================================================
   /RAM — adhésions : qui appartient à quel club, avec quel rôle, pour quelle saison
   (table club_members, cf. supabase-clubs.sql)
   Une ligne par personne, club, saison et origine :
   - ramclub : adhésion /RAM Club, recopiée à chaque changement d'un espace (rôle d'accès,
               validation du bureau pour la saison)
   - compte  : club indiqué sur le compte /RAM (club de licence)
   - tournoi : club saisi par un juge-arbitre pour un joueur, à la clôture d'un tournoi
   Les identifiants sont calculés (club + personne + saison + origine) : réécrire une
   adhésion ne crée jamais de doublon.
   ========================================================================= */
'use strict';
const crypto = require('crypto');
const { seasonOf } = require('./ramclub.js');

const ROLE = { bureau: 'bureau', coach: 'coach', mem: 'adherent' };
const rowId = (clubId, who, season, source) => 'm' + crypto.createHash('sha1').update([clubId, who, season, source].join('|')).digest('hex').slice(0, 16);
const same = (a, b) => ['club_id', 'user_id', 'player_id', 'role', 'status', 'season', 'source', 'licence_club'].every(k => (a[k] ?? null) === (b[k] ?? null));

function createAdhesions({ store, ram, onUsers }) {
  /* fiche joueur d'un compte, seulement si elle existe encore (clé étrangère) */
  async function playerOf(userId) {
    const id = await store.getIdentity(userId).catch(() => null);
    const pl = id && id.player ? await store.getPlayer(id.player).catch(() => null) : null;
    return pl ? pl.id : null;
  }
  /* écrire la liste voulue pour un périmètre : ajoute, met à jour, retire ce qui n'y est plus */
  async function apply(existing, wanted) {
    const now = Date.now(), keep = new Set(wanted.map(w => w.id));
    for (const w of wanted) {
      const cur = existing.find(e => e.id === w.id);
      if (cur && same(cur, w)) continue;
      await store.saveMembership(Object.assign({ created_at: (cur && cur.created_at) || now }, w, { updated_at: now }));
    }
    for (const e of existing) if (!keep.has(e.id)) await store.deleteMembership(e.id);
  }

  const api = {
    seasonOf,
    /* club du compte : une ligne « compte » pour la saison en cours (aucune s'il n'a pas de club) */
    async syncAccount(u, playerId) {
      if (!u || u.guest) return;
      const season = seasonOf();
      const existing = (await store.listMemberships('user_id', u.id)).filter(m => m.source === 'compte' && m.season === season);
      const wanted = u.club_id ? [{ id: rowId(u.club_id, u.id, season, 'compte'), club_id: u.club_id, user_id: u.id, player_id: playerId || null,
        role: 'joueur', status: 'actif', season, source: 'compte', licence_club: true }] : [];
      await apply(existing, wanted);
    },
    /* club d'un joueur saisi à la clôture d'un tournoi */
    async addTournamentPlayer(pl) {
      if (!pl || !pl.club_id) return;
      const season = seasonOf();
      const id = rowId(pl.club_id, pl.id, season, 'tournoi');
      const existing = (await store.listMemberships('player_id', pl.id)).filter(m => m.id === id);
      await apply(existing, [{ id, club_id: pl.club_id, user_id: pl.user_id || null, player_id: pl.id, role: 'joueur', status: 'actif', season, source: 'tournoi', licence_club: true }]);
    },
    /* adhérents d'un espace /RAM Club recopiés dans le référentiel, pour la saison du club */
    async syncSpace(spaceId) {
      const sp = (await ram.spaces()).find(s => s.id === spaceId);
      if (!sp || !sp.club_id) return;
      const roster = await ram.roster(spaceId); if (!roster) return;
      const season = (roster[0] && roster[0].season) || seasonOf();
      const existing = (await store.listMemberships('club_id', sp.club_id)).filter(m => m.source === 'ramclub' && m.season === season);
      const wanted = [];
      for (const r of roster) {
        wanted.push({ id: rowId(sp.club_id, r.user_id, season, 'ramclub'), club_id: sp.club_id, user_id: r.user_id, player_id: await playerOf(r.user_id),
          role: ROLE[r.role] || 'adherent', status: r.valid ? 'actif' : 'attente', season, source: 'ramclub', licence_club: false });
      }
      await apply(existing, wanted);
      // comptes concernés : leur club /RAM JA suit leur club /RAM Club (cf. ramClubOf)
      if (onUsers) await onUsers([...new Set(existing.concat(wanted).map(r => r.user_id).filter(Boolean))]);
    },
    /* club /RAM Club d'un compte : son adhésion validée la plus récente (null s'il n'en a aucune) */
    async ramClubOf(userId) {
      const rows = (await store.listMemberships('user_id', userId)).filter(r => r.source === 'ramclub' && r.status === 'actif');
      rows.sort((a, b) => b.season.localeCompare(a.season) || (b.created_at || 0) - (a.created_at || 0));
      return rows.length ? rows[0].club_id : null;
    },
    async syncAllSpaces() { for (const s of await ram.spaces()) await api.syncSpace(s.id).catch(() => {}); },
    /* recopie différée : plusieurs changements rapprochés d'un même espace = une seule écriture */
    watch(log) {
      const timers = new Map();
      let chain = Promise.resolve();
      ram.onChange(spaceId => {
        clearTimeout(timers.get(spaceId));
        timers.set(spaceId, setTimeout(() => { timers.delete(spaceId); chain = chain.then(() => api.syncSpace(spaceId)).catch(e => log && log('Adhésions : ' + e.message)); }, 1500));
      });
    },
    /* adhésions d'un compte (par son compte ou par sa fiche joueur), de la plus récente à la plus ancienne */
    async ofUser(userId, playerId) {
      const rows = await store.listMemberships('user_id', userId);
      if (playerId) (await store.listMemberships('player_id', playerId)).forEach(r => { if (!rows.some(x => x.id === r.id)) rows.push(r); });
      return rows.sort((a, b) => b.season.localeCompare(a.season) || (b.updated_at || 0) - (a.updated_at || 0));
    }
  };
  return api;
}

module.exports = { createAdhesions, rowId };
