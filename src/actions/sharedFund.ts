'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getAccountId } from '@/lib/session';

export async function createFundPayment(data: {
  amount: number;
  profileId: string;
  description?: string;
  date?: Date;
}) {
  try {
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    const payment = await prisma.sharedFundPayment.create({
      data: {
        amount: data.amount,
        profileId: data.profileId,
        description: data.description || 'Devolución del fondo',
        date: data.date || new Date(),
        accountId,
      },
    });

    revalidatePath('/dashboard');
    return { success: true, data: payment };
  } catch (error) {
    console.error('Error creating fund payment:', error);
    return { success: false, error: 'Error al registrar devolución' };
  }
}

export async function deleteFundPayment(id: string) {
  try {
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    await prisma.sharedFundPayment.delete({
      where: {
        id,
        accountId, // Ensure the payment belongs to the current account
      },
    });

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error deleting fund payment:', error);
    return { success: false, error: 'Error al eliminar devolución' };
  }
}
