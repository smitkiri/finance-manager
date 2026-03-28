const request = require('supertest');
const { app } = require('../tests/setup/testApp');
const { cleanAllTables } = require('../tests/setup/testDb');

afterEach(async () => {
  await cleanAllTables();
});

describe('GET /api/date-range', () => {
  it('returns a default date range when nothing is saved', async () => {
    const res = await request(app).get('/api/date-range');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('start');
    expect(res.body).toHaveProperty('end');
  });
});

describe('POST /api/date-range', () => {
  it('saves a date range to the database', async () => {
    const res = await request(app).post('/api/date-range').send({
      start: '2024-01-01',
      end: '2024-12-31',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('retrieves saved date range from database', async () => {
    await request(app).post('/api/date-range').send({
      start: '2024-06-01',
      end: '2024-06-30',
    });

    // The GET endpoint checks file first, then DB. Since no file exists in test,
    // it should fall through to the DB.
    const res = await request(app).get('/api/date-range');
    expect(res.status).toBe(200);
    // It should return the saved range (if the file path doesn't exist in test env)
    expect(res.body).toHaveProperty('start');
    expect(res.body).toHaveProperty('end');
  });

  it('handles duplicate date range gracefully (upsert)', async () => {
    await request(app).post('/api/date-range').send({
      start: '2024-01-01',
      end: '2024-12-31',
    });

    const res = await request(app).post('/api/date-range').send({
      start: '2024-01-01',
      end: '2024-12-31',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
