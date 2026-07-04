const { Client } = require('pg');

async function fix() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  // Move investments to June 30
  const invs = await client.query(`
    UPDATE "Investment" 
    SET "startDate" = '2026-06-30T12:00:00Z', "createdAt" = '2026-06-30T12:00:00Z'
    WHERE "startDate" >= '2026-07-01'
  `);
  console.log(`Moved ${invs.rowCount} investments to June 30.`);

  // Move savings transactions to June 30
  const savs = await client.query(`
    UPDATE "SavingsTransaction" 
    SET "date" = '2026-06-30T12:00:00Z', "createdAt" = '2026-06-30T12:00:00Z'
    WHERE "createdAt" >= '2026-07-01'
  `);
  console.log(`Moved ${savs.rowCount} savings txs to June 30.`);

  await client.end();
}

fix().catch(console.error);
