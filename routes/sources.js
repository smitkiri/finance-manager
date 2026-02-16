const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/sources', async (req, res) => {
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

router.post('/sources', async (req, res) => {
  try {
    const { source } = req.body;

    const existingResult = await db.query('SELECT id FROM sources WHERE name = $1', [source.name]);
    if (existingResult.rows.length > 0) {
      return res.status(400).json({ error: 'Source name already exists' });
    }

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

router.delete('/sources/:sourceName', async (req, res) => {
  try {
    const { sourceName } = req.params;

    await db.query('DELETE FROM sources WHERE name = $1', [sourceName]);

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

router.put('/sources/:sourceId', async (req, res) => {
  try {
    const { sourceId } = req.params;
    const { source } = req.body;

    const existingResult = await db.query('SELECT id FROM sources WHERE id = $1', [sourceId]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Source not found' });
    }

    const nameConflictResult = await db.query(
      'SELECT id FROM sources WHERE name = $1 AND id != $2',
      [source.name, sourceId]
    );
    if (nameConflictResult.rows.length > 0) {
      return res.status(400).json({ error: 'Source name already exists' });
    }

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

module.exports = router;
