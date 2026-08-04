import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { phone: { contains: '9176676496' } }
  });
  if (users.length > 0) {
    console.log("Found user IDs:", users.map(u => ({id: u.id, phone: u.phone})));
  } else {
    console.log("User not found");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
