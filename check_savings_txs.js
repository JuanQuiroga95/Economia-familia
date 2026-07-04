const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  const txs = await client.query(`
    SELECT t.amount, t.type, t."createdAt", g.name, g.currency 
    FROM "SavingsTransaction" t
    JOIN "SavingsGoal" g ON t."savingsGoalId" = g.id
    WHERE t."createdAt" >= '2026-07-01'
  `);
  console.log('Savings Txs in July:', txs.rows);

  await client.end();
}

check().catch(console.error);
