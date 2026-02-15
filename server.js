const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const db = require('./database');
const { runMigration } = require('./migrate');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize database and run migration on startup
(async () => {
  try {
    await db.waitForDatabase();
    // Migrate production database
    await runMigration(false);
    console.log('Database initialized and migration completed');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
})();

// Function to get the appropriate artifacts directory
const getArtifactsDir = () => {
  return '.artifacts';
};

// Function to get file paths based on test mode
const getFilePath = (filename) => {
  const artifactsDir = getArtifactsDir();
  return path.join(artifactsDir, filename);
};

// Ensure artifacts directory exists
const ensureArtifactsDir = () => {
  const artifactsDir = getArtifactsDir();
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }
  
  const reportsDir = path.join(artifactsDir, 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
};

// Helper: build WHERE clause and params for filtered expenses query
function buildExpensesWhereClause(query) {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (query.dateFrom) {
    conditions.push(`date >= $${paramIndex}`);
    params.push(query.dateFrom);
    paramIndex++;
  }
  if (query.dateTo) {
    conditions.push(`date <= $${paramIndex}`);
    params.push(query.dateTo);
    paramIndex++;
  }
  if (query.userId) {
    conditions.push(`user_id = $${paramIndex}`);
    params.push(query.userId);
    paramIndex++;
  }
  if (query.categories && query.categories.length > 0) {
    conditions.push(`category = ANY($${paramIndex}::text[])`);
    params.push(Array.isArray(query.categories) ? query.categories : [query.categories]);
    paramIndex++;
  }
  if (query.types && query.types.length > 0) {
    conditions.push(`type = ANY($${paramIndex}::text[])`);
    params.push(Array.isArray(query.types) ? query.types : [query.types]);
    paramIndex++;
  }
  if (query.minAmount != null && query.minAmount !== '') {
    conditions.push(`amount >= $${paramIndex}`);
    params.push(parseFloat(query.minAmount));
    paramIndex++;
  }
  if (query.maxAmount != null && query.maxAmount !== '') {
    conditions.push(`amount <= $${paramIndex}`);
    params.push(parseFloat(query.maxAmount));
    paramIndex++;
  }
  if (query.search && query.search.trim()) {
    const searchTerm = `%${query.search.trim().toLowerCase()}%`;
    conditions.push(`(
      LOWER(description) LIKE $${paramIndex}
      OR LOWER(category) LIKE $${paramIndex}
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(labels, '[]'::jsonb)) AS lbl
        WHERE LOWER(lbl) LIKE $${paramIndex}
      )
    )`);
    params.push(searchTerm);
    paramIndex++;
  }
  if (query.labels && query.labels.length > 0) {
    conditions.push(`EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(COALESCE(labels, '[]'::jsonb)) AS lbl
      WHERE lbl = ANY($${paramIndex}::text[])
    )`);
    params.push(Array.isArray(query.labels) ? query.labels : [query.labels]);
    paramIndex++;
  }
  if (query.sources && query.sources.length > 0) {
    conditions.push(`metadata->>'sourceId' = ANY($${paramIndex}::text[])`);
    params.push(Array.isArray(query.sources) ? query.sources : [query.sources]);
    paramIndex++;
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereSql, params };
}

function rowToExpense(row) {
  return {
    id: row.id,
    date: row.date,
    description: row.description,
    category: row.category,
    amount: parseFloat(row.amount),
    type: row.type,
    user: row.user_id,
    labels: row.labels || [],
    metadata: row.metadata || {},
    transferInfo: row.transfer_info ? row.transfer_info : undefined,
    excludedFromCalculations: row.excluded_from_calculations || false
  };
}

// Routes
app.get('/api/expenses', async (req, res) => {
  try {
    const limit = req.query.limit != null ? parseInt(req.query.limit, 10) : null;
    const offset = req.query.offset != null ? parseInt(req.query.offset, 10) : 0;

    // Parse filter query params (support comma-separated or repeated keys)
    const parseList = (val) => {
      if (val == null) return undefined;
      if (Array.isArray(val)) return val.filter(Boolean);
      return val.split(',').map(s => s.trim()).filter(Boolean);
    };
    const filters = {
      dateFrom: req.query.dateFrom || undefined,
      dateTo: req.query.dateTo || undefined,
      userId: req.query.userId || undefined,
      categories: parseList(req.query.categories),
      types: parseList(req.query.types),
      labels: parseList(req.query.labels),
      sources: parseList(req.query.sources),
      minAmount: req.query.minAmount,
      maxAmount: req.query.maxAmount,
      search: req.query.search
    };

    const { whereSql, params } = buildExpensesWhereClause(filters);
    const orderBy = 'ORDER BY date DESC';

    if (limit != null && limit >= 0) {
      // Paginated response: { expenses, total }
      const countResult = await db.query(
        `SELECT COUNT(*)::int AS total FROM transactions ${whereSql}`,
        params
      );
      const total = countResult.rows[0].total;

      const result = await db.query(
        `SELECT * FROM transactions ${whereSql} ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      );
      const expenses = result.rows.map(rowToExpense);

      return res.json({ expenses, total });
    }

    // No limit: return all (backward compatible)
    const result = await db.query(
      `SELECT * FROM transactions ${whereSql} ${orderBy}`,
      params
    );
    const expenses = result.rows.map(rowToExpense);

    res.json(expenses);
  } catch (error) {
    console.error('Error reading expenses:', error);
    res.status(500).json({ error: 'Failed to read expenses' });
  }
});

// Dashboard stats: aggregates only (no full transaction list). Replicates transfer/exclusion logic.
function buildStatsWhereClause(dateFrom, dateTo, userId) {
  const conditions = [
    '($1::date IS NULL OR date >= $1)',
    '($2::date IS NULL OR date <= $2)',
    '($3::text IS NULL OR user_id = $3)',
    'excluded_from_calculations IS NOT TRUE',
    `(
      transfer_info IS NULL
      OR (transfer_info->>'isTransfer') IS DISTINCT FROM 'true'
      OR (
        (transfer_info->>'userOverride') IS NOT NULL AND (COALESCE((transfer_info->>'excludedFromCalculations')::boolean, false) = false)
        OR (transfer_info->>'transferType') = 'user' AND $3 IS NOT NULL
        OR (transfer_info->>'transferType') = 'self' AND (COALESCE((transfer_info->>'excludedFromCalculations')::boolean, false) = false)
        OR ((transfer_info->>'transferType') IS NULL OR (transfer_info->>'transferType') NOT IN ('user', 'self')) AND (COALESCE((transfer_info->>'excludedFromCalculations')::boolean, false) = false)
      )
    )`
  ];
  const params = [dateFrom || null, dateTo || null, userId || null];
  return { whereSql: 'WHERE ' + conditions.join(' AND '), params };
}

app.get('/api/stats', async (req, res) => {
  try {
    const dateFrom = req.query.dateFrom || undefined;
    const dateTo = req.query.dateTo || undefined;
    const userId = req.query.userId || undefined;
    const { whereSql, params } = buildStatsWhereClause(dateFrom, dateTo, userId);

    const baseTable = `(SELECT id, date, type, amount, category, description, user_id FROM transactions ${whereSql}) filtered`;
    const totalResult = await db.query(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0)::float AS total_expenses,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0)::float AS total_income
      FROM ${baseTable}`,
      params
    );
    const categoryResult = await db.query(
      `SELECT category, COALESCE(SUM(ABS(amount)), 0)::float AS total
       FROM ${baseTable} WHERE type = 'expense' GROUP BY category`,
      params
    );
    const incomeCategoryResult = await db.query(
      `SELECT category, COALESCE(SUM(amount), 0)::float AS total
       FROM ${baseTable} WHERE type = 'income' GROUP BY category`,
      params
    );
    const monthlyResult = await db.query(
      `SELECT
        to_char(date, 'YYYY-MM') AS iso_month,
        to_char(date, 'Mon YYYY') AS display_month,
        date_trunc('month', date) AS month_start,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0)::float AS expenses,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0)::float AS income
       FROM ${baseTable}
       GROUP BY to_char(date, 'YYYY-MM'), to_char(date, 'Mon YYYY'), date_trunc('month', date)
       ORDER BY month_start`,
      params
    );
    const monthlyCategoryResult = await db.query(
      `SELECT
        to_char(date, 'Mon YYYY') AS display_month,
        date_trunc('month', date) AS month_start,
        category,
        COALESCE(SUM(ABS(amount)), 0)::float AS total
       FROM ${baseTable} WHERE type = 'expense'
       GROUP BY to_char(date, 'Mon YYYY'), date_trunc('month', date), category
       ORDER BY month_start`,
      params
    );
    const topExpensesResult = await db.query(
      `SELECT id, date, description, category, amount, type FROM ${baseTable}
       WHERE type = 'expense' ORDER BY ABS(amount) DESC LIMIT 10`,
      params
    );
    const topIncomeResult = await db.query(
      `SELECT id, date, description, category, amount, type FROM ${baseTable}
       WHERE type = 'income' ORDER BY amount DESC LIMIT 10`,
      params
    );

    const totalExpenses = parseFloat(totalResult.rows[0].total_expenses) || 0;
    const totalIncome = parseFloat(totalResult.rows[0].total_income) || 0;
    const categoryBreakdown = {};
    categoryResult.rows.forEach(row => {
      const cat = row.category || 'Uncategorized';
      categoryBreakdown[cat] = parseFloat(row.total) || 0;
    });
    const incomeCategoryBreakdown = {};
    incomeCategoryResult.rows.forEach(row => {
      const cat = row.category || 'Uncategorized';
      incomeCategoryBreakdown[cat] = parseFloat(row.total) || 0;
    });
    const monthlyData = monthlyResult.rows.map(row => ({
      month: row.display_month,
      expenses: parseFloat(row.expenses) || 0,
      income: parseFloat(row.income) || 0
    }));
    const monthOrder = monthlyResult.rows.map(r => r.display_month);
    const monthlyCategoryMap = new Map();
    monthlyCategoryResult.rows.forEach(row => {
      const key = row.display_month;
      if (!monthlyCategoryMap.has(key)) {
        monthlyCategoryMap.set(key, { month: key });
      }
      monthlyCategoryMap.get(key)[row.category || 'Uncategorized'] = parseFloat(row.total) || 0;
    });
    const monthlyCategoryData = monthOrder.map(m => monthlyCategoryMap.get(m) || { month: m });

    const topExpenses = topExpensesResult.rows.map(row => ({
      id: row.id,
      date: row.date,
      description: row.description,
      category: row.category,
      amount: parseFloat(row.amount),
      type: 'expense',
      user: row.user_id || ''
    }));
    const topIncome = topIncomeResult.rows.map(row => ({
      id: row.id,
      date: row.date,
      description: row.description,
      category: row.category,
      amount: parseFloat(row.amount),
      type: 'income',
      user: row.user_id || ''
    }));

    res.json({
      totalExpenses,
      totalIncome,
      netAmount: totalIncome - totalExpenses,
      categoryBreakdown,
      incomeCategoryBreakdown,
      monthlyData,
      monthlyCategoryData,
      topExpenses,
      topIncome
    });
  } catch (error) {
    console.error('Error reading stats:', error);
    res.status(500).json({ error: 'Failed to read stats' });
  }
});

app.patch('/api/expenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const expenseData = req.body;

    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (expenseData.date) {
      fields.push(`date = $${paramIndex++}`);
      values.push(expenseData.date);
    }
    if (expenseData.description) {
      fields.push(`description = $${paramIndex++}`);
      values.push(expenseData.description);
    }
    if (expenseData.hasOwnProperty('category')) {
      fields.push(`category = $${paramIndex++}`);
      values.push(expenseData.category || null);
    }
    if (expenseData.amount) {
      fields.push(`amount = $${paramIndex++}`);
      values.push(expenseData.amount);
    }
    if (expenseData.type) {
      fields.push(`type = $${paramIndex++}`);
      values.push(expenseData.type);
    }
    if (expenseData.user) {
      fields.push(`user_id = $${paramIndex++}`);
      values.push(expenseData.user);
    }
    if (expenseData.labels) {
      fields.push(`labels = $${paramIndex++}`);
      values.push(JSON.stringify(expenseData.labels));
    }
    if (expenseData.excludedFromCalculations !== undefined) {
      fields.push(`excluded_from_calculations = $${paramIndex++}`);
      values.push(expenseData.excludedFromCalculations);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    const setClause = fields.join(', ');
    values.push(id);

    const query = `UPDATE transactions SET ${setClause} WHERE id = $${paramIndex}`;
    const result = await db.query(query, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const updatedResult = await db.query('SELECT * FROM transactions WHERE id = $1', [id]);
    const updatedExpense = rowToExpense(updatedResult.rows[0]);

    res.json(updatedExpense);
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const { expenses, metadata } = req.body;
    
    const client = await db.beginTransaction();
    try {
      // Delete all existing transactions
      await client.query('DELETE FROM transactions');
      
      // Insert all expenses
      for (const expense of expenses) {
        await client.query(
          `INSERT INTO transactions (
            id, date, description, category, amount, type, user_id,
            labels, metadata, transfer_info, excluded_from_calculations
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO UPDATE SET
            date = EXCLUDED.date,
            description = EXCLUDED.description,
            category = EXCLUDED.category,
            amount = EXCLUDED.amount,
            type = EXCLUDED.type,
            user_id = EXCLUDED.user_id,
            labels = EXCLUDED.labels,
            metadata = EXCLUDED.metadata,
            transfer_info = EXCLUDED.transfer_info,
            excluded_from_calculations = EXCLUDED.excluded_from_calculations,
            updated_at = CURRENT_TIMESTAMP`,
          [
            expense.id,
            expense.date,
            expense.description,
            expense.category || 'Uncategorized',
            expense.amount,
            expense.type,
            expense.user,
            JSON.stringify(expense.labels || []),
            JSON.stringify(expense.metadata || {}),
            expense.transferInfo ? JSON.stringify(expense.transferInfo) : null,
            expense.excludedFromCalculations || false
          ]
        );
      }
      
      // Save metadata if provided
      if (metadata) {
        await client.query(
          'INSERT INTO metadata (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
          ['storage_metadata', JSON.stringify(metadata)]
        );
      }
      
      await db.commitTransaction(client);
      
      res.json({ success: true, count: expenses.length });
    } catch (error) {
      await db.rollbackTransaction(client);
      throw error;
    }
  } catch (error) {
    console.error('Error saving expenses:', error);
    res.status(500).json({ error: 'Failed to save expenses' });
  }
});

app.post('/api/import-csv', async (req, res) => {
  try {
    const { csvText } = req.body;
    
    // Parse CSV
    const expenses = parseCSV(csvText);
    
    // Load existing expenses from database
    const existingResult = await db.query('SELECT * FROM transactions');
    const existingExpenses = existingResult.rows.map(row => ({
      id: row.id,
      date: row.date,
      description: row.description,
      category: row.category,
      amount: parseFloat(row.amount),
      type: row.type,
      user: row.user_id,
      labels: row.labels || [],
      metadata: row.metadata || {},
      transferInfo: row.transfer_info,
      excludedFromCalculations: row.excluded_from_calculations
    }));
    
    // Merge expenses
    const mergedExpenses = mergeExpenses(existingExpenses, expenses);
    
    // Detect transfers
    const { transfers, updatedTransactions } = detectTransfers(mergedExpenses);
    
    // Save merged data with transfer info to database
    const client = await db.beginTransaction();
    try {
      // Delete all existing transactions
      await client.query('DELETE FROM transactions');
      
      // Insert updated transactions
      for (const expense of updatedTransactions) {
        await client.query(
          `INSERT INTO transactions (
            id, date, description, category, amount, type, user_id,
            labels, metadata, transfer_info, excluded_from_calculations
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            expense.id,
            expense.date,
            expense.description,
            expense.category || 'Uncategorized',
            expense.amount,
            expense.type,
            expense.user,
            JSON.stringify(expense.labels || []),
            JSON.stringify(expense.metadata || {}),
            expense.transferInfo ? JSON.stringify(expense.transferInfo) : null,
            expense.excludedFromCalculations || false
          ]
        );
      }
      
      await db.commitTransaction(client);
    } catch (error) {
      await db.rollbackTransaction(client);
      throw error;
    }
    
    res.json({ 
      success: true, 
      imported: expenses.length,
      total: updatedTransactions.length,
      transfersDetected: transfers.length
    });
  } catch (error) {
    console.error('Error importing CSV:', error);
    res.status(500).json({ error: 'Failed to import CSV' });
  }
});

app.get('/api/export-csv', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM transactions ORDER BY date DESC');
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No expenses found' });
    }
    
    // Convert database rows to expense format
    const expenses = result.rows.map(row => ({
      date: row.date,
      description: row.description,
      category: row.category,
      amount: parseFloat(row.amount),
      type: row.type
    }));
    
    // Create CSV content
    const headers = ['Date', 'Description', 'Category', 'Amount', 'Type'];
    const csvContent = [
      headers.join(','),
      ...expenses.map(exp => [
        exp.date,
        `"${exp.description}"`,
        `"${exp.category}"`,
        exp.amount.toString(),
        exp.type
      ].join(','))
    ].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=expenses.csv');
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

// Column Mapping Routes
app.get('/api/column-mappings', (req, res) => {
  try {
    const mappingsFile = getFilePath('mappings.json');
    if (!fs.existsSync(mappingsFile)) {
      return res.json([]);
    }
    
    const data = fs.readFileSync(mappingsFile, 'utf8');
    const mappings = JSON.parse(data);
    res.json(mappings);
  } catch (error) {
    console.error('Error reading column mappings:', error);
    res.status(500).json({ error: 'Failed to read column mappings' });
  }
});

app.post('/api/column-mappings', (req, res) => {
  try {
    const { mapping } = req.body;
    
    // Load existing mappings
    let mappings = [];
    const mappingsFile = getFilePath('mappings.json');
    if (fs.existsSync(mappingsFile)) {
      const data = fs.readFileSync(mappingsFile, 'utf8');
      mappings = JSON.parse(data);
    }
    
    // Add new mapping
    mappings.push(mapping);
    
    // Save mappings
    ensureArtifactsDir();
    fs.writeFileSync(mappingsFile, JSON.stringify(mappings, null, 2));
    
    res.json({ success: true, count: mappings.length });
  } catch (error) {
    console.error('Error saving column mapping:', error);
    res.status(500).json({ error: 'Failed to save column mapping' });
  }
});

app.post('/api/import-with-mapping', async (req, res) => {
  try {
    const { csvText, mapping, userId } = req.body;
    
    // Validate required fields
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    // Load existing expenses from database
    const existingResult = await db.query('SELECT * FROM transactions');
    const existingExpenses = existingResult.rows.map(row => ({
      id: row.id,
      date: row.date,
      description: row.description,
      category: row.category,
      amount: parseFloat(row.amount),
      type: row.type,
      user: row.user_id,
      labels: row.labels || [],
      metadata: row.metadata || {},
      transferInfo: row.transfer_info,
      excludedFromCalculations: row.excluded_from_calculations
    }));
    
    // Parse CSV with mapping and userId, pass existing expenses for category suggestion
    const { expenses, autoFilledCategories } = parseCSVWithMapping(csvText, mapping, userId, existingExpenses);
    
    // Merge expenses
    const mergedExpenses = mergeExpenses(existingExpenses, expenses);
    
    // Detect transfers
    const { transfers, updatedTransactions } = detectTransfers(mergedExpenses);
    
    // Save merged data with transfer info to database
    const client = await db.beginTransaction();
    try {
      // Delete all existing transactions
      await client.query('DELETE FROM transactions');
      
      // Insert updated transactions
      for (const expense of updatedTransactions) {
        await client.query(
          `INSERT INTO transactions (
            id, date, description, category, amount, type, user_id,
            labels, metadata, transfer_info, excluded_from_calculations
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            expense.id,
            expense.date,
            expense.description,
            expense.category || 'Uncategorized',
            expense.amount,
            expense.type,
            expense.user,
            JSON.stringify(expense.labels || []),
            JSON.stringify(expense.metadata || {}),
            expense.transferInfo ? JSON.stringify(expense.transferInfo) : null,
            expense.excludedFromCalculations || false
          ]
        );
      }
      
      await db.commitTransaction(client);
    } catch (error) {
      await db.rollbackTransaction(client);
      throw error;
    }
    
    res.json({ 
      success: true, 
      imported: expenses.length,
      total: updatedTransactions.length,
      transfersDetected: transfers.length,
      autoFilledCategories
    });
  } catch (error) {
    console.error('Error importing CSV with mapping:', error);
    res.status(500).json({ error: 'Failed to import CSV with mapping' });
  }
});

app.get('/api/date-range', async (req, res) => {
  try {
    const dateRangeFile = getFilePath('date-range.json');
    if (fs.existsSync(dateRangeFile)) {
      const data = fs.readFileSync(dateRangeFile, 'utf8');
      const dateRange = JSON.parse(data);
      return res.json(dateRange);
    }

    try {
      const result = await db.query(
        'SELECT start_date, end_date FROM date_ranges ORDER BY created_at DESC LIMIT 1'
      );
      if (result.rows.length > 0) {
        const row = result.rows[0];
        const dateRange = { start: row.start_date, end: row.end_date };
        return res.json(dateRange);
      }
    } catch (dbErr) {
      // DB might not have date_ranges or table empty
    }

    const now = new Date();
    const end = now;
    const start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()); // One month ago from today
    const defaultRange = { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    res.json(defaultRange);
  } catch (error) {
    console.error('Error reading date range:', error);
    res.status(500).json({ error: 'Failed to read date range' });
  }
});

app.post('/api/date-range', async (req, res) => {
  try {
    const { start, end } = req.body;
    
    await db.query(
      'INSERT INTO date_ranges (start_date, end_date) VALUES ($1, $2) ON CONFLICT (start_date, end_date) DO UPDATE SET created_at = CURRENT_TIMESTAMP',
      [start, end]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving date range:', error);
    res.status(500).json({ error: 'Failed to save date range' });
  }
});

// Category Routes
app.get('/api/categories', async (req, res) => {
  try {
    const result = await db.query('SELECT name FROM categories ORDER BY name');
    
    let categories = result.rows.map(row => row.name);
    
    // If no categories exist, return defaults
    if (categories.length === 0) {
      const defaultCategories = [
        'Food & Drink',
        'Shopping',
        'Travel',
        'Health & Wellness',
        'Groceries',
        'Bills & Utilities',
        'Entertainment',
        'Personal',
        'Professional Services',
        'Uncategorized'
      ];
      categories = defaultCategories;
    }
    
    res.json({ categories });
  } catch (error) {
    console.error('Error reading categories:', error);
    res.status(500).json({ error: 'Failed to read categories' });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const { categories } = req.body;
    
    const client = await db.beginTransaction();
    try {
      // Delete all existing categories
      await client.query('DELETE FROM categories');
      
      // Insert all categories
      for (const category of categories) {
        await client.query(
          'INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
          [category]
        );
      }
      
      await db.commitTransaction(client);
    } catch (error) {
      await db.rollbackTransaction(client);
      throw error;
    }
    
    res.json({ success: true, count: categories.length });
  } catch (error) {
    console.error('Error saving categories:', error);
    res.status(500).json({ error: 'Failed to save categories' });
  }
});

// User Routes
app.get('/api/users', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM users ORDER BY created_at');
    
    let users = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at
    }));
    
    // If no users exist, return default user
    if (users.length === 0) {
      users = [
        {
          id: 'default-user',
          name: 'Default',
          createdAt: new Date().toISOString()
        }
      ];
    }
    
    res.json({ users });
  } catch (error) {
    console.error('Error reading users:', error);
    res.status(500).json({ error: 'Failed to read users' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { users } = req.body;
    
    const client = await db.beginTransaction();
    try {
      // Delete all existing users
      await client.query('DELETE FROM users');
      
      // Insert all users
      for (const user of users) {
        await client.query(
          'INSERT INTO users (id, name, created_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name',
          [user.id, user.name, user.createdAt || new Date().toISOString()]
        );
      }
      
      await db.commitTransaction(client);
    } catch (error) {
      await db.rollbackTransaction(client);
      throw error;
    }
    
    res.json({ success: true, count: users.length });
  } catch (error) {
    console.error('Error saving users:', error);
    res.status(500).json({ error: 'Failed to save users' });
  }
});

// Report Routes
app.get('/api/reports', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM reports ORDER BY created_at DESC');
    
    const reports = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      filters: row.filters,
      createdAt: row.created_at,
      lastModified: row.last_modified
    }));
    
    res.json(reports);
  } catch (error) {
    console.error('Error reading reports:', error);
    res.status(500).json({ error: 'Failed to read reports' });
  }
});

app.post('/api/reports', async (req, res) => {
  try {
    const { report } = req.body;
    
    await db.query(
      `INSERT INTO reports (id, name, description, filters, created_at, last_modified)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         filters = EXCLUDED.filters,
         last_modified = EXCLUDED.last_modified`,
      [
        report.id,
        report.name,
        report.description || null,
        JSON.stringify(report.filters || {}),
        report.createdAt || new Date().toISOString(),
        report.lastModified || new Date().toISOString()
      ]
    );
    
    res.json({ success: true, reportId: report.id });
  } catch (error) {
    console.error('Error saving report:', error);
    res.status(500).json({ error: 'Failed to save report' });
  }
});

app.delete('/api/reports/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    
    await db.query('DELETE FROM reports WHERE id = $1', [reportId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

app.post('/api/reports/:reportId/data', async (req, res) => {
  try {
    const { reportId } = req.params;
    const { reportData } = req.body;
    
    // Report data is now computed dynamically, so we don't need to store it
    // This endpoint is kept for backwards compatibility but does nothing
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving report data:', error);
    res.status(500).json({ error: 'Failed to save report data' });
  }
});

app.get('/api/reports/:reportId/data', async (req, res) => {
  try {
    const { reportId } = req.params;
    
    // Report data is now computed dynamically, so return 404
    // This endpoint is kept for backwards compatibility
    
    return res.status(404).json({ error: 'Report data not found' });
  } catch (error) {
    console.error('Error reading report data:', error);
    res.status(500).json({ error: 'Failed to read report data' });
  }
});

// Source Routes
app.get('/api/sources', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM sources ORDER BY created_at');
    
    const sources = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      mappings: row.mappings,
      flipIncomeExpense: row.flip_income_expense,
      createdAt: row.created_at,
      lastUsed: row.last_used
    }));
    
    res.json(sources);
  } catch (error) {
    console.error('Error reading sources:', error);
    res.status(500).json({ error: 'Failed to read sources' });
  }
});

app.post('/api/sources', async (req, res) => {
  try {
    const { source } = req.body;
    
    // Check if source name already exists
    const existingResult = await db.query('SELECT id FROM sources WHERE name = $1', [source.name]);
    if (existingResult.rows.length > 0) {
      return res.status(400).json({ error: 'Source name already exists' });
    }
    
    // Insert new source
    await db.query(
      `INSERT INTO sources (id, name, mappings, flip_income_expense, created_at, last_used)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        source.id,
        source.name,
        JSON.stringify(source.mappings || []),
        source.flipIncomeExpense || false,
        source.createdAt || new Date().toISOString(),
        source.lastUsed || new Date().toISOString()
      ]
    );
    
    // Get all sources
    const allSourcesResult = await db.query('SELECT * FROM sources ORDER BY created_at');
    const sources = allSourcesResult.rows.map(row => ({
      id: row.id,
      name: row.name,
      mappings: row.mappings,
      flipIncomeExpense: row.flip_income_expense,
      createdAt: row.created_at,
      lastUsed: row.last_used
    }));
    
    res.json({ success: true, sources });
  } catch (error) {
    console.error('Error saving source:', error);
    res.status(500).json({ error: 'Failed to save source' });
  }
});

app.delete('/api/sources/:sourceName', async (req, res) => {
  try {
    const { sourceName } = req.params;
    
    await db.query('DELETE FROM sources WHERE name = $1', [sourceName]);
    
    // Get all remaining sources
    const result = await db.query('SELECT * FROM sources ORDER BY created_at');
    const sources = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      mappings: row.mappings,
      flipIncomeExpense: row.flip_income_expense,
      createdAt: row.created_at,
      lastUsed: row.last_used
    }));
    
    res.json({ success: true, sources });
  } catch (error) {
    console.error('Error deleting source:', error);
    res.status(500).json({ error: 'Failed to delete source' });
  }
});

// Update source
app.put('/api/sources/:sourceId', async (req, res) => {
  try {
    const { sourceId } = req.params;
    const { source } = req.body;
    
    // Check if source exists
    const existingResult = await db.query('SELECT id FROM sources WHERE id = $1', [sourceId]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Source not found' });
    }
    
    // Check if the new name conflicts with other sources
    const nameConflictResult = await db.query(
      'SELECT id FROM sources WHERE name = $1 AND id != $2',
      [source.name, sourceId]
    );
    if (nameConflictResult.rows.length > 0) {
      return res.status(400).json({ error: 'Source name already exists' });
    }
    
    // Update the source
    await db.query(
      `UPDATE sources SET
         name = $1,
         mappings = $2,
         flip_income_expense = $3,
         last_used = $4
       WHERE id = $5`,
      [
        source.name,
        JSON.stringify(source.mappings || []),
        source.flipIncomeExpense || false,
        source.lastUsed || new Date().toISOString(),
        sourceId
      ]
    );
    
    // Get all sources
    const allSourcesResult = await db.query('SELECT * FROM sources ORDER BY created_at');
    const sources = allSourcesResult.rows.map(row => ({
      id: row.id,
      name: row.name,
      mappings: row.mappings,
      flipIncomeExpense: row.flip_income_expense,
      createdAt: row.created_at,
      lastUsed: row.last_used
    }));
    
    res.json({ success: true, sources });
  } catch (error) {
    console.error('Error updating source:', error);
    res.status(500).json({ error: 'Failed to update source' });
  }
});

// Delete all data (transactions and sources)
app.delete('/api/delete-all', async (req, res) => {
  try {
    await db.query('DELETE FROM transactions');
    await db.query('DELETE FROM sources');
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting all data:', error);
    res.status(500).json({ error: 'Failed to delete all data' });
  }
});

// Delete selected data
app.post('/api/delete-selected', async (req, res) => {
  try {
    const { deleteTransactions, deleteSources, sourceIds } = req.body;
    
    // Delete all transactions
    if (deleteTransactions) {
      await db.query('DELETE FROM transactions');
    }
    
    // Delete selected sources
    if (deleteSources && Array.isArray(sourceIds) && sourceIds.length > 0) {
      await db.query('DELETE FROM sources WHERE id = ANY($1)', [sourceIds]);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting selected data:', error);
    res.status(500).json({ error: 'Failed to delete selected data' });
  }
});

// Undo Import Routes
app.post('/api/undo-import', (req, res) => {
  try {
    const { importSessionId, importedAt, sourceName } = req.body;
    
    // Load existing expenses
    let existingExpenses = [];
    const transactionsFile = getFilePath('transactions.json');
    if (fs.existsSync(transactionsFile)) {
      const data = fs.readFileSync(transactionsFile, 'utf8');
      existingExpenses = JSON.parse(data);
    }
    
    // Find transactions to remove
    const transactionsToRemove = existingExpenses.filter(transaction => {
      const metadata = transaction.metadata;
      return metadata && 
             metadata.sourceName === sourceName && 
             metadata.importedAt === importedAt;
    });
    
    const transactionsToKeep = existingExpenses.filter(transaction => {
      const metadata = transaction.metadata;
      return !metadata || 
             metadata.sourceName !== sourceName || 
             metadata.importedAt !== importedAt;
    });
    
    if (transactionsToRemove.length === 0) {
      return res.status(404).json({ error: 'No transactions found to undo' });
    }
    
    // Create backup
    const backupFile = path.join(getArtifactsDir(), `transactions_backup_${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(existingExpenses, null, 2));
    
    // Save the filtered transactions
    ensureArtifactsDir();
    fs.writeFileSync(transactionsFile, JSON.stringify(transactionsToKeep, null, 2));
    
    res.json({ 
      success: true, 
      removed: transactionsToRemove.length,
      total: transactionsToKeep.length,
      backupFile: path.basename(backupFile)
    });
  } catch (error) {
    console.error('Error undoing import:', error);
    res.status(500).json({ error: 'Failed to undo import' });
  }
});

// Helper functions
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = parseCSVLine(lines[0]);
  
  return lines.slice(1)
    .filter((line) => {
      const values = parseCSVLine(line);
      const type = values[4] || '';
      return type !== 'Payment';
    })
    .map((line, index) => {
      const values = parseCSVLine(line);
      const amount = parseFloat(values[5] ? values[5].replace(/[,$"]/g, '') : '0') || 0;
      
      return {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        date: values[0],
        description: values[2],
        category: values[3] || 'Uncategorized',
        amount: Math.abs(amount),
        type: amount < 0 ? 'expense' : 'income',
        metadata: {
          sourceName: 'Manual Import',
          importedAt: new Date().toISOString()
        }
      };
    });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add the last field
  result.push(current.trim());
  
  return result;
}

function mergeExpenses(existing, newExpenses) {
  const merged = [...existing];
  
  for (const newExpense of newExpenses) {
    const exists = merged.some(exp => 
      exp.date === newExpense.date &&
      exp.description === newExpense.description &&
      exp.amount === newExpense.amount &&
      exp.type === newExpense.type
    );
    
    if (!exists) {
      merged.push(newExpense);
    }
  }
  
  return merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// Intelligent category matching function
function findSimilarTransactionCategory(description, existingTransactions, maxResults = 100) {
  if (!description || !existingTransactions || existingTransactions.length === 0) {
    return null;
  }

  const descLower = description.toLowerCase().trim();
  
  // Get the most recent transactions (up to maxResults)
  const recentTransactions = existingTransactions
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, maxResults)
    .filter(t => t.category && t.category !== 'Uncategorized');

  if (recentTransactions.length === 0) {
    return null;
  }

  // Calculate similarity scores for each transaction
  const similarities = recentTransactions.map(transaction => {
    const transactionDesc = transaction.description.toLowerCase().trim();
    const similarity = calculateDescriptionSimilarity(descLower, transactionDesc);
    return {
      transaction,
      similarity,
      category: transaction.category
    };
  });

  // Filter out very low similarity matches and sort by similarity
  const goodMatches = similarities
    .filter(match => match.similarity > 0.3) // Minimum 30% similarity
    .sort((a, b) => b.similarity - a.similarity);

  if (goodMatches.length === 0) {
    return null;
  }

  // Group by category and calculate average similarity
  const categoryScores = new Map();
  goodMatches.forEach(match => {
    const category = match.category;
    if (!categoryScores.has(category)) {
      categoryScores.set(category, { total: 0, count: 0, maxSimilarity: 0 });
    }
    const score = categoryScores.get(category);
    score.total += match.similarity;
    score.count += 1;
    score.maxSimilarity = Math.max(score.maxSimilarity, match.similarity);
  });

  // Find the category with the highest average similarity
  let bestCategory = null;
  let bestScore = 0;

  categoryScores.forEach((score, category) => {
    const avgSimilarity = score.total / score.count;
    // Weight by both average similarity and max similarity
    const weightedScore = (avgSimilarity * 0.7) + (score.maxSimilarity * 0.3);
    
    if (weightedScore > bestScore) {
      bestScore = weightedScore;
      bestCategory = category;
    }
  });

  // Only return if we have a reasonably good match
  return bestScore > 0.4 ? bestCategory : null;
}

// Calculate similarity between two descriptions using multiple methods
function calculateDescriptionSimilarity(desc1, desc2) {
  if (desc1 === desc2) return 1.0;
  
  // Method 1: Exact word matching
  const words1 = new Set(desc1.split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(desc2.split(/\s+/).filter(w => w.length > 2));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  const jaccardSimilarity = intersection.size / union.size;
  
  // Method 2: Substring matching
  let substringScore = 0;
  const words1Array = Array.from(words1);
  const words2Array = Array.from(words2);
  
  for (const word1 of words1Array) {
    for (const word2 of words2Array) {
      if (word1.includes(word2) || word2.includes(word1)) {
        substringScore += 0.5;
      }
    }
  }
  const normalizedSubstringScore = Math.min(substringScore / Math.max(words1.size, words2.size), 1);
  
  // Method 3: Common merchant/company name detection
  let merchantScore = 0;
  const commonMerchants = ['amazon', 'walmart', 'target', 'starbucks', 'mcdonalds', 'uber', 'lyft', 'netflix', 'spotify'];
  const desc1Lower = desc1.toLowerCase();
  const desc2Lower = desc2.toLowerCase();
  
  for (const merchant of commonMerchants) {
    if (desc1Lower.includes(merchant) && desc2Lower.includes(merchant)) {
      merchantScore += 0.3;
    }
  }
  
  // Combine all methods with weights
  const finalScore = (jaccardSimilarity * 0.5) + (normalizedSubstringScore * 0.3) + (merchantScore * 0.2);
  
  return Math.min(finalScore, 1.0);
}

function parseCSVWithMapping(csvText, mapping, userId, existingTransactions = []) {
  const lines = csvText.trim().split('\n');
  const headers = parseCSVLine(lines[0]);
  
  // Create a mapping from CSV column index to standardized column
  const columnIndexMap = new Map();
  mapping.mappings.forEach(m => {
    if (m.standardColumn !== 'Ignore') {
      const csvIndex = headers.findIndex(h => h === m.csvColumn);
      if (csvIndex !== -1) {
        columnIndexMap.set(csvIndex, m.standardColumn);
      }
    }
  });

  // Track auto-filled categories
  const autoFilledCategories = [];

  const expenses = lines.slice(1)
    .map((line, index) => {
      const values = parseCSVLine(line);
      
      // Extract values based on mapping
      let date = '';
      let description = '';
      let category = '';
      let amount = 0;

      columnIndexMap.forEach((standardCol, csvIndex) => {
        const value = values[csvIndex] || '';
        switch (standardCol) {
          case 'Transaction Date':
            date = value;
            break;
          case 'Description':
            description = value;
            break;
          case 'Category':
            category = value || 'Uncategorized';
            break;
          case 'Amount':
            amount = parseFloat(value.replace(/[,$\"]/g, '')) || 0;
            break;
        }
      });

      // Intelligent category suggestion if missing or Uncategorized
      if ((!category || category === 'Uncategorized') && description && existingTransactions.length > 0) {
        const suggested = findSimilarTransactionCategory(description, existingTransactions, 100);
        if (suggested) {
          autoFilledCategories.push({
            row: index + 1, // +1 to match CSV line (excluding header)
            description,
            suggestedCategory: suggested
          });
          category = suggested;
        }
      }

      // Handle flipIncomeExpense option
      let transactionType = amount < 0 ? 'expense' : 'income';
      if (mapping.flipIncomeExpense) {
        transactionType = amount > 0 ? 'expense' : 'income';
      }

      return {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        date,
        description,
        category,
        amount: Math.abs(amount),
        type: transactionType,
        metadata: {
          sourceId: mapping.id,
          sourceName: mapping.name,
          importedAt: new Date().toISOString()
        },
        user: userId
      };
    })
    .filter(expense => expense.date && expense.description && expense.amount > 0);

  return { expenses, autoFilledCategories };
}

// Transfer detection functions
function detectTransfers(transactions) {
  const transfers = [];
  const updatedTransactions = [...transactions];
  const processedIds = new Set();

  // Group transactions by source
  const transactionsBySource = new Map();
  
  transactions.forEach(transaction => {
    const sourceId = transaction.metadata?.sourceId || 'manual';
    if (!transactionsBySource.has(sourceId)) {
      transactionsBySource.set(sourceId, []);
    }
    transactionsBySource.get(sourceId).push(transaction);
  });

  // Find potential transfer pairs
  const sourceIds = Array.from(transactionsBySource.keys());
  
  // Look for transfers between different sources
  for (let i = 0; i < sourceIds.length; i++) {
    for (let j = i + 1; j < sourceIds.length; j++) {
      const source1 = sourceIds[i];
      const source2 = sourceIds[j];
      
      const source1Transactions = transactionsBySource.get(source1);
      const source2Transactions = transactionsBySource.get(source2);
      
      // Look for matching credit/debit pairs
      for (const t1 of source1Transactions) {
        if (processedIds.has(t1.id)) continue;
        
        for (const t2 of source2Transactions) {
          if (processedIds.has(t2.id)) continue;
          
          if (isTransferPair(t1, t2)) {
            const transferId = `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const confidence = calculateTransferConfidence(t1, t2);
            
            transfers.push({
              credit: t1.type === 'income' ? t1 : t2,
              debit: t1.type === 'expense' ? t1 : t2,
              transferId,
              confidence
            });
            
            processedIds.add(t1.id);
            processedIds.add(t2.id);
            break;
          }
        }
      }
    }
  }

  // Look for transfers within the same source but between different users
  for (const sourceId of sourceIds) {
    const sourceTransactions = transactionsBySource.get(sourceId);
    
    // Group by user within this source
    const transactionsByUser = new Map();
    sourceTransactions.forEach(transaction => {
      const userId = transaction.user;
      if (!transactionsByUser.has(userId)) {
        transactionsByUser.set(userId, []);
      }
      transactionsByUser.get(userId).push(transaction);
    });
    
    const userIds = Array.from(transactionsByUser.keys());
    
    // Look for transfers between different users within the same source
    for (let i = 0; i < userIds.length; i++) {
      for (let j = i + 1; j < userIds.length; j++) {
        const user1 = userIds[i];
        const user2 = userIds[j];
        
        const user1Transactions = transactionsByUser.get(user1);
        const user2Transactions = transactionsByUser.get(user2);
        
        // Look for matching credit/debit pairs
        for (const t1 of user1Transactions) {
          if (processedIds.has(t1.id)) continue;
          
          for (const t2 of user2Transactions) {
            if (processedIds.has(t2.id)) continue;
            
            if (isTransferPair(t1, t2)) {
              const transferId = `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              const confidence = calculateTransferConfidence(t1, t2);
              
              transfers.push({
                credit: t1.type === 'income' ? t1 : t2,
                debit: t1.type === 'expense' ? t1 : t2,
                transferId,
                confidence
              });
              
              processedIds.add(t1.id);
              processedIds.add(t2.id);
              break;
            }
          }
        }
      }
    }
  }

  // Update transactions with transfer info
  transfers.forEach(transfer => {
    const creditIndex = updatedTransactions.findIndex(t => t.id === transfer.credit.id);
    const debitIndex = updatedTransactions.findIndex(t => t.id === transfer.debit.id);
    
    // Determine transfer type based on users
    const transferType = transfer.credit.user === transfer.debit.user ? 'self' : 'user';
    
    if (creditIndex !== -1) {
      updatedTransactions[creditIndex] = {
        ...updatedTransactions[creditIndex],
        transferInfo: {
          isTransfer: true,
          transferId: transfer.transferId,
          transferType,
          excludedFromCalculations: true,
          userOverride: false
        }
      };
    }
    
    if (debitIndex !== -1) {
      updatedTransactions[debitIndex] = {
        ...updatedTransactions[debitIndex],
        transferInfo: {
          isTransfer: true,
          transferId: transfer.transferId,
          transferType,
          excludedFromCalculations: true,
          userOverride: false
        }
      };
    }
  });

  return { transfers, updatedTransactions };
}

function isTransferPair(t1, t2) {
  // Must be from different sources OR same source but different users
  const source1 = t1.metadata?.sourceId || 'manual';
  const source2 = t2.metadata?.sourceId || 'manual';
  const user1 = t1.user;
  const user2 = t2.user;
  
  // If same source, must be different users
  if (source1 === source2 && user1 === user2) return false;
  
  // Must be opposite types (income vs expense)
  if (t1.type === t2.type) return false;
  
  // Must have EXACT matching amounts (no tolerance)
  if (Math.abs(t1.amount) !== Math.abs(t2.amount)) return false;
  
  // Must be within ±4 days
  const date1 = new Date(t1.date);
  const date2 = new Date(t2.date);
  const daysDiff = Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff > 4) return false;
  
  return true;
}

function calculateTransferConfidence(t1, t2) {
  let confidence = 0.5; // Base confidence
  
  // Amount match (exact match = higher confidence)
  if (Math.abs(t1.amount) === Math.abs(t2.amount)) {
    confidence += 0.4; // Exact amount match gets high confidence
  } else {
    return 0; // No confidence if amounts don't match exactly
  }
  
  // Date proximity (closer = higher confidence)
  const date1 = new Date(t1.date);
  const date2 = new Date(t2.date);
  const daysDiff = Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff === 0) confidence += 0.2;
  else if (daysDiff <= 1) confidence += 0.15;
  else if (daysDiff <= 2) confidence += 0.1;
  else if (daysDiff <= 3) confidence += 0.05;
  
  // Description similarity
  const desc1 = t1.description.toLowerCase();
  const desc2 = t2.description.toLowerCase();
  if (desc1.includes('transfer') || desc2.includes('transfer')) confidence += 0.1;
  if (desc1.includes('move') || desc2.includes('move')) confidence += 0.05;
  
  return Math.min(confidence, 1);
}

// Transfer management endpoint
app.post('/api/transfer-override', async (req, res) => {
  try {
    const { transactionId, includeInCalculations, isTestMode: requestTestMode } = req.body;
    
    // Temporarily set test mode for this request
    const originalTestMode = isTestMode;
    if (requestTestMode !== undefined && requestTestMode !== isTestMode) {
      isTestMode = requestTestMode;
      db.setTestMode(requestTestMode);
    }
    
    // Get the transaction
    const transactionResult = await db.query('SELECT * FROM transactions WHERE id = $1', [transactionId]);
    if (transactionResult.rows.length === 0) {
      // Restore original test mode
      if (requestTestMode !== undefined && requestTestMode !== originalTestMode) {
        isTestMode = originalTestMode;
        db.setTestMode(originalTestMode);
      }
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    const transaction = transactionResult.rows[0];
    const transferInfo = transaction.transfer_info;
    
    if (!transferInfo || !transferInfo.isTransfer) {
      // Restore original test mode
      if (requestTestMode !== undefined && requestTestMode !== originalTestMode) {
        isTestMode = originalTestMode;
        db.setTestMode(originalTestMode);
      }
      return res.status(400).json({ error: 'Transaction is not a transfer' });
    }
    
    // Update the transfer info
    const updatedTransferInfo = {
      ...transferInfo,
      excludedFromCalculations: !includeInCalculations,
      userOverride: true
    };
    
    // Update this transaction
    await db.query(
      'UPDATE transactions SET transfer_info = $1 WHERE id = $2',
      [JSON.stringify(updatedTransferInfo), transactionId]
    );
    
    // If this is part of a transfer pair, update the other transaction too
    if (transferInfo.transferId) {
      const transferId = transferInfo.transferId;
      await db.query(
        `UPDATE transactions SET transfer_info = $1
         WHERE transfer_info->>'transferId' = $2 AND id != $3`,
        [JSON.stringify(updatedTransferInfo), transferId, transactionId]
      );
    }
    
    // Restore original test mode
    if (requestTestMode !== undefined && requestTestMode !== originalTestMode) {
      isTestMode = originalTestMode;
      db.setTestMode(originalTestMode);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating transfer override:', error);
    res.status(500).json({ error: 'Failed to update transfer override' });
  }
});

// Manual transfer detection endpoint
app.post('/api/detect-transfers', async (req, res) => {
  try {
    // Load all transactions from database
    const result = await db.query('SELECT * FROM transactions');
    const transactions = result.rows.map(row => ({
      id: row.id,
      date: row.date,
      description: row.description,
      category: row.category,
      amount: parseFloat(row.amount),
      type: row.type,
      user: row.user_id,
      labels: row.labels || [],
      metadata: row.metadata || {},
      transferInfo: row.transfer_info,
      excludedFromCalculations: row.excluded_from_calculations
    }));
    
    if (transactions.length === 0) {
      return res.status(404).json({ error: 'No transactions found' });
    }
    
    // Detect transfers
    const { transfers, updatedTransactions } = detectTransfers(transactions);
    
    // Save updated transactions with transfer info to database
    const client = await db.beginTransaction();
    try {
      for (const expense of updatedTransactions) {
        await client.query(
          `UPDATE transactions SET
             transfer_info = $1,
             excluded_from_calculations = $2
           WHERE id = $3`,
          [
            expense.transferInfo ? JSON.stringify(expense.transferInfo) : null,
            expense.excludedFromCalculations || false,
            expense.id
          ]
        );
      }
      
      await db.commitTransaction(client);
    } catch (error) {
      await db.rollbackTransaction(client);
      throw error;
    }
    
    res.json({ 
      success: true, 
      transfersDetected: transfers.length,
      totalTransactions: updatedTransactions.length
    });
  } catch (error) {
    console.error('Error detecting transfers:', error);
    res.status(500).json({ error: 'Failed to detect transfers' });
  }
});

// Re-run transfer detection endpoint for backwards compatibility
app.post('/api/rerun-transfer-detection', (req, res) => {
  try {
    const transactionsFile = getFilePath('transactions.json');
    if (!fs.existsSync(transactionsFile)) {
      return res.status(404).json({ error: 'No transactions found' });
    }
    
    const data = fs.readFileSync(transactionsFile, 'utf8');
    const transactions = JSON.parse(data);
    
    // Remove existing transfer info from all transactions
    const cleanedTransactions = transactions.map(transaction => {
      const { transferInfo, ...rest } = transaction;
      return rest;
    });
    
    // Re-run transfer detection
    const { transfers, updatedTransactions } = detectTransfers(cleanedTransactions);
    
    // Save updated transactions
    ensureArtifactsDir();
    fs.writeFileSync(transactionsFile, JSON.stringify(updatedTransactions, null, 2));
    
    res.json({ 
      success: true, 
      totalTransactions: updatedTransactions.length,
      transfersDetected: transfers.length,
      message: 'Transfer detection completed successfully'
    });
  } catch (error) {
    console.error('Error re-running transfer detection:', error);
    res.status(500).json({ error: 'Failed to re-run transfer detection' });
  }
});

// Backup and Restore
const upload = multer({ storage: multer.memoryStorage() });

app.get('/api/backup', async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;

    const backup = {};

    const tables = [
      'categories',
      'users',
      'sources',
      'reports',
      'date_ranges',
      'metadata',
    ];

    for (const table of tables) {
      const result = await db.query(`SELECT * FROM ${table}`);
      backup[table] = result.rows;
    }

    let transactionsQuery = 'SELECT * FROM transactions';
    const params = [];
    if (dateFrom && dateTo) {
      transactionsQuery += ' WHERE date BETWEEN $1 AND $2';
      params.push(dateFrom, dateTo);
    }
    const transactionsResult = await db.query(transactionsQuery, params);
    backup.transactions = transactionsResult.rows;

    res.json(backup);
  } catch (error) {
    console.error('Error creating backup:', error);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

app.post('/api/restore', upload.single('backupFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No backup file provided' });
  }

  const backupData = JSON.parse(req.file.buffer.toString('utf8'));
  const client = await db.beginTransaction();

  try {
    // The order of insertion matters due to foreign key constraints.
    // However, since we are using ON CONFLICT DO NOTHING, and the IDs are preserved,
    // the order is less critical. But it's good practice to insert 'parent' tables first.
    
    if (backupData.users) {
      for (const user of backupData.users) {
        await client.query(
          'INSERT INTO users (id, name, created_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
          [user.id, user.name, user.created_at]
        );
      }
    }
    if (backupData.categories) {
      for (const category of backupData.categories) {
        await client.query(
          'INSERT INTO categories (name, created_at) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
          [category.name, category.created_at]
        );
      }
    }
    if (backupData.sources) {
        for (const source of backupData.sources) {
          await client.query(
            `INSERT INTO sources (id, name, mappings, flip_income_expense, created_at, last_used)
             VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
            [source.id, source.name, JSON.stringify(source.mappings), source.flip_income_expense, source.created_at, source.last_used]
          );
        }
    }
    if (backupData.transactions) {
        for (const transaction of backupData.transactions) {
            await client.query(
              `INSERT INTO transactions (id, date, description, category, amount, type, user_id, labels, metadata, transfer_info, excluded_from_calculations, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT (id) DO NOTHING`,
              [
                transaction.id,
                transaction.date,
                transaction.description,
                transaction.category,
                transaction.amount,
                transaction.type,
                transaction.user_id,
                JSON.stringify(transaction.labels),
                JSON.stringify(transaction.metadata),
                JSON.stringify(transaction.transfer_info),
                transaction.excluded_from_calculations,
                transaction.created_at,
                transaction.updated_at
              ]
            );
        }
    }
    if (backupData.reports) {
        for (const report of backupData.reports) {
          await client.query(
            `INSERT INTO reports (id, name, description, filters, created_at, last_modified)
             VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
            [report.id, report.name, report.description, JSON.stringify(report.filters), report.created_at, report.last_modified]
          );
        }
    }
    if (backupData.date_ranges) {
        for (const range of backupData.date_ranges) {
          await client.query(
            `INSERT INTO date_ranges (id, start_date, end_date, created_at)
             VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
            [range.id, range.start_date, range.end_date, range.created_at]
          );
        }
    }
    if (backupData.metadata) {
        for (const meta of backupData.metadata) {
          await client.query(
            `INSERT INTO metadata (key, value, updated_at)
             VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
            [meta.key, JSON.stringify(meta.value), meta.updated_at]
          );
        }
    }

    await db.commitTransaction(client);
    res.json({ success: true, message: 'Restore completed successfully.' });
  } catch (error) {
    await db.rollbackTransaction(client);
    console.error('Error restoring from backup:', error);
    res.status(500).json({ error: 'Failed to restore from backup' });
  }
});


app.listen(PORT, () => {



  console.log(`Server running on http://localhost:${PORT}`);



  console.log(`Artifacts directory: ${path.resolve(getArtifactsDir())}`);



});





 
