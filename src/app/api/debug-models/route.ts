export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { estadoModelos } from '@/lib/groqModels';
import { estadoVision } from '@/lib/geminiVision';
import { getAccountId } from '@/lib/session';

/**
 * Estado de los modelos: cuál usa el bot para texto (Groq) y cuál para leer
 * fotos (Gemini), cuáles quedan de respaldo y la lista completa de la cuenta.
 * Sirve para saber qué pasó cuando dan de baja un modelo.
 */
export async function GET() {
  try {
    const accountId = await getAccountId();
    if (!accountId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const [groq, gemini] = await Promise.all([estadoModelos(), estadoVision()]);
    return NextResponse.json({ groq, gemini });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error consultando Groq' }, { status: 500 });
  }
}
