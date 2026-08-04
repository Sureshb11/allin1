#!/usr/bin/env node
// Import grounds from grounds.json into the database.
//
// Usage:  node scripts/importGrounds.js [path/to/grounds.json]
//
// Default path: ../../grounds.json (relative to backend/).
// Safe to re-run: upserts by googlePlaceId so duplicates are merged.

import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const DEFAULT_JSON = resolve(__dirname, '../../grounds.json');
const jsonPath = process.argv[2] || DEFAULT_JSON;

// ── Auto-classification helpers ────────────────────────────────────────────

function detectGroundType(title, category, categories) {
  const text = `${title} ${category} ${(categories || []).join(' ')}`.toLowerCase();
  if (text.includes('indoor')) return 'indoor';
  if (text.includes('box cricket')) return 'box_cricket';
  if (text.includes('stadium')) return 'stadium';
  if (text.includes('academy') || text.includes('coaching')) return 'academy';
  if (text.includes('practice net') || text.includes('nets')) return 'nets';
  if (text.includes('sports complex')) return 'sports_complex';
  if (text.includes('playground') || text.includes('park')) return 'outdoor';
  return 'outdoor';
}

function detectPlayingSurface(title, description, category) {
  const text = `${title} ${description || ''} ${category}`.toLowerCase();
  if (text.includes('artificial turf') || text.includes('astro turf') || text.includes('turf ground')) return 'turf';
  if (text.includes('turf')) return 'turf';
  if (text.includes('natural grass') || text.includes('grass ground')) return 'grass';
  if (text.includes('mat ') || text.includes(' mat') || text.includes('matting')) return 'mat';
  if (text.includes('concrete') || text.includes('cement')) return 'concrete';
  if (text.includes('synthetic')) return 'synthetic';
  if (text.includes('clay') || text.includes('red soil')) return 'clay';
  return null; // unknown
}

function detectBallTypes(title, category, categories) {
  const text = `${title} ${category} ${(categories || []).join(' ')}`.toLowerCase();
  const types = [];
  if (text.includes('leather') || text.includes('red ball') || text.includes('white ball')) types.push('leather');
  if (text.includes('tennis ball') || text.includes('tennis')) types.push('tennis');
  if (text.includes('soft ball') || text.includes('softball')) types.push('soft');
  if (text.includes('wind ball')) types.push('wind');
  if (text.includes('plastic')) types.push('plastic');
  // Default: most cricket grounds in India are tennis ball
  if (types.length === 0) types.push('tennis');
  return types;
}

// Parse "6 AM to 8 PM" → { openTime: "06:00", closeTime: "20:00" }
function parseTimeRange(hoursStr) {
  if (!hoursStr || hoursStr.toLowerCase().includes('closed')) return { isClosed: true };
  // Normalize narrow no-break space (\u202f) and other whitespace
  const cleaned = hoursStr.replace(/[\u202f\u00a0]/g, ' ').trim();
  const match = cleaned.match(/(\d{1,2})\s*(AM|PM)\s*to\s*(\d{1,2})\s*(AM|PM)/i);
  if (!match) return { openTime: null, closeTime: null };
  let openH = parseInt(match[1], 10);
  const openAP = match[2].toUpperCase();
  let closeH = parseInt(match[3], 10);
  const closeAP = match[4].toUpperCase();
  if (openAP === 'PM' && openH !== 12) openH += 12;
  if (openAP === 'AM' && openH === 12) openH = 0;
  if (closeAP === 'PM' && closeH !== 12) closeH += 12;
  if (closeAP === 'AM' && closeH === 12) closeH = 0;
  return {
    openTime: String(openH).padStart(2, '0') + ':00',
    closeTime: String(closeH).padStart(2, '0') + ':00',
  };
}

// Extract amenities from additionalInfo JSON
function extractAmenities(additionalInfo) {
  if (!additionalInfo || typeof additionalInfo !== 'object') return [];
  const amenities = [];
  const AMENITY_MAP = {
    'wheelchair accessible entrance': 'Wheelchair Access',
    'wheelchair accessible parking lot': 'Wheelchair Accessible Parking',
    'wi-fi': 'WiFi',
    'free wi-fi': 'WiFi',
    'restroom': 'Washroom',
    'parking': 'Parking',
    'on-site parking': 'Parking',
    'free parking lot': 'Free Parking',
    'changing room': 'Changing Room',
    'locker': 'Locker Room',
    'first aid': 'First Aid',
    'drinking water': 'Drinking Water',
  };
  for (const [section, items] of Object.entries(additionalInfo)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (typeof item !== 'object') continue;
      for (const [key, val] of Object.entries(item)) {
        if (val === true) {
          const mapped = AMENITY_MAP[key.toLowerCase()] || key;
          if (!amenities.includes(mapped)) amenities.push(mapped);
        }
      }
    }
  }
  return amenities;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Reading ${jsonPath}…`);
  const raw = readFileSync(jsonPath, 'utf-8');
  const records = JSON.parse(raw);
  console.log(`Parsed ${records.length} records.`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const r of records) {
    try {
      // Skip records without name or coordinates
      if (!r.title || !r.location?.lat || !r.location?.lng) {
        skipped++;
        continue;
      }
      // Skip permanently closed
      if (r.permanentlyClosed) {
        skipped++;
        continue;
      }

      const groundType = detectGroundType(r.title, r.categoryName, r.categories);
      const playingSurface = detectPlayingSurface(r.title, r.description, r.categoryName);
      const ballTypes = detectBallTypes(r.title, r.categoryName, r.categories);
      const amenities = extractAmenities(r.additionalInfo);

      // Parse opening hours
      const hours = (r.openingHours || []).map((h) => {
        const parsed = parseTimeRange(h.hours);
        return {
          day: h.day,
          openTime: parsed.openTime || null,
          closeTime: parsed.closeTime || null,
          isClosed: parsed.isClosed || false,
        };
      });

      // Clean phone
      const phone = (r.phoneUnformatted || r.phone || '').replace(/[^+\d]/g, '') || null;

      const data = {
        name: r.title.trim(),
        localName: r.subTitle?.trim() || null,
        description: r.description?.trim() || null,
        category: r.categoryName || null,
        groundType,
        playingSurface,
        ballTypes,
        address: r.address?.trim() || null,
        street: r.street?.trim() || null,
        area: r.neighborhood?.trim() || null,
        city: r.city?.trim() || null,
        state: r.state?.trim() || null,
        country: r.countryCode || 'IN',
        postalCode: r.postalCode?.trim() || null,
        latitude: r.location.lat,
        longitude: r.location.lng,
        googlePlaceId: r.placeId || null,
        googleMapsUrl: r.url || null,
        phone,
        website: r.website?.trim() || null,
        averageRating: r.totalScore || 0,
        reviewCount: r.reviewsCount || 0,
        verified: true,
        permanentlyClosed: r.permanentlyClosed || false,
        temporarilyClosed: r.temporarilyClosed || false,
        status: 'published',
        sport: 'cricket',
        location: r.address?.trim() || r.city?.trim() || 'Unknown',
        price: 0,
        available: true,
      };

      // Upsert by googlePlaceId
      let ground;
      if (r.placeId) {
        ground = await prisma.ground.upsert({
          where: { googlePlaceId: r.placeId },
          update: data,
          create: data,
        });
      } else {
        ground = await prisma.ground.create({ data });
      }

      // Upsert cover image
      if (r.imageUrl) {
        const existingImg = await prisma.groundImage.findFirst({
          where: { groundId: ground.id, imageType: 'cover' },
        });
        if (existingImg) {
          await prisma.groundImage.update({
            where: { id: existingImg.id },
            data: { imageUrl: r.imageUrl },
          });
        } else {
          await prisma.groundImage.create({
            data: { groundId: ground.id, imageUrl: r.imageUrl, imageType: 'cover', displayOrder: 0 },
          });
        }
      }

      // Upsert opening hours (delete old, create new)
      if (hours.length > 0) {
        await prisma.groundOpeningHours.deleteMany({ where: { groundId: ground.id } });
        await prisma.groundOpeningHours.createMany({
          data: hours.map((h) => ({ groundId: ground.id, ...h })),
        });
      }

      // Upsert amenities (delete old, create new)
      if (amenities.length > 0) {
        await prisma.groundAmenity.deleteMany({ where: { groundId: ground.id } });
        await prisma.groundAmenity.createMany({
          data: amenities.map((a) => ({ groundId: ground.id, amenity: a })),
        });
      }

      imported++;
      if (imported % 100 === 0) console.log(`  …imported ${imported}/${records.length}`);
    } catch (e) {
      errors++;
      console.error(`  ✗ Error importing "${r.title}":`, e.message);
    }
  }

  console.log(`\nDone! Imported: ${imported}, Skipped: ${skipped}, Errors: ${errors}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
