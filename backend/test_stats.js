const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const player = await prisma.player.findFirst({ where: { stats: { not: null } } });
  console.log("Player name:", player.name);
  console.log("Player stats:", JSON.stringify(player.stats, null, 2));
}
run();
