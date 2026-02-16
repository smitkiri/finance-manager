const express = require('express');
const router = express.Router();
const db = require('../database');
const { buildExpensesWhereClause, buildStatsWhereClause, rowToExpense } = require('../helpers/queryBuilders');

router.get('/expenses', async (req, res) => {
  try {
    const limit = req.query.limit != null ? parseInt(req.query.limit, 10) : null;
    const offset = req.query.offset != null ? parseInt(req.query.offset, 10) : 0;

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

router.get('/stats', async (req, res) => {
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

router.patch('/expenses/:id', async (req, res) => {
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

router.post('/expenses', async (req, res) => {
  try {
    const { expenses, metadata } = req.body;

    const client = await db.beginTransaction();
    try {
      await client.query('DELETE FROM transactions');

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

module.exports = router;
