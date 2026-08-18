'use server';

import { prisma } from '@/lib/prisma';
import { getAccountId } from '@/lib/session';
import { parseArgDate, getArgDate, getCurrentFinancialMonth } from '@/lib/dateUtils';
import {
  buildLoanSchedule,
  buildStatement,
  formatPeriod,
  futureInstallments,
  loanProgress,
  nextPendingInstallment,
  totalDebt,
} from '@/lib/loanUtils';
import { sendPushNotification } from '@/lib/push';
import { getLoanCategory } from '@/lib/loanCategory';
import { revalidatePath } from 'next/cache';

function revalidateLoans() {
  revalidatePath('/prestamos');
  revalidatePath('/gastos');
  revalidatePath('/ingresos');
  revalidatePath('/dashboard');
}

/** Verifica que el préstamo sea de un perfil de esta cuenta. */
async function findOwnedLoan(loanId: string, accountId: string) {
  return prisma.loan.findFirst({
    where: { id: loanId, profile: { accountId } },
  });
}

// ============================================
// Préstamos
// ============================================

export interface LoanFormData {
  name: string;
  lender?: string;
  kind: 'TOMADO' | 'OTORGADO';
  currency: string;
  principal: number;
  /** Total a devolver. Si no viene, se calcula como cuota x cantidad de cuotas. */
  totalToRepay?: number;
  installments: number;
  installmentAmount?: number;
  interestRate?: number | null;
  firstMonth: number;
  firstYear: number;
  dueDay: number;
  color?: string;
  notes?: string;
  isActive?: boolean;
  profileId: string;
  categoryId?: string;
  type?: 'PROPIO' | 'COMPARTIDO';
  splitPercentage?: number;
}

/** Normaliza cuotas / total a devolver: alcanza con saber uno de los dos. */
function resolveAmounts(data: {
  installments: number;
  installmentAmount?: number | null;
  totalToRepay?: number | null;
  principal?: number | null;
}) {
  const installments = Math.max(1, Math.floor(data.installments || 1));
  const total =
    data.totalToRepay && data.totalToRepay > 0
      ? data.totalToRepay
      : (data.installmentAmount || 0) * installments || data.principal || 0;
  const installmentAmount = Math.round((total / installments) * 100) / 100;
  return { installments, total, installmentAmount };
}

export async function createLoan(data: LoanFormData) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const profile = await prisma.profile.findFirst({
      where: { id: data.profileId, accountId },
    });
    if (!profile) return { success: false, error: 'Perfil no encontrado' };

    const { installments, total, installmentAmount } = resolveAmounts(data);
    if (!total || total <= 0) return { success: false, error: 'Monto inválido' };

    const schedule = buildLoanSchedule(total, installments, data.firstMonth, data.firstYear);

    const loan = await prisma.loan.create({
      data: {
        name: data.name.trim(),
        lender: data.lender?.trim() || null,
        kind: data.kind,
        currency: data.currency || 'ARS',
        principal: data.principal || total,
        totalToRepay: total,
        installments,
        installmentAmount,
        interestRate: data.interestRate ?? null,
        firstMonth: data.firstMonth,
        firstYear: data.firstYear,
        dueDay: Math.min(31, Math.max(1, data.dueDay)),
        color: data.color || '#8b5cf6',
        notes: data.notes?.trim() || null,
        type: data.type || 'PROPIO',
        splitPercentage: data.type === 'COMPARTIDO' ? data.splitPercentage ?? null : null,
        categoryId: data.categoryId || null,
        profileId: data.profileId,
        schedule: { create: schedule },
      },
    });

    revalidateLoans();
    return {
      success: true,
      data: {
        id: loan.id,
        installments,
        installmentAmount,
        total,
        firstPeriod: formatPeriod(data.firstMonth, data.firstYear),
      },
    };
  } catch (error) {
    console.error('Error creating loan:', error);
    return { success: false, error: 'Error al crear el préstamo' };
  }
}

export async function updateLoan(id: string, data: Partial<LoanFormData>) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const loan = await findOwnedLoan(id, accountId);
    if (!loan) return { success: false, error: 'Préstamo no encontrado' };

    // Si cambia el plan de pagos, se regenera el cronograma completo.
    const planChanged =
      data.installments !== undefined ||
      data.installmentAmount !== undefined ||
      data.totalToRepay !== undefined ||
      data.firstMonth !== undefined ||
      data.firstYear !== undefined;

    const merged = {
      principal: data.principal ?? loan.principal,
      installments: data.installments ?? loan.installments,
      installmentAmount: data.installmentAmount ?? loan.installmentAmount,
      // Si mandan una cuota nueva, el total se recalcula a partir de ella.
      totalToRepay:
        data.totalToRepay ?? (data.installmentAmount !== undefined ? undefined : loan.totalToRepay),
    };
    const { installments, total, installmentAmount } = resolveAmounts(merged);
    const firstMonth = data.firstMonth ?? loan.firstMonth;
    const firstYear = data.firstYear ?? loan.firstYear;

    await prisma.loan.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.lender !== undefined ? { lender: data.lender?.trim() || null } : {}),
        ...(data.kind !== undefined ? { kind: data.kind } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        ...(data.interestRate !== undefined ? { interestRate: data.interestRate } : {}),
        ...(data.dueDay !== undefined ? { dueDay: Math.min(31, Math.max(1, data.dueDay)) } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
        ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.splitPercentage !== undefined ? { splitPercentage: data.splitPercentage } : {}),
        ...(data.categoryId !== undefined ? { categoryId: data.categoryId || null } : {}),
        ...(data.profileId !== undefined ? { profileId: data.profileId } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(planChanged
          ? {
              principal: merged.principal,
              installments,
              installmentAmount,
              totalToRepay: total,
              firstMonth,
              firstYear,
              schedule: {
                deleteMany: {},
                create: buildLoanSchedule(total, installments, firstMonth, firstYear),
              },
            }
          : {}),
      },
    });

    revalidateLoans();
    return { success: true };
  } catch (error) {
    console.error('Error updating loan:', error);
    return { success: false, error: 'Error al actualizar el préstamo' };
  }
}

export async function deleteLoan(id: string) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };
    if (!(await findOwnedLoan(id, accountId)))
      return { success: false, error: 'Préstamo no encontrado' };

    // Se borran las cuotas y el historial de pagos del préstamo.
    // Los gastos / ingresos ya registrados se conservan.
    await prisma.loan.delete({ where: { id } });

    revalidateLoans();
    return { success: true };
  } catch (error) {
    console.error('Error deleting loan:', error);
    return { success: false, error: 'Error al eliminar el préstamo' };
  }
}

// ============================================
// Pagos de cuotas (esto sí genera movimiento real)
// ============================================

export interface LoanPaymentFormData {
  loanId: string;
  amount: number;
  date: string;
  month: number;
  year: number;
  profileId: string;
  type?: 'PROPIO' | 'COMPARTIDO';
  paidFromPersonalBudget?: boolean;
  splitPercentage?: number;
  note?: string;
  walletId?: string;
  paymentMethod?: 'EFECTIVO' | 'TRANSFERENCIA';
}

export async function payLoanInstallment(data: LoanPaymentFormData) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const loan = await findOwnedLoan(data.loanId, accountId);
    if (!loan) return { success: false, error: 'Préstamo no encontrado' };
    if (!data.amount || data.amount <= 0) return { success: false, error: 'Monto inválido' };

    const profile = await prisma.profile.findFirst({ where: { id: data.profileId, accountId } });
    if (!profile) return { success: false, error: 'Perfil no encontrado' };

    const paymentDate = parseArgDate(data.date);
    const period = formatPeriod(data.month, data.year);
    const type = data.type || loan.type;

    let expenseId: string | null = null;
    let incomeId: string | null = null;

    if (loan.kind === 'TOMADO') {
      // Pagar la cuota es un gasto real del mes.
      const own = loan.categoryId
        ? await prisma.category.findFirst({ where: { id: loan.categoryId, accountId } })
        : null;
      const category = own ?? (await getLoanCategory(accountId));

      const expense = await prisma.expense.create({
        data: {
          amount: data.amount,
          currency: loan.currency,
          date: paymentDate,
          description: `Cuota ${loan.name} (${period})`,
          categoryId: category.id,
          profileId: data.profileId,
          type,
          paidFromPersonalBudget: type === 'COMPARTIDO' ? !!data.paidFromPersonalBudget : false,
          splitPercentage: type === 'COMPARTIDO' ? data.splitPercentage ?? null : null,
          walletId: data.walletId || null,
          paymentMethod: data.paymentMethod || 'TRANSFERENCIA',
        },
      });
      expenseId = expense.id;
    } else {
      // Nos devuelven plata que prestamos: es un ingreso.
      const income = await prisma.income.create({
        data: {
          amount: data.amount,
          currency: loan.currency,
          date: paymentDate,
          description: `Cobro ${loan.name} (${period})`,
          profileId: data.profileId,
          walletId: data.walletId || null,
          paymentMethod: data.paymentMethod || 'TRANSFERENCIA',
        },
      });
      incomeId = income.id;
    }

    await prisma.loanPayment.create({
      data: {
        amount: data.amount,
        currency: loan.currency,
        date: paymentDate,
        month: data.month,
        year: data.year,
        note: data.note?.trim() || null,
        loanId: loan.id,
        profileId: data.profileId,
        expenseId,
        incomeId,
      },
    });

    try {
      const others = await prisma.profile.findMany({
        where: { accountId, id: { not: data.profileId } },
      });
      const verbo = loan.kind === 'TOMADO' ? 'pagó' : 'cobró';
      for (const other of others) {
        await sendPushNotification(
          other.id,
          loan.kind === 'TOMADO' ? 'Cuota de préstamo' : 'Cobro de préstamo',
          `${profile.name} ${verbo} $${data.amount} de ${loan.name}.`,
          '/prestamos'
        );
      }
    } catch (pushErr) {
      console.error('Error enviando push:', pushErr);
    }

    revalidateLoans();
    return { success: true };
  } catch (error) {
    console.error('Error paying loan installment:', error);
    return { success: false, error: 'Error al registrar el pago' };
  }
}

export async function deleteLoanPayment(id: string) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return { success: false, error: 'No autenticado' };

    const payment = await prisma.loanPayment.findFirst({
      where: { id, loan: { profile: { accountId } } },
    });
    if (!payment) return { success: false, error: 'Pago no encontrado' };

    // Borrar el movimiento arrastra el pago (relación en cascada).
    if (payment.expenseId) {
      await prisma.expense.delete({ where: { id: payment.expenseId } }).catch(() => {});
    }
    if (payment.incomeId) {
      await prisma.income.delete({ where: { id: payment.incomeId } }).catch(() => {});
    }
    await prisma.loanPayment.delete({ where: { id } }).catch(() => {});

    revalidateLoans();
    return { success: true };
  } catch (error) {
    console.error('Error deleting loan payment:', error);
    return { success: false, error: 'Error al eliminar el pago' };
  }
}

// ============================================
// Lecturas
// ============================================

/** Estado completo de los préstamos para un mes. */
export async function getLoansOverview(month: number, year: number) {
  try {
    const accountId = await getAccountId();
    if (!accountId) return [];

    const loans = await prisma.loan.findMany({
      where: { profile: { accountId } },
      include: {
        profile: { select: { id: true, name: true, avatar: true } },
        category: { select: { id: true, name: true, icon: true, color: true } },
        schedule: { orderBy: { number: 'asc' } },
        payments: { orderBy: { date: 'desc' } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return loans.map((loan) => {
      const statement = buildStatement(loan.schedule, loan.payments, month, year);
      const progress = loanProgress(loan.schedule, loan.payments);
      const next = nextPendingInstallment(loan.schedule, loan.payments, month, year);

      return {
        id: loan.id,
        name: loan.name,
        lender: loan.lender,
        kind: loan.kind,
        currency: loan.currency,
        principal: loan.principal,
        totalToRepay: loan.totalToRepay,
        installments: loan.installments,
        installmentAmount: loan.installmentAmount,
        interestRate: loan.interestRate,
        firstMonth: loan.firstMonth,
        firstYear: loan.firstYear,
        dueDay: loan.dueDay,
        color: loan.color,
        notes: loan.notes,
        type: loan.type,
        profile: loan.profile,
        category: loan.category,
        statement,
        progress,
        overdue: totalDebt(loan.schedule, loan.payments, month, year),
        future: futureInstallments(loan.schedule, month, year),
        nextInstallment: next
          ? { number: next.number, amount: next.amount, month: next.month, year: next.year }
          : null,
        monthInstallments: loan.schedule.filter((s) => s.month === month && s.year === year),
        schedule: loan.schedule,
        payments: loan.payments.map((p) => ({
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
    console.error('Error fetching loans overview:', error);
    return [];
  }
}

export interface LoansSummary {
  hasLoans: boolean;
  /** Cuotas de préstamos tomados que vencen este mes. */
  dueThisMonth: number;
  pendingThisMonth: number;
  /** Lo que falta para terminar de pagar todo. */
  totalRemaining: number;
  /** Lo que todavía nos deben (préstamos otorgados). */
  totalLent: number;
  toCollectThisMonth: number;
  loans: {
    id: string;
    name: string;
    color: string;
    kind: string;
    pending: number;
    remaining: number;
    paidInstallments: number;
    totalInstallments: number;
    currency: string;
  }[];
}

/** Resumen liviano para el dashboard. */
export async function getLoansSummary(month?: number, year?: number): Promise<LoansSummary> {
  const empty: LoansSummary = {
    hasLoans: false,
    dueThisMonth: 0,
    pendingThisMonth: 0,
    totalRemaining: 0,
    totalLent: 0,
    toCollectThisMonth: 0,
    loans: [],
  };

  try {
    const accountId = await getAccountId();
    if (!accountId) return empty;

    const current = getCurrentFinancialMonth(getArgDate());
    const m = month ?? current.month;
    const y = year ?? current.year;

    const loans = await prisma.loan.findMany({
      where: { profile: { accountId } },
      include: { schedule: true, payments: true },
    });
    if (loans.length === 0) return empty;

    const summary: LoansSummary = { ...empty, hasLoans: true, loans: [] };

    for (const loan of loans) {
      const statement = buildStatement(loan.schedule, loan.payments, m, y);
      const progress = loanProgress(loan.schedule, loan.payments);

      if (loan.kind === 'TOMADO') {
        summary.dueThisMonth += statement.totalDue;
        summary.pendingThisMonth += statement.pending;
        summary.totalRemaining += progress.remaining;
      } else {
        summary.toCollectThisMonth += statement.pending;
        summary.totalLent += progress.remaining;
      }

      summary.loans.push({
        id: loan.id,
        name: loan.name,
        color: loan.color,
        kind: loan.kind,
        pending: statement.pending,
        remaining: progress.remaining,
        paidInstallments: progress.paidInstallments,
        totalInstallments: progress.totalInstallments,
        currency: loan.currency,
      });
    }

    return summary;
  } catch (error) {
    console.error('Error fetching loans summary:', error);
    return empty;
  }
}
