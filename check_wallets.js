const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  const w = await client.query(`SELECT id, name FROM "Wallet"`);
  console.log('Wallets:', w.rows);

  for (const wallet of w.rows) {
    const inc = await client.query(`SELECT sum(amount) FROM "Income" WHERE "walletId" = $1`, [wallet.id]);
    const exp = await client.query(`SELECT sum(amount) FROM "Expense" WHERE "walletId" = $1`, [wallet.id]);
    console.log(`Wallet ${wallet.name} (${wallet.id}): In=${inc.rows[0].sum} Ex=${exp.rows[0].sum} Bal=${Number(inc.rows[0].sum || 0) - Number(exp.rows[0].sum || 0)}`);
  }

  await client.end();
}

check().catch(console.error);
