import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';

const JWT_SECRET = process.env.JWT_SECRET!;

(async () => {
  const userA = await prisma.user.findUnique({ where: { id: '57ae2ebe-799b-448e-b108-344ee9760553' } });
  const userB = await prisma.user.findUnique({ where: { id: '0708d8dd-190b-418f-90b8-226351429654' } });
  const tokenA = jwt.sign({ id: userA!.id, email: userA!.email, name: userA!.name, role: userA!.role }, JWT_SECRET, { expiresIn: '1h' });
  const tokenB = jwt.sign({ id: userB!.id, email: userB!.email, name: userB!.name, role: userB!.role }, JWT_SECRET, { expiresIn: '1h' });
  console.log('TOKEN_A=' + tokenA);
  console.log('TOKEN_B=' + tokenB);
})().catch(console.error).finally(() => process.exit(0));
