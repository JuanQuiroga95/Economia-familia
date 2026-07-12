import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    // Verify internal secret to prevent abuse
    const body = await request.json();
    const { profileId, title, body: notifBody, url, secret } = body;

    if (secret !== process.env.VAPID_PRIVATE_KEY) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!profileId || !title || !notifBody) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    if (!publicKey || !privateKey) {
      return NextResponse.json({ error: 'VAPID not configured' }, { status: 500 });
    }

    const webpush = await import('web-push');
    webpush.setVapidDetails('mailto:econoapp@example.com', publicKey, privateKey);

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { profileId },
    });

    console.log(`[PUSH-SEND] ${subscriptions.length} sub(s) for profile ${profileId}`);

    const payload = JSON.stringify({ title, body: notifBody, url: url || '/' });
    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload
        );
        sent++;
        console.log(`[PUSH-SEND] Sent OK to ${sub.endpoint.substring(0, 50)}...`);
      } catch (error: any) {
        failed++;
        console.error(`[PUSH-SEND] Error:`, error?.statusCode, error?.body || error?.message);
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    }

    return NextResponse.json({ sent, failed, total: subscriptions.length });
  } catch (error) {
    console.error('[PUSH-SEND] Fatal:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
