const { Pool } = require('pg');
require('dotenv').config();

// Database configuration with defaults for local development
const config = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'expense_tracker',
  password: process.env.DB_PASSWORD || 'expense_tracker_password',
  database: process.env.DB_NAME || 'expense_tracker',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Test mode database configuration
const testConfig = {
  ...config,
  database: process.env.DB_NAME_TEST || 'expense_tracker_test',
};

// Create connection pools
const pool = new Pool(config);
const testPool = new Pool(testConfig);

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

testPool.on('error', (err) => {
  console.error('Unexpected error on idle test client', err);
  process.exit(-1);
});

// Test mode state (similar to server.js)
let isTestMode = false;

/**
 * Get the appropriate database pool based on test mode
 */
const getPool = () => {
  return isTestMode ? testPool : pool;
};

/**
 * Set test mode
 */
const setTestMode = (mode) => {
  isTestMode = mode;
};

/**
 * Get current test mode
 */
const getTestMode = () => {
  return isTestMode;
};

/**
 * Execute a query with error handling
 */
const query = async (text, params) => {
  const clientPool = getPool();
  const start = Date.now();
  try {
    const res = await clientPool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log('Executed query', { text, duration, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

/**
 * Begin a transaction
 */
const beginTransaction = async () => {
  const clientPool = getPool();
  const client = await clientPool.connect();
  await client.query('BEGIN');
  return client;
};

/**
 * Commit a transaction
 */
const commitTransaction = async (client) => {
  await client.query('COMMIT');
  client.release();
};

/**
 * Rollback a transaction
 */
const rollbackTransaction = async (client) => {
  await client.query('ROLLBACK');
  client.release();
};

/**
 * Check if database connection is healthy
 */
const healthCheck = async () => {
  try {
    await query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
};

/**
 * Wait for database to be ready
 */
const waitForDatabase = async (maxRetries = 30, delay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await query('SELECT 1');
      console.log('Database is ready');
      return true;
    } catch (error) {
      if (i === maxRetries - 1) {
        throw new Error('Database connection failed after maximum retries');
      }
      console.log(`Waiting for database... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

/**
 * Close all database connections
 */
const close = async () => {
  await pool.end();
  await testPool.end();
};

module.exports = {
  query,
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
  healthCheck,
  waitForDatabase,
  close,
  setTestMode,
  getTestMode,
  getPool,
};

