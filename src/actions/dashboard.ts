'use server';

import { prisma } from '@/lib/prisma';
import type { BudgetStatus, CategoryBreakdown, SharedFundStats } from '@/types';
import { getFinancialMonthRange, getArgDate, getCurrentFinancialMonth } from '@/lib/dateUtils';
import { categoriaDeConsumo, MONEDA_BASE } from '@/lib/reportFilters';
import { addMonths, periodIndex } from '@/lib/periodUtils';
import {
  mesDePresupuesto,
  quincenaDe,
  rangoMesDePresupuesto,
  rangoQuincena,
  textoDelPeriodo,
} from '@/lib/budgetPeriod';

import { getAccountId } from '@/lib/session';

export async function getDashboardStats(month: number, year: number, profileId?: string) {
  try {
    const { startDate, endDate } = getFinancialMonthRange(month, year);
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: { profiles: { orderBy: { name: 'asc' } } }
    });
    if (!account) throw new Error('No account found');

    const whereBase = {
      date: { gte: startDate, lte: endDate },
      profile: { accountId },
      ...(profileId ? { profileId } : {}),
    };

    // Total ingresos
    const incomes = await prisma.income.aggregate({
      where: { ...whereBase, currency: MONEDA_BASE },
      _sum: { amount: true },
    });

    let totalExpenses = 0;

    const expenseWhereBase = {
      ...whereBase,
      currency: MONEDA_BASE,
      category: categoriaDeConsumo,
    };

    if (profileId) {
      // Si es la vista de un perfil específico: Gastos PROPIOS + Compartidos pagados por él
      const expenses = await prisma.expense.findMany({
        where: expenseWhereBase,
      });
      totalExpenses = expenses
        .filter((e) => e.type === 'PROPIO' || (e.type === 'COMPARTIDO' && e.paidFromPersonalBudget))
        .reduce((sum, e) => sum + e.amount, 0);
    } else {
      // Vista global (Dashboard): TODOS los gastos (Propios de ambos + Compartidos)
      const allExpenses = await prisma.expense.aggregate({
        where: expenseWhereBase,
        _sum: { amount: true },
      });
      totalExpenses = allExpenses._sum.amount || 0;
    }

    const totalIncome = incomes._sum.amount || 0;

    // Fetch savings transactions of this month
    const savingsTxs = await prisma.savingsTransaction.findMany({
      where: whereBase,
      include: { savingsGoal: true },
    });
    let savingsDeposits = 0;
    let savingsWithdrawals = 0;
    savingsTxs.forEach(tx => {
      if (tx.savingsGoal.currency === MONEDA_BASE) {
        if (tx.type === 'DEPOSITO') savingsDeposits += tx.amount;
        if (tx.type === 'RETIRO') savingsWithdrawals += tx.amount;
      }
    });

    // Plata que se fue a inversiones este mes. El alta de una inversión no deja
    // movimiento, así que el monto original se reconstruye sumándole los
    // retiros: si no, rescatar plata de una inversión nueva la hacía desaparecer.
    const newInvestments = await prisma.investment.findMany({
      where: {
        startDate: { gte: startDate, lte: endDate },
        profile: { accountId },
        currency: MONEDA_BASE,
        ...(profileId ? { profileId } : {}),
      },
      include: { transactions: true },
    });
    let investmentDeposits = 0;
    newInvestments.forEach(inv => {
      const retirado = inv.transactions
        .filter(t => t.type === 'RETIRO')
        .reduce((acc, t) => acc + t.amount, 0);
      investmentDeposits += inv.amount + retirado;
    });

    // Retiros de inversiones hechos este mes (de cualquier inversión, nueva o
    // vieja): esa plata vuelve al balance del mes.
    const investmentTxs = await prisma.investmentTransaction.findMany({
      where: whereBase,
      include: { investment: { select: { currency: true } } },
    });
    let investmentWithdrawals = 0;
    investmentTxs.forEach(tx => {
      if (tx.investment.currency !== MONEDA_BASE) return;
      if (tx.type === 'RETIRO') investmentWithdrawals += tx.amount;
      if (tx.type === 'DEPOSITO') investmentDeposits += tx.amount;
    });

    let splitDetails = undefined;
    if (!profileId && account.showSplitBalance && account.profiles.length >= 2) {
      const profileA = account.profiles[0];
      const profileB = account.profiles[1];

      // Get all expenses to separate PROPIO from COMPARTIDO
      const allMonthExpenses = await prisma.expense.findMany({
        where: expenseWhereBase,
      });

      const totalShared = allMonthExpenses.filter(e => e.type === 'COMPARTIDO').reduce((sum, e) => sum + e.amount, 0);

      const ownExpensesA = allMonthExpenses.filter(e => e.type === 'PROPIO' && e.profileId === profileA.id).reduce((sum, e) => sum + e.amount, 0);
      const ownExpensesB = allMonthExpenses.filter(e => e.type === 'PROPIO' && e.profileId === profileB.id).reduce((sum, e) => sum + e.amount, 0);

      const assignedA = totalIncome * (account.splitPercentA / 100);
      const assignedB = totalIncome * (account.splitPercentB / 100);

      const fundPayments = await prisma.sharedFundPayment.findMany({
        where: { accountId, date: { gte: startDate, lte: endDate } },
      });
      const paymentsReceivedA = fundPayments.filter(p => p.profileId === profileA.id).reduce((sum, p) => sum + p.amount, 0);
      const paymentsReceivedB = fundPayments.filter(p => p.profileId === profileB.id).reduce((sum, p) => sum + p.amount, 0);

      const usedA = ownExpensesA + totalShared * (account.splitPercentA / 100) - paymentsReceivedA + paymentsReceivedB;
      const usedB = ownExpensesB + totalShared * (account.splitPercentB / 100) - paymentsReceivedB + paymentsReceivedA;

      splitDetails = [
        {
          profileId: profileA.id,
          profileName: profileA.name,
          assignedIncome: assignedA,
          usedAmount: usedA,
          availableAmount: assignedA - usedA,
          percentage: account.splitPercentA,
        },
        {
          profileId: profileB.id,
          profileName: profileB.name,
          assignedIncome: assignedB,
          usedAmount: usedB,
          availableAmount: assignedB - usedB,
          percentage: account.splitPercentB,
        }
      ];
    }

    return {
      totalIncome,
      totalExpenses,
      balance:
        totalIncome -
        totalExpenses -
        savingsDeposits +
        savingsWithdrawals -
        investmentDeposits +
        investmentWithdrawals,
      currency: MONEDA_BASE,
      splitBalanceEnabled: account.showSplitBalance,
      splitDetails,
    };
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return { totalIncome: 0, totalExpenses: 0, balance: 0, currency: 'ARS', splitBalanceEnabled: false };
  }
}

export async function getWalletBalances() {
  try {
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    const wallets = await prisma.wallet.findMany({
      where: { accountId },
    });

    const balances = await Promise.all(
      wallets.map(async (wallet) => {
        // Solo los movimientos en la moneda de la billetera: si no, un gasto en
        // dólares le restaba pesos a una billetera en pesos.
        const incomes = await prisma.income.aggregate({
          where: { walletId: wallet.id, currency: wallet.currency },
          _sum: { amount: true },
        });
        const expenses = await prisma.expense.aggregate({
          where: { walletId: wallet.id, currency: wallet.currency },
          _sum: { amount: true },
        });
        
        return {
          ...wallet,
          balance: (incomes._sum.amount || 0) - (expenses._sum.amount || 0),
        };
      })
    );

    return balances;
  } catch (error) {
    console.error('Error fetching wallet balances:', error);
    return [];
  }
}

export async function getCategoryBreakdown(
  month: number,
  year: number,
  profileId?: string
): Promise<CategoryBreakdown[]> {
  try {
    const { startDate, endDate } = getFinancialMonthRange(month, year);
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    const expenses = await prisma.expense.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        profile: { accountId },
        currency: MONEDA_BASE,
        category: categoriaDeConsumo,
        ...(profileId ? { profileId, type: 'PROPIO' } : {}),
      },
      include: { category: true },
    });

    const categoryMap = new Map<string, { category: string; icon: string; color: string; total: number }>();

    expenses.forEach((exp) => {
      const existing = categoryMap.get(exp.categoryId);
      if (existing) {
        existing.total += exp.amount;
      } else {
        categoryMap.set(exp.categoryId, {
          category: exp.category.name,
          icon: exp.category.icon,
          color: exp.category.color,
          total: exp.amount,
        });
      }
    });

    const totalExpenses = Array.from(categoryMap.values()).reduce((sum, c) => sum + c.total, 0);

    return Array.from(categoryMap.values())
      .map((c) => ({
        category: c.category,
        icon: c.icon,
        color: c.color,
        total: c.total,
        percentage: totalExpenses > 0 ? (c.total / totalExpenses) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);
  } catch (error) {
    console.error('Error fetching category breakdown:', error);
    return [];
  }
}

/**
 * Los 6 meses que terminan en el mes consultado. Antes contaba siempre desde
 * hoy, así que al mirar un mes viejo el gráfico mostraba otro período que el
 * resto del dashboard.
 */
export async function getMonthlyComparison(month?: number, year?: number, profileId?: string) {
  try {
    const current = getCurrentFinancialMonth(getArgDate());
    const months = [];
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    const currentMonth = month ?? current.month;
    const currentYear = year ?? current.year;

    for (let i = 5; i >= 0; i--) {
      let m = currentMonth - i;
      let y = currentYear;
      if (m <= 0) {
        m += 12;
        y -= 1;
      }

      const { startDate, endDate } = getFinancialMonthRange(m, y);

      const incomeAgg = await prisma.income.aggregate({
        where: {
          date: { gte: startDate, lte: endDate },
          profile: { accountId },
          currency: MONEDA_BASE,
          ...(profileId ? { profileId } : {}),
        },
        _sum: { amount: true },
      });

      const expenseAgg = await prisma.expense.aggregate({
        where: {
          date: { gte: startDate, lte: endDate },
          profile: { accountId },
          currency: MONEDA_BASE,
          category: categoriaDeConsumo,
          ...(profileId ? { profileId, type: 'PROPIO' } : {}),
        },
        _sum: { amount: true },
      });

      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

      months.push({
        name: monthNames[m - 1],
        ingresos: incomeAgg._sum.amount || 0,
        gastos: expenseAgg._sum.amount || 0,
      });
    }

    return months;
  } catch (error) {
    console.error('Error fetching monthly comparison:', error);
    return [];
  }
}

/**
 * Estado del presupuesto de un perfil.
 *
 * Si se pide el mes en curso muestra la quincena actual (que es lo útil día a
 * día). Para un mes pasado eso no tiene sentido: se muestra el mes cerrado
 * completo, con el presupuesto de las dos quincenas sumadas.
 */
export async function getBudgetStatus(
  profileId: string,
  month?: number,
  year?: number
): Promise<BudgetStatus | null> {
  try {
    const config = await prisma.budgetConfig.findUnique({
      where: { profileId },
      include: { profile: true },
    });

    if (!config || !config.isActive) return null;

    const now = getArgDate();
    // El mes de presupuesto no es el calendario: desde el día de cobro (el
    // último del mes) ya se está gastando el presupuesto del mes que viene.
    const actual = mesDePresupuesto(now);
    const mes = month ?? actual.month;
    const anio = year ?? actual.year;
    const esMesActual = mes === actual.month && anio === actual.year;

    const budgetType = config.budgetType || 'QUINCENAL';
    const monthlyBudget = config.monthlyBudget || 0;

    let startDate: Date;
    let endDate: Date;
    let budget: number;
    let currentHalf: 1 | 2 = 1;

    if (budgetType === 'MENSUAL') {
      ({ startDate, endDate } = rangoMesDePresupuesto(mes, anio));
      budget = monthlyBudget;
    } else if (!esMesActual) {
      // Mes ya cerrado: las dos quincenas juntas, con el mismo corte que tuvo
      // en vivo. Antes acá se usaba el mes calendario, así que lo gastado el
      // último día del mes se contaba dos veces.
      ({ startDate, endDate } = rangoMesDePresupuesto(mes, anio));
      budget = config.firstHalfBudget + config.secondHalfBudget;
    } else {
      currentHalf = quincenaDe(now);
      ({ startDate, endDate } = rangoQuincena(mes, anio, currentHalf));
      budget = currentHalf === 1 ? config.firstHalfBudget : config.secondHalfBudget;
    }

    const extraBudget = config.extraBudget || 0;
    budget += extraBudget;

    // Lo que sobró del mes pasado, si al cerrarlo se eligió arrastrarlo. Va
    // sólo a la primera quincena: sumarlo a las dos lo duplicaría.
    const previo = addMonths(mes, anio, -1);
    const cierrePrevio = await prisma.budgetClose.findUnique({
      where: {
        profileId_month_year: { profileId, month: previo.month, year: previo.year },
      },
    });
    const carryOver =
      cierrePrevio?.action === 'ARRASTRAR' &&
      cierrePrevio.leftover > 0 &&
      (budgetType === 'MENSUAL' || !esMesActual || currentHalf === 1)
        ? cierrePrevio.leftover
        : 0;
    budget += carryOver;

    // El rango real que se está contando. La quincena no coincide con el mes
    // calendario, así que sin esto es imposible entender por qué un gasto del
    // día 10 no aparece en el presupuesto del día 21.
    const periodo = textoDelPeriodo(startDate, endDate);

    const ownExpenses = await prisma.expense.findMany({
      where: {
        profileId,
        date: { gte: startDate, lte: endDate },
        currency: config.currency,
        type: 'PROPIO',
        category: categoriaDeConsumo,
      },
    });

    const spentOwn = ownExpenses.reduce((sum, exp) => sum + exp.amount, 0);

    const sharedPaidPersonal = await prisma.expense.findMany({
      where: {
        profileId,
        date: { gte: startDate, lte: endDate },
        currency: config.currency,
        type: 'COMPARTIDO',
        paidFromPersonalBudget: true,
        category: categoriaDeConsumo,
      },
    });

    const fundPaymentsReceived = await prisma.sharedFundPayment.findMany({
      where: {
        profileId,
        date: { gte: startDate, lte: endDate },
      },
    });

    const totalReimbursed = fundPaymentsReceived.reduce((sum, p) => sum + p.amount, 0);
    const spentSharedPersonal = sharedPaidPersonal.reduce((sum, exp) => sum + exp.amount, 0);
    const spent = Math.max(0, spentOwn + spentSharedPersonal - totalReimbursed);

    return {
      profileId,
      profileName: config.profile.name,
      currentHalf,
      esMesActual,
      budgetType,
      extraBudget,
      carryOver,
      periodo,
      budget,
      spent,
      remaining: budget - spent,
      percentage: budget > 0 ? (spent / budget) * 100 : 0,
      currency: config.currency,
    };
  } catch (error) {
    console.error('Error fetching budget status:', error);
    return null;
  }
}

export async function getSharedFundStats(month: number, year: number): Promise<SharedFundStats> {
  try {
    const { startDate, endDate } = getFinancialMonthRange(month, year);
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: { profiles: true },
    });

    if (!account || account.profiles.length < 2) {
      return { totalSharedExpenses: 0, debts: [], payments: [], monthClosed: false, currency: 'ARS' };
    }

    const [profileA, profileB] = account.profiles.sort((a, b) => a.name.localeCompare(b.name));

    // Lo gastado en conjunto ESTE mes, que es lo que va arriba de la tarjeta.
    const sharedExpenses = await prisma.expense.findMany({
      where: {
        type: 'COMPARTIDO',
        date: { gte: startDate, lte: endDate },
        profile: { accountId },
        currency: MONEDA_BASE,
      },
      include: { profile: true },
    });

    // La deuda con el fondo, en cambio, es un saldo que se arrastra: todo lo
    // que alguien puso de su bolsillo hasta el final del mes que se está
    // mirando, menos todo lo que se le devolvió hasta esa misma fecha.
    //
    // Antes se calculaba mes contra mes y eso daba dos números falsos: una
    // deuda de agosto que no se devolvió desaparecía el 1 de septiembre, y una
    // devolución hecha en septiembre por una deuda de agosto borraba la deuda
    // nueva de septiembre.
    const gastosQueGeneranDeuda = await prisma.expense.findMany({
      where: {
        type: 'COMPARTIDO',
        paidFromPersonalBudget: true,
        date: { lte: endDate },
        profile: { accountId },
        currency: MONEDA_BASE,
      },
      include: { profile: true },
    });

    const todasLasDevoluciones = await prisma.sharedFundPayment.findMany({
      where: { accountId, date: { lte: endDate } },
    });

    const fundPayments = todasLasDevoluciones.filter((p) => p.date >= startDate);

    // Cerrar un mes salda sus deudas: lo que quedó debiéndose ahí no se
    // arrastra ni sigue figurando cuando volvés a mirar ese mes.
    const cierres = await prisma.monthClose.findMany({
      where: { accountId },
      select: { month: true, year: true },
    });
    const mesesCerrados = new Set(cierres.map((c) => periodIndex(c.month, c.year)));
    const mesCerrado = (fecha: Date) => {
      const suMes = getCurrentFinancialMonth(fecha);
      return mesesCerrados.has(periodIndex(suMes.month, suMes.year));
    };

    const gastosPendientes = gastosQueGeneranDeuda.filter((e) => !mesCerrado(e.date));
    const devoluciones = todasLasDevoluciones.filter((p) => !mesCerrado(p.date));
    const esteMesEstaCerrado = mesesCerrados.has(periodIndex(month, year));

    const totalSharedExpenses = sharedExpenses.reduce((sum, exp) => sum + exp.amount, 0);

    const mappedPayments = fundPayments.map(p => ({
      id: p.id,
      amount: p.amount,
      profileId: p.profileId,
      profileName: account.profiles.find(x => x.id === p.profileId)?.name || '',
      date: p.date
    }));

    const esDeEsteMes = (fecha: Date) => fecha >= startDate && fecha <= endDate;

    if (account.splitMode === 'FONDO_COMUN') {
      const acumulado = new Map<
        string,
        { profileName: string; profileAvatar: string | null; total: number; deEsteMes: number }
      >();

      gastosPendientes.forEach((exp) => {
        const fila = acumulado.get(exp.profileId) ?? {
          profileName: exp.profile.name,
          profileAvatar: exp.profile.avatar,
          total: 0,
          deEsteMes: 0,
        };
        fila.total += exp.amount;
        if (esDeEsteMes(exp.date)) fila.deEsteMes += exp.amount;
        acumulado.set(exp.profileId, fila);
      });

      const debts = Array.from(acumulado.entries())
        .map(([profileId, data]) => {
          const devuelto = devoluciones
            .filter((p) => p.profileId === profileId)
            .reduce((sum, p) => sum + p.amount, 0);
          const amount = Math.max(0, data.total - devuelto);
          return {
            profileId,
            profileName: data.profileName,
            profileAvatar: data.profileAvatar,
            amount,
            // Cuánto de esa deuda viene de meses anteriores, para que un número
            // que no cierra con los gastos del mes no parezca un error.
            amountFromPreviousMonths: Math.max(0, amount - data.deEsteMes),
            currency: 'ARS',
          };
        })
        .filter((d) => d.amount > 0);

      return {
        totalSharedExpenses,
        debts,
        payments: mappedPayments,
        monthClosed: esteMesEstaCerrado,
        currency: 'ARS',
      };
    } else {
      // PORCENTAJE: la deuda es de persona a persona, pero también acumulada.
      const saldoDeA = (gastos: typeof gastosPendientes) =>
        gastos.reduce((saldo, exp) => {
          const payer = exp.profileId;
          const payerPercent =
            exp.splitPercentage ??
            (payer === profileA.id ? account.splitPercentA : account.splitPercentB);
          const owedAmount = (exp.amount * (100 - payerPercent)) / 100;
          return payer === profileA.id ? saldo + owedAmount : saldo - owedAmount;
        }, 0);

      const devueltoA = devoluciones
        .filter((p) => p.profileId === profileA.id)
        .reduce((sum, p) => sum + p.amount, 0);
      const devueltoB = devoluciones
        .filter((p) => p.profileId === profileB.id)
        .reduce((sum, p) => sum + p.amount, 0);

      const balanceA = saldoDeA(gastosPendientes) - devueltoA + devueltoB;
      const generadoEsteMes = saldoDeA(
        gastosPendientes.filter((exp) => esDeEsteMes(exp.date))
      );

      const debts = [];
      if (balanceA > 0) {
        // B le debe a A
        debts.push({
          profileId: profileA.id,
          profileName: profileA.name,
          profileAvatar: profileA.avatar,
          debtorName: profileB.name,
          amount: balanceA,
          amountFromPreviousMonths: Math.max(0, balanceA - Math.max(0, generadoEsteMes)),
          currency: 'ARS',
        });
      } else if (balanceA < 0) {
        // A le debe a B
        debts.push({
          profileId: profileB.id,
          profileName: profileB.name,
          profileAvatar: profileB.avatar,
          debtorName: profileA.name,
          amount: Math.abs(balanceA),
          amountFromPreviousMonths: Math.max(
            0,
            Math.abs(balanceA) - Math.max(0, -generadoEsteMes)
          ),
          currency: 'ARS',
        });
      }
      return {
        totalSharedExpenses,
        debts,
        payments: mappedPayments,
        monthClosed: esteMesEstaCerrado,
        currency: 'ARS',
      };
    }
  } catch (error) {
    console.error('Error fetching shared fund stats:', error);
    return { totalSharedExpenses: 0, debts: [], payments: [], monthClosed: false, currency: 'ARS' };
  }
}

export async function getUserExpenseBreakdown(month: number, year: number): Promise<import('@/types').UserExpenseBreakdown[]> {
  try {
    const { startDate, endDate } = getFinancialMonthRange(month, year);
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    const expenses = await prisma.expense.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        profile: { accountId },
        currency: MONEDA_BASE,
        category: categoriaDeConsumo,
      },
      include: { profile: true },
    });

    const breakdownMap = new Map<string, { total: number; color: string }>();
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    expenses.forEach((exp) => {
      let key = '';
      let color = '';
      
      if (exp.type === 'COMPARTIDO') {
        key = 'Compartido';
        color = '#8b5cf6'; // violeta
      } else {
        key = `Propios ${exp.profile.name}`;
        color = exp.profile.name === 'Juan' ? '#3b82f6' : (exp.profile.name === 'Tania' ? '#ec4899' : '#14b8a6');
      }

      const existing = breakdownMap.get(key) || { total: 0, color };
      existing.total += exp.amount;
      breakdownMap.set(key, existing);
    });

    return Array.from(breakdownMap.entries()).map(([name, data]) => ({
      name,
      total: data.total,
      percentage: totalExpenses > 0 ? (data.total / totalExpenses) * 100 : 0,
      color: data.color,
    }));

  } catch (error) {
    console.error('Error fetching user breakdown:', error);
    return [];
  }
}

export async function getCategoryBudgetStatuses(month: number, year: number): Promise<import('@/types').CategoryBudgetStatus[]> {
  try {
    const { startDate, endDate } = getFinancialMonthRange(month, year);
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    const budgets = await prisma.categoryBudget.findMany({
      where: { accountId, month, year },
      include: { category: true },
    });

    const expenses = await prisma.expense.groupBy({
      by: ['categoryId'],
      where: {
        date: { gte: startDate, lte: endDate },
        profile: { accountId },
        currency: MONEDA_BASE,
      },
      _sum: { amount: true },
    });

    const spentMap = new Map(expenses.map(e => [e.categoryId, e._sum.amount || 0]));

    return budgets.map(b => {
      const spent = spentMap.get(b.categoryId) || 0;
      return {
        categoryId: b.categoryId,
        categoryName: b.category.name,
        categoryIcon: b.category.icon,
        categoryColor: b.category.color,
        budget: b.amount,
        spent,
        percentage: b.amount > 0 ? (spent / b.amount) * 100 : 0,
      };
    }).sort((a, b) => b.percentage - a.percentage); // Ordenar por mayor porcentaje consumido

  } catch (error) {
    console.error('Error fetching category budgets:', error);
    return [];
  }
}
