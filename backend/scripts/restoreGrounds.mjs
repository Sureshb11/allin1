#!/usr/bin/env node
// Put the grounds back exactly as they were.
//
//   node scripts/restoreGrounds.mjs backups/grounds-backup-2026-08-04.json
//
// The counterpart to deleteGrounds.js. It exists because "I can add later" was
// not quite true: re-running the importer does NOT reproduce what is currently
// in the database.
//
//   · grounds.json holds 1,250 records and importGrounds.js would take 1,247 of
//     them (it skips rows with no name, no coordinates, or permanently closed).
//     The database has 498. So an import restores a DIFFERENT, larger set — fine
//     if that is what you want, no use at all if you wanted what you had.
//   · scripts/importRealGrounds.js is broken and must not be used: it writes
//     `isCover` to GroundImage, a field the schema does not have, so it throws on
//     every ground that carries an image. importGrounds.js is the working one.
//   · Opening hours and amenities only come from importGrounds.js. Nothing else
//     recreates the 1,988 hours and 1,196 amenities now attached.
//
// WRITES TO NEON. There is no local database (CLAUDE.md), so this is a
// production restore.

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const prisma = new PrismaClient();
const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/restoreGrounds.mjs <backup.json>');
  process.exit(1);
}

const d = JSON.parse(readFileSync(file, 'utf-8'));
console.log(`Restoring from ${file} (exported ${d.exportedAt})`);

const existing = await prisma.ground.count();
if (existing) {
  console.error(`\n✗ ${existing} grounds are already in the database.`);
  console.error('  Restoring on top would collide on googlePlaceId. Clear them first');
  console.error('  (scripts/deleteGrounds.js) or restore into an empty table.');
  process.exit(1);
}

// Parents first, then everything that points at them — createMany in one pass
// each, so a 498-row restore is a handful of statements rather than 4,000.
const steps = [
  ['grounds',      'ground',              d.grounds],
  ['images',       'groundImage',         d.images],
  ['openingHours', 'groundOpeningHours',  d.openingHours],
  ['amenities',    'groundAmenity',       d.amenities],
  ['reviews',      'groundReview',        d.reviews],
  ['favourites',   'groundFavourite',     d.favourites],
  ['availability', 'groundAvailability',  d.availability],
];

for (const [label, model, rows] of steps) {
  if (!rows?.length) { console.log(`  ${label.padEnd(14)} 0 (nothing to restore)`); continue; }
  const r = await prisma[model].createMany({ data: rows, skipDuplicates: true });
  console.log(`  ${label.padEnd(14)} ${r.count}`);
}

console.log('\n✓ Restored.');
await prisma.$disconnect();
