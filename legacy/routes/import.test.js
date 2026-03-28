const request = require('supertest');
const { app } = require('../tests/setup/testApp');
const { pool, cleanAllTables } = require('../tests/setup/testDb');
const { insertTransaction } = require('../tests/setup/fixtures');

afterEach(async () => {
  await cleanAllTables();
});

describe('POST /api/import-with-mapping', () => {
  const csvText = [
    'Date,Desc,Money',
    '2024-06-15,Grocery Store,-45.00',
    '2024-06-16,Salary,3000.00',
  ].join('\n');

  const mapping = {
    id: 'custom-map-1',
    name: 'Custom Format',
    mappings: [
      { csvColumn: 'Date', standardColumn: 'Transaction Date' },
      { csvColumn: 'Desc', standardColumn: 'Description' },
      { csvColumn: 'Money', standardColumn: 'Amount' },
    ],
    flipIncomeExpense: false,
  };

  it('requires userId', async () => {
    const res = await request(app).post('/api/import-with-mapping').send({
      csvText,
      mapping,
    });
    expect(res.status).toBe(400);
  });

  it('imports with custom column mapping', async () => {
    const res = await request(app).post('/api/import-with-mapping').send({
      csvText,
      mapping,
      userId: 'user-1',
      fileName: 'custom.csv',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.added).toBe(2);
    expect(res.body.sessionId).toBeDefined();

    // Verify transactions in DB
    const txns = await pool.query('SELECT * FROM transactions ORDER BY date');
    expect(txns.rows).toHaveLength(2);
    expect(txns.rows[0].user_id).toBe('user-1');
  });

  it('creates an import session', async () => {
    const res = await request(app).post('/api/import-with-mapping').send({
      csvText,
      mapping,
      userId: 'user-1',
      fileName: 'custom.csv',
    });

    const sessions = await pool.query('SELECT * FROM import_sessions WHERE id = $1', [
      res.body.sessionId,
    ]);
    expect(sessions.rows).toHaveLength(1);
    expect(sessions.rows[0].source_name).toBe('Custom Format');
    expect(sessions.rows[0].file_name).toBe('custom.csv');
  });

  it('tracks import session with correct transaction count', async () => {
    const res = await request(app).post('/api/import-with-mapping').send({
      csvText,
      mapping,
      userId: 'user-1',
      fileName: 'track.csv',
    });

    expect(res.body.added).toBe(2);

    const sessions = await pool.query('SELECT * FROM import_sessions WHERE id = $1', [
      res.body.sessionId,
    ]);
    expect(sessions.rows[0].transaction_count).toBe(2);
  });

  it('runs transfer detection after import', async () => {
    const transferCsv = [
      'Date,Desc,Money',
      '2024-06-15,Transfer out,-500.00',
      '2024-06-15,Transfer in,500.00',
    ].join('\n');

    const mappingA = { ...mapping, id: 'src-a', name: 'Bank A' };
    const mappingB = { ...mapping, id: 'src-b', name: 'Bank B' };

    // Import from two sources
    await request(app)
      .post('/api/import-with-mapping')
      .send({
        csvText: transferCsv.replace('Transfer out,-500', 'Transfer out,-500'),
        mapping: mappingA,
        userId: 'user-1',
      });

    const res = await request(app)
      .post('/api/import-with-mapping')
      .send({
        csvText: transferCsv.replace('Transfer in,500', 'Transfer in,500'),
        mapping: mappingB,
        userId: 'user-1',
      });

    expect(res.body.transfersDetected).toBeDefined();
  });
});

describe('GET /api/export-csv', () => {
  it('exports transactions as CSV', async () => {
    await insertTransaction(pool, {
      date: '2024-06-15',
      description: 'Coffee',
      category: 'Food',
      amount: 5.5,
      type: 'expense',
    });

    const res = await request(app).get('/api/export-csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('Date,Description,Category,Amount,Type');
    expect(res.text).toContain('Coffee');
  });

  it('returns 404 when no transactions exist', async () => {
    const res = await request(app).get('/api/export-csv');
    expect(res.status).toBe(404);
  });

  it('exports multiple transactions ordered by date descending', async () => {
    await insertTransaction(pool, { date: '2024-01-15', description: 'Old' });
    await insertTransaction(pool, { date: '2024-06-15', description: 'New' });

    const res = await request(app).get('/api/export-csv');
    const lines = res.text.split('\n');
    expect(lines[1]).toContain('New');
    expect(lines[2]).toContain('Old');
  });
});
