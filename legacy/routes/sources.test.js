const request = require('supertest');
const { app } = require('../tests/setup/testApp');
const { pool, cleanAllTables } = require('../tests/setup/testDb');
const { insertSource, uniqueId } = require('../tests/setup/fixtures');

afterEach(async () => {
  await cleanAllTables();
});

describe('GET /api/sources', () => {
  it('returns empty array when no sources exist', async () => {
    const res = await request(app).get('/api/sources');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns sources with camelCase fields', async () => {
    await insertSource(pool, { name: 'Chase' });

    const res = await request(app).get('/api/sources');
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toHaveProperty('id');
    expect(res.body[0]).toHaveProperty('name');
    expect(res.body[0]).toHaveProperty('flipIncomeExpense');
    expect(res.body[0]).toHaveProperty('createdAt');
  });
});

describe('POST /api/sources', () => {
  it('creates a source and returns all sources', async () => {
    const res = await request(app)
      .post('/api/sources')
      .send({
        source: {
          id: uniqueId('src'),
          name: 'Chase Credit Card',
          mappings: [],
          flipIncomeExpense: false,
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.sources).toHaveLength(1);
    expect(res.body.sources[0].name).toBe('Chase Credit Card');
  });

  it('rejects duplicate source names', async () => {
    await insertSource(pool, { name: 'Chase' });

    const res = await request(app)
      .post('/api/sources')
      .send({
        source: {
          id: uniqueId('src'),
          name: 'Chase',
        },
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/);
  });
});

describe('DELETE /api/sources/:sourceName', () => {
  it('deletes a source by name', async () => {
    await insertSource(pool, { name: 'ToDelete' });

    const res = await request(app).delete('/api/sources/ToDelete');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.sources).toHaveLength(0);
  });

  it('returns success even if source does not exist', async () => {
    const res = await request(app).delete('/api/sources/Nonexistent');
    expect(res.status).toBe(200);
  });
});

describe('PUT /api/sources/:sourceId', () => {
  it('updates a source', async () => {
    const src = await insertSource(pool, { name: 'Old Name' });

    const res = await request(app)
      .put(`/api/sources/${src.id}`)
      .send({
        source: {
          name: 'New Name',
          mappings: [{ from: 'col1', to: 'date' }],
          flipIncomeExpense: true,
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const updated = res.body.sources.find((s) => s.id === src.id);
    expect(updated.name).toBe('New Name');
    expect(updated.flipIncomeExpense).toBe(true);
  });

  it('returns 404 for non-existent source', async () => {
    const res = await request(app)
      .put('/api/sources/nonexistent')
      .send({
        source: { name: 'Test', mappings: [] },
      });
    expect(res.status).toBe(404);
  });

  it('rejects name conflict with another source', async () => {
    await insertSource(pool, { name: 'Source A' });
    const src2 = await insertSource(pool, { name: 'Source B' });

    const res = await request(app)
      .put(`/api/sources/${src2.id}`)
      .send({
        source: { name: 'Source A', mappings: [] },
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/);
  });
});
