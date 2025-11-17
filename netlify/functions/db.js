const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || process.env.DB_URL;

if (!connectionString) {
  console.warn('[FHM AUTH] DATABASE_URL/DB_URL no está configurada.');
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
