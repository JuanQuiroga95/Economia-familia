const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  const goals = await client.query(`SELECT currency, sum("currentAmount") FROM "SavingsGoal" GROUP BY currency`);
  console.log('Goals totals:', goals.rows);

  const invs = await client.query(`SELECT currency, sum(amount) FROM "Investment" GROUP BY currency`);
  console.log('Invs totals:', invs.rows);

  await client.end();
}
check().catch(console.error);
