const request = require('supertest');
const { app } = require('../tests/setup/testApp');
const { pool, cleanAllTables } = require('../tests/setup/testDb');
const { insertReport, uniqueId } = require('../tests/setup/fixtures');

afterEach(async () => {
  await cleanAllTables();
});

describe('GET /api/reports', () => {
  it('returns empty array when no reports exist', async () => {
    const res = await request(app).get('/api/reports');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns reports sorted by created_at descending', async () => {
    await insertReport(pool, { name: 'First' });
    // Small delay to ensure different created_at
    await new Promise((r) => setTimeout(r, 10));
    await insertReport(pool, { name: 'Second' });

    const res = await request(app).get('/api/reports');
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe('Second');
    expect(res.body[1].name).toBe('First');
  });

  it('returns reports with camelCase fields', async () => {
    await insertReport(pool);

    const res = await request(app).get('/api/reports');
    const report = res.body[0];
    expect(report).toHaveProperty('id');
    expect(report).toHaveProperty('name');
    expect(report).toHaveProperty('createdAt');
    expect(report).toHaveProperty('lastModified');
  });
});

describe('POST /api/reports', () => {
  it('creates a new report', async () => {
    const res = await request(app)
      .post('/api/reports')
      .send({
        report: {
          id: uniqueId('rpt'),
          name: 'Monthly Summary',
          description: 'Monthly expense summary',
          filters: { dateFrom: '2024-06-01', dateTo: '2024-06-30' },
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.reportId).toBeDefined();
  });

  it('updates an existing report on conflict', async () => {
    const report = await insertReport(pool, { name: 'Original' });

    await request(app)
      .post('/api/reports')
      .send({
        report: {
          id: report.id,
          name: 'Updated',
          description: 'Updated description',
          filters: { category: 'Food' },
        },
      });

    const check = await request(app).get('/api/reports');
    expect(check.body).toHaveLength(1);
    expect(check.body[0].name).toBe('Updated');
  });
});

describe('DELETE /api/reports/:reportId', () => {
  it('deletes a report', async () => {
    const report = await insertReport(pool);

    const res = await request(app).delete(`/api/reports/${report.id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const check = await request(app).get('/api/reports');
    expect(check.body).toHaveLength(0);
  });
});

describe('POST /api/reports/:reportId/data', () => {
  it('returns success (stub endpoint)', async () => {
    const res = await request(app).post('/api/reports/any-id/data');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/reports/:reportId/data', () => {
  it('returns 404', async () => {
    const res = await request(app).get('/api/reports/any-id/data');
    expect(res.status).toBe(404);
  });
});
