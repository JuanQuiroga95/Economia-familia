const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  const acc = await client.query(`SELECT id FROM "Account" LIMIT 1`);
  const accountId = acc.rows[0].id;
  
  const profiles = await client.query(`SELECT id FROM "Profile" WHERE "accountId" = $1`, [accountId]);
  const profileIds = profiles.rows.map(p => `'${p.id}'`).join(',');

  const startDate = new Date(2026, 6, 1).toISOString(); // July 1st, 2026
  const endDate = new Date(2026, 7, 0, 23, 59, 59).toISOString();

  console.log('Period:', startDate, 'to', endDate);

  const inc = await client.query(`SELECT sum(amount) FROM "Income" WHERE date >= $1 AND date <= $2 AND currency='ARS' AND "profileId" IN (${profileIds})`);
  const exp = await client.query(`SELECT sum(amount) FROM "Expense" WHERE date >= $1 AND date <= $2 AND currency='ARS' AND "profileId" IN (${profileIds})`);
  
  const savDep = await client.query(`SELECT sum(t.amount) FROM "SavingsTransaction" t JOIN "SavingsGoal" g ON t."savingsGoalId"=g.id WHERE t."createdAt" >= $1 AND t."createdAt" <= $2 AND t.type='DEPOSITO' AND g.currency='ARS' AND g."accountId"=$3`, [startDate, endDate, accountId]);
  
  const invs = await client.query(`SELECT sum(amount) FROM "Investment" WHERE "startDate" >= $1 AND "startDate" <= $2 AND currency='ARS' AND "profileId" IN (${profileIds})`);

  console.log('Income:', inc.rows[0].sum);
  console.log('Expense:', exp.rows[0].sum);
  console.log('SavDep:', savDep.rows[0].sum);
  console.log('Invs:', invs.rows[0].sum);

  await client.end();
}

check().catch(console.error);
