const { Client } = require('pg');

async function fix() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  const txsRes = await client.query(`
    SELECT t.id, t.amount, t."profileId", t."savingsGoalId", t."createdAt", g.currency as "goalCurrency", g."currentAmount"
    FROM "SavingsTransaction" t
    JOIN "SavingsGoal" g ON t."savingsGoalId" = g.id
    WHERE t.description = 'Distribución de sobrante del mes'
  `);

  console.log('Surplus txs:', txsRes.rows);

  const expRes = await client.query(`
    SELECT id, amount, currency, "createdAt", description
    FROM "Expense"
    WHERE description = 'Distribución de sobrante'
  `);
  console.log('Surplus expenses:', expRes.rows);

  await client.end();
}

fix().catch(console.error);
