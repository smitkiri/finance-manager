const express = require('express');
const fs = require('fs');
const router = express.Router();
const db = require('../database');
const { getFilePath } = require('../helpers/fileUtils');

router.get('/date-range', async (req, res) => {
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
    const start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    const defaultRange = { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    res.json(defaultRange);
  } catch (error) {
    console.error('Error reading date range:', error);
    res.status(500).json({ error: 'Failed to read date range' });
  }
});

router.post('/date-range', async (req, res) => {
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

module.exports = router;
