const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  await pool.query('DELETE FROM "SavingsTransaction"');
  await pool.query('DELETE FROM "SavingsGoal"');
  console.log('Deleted existing Savings Goals via raw SQL');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
