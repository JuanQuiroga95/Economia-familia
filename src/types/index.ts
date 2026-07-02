export type Currency = 'ARS' | 'USD' | 'EUR';

export type ProfileName = 'Juan' | 'Tania';

export interface ProfileData {
  id: string;
  name: string;
  avatar: string | null;
}

export interface MonthlyStats {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  currency: Currency;
}

export interface CategoryBreakdown {
  category: string;
  icon: string;
  color: string;
  total: number;
  percentage: number;
}

export interface UserExpenseBreakdown {
  name: string; // Ej: 'Juan', 'Tania', 'Compartido'
  total: number;
  percentage: number;
  color: string;
}

export interface CategoryBudgetStatus {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  budget: number;
  spent: number;
  percentage: number;
}

export interface BudgetStatus {
  profileId: string;
  profileName: string;
  currentHalf: 1 | 2;
  budget: number;
  spent: number;
  remaining: number;
  percentage: number;
  currency: string;
}

export interface MonthYearFilter {
  month: number;
  year: number;
}

export interface TransactionFilters {
  month?: number;
  year?: number;
  profileId?: string;
  categoryId?: string;
  type?: 'PROPIO' | 'COMPARTIDO';
}

export interface IncomeFormData {
  amount: number;
  currency: Currency;
  date: string;
  description: string;
  profileId: string;
}

export interface ExpenseFormData {
  amount: number;
  currency: Currency;
  date: string;
  description: string;
  categoryId: string;
  profileId: string;
  type: 'PROPIO' | 'COMPARTIDO';
  paidFromPersonalBudget: boolean;
  receiptUrl?: string;
  fundingSource?: string;
  splitPercentage?: number;
}

export interface SavingsGoalFormData {
  name: string;
  targetAmount: number;
  initialAmount?: number;
  currency: Currency;
  monthsToAchieve?: number | null;
  monthlySplits?: Record<string, number> | null;
}

export interface InvestmentFormData {
  name: string;
  type: 'PLAZO_FIJO' | 'FCI' | 'ACCIONES' | 'CRYPTO' | 'BONOS' | 'OTRO';
  amount: number;
  currency: Currency;
  returnRate?: number;
  startDate: string;
  endDate?: string;
  notes?: string;
  profileId: string;
}

export interface ExchangeRateData {
  month: number;
  year: number;
  usdToArs: number;
  eurToArs: number;
  eurToUsd: number;
}

export interface SharedFundDebt {
  profileId: string;
  profileName: string;
  profileAvatar: string | null;
  debtorName?: string;
  amount: number;
  currency: string;
}

export interface SharedFundStats {
  totalSharedExpenses: number;
  debts: SharedFundDebt[];
  currency: string;
}
