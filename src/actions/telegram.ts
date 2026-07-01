'use server';

import { prisma } from '@/lib/prisma';
import { getAccountId } from '@/lib/session';
import { revalidatePath } from 'next/cache';

/**
 * Genera un PIN de vinculación de 6 dígitos para un perfil
 */
export async function generateTelegramLinkCode(profileId: string) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    // Verificar que el perfil pertenece a esta cuenta
    const profile = await prisma.profile.findFirst({
      where: { id: profileId, accountId },
    });
    if (!profile) return { success: false, error: 'Perfil no encontrado' };

    // Generar PIN de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await prisma.profile.update({
      where: { id: profileId },
      data: { telegramLinkCode: code },
    });

    revalidatePath('/configuracion');
    return { success: true, code };
  } catch (error) {
    console.error('Error generating telegram link code:', error);
    return { success: false, error: 'Error al generar código' };
  }
}

/**
 * Desvincula Telegram de un perfil
 */
export async function unlinkTelegram(profileId: string) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const profile = await prisma.profile.findFirst({
      where: { id: profileId, accountId },
    });
    if (!profile) return { success: false, error: 'Perfil no encontrado' };

    await prisma.profile.update({
      where: { id: profileId },
      data: { telegramChatId: null, telegramLinkCode: null },
    });

    revalidatePath('/configuracion');
    return { success: true };
  } catch (error) {
    console.error('Error unlinking telegram:', error);
    return { success: false, error: 'Error al desvincular' };
  }
}
