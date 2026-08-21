'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import type { ExpenseFormData, TransactionFilters } from '@/types';
import { sendPushNotification } from '@/lib/push';
import { getAccountId } from '@/lib/session';
import { parseArgDate, getFinancialMonthRange } from '@/lib/dateUtils';

/** El perfil tiene que ser de la cuenta con la sesión abierta. */
async function perfilPropio(profileId: string, accountId: string) {
  return prisma.profile.findFirst({ where: { id: profileId, accountId } });
}

/** El gasto tiene que pertenecer a un perfil de esta cuenta. */
async function gastoPropio(id: string, accountId: string) {
  return prisma.expense.findFirst({
    where: { id, profile: { accountId } },
    include: { cardPayment: true, loanPayment: true },
  });
}

export async function createExpense(data: ExpenseFormData) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const perfil = await perfilPropio(data.profileId, accountId);
    if (!perfil) return { success: false, error: 'Perfil no encontrado' };

    const categoria = await prisma.category.findFirst({
      where: { id: data.categoryId, accountId },
    });
    if (!categoria) return { success: false, error: 'Categoría no encontrada' };

    if (!data.amount || data.amount <= 0) {
      return { success: false, error: 'El monto tiene que ser mayor a cero' };
    }

    const expenseDate = parseArgDate(data.date);

    // Si la plata sale de un ahorro o de una inversión, se descuenta de ahí y
    // queda registrado el retiro. NO se crea ningún ingreso: el balance del mes
    // ya suma los retiros por su cuenta, así que un ingreso extra lo contaría
    // dos veces y el mes cerraría de más.
    if (data.fundingSource && data.fundingSource !== 'balance') {
      const parts = data.fundingSource.split('_');
      const type = parts[0];
      const sourceId = parts.slice(1).join('_');

      if (type === 'ahorro') {
        const goal = await prisma.savingsGoal.findFirst({ where: { id: sourceId, accountId } });
        if (!goal) return { success: false, error: 'Meta de ahorro no encontrada' };
        if (goal.currency !== data.currency) {
          return {
            success: false,
            error: `La meta está en ${goal.currency} y el gasto en ${data.currency}`,
          };
        }
        if (goal.currentAmount < data.amount) {
          return { success: false, error: 'No hay fondos suficientes en ese ahorro' };
        }

        await prisma.savingsTransaction.create({
          data: {
            amount: data.amount,
            type: 'RETIRO',
            description: `Gasto: ${data.description}`,
            savingsGoalId: sourceId,
            profileId: data.profileId,
            date: expenseDate,
          },
        });
        await prisma.savingsGoal.update({
          where: { id: sourceId },
          data: { currentAmount: goal.currentAmount - data.amount },
        });
      } else if (type === 'inversion') {
        const inv = await prisma.investment.findFirst({
          where: { id: sourceId, profile: { accountId } },
        });
        if (!inv) return { success: false, error: 'Inversión no encontrada' };
        if (inv.currency !== data.currency) {
          return {
            success: false,
            error: `La inversión está en ${inv.currency} y el gasto en ${data.currency}`,
          };
        }
        if (inv.amount < data.amount) {
          return { success: false, error: 'No hay fondos suficientes en esa inversión' };
        }

        await prisma.investmentTransaction.create({
          data: {
            amount: data.amount,
            type: 'RETIRO',
            description: `Gasto: ${data.description}`,
            investmentId: sourceId,
            profileId: data.profileId,
            date: expenseDate,
          },
        });
        await prisma.investment.update({
          where: { id: sourceId },
          data: { amount: inv.amount - data.amount },
        });
      }
    }

    // Registrar gasto normal
    await prisma.expense.create({
      data: {
        amount: data.amount,
        currency: data.currency,
        date: expenseDate,
        description: data.description,
        categoryId: data.categoryId,
        profileId: data.profileId,
        type: data.type,
        paidFromPersonalBudget: data.type === 'COMPARTIDO' ? data.paidFromPersonalBudget : false,
        splitPercentage: data.type === 'COMPARTIDO' ? data.splitPercentage ?? null : null,
        receiptUrl: data.receiptUrl || null,
        walletId: data.walletId || null,
        paymentMethod: data.paymentMethod || 'TRANSFERENCIA',
      },
    });

    try {
      // Notificaciones Push
      const otherProfiles = await prisma.profile.findMany({
        where: { accountId, id: { not: data.profileId } },
      });

      let pushTitle = 'Nuevo gasto';
      let pushBody = `${perfil.name} registró un gasto de $${data.amount} en ${data.description}.`;

      if (data.type === 'COMPARTIDO' && data.paidFromPersonalBudget) {
        pushTitle = 'Deuda generada al fondo';
        pushBody = `${perfil.name} pagó $${data.amount} (${data.description}) con su dinero personal.`;
      }

      for (const op of otherProfiles) {
        await sendPushNotification(op.id, pushTitle, pushBody, '/gastos');
      }
    } catch (pushErr) {
      console.error('Error enviando push:', pushErr);
    }

    revalidatePath('/gastos');
    revalidatePath('/dashboard');
    revalidatePath('/ahorros');
    revalidatePath('/inversiones');
    return { success: true };
  } catch (error) {
    console.error('Error creating expense:', error);
    return { success: false, error: 'Error al crear gasto' };
  }
}

export async function getExpenses(filters?: TransactionFilters) {
  try {
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    const where: Record<string, unknown> = {
      profile: { accountId },
    };

    if (filters?.profileId) where.profileId = filters.profileId;
    if (filters?.categoryId) where.categoryId = filters.categoryId;
    if (filters?.type) where.type = filters.type;

    if (filters?.month && filters?.year) {
      const { startDate, endDate } = getFinancialMonthRange(filters.month, filters.year);
      where.date = { gte: startDate, lte: endDate };
    }

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        profile: true,
        category: true,
        // Para poder marcar en la lista de dónde salió cada gasto y evitar que
        // se edite algo que en realidad vive en Tarjetas / Préstamos / Agenda.
        cardPayment: { select: { id: true, card: { select: { name: true } } } },
        loanPayment: { select: { id: true, loan: { select: { name: true } } } },
        plannedExpense: { select: { id: true } },
      },
      orderBy: { date: 'desc' },
    });

    return expenses;
  } catch (error) {
    console.error('Error fetching expenses:', error);
    return [];
  }
}

export async function updateExpense(id: string, data: Partial<ExpenseFormData>) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const actual = await gastoPropio(id, accountId);
    if (!actual) return { success: false, error: 'Gasto no encontrado' };

    // Un gasto que nació de un pago de tarjeta o de una cuota de préstamo tiene
    // un espejo en la otra sección. Editarlo acá dejaría los dos números
    // distintos, así que se edita donde corresponde.
    if (actual.cardPayment) {
      return {
        success: false,
        error: 'Este gasto es el pago de una tarjeta. Editalo desde la sección Tarjetas.',
      };
    }
    if (actual.loanPayment) {
      return {
        success: false,
        error: 'Este gasto es la cuota de un préstamo. Editalo desde la sección Préstamos.',
      };
    }

    if (data.amount !== undefined && data.amount <= 0) {
      return { success: false, error: 'El monto tiene que ser mayor a cero' };
    }

    if (data.categoryId) {
      const categoria = await prisma.category.findFirst({
        where: { id: data.categoryId, accountId },
      });
      if (!categoria) return { success: false, error: 'Categoría no encontrada' };
    }

    if (data.profileId) {
      const perfil = await perfilPropio(data.profileId, accountId);
      if (!perfil) return { success: false, error: 'Perfil no encontrado' };
    }

    // Se listan los campos uno por uno en lugar de volcar `data` entero: así un
    // campo de más en el formulario no llega crudo a la base.
    const tipo = data.type ?? actual.type;
    const esCompartido = tipo === 'COMPARTIDO';

    await prisma.expense.update({
      where: { id },
      data: {
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        ...(data.date !== undefined ? { date: parseArgDate(data.date) } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
        ...(data.profileId !== undefined ? { profileId: data.profileId } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.receiptUrl !== undefined ? { receiptUrl: data.receiptUrl || null } : {}),
        ...(data.walletId !== undefined ? { walletId: data.walletId || null } : {}),
        ...(data.paymentMethod ? { paymentMethod: data.paymentMethod } : {}),
        // Si deja de ser compartido, se limpian los campos del fondo común:
        // si no, un gasto propio quedaba marcado como "lo pagué yo".
        paidFromPersonalBudget: esCompartido
          ? data.paidFromPersonalBudget ?? actual.paidFromPersonalBudget
          : false,
        splitPercentage: esCompartido
          ? data.splitPercentage ?? actual.splitPercentage
          : null,
      },
    });

    revalidatePath('/gastos');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error updating expense:', error);
    return { success: false, error: 'Error al actualizar gasto' };
  }
}

export async function deleteExpense(id: string) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const actual = await gastoPropio(id, accountId);
    if (!actual) return { success: false, error: 'Gasto no encontrado' };

    // Borrar el gasto arrastra el pago de tarjeta / cuota de préstamo por
    // cascada, y la deuda vuelve a figurar. Se avisa en la UI antes de llegar acá.
    await prisma.expense.delete({ where: { id } });

    revalidatePath('/gastos');
    revalidatePath('/dashboard');
    revalidatePath('/tarjetas');
    revalidatePath('/prestamos');
    return { success: true };
  } catch (error) {
    console.error('Error deleting expense:', error);
    return { success: false, error: 'Error al eliminar gasto' };
  }
}

export async function getCategories() {
  try {
    const accountId = await getAccountId();
    let cats = await prisma.category.findMany({
      where: accountId ? { accountId } : {},
      orderBy: { name: 'asc' },
    });

    if (cats.length === 0 && accountId) {
      const defaultCats = [
        { name: 'Supermercado', icon: '🛒', color: '#3b82f6', accountId },
        { name: 'Transporte', icon: '🚌', color: '#8b5cf6', accountId },
        { name: 'Servicios', icon: '💡', color: '#eab308', accountId },
        { name: 'Comida', icon: '🍔', color: '#f97316', accountId },
        { name: 'Salud', icon: '💊', color: '#ef4444', accountId },
        { name: 'Educación', icon: '📚', color: '#06b6d4', accountId },
        { name: 'Ocio', icon: '🎭', color: '#ec4899', accountId },
        { name: 'Otros', icon: '📦', color: '#6366f1', accountId },
      ];
      await prisma.category.createMany({ data: defaultCats });
      cats = await prisma.category.findMany({ where: { accountId }, orderBy: { name: 'asc' } });
    }

    return cats;
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}
