// Seed the Pincode table from Indian_Pincodes.csv (repo root).
//   node prisma/seedPincodes.js
// Dedupes by office|pincode, batches inserts. Safe to re-run (clears first).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV = path.resolve(__dirname, '../../Indian_Pincodes.csv');

// Minimal CSV line splitter (handles quoted fields with commas).
function splitCsv(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === ',' && !q) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function main() {
  if (!fs.existsSync(CSV)) throw new Error(`CSV not found: ${CSV}`);
  const text = fs.readFileSync(CSV, 'utf8');
  const lines = text.split(/\r?\n/);
  const header = splitCsv(lines[0]).map((h) => h.trim());
  const iOffice = header.indexOf('officename');
  const iPin = header.indexOf('pincode');
  const iDist = header.indexOf('district');
  const iState = header.indexOf('statename');

  const seen = new Set();
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const f = splitCsv(lines[i]);
    const office = (f[iOffice] || '').trim();
    const pincode = (f[iPin] || '').trim();
    const district = (f[iDist] || '').trim();
    const state = (f[iState] || '').trim();
    if (!office || !pincode) continue;
    const key = `${office}|${pincode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ office, pincode, district, state });
  }
  console.log(`Parsed ${rows.length} unique office|pincode rows. Reseeding…`);

  await prisma.pincode.deleteMany({});
  const CHUNK = 5000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await prisma.pincode.createMany({ data: rows.slice(i, i + CHUNK), skipDuplicates: true });
    process.stdout.write(`\r  inserted ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }
  console.log('\n✅ Pincode seed complete.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
