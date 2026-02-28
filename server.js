require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const { runMigration } = require('./migrate');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize database and run migration on startup
(async () => {
  try {
    await db.waitForDatabase();
    await runMigration(false);
    console.log('Database initialized and migration completed');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
})();

// Mount route modules
app.use('/api', require('./routes/expenses'));
app.use('/api', require('./routes/categories'));
app.use('/api', require('./routes/users'));
app.use('/api', require('./routes/sources'));
app.use('/api', require('./routes/reports'));
app.use('/api', require('./routes/import'));
app.use('/api', require('./routes/dateRange'));
app.use('/api', require('./routes/transfers'));
app.use('/api', require('./routes/backup'));
app.use('/api', require('./routes/data'));
app.use('/api', require('./routes/netWorth'));
app.use('/api', require('./routes/teller'));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Artifacts directory: ${path.resolve('.artifacts')}`);

  // Teller integration status
  const tellerVars = {
    FINANCE_MANAGER_TELLER_INTEGRATION_ENABLED: process.env.FINANCE_MANAGER_TELLER_INTEGRATION_ENABLED === 'true',
    FINANCE_MANAGER_TELLER_TOKEN: !!process.env.FINANCE_MANAGER_TELLER_TOKEN,
    FINANCE_MANAGER_TELLER_PRIVATE_KEY: !!process.env.FINANCE_MANAGER_TELLER_PRIVATE_KEY,
    FINANCE_MANAGER_TELLER_CERT: !!process.env.FINANCE_MANAGER_TELLER_CERT,
  };
  const missing = Object.entries(tellerVars).filter(([, set]) => !set).map(([k]) => k);
  if (missing.length === 0) {
    console.log('Teller integration: enabled');
  } else {
    console.log('Teller integration: disabled (missing: ' + missing.join(', ') + ')');
  }
});
