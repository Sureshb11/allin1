import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const stats = await prisma.historicalStatSubmission.groupBy({
    by: ['status'],
    _count: true
  })
  console.log('Historical:', JSON.stringify(stats, null, 2))
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect()
  })
