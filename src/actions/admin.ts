'use server';

import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getAdminAccount } from '@/lib/admin';
import { revalidatePath } from 'next/cache';
import { getArgDate, getCurrentFinancialMonth, getFinancialMonthRange } from '@/lib/dateUtils';
import { MONEDA_BASE, categoriaDeConsumo } from '@/lib/reportFilters';

export interface IntegranteAdmin {
  id: string;
  name: string;
  avatar: string | null;
  telegramVinculado: boolean;
  dispositivosPush: number;
  movimientos: number;
}

export interface FamiliaAdmin {
  id: string;
  label: string;
  username: string;
  esAdmin: boolean;
  creada: string;
  integrantes: IntegranteAdmin[];
  /** Actividad de la familia, para saber cuáles están vivas y cuáles no. */
  gastos: number;
  ingresos: number;
  tarjetas: number;
  prestamos: number;
  metasDeAhorro: number;
  ultimoMovimiento: string | null;
  /** Balance del mes en curso, en la moneda base. */
  balanceDelMes: number;
}

export interface ResumenAdmin {
  familias: FamiliaAdmin[];
  totales: {
    familias: number;
    integrantes: number;
    gastos: number;
    ingresos: number;
    activasEsteMes: number;
  };
  mes: number;
  anio: number;
}

/**
 * Todo lo que ve el panel, en una sola pasada.
 *
 * Las cuentas son las "familias" (son las que tienen usuario y contraseña) y
 * los perfiles son los integrantes de cada una, que no tienen credenciales
 * propias: comparten el login de la familia.
 */
export async function getAdminOverview(): Promise<ResumenAdmin | null> {
  const admin = await getAdminAccount();
  if (!admin) return null;

  const { month, year } = getCurrentFinancialMonth(getArgDate());
  const { startDate, endDate } = getFinancialMonthRange(month, year);

  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      profiles: {
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { expenses: true, incomes: true, pushSubscriptions: true } },
        },
      },
      _count: { select: { savingsGoals: true } },
    },
  });

  const familias: FamiliaAdmin[] = [];
  let activasEsteMes = 0;

  for (const account of accounts) {
    const profileIds = account.profiles.map((p) => p.id);

    const [tarjetas, prestamos, ultimo, ingresosMes, gastosMes] = await Promise.all([
      prisma.creditCard.count({ where: { profileId: { in: profileIds } } }),
      prisma.loan.count({ where: { profileId: { in: profileIds } } }),
      prisma.expense.findFirst({
        where: { profileId: { in: profileIds } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      prisma.income.aggregate({
        where: {
          profileId: { in: profileIds },
          currency: MONEDA_BASE,
          date: { gte: startDate, lte: endDate },
        },
        _sum: { amount: true },
      }),
      prisma.expense.aggregate({
        where: {
          profileId: { in: profileIds },
          currency: MONEDA_BASE,
          category: categoriaDeConsumo,
          date: { gte: startDate, lte: endDate },
        },
        _sum: { amount: true },
      }),
    ]);

    const gastos = account.profiles.reduce((acc, p) => acc + p._count.expenses, 0);
    const ingresos = account.profiles.reduce((acc, p) => acc + p._count.incomes, 0);

    const activa =
      ultimo != null && ultimo.createdAt >= startDate && ultimo.createdAt <= endDate;
    if (activa) activasEsteMes++;

    familias.push({
      id: account.id,
      label: account.label,
      username: account.username,
      esAdmin: account.isAdmin,
      creada: account.createdAt.toISOString(),
      integrantes: account.profiles.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        telegramVinculado: !!p.telegramChatId,
        dispositivosPush: p._count.pushSubscriptions,
        movimientos: p._count.expenses + p._count.incomes,
      })),
      gastos,
      ingresos,
      tarjetas,
      prestamos,
      metasDeAhorro: account._count.savingsGoals,
      ultimoMovimiento: ultimo ? ultimo.createdAt.toISOString() : null,
      balanceDelMes: (ingresosMes._sum.amount || 0) - (gastosMes._sum.amount || 0),
    });
  }

  return {
    familias,
    totales: {
      familias: familias.length,
      integrantes: familias.reduce((acc, f) => acc + f.integrantes.length, 0),
      gastos: familias.reduce((acc, f) => acc + f.gastos, 0),
      ingresos: familias.reduce((acc, f) => acc + f.ingresos, 0),
      activasEsteMes,
    },
    mes: month,
    anio: year,
  };
}

/**
 * Cambia la contraseña de una familia.
 *
 * No existe un "ver la contraseña": lo que guarda la base es un hash bcrypt,
 * que es de una sola vía y no se puede revertir. Lo único posible es ponerle
 * una nueva y avisarle a la familia cuál es.
 */
export async function cambiarPasswordDeFamilia(accountId: string, nuevaPassword: string) {
  try {
    const admin = await getAdminAccount();
    if (!admin) return { success: false, error: 'No tenés permiso' };

    if (!nuevaPassword || nuevaPassword.length < 8) {
      return { success: false, error: 'La contraseña tiene que tener al menos 8 caracteres' };
    }

    const cuenta = await prisma.account.findUnique({ where: { id: accountId } });
    if (!cuenta) return { success: false, error: 'Familia no encontrada' };

    await prisma.account.update({
      where: { id: accountId },
      data: {
        password: await bcrypt.hash(nuevaPassword, 12),
        // Cualquier link mágico viejo deja de servir al cambiar la clave.
        magicToken: null,
      },
    });

    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('Error cambiando password:', error);
    return { success: false, error: 'Error al cambiar la contraseña' };
  }
}

/** Cambia el nombre de usuario con el que entra una familia. */
export async function cambiarUsuarioDeFamilia(accountId: string, nuevoUsuario: string) {
  try {
    const admin = await getAdminAccount();
    if (!admin) return { success: false, error: 'No tenés permiso' };

    const usuario = nuevoUsuario.trim().toLowerCase();
    if (usuario.length < 3) {
      return { success: false, error: 'El usuario tiene que tener al menos 3 caracteres' };
    }

    const ocupado = await prisma.account.findFirst({
      where: { username: usuario, id: { not: accountId } },
    });
    if (ocupado) return { success: false, error: 'Ese usuario ya está en uso' };

    await prisma.account.update({ where: { id: accountId }, data: { username: usuario } });

    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('Error cambiando usuario:', error);
    return { success: false, error: 'Error al cambiar el usuario' };
  }
}

/** Da o saca permisos de administrador. Siempre tiene que quedar al menos uno. */
export async function marcarComoAdmin(accountId: string, valor: boolean) {
  try {
    const admin = await getAdminAccount();
    if (!admin) return { success: false, error: 'No tenés permiso' };

    if (!valor) {
      const cuantos = await prisma.account.count({ where: { isAdmin: true } });
      if (cuantos <= 1) {
        return { success: false, error: 'Tiene que quedar al menos un administrador' };
      }
    }

    await prisma.account.update({ where: { id: accountId }, data: { isAdmin: valor } });

    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('Error cambiando admin:', error);
    return { success: false, error: 'Error al cambiar el permiso' };
  }
}
