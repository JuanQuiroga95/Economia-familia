'use server';

import { prisma } from '@/lib/prisma';
import { getAccountId } from '@/lib/session';
import { parseArgDate, getArgDate, getCurrentFinancialMonth } from '@/lib/dateUtils';
import {
  buildInstallments,
  buildStatement,
  firstInstallmentPeriod,
  formatPeriod,
  futureInstallments,
  totalDebt,
} from '@/lib/cardUtils';
import { sendPushNotification } from '@/lib/push';
import { getCardCategory } from '@/lib/cardCategory';
import { revalidatePath } from 'next/cache';

function revalidateCards() {
  revalidatePath('/tarjetas');
  revalidatePath('/gastos');
  revalidatePath('/dashboard');
}

/** Verifica que la tarjeta sea de un perfil de esta cuenta. */
async function findOwnedCard(cardId: string, accountId: string) {
  return prisma.creditCard.findFirst({
    where: { id: cardId, profile: { accountId } },
  });
}

// ============================================
// Tarjetas
// ============================================

export interface CreditCardFormData {
  name: string;
  bank?: string;
  lastFour?: string;
  currency: string;
  creditLimit?: number | null;
  closingDay: number;
  dueDay: number;
  color?: string;
  profileId: string;
}

export async function createCreditCard(data: CreditCardFormData) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const profile = await prisma.profile.findFirst({
      where: { id: data.profileId, accountId },
    });
    if (!profile) return { success: false, error: 'Perfil no encontrado' };

    const card = await prisma.creditCard.create({
      data: {
        name: data.name.trim(),
        bank: data.bank?.trim() || null,
        lastFour: data.lastFour?.trim() || null,
        currency: data.currency || 'ARS',
        creditLimit: data.creditLimit ?? null,
        closingDay: Math.min(31, Math.max(1, data.closingDay)),
        dueDay: Math.min(31, Math.max(1, data.dueDay)),
        color: data.color || '#f97316',
        profileId: data.profileId,
      },
    });

    revalidateCards();
    return { success: true, data: card };
  } catch (error) {
    console.error('Error creating credit card:', error);
    return { success: false, error: 'Error al crear la tarjeta' };
  }
}

export async function updateCreditCard(id: string, data: Partial<CreditCardFormData>) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };
    if (!(await findOwnedCard(id, accountId))) return { success: false, error: 'Tarjeta no encontrada' };

    await prisma.creditCard.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.bank !== undefined ? { bank: data.bank?.trim() || null } : {}),
        ...(data.lastFour !== undefined ? { lastFour: data.lastFour?.trim() || null } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        ...(data.creditLimit !== undefined ? { creditLimit: data.creditLimit } : {}),
        ...(data.closingDay !== undefined ? { closingDay: Math.min(31, Math.max(1, data.closingDay)) } : {}),
        ...(data.dueDay !== undefined ? { dueDay: Math.min(31, Math.max(1, data.dueDay)) } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
        ...(data.profileId !== undefined ? { profileId: data.profileId } : {}),
      },
    });

    revalidateCards();
    return { success: true };
  } catch (error) {
    console.error('Error updating credit card:', error);
    return { success: false, error: 'Error al actualizar la tarjeta' };
  }
}

export async function deleteCreditCard(id: string) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };
    if (!(await findOwnedCard(id, accountId))) return { success: false, error: 'Tarjeta no encontrada' };

    // Se borran consumos, cuotas y pagos de la tarjeta.
    // Los gastos ya registrados en /gastos por esos pagos se conservan.
    await prisma.creditCard.delete({ where: { id } });

    revalidateCards();
    return { success: true };
  } catch (error) {
    console.error('Error deleting credit card:', error);
    return { success: false, error: 'Error al eliminar la tarjeta' };
  }
}

// ============================================
// Consumos
// ============================================

export interface CardPurchaseFormData {
  cardId: string;
  description: string;
  /** Monto total del consumo. Si amountIsPerInstallment es true, es el valor de UNA cuota. */
  amount: number;
  amountIsPerInstallment?: boolean;
  installments: number;
  date: string;
  categoryId?: string;
  profileId: string;
  type: 'PROPIO' | 'COMPARTIDO';
  splitPercentage?: number;
  /** Opcional: forzar el resumen de la primera cuota. */
  firstMonth?: number;
  firstYear?: number;
}

export async function createCardPurchase(data: CardPurchaseFormData) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const card = await findOwnedCard(data.cardId, accountId);
    if (!card) return { success: false, error: 'Tarjeta no encontrada' };

    const installments = Math.max(1, Math.floor(data.installments || 1));
    const totalAmount = data.amountIsPerInstallment ? data.amount * installments : data.amount;
    if (!totalAmount || totalAmount <= 0) return { success: false, error: 'Monto inválido' };

    const purchaseDate = parseArgDate(data.date);
    const first =
      data.firstMonth && data.firstYear
        ? { month: data.firstMonth, year: data.firstYear }
        : firstInstallmentPeriod(purchaseDate, card.closingDay);

    const schedule = buildInstallments(totalAmount, installments, first.month, first.year);

    const purchase = await prisma.cardPurchase.create({
      data: {
        description: data.description.trim(),
        totalAmount,
        currency: card.currency,
        date: purchaseDate,
        installments,
        categoryId: data.categoryId || null,
        profileId: data.profileId,
        type: data.type,
        splitPercentage: data.type === 'COMPARTIDO' ? data.splitPercentage ?? null : null,
        cardId: card.id,
        schedule: { create: schedule },
      },
      include: { schedule: true },
    });

    revalidateCards();
    return {
      success: true,
      data: {
        id: purchase.id,
        totalAmount,
        installments,
        installmentAmount: schedule[0].amount,
        firstPeriod: formatPeriod(first.month, first.year),
        cardName: card.name,
      },
    };
  } catch (error) {
    console.error('Error creating card purchase:', error);
    return { success: false, error: 'Error al registrar el consumo' };
  }
}

export async function deleteCardPurchase(id: string) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const purchase = await prisma.cardPurchase.findFirst({
      where: { id, card: { profile: { accountId } } },
    });
    if (!purchase) return { success: false, error: 'Consumo no encontrado' };

    await prisma.cardPurchase.delete({ where: { id } });
    revalidateCards();
    return { success: true };
  } catch (error) {
    console.error('Error deleting card purchase:', error);
    return { success: false, error: 'Error al eliminar el consumo' };
  }
}

// ============================================
// Pagos del resumen (esto sí genera un gasto real)
// ============================================

export interface CardPaymentFormData {
  cardId: string;
  amount: number;
  date: string;
  month: number;
  year: number;
  profileId: string;
  type: 'PROPIO' | 'COMPARTIDO';
  paidFromPersonalBudget?: boolean;
  splitPercentage?: number;
  note?: string;
  walletId?: string;
  paymentMethod?: 'EFECTIVO' | 'TRANSFERENCIA';
}

export async function payCard(data: CardPaymentFormData) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const card = await findOwnedCard(data.cardId, accountId);
    if (!card) return { success: false, error: 'Tarjeta no encontrada' };
    if (!data.amount || data.amount <= 0) return { success: false, error: 'Monto inválido' };

    const profile = await prisma.profile.findFirst({ where: { id: data.profileId, accountId } });
    if (!profile) return { success: false, error: 'Perfil no encontrado' };

    const category = await getCardCategory(accountId);
    const paymentDate = parseArgDate(data.date);

    // El pago del resumen es el gasto real que impacta en el mes.
    const expense = await prisma.expense.create({
      data: {
        amount: data.amount,
        currency: card.currency,
        date: paymentDate,
        description: `Pago tarjeta ${card.name} (${formatPeriod(data.month, data.year)})`,
        categoryId: category.id,
        profileId: data.profileId,
        type: data.type,
        paidFromPersonalBudget: data.type === 'COMPARTIDO' ? !!data.paidFromPersonalBudget : false,
        splitPercentage: data.type === 'COMPARTIDO' ? data.splitPercentage ?? null : null,
        walletId: data.walletId || null,
        paymentMethod: data.paymentMethod || 'TRANSFERENCIA',
      },
    });

    await prisma.cardPayment.create({
      data: {
        amount: data.amount,
        currency: card.currency,
        date: paymentDate,
        month: data.month,
        year: data.year,
        note: data.note?.trim() || null,
        cardId: card.id,
        profileId: data.profileId,
        expenseId: expense.id,
      },
    });

    try {
      const others = await prisma.profile.findMany({
        where: { accountId, id: { not: data.profileId } },
      });
      for (const other of others) {
        await sendPushNotification(
          other.id,
          'Pago de tarjeta',
          `${profile.name} pagó $${data.amount} de la tarjeta ${card.name}.`,
          '/tarjetas'
        );
      }
    } catch (pushErr) {
      console.error('Error enviando push:', pushErr);
    }

    revalidateCards();
    return { success: true };
  } catch (error) {
    console.error('Error paying card:', error);
    return { success: false, error: 'Error al registrar el pago' };
  }
}

export async function deleteCardPayment(id: string) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const payment = await prisma.cardPayment.findFirst({
      where: { id, card: { profile: { accountId } } },
    });
    if (!payment) return { success: false, error: 'Pago no encontrado' };

    // Borrar el gasto arrastra el pago (relación en cascada).
    if (payment.expenseId) {
      await prisma.expense.delete({ where: { id: payment.expenseId } }).catch(() => {});
    }
    await prisma.cardPayment.delete({ where: { id } }).catch(() => {});

    revalidateCards();
    return { success: true };
  } catch (error) {
    console.error('Error deleting card payment:', error);
    return { success: false, error: 'Error al eliminar el pago' };
  }
}

// ============================================
// Lecturas
// ============================================

/**
 * Estado completo de las tarjetas para un mes: resumen, deuda arrastrada,
 * cuotas a futuro y disponible.
 */
export async function getCardsOverview(month: number, year: number) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return [];

    const cards = await prisma.creditCard.findMany({
      where: { profile: { accountId } },
      include: {
        profile: { select: { id: true, name: true, avatar: true } },
        purchases: {
          include: {
            schedule: { orderBy: { number: 'asc' } },
            category: { select: { id: true, name: true, icon: true, color: true } },
            profile: { select: { id: true, name: true, avatar: true } },
          },
          orderBy: { date: 'desc' },
        },
        payments: { orderBy: { date: 'desc' } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return cards.map((card) => {
      const allInstallments = card.purchases.flatMap((p) => p.schedule);
      const statement = buildStatement(allInstallments, card.payments, month, year);
      const debt = totalDebt(allInstallments, card.payments, month, year);
      const future = futureInstallments(allInstallments, month, year);
      const available =
        card.creditLimit != null ? Math.max(0, card.creditLimit - debt - future) : null;

      // Cuotas que caen en el mes consultado, con su consumo de origen.
      const monthInstallments = card.purchases
        .flatMap((p) =>
          p.schedule
            .filter((s) => s.month === month && s.year === year)
            .map((s) => ({
              id: s.id,
              number: s.number,
              amount: s.amount,
              purchaseId: p.id,
              description: p.description,
              installments: p.installments,
              type: p.type,
              category: p.category,
              profile: p.profile,
              date: p.date,
            }))
        )
        .sort((a, b) => b.date.getTime() - a.date.getTime());

      return {
        id: card.id,
        name: card.name,
        bank: card.bank,
        lastFour: card.lastFour,
        currency: card.currency,
        creditLimit: card.creditLimit,
        closingDay: card.closingDay,
        dueDay: card.dueDay,
        color: card.color,
        profile: card.profile,
        statement,
        debt,
        future,
        available,
        monthInstallments,
        purchases: card.purchases.map((p) => ({
          id: p.id,
          description: p.description,
          totalAmount: p.totalAmount,
          date: p.date,
          installments: p.installments,
          type: p.type,
          category: p.category,
          profile: p.profile,
          schedule: p.schedule,
          remaining: p.schedule.filter(
            (s) => s.year * 12 + s.month > year * 12 + month
          ).length,
        })),
        payments: card.payments.map((p) => ({
          id: p.id,
          amount: p.amount,
          date: p.date,
          month: p.month,
          year: p.year,
          note: p.note,
          profileId: p.profileId,
        })),
      };
    });
  } catch (error) {
    console.error('Error fetching cards overview:', error);
    return [];
  }
}

export interface CardsSummary {
  hasCards: boolean;
  dueThisMonth: number;
  pendingThisMonth: number;
  totalDebt: number;
  futureInstallments: number;
  cards: { id: string; name: string; color: string; pending: number; currency: string }[];
}

/** Resumen liviano para el dashboard. */
export async function getCardsSummary(month?: number, year?: number): Promise<CardsSummary> {
  const empty: CardsSummary = {
    hasCards: false,
    dueThisMonth: 0,
    pendingThisMonth: 0,
    totalDebt: 0,
    futureInstallments: 0,
    cards: [],
  };

  try {
    const accountId = await getAccountId();
    if (!accountId) return empty;

    const current = getCurrentFinancialMonth(getArgDate());
    const m = month ?? current.month;
    const y = year ?? current.year;

    const cards = await prisma.creditCard.findMany({
      where: { profile: { accountId } },
      include: {
        purchases: { include: { schedule: true } },
        payments: true,
      },
    });

    if (cards.length === 0) return empty;

    const summary = { ...empty, hasCards: true, cards: [] as CardsSummary['cards'] };

    for (const card of cards) {
      const installments = card.purchases.flatMap((p) => p.schedule);
      const statement = buildStatement(installments, card.payments, m, y);

      summary.dueThisMonth += statement.totalDue;
      summary.pendingThisMonth += statement.pending;
      summary.totalDebt += totalDebt(installments, card.payments, m, y);
      summary.futureInstallments += futureInstallments(installments, m, y);
      summary.cards.push({
        id: card.id,
        name: card.name,
        color: card.color,
        pending: statement.pending,
        currency: card.currency,
      });
    }

    return summary;
  } catch (error) {
    console.error('Error fetching cards summary:', error);
    return empty;
  }
}
