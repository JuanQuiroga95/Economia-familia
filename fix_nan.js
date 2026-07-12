const { Client } = require('pg');
async function run() {
  const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require' });
  await client.connect();
  const res = await client.query(`SELECT count(*) FROM "Expense" WHERE "splitPercentage" = 'NaN'`);
  console.log('NaN count:', res.rows[0].count);
  const fix = await client.query(`UPDATE "Expense" SET "splitPercentage" = NULL WHERE "splitPercentage" = 'NaN'`);
  console.log('Fixed:', fix.rowCount);
  await client.end();
}
run().catch(console.error);
