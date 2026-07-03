const { Client } = require('pg');

async function fix() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  const incomes = await client.query(`SELECT * FROM "Income" WHERE currency = 'EUR'`);
  console.log('Incomes EUR:', incomes.rows);

  const expenses = await client.query(`SELECT * FROM "Expense" WHERE currency = 'EUR'`);
  console.log('Expenses EUR:', expenses.rows);

  await client.end();
}
fix().catch(console.error);
