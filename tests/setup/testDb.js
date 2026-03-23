const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5433,
  user: process.env.DB_USER || 'expense_tracker',
  password: process.env.DB_PASSWORD || 'expense_tracker_password',
  database: process.env.DB_NAME || 'expense_tracker_test',
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Test DB: unexpected error on idle client', err);
});

/**
 * Run schema.sql and all migrations to set up the test database.
 */
const setupTestDb = async () => {
  const schemaSQL = fs.readFileSync(path.join(__dirname, '..', '..', 'schema.sql'), 'utf8');
  await pool.query(schemaSQL);

  const migrations = [
    {
      name: 'initial_migration',
      up: async () => {},
    },
    {
      name: 'add_import_sessions',
      up: async () => {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS import_sessions (
            id          VARCHAR(255) PRIMARY KEY,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            user_id     VARCHAR(255),
            source_id   VARCHAR(255),
            source_name VARCHAR(255) NOT NULL,
            file_name   VARCHAR(255),
            transaction_count INTEGER NOT NULL DEFAULT 0
          )
        `);
        await pool.query(
          `CREATE INDEX IF NOT EXISTS idx_import_sessions_created_at ON import_sessions(created_at DESC)`
        );
        await pool.query(
          `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS import_id VARCHAR(255) REFERENCES import_sessions(id) ON DELETE SET NULL`
        );
        await pool.query(
          `CREATE INDEX IF NOT EXISTS idx_transactions_import_id ON transactions(import_id)`
        );
      },
    },
    {
      name: 'add_personal_dashboards_tables',
      up: async () => {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS dashboards (
            id               VARCHAR(255) PRIMARY KEY,
            name             VARCHAR(255) NOT NULL,
            is_default       BOOLEAN NOT NULL DEFAULT FALSE,
            date_range_start DATE NOT NULL,
            date_range_end   DATE NOT NULL,
            created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS dashboard_panels (
            id                VARCHAR(255) PRIMARY KEY,
            dashboard_id      VARCHAR(255) NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
            title             VARCHAR(255) NOT NULL,
            chart_type        VARCHAR(10) NOT NULL CHECK (chart_type IN ('bar', 'line')),
            filter_type       VARCHAR(10) NOT NULL DEFAULT 'both' CHECK (filter_type IN ('expense', 'income', 'both')),
            filter_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
            filter_regex      TEXT,
            series_mode       VARCHAR(20) NOT NULL DEFAULT 'two_series' CHECK (series_mode IN ('two_series', 'net_amount')),
            net_orientation   VARCHAR(20) CHECK (net_orientation IN ('income_positive', 'expense_positive')),
            panel_order       INTEGER NOT NULL DEFAULT 0,
            created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await pool.query(
          `CREATE INDEX IF NOT EXISTS idx_dashboard_panels_dashboard ON dashboard_panels(dashboard_id)`
        );
      },
    },
    {
      name: 'add_panel_filter_groups',
      up: async () => {
        await pool.query(`
          ALTER TABLE dashboard_panels
          ADD COLUMN IF NOT EXISTS filter_groups JSONB NOT NULL DEFAULT '[]'::jsonb
        `);
      },
    },
    {
      name: 'add_panel_legend_options',
      up: async () => {
        await pool.query(
          `ALTER TABLE dashboard_panels ADD COLUMN IF NOT EXISTS legend_options JSONB`
        );
      },
    },
    {
      name: 'add_teller_account_id',
      up: async () => {
        await pool.query(
          `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS teller_account_id VARCHAR(255)`
        );
        await pool.query(
          `CREATE INDEX IF NOT EXISTS idx_accounts_teller_account_id ON accounts(teller_account_id)`
        );
      },
    },
    {
      name: 'add_teller_enrollment_id',
      up: async () => {
        await pool.query(
          `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS teller_enrollment_id VARCHAR(255)`
        );
        await pool.query(
          `CREATE INDEX IF NOT EXISTS idx_accounts_teller_enrollment_id ON accounts(teller_enrollment_id)`
        );
      },
    },
  ];

  for (const migration of migrations) {
    const result = await pool.query('SELECT 1 FROM migrations WHERE migration_name = $1', [
      migration.name,
    ]);
    if (result.rows.length === 0) {
      await migration.up();
      await pool.query(
        'INSERT INTO migrations (migration_name) VALUES ($1) ON CONFLICT DO NOTHING',
        [migration.name]
      );
    }
  }
};

/**
 * Drop all tables in the test database.
 */
const teardownTestDb = async () => {
  await pool.query(`
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO expense_tracker;
  `);
};

/**
 * Truncate specific tables (preserves schema).
 */
const cleanTable = async (...tableNames) => {
  if (tableNames.length === 0) return;
  await pool.query(`TRUNCATE TABLE ${tableNames.join(', ')} CASCADE`);
};

/**
 * Truncate all application tables (preserves schema and migrations).
 */
const cleanAllTables = async () => {
  await cleanTable(
    'account_balances',
    'accounts',
    'dashboard_panels',
    'dashboards',
    'import_sessions',
    'transactions',
    'categories',
    'users',
    'sources',
    'reports',
    'date_ranges',
    'metadata'
  );
};

/**
 * Close the test database pool.
 */
const closeTestDb = async () => {
  await pool.end();
};

module.exports = {
  pool,
  setupTestDb,
  teardownTestDb,
  cleanTable,
  cleanAllTables,
  closeTestDb,
};
