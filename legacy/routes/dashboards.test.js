const request = require('supertest');
const { app } = require('../tests/setup/testApp');
const { pool, cleanAllTables } = require('../tests/setup/testDb');
const {
  insertDashboard,
  insertDashboardPanel,
  insertTransaction,
  uniqueId,
} = require('../tests/setup/fixtures');

afterEach(async () => {
  await cleanAllTables();
});

describe('Dashboard CRUD', () => {
  describe('GET /api/dashboards', () => {
    it('returns empty array when no dashboards exist', async () => {
      const res = await request(app).get('/api/dashboards');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns dashboards with panel counts', async () => {
      const dash = await insertDashboard(pool);
      await insertDashboardPanel(pool, dash.id);
      await insertDashboardPanel(pool, dash.id);

      const res = await request(app).get('/api/dashboards');
      expect(res.body).toHaveLength(1);
      expect(res.body[0].panelCount).toBe(2);
    });
  });

  describe('POST /api/dashboards', () => {
    it('creates a dashboard', async () => {
      const res = await request(app)
        .post('/api/dashboards')
        .send({
          id: uniqueId('dash'),
          name: 'My Dashboard',
          isDefault: true,
          dateRangeStart: '2024-01-01',
          dateRangeEnd: '2024-12-31',
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('My Dashboard');
      expect(res.body.isDefault).toBe(true);
    });

    it('sets other dashboards to non-default when creating default', async () => {
      const first = await insertDashboard(pool, { is_default: true });

      await request(app)
        .post('/api/dashboards')
        .send({
          id: uniqueId('dash'),
          name: 'New Default',
          isDefault: true,
          dateRangeStart: '2024-01-01',
          dateRangeEnd: '2024-12-31',
        });

      const result = await pool.query('SELECT is_default FROM dashboards WHERE id = $1', [
        first.id,
      ]);
      expect(result.rows[0].is_default).toBe(false);
    });
  });

  describe('PATCH /api/dashboards/:id', () => {
    it('updates dashboard name', async () => {
      const dash = await insertDashboard(pool);

      const res = await request(app)
        .patch(`/api/dashboards/${dash.id}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Name');
    });

    it('returns 404 for non-existent dashboard', async () => {
      const res = await request(app).patch('/api/dashboards/nonexistent').send({ name: 'Test' });
      expect(res.status).toBe(404);
    });

    it('returns 400 when nothing to update', async () => {
      const dash = await insertDashboard(pool);
      const res = await request(app).patch(`/api/dashboards/${dash.id}`).send({});
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/dashboards/:id', () => {
    it('deletes a dashboard and cascades to panels', async () => {
      const dash = await insertDashboard(pool);
      await insertDashboardPanel(pool, dash.id);

      const res = await request(app).delete(`/api/dashboards/${dash.id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const panels = await pool.query('SELECT * FROM dashboard_panels WHERE dashboard_id = $1', [
        dash.id,
      ]);
      expect(panels.rows).toHaveLength(0);
    });
  });
});

describe('Panel CRUD', () => {
  let dashboard;

  beforeEach(async () => {
    dashboard = await insertDashboard(pool);
  });

  describe('GET /api/dashboards/:id/panels', () => {
    it('returns panels for a dashboard', async () => {
      await insertDashboardPanel(pool, dashboard.id, { panel_order: 0, title: 'First' });
      await insertDashboardPanel(pool, dashboard.id, { panel_order: 1, title: 'Second' });

      const res = await request(app).get(`/api/dashboards/${dashboard.id}/panels`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].title).toBe('First');
      expect(res.body[1].title).toBe('Second');
    });
  });

  describe('POST /api/dashboards/:id/panels', () => {
    it('creates a panel', async () => {
      const res = await request(app)
        .post(`/api/dashboards/${dashboard.id}/panels`)
        .send({
          id: uniqueId('panel'),
          title: 'My Panel',
          chartType: 'bar',
          seriesMode: 'two_series',
        });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('My Panel');
      expect(res.body.chartType).toBe('bar');
    });

    it('enforces 15-panel limit', async () => {
      for (let i = 0; i < 15; i++) {
        await insertDashboardPanel(pool, dashboard.id, { panel_order: i });
      }

      const res = await request(app)
        .post(`/api/dashboards/${dashboard.id}/panels`)
        .send({
          id: uniqueId('panel'),
          title: 'Over Limit',
          chartType: 'bar',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/15-panel limit/);
    });
  });

  describe('PATCH /api/dashboard-panels/:panelId', () => {
    it('updates panel configuration', async () => {
      const panel = await insertDashboardPanel(pool, dashboard.id);

      const res = await request(app)
        .patch(`/api/dashboard-panels/${panel.id}`)
        .send({ title: 'Updated', chartType: 'line' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated');
      expect(res.body.chartType).toBe('line');
    });

    it('returns 404 for non-existent panel', async () => {
      const res = await request(app)
        .patch('/api/dashboard-panels/nonexistent')
        .send({ title: 'Test' });
      expect(res.status).toBe(404);
    });

    it('returns 400 when nothing to update', async () => {
      const panel = await insertDashboardPanel(pool, dashboard.id);
      const res = await request(app).patch(`/api/dashboard-panels/${panel.id}`).send({});
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/dashboard-panels/:panelId', () => {
    it('deletes a panel', async () => {
      const panel = await insertDashboardPanel(pool, dashboard.id);

      const res = await request(app).delete(`/api/dashboard-panels/${panel.id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('PATCH /api/dashboards/:id/panel-order', () => {
    it('reorders panels', async () => {
      const p1 = await insertDashboardPanel(pool, dashboard.id, { panel_order: 0 });
      const p2 = await insertDashboardPanel(pool, dashboard.id, { panel_order: 1 });
      const p3 = await insertDashboardPanel(pool, dashboard.id, { panel_order: 2 });

      const res = await request(app)
        .patch(`/api/dashboards/${dashboard.id}/panel-order`)
        .send({ panelIds: [p3.id, p1.id, p2.id] });

      expect(res.status).toBe(200);

      const panels = await request(app).get(`/api/dashboards/${dashboard.id}/panels`);
      expect(panels.body[0].id).toBe(p3.id);
      expect(panels.body[0].panelOrder).toBe(0);
      expect(panels.body[1].id).toBe(p1.id);
      expect(panels.body[1].panelOrder).toBe(1);
    });
  });
});

describe('Panel data endpoints', () => {
  describe('POST /api/dashboard-panels/preview', () => {
    it('returns filtered transactions for panel preview', async () => {
      await insertTransaction(pool, {
        date: '2024-06-15',
        type: 'expense',
        category: 'Food',
        amount: 25,
      });
      await insertTransaction(pool, {
        date: '2024-06-15',
        type: 'income',
        category: 'Salary',
        amount: 5000,
      });

      const res = await request(app)
        .post('/api/dashboard-panels/preview')
        .send({
          dateFrom: '2024-06-01',
          dateTo: '2024-06-30',
          filterGroups: [
            {
              conditions: [{ field: 'type', operator: 'is', value: 'expense' }],
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.transactions[0].type).toBe('expense');
    });
  });

  describe('POST /api/dashboard-panels/chart-preview', () => {
    it('returns monthly aggregated data', async () => {
      await insertTransaction(pool, {
        date: '2024-06-15',
        type: 'expense',
        amount: 25,
      });

      const res = await request(app).post('/api/dashboard-panels/chart-preview').send({
        dateFrom: '2024-06-01',
        dateTo: '2024-06-30',
        filterGroups: [],
      });

      expect(res.status).toBe(200);
      expect(res.body.rows).toBeDefined();
      expect(res.body.monthMap).toBeDefined();
    });
  });

  describe('POST /api/dashboards/:id/data', () => {
    it('returns aggregated data for all panels', async () => {
      const dash = await insertDashboard(pool, {
        date_range_start: '2024-06-01',
        date_range_end: '2024-06-30',
      });
      await insertDashboardPanel(pool, dash.id, {
        filter_groups: JSON.stringify([]),
      });
      await insertTransaction(pool, {
        date: '2024-06-15',
        type: 'expense',
        amount: 50,
      });

      const res = await request(app).post(`/api/dashboards/${dash.id}/data`).send({
        dateRangeStart: '2024-06-01',
        dateRangeEnd: '2024-06-30',
      });

      expect(res.status).toBe(200);
      expect(res.body.panels).toHaveLength(1);
      expect(res.body.panels[0].data).toBeDefined();
    });
  });
});
