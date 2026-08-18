import { prisma } from '@/lib/prisma';

export const LOAN_CATEGORY_NAME = 'Préstamos';

/** Devuelve (creando si hace falta) la categoría con la que se registran las cuotas de préstamos. */
export async function getLoanCategory(accountId: string) {
  const existing = await prisma.category.findFirst({
    where: { accountId, name: LOAN_CATEGORY_NAME },
  });
  if (existing) return existing;

  return prisma.category.create({
    data: { name: LOAN_CATEGORY_NAME, icon: '🏦', color: '#8b5cf6', accountId },
  });
}
