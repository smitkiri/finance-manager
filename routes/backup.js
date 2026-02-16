const express = require('express');
const multer = require('multer');
const router = express.Router();
const db = require('../database');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/backup', async (req, res) => {
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

router.post('/restore', upload.single('backupFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No backup file provided' });
  }

  const backupData = JSON.parse(req.file.buffer.toString('utf8'));
  const client = await db.beginTransaction();

  try {
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

module.exports = router;
