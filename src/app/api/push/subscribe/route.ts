import { NextResponse } from 'next/server';
import { getAccountId } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const accountId = await getAccountId();
    
    if (!accountId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get profiles for this account
    const profiles = await prisma.profile.findMany({
      where: { accountId }
    });
    
    if (profiles.length === 0) {
      return NextResponse.json({ error: 'No profile found' }, { status: 400 });
    }
    
    // We'll associate the subscription with the first profile or a specific one if provided
    // Ideally the client sends their selected profileId in the body if they have multiple
    const subscription = await request.json();
    const profileId = subscription.profileId || profiles[0].id;

    if (!subscription.endpoint || !subscription.keys) {
      return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 });
    }

    const { endpoint, keys: { p256dh, auth } } = subscription;

    // Upsert subscription
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        endpoint,
        p256dh,
        auth,
        profileId,
      },
      update: {
        p256dh,
        auth,
        profileId,
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('Error saving subscription:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
