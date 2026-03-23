const { pool } = require('./testDb');

// Override the database module so all routes use the test DB pool.
// This must happen BEFORE requiring server routes.
const db = require('../../database');
const originalQuery = db.query;
const originalGetPool = db.getPool;
const originalBeginTransaction = db.beginTransaction;

db.query = async (text, params) => {
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (error) {
    console.error('Test DB query error:', error.message);
    throw error;
  }
};

db.getPool = () => pool;

db.beginTransaction = async () => {
  const client = await pool.connect();
  await client.query('BEGIN');
  return client;
};

// Now require Express and set up the app (routes will use the overridden db)
const express = require('express');
const app = express();

app.use(express.json({ limit: '10mb' }));

// Mount all route modules (same as server.js, minus listen/startup)
app.use('/api', require('../../routes/expenses'));
app.use('/api', require('../../routes/categories'));
app.use('/api', require('../../routes/users'));
app.use('/api', require('../../routes/sources'));
app.use('/api', require('../../routes/reports'));
app.use('/api', require('../../routes/import'));
app.use('/api', require('../../routes/dateRange'));
app.use('/api', require('../../routes/transfers'));
app.use('/api', require('../../routes/backup'));
app.use('/api', require('../../routes/data'));
app.use('/api', require('../../routes/importSessions'));
app.use('/api', require('../../routes/netWorth'));
app.use('/api', require('../../routes/teller'));
app.use('/api', require('../../routes/dashboards'));

/**
 * Restore the original database functions (for cleanup).
 */
const restoreDb = () => {
  db.query = originalQuery;
  db.getPool = originalGetPool;
  db.beginTransaction = originalBeginTransaction;
};

module.exports = { app, restoreDb };
