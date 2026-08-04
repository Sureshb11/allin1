import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.ground.deleteMany({});
  console.log("Deleted all grounds");
}

main().catch(console.error).finally(() => prisma.$disconnect());
