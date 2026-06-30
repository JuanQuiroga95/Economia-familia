import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const profiles = await prisma.profile.findMany({
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
