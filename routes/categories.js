const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/categories', async (req, res) => {
  try {
    const result = await db.query('SELECT name FROM categories ORDER BY name');

    let categories = result.rows.map(row => row.name);

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

router.post('/categories', async (req, res) => {
  try {
    const { categories } = req.body;

    const client = await db.beginTransaction();
    try {
      await client.query('DELETE FROM categories');

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

module.exports = router;
