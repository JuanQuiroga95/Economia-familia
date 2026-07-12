const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  const acc = await client.query(`SELECT id FROM "Account" LIMIT 1`);
  const accountId = acc.rows[0].id;

  const startDate = new Date(2026, 6, 1).toISOString(); // July 1st, 2026
  const endDate = new Date(2026, 7, 0, 23, 59, 59).toISOString();

  // Exactly as getDashboardStats does:
  
  const inc = await client.query(`
    SELECT sum(amount) FROM "Income" 
    WHERE date >= $1 AND date <= $2 
    AND currency = 'ARS' 
    AND "profileId" IN (SELECT id FROM "Profile" WHERE "accountId" = $3)
  `, [startDate, endDate, accountId]);
  
  const exp = await client.query(`
    SELECT sum(amount) FROM "Expense" 
    WHERE date >= $1 AND date <= $2 
    AND currency = 'ARS' 
    AND "categoryId" NOT IN (SELECT id FROM "Category" WHERE name IN ('Ahorro / Inversión', 'Ahorros'))
    AND "profileId" IN (SELECT id FROM "Profile" WHERE "accountId" = $3)
  `, [startDate, endDate, accountId]);

  const savs = await client.query(`
    SELECT t.amount, t.type FROM "SavingsTransaction" t
    JOIN "SavingsGoal" g ON t."savingsGoalId" = g.id
    WHERE t.date >= $1 AND t.date <= $2 
    AND g.currency = 'ARS'
    AND t."profileId" IN (SELECT id FROM "Profile" WHERE "accountId" = $3)
  `, [startDate, endDate, accountId]);

  const invs = await client.query(`
    SELECT sum(amount) FROM "Investment" 
    WHERE "startDate" >= $1 AND "startDate" <= $2 
    AND currency = 'ARS'
    AND "profileId" IN (SELECT id FROM "Profile" WHERE "accountId" = $3)
  `, [startDate, endDate, accountId]);

  console.log('Total Income:', inc.rows[0].sum);
  console.log('Total Expenses:', exp.rows[0].sum);
  
  let sDep = 0;
  let sRet = 0;
  savs.rows.forEach(r => {
    if (r.type === 'DEPOSITO') sDep += r.amount;
    if (r.type === 'RETIRO') sRet += r.amount;
  });
  console.log('Sav Dep:', sDep);
  console.log('Sav Ret:', sRet);
  console.log('Invs:', invs.rows[0].sum);

  await client.end();
}

check().catch(console.error);
