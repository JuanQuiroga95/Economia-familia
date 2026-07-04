const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  const startDate = new Date(2026, 6, 1).toISOString(); // July 1st, 2026
  const endDate = new Date(2026, 7, 0, 23, 59, 59).toISOString();

  console.log('Period:', startDate, 'to', endDate);

  const inc = await client.query(`SELECT sum(amount) FROM "Income" WHERE date >= $1 AND date <= $2`, [startDate, endDate]);
  const exp = await client.query(`SELECT sum(amount) FROM "Expense" WHERE date >= $1 AND date <= $2`, [startDate, endDate]);
  const sDep = await client.query(`SELECT sum(amount) FROM "SavingsTransaction" WHERE date >= $1 AND date <= $2 AND type = 'DEPOSITO'`, [startDate, endDate]);
  const sRet = await client.query(`SELECT sum(amount) FROM "SavingsTransaction" WHERE date >= $1 AND date <= $2 AND type = 'RETIRO'`, [startDate, endDate]);
  
  console.log('Income:', inc.rows[0].sum);
  console.log('Expense:', exp.rows[0].sum);
  console.log('Sav Dep:', sDep.rows[0].sum);
  console.log('Sav Ret:', sRet.rows[0].sum);

  const tInc = Number(inc.rows[0].sum || 0);
  const tExp = Number(exp.rows[0].sum || 0);
  const tSDep = Number(sDep.rows[0].sum || 0);
  const tSRet = Number(sRet.rows[0].sum || 0);

  console.log('Balance:', tInc - tExp - tSDep + tSRet);

  await client.end();
}

check().catch(console.error);
