const request = require('supertest');
const { app } = require('../tests/setup/testApp');
const { pool, cleanAllTables } = require('../tests/setup/testDb');
const { insertTransaction, insertSource, insertImportSession } = require('../tests/setup/fixtures');

afterEach(async () => {
  await cleanAllTables();
});

describe('DELETE /api/delete-all', () => {
  it('deletes all transactions and sources', async () => {
    await insertTransaction(pool);
    await insertSource(pool);

    const res = await request(app).delete('/api/delete-all');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const txns = await pool.query('SELECT COUNT(*) FROM transactions');
    const srcs = await pool.query('SELECT COUNT(*) FROM sources');
    expect(parseInt(txns.rows[0].count)).toBe(0);
    expect(parseInt(srcs.rows[0].count)).toBe(0);
  });
});

describe('POST /api/delete-selected', () => {
  it('deletes all transactions when deleteTransactions is true', async () => {
    await insertTransaction(pool);
    await insertTransaction(pool);

    const res = await request(app).post('/api/delete-selected').send({
      deleteTransactions: true,
    });

    expect(res.status).toBe(200);
    const txns = await pool.query('SELECT COUNT(*) FROM transactions');
    expect(parseInt(txns.rows[0].count)).toBe(0);
  });

  it('deletes selected sources by ID', async () => {
    const src1 = await insertSource(pool, { name: 'Source A' });
    await insertSource(pool, { name: 'Source B' });

    const res = await request(app)
      .post('/api/delete-selected')
      .send({
        deleteSources: true,
        sourceIds: [src1.id],
      });

    expect(res.status).toBe(200);
    const srcs = await pool.query('SELECT * FROM sources');
    expect(srcs.rows).toHaveLength(1);
    expect(srcs.rows[0].name).toBe('Source B');
  });

  it('does nothing when all flags are false', async () => {
    await insertTransaction(pool);
    await insertSource(pool);

    await request(app).post('/api/delete-selected').send({
      deleteTransactions: false,
      deleteSources: false,
    });

    const txns = await pool.query('SELECT COUNT(*) FROM transactions');
    expect(parseInt(txns.rows[0].count)).toBe(1);
  });
});

describe('POST /api/undo-import', () => {
  it('removes transactions from an import session', async () => {
    const session = await insertImportSession(pool, { transaction_count: 2 });

    await insertTransaction(pool, { import_id: session.id, description: 'Imported' });
    await insertTransaction(pool, { import_id: session.id, description: 'Also Imported' });
    await insertTransaction(pool, { description: 'Existing' });

    const res = await request(app).post('/api/undo-import').send({
      sessionId: session.id,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.removed).toBe(2);

    const remaining = await pool.query('SELECT * FROM transactions');
    expect(remaining.rows).toHaveLength(1);
    expect(remaining.rows[0].description).toBe('Existing');
  });

  it('returns 400 when sessionId is missing', async () => {
    const res = await request(app).post('/api/undo-import').send({});
    expect(res.status).toBe(400);
  });

  it('deletes the import session record', async () => {
    const session = await insertImportSession(pool);

    await request(app).post('/api/undo-import').send({ sessionId: session.id });

    const sessions = await pool.query('SELECT * FROM import_sessions WHERE id = $1', [session.id]);
    expect(sessions.rows).toHaveLength(0);
  });
});
