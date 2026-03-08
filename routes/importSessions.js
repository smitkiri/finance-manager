const express = require('express');
const router = express.Router();
const db = require('../database');
const { detectTransfers } = require('../helpers/transferDetection');

router.get('/import-sessions', async (req, res) => {
  try {
    // Clean up sessions older than 6 months (FK ON DELETE SET NULL handles orphan transactions)
    await db.query(`DELETE FROM import_sessions WHERE created_at < NOW() - INTERVAL '6 months'`);

    const result = await db.query(
      `SELECT id, created_at, user_id, source_id, source_name, file_name, transaction_count
       FROM import_sessions
       ORDER BY created_at DESC`
    );

    const sessions = result.rows.map(row => ({
      id: row.id,
      createdAt: row.created_at,
      userId: row.user_id,
      sourceId: row.source_id,
      sourceName: row.source_name,
      fileName: row.file_name,
      transactionCount: row.transaction_count
    }));

    res.json(sessions);
  } catch (error) {
    console.error('Error loading import sessions:', error);
    res.status(500).json({ error: 'Failed to load import sessions' });
  }
});

router.delete('/import-sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const deletedResult = await db.query(
      'DELETE FROM transactions WHERE import_id = $1 RETURNING id',
      [id]
    );
    const removed = deletedResult.rows.length;

    await db.query('DELETE FROM import_sessions WHERE id = $1', [id]);

    // Re-run transfer detection on remaining transactions
    const remaining = await db.query('SELECT * FROM transactions');
    if (remaining.rows.length > 0) {
      const transactions = remaining.rows.map(row => ({
        id: row.id,
        date: row.date,
        description: row.description,
        category: row.category,
        amount: parseFloat(row.amount),
        type: row.type,
        user: row.user_id,
        labels: row.labels || [],
        metadata: row.metadata || {},
        excludedFromCalculations: row.excluded_from_calculations,
        importId: row.import_id || null
      }));
      const { updatedTransactions } = detectTransfers(transactions);
      const client = await db.beginTransaction();
      try {
        for (const t of updatedTransactions) {
          await client.query(
            `UPDATE transactions SET transfer_info = $1, excluded_from_calculations = $2 WHERE id = $3`,
            [t.transferInfo ? JSON.stringify(t.transferInfo) : null, t.excludedFromCalculations || false, t.id]
          );
        }
        await db.commitTransaction(client);
      } catch (err) {
        await db.rollbackTransaction(client);
        throw err;
      }
    }

    res.json({ success: true, removed });
  } catch (error) {
    console.error('Error undoing import session:', error);
    res.status(500).json({ error: 'Failed to undo import session' });
  }
});

module.exports = router;
