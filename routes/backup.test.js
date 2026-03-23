const request = require('supertest');
const { app } = require('../tests/setup/testApp');
const { pool, cleanAllTables } = require('../tests/setup/testDb');
const {
  insertTransaction,
  insertCategory,
  insertUser,
  insertAccount,
  insertAccountBalance,
} = require('../tests/setup/fixtures');

afterEach(async () => {
  await cleanAllTables();
});

describe('GET /api/backup', () => {
  it('returns all data as JSON', async () => {
    await insertUser(pool, { id: 'user-1', name: 'Alice' });
    await insertCategory(pool, 'Food');
    await insertTransaction(pool, { description: 'Coffee' });

    const res = await request(app).get('/api/backup');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('transactions');
    expect(res.body).toHaveProperty('categories');
    expect(res.body).toHaveProperty('users');
    expect(res.body).toHaveProperty('sources');
    expect(res.body).toHaveProperty('reports');
    expect(res.body).toHaveProperty('accounts');
    expect(res.body).toHaveProperty('account_balances');
    expect(res.body.transactions).toHaveLength(1);
    expect(res.body.categories).toHaveLength(1);
    expect(res.body.users).toHaveLength(1);
  });

  it('filters transactions by date range', async () => {
    await insertTransaction(pool, { date: '2024-01-15', description: 'Jan' });
    await insertTransaction(pool, { date: '2024-06-15', description: 'Jun' });

    const res = await request(app).get('/api/backup?dateFrom=2024-06-01&dateTo=2024-06-30');
    expect(res.body.transactions).toHaveLength(1);
    expect(res.body.transactions[0].description).toBe('Jun');
  });

  it('returns empty arrays when no data exists', async () => {
    const res = await request(app).get('/api/backup');
    expect(res.body.transactions).toEqual([]);
    expect(res.body.categories).toEqual([]);
  });
});

describe('POST /api/restore', () => {
  it('restores data from backup JSON file', async () => {
    // Create some data, back it up, clear it, then restore
    await insertUser(pool, { id: 'user-1', name: 'Alice' });
    await insertCategory(pool, 'Food');
    await insertTransaction(pool, {
      description: 'Coffee',
      user_id: 'user-1',
      category: 'Food',
    });

    const backupRes = await request(app).get('/api/backup');
    const backupData = backupRes.body;

    await cleanAllTables();

    // Verify data is gone
    const emptyCheck = await pool.query('SELECT COUNT(*) FROM transactions');
    expect(parseInt(emptyCheck.rows[0].count)).toBe(0);

    // Restore from backup
    const res = await request(app)
      .post('/api/restore')
      .attach('backupFile', Buffer.from(JSON.stringify(backupData)), 'backup.json');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify data is restored
    const txns = await pool.query('SELECT * FROM transactions');
    expect(txns.rows).toHaveLength(1);
    expect(txns.rows[0].description).toBe('Coffee');

    const users = await pool.query('SELECT * FROM users');
    expect(users.rows).toHaveLength(1);
  });

  it('returns 400 when no file is provided', async () => {
    const res = await request(app).post('/api/restore');
    expect(res.status).toBe(400);
  });

  it('does not duplicate data on repeated restore (ON CONFLICT DO NOTHING)', async () => {
    await insertUser(pool, { id: 'user-1', name: 'Alice' });

    const backupRes = await request(app).get('/api/backup');
    const backupData = backupRes.body;

    // Restore again on top of existing data
    await request(app)
      .post('/api/restore')
      .attach('backupFile', Buffer.from(JSON.stringify(backupData)), 'backup.json');

    const users = await pool.query('SELECT * FROM users');
    expect(users.rows).toHaveLength(1);
  });

  it('restores accounts and balances', async () => {
    const acct = await insertAccount(pool, { user_id: 'user-1' });
    await insertAccountBalance(pool, acct.id, { balance: 5000, date: '2024-06-15' });

    const backupRes = await request(app).get('/api/backup');
    const backupData = backupRes.body;

    await cleanAllTables();

    await request(app)
      .post('/api/restore')
      .attach('backupFile', Buffer.from(JSON.stringify(backupData)), 'backup.json');

    const accounts = await pool.query('SELECT * FROM accounts');
    expect(accounts.rows).toHaveLength(1);

    const balances = await pool.query('SELECT * FROM account_balances');
    expect(balances.rows).toHaveLength(1);
  });
});
