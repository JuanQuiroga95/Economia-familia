export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { estadoModelos } from '@/lib/groqModels';
import { getAccountId } from '@/lib/session';

/**
 * Estado de los modelos de Groq: cuál está usando el bot, cuáles quedan de
 * respaldo y la lista completa de la cuenta. Sirve para saber qué pasó cuando
 * Groq da de baja un modelo.
 */
export async function GET() {
  try {
    const accountId = await getAccountId();
    if (!accountId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    return NextResponse.json(await estadoModelos());
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error consultando Groq' }, { status: 500 });
  }
}
