const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  const acc = await client.query(`SELECT id FROM "Account" LIMIT 1`);
  const accountId = acc.rows[0].id;

  await client.query(`
    INSERT INTO "SavingsGoal" (id, name, "targetAmount", "currentAmount", currency, "accountId", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, 'Ahorros EUR', 0, 18, 'EUR', $1, now(), now())
  `, [accountId]);
  console.log('18 EUR restored to Ahorros EUR');

  await client.end();
}

check().catch(console.error);
