const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Applying additive migration to Post table...");
    
    await prisma.$executeRawUnsafe(`ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "mediaType" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "postType" TEXT DEFAULT 'general' NOT NULL;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "matchId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "tournamentId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "playerId" TEXT;`);
    
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Post_matchId_idx" ON "Post"("matchId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Post_tournamentId_idx" ON "Post"("tournamentId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Post_playerId_idx" ON "Post"("playerId");`);

    console.log("Migration successful.");
  } catch (e) {
    console.error("Migration failed:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
