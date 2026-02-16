const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/reports', async (req, res) => {
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

router.post('/reports', async (req, res) => {
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

router.delete('/reports/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;

    await db.query('DELETE FROM reports WHERE id = $1', [reportId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

router.post('/reports/:reportId/data', async (req, res) => {
  try {
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving report data:', error);
    res.status(500).json({ error: 'Failed to save report data' });
  }
});

router.get('/reports/:reportId/data', async (req, res) => {
  try {
    return res.status(404).json({ error: 'Report data not found' });
  } catch (error) {
    console.error('Error reading report data:', error);
    res.status(500).json({ error: 'Failed to read report data' });
  }
});

module.exports = router;
