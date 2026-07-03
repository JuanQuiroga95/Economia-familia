const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  const incomes = await client.query(`SELECT currency, sum(amount) FROM "Income" GROUP BY currency`);
  console.log('Incomes totals:', incomes.rows);

  const expenses = await client.query(`SELECT currency, sum(amount) FROM "Expense" GROUP BY currency`);
  console.log('Expenses totals:', expenses.rows);

  await client.end();
}
check().catch(console.error);
