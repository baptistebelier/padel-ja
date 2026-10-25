/* =========================================================================
   /RAM — groupes du club : groupes d'entraînement (cours) et équipes, avec leurs membres
   (tables club_groups et club_group_members, cf. supabase-clubs.sql) et présences aux cours (club_attendance) :
   présence annoncée par l'élève ou ses parents, présence relevée à l'appel par l'enseignant, cours annulé
   Recopiés depuis l'espace /RAM Club après chaque changement (même déclencheur que les
   adhésions) : seules les lignes qui ont changé sont écrites. Un enfant sans compte y figure
   par sa clé d'adhérent, sans compte rattaché.
   ========================================================================= */
'use strict';
const crypto = require('crypto');

const hid = (p, ...parts) => p + crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
const SKIP = ['updated_at'];
const same = (a, b) => Object.keys(b).every(k => SKIP.includes(k) || JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));

function createGroupes({ store, ram }) {
  async function apply(t, existing, wanted) {
    const now = Date.now(), keep = new Set(wanted.map(w => w.id));
    for (const w of wanted) {
      const cur = existing.find(e => e.id === w.id);
      if (cur && same(cur, w)) continue;
      await store.saveGroupRow(t, Object.assign({}, w, { updated_at: now }));
    }
    for (const e of existing) if (!keep.has(e.id)) await store.deleteGroupRow(t, e.id);
  }
  const api = {
    async syncSpace(spaceId) {
      const sp = (await ram.spaces()).find(s => s.id === spaceId);
      if (!sp || !sp.club_id) return;
      const g = await ram.groupsOf(spaceId); if (!g) return;
      const groups = [], members = [], attendance = [];
      for (const { key, data: d } of g.groups) {
        const type = d.type === 'team' ? 'team' : 'train';
        const id = hid('gr', spaceId, key);
        groups.push({ id, club_id: sp.club_id, space_id: spaceId, group_key: key, type, name: String(d.name || 'Groupe').slice(0, 120),
          sport: d.sport || null, day: Number.isInteger(d.day) ? d.day : null, start_time: d.h || null, duration: d.dur || null,
          location: d.defLoc || null, coach_user_id: (d.coach && g.users[d.coach]) || null, season: g.season, archived: !!d.old });
        for (const k of new Set(Array.isArray(d.mem) ? d.mem : [])) {
          if (typeof k !== 'string' || !k) continue;
          members.push({ id: hid('gm', id, k), group_id: id, club_id: sp.club_id, user_id: g.users[k] || null, member_key: k, role: d.cap === k ? 'capitaine' : 'membre' });
        }
        // présences : une ligne par élève et par séance dès qu'il y a une réponse, un appel ou une annulation
        if (type === 'train') {
          const resp = d.resp || {}, att = d.att || {}, abs = d.abs || {}, cancel = Array.isArray(d.cancel) ? d.cancel : [];
          const dates = new Set([...Object.keys(resp), ...Object.keys(att), ...Object.keys(abs), ...cancel].filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)));
          for (const day of dates) {
            const keys = new Set([...Object.keys(resp[day] || {}), ...Object.keys(att[day] || {}), ...(Array.isArray(abs[day]) ? abs[day] : []), ...(cancel.includes(day) ? (d.mem || []) : [])]);
            for (const k of keys) {
              if (typeof k !== 'string' || !k) continue;
              const a = (resp[day] || {})[k] || (Array.isArray(abs[day]) && abs[day].includes(k) ? 'no' : null), p = (att[day] || {})[k];
              attendance.push({ id: hid('pr', id, day, k), group_id: id, club_id: sp.club_id, session_date: day, user_id: g.users[k] || null, member_key: k,
                announced: a === 'ok' || a === 'no' ? a : null, present: typeof p === 'boolean' ? p : null, cancelled: cancel.includes(day) });
            }
          }
        }
      }
      // les groupes d'abord (les membres y font référence), les membres retirés ensuite
      const oldGroups = (await store.listGroupRows('groups', 'club_id', sp.club_id)).filter(r => r.space_id === spaceId);
      const keepG = new Set(groups.map(x => x.id));
      await apply('groups', oldGroups.filter(r => keepG.has(r.id)), groups);
      const oldMembers = (await store.listGroupRows('members', 'club_id', sp.club_id)).filter(m => keepG.has(m.group_id));
      await apply('members', oldMembers, members);
      const oldAtt = (await store.listGroupRows('attendance', 'club_id', sp.club_id)).filter(m => keepG.has(m.group_id));
      await apply('attendance', oldAtt, attendance);
      for (const r of oldGroups) if (!keepG.has(r.id)) await store.deleteGroupRow('groups', r.id);   // leurs membres partent avec eux
    },
    async syncAllSpaces() { await ram.eachSpace(id => api.syncSpace(id)); },
    watch(log) {
      const timers = new Map();
      let chain = Promise.resolve();
      ram.onChange(spaceId => {
        clearTimeout(timers.get(spaceId));
        timers.set(spaceId, setTimeout(() => { timers.delete(spaceId); chain = chain.then(() => api.syncSpace(spaceId)).catch(e => log && log('Groupes : ' + e.message)); }, 2500));
      });
    },
    /* groupes d'un compte : ceux dont il est membre ou l'enseignant */
    async ofUser(userId) {
      const mine = await store.listGroupRows('members', 'user_id', userId);
      const coached = await store.listGroupRows('groups', 'coach_user_id', userId);
      const out = new Map(coached.map(gr => [gr.id, Object.assign({}, gr, { role: 'enseignant' })]));
      for (const m of mine) {
        if (out.has(m.group_id)) continue;
        const gr = (await store.listGroupRows('groups', 'id', m.group_id))[0];
        if (gr) out.set(gr.id, Object.assign({}, gr, { role: m.role }));
      }
      return [...out.values()].filter(gr => !gr.archived);
    }
  };
  return api;
}

module.exports = { createGroupes };
