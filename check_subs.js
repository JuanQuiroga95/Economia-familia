const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function main() {
  const client = await pool.connect();
  try {
    // Check all push subscriptions with their profile names
    const result = await client.query(`
      SELECT 
        ps.id,
        ps.endpoint,
        ps."profileId",
        p.name as profile_name,
        ps."createdAt"
      FROM "PushSubscription" ps
      JOIN "Profile" p ON p.id = ps."profileId"
      ORDER BY p.name
    `);
    
    console.log(`\n=== PUSH SUBSCRIPTIONS (${result.rows.length} total) ===\n`);
    result.rows.forEach(row => {
      console.log(`Profile: ${row.profile_name} (${row.profileId})`);
      console.log(`Endpoint: ${row.endpoint.substring(0, 80)}...`);
      console.log(`Created: ${row.createdAt}`);
      console.log('---');
    });

    // Check profiles
    const profiles = await client.query(`
      SELECT id, name, "accountId" FROM "Profile" 
      WHERE "accountId" = 'cmr1mfunb00004uj152hwz69w'
      ORDER BY name
    `);
    console.log('\n=== PROFILES (Juan & Tania) ===\n');
    profiles.rows.forEach(row => {
      const subs = result.rows.filter(s => s.profileId === row.id);
      console.log(`${row.name} (${row.id}): ${subs.length} subscription(s)`);
    });

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
