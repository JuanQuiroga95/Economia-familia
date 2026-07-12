import webpush from 'web-push';
import { prisma } from './prisma';

const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;

if (publicVapidKey && privateVapidKey) {
  webpush.setVapidDetails(
    'mailto:test@example.com',
    publicVapidKey,
    privateVapidKey
  );
}

export async function sendPushNotification(profileId: string, title: string, body: string, url?: string) {
  if (!publicVapidKey || !privateVapidKey) {
    console.log('VAPID keys not set, skipping push notification');
    return;
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { profileId }
  });

  const payload = JSON.stringify({
    title,
    body,
    url: url || '/'
  });

  const sendPromises = subscriptions.map(async (sub) => {
    try {
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
    } catch (error: any) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        // Subscription has expired or is no longer valid
        console.log('Subscription expired, removing from DB');
        await prisma.pushSubscription.delete({
          where: { id: sub.id }
        });
      } else {
        console.error('Error sending push notification:', error);
      }
    }
  });

  await Promise.all(sendPromises);
}
