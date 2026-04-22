require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API key authentication
app.use('/api', (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!process.env.API_SECRET || key === process.env.API_SECRET) return next();
  res.status(401).json({ error: 'Unauthorized' });
});

// Wait for database before starting
(async () => {
  try {
    await db.waitForDatabase();
    console.log('Database connection established');
  } catch (error) {
    console.error('Failed to connect to database:', error);
    process.exit(1);
  }
})();

// Mount Teller routes (only remaining Express route)
app.use('/api', require('./routes/teller'));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Express server running on http://localhost:${PORT} (Teller only)`);

  // Teller integration status
  const tellerVars = {
    FINANCE_MANAGER_TELLER_INTEGRATION_ENABLED:
      process.env.FINANCE_MANAGER_TELLER_INTEGRATION_ENABLED === 'true',
    FINANCE_MANAGER_TELLER_APP_ID: !!process.env.FINANCE_MANAGER_TELLER_APP_ID,
    FINANCE_MANAGER_TELLER_PRIVATE_KEY: !!process.env.FINANCE_MANAGER_TELLER_PRIVATE_KEY,
    FINANCE_MANAGER_TELLER_CERT: !!process.env.FINANCE_MANAGER_TELLER_CERT,
  };
  const missing = Object.entries(tellerVars)
    .filter(([, set]) => !set)
    .map(([k]) => k);
  if (missing.length === 0) {
    console.log('Teller integration: enabled');
  } else {
    console.log('Teller integration: disabled (missing: ' + missing.join(', ') + ')');
  }
});
