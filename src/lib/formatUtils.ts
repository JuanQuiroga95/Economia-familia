export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('es-AR').format(amount);
};
