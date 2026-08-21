'use server';

import crypto from 'crypto';
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

    // PIN de 6 dígitos con aleatoriedad criptográfica (Math.random no sirve
    // para algo que da acceso a la cuenta).
    const code = String(crypto.randomInt(100000, 1000000));

    const MINUTOS_DE_VIDA = 15;
    await prisma.profile.update({
      where: { id: profileId },
      data: {
        telegramLinkCode: code,
        telegramLinkCodeExpiresAt: new Date(Date.now() + MINUTOS_DE_VIDA * 60_000),
      },
    });

    revalidatePath('/configuracion');
    return { success: true, code, expiraEnMinutos: MINUTOS_DE_VIDA };
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
      data: { telegramChatId: null, telegramLinkCode: null, telegramLinkCodeExpiresAt: null },
    });

    revalidatePath('/configuracion');
    return { success: true };
  } catch (error) {
    console.error('Error unlinking telegram:', error);
    return { success: false, error: 'Error al desvincular' };
  }
}
