const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  const acc = await client.query(`SELECT id FROM "Account" LIMIT 1`);
  const accountId = acc.rows[0].id;

  const profiles = await client.query(`SELECT * FROM "Profile" WHERE "accountId" = $1`, [accountId]);
  console.log('Profiles:', profiles.rows);

  await client.end();
}

check().catch(console.error);
