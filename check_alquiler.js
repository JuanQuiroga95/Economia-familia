const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  const res = await client.query(`SELECT amount, date, description, type FROM "Expense" WHERE description ILIKE '%alquiler%'`);
  console.log('Expenses:', res.rows);

  await client.end();
}

check().catch(console.error);
