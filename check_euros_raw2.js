const { Client } = require('pg');

async function fix() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  const invs = await client.query(`SELECT * FROM "Investment" WHERE currency = 'EUR'`);
  console.log('Investments EUR:', invs.rows);

  const goals = await client.query(`SELECT * FROM "SavingsGoal" WHERE currency = 'EUR'`);
  console.log('SavingsGoals EUR:', goals.rows);

  await client.end();
}
fix().catch(console.error);
