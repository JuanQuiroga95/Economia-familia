'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getAccountId } from '@/lib/session';

export async function createWallet(data: { name: string; currency: string }) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const wallet = await prisma.wallet.create({
      data: {
        name: data.name,
        currency: data.currency,
        accountId,
      },
    });

    revalidatePath('/configuracion');
    revalidatePath('/dashboard');
    return { success: true, data: wallet };
  } catch (error) {
    console.error('Error creating wallet:', error);
    return { success: false, error: 'Error al crear billetera' };
  }
}

export async function getWallets() {
  try {
    const accountId = await getAccountId();
    if (!accountId) return [];

    return await prisma.wallet.findMany({
      where: { accountId },
      orderBy: { createdAt: 'asc' },
    });
  } catch (error) {
    console.error('Error fetching wallets:', error);
    return [];
  }
}

export async function deleteWallet(id: string) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    await prisma.wallet.delete({
      where: { id, accountId },
    });

    revalidatePath('/configuracion');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error deleting wallet:', error);
    return { success: false, error: 'Error al eliminar billetera' };
  }
}
