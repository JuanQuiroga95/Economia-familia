import type { Prisma } from '@prisma/client';

/**
 * De dónde sale la plata de un gasto.
 *
 * La app no convierte entre monedas: un gasto en dólares sólo puede salir de
 * algo que esté en dólares. Por eso el origen guarda también la moneda, y todo
 * lo que toca plata guardada (ahorros e inversiones) pasa por acá, así crear,
 * editar y borrar un gasto devuelven o descuentan siempre igual.
 */
export type FundingSource =
  | { kind: 'balance' }
  | { kind: 'ahorro'; id: string }
  | { kind: 'inversion'; id: string };

export const BALANCE: FundingSource = { kind: 'balance' };

/** El formulario manda "balance", "ahorro_<id>" o "inversion_<id>". */
export function parseFundingSource(valor?: string | null): FundingSource {
  if (!valor || valor === 'balance') return BALANCE;

  const separador = valor.indexOf('_');
  if (separador < 0) return BALANCE;

  const kind = valor.slice(0, separador);
  const id = valor.slice(separador + 1);
  if (!id) return BALANCE;
  if (kind === 'ahorro') return { kind: 'ahorro', id };
  if (kind === 'inversion') return { kind: 'inversion', id };
  return BALANCE;
}

/** El mismo string que entiende el formulario, para poder precargar la edición. */
export function serializeFundingSource(origen: FundingSource): string {
  return origen.kind === 'balance' ? 'balance' : `${origen.kind}_${origen.id}`;
}

export function mismoOrigen(a: FundingSource, b: FundingSource): boolean {
  return serializeFundingSource(a) === serializeFundingSource(b);
}

/** Qué le pasa a un gasto que ya está guardado: de dónde salió su plata. */
export function origenDeUnGasto(gasto: {
  savingsWithdrawal?: { savingsGoalId: string } | null;
  investmentWithdrawal?: { investmentId: string } | null;
}): FundingSource {
  if (gasto.savingsWithdrawal) return { kind: 'ahorro', id: gasto.savingsWithdrawal.savingsGoalId };
  if (gasto.investmentWithdrawal) return { kind: 'inversion', id: gasto.investmentWithdrawal.investmentId };
  return BALANCE;
}

/** Lo que hay que traer de la base para saber de dónde salió un gasto. */
export const incluirOrigen = {
  savingsWithdrawal: {
    select: {
      id: true,
      amount: true,
      savingsGoalId: true,
      savingsGoal: { select: { id: true, name: true, currency: true, currentAmount: true } },
    },
  },
  investmentWithdrawal: {
    select: {
      id: true,
      amount: true,
      investmentId: true,
      investment: { select: { id: true, name: true, currency: true, amount: true } },
    },
  },
} satisfies Prisma.ExpenseInclude;

type Tx = Prisma.TransactionClient;

type DatosDelRetiro = {
  amount: number;
  currency: string;
  profileId: string;
  description: string;
  date: Date;
  expenseId: string;
};

/**
 * Descuenta el monto del ahorro o la inversión elegida y deja el movimiento
 * atado al gasto. Devuelve un error legible en vez de tirar: el llamador corta
 * la transacción y el gasto no se guarda.
 */
export async function descontarDelOrigen(
  tx: Tx,
  origen: FundingSource,
  accountId: string,
  datos: DatosDelRetiro
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (origen.kind === 'balance') return { ok: true };

  if (origen.kind === 'ahorro') {
    const meta = await tx.savingsGoal.findFirst({ where: { id: origen.id, accountId } });
    if (!meta) return { ok: false, error: 'Meta de ahorro no encontrada' };
    if (meta.currency !== datos.currency) {
      return {
        ok: false,
        error: `"${meta.name}" está en ${meta.currency} y el gasto en ${datos.currency}`,
      };
    }
    if (meta.currentAmount < datos.amount) {
      return {
        ok: false,
        error: `No alcanza: "${meta.name}" tiene ${meta.currentAmount.toLocaleString('es-AR')} ${meta.currency} y el gasto es de ${datos.amount.toLocaleString('es-AR')}`,
      };
    }

    await tx.savingsTransaction.create({
      data: {
        amount: datos.amount,
        type: 'RETIRO',
        description: `Gasto: ${datos.description}`,
        savingsGoalId: origen.id,
        profileId: datos.profileId,
        date: datos.date,
        expenseId: datos.expenseId,
      },
    });
    await tx.savingsGoal.update({
      where: { id: origen.id },
      data: { currentAmount: meta.currentAmount - datos.amount },
    });
    return { ok: true };
  }

  const inversion = await tx.investment.findFirst({
    where: { id: origen.id, profile: { accountId } },
  });
  if (!inversion) return { ok: false, error: 'Inversión no encontrada' };
  if (inversion.currency !== datos.currency) {
    return {
      ok: false,
      error: `"${inversion.name}" está en ${inversion.currency} y el gasto en ${datos.currency}`,
    };
  }
  if (inversion.amount < datos.amount) {
    return {
      ok: false,
      error: `No alcanza: "${inversion.name}" tiene ${inversion.amount.toLocaleString('es-AR')} ${inversion.currency} y el gasto es de ${datos.amount.toLocaleString('es-AR')}`,
    };
  }

  await tx.investmentTransaction.create({
    data: {
      amount: datos.amount,
      type: 'RETIRO',
      description: `Gasto: ${datos.description}`,
      investmentId: origen.id,
      profileId: datos.profileId,
      date: datos.date,
      expenseId: datos.expenseId,
    },
  });
  await tx.investment.update({
    where: { id: origen.id },
    data: { amount: inversion.amount - datos.amount },
  });
  return { ok: true };
}

/**
 * Le devuelve al ahorro (o a la inversión) la plata de un gasto y borra el
 * movimiento. Se usa al borrar el gasto y al cambiarle el origen o el monto.
 */
export async function devolverAlOrigen(
  tx: Tx,
  gasto: {
    savingsWithdrawal?: { id: string; amount: number; savingsGoalId: string } | null;
    investmentWithdrawal?: { id: string; amount: number; investmentId: string } | null;
  }
): Promise<void> {
  if (gasto.savingsWithdrawal) {
    const retiro = gasto.savingsWithdrawal;
    await tx.savingsTransaction.delete({ where: { id: retiro.id } });
    await tx.savingsGoal.update({
      where: { id: retiro.savingsGoalId },
      data: { currentAmount: { increment: retiro.amount } },
    });
  }
  if (gasto.investmentWithdrawal) {
    const retiro = gasto.investmentWithdrawal;
    await tx.investmentTransaction.delete({ where: { id: retiro.id } });
    await tx.investment.update({
      where: { id: retiro.investmentId },
      data: { amount: { increment: retiro.amount } },
    });
  }
}
