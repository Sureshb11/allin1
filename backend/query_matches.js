import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const matches = await prisma.match.groupBy({
    by: ['sport', 'status'],
    _count: true
  })
  console.log('Matches:', JSON.stringify(matches, null, 2))

  const players = await prisma.player.groupBy({
    by: ['sport'],
    _count: true
  })
  console.log('Players:', JSON.stringify(players, null, 2))
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect()
  })
