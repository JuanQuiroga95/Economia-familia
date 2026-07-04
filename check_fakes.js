const { Client } = require('pg');

async function fix() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  const incs = await client.query(`SELECT description FROM "Income" WHERE description LIKE '%etiro%'`);
  console.log('Incomes with "retiro":', incs.rows);

  await client.end();
}

fix().catch(console.error);
