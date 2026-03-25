/**
 * Legacy: descarga un favicon remoto. El proyecto usa iconos en /public
 * (favicon.ico, favicon.svg, favicon-96x96.png, apple-touch-icon, manifest).
 * Ejecutar: node scripts/download-favicon.mjs
 */
import { writeFileSync } from 'fs';
import { get } from 'https';

const url = 'https://mjeimports.store/favicon.png';
const out = 'public/favicon.png';

get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
  if (res.statusCode !== 200) {
    console.error('Error:', res.statusCode);
    process.exit(1);
  }
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => {
    writeFileSync(out, Buffer.concat(chunks));
    console.log('OK: ' + out);
  });
}).on('error', (e) => {
  console.error(e);
  process.exit(1);
});
