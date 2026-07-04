const { Client } = require('pg');

async function fix() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  console.log('Deleting fake expenses from savings deposits and distributions...');
  const delExp = await client.query(`
    DELETE FROM "Expense" 
    WHERE description LIKE 'Depósito en meta:%' 
       OR description LIKE 'Distribución de sobrante%'
  `);
  console.log(`Deleted ${delExp.rowCount} expenses.`);

  console.log('Deleting fake incomes from savings withdrawals...');
  const delInc = await client.query(`
    DELETE FROM "Income" 
    WHERE description LIKE 'Retiro de meta:%'
       OR description LIKE 'Rescate desde ahorros:%'
       OR description LIKE 'Rescate desde inversión:%'
  `);
  console.log(`Deleted ${delInc.rowCount} incomes.`);

  await client.end();
}

fix().catch(console.error);
