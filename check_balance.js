const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  const incomes = await client.query(`SELECT sum(amount) FROM "Income"`);
  console.log('Total Incomes:', incomes.rows[0].sum);

  const expenses = await client.query(`SELECT sum(amount) FROM "Expense"`);
  console.log('Total Expenses:', expenses.rows[0].sum);

  const svDeps = await client.query(`SELECT sum(amount) FROM "SavingsTransaction" WHERE type = 'DEPOSITO'`);
  console.log('Total Savings Deposits:', svDeps.rows[0].sum);

  const svWds = await client.query(`SELECT sum(amount) FROM "SavingsTransaction" WHERE type = 'RETIRO'`);
  console.log('Total Savings Withdrawals:', svWds.rows[0].sum);

  const invs = await client.query(`SELECT sum(amount) FROM "Investment"`);
  console.log('Total Investments:', invs.rows[0].sum);

  await client.end();
}

check().catch(console.error);
