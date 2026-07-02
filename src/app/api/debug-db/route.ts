import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const accounts = await prisma.account.findMany({
      include: { profiles: true }
    });
    
    const investments = await prisma.investment.findMany({
      include: { profile: true }
    });

    const savings = await prisma.savingsGoal.findMany({
      include: { account: true }
    });

    return NextResponse.json({
      accounts,
      investments,
      savings
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
