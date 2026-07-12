const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  const res = await client.query(`SELECT type, amount, date, "createdAt" FROM "SavingsTransaction"`);
  console.log('Savings Txs:', res.rows);

  const res2 = await client.query(`SELECT id, amount, "startDate", "createdAt" FROM "Investment"`);
  console.log('Invs:', res2.rows);

  await client.end();
}

check().catch(console.error);
