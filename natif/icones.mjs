// Prépare les images sources de @capacitor/assets à partir du logo /Buvette (assets/icone.svg) :
// icône 1024 px sans transparence, et écran de démarrage 2732 px (logo centré sur fond noir).
import { createRequire } from 'node:module';
const sharp = createRequire(import.meta.url)('sharp');
const svg = 'assets/icone.svg';
await sharp(svg, { density: 600 }).resize(1024, 1024).flatten({ background: '#2467D6' }).png().toFile('assets/icon-only.png');
const logo = await sharp(svg, { density: 600 }).resize(560, 560).png().toBuffer();
for (const n of ['splash.png', 'splash-dark.png'])
  await sharp({ create: { width: 2732, height: 2732, channels: 3, background: '#0B0B0B' } }).composite([{ input: logo, gravity: 'center' }]).png().toFile('assets/' + n);
console.log('Images sources prêtes dans assets/');
