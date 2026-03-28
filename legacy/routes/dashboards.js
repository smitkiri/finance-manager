const express = require('express');
const router = express.Router();
const db = require('../database');
const {
  buildStatsWhereClause,
  buildPanelDataQuery,
  buildFilterGroupsWhereClause,
  buildMonthSeries,
} = require('../helpers/queryBuilders');

// ─── Helper: map a DB row to the Dashboard shape ───────────────────────────

function rowToDashboard(row) {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.is_default,
    dateRangeStart: row.date_range_start,
    dateRangeEnd: row.date_range_end,
    panelCount: row.panel_count !== undefined ? parseInt(row.panel_count) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPanel(row) {
  return {
    id: row.id,
    dashboardId: row.dashboard_id,
    title: row.title,
    chartType: row.chart_type,
    seriesMode: row.series_mode,
    netOrientation: row.net_orientation || null,
    legendOptions: row.legend_options || null,
    filterGroups: row.filter_groups || [],
    panelOrder: row.panel_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Dashboard CRUD ─────────────────────────────────────────────────────────

// GET /api/dashboards — list all
router.get('/dashboards', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT d.*,
        (SELECT COUNT(*) FROM dashboard_panels p WHERE p.dashboard_id = d.id) AS panel_count
      FROM dashboards d
      ORDER BY d.created_at ASC
    `);
    res.json(result.rows.map(rowToDashboard));
  } catch (err) {
    console.error('Error listing dashboards:', err);
    res.status(500).json({ error: 'Failed to list dashboards' });
  }
});

// POST /api/dashboards — create
router.post('/dashboards', async (req, res) => {
  try {
    const { id, name, isDefault, dateRangeStart, dateRangeEnd } = req.body;
    if (isDefault) {
      await db.query('UPDATE dashboards SET is_default = FALSE, updated_at = NOW()');
    }
    const result = await db.query(
      `INSERT INTO dashboards (id, name, is_default, date_range_start, date_range_end)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, name, !!isDefault, dateRangeStart, dateRangeEnd]
    );
    res.status(201).json(rowToDashboard(result.rows[0]));
  } catch (err) {
    console.error('Error creating dashboard:', err);
    res.status(500).json({ error: 'Failed to create dashboard' });
  }
});

// PATCH /api/dashboards/:id — update name, date range, or set as default
router.patch('/dashboards/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, isDefault, dateRangeStart, dateRangeEnd } = req.body;

    if (isDefault) {
      await db.query('UPDATE dashboards SET is_default = FALSE, updated_at = NOW()');
    }

    const fields = [];
    const params = [];
    let idx = 1;

    if (name !== undefined) {
      fields.push(`name = $${idx++}`);
      params.push(name);
    }
    if (isDefault !== undefined) {
      fields.push(`is_default = $${idx++}`);
      params.push(!!isDefault);
    }
    if (dateRangeStart !== undefined) {
      fields.push(`date_range_start = $${idx++}`);
      params.push(dateRangeStart);
    }
    if (dateRangeEnd !== undefined) {
      fields.push(`date_range_end = $${idx++}`);
      params.push(dateRangeEnd);
    }
    fields.push(`updated_at = NOW()`);

    if (fields.length === 1) return res.status(400).json({ error: 'Nothing to update' });

    params.push(id);
    const result = await db.query(
      `UPDATE dashboards SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Dashboard not found' });
    res.json(rowToDashboard(result.rows[0]));
  } catch (err) {
    console.error('Error updating dashboard:', err);
    res.status(500).json({ error: 'Failed to update dashboard' });
  }
});

// DELETE /api/dashboards/:id
router.delete('/dashboards/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM dashboards WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting dashboard:', err);
    res.status(500).json({ error: 'Failed to delete dashboard' });
  }
});

// ─── Panel CRUD ──────────────────────────────────────────────────────────────

// GET /api/dashboards/:id/panels — list panels
router.get('/dashboards/:id/panels', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM dashboard_panels WHERE dashboard_id = $1 ORDER BY panel_order ASC',
      [req.params.id]
    );
    res.json(result.rows.map(rowToPanel));
  } catch (err) {
    console.error('Error listing panels:', err);
    res.status(500).json({ error: 'Failed to list panels' });
  }
});

// POST /api/dashboards/:id/panels — create panel
router.post('/dashboards/:id/panels', async (req, res) => {
  try {
    const { id: dashboardId } = req.params;
    const {
      id,
      title,
      chartType,
      filterGroups,
      seriesMode,
      netOrientation,
      legendOptions,
      panelOrder,
    } = req.body;

    // Enforce 15-panel limit
    const countResult = await db.query(
      'SELECT COUNT(*) FROM dashboard_panels WHERE dashboard_id = $1',
      [dashboardId]
    );
    if (parseInt(countResult.rows[0].count) >= 15) {
      return res.status(400).json({ error: 'Dashboard has reached the 15-panel limit' });
    }

    const result = await db.query(
      `INSERT INTO dashboard_panels
         (id, dashboard_id, title, chart_type, filter_groups, series_mode, net_orientation, legend_options, panel_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id,
        dashboardId,
        title,
        chartType,
        JSON.stringify(filterGroups || []),
        seriesMode || 'two_series',
        netOrientation || null,
        legendOptions ? JSON.stringify(legendOptions) : null,
        panelOrder || 0,
      ]
    );
    res.status(201).json(rowToPanel(result.rows[0]));
  } catch (err) {
    console.error('Error creating panel:', err);
    res.status(500).json({ error: 'Failed to create panel' });
  }
});

// POST /api/dashboard-panels/preview — MUST be before /:panelId
router.post('/dashboard-panels/preview', async (req, res) => {
  try {
    const { filterGroups, userId, dateFrom, dateTo, limit = 10, offset = 0 } = req.body;

    const { whereSql: baseSql, params } = buildStatsWhereClause(dateFrom, dateTo, userId);
    let nextParam = params.length + 1;

    const { sql: filterSql, nextParam: updatedParam } = buildFilterGroupsWhereClause(
      filterGroups || [],
      params,
      nextParam
    );
    nextParam = updatedParam;

    const extraConditions = filterSql ? ` AND ${filterSql}` : '';
    const fullWhere = `${baseSql}${extraConditions}`;

    const countResult = await db.query(`SELECT COUNT(*) FROM transactions ${fullWhere}`, params);
    const total = parseInt(countResult.rows[0].count);

    const limitParam = nextParam;
    const offsetParam = nextParam + 1;
    const dataResult = await db.query(
      `SELECT id, date, description, category, amount, type, user_id
       FROM transactions
       ${fullWhere}
       ORDER BY date DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const transactions = dataResult.rows.map((row) => ({
      id: row.id,
      date: row.date,
      description: row.description,
      category: row.category,
      amount: parseFloat(row.amount),
      type: row.type,
      user: row.user_id,
    }));

    res.json({ transactions, total });
  } catch (err) {
    console.error('Error previewing panel transactions:', err);
    res.status(500).json({ error: 'Failed to preview transactions' });
  }
});

// POST /api/dashboard-panels/chart-preview — monthly aggregates for filter preview
router.post('/dashboard-panels/chart-preview', async (req, res) => {
  try {
    const { filterGroups, userId, dateFrom, dateTo } = req.body;

    const { sql, params } = buildPanelDataQuery({
      dateFrom,
      dateTo,
      userId: userId || null,
      filterGroups: filterGroups || [],
    });

    const result = await db.query(sql, params);

    const monthMap = buildMonthSeries(dateFrom, dateTo);
    const rows = result.rows.map((row) => ({
      sortMonth: row.sort_month,
      month: row.month,
      type: row.type,
      total: parseFloat(row.total),
    }));

    res.json({ rows, monthMap });
  } catch (err) {
    console.error('Error generating chart preview:', err);
    res.status(500).json({ error: 'Failed to generate chart preview' });
  }
});

// PATCH /api/dashboard-panels/:panelId — update panel config
router.patch('/dashboard-panels/:panelId', async (req, res) => {
  try {
    const { panelId } = req.params;
    const {
      title,
      chartType,
      filterGroups,
      seriesMode,
      netOrientation,
      legendOptions,
      panelOrder,
    } = req.body;

    const fields = [];
    const params = [];
    let idx = 1;

    if (title !== undefined) {
      fields.push(`title = $${idx++}`);
      params.push(title);
    }
    if (chartType !== undefined) {
      fields.push(`chart_type = $${idx++}`);
      params.push(chartType);
    }
    if (filterGroups !== undefined) {
      fields.push(`filter_groups = $${idx++}`);
      params.push(JSON.stringify(filterGroups));
    }
    if (seriesMode !== undefined) {
      fields.push(`series_mode = $${idx++}`);
      params.push(seriesMode);
    }
    if (netOrientation !== undefined) {
      fields.push(`net_orientation = $${idx++}`);
      params.push(netOrientation || null);
    }
    if (legendOptions !== undefined) {
      fields.push(`legend_options = $${idx++}`);
      params.push(legendOptions ? JSON.stringify(legendOptions) : null);
    }
    if (panelOrder !== undefined) {
      fields.push(`panel_order = $${idx++}`);
      params.push(panelOrder);
    }
    fields.push('updated_at = NOW()');

    if (fields.length === 1) return res.status(400).json({ error: 'Nothing to update' });

    params.push(panelId);
    const result = await db.query(
      `UPDATE dashboard_panels SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Panel not found' });
    res.json(rowToPanel(result.rows[0]));
  } catch (err) {
    console.error('Error updating panel:', err);
    res.status(500).json({ error: 'Failed to update panel' });
  }
});

// DELETE /api/dashboard-panels/:panelId
router.delete('/dashboard-panels/:panelId', async (req, res) => {
  try {
    await db.query('DELETE FROM dashboard_panels WHERE id = $1', [req.params.panelId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting panel:', err);
    res.status(500).json({ error: 'Failed to delete panel' });
  }
});

// PATCH /api/dashboards/:id/panel-order — reorder all panels
router.patch('/dashboards/:id/panel-order', async (req, res) => {
  try {
    const { id: dashboardId } = req.params;
    const { panelIds } = req.body; // ordered array of panel IDs

    await Promise.all(
      panelIds.map((panelId, index) =>
        db.query(
          'UPDATE dashboard_panels SET panel_order = $1, updated_at = NOW() WHERE id = $2 AND dashboard_id = $3',
          [index, panelId, dashboardId]
        )
      )
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error reordering panels:', err);
    res.status(500).json({ error: 'Failed to reorder panels' });
  }
});

// ─── Data endpoint ───────────────────────────────────────────────────────────

// POST /api/dashboards/:id/data — batched monthly aggregate for all panels
router.post('/dashboards/:id/data', async (req, res) => {
  try {
    const { id: dashboardId } = req.params;
    const { userId, dateRangeStart, dateRangeEnd } = req.body;

    // Load all panels for this dashboard
    const panelsResult = await db.query(
      'SELECT * FROM dashboard_panels WHERE dashboard_id = $1 ORDER BY panel_order ASC',
      [dashboardId]
    );
    const panels = panelsResult.rows.map(rowToPanel);

    // Run one aggregate query per panel in parallel
    const panelDataResults = await Promise.all(
      panels.map(async (panel) => {
        const { sql, params } = buildPanelDataQuery({
          dateFrom: dateRangeStart,
          dateTo: dateRangeEnd,
          userId: userId || null,
          filterGroups: panel.filterGroups,
        });

        const result = await db.query(sql, params);

        const monthMap = buildMonthSeries(dateRangeStart, dateRangeEnd);

        // Aggregate rows into per-month data
        for (const row of result.rows) {
          const key = row.sort_month;
          if (!monthMap[key]) monthMap[key] = { month: row.month };
          const total = parseFloat(row.total);
          if (panel.seriesMode === 'net_amount') {
            const sign = row.type === 'income' ? 1 : -1;
            monthMap[key].net = (monthMap[key].net || 0) + sign * total;
          } else {
            if (row.type === 'income') monthMap[key].income = total;
            else monthMap[key].expenses = total;
          }
        }

        return {
          panelId: panel.id,
          data: Object.entries(monthMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([, v]) => v),
        };
      })
    );

    res.json({ panels: panelDataResults });
  } catch (err) {
    console.error('Error fetching dashboard data:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

module.exports = router;
