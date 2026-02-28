const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /api/accounts - list accounts, optionally filtered by userId
router.get('/accounts', async (req, res) => {
  try {
    const { userId } = req.query;
    const params = [];
    let whereSql = '';
    if (userId) {
      params.push(userId);
      whereSql = 'WHERE user_id = $1';
    }
    const result = await db.query(
      `SELECT id, user_id, name, type, teller_enrollment_id, created_at, updated_at
       FROM accounts ${whereSql} ORDER BY type, name`,
      params
    );
    res.json(result.rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      type: r.type,
      tellerEnrollmentId: r.teller_enrollment_id ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })));
  } catch (error) {
    console.error('Error loading accounts:', error);
    res.status(500).json({ error: 'Failed to load accounts' });
  }
});

// POST /api/accounts - create account
router.post('/accounts', async (req, res) => {
  try {
    const { id, userId, name, type } = req.body;
    if (!id || !userId || !name || !type) {
      return res.status(400).json({ error: 'id, userId, name, and type are required' });
    }
    if (!['asset', 'liability'].includes(type)) {
      return res.status(400).json({ error: 'type must be "asset" or "liability"' });
    }
    const result = await db.query(
      `INSERT INTO accounts (id, user_id, name, type)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, name, type, created_at, updated_at`,
      [id, userId, name, type]
    );
    const r = result.rows[0];
    res.json({ id: r.id, userId: r.user_id, name: r.name, type: r.type, createdAt: r.created_at, updatedAt: r.updated_at });
  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// PUT /api/accounts/:id - update account name/type
router.put('/accounts/:id', async (req, res) => {
  try {
    const { name, type } = req.body;
    if (!name || !type) {
      return res.status(400).json({ error: 'name and type are required' });
    }
    if (!['asset', 'liability'].includes(type)) {
      return res.status(400).json({ error: 'type must be "asset" or "liability"' });
    }
    const result = await db.query(
      `UPDATE accounts SET name = $1, type = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, user_id, name, type, created_at, updated_at`,
      [name, type, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    const r = result.rows[0];
    res.json({ id: r.id, userId: r.user_id, name: r.name, type: r.type, createdAt: r.created_at, updatedAt: r.updated_at });
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// DELETE /api/accounts/:id
router.delete('/accounts/:id', async (req, res) => {
  try {
    const result = await db.query('DELETE FROM accounts WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// POST /api/accounts/:id/balances - add a balance entry
router.post('/accounts/:id/balances', async (req, res) => {
  try {
    const { id: balanceId, balance, date, note } = req.body;
    if (balanceId == null || balance == null || !date) {
      return res.status(400).json({ error: 'id, balance, and date are required' });
    }
    // Verify account exists
    const accountCheck = await db.query('SELECT id FROM accounts WHERE id = $1', [req.params.id]);
    if (accountCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    const result = await db.query(
      `INSERT INTO account_balances (id, account_id, balance, date, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, account_id, balance, date, note, created_at`,
      [balanceId, req.params.id, balance, date, note || null]
    );
    const r = result.rows[0];
    res.json({
      id: r.id,
      accountId: r.account_id,
      balance: parseFloat(r.balance),
      date: r.date,
      note: r.note,
      createdAt: r.created_at,
    });
  } catch (error) {
    console.error('Error adding account balance:', error);
    res.status(500).json({ error: 'Failed to add account balance' });
  }
});

// GET /api/accounts/:id/balances - get balance history for an account
router.get('/accounts/:id/balances', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, account_id, balance, date, note, created_at
       FROM account_balances
       WHERE account_id = $1
       ORDER BY date DESC, created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows.map(r => ({
      id: r.id,
      accountId: r.account_id,
      balance: parseFloat(r.balance),
      date: r.date,
      note: r.note,
      createdAt: r.created_at,
    })));
  } catch (error) {
    console.error('Error loading account balances:', error);
    res.status(500).json({ error: 'Failed to load account balances' });
  }
});

// DELETE /api/accounts/:id/balances/:balanceId - delete a balance entry
router.delete('/accounts/:id/balances/:balanceId', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM account_balances WHERE id = $1 AND account_id = $2 RETURNING id',
      [req.params.balanceId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Balance entry not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting account balance:', error);
    res.status(500).json({ error: 'Failed to delete account balance' });
  }
});

// GET /api/net-worth/summary - current net worth summary
router.get('/net-worth/summary', async (req, res) => {
  try {
    const { userId } = req.query;
    const params = [];
    let accountFilter = '';
    if (userId) {
      params.push(userId);
      accountFilter = 'AND a.user_id = $1';
    }

    // For each account, get the most recent balance
    const result = await db.query(
      `SELECT a.id, a.type,
        (SELECT ab.balance FROM account_balances ab
         WHERE ab.account_id = a.id
         ORDER BY ab.date DESC, ab.created_at DESC LIMIT 1) AS current_balance
       FROM accounts a
       WHERE 1=1 ${accountFilter}`,
      params
    );

    let totalAssets = 0;
    let totalLiabilities = 0;
    for (const row of result.rows) {
      const bal = parseFloat(row.current_balance) || 0;
      if (row.type === 'asset') totalAssets += bal;
      else totalLiabilities += bal;
    }

    res.json({
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
    });
  } catch (error) {
    console.error('Error computing net worth summary:', error);
    res.status(500).json({ error: 'Failed to compute net worth summary' });
  }
});

// GET /api/net-worth/history - net worth over time
router.get('/net-worth/history', async (req, res) => {
  try {
    const { userId } = req.query;
    const params = [];
    let accountFilter = '';
    if (userId) {
      params.push(userId);
      accountFilter = 'AND a.user_id = $1';
    }

    // Get all distinct dates where any balance was recorded for this user's accounts
    // Then for each date, compute the net worth using the most recent balance per account up to that date
    const result = await db.query(
      `WITH relevant_accounts AS (
         SELECT a.id, a.type
         FROM accounts a
         WHERE 1=1 ${accountFilter}
       ),
       all_dates AS (
         SELECT DISTINCT ab.date
         FROM account_balances ab
         JOIN relevant_accounts ra ON ra.id = ab.account_id
         ORDER BY ab.date
       ),
       account_date_balances AS (
         SELECT
           d.date,
           ra.id AS account_id,
           ra.type,
           (SELECT ab2.balance FROM account_balances ab2
            WHERE ab2.account_id = ra.id AND ab2.date <= d.date
            ORDER BY ab2.date DESC, ab2.created_at DESC LIMIT 1) AS balance
         FROM all_dates d
         CROSS JOIN relevant_accounts ra
       )
       SELECT
         date,
         COALESCE(SUM(CASE WHEN type = 'asset' AND balance IS NOT NULL THEN balance ELSE 0 END), 0) AS total_assets,
         COALESCE(SUM(CASE WHEN type = 'liability' AND balance IS NOT NULL THEN balance ELSE 0 END), 0) AS total_liabilities
       FROM account_date_balances
       GROUP BY date
       ORDER BY date`,
      params
    );

    res.json(result.rows.map(r => ({
      date: r.date,
      totalAssets: parseFloat(r.total_assets),
      totalLiabilities: parseFloat(r.total_liabilities),
      netWorth: parseFloat(r.total_assets) - parseFloat(r.total_liabilities),
    })));
  } catch (error) {
    console.error('Error computing net worth history:', error);
    res.status(500).json({ error: 'Failed to compute net worth history' });
  }
});

module.exports = router;
