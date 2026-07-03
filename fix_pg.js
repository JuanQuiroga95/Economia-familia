const { Client } = require('pg');

async function fix() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();
  console.log('Connected to DB');

  // Find distributed surplus txs
  const txsRes = await client.query(`
    SELECT t.id, t.amount, t."profileId", t."savingsGoalId", t."createdAt", g.currency as "goalCurrency", g."currentAmount"
    FROM "SavingsTransaction" t
    JOIN "SavingsGoal" g ON t."savingsGoalId" = g.id
    WHERE t.description = 'Distribución de sobrante del mes'
  `);

  console.log('Surplus txs:', txsRes.rowCount);

  for (const tx of txsRes.rows) {
    // Find expenses
    const expRes = await client.query(`
      SELECT id, amount, currency, "createdAt"
      FROM "Expense"
      WHERE description = 'Distribución de sobrante'
      AND amount = $1
      AND "profileId" = $2
    `, [tx.amount, tx.profileId]);

    let correspondingExpense = null;
    for (const exp of expRes.rows) {
      if (Math.abs(exp.createdAt.getTime() - tx.createdAt.getTime()) < 10000) {
        correspondingExpense = exp;
        break;
      }
    }

    if (correspondingExpense && correspondingExpense.currency !== tx.goalCurrency) {
      console.log(`Mismatch! TX: ${tx.id}, Goal: ${tx.goalCurrency}, Exp: ${correspondingExpense.currency}`);
      
      const newAmount = Math.max(0, tx.currentAmount - tx.amount);
      
      await client.query('UPDATE "SavingsGoal" SET "currentAmount" = $1 WHERE id = $2', [newAmount, tx.savingsGoalId]);
      await client.query('DELETE FROM "Expense" WHERE id = $1', [correspondingExpense.id]);
      await client.query('DELETE FROM "SavingsTransaction" WHERE id = $1', [tx.id]);
      console.log(`Reverted tx ${tx.id}`);
    }
  }

  await client.end();
}

fix().catch(console.error);
