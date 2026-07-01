import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAccountId } from '@/lib/session';

export async function GET() {
  try {
    const accountId = await getAccountId();
    
    if (!accountId) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    const profiles = await prisma.profile.findMany({
      where: { accountId },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(profiles);
  } catch (error) {
    console.error('Error fetching profiles:', error);
    return NextResponse.json(
      { error: 'Error al obtener perfiles' },
      { status: 500 }
    );
  }
}
