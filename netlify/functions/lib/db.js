
// netlify/functions/lib/db.js
// Simple pooled query helper for Neon (Postgres) via pg.
// Uses DB_URL env var (we already mapped it to NETLIFY_DATABASE_URL).

const { Pool } = require('pg');

const connectionString = process.env.DB_URL || process.env.NETLIFY_DATABASE_URL;
if (!connectionString) {
  throw new Error('DB_URL env var is missing');
}

const pool = new Pool({ connectionString, max: 4, idleTimeoutMillis: 10_000 });

async function query(text, params) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res.rows;
  } finally {
    client.release();
  }
}

module.exports = { query };
