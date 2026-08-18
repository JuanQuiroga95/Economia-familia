import { NextResponse } from 'next/server';
import { Groq } from 'groq-sdk';

// Lista todos los modelos disponibles en la cuenta de Groq.
// Sin filtro: Groq da de baja modelos seguido y necesitamos ver la lista real para elegir.
export async function GET() {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const models = await groq.models.list();
  return NextResponse.json(models.data.map((m) => m.id).sort());
}
