const { Client } = require('pg');

async function fix() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  const txsRes = await client.query(`
    SELECT t.id, t.amount, t."profileId", t."savingsGoalId", t."createdAt", g.currency as "goalCurrency", g.name as "goalName"
    FROM "SavingsTransaction" t
    JOIN "SavingsGoal" g ON t."savingsGoalId" = g.id
    WHERE t.type = 'RETIRO'
  `);

  console.log('Retiros:', txsRes.rows);

  for (const tx of txsRes.rows) {
    const incs = await client.query(`
      SELECT id FROM "Income" 
      WHERE amount = $1 AND "profileId" = $2 AND description LIKE 'Retiro de meta:%'
    `, [tx.amount, tx.profileId]);

    const oldIncs = await client.query(`
      SELECT id FROM "Income" 
      WHERE amount = $1 AND "profileId" = $2 AND description LIKE 'Rescate desde ahorros:%'
    `, [tx.amount, tx.profileId]);

    if (incs.rowCount === 0 && oldIncs.rowCount === 0) {
      console.log('Fixing RETIRO:', tx.id);
      await client.query(`
        INSERT INTO "Income" (id, amount, currency, date, description, "profileId", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $6)
      `, [tx.amount, tx.goalCurrency, tx.createdAt, `Retiro de meta: ${tx.goalName}`, tx.profileId, new Date()]);
      console.log('Created Income for RETIRO', tx.amount);
    }
  }

  // Same for DEPOSITO that are NOT Distribucion de sobrante
  const depTxsRes = await client.query(`
    SELECT t.id, t.amount, t."profileId", t."savingsGoalId", t."createdAt", g.currency as "goalCurrency", g.name as "goalName"
    FROM "SavingsTransaction" t
    JOIN "SavingsGoal" g ON t."savingsGoalId" = g.id
    WHERE t.type = 'DEPOSITO' AND t.description != 'Distribución de sobrante del mes'
  `);
  
  for (const tx of depTxsRes.rows) {
    const exps = await client.query(`
      SELECT id FROM "Expense" 
      WHERE amount = $1 AND "profileId" = $2 AND description LIKE 'Depósito en meta:%'
    `, [tx.amount, tx.profileId]);

    if (exps.rowCount === 0) {
      console.log('Fixing DEPOSITO:', tx.id);
      
      const cat = await client.query(`SELECT id FROM "Category" WHERE name = 'Ahorro / Inversión' LIMIT 1`);
      const catId = cat.rows[0].id;

      await client.query(`
        INSERT INTO "Expense" (id, amount, currency, date, description, "categoryId", "profileId", type, "paidFromPersonalBudget", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, 'PROPIO', false, $7, $7)
      `, [tx.amount, tx.goalCurrency, tx.createdAt, `Depósito en meta: ${tx.goalName}`, catId, tx.profileId, new Date()]);
      console.log('Created Expense for DEPOSITO', tx.amount);
    }
  }

  await client.end();
}

fix().catch(console.error);
