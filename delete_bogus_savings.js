const { Client } = require('pg');

async function fix() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  // Delete the test deposits and withdrawals from July 5th
  const res = await client.query(`
    DELETE FROM "SavingsTransaction"
    WHERE "createdAt" >= '2026-07-04T00:00:00Z'
  `);
  
  console.log(`Deleted ${res.rowCount} recent bogus savings transactions.`);

  await client.end();
}

fix().catch(console.error);
