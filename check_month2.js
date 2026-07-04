const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  const startDate = new Date(2026, 6, 1).toISOString(); // July 1st, 2026
  const endDate = new Date(2026, 7, 0, 23, 59, 59).toISOString();

  const inc = await client.query(`SELECT currency, sum(amount) FROM "Income" WHERE date >= $1 AND date <= $2 GROUP BY currency`, [startDate, endDate]);
  const exp = await client.query(`SELECT currency, sum(amount) FROM "Expense" WHERE date >= $1 AND date <= $2 GROUP BY currency`, [startDate, endDate]);
  
  console.log('Income:', inc.rows);
  console.log('Expense:', exp.rows);
  
  // Investments created this month
  const invs = await client.query(`SELECT currency, sum(amount) FROM "Investment" WHERE "startDate" >= $1 AND "startDate" <= $2 GROUP BY currency`, [startDate, endDate]);
  console.log('Invs:', invs.rows);

  await client.end();
}

check().catch(console.error);
