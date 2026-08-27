import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const players = await prisma.player.findMany({
    where: { sport: { not: 'cricket' } },
    select: { sport: true, name: true, stats: true }
  })
  console.log('Non-cricket player stats:', JSON.stringify(players, null, 2))
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect()
  })
