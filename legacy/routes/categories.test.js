const request = require('supertest');
const { app } = require('../tests/setup/testApp');
const { pool, cleanAllTables } = require('../tests/setup/testDb');
const { insertCategory, insertTransaction } = require('../tests/setup/fixtures');

afterEach(async () => {
  await cleanAllTables();
});

describe('GET /api/categories', () => {
  it('returns default categories when none exist', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.categories).toContain('Food & Drink');
    expect(res.body.categories).toContain('Uncategorized');
    expect(res.body.categories.length).toBe(10);
  });

  it('returns saved categories when they exist', async () => {
    await insertCategory(pool, 'Rent');
    await insertCategory(pool, 'Food');

    const res = await request(app).get('/api/categories');
    expect(res.body.categories).toEqual(['Food', 'Rent']); // sorted alphabetically
  });
});

describe('POST /api/categories', () => {
  it('bulk replaces all categories', async () => {
    await insertCategory(pool, 'Old Category');

    const res = await request(app)
      .post('/api/categories')
      .send({ categories: ['New1', 'New2', 'New3'] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(3);

    const check = await request(app).get('/api/categories');
    expect(check.body.categories).toEqual(['New1', 'New2', 'New3']);
  });

  it('handles duplicate category names gracefully', async () => {
    const res = await request(app)
      .post('/api/categories')
      .send({ categories: ['Food', 'Food', 'Travel'] });

    expect(res.status).toBe(200);
    const check = await request(app).get('/api/categories');
    expect(check.body.categories).toEqual(['Food', 'Travel']);
  });

  it('handles empty categories array', async () => {
    const res = await request(app).post('/api/categories').send({ categories: [] });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });
});

describe('GET /api/labels', () => {
  it('returns empty labels when no transactions have labels', async () => {
    await insertTransaction(pool, { labels: JSON.stringify([]) });

    const res = await request(app).get('/api/labels');
    expect(res.status).toBe(200);
    expect(res.body.labels).toEqual([]);
  });

  it('returns unique labels from transactions', async () => {
    await insertTransaction(pool, { labels: JSON.stringify(['vacation', 'food']) });
    await insertTransaction(pool, { labels: JSON.stringify(['vacation', 'work']) });

    const res = await request(app).get('/api/labels');
    expect(res.body.labels).toEqual(['food', 'vacation', 'work']);
  });

  it('returns empty when no transactions exist', async () => {
    const res = await request(app).get('/api/labels');
    expect(res.status).toBe(200);
    expect(res.body.labels).toEqual([]);
  });
});
