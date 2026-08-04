import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

function getGroundType(category, name) {
  const cat = (category || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (cat.includes('indoor') || n.includes('indoor')) return 'indoor';
  if (cat.includes('stadium') || n.includes('stadium')) return 'stadium';
  if (cat.includes('box') || n.includes('box')) return 'box_cricket';
  if (cat.includes('net') || n.includes('net')) return 'nets';
  if (cat.includes('academy') || n.includes('academy')) return 'academy';
  return 'outdoor';
}

async function main() {
  const dataPath = path.join(__dirname, '../../grounds.json');
  console.log('Reading from:', dataPath);
  
  if (!fs.existsSync(dataPath)) {
    console.error('File not found!');
    process.exit(1);
  }

  const raw = fs.readFileSync(dataPath, 'utf8');
  const grounds = JSON.parse(raw);
  console.log(`Found ${grounds.length} grounds to import.`);

  let inserted = 0;
  let skipped = 0;

  for (const g of grounds) {
    if (!g.placeId) continue;
    
    try {
      const existing = await prisma.ground.findUnique({
        where: { googlePlaceId: g.placeId }
      });

      if (existing) {
        skipped++;
        continue;
      }

      const groundType = getGroundType(g.categoryName, g.title);

      const dbGround = await prisma.ground.create({
        data: {
          name: g.title,
          localName: g.subTitle || null,
          description: g.description || null,
          category: g.categoryName || null,
          groundType,
          address: g.address || null,
          street: g.street || null,
          city: g.city || null,
          state: g.state || null,
          country: g.countryCode || 'IN',
          postalCode: g.postalCode || null,
          latitude: g.location?.lat || null,
          longitude: g.location?.lng || null,
          googlePlaceId: g.placeId,
          googleMapsUrl: g.url || null,
          phone: g.phone || null,
          averageRating: g.totalScore || 0,
          reviewCount: g.reviewsCount || 0,
          permanentlyClosed: g.permanentlyClosed || false,
          temporarilyClosed: g.temporarilyClosed || false,
          status: 'published',
          sport: 'cricket',
          ballTypes: groundType === 'indoor' || groundType === 'box_cricket' ? ['tennis', 'soft'] : ['leather', 'tennis']
        }
      });

      if (g.imageUrl) {
        await prisma.groundImage.create({
          data: {
            groundId: dbGround.id,
            imageUrl: g.imageUrl,
            isCover: true
          }
        });
      }

      inserted++;
      if (inserted % 100 === 0) {
        console.log(`Inserted ${inserted} grounds so far...`);
      }
    } catch (e) {
      console.error(`Error inserting ${g.title}:`, e.message);
    }
  }

  console.log(`\nImport complete!`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped (already exists): ${skipped}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
