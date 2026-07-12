const webpush = require('web-push');
const { Pool } = require('pg');

const VAPID_PUBLIC = 'BDWqlPPlBSTE1a74T33nYpZxqs1LhX6hd649LfTLuqQiSivy5CmB_YnymYNzH1-0BVImlPg-gVva_pQNcPUKnKY';
const VAPID_PRIVATE = 'mkYYh1zKLs9OjdWFp1SAAH-3h7dsBC0myQ3RVFRd2NI';

webpush.setVapidDetails('mailto:econoapp@example.com', VAPID_PUBLIC, VAPID_PRIVATE);

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function main() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT ps.*, p.name as profile_name
      FROM "PushSubscription" ps
      JOIN "Profile" p ON p.id = ps."profileId"
      WHERE p.name = 'Juan'
    `);

    if (result.rows.length === 0) {
      console.log('No subscription found for Juan');
      return;
    }

    const sub = result.rows[0];
    console.log(`Sending test notification to ${sub.profile_name}...`);

    const payload = JSON.stringify({
      title: '🧪 Test directo a Juan',
      body: 'Si ves esto, el push a Juan también funciona.',
      url: '/dashboard'
    });

    try {
      const response = await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      );
      console.log('SUCCESS! Status:', response.statusCode);
    } catch (error) {
      console.error('FAILED! Status:', error.statusCode);
      console.error('Body:', error.body);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
