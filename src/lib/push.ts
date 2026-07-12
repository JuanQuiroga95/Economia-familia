'use server';

export async function sendPushNotification(
  profileId: string,
  title: string,
  body: string,
  url?: string
) {
  try {
    const secret = process.env.VAPID_PRIVATE_KEY;
    if (!secret) {
      console.log('[PUSH] No VAPID_PRIVATE_KEY, skipping notification');
      return;
    }

    // Determine the base URL for internal API calls
    // VERCEL_URL is set automatically by Vercel (without https://)
    // VERCEL_PROJECT_PRODUCTION_URL is the stable production URL
    const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL 
      || process.env.VERCEL_URL;
    const baseUrl = vercelUrl
      ? `https://${vercelUrl}`
      : process.env.NEXTAUTH_URL || 'http://localhost:3000';

    console.log(`[PUSH] Sending to profile ${profileId} via ${baseUrl}/api/push/send`);

    const res = await fetch(`${baseUrl}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, title, body, url, secret }),
    });

    const data = await res.json();
    console.log(`[PUSH] Result:`, data);
  } catch (error) {
    console.error('[PUSH] Error calling send API:', error);
  }
}
