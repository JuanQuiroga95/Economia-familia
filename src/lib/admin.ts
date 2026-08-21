import { prisma } from '@/lib/prisma';
import { getAccountId } from '@/lib/session';

/**
 * Quién puede entrar al panel de administración.
 *
 * Hay dos caminos para ser admin, a propósito:
 *  - `Account.isAdmin` en la base, que es la fuente de verdad.
 *  - La variable `ADMIN_USERNAME`, para poder designar al primero sin tener
 *    que entrar a la base a mano. La primera vez que esa cuenta entra al panel
 *    se le marca `isAdmin` y ya no depende más de la variable.
 */
export async function getAdminAccount() {
  const accountId = await getAccountId();
  if (!accountId) return null;

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return null;

  if (account.isAdmin) return account;

  const bootstrap = process.env.ADMIN_USERNAME?.trim();
  if (bootstrap && account.username === bootstrap) {
    // Se persiste para que el panel siga funcionando aunque después se saque
    // la variable de entorno.
    return prisma.account.update({
      where: { id: account.id },
      data: { isAdmin: true },
    });
  }

  return null;
}

export async function esAdmin() {
  return (await getAdminAccount()) !== null;
}
