const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();
const db = require('./database');

/**
 * Ensure test database exists
 */
const ensureTestDatabase = async () => {
  const adminConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'expense_tracker',
    password: process.env.DB_PASSWORD || 'expense_tracker_password',
    database: 'postgres', // Connect to default postgres database
  };
  
  const adminPool = new Pool(adminConfig);
  
  try {
    const testDbName = process.env.DB_NAME_TEST || 'expense_tracker_test';
    const result = await adminPool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [testDbName]
    );
    
    if (result.rows.length === 0) {
      await adminPool.query(`CREATE DATABASE ${testDbName}`);
      console.log(`Created test database: ${testDbName}`);
    }
  } finally {
    await adminPool.end();
  }
};

/**
 * Check if migration has already been completed
 */
const isMigrationComplete = async () => {
  try {
    const result = await db.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'migrations')"
    );
    
    if (!result.rows[0].exists) {
      return false;
    }
    
    const migrationResult = await db.query(
      "SELECT * FROM migrations WHERE migration_name = $1",
      ['initial_migration']
    );
    
    return migrationResult.rows.length > 0;
  } catch (error) {
    return false;
  }
};

/**
 * Create database schema
 */
const createSchema = async () => {
  const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(schemaSQL);
  console.log('Database schema created');
};

/**
 * Mark migration as complete
 */
const markMigrationComplete = async () => {
  await db.query(
    "INSERT INTO migrations (migration_name) VALUES ($1) ON CONFLICT DO NOTHING",
    ['initial_migration']
  );
};

/**
 * Get artifacts directory based on test mode
 */
const getArtifactsDir = (isTestMode) => {
  return isTestMode ? '.test_artifacts' : '.artifacts';
};

/**
 * Migrate transactions from JSON to database
 */
const migrateTransactions = async (isTestMode) => {
  const artifactsDir = getArtifactsDir(isTestMode);
  const transactionsFile = path.join(artifactsDir, 'transactions.json');
  
  if (!fs.existsSync(transactionsFile)) {
    console.log(`No transactions file found at ${transactionsFile}`);
    return 0;
  }
  
  const data = fs.readFileSync(transactionsFile, 'utf8');
  const transactions = JSON.parse(data);
  
  if (!Array.isArray(transactions) || transactions.length === 0) {
    console.log('No transactions to migrate');
    return 0;
  }
  
  // Check if transactions already exist
  const existingCount = await db.query('SELECT COUNT(*) FROM transactions');
  if (parseInt(existingCount.rows[0].count) > 0) {
    console.log('Transactions already exist in database, skipping migration');
    return 0;
  }
  
  console.log(`Migrating ${transactions.length} transactions...`);
  
  const client = await db.beginTransaction();
  try {
    for (const transaction of transactions) {
      await client.query(
        `INSERT INTO transactions (
          id, date, description, category, amount, type, user_id,
          labels, metadata, transfer_info, excluded_from_calculations
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO NOTHING`,
        [
          transaction.id,
          transaction.date,
          transaction.description,
          transaction.category || 'Uncategorized',
          transaction.amount,
          transaction.type,
          transaction.user,
          JSON.stringify(transaction.labels || []),
          JSON.stringify(transaction.metadata || {}),
          transaction.transferInfo ? JSON.stringify(transaction.transferInfo) : null,
          transaction.excludedFromCalculations || false
        ]
      );
    }
    
    await db.commitTransaction(client);
    console.log(`Successfully migrated ${transactions.length} transactions`);
    return transactions.length;
  } catch (error) {
    await db.rollbackTransaction(client);
    throw error;
  }
};

/**
 * Migrate categories from JSON to database
 */
const migrateCategories = async (isTestMode) => {
  const artifactsDir = getArtifactsDir(isTestMode);
  const categoriesFile = path.join(artifactsDir, 'categories.json');
  
  if (!fs.existsSync(categoriesFile)) {
    console.log(`No categories file found at ${categoriesFile}`);
    return 0;
  }
  
  const data = fs.readFileSync(categoriesFile, 'utf8');
  const categories = JSON.parse(data);
  
  if (!Array.isArray(categories) || categories.length === 0) {
    console.log('No categories to migrate');
    return 0;
  }
  
  // Check if categories already exist
  const existingCount = await db.query('SELECT COUNT(*) FROM categories');
  if (parseInt(existingCount.rows[0].count) > 0) {
    console.log('Categories already exist in database, skipping migration');
    return 0;
  }
  
  console.log(`Migrating ${categories.length} categories...`);
  
  const client = await db.beginTransaction();
  try {
    for (const category of categories) {
      await client.query(
        'INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
        [category]
      );
    }
    
    await db.commitTransaction(client);
    console.log(`Successfully migrated ${categories.length} categories`);
    return categories.length;
  } catch (error) {
    await db.rollbackTransaction(client);
    throw error;
  }
};

/**
 * Migrate users from JSON to database
 */
const migrateUsers = async (isTestMode) => {
  const artifactsDir = getArtifactsDir(isTestMode);
  const usersFile = path.join(artifactsDir, 'users.json');
  
  if (!fs.existsSync(usersFile)) {
    console.log(`No users file found at ${usersFile}`);
    return 0;
  }
  
  const data = fs.readFileSync(usersFile, 'utf8');
  const users = JSON.parse(data);
  
  if (!Array.isArray(users) || users.length === 0) {
    console.log('No users to migrate');
    return 0;
  }
  
  // Check if users already exist
  const existingCount = await db.query('SELECT COUNT(*) FROM users');
  if (parseInt(existingCount.rows[0].count) > 0) {
    console.log('Users already exist in database, skipping migration');
    return 0;
  }
  
  console.log(`Migrating ${users.length} users...`);
  
  const client = await db.beginTransaction();
  try {
    for (const user of users) {
      await client.query(
        'INSERT INTO users (id, name, created_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
        [user.id, user.name, user.createdAt || new Date().toISOString()]
      );
    }
    
    await db.commitTransaction(client);
    console.log(`Successfully migrated ${users.length} users`);
    return users.length;
  } catch (error) {
    await db.rollbackTransaction(client);
    throw error;
  }
};

/**
 * Migrate sources from JSON to database
 */
const migrateSources = async (isTestMode) => {
  const artifactsDir = getArtifactsDir(isTestMode);
  const sourcesFile = path.join(artifactsDir, 'source.json');
  
  if (!fs.existsSync(sourcesFile)) {
    console.log(`No sources file found at ${sourcesFile}`);
    return 0;
  }
  
  const data = fs.readFileSync(sourcesFile, 'utf8');
  const sources = JSON.parse(data);
  
  if (!Array.isArray(sources) || sources.length === 0) {
    console.log('No sources to migrate');
    return 0;
  }
  
  // Check if sources already exist
  const existingCount = await db.query('SELECT COUNT(*) FROM sources');
  if (parseInt(existingCount.rows[0].count) > 0) {
    console.log('Sources already exist in database, skipping migration');
    return 0;
  }
  
  console.log(`Migrating ${sources.length} sources...`);
  
  const client = await db.beginTransaction();
  try {
    for (const source of sources) {
      await client.query(
        `INSERT INTO sources (id, name, mappings, flip_income_expense, created_at, last_used)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
        [
          source.id,
          source.name,
          JSON.stringify(source.mappings || []),
          source.flipIncomeExpense || false,
          source.createdAt || new Date().toISOString(),
          source.lastUsed || new Date().toISOString()
        ]
      );
    }
    
    await db.commitTransaction(client);
    console.log(`Successfully migrated ${sources.length} sources`);
    return sources.length;
  } catch (error) {
    await db.rollbackTransaction(client);
    throw error;
  }
};

/**
 * Migrate reports from JSON files to database
 */
const migrateReports = async (isTestMode) => {
  const artifactsDir = getArtifactsDir(isTestMode);
  const reportsDir = path.join(artifactsDir, 'reports');
  
  if (!fs.existsSync(reportsDir)) {
    console.log(`No reports directory found at ${reportsDir}`);
    return 0;
  }
  
  const files = fs.readdirSync(reportsDir).filter(file => 
    file.endsWith('.json') && !file.endsWith('_data.json')
  );
  
  if (files.length === 0) {
    console.log('No reports to migrate');
    return 0;
  }
  
  // Check if reports already exist
  const existingCount = await db.query('SELECT COUNT(*) FROM reports');
  if (parseInt(existingCount.rows[0].count) > 0) {
    console.log('Reports already exist in database, skipping migration');
    return 0;
  }
  
  console.log(`Migrating ${files.length} reports...`);
  
  const client = await db.beginTransaction();
  try {
    for (const file of files) {
      const filePath = path.join(reportsDir, file);
      const data = fs.readFileSync(filePath, 'utf8');
      const report = JSON.parse(data);
      
      await client.query(
        `INSERT INTO reports (id, name, description, filters, created_at, last_modified)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
        [
          report.id,
          report.name,
          report.description || null,
          JSON.stringify(report.filters || {}),
          report.createdAt || new Date().toISOString(),
          report.lastModified || new Date().toISOString()
        ]
      );
    }
    
    await db.commitTransaction(client);
    console.log(`Successfully migrated ${files.length} reports`);
    return files.length;
  } catch (error) {
    await db.rollbackTransaction(client);
    throw error;
  }
};

/**
 * Migrate date range from JSON to database
 */
const migrateDateRange = async (isTestMode) => {
  const artifactsDir = getArtifactsDir(isTestMode);
  const dateRangeFile = path.join(artifactsDir, 'date-range.json');
  
  if (!fs.existsSync(dateRangeFile)) {
    console.log(`No date range file found at ${dateRangeFile}`);
    return 0;
  }
  
  const data = fs.readFileSync(dateRangeFile, 'utf8');
  const dateRange = JSON.parse(data);
  
  // Check if date range already exists
  const existingCount = await db.query('SELECT COUNT(*) FROM date_ranges');
  if (parseInt(existingCount.rows[0].count) > 0) {
    console.log('Date range already exists in database, skipping migration');
    return 0;
  }
  
  console.log('Migrating date range...');
  
  await db.query(
    'INSERT INTO date_ranges (start_date, end_date) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [dateRange.start, dateRange.end]
  );
  
  console.log('Successfully migrated date range');
  return 1;
};

/**
 * Main migration function
 */
const runMigration = async (isTestMode = false) => {
  try {
    console.log('Starting database migration...');
    console.log(`Test mode: ${isTestMode}`);
    
    // Ensure test database exists if migrating test mode
    if (isTestMode) {
      await ensureTestDatabase();
    }
    
    // Set test mode in database module
    db.setTestMode(isTestMode);
    
    // Wait for database to be ready
    await db.waitForDatabase();
    
    // Check if migration already completed
    const alreadyMigrated = await isMigrationComplete();
    if (alreadyMigrated) {
      console.log('Migration already completed, skipping...');
      return;
    }
    
    // Create schema
    await createSchema();
    
    // Migrate data
    const transactionCount = await migrateTransactions(isTestMode);
    const categoryCount = await migrateCategories(isTestMode);
    const userCount = await migrateUsers(isTestMode);
    const sourceCount = await migrateSources(isTestMode);
    const reportCount = await migrateReports(isTestMode);
    const dateRangeCount = await migrateDateRange(isTestMode);
    
    // Mark migration as complete
    await markMigrationComplete();
    
    console.log('\nMigration completed successfully!');
    console.log(`Summary:`);
    console.log(`  - Transactions: ${transactionCount}`);
    console.log(`  - Categories: ${categoryCount}`);
    console.log(`  - Users: ${userCount}`);
    console.log(`  - Sources: ${sourceCount}`);
    console.log(`  - Reports: ${reportCount}`);
    console.log(`  - Date Ranges: ${dateRangeCount}`);
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
};

// Run migration if called directly
if (require.main === module) {
  const isTestMode = process.argv.includes('--test-mode');
  runMigration(isTestMode)
    .then(() => {
      console.log('Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigration };
