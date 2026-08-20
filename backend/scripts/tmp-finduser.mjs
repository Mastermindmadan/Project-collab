import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();
const PROJECT_ID = '68b51667-6cb9-4447-ab96-f35ab62641af';

async function main() {
  const proj = await prisma.project.findUnique({
    where: { id: PROJECT_ID },
    select: { teamId: true, title: true },
  });
  console.log('project:', proj);
  const tm = await prisma.teamMember.findFirst({
    where: { teamId: proj.teamId },
    select: { userId: true },
  });
  console.log('member userId:', tm?.userId);
  const u = await prisma.user.findUnique({
    where: { id: tm.userId },
    select: { id: true, email: true, name: true, role: true },
  });
  console.log('user:', u);
  const other = await prisma.user.findFirst({
    where: { id: { not: tm.userId } },
    select: { id: true, email: true, name: true },
  });
  console.log('otherUser:', other);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
