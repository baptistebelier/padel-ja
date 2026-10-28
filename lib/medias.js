/* =========================================================================
   /RAM — images des clubs (photos de profil, logos, photos des publications et des messages)
   - Rangées comme de vrais fichiers, plus jamais dans les données du club : un téléphone ne
     télécharge une image qu'une fois (cache d'un an, l'adresse change si l'image change).
   - En ligne : Supabase Storage (espace privé « medias », lu par le serveur avec sa clé) ;
     en local et dans les tests : dossier data/medias.
   - Adresse d'une image : /medias/<club>/<empreinte>.<webp|jpg|png>, servie par le serveur
     sur tous les domaines (ja., club., coach.). L'empreinte (SHA-256 de l'image) est impossible
     à deviner sans avoir l'image, et rien ne se liste.
   - Les images encore intégrées au texte (data:image/…) sont converties : à l'envoi depuis un
     appareil (ancienne version de l'appli) et une fois pour toutes au démarrage (migrate).
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX = 4 * 1024 * 1024;                       // 4 Mo par image
const MIN_INLINE = 2000;                           // en dessous : une icône, laissée telle quelle
const TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const NAME = /^[\w-]{1,32}\/[A-Za-z0-9_-]{16,40}\.(png|jpg|webp)$/;

/* image d'une « data URL » : type vérifié sur les premiers octets (jamais celui annoncé) */
function decode(dataUrl) {
  const m = /^data:image\/[\w.+-]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const buf = Buffer.from(m[1], 'base64');
  if (!buf.length || buf.length > MAX) return null;
  const ext = buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG' ? 'png'
    : buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff ? 'jpg'
    : buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP' ? 'webp' : null;
  return ext ? { buf, ext } : null;
}

function fileBackend(dir) {
  const D = path.join(dir, 'medias');
  return {
    kind: 'fichiers',
    async put(name, buf) { const f = path.join(D, name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); },
    async get(name) { try { return fs.readFileSync(path.join(D, name)); } catch (e) { return null; } }
  };
}
function supabaseBackend(url, key) {
  const base = url.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '') + '/storage/v1/', BUCKET = 'medias';
  const H = { apikey: key }; if (key.startsWith('eyJ')) H.Authorization = 'Bearer ' + key;
  let ready = null;
  // espace privé créé au premier envoi (déjà là : rien)
  const bucket = () => (ready = ready || fetch(base + 'bucket', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H), body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }) })
    .then(async r => { if (!r.ok && !/already exists|Duplicate|409/i.test(await r.text() + r.status)) throw new Error('Supabase Storage : espace « medias » impossible à créer'); })
    .catch(e => { ready = null; throw e; }));
  return {
    kind: 'supabase',
    async put(name, buf, type) {
      await bucket();
      const r = await fetch(base + 'object/' + BUCKET + '/' + name, { method: 'POST', headers: Object.assign({ 'Content-Type': type, 'x-upsert': 'true', 'Cache-Control': 'max-age=31536000' }, H), body: buf });
      if (!r.ok) throw new Error(`Supabase Storage : envoi impossible (${r.status} ${await r.text()})`);
    },
    async get(name) {
      const r = await fetch(base + 'object/' + BUCKET + '/' + name, { headers: H });
      if (r.status === 400 || r.status === 404) return null;
      if (!r.ok) throw new Error(`Supabase Storage : lecture impossible (${r.status})`);
      return Buffer.from(await r.arrayBuffer());
    }
  };
}

function createMedias(dataDir, opts = {}) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  const db = opts.backend || (url && key ? supabaseBackend(url, key) : fileBackend(dataDir));
  /* images les plus demandées gardées en mémoire (30 Mo au plus) */
  const hot = new Map(); let hotSize = 0; const HOT_MAX = 30 * 1024 * 1024;
  const remember = (name, buf) => {
    if (buf.length > 2 * 1024 * 1024) return;
    hot.delete(name); hot.set(name, buf); hotSize += buf.length;
    while (hotSize > HOT_MAX) { const [k, v] = hot.entries().next().value; hot.delete(k); hotSize -= v.length; }
  };

  /* enregistre une image (data URL) pour un club ; renvoie son adresse, ou null si ce n'est pas une image valable */
  async function save(clubId, dataUrl) {
    const img = decode(dataUrl); if (!img || !/^[\w-]{1,32}$/.test(String(clubId))) return null;
    // même image envoyée deux fois : même nom (empreinte), un seul fichier
    const name = clubId + '/' + crypto.createHash('sha256').update(img.buf).digest('base64url').slice(0, 24) + '.' + img.ext;
    await db.put(name, img.buf, TYPES[img.ext]);
    remember(name, img.buf);
    return '/medias/' + name;
  }
  /* lecture pour la route /medias/… : { buf, type } ou null */
  async function read(name) {
    if (!NAME.test(name)) return null;
    let buf = hot.get(name);
    if (!buf) { buf = await db.get(name); if (!buf) return null; remember(name, buf); }
    return { buf, type: TYPES[name.split('.').pop()] };
  }
  /* remplace, dans n'importe quelle donnée, les images intégrées par leur adresse ; renvoie [donnée, nombre d'images converties] */
  async function extract(clubId, v) {
    let n = 0;
    const walk = async x => {
      if (typeof x === 'string') {
        if (x.length < MIN_INLINE || !x.startsWith('data:image/')) return x;
        const u = await save(clubId, x); if (u) n++;
        return u || x;
      }
      if (Array.isArray(x)) { const out = []; for (const y of x) out.push(await walk(y)); return out; }
      if (x && typeof x === 'object') { const out = {}; for (const k of Object.keys(x)) out[k] = await walk(x[k]); return out; }
      return x;
    };
    const out = await walk(v);
    return [out, n];
  }
  /* opérations envoyées par un appareil (ancienne version de l'appli) : images converties avant d'être enregistrées */
  async function extractOps(clubId, ops) {
    if (!Array.isArray(ops) || !JSON.stringify(ops).includes('data:image/')) return ops;
    const out = [];
    for (const op of ops) {
      const o = Object.assign({}, op);
      if (o.data) o.data = (await extract(clubId, o.data))[0];
      if (Array.isArray(o.patch)) o.patch = (await extract(clubId, o.patch))[0];
      out.push(o);
    }
    return out;
  }
  /* une fois pour toutes : chaque club parcouru, ses images intégrées rangées en fichiers */
  async function migrate(ram, COLLS, log) {
    let total = 0;
    await ram.eachSpace(async id => {
      for (const coll of COLLS) {
        for (const it of await ram.itemsOf(id, coll)) {
          if (!JSON.stringify(it.data).includes('data:image/')) continue;
          const [data, n] = await extract(id, it.data);
          if (n) { await ram.serverPut(id, coll, it.id, data); total += n; }
        }
      }
    });
    if (total && log) log(`Images : ${total} image${total > 1 ? 's' : ''} rangée${total > 1 ? 's' : ''} en fichiers`);
    return total;
  }
  return { kind: db.kind, save, read, extract, extractOps, migrate };
}

module.exports = { createMedias, decode };
