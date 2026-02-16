const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/users', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM users ORDER BY created_at');

    let users = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at
    }));

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

router.post('/users', async (req, res) => {
  try {
    const { users } = req.body;

    const client = await db.beginTransaction();
    try {
      await client.query('DELETE FROM users');

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

module.exports = router;
