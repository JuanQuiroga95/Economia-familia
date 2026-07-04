const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  const euIn = await client.query(`SELECT * FROM "Income" WHERE currency = 'EUR'`);
  console.log('Euro Incomes:', euIn.rows);

  const euEx = await client.query(`SELECT * FROM "Expense" WHERE currency = 'EUR'`);
  console.log('Euro Expenses:', euEx.rows);

  const euSav = await client.query(`
    SELECT t.*, g.name, g.currency FROM "SavingsTransaction" t
    JOIN "SavingsGoal" g ON t."savingsGoalId" = g.id
    WHERE g.currency = 'EUR'
  `);
  console.log('Euro Savings Tx:', euSav.rows);
  
  const euSavGoals = await client.query(`
    SELECT * FROM "SavingsGoal" WHERE currency = 'EUR'
  `);
  console.log('Euro Savings Goals:', euSavGoals.rows);

  await client.end();
}

check().catch(console.error);
