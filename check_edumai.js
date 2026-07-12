const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_cZ8Gea3MAdHB@ep-fragrant-lab-atvzu8vw-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
  });
  
  await client.connect();

  const acc = await client.query(`SELECT id, "splitMode", "splitPercentA", "splitPercentB" FROM "Account" WHERE username = 'edumai'`);
  if (acc.rows.length === 0) return;
  const account = acc.rows[0];

  const profilesRes = await client.query(`SELECT id, name FROM "Profile" WHERE "accountId" = $1 ORDER BY name ASC`, [account.id]);
  const [profileA, profileB] = profilesRes.rows;

  const startDate = new Date(2026, 6, 1).toISOString(); 
  const endDate = new Date(2026, 7, 0, 23, 59, 59).toISOString();

  const sharedExpenses = await client.query(`
    SELECT e.id, e.amount, e.description, e."paidFromPersonalBudget", e."splitPercentage", e."profileId", p.name
    FROM "Expense" e
    JOIN "Profile" p ON e."profileId" = p.id
    WHERE e.type = 'COMPARTIDO' 
    AND p."accountId" = $1
    AND e.date >= $2 AND e.date <= $3
  `, [account.id, startDate, endDate]);

  let balanceA = 0; 
  sharedExpenses.rows.forEach((exp) => {
    if (exp.paidFromPersonalBudget) {
      const payer = exp.profileId;
      const payerPercent = exp.splitPercentage !== null ? exp.splitPercentage : (payer === profileA.id ? account.splitPercentA : account.splitPercentB);
      const owedAmount = exp.amount * (100 - payerPercent) / 100;
      if (payer === profileA.id) {
        balanceA += owedAmount;
      } else {
        balanceA -= owedAmount;
      }
    }
  });

  console.log('Balance A:', balanceA);
  
  const debts = [];
  if (balanceA > 0) {
    debts.push({ debtor: profileB.name, creditor: profileA.name, amount: balanceA });
  } else if (balanceA < 0) {
    debts.push({ debtor: profileA.name, creditor: profileB.name, amount: Math.abs(balanceA) });
  }
  
  console.log('Debts:', debts);

  await client.end();
}

check().catch(console.error);
