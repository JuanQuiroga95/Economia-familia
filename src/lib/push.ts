'use server';

import { prisma } from './prisma';

let webpushModule: typeof import('web-push') | null = null;
let vapidConfigured = false;

async function getWebPush() {
  if (!webpushModule) {
    webpushModule = await import('web-push');
  }
  if (!vapidConfigured) {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (publicKey && privateKey) {
      webpushModule.setVapidDetails(
        'mailto:econoapp@example.com',
        publicKey,
        privateKey
      );
      vapidConfigured = true;
    }
  }
  return webpushModule;
}

export async function sendPushNotification(
  profileId: string,
  title: string,
  body: string,
  url?: string
) {
  try {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    if (!publicKey || !privateKey) {
      console.log('[PUSH] VAPID keys not configured, skipping');
      return;
    }

    const webpush = await getWebPush();

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { profileId },
    });

    console.log(`[PUSH] Found ${subscriptions.length} subscription(s) for profile ${profileId}`);

    if (subscriptions.length === 0) {
      console.log('[PUSH] No subscriptions found, nothing to send');
      return;
    }

    const payload = JSON.stringify({ title, body, url: url || '/' });

    for (const sub of subscriptions) {
      try {
        console.log(`[PUSH] Sending to endpoint: ${sub.endpoint.substring(0, 60)}...`);
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload
        );
        console.log('[PUSH] Sent successfully!');
      } catch (error: any) {
        console.error(`[PUSH] Error sending:`, error?.statusCode, error?.body || error?.message);
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          console.log('[PUSH] Subscription expired, removing...');
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    }
  } catch (error) {
    console.error('[PUSH] Fatal error in sendPushNotification:', error);
  }
}
