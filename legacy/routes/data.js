const express = require('express');
const router = express.Router();
const db = require('../database');
const { detectTransfers } = require('../helpers/transferDetection');

router.delete('/delete-all', async (req, res) => {
  try {
    await db.query('DELETE FROM transactions');
    await db.query('DELETE FROM sources');
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting all data:', error);
    res.status(500).json({ error: 'Failed to delete all data' });
  }
});

router.post('/delete-selected', async (req, res) => {
  try {
    const { deleteTransactions, deleteSources, sourceIds } = req.body;

    if (deleteTransactions) {
      await db.query('DELETE FROM transactions');
    }

    if (deleteSources && Array.isArray(sourceIds) && sourceIds.length > 0) {
      await db.query('DELETE FROM sources WHERE id = ANY($1)', [sourceIds]);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting selected data:', error);
    res.status(500).json({ error: 'Failed to delete selected data' });
  }
});

router.post('/undo-import', async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const deletedResult = await db.query(
      'DELETE FROM transactions WHERE import_id = $1 RETURNING id',
      [sessionId]
    );
    const removed = deletedResult.rows.length;

    await db.query('DELETE FROM import_sessions WHERE id = $1', [sessionId]);

    // Re-run transfer detection on remaining transactions
    const remaining = await db.query('SELECT * FROM transactions');
    if (remaining.rows.length > 0) {
      const transactions = remaining.rows.map((row) => ({
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
        importId: row.import_id || null,
      }));
      const { updatedTransactions } = detectTransfers(transactions);
      const client = await db.beginTransaction();
      try {
        for (const t of updatedTransactions) {
          await client.query(
            `UPDATE transactions SET transfer_info = $1, excluded_from_calculations = $2 WHERE id = $3`,
            [
              t.transferInfo ? JSON.stringify(t.transferInfo) : null,
              t.excludedFromCalculations || false,
              t.id,
            ]
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
    console.error('Error undoing import:', error);
    res.status(500).json({ error: 'Failed to undo import' });
  }
});

module.exports = router;
