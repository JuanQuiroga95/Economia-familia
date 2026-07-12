import { NextResponse } from 'next/server';
import { getAccountId } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const accountId = await getAccountId();

    if (!accountId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    console.log('[PUSH-SUBSCRIBE] Received body keys:', Object.keys(body));

    // The client sends: { endpoint, expirationTime, keys: { p256dh, auth }, profileId }
    const endpoint = body.endpoint;
    const p256dh = body.keys?.p256dh;
    const auth = body.keys?.auth;
    const profileId = body.profileId;

    if (!endpoint || !p256dh || !auth) {
      console.error('[PUSH-SUBSCRIBE] Missing fields:', { endpoint: !!endpoint, p256dh: !!p256dh, auth: !!auth });
      return NextResponse.json({ error: 'Invalid subscription: missing endpoint or keys' }, { status: 400 });
    }

    // Determine profileId: use provided one, or fallback to first profile
    let targetProfileId = profileId;
    if (!targetProfileId) {
      const profiles = await prisma.profile.findMany({ where: { accountId } });
      if (profiles.length === 0) {
        return NextResponse.json({ error: 'No profiles found for account' }, { status: 400 });
      }
      targetProfileId = profiles[0].id;
      console.log('[PUSH-SUBSCRIBE] No profileId sent, defaulting to:', targetProfileId);
    }

    // Verify the profile belongs to this account
    const profile = await prisma.profile.findFirst({
      where: { id: targetProfileId, accountId },
    });
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found in this account' }, { status: 400 });
    }

    // Upsert: if same endpoint exists, update it (maybe profile changed)
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh, auth, profileId: targetProfileId },
      update: { p256dh, auth, profileId: targetProfileId },
    });

    console.log(`[PUSH-SUBSCRIBE] Saved subscription for profile ${profile.name} (${targetProfileId})`);
    return NextResponse.json({ success: true, profileName: profile.name }, { status: 201 });
  } catch (error) {
    console.error('[PUSH-SUBSCRIBE] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
