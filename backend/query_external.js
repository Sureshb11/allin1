import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const stats = await prisma.externalPlayerStat.count()
  console.log('External Stats:', stats)
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect()
  })
