
// netlify/functions/lib/db.js
const { Pool } = require('pg');

const connectionString = process.env.DB_URL || process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;
if (!connectionString) {
  console.warn("[DB] Missing DB_URL env var. Set it to your Postgres connection string.");
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}

module.exports = { query };
