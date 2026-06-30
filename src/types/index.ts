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
  splitPercent: number;
  receiptUrl?: string;
}

export interface SavingsGoalFormData {
  name: string;
  targetAmount: number;
  currency: Currency;
  profileId: string;
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
