import { NextResponse } from 'next/server';
import { getAccountId } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { sendPushNotification } from '@/lib/push';

// GET: ver las suscripciones guardadas para esta cuenta
export async function GET() {
  try {
    const accountId = await getAccountId();
    if (!accountId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profiles = await prisma.profile.findMany({
      where: { accountId },
      include: {
        pushSubscriptions: {
          select: {
            id: true,
            endpoint: true,
            profileId: true,
            createdAt: true,
          },
        },
      },
    });

    const result = profiles.map((p) => ({
      profileId: p.id,
      profileName: p.name,
      subscriptionCount: p.pushSubscriptions.length,
      subscriptions: p.pushSubscriptions.map((s) => ({
        id: s.id,
        endpoint: s.endpoint.substring(0, 80) + '...',
        createdAt: s.createdAt,
      })),
    }));

    return NextResponse.json({
      accountId,
      vapidConfigured: !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
      profiles: result,
    });
  } catch (error) {
    console.error('[PUSH-TEST] Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST: enviar una notificación de prueba a un perfil específico
export async function POST(request: Request) {
  try {
    const accountId = await getAccountId();
    if (!accountId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { profileId } = await request.json();

    if (!profileId) {
      return NextResponse.json({ error: 'profileId is required' }, { status: 400 });
    }

    // Verify profile belongs to account
    const profile = await prisma.profile.findFirst({
      where: { id: profileId, accountId },
    });

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 400 });
    }

    await sendPushNotification(
      profileId,
      '🔔 Notificación de prueba',
      `¡Hola ${profile.name}! Si ves esto, las notificaciones funcionan.`,
      '/dashboard'
    );

    return NextResponse.json({ success: true, sentTo: profile.name });
  } catch (error) {
    console.error('[PUSH-TEST] Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
