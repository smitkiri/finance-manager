const request = require('supertest');
const { app } = require('../tests/setup/testApp');
const { pool, cleanAllTables } = require('../tests/setup/testDb');
const { insertImportSession, insertTransaction } = require('../tests/setup/fixtures');

afterEach(async () => {
  await cleanAllTables();
});

describe('GET /api/import-sessions', () => {
  it('returns empty array when no sessions exist', async () => {
    const res = await request(app).get('/api/import-sessions');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns sessions with camelCase fields', async () => {
    await insertImportSession(pool, {
      source_name: 'Chase',
      file_name: 'chase.csv',
      transaction_count: 10,
    });

    const res = await request(app).get('/api/import-sessions');
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toHaveProperty('id');
    expect(res.body[0]).toHaveProperty('createdAt');
    expect(res.body[0]).toHaveProperty('sourceName');
    expect(res.body[0]).toHaveProperty('fileName');
    expect(res.body[0]).toHaveProperty('transactionCount');
    expect(res.body[0].sourceName).toBe('Chase');
  });

  it('returns sessions ordered by created_at descending', async () => {
    await insertImportSession(pool, { source_name: 'First' });
    await new Promise((r) => setTimeout(r, 10));
    await insertImportSession(pool, { source_name: 'Second' });

    const res = await request(app).get('/api/import-sessions');
    expect(res.body[0].sourceName).toBe('Second');
    expect(res.body[1].sourceName).toBe('First');
  });
});

describe('DELETE /api/import-sessions/:id', () => {
  it('deletes session and associated transactions', async () => {
    const session = await insertImportSession(pool);
    await insertTransaction(pool, { import_id: session.id, description: 'Imported' });
    await insertTransaction(pool, { description: 'Other' });

    const res = await request(app).delete(`/api/import-sessions/${session.id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.removed).toBe(1);

    const remaining = await pool.query('SELECT * FROM transactions');
    expect(remaining.rows).toHaveLength(1);
    expect(remaining.rows[0].description).toBe('Other');

    const sessions = await pool.query('SELECT * FROM import_sessions WHERE id = $1', [session.id]);
    expect(sessions.rows).toHaveLength(0);
  });
});
