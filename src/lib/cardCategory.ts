import { prisma } from '@/lib/prisma';

export const CARD_CATEGORY_NAME = 'Tarjeta de Crédito';

/** Devuelve (creando si hace falta) la categoría con la que se registran los pagos de tarjeta. */
export async function getCardCategory(accountId: string) {
  const existing = await prisma.category.findFirst({
    where: { accountId, name: CARD_CATEGORY_NAME },
  });
  if (existing) return existing;

  return prisma.category.create({
    data: { name: CARD_CATEGORY_NAME, icon: '💳', color: '#f97316', accountId },
  });
}
