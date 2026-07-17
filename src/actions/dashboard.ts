'use server';

import { prisma } from '@/lib/prisma';
import type { BudgetStatus, CategoryBreakdown, SharedFundStats } from '@/types';
import { getFinancialMonthRange, getArgDate, getCurrentFinancialMonth } from '@/lib/dateUtils';

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
      where: { ...whereBase, currency: 'ARS' },
      _sum: { amount: true },
    });

    let totalExpenses = 0;

    const expenseWhereBase = {
      ...whereBase,
      currency: 'ARS',
      category: { name: { notIn: ['Ahorro / Inversión', 'Ahorros'] } },
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
      if (tx.savingsGoal.currency === 'ARS') {
        if (tx.type === 'DEPOSITO') savingsDeposits += tx.amount;
        if (tx.type === 'RETIRO') savingsWithdrawals += tx.amount;
      }
    });

    // Investments created this month
    const newInvestments = await prisma.investment.findMany({
      where: {
        startDate: { gte: startDate, lte: endDate },
        profile: { accountId },
        currency: 'ARS',
        ...(profileId ? { profileId } : {}),
      },
    });
    let investmentDeposits = 0;
    newInvestments.forEach(inv => {
      investmentDeposits += inv.amount;
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
      balance: totalIncome - totalExpenses - savingsDeposits + savingsWithdrawals - investmentDeposits,
      currency: 'ARS',
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
        const incomes = await prisma.income.aggregate({
          where: { walletId: wallet.id },
          _sum: { amount: true },
        });
        const expenses = await prisma.expense.aggregate({
          where: { walletId: wallet.id },
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
        category: { name: { notIn: ['Ahorro / Inversión', 'Ahorros'] } },
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

export async function getMonthlyComparison(profileId?: string) {
  try {
    const current = getCurrentFinancialMonth(getArgDate());
    const months = [];
    const accountId = await getAccountId();
    if (!accountId) throw new Error('No account id');

    
    const currentMonth = current.month;
    const currentYear = current.year;

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
          ...(profileId ? { profileId } : {}),
        },
        _sum: { amount: true },
      });

      const expenseAgg = await prisma.expense.aggregate({
        where: {
          date: { gte: startDate, lte: endDate },
          profile: { accountId },
          category: { name: { notIn: ['Ahorro / Inversión', 'Ahorros'] } },
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

export async function getBudgetStatus(profileId: string): Promise<BudgetStatus | null> {
  try {
    const config = await prisma.budgetConfig.findUnique({
      where: { profileId },
      include: { profile: true },
    });

    if (!config || !config.isActive) return null;

    const now = getArgDate();
    const day = now.getDate();
    const year = now.getFullYear();
    const month = now.getMonth();

    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    const isFirstHalf = day >= lastDayOfMonth || day <= 15;
    const currentHalf: 1 | 2 = isFirstHalf ? 1 : 2;
    
    const budgetType = config.budgetType || 'QUINCENAL';
    const monthlyBudget = config.monthlyBudget || 0;

    const baseBudget = budgetType === 'MENSUAL' 
      ? monthlyBudget 
      : (currentHalf === 1 ? config.firstHalfBudget : config.secondHalfBudget);
      
    const budget = baseBudget + (config.extraBudget || 0);

    let startDate: Date;
    let endDate: Date;

    if (budgetType === 'MENSUAL') {
      startDate = new Date(year, month, 1);
      endDate = new Date(year, month, lastDayOfMonth, 23, 59, 59);
    } else {
      if (isFirstHalf) {
        if (day >= lastDayOfMonth) {
          startDate = new Date(year, month, lastDayOfMonth);
          endDate = new Date(year, month + 1, 15, 23, 59, 59);
        } else {
          const prevMonthLastDay = new Date(year, month, 0).getDate();
          startDate = new Date(year, month - 1, prevMonthLastDay);
          endDate = new Date(year, month, 15, 23, 59, 59);
        }
      } else {
        startDate = new Date(year, month, 16);
        endDate = new Date(year, month, lastDayOfMonth - 1, 23, 59, 59);
      }
    }

    const ownExpenses = await prisma.expense.findMany({
      where: {
        profileId,
        date: { gte: startDate, lte: endDate },
        currency: config.currency,
        type: 'PROPIO',
        category: { name: { notIn: ['Ahorro / Inversión', 'Ahorros'] } },
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
        category: { name: { notIn: ['Ahorro / Inversión', 'Ahorros'] } },
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
      return { totalSharedExpenses: 0, debts: [], payments: [], currency: 'ARS' };
    }

    const [profileA, profileB] = account.profiles.sort((a, b) => a.name.localeCompare(b.name));

    const sharedExpenses = await prisma.expense.findMany({
      where: {
        type: 'COMPARTIDO',
        date: { gte: startDate, lte: endDate },
        profile: { accountId },
      },
      include: { profile: true },
    });

    const fundPayments = await prisma.sharedFundPayment.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        accountId,
      },
    });

    const totalSharedExpenses = sharedExpenses.reduce((sum, exp) => sum + exp.amount, 0);

    const mappedPayments = fundPayments.map(p => ({
      id: p.id,
      amount: p.amount,
      profileId: p.profileId,
      profileName: account.profiles.find(x => x.id === p.profileId)?.name || '',
      date: p.date
    }));

    if (account.splitMode === 'FONDO_COMUN') {
      const debtMap = new Map<string, { profileName: string; profileAvatar: string | null; amount: number }>();
      sharedExpenses.forEach((exp) => {
        if (exp.paidFromPersonalBudget) {
          const existing = debtMap.get(exp.profileId);
          if (existing) {
            existing.amount += exp.amount;
          } else {
            debtMap.set(exp.profileId, {
              profileName: exp.profile.name,
              profileAvatar: exp.profile.avatar,
              amount: exp.amount,
            });
          }
        }
      });
      const debts = Array.from(debtMap.entries()).map(([profileId, data]) => {
        const paymentsReceived = fundPayments.filter(p => p.profileId === profileId).reduce((sum, p) => sum + p.amount, 0);
        return {
          profileId,
          profileName: data.profileName,
          profileAvatar: data.profileAvatar,
          amount: Math.max(0, data.amount - paymentsReceived),
          currency: 'ARS',
        };
      }).filter(d => d.amount > 0);
      return { totalSharedExpenses, debts, payments: mappedPayments, currency: 'ARS' };
    } else {
      // PORCENTAJE mode: person-to-person debt
      let balanceA = 0; // Positive means B owes A
      sharedExpenses.forEach((exp) => {
        if (exp.paidFromPersonalBudget) {
          const payer = exp.profileId;
          const payerPercent = exp.splitPercentage ?? (payer === profileA.id ? account.splitPercentA : account.splitPercentB);
          
          const owedAmount = exp.amount * (100 - payerPercent) / 100;
          
          if (payer === profileA.id) {
            balanceA += owedAmount;
          } else {
            balanceA -= owedAmount;
          }
        }
      });
      
      const debts = [];
      
      const paymentsToA = fundPayments.filter(p => p.profileId === profileA.id).reduce((sum, p) => sum + p.amount, 0);
      const paymentsToB = fundPayments.filter(p => p.profileId === profileB.id).reduce((sum, p) => sum + p.amount, 0);
      
      balanceA = balanceA - paymentsToA + paymentsToB; // Adjusted by payments
      
      if (balanceA > 0) {
        // B owes A
        debts.push({
          profileId: profileA.id,
          profileName: profileA.name,
          profileAvatar: profileA.avatar,
          debtorName: profileB.name,
          amount: balanceA,
          currency: 'ARS',
        });
      } else if (balanceA < 0) {
        // A owes B
        debts.push({
          profileId: profileB.id,
          profileName: profileB.name,
          profileAvatar: profileB.avatar,
          debtorName: profileA.name,
          amount: Math.abs(balanceA),
          currency: 'ARS',
        });
      }
      return { totalSharedExpenses, debts, payments: mappedPayments, currency: 'ARS' };
    }
  } catch (error) {
    console.error('Error fetching shared fund stats:', error);
    return { totalSharedExpenses: 0, debts: [], payments: [], currency: 'ARS' };
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
        category: { name: { notIn: ['Ahorro / Inversión', 'Ahorros'] } },
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
