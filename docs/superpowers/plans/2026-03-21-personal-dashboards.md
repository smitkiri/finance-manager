# Personal Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Personal Dashboards feature where users create named dashboards with up to 15 chart panels, each showing monthly aggregated transaction data with configurable filters.

**Architecture:** Two new DB tables (`dashboards`, `dashboard_panels`) backed by a new Express route file (`routes/dashboards.js`). The data endpoint batches all panel queries into a single HTTP request using `Promise.all`. The frontend is a new `/personal-dashboards` route with five focused React components and drag-and-drop panel reordering via dnd-kit.

**Tech Stack:** PostgreSQL, Express.js, React 18 + TypeScript, Recharts, Tailwind CSS, dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`)

---

## File Map

| File | Status | Purpose |
|------|--------|---------|
| `migrate.js` | Modify | Add `addPersonalDashboardsTables()` migration function and call it in `runMigration()` |
| `routes/dashboards.js` | Create | All dashboard + panel CRUD endpoints and the batched data endpoint |
| `server.js` | Modify | Mount `routes/dashboards.js` under `/api` |
| `helpers/queryBuilders.js` | Modify | Export `buildPanelDataQuery()` helper that extends `buildStatsWhereClause` with panel filters |
| `src/types.ts` | Modify | Add `Dashboard`, `DashboardPanel`, `PanelMonthData`, `PanelData` interfaces |
| `src/utils/storage.ts` | Modify | Add dashboard/panel API methods |
| `src/components/Sidebar.tsx` | Modify | Add "Personal Dashboards" nav item |
| `src/App.tsx` | Modify | Add `/personal-dashboards` route |
| `src/components/dashboards/PersonalDashboards.tsx` | Create | Page root — dashboard list, selector header, empty state |
| `src/components/dashboards/DashboardView.tsx` | Create | Date range picker, panel grid, dnd-kit drag context |
| `src/components/dashboards/DashboardPanel.tsx` | Create | Single panel card with Recharts chart |
| `src/components/dashboards/PanelEditorSidebar.tsx` | Create | Slide-in right sidebar for create/edit |
| `src/components/dashboards/TransactionPreview.tsx` | Create | Compact transaction preview table inside the editor |

---

## Task 1: Install dnd-kit and add DB migration

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `migrate.js`

- [ ] **Step 1: Install dnd-kit**

```bash
cd /path/to/project
npm install @dnd-kit/core @dnd-kit/sortable
```

Expected output: `added N packages` with no errors. Verify `package.json` now lists `@dnd-kit/core` and `@dnd-kit/sortable` in `dependencies`.

- [ ] **Step 2: Add `addPersonalDashboardsTables` migration function to `migrate.js`**

Add this function after the `addImportSessionsTable` function and before `runMigration`:

```js
/**
 * Add dashboards and dashboard_panels tables for Personal Dashboards feature
 */
const addPersonalDashboardsTables = async () => {
  const alreadyRun = await db.query(
    "SELECT 1 FROM migrations WHERE migration_name = $1",
    ['add_personal_dashboards_tables']
  );
  if (alreadyRun.rows.length > 0) {
    console.log('Personal dashboards migration already completed, skipping...');
    return;
  }

  console.log('Creating personal dashboards tables...');
  await db.query(`
    CREATE TABLE IF NOT EXISTS dashboards (
      id               VARCHAR(255) PRIMARY KEY,
      name             VARCHAR(255) NOT NULL,
      is_default       BOOLEAN NOT NULL DEFAULT FALSE,
      date_range_start DATE NOT NULL,
      date_range_end   DATE NOT NULL,
      created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS dashboard_panels (
      id                VARCHAR(255) PRIMARY KEY,
      dashboard_id      VARCHAR(255) NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
      title             VARCHAR(255) NOT NULL,
      chart_type        VARCHAR(10) NOT NULL CHECK (chart_type IN ('bar', 'line')),
      filter_type       VARCHAR(10) NOT NULL DEFAULT 'both' CHECK (filter_type IN ('expense', 'income', 'both')),
      filter_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
      filter_regex      TEXT,
      series_mode       VARCHAR(20) NOT NULL DEFAULT 'two_series' CHECK (series_mode IN ('two_series', 'net_amount')),
      net_orientation   VARCHAR(20) CHECK (net_orientation IN ('income_positive', 'expense_positive')),
      panel_order       INTEGER NOT NULL DEFAULT 0,
      created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_dashboard_panels_dashboard ON dashboard_panels(dashboard_id)
  `);

  await db.query(
    "INSERT INTO migrations (migration_name) VALUES ($1) ON CONFLICT DO NOTHING",
    ['add_personal_dashboards_tables']
  );
  console.log('Personal dashboards tables created successfully');
};
```

- [ ] **Step 3: Call the new migration in `runMigration`**

In `migrate.js`, find the block that calls the incremental migrations (around line 531):

```js
// Run incremental migrations (always run so they apply to existing installs too)
await addNetWorthTables();
await addTellerAccountId();
await addTellerEnrollmentId();
await addImportSessionsTable();
```

Add `await addPersonalDashboardsTables();` at the end of that block:

```js
await addNetWorthTables();
await addTellerAccountId();
await addTellerEnrollmentId();
await addImportSessionsTable();
await addPersonalDashboardsTables();
```

- [ ] **Step 4: Run migration to verify tables are created**

```bash
npm run migrate
```

Expected output includes:
```
Personal dashboards tables created successfully
All migrations completed successfully!
```

Run it a second time to confirm idempotency:
```
Personal dashboards migration already completed, skipping...
```

- [ ] **Step 5: Commit**

```bash
git add migrate.js package.json package-lock.json
git commit -m "feat: install dnd-kit and add personal dashboards DB migration"
```

---

## Task 2: Backend — `buildPanelDataQuery` helper

**Files:**
- Modify: `helpers/queryBuilders.js`

- [ ] **Step 1: Add `buildPanelDataQuery` to `helpers/queryBuilders.js`**

Add after the existing `buildStatsWhereClause` function. This helper takes a panel's filter config plus the base date/user params, and returns a complete SQL query + params for the monthly aggregate:

```js
/**
 * Build the monthly aggregate SQL query for a single dashboard panel.
 * Extends buildStatsWhereClause with panel-specific filters.
 *
 * @param {object} opts
 * @param {string|null} opts.dateFrom  - YYYY-MM-DD
 * @param {string|null} opts.dateTo    - YYYY-MM-DD
 * @param {string|null} opts.userId
 * @param {string}      opts.filterType  - 'expense' | 'income' | 'both'
 * @param {string[]}    opts.filterCategories - [] means all
 * @param {string|null} opts.filterRegex - POSIX regex or null
 * @returns {{ sql: string, params: any[] }}
 */
function buildPanelDataQuery({ dateFrom, dateTo, userId, filterType, filterCategories, filterRegex }) {
  const { whereSql, params } = buildStatsWhereClause(dateFrom, dateTo, userId);
  // params already has $1, $2, $3 for dateFrom, dateTo, userId
  let nextParam = params.length + 1;
  let extraConditions = '';

  if (filterType !== 'both') {
    extraConditions += ` AND type = $${nextParam}`;
    params.push(filterType);
    nextParam++;
  }

  if (filterCategories && filterCategories.length > 0) {
    extraConditions += ` AND category = ANY($${nextParam}::text[])`;
    params.push(filterCategories);
    nextParam++;
  }

  if (filterRegex) {
    extraConditions += ` AND description ~* $${nextParam}`;
    params.push(filterRegex);
    nextParam++;
  }

  const sql = `
    SELECT
      TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM') AS month,
      type,
      SUM(amount) AS total
    FROM transactions
    ${whereSql}${extraConditions}
    GROUP BY month, type
    ORDER BY month ASC
  `;

  return { sql, params };
}
```

- [ ] **Step 2: Export `buildPanelDataQuery` at the bottom of the file**

Find the existing exports line:

```js
module.exports = { buildExpensesWhereClause, buildStatsWhereClause, rowToExpense };
```

Replace with:

```js
module.exports = { buildExpensesWhereClause, buildStatsWhereClause, rowToExpense, buildPanelDataQuery };
```

- [ ] **Step 3: Verify the file parses without errors**

```bash
node -e "require('./helpers/queryBuilders')"
```

Expected: no output (no errors).

- [ ] **Step 4: Commit**

```bash
git add helpers/queryBuilders.js
git commit -m "feat: add buildPanelDataQuery helper for panel data aggregation"
```

---

## Task 3: Backend — `routes/dashboards.js`

**Files:**
- Create: `routes/dashboards.js`
- Modify: `server.js`

This route file handles all dashboard and panel operations. It is one file because all routes share the same `db` dependency and are part of the same feature domain.

- [ ] **Step 1: Create `routes/dashboards.js`**

```js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { buildExpensesWhereClause, buildPanelDataQuery } = require('../helpers/queryBuilders');

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
    filterType: row.filter_type,
    filterCategories: row.filter_categories || [],
    filterRegex: row.filter_regex || null,
    seriesMode: row.series_mode,
    netOrientation: row.net_orientation || null,
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

    if (name !== undefined) { fields.push(`name = $${idx++}`); params.push(name); }
    if (isDefault !== undefined) { fields.push(`is_default = $${idx++}`); params.push(!!isDefault); }
    if (dateRangeStart !== undefined) { fields.push(`date_range_start = $${idx++}`); params.push(dateRangeStart); }
    if (dateRangeEnd !== undefined) { fields.push(`date_range_end = $${idx++}`); params.push(dateRangeEnd); }
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
    const { id, title, chartType, filterType, filterCategories, filterRegex, seriesMode, netOrientation, panelOrder } = req.body;

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
         (id, dashboard_id, title, chart_type, filter_type, filter_categories, filter_regex, series_mode, net_orientation, panel_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        id, dashboardId, title, chartType,
        filterType || 'both',
        JSON.stringify(filterCategories || []),
        filterRegex || null,
        seriesMode || 'two_series',
        netOrientation || null,
        panelOrder || 0,
      ]
    );
    res.status(201).json(rowToPanel(result.rows[0]));
  } catch (err) {
    console.error('Error creating panel:', err);
    res.status(500).json({ error: 'Failed to create panel' });
  }
});

// PATCH /api/dashboard-panels/preview  — MUST be before /:panelId
router.get('/dashboard-panels/preview', async (req, res) => {
  try {
    const { types, categories, regex, userId, dateFrom, dateTo, limit = '10' } = req.query;

    const parsedCategories = categories ? categories.split(',').filter(Boolean) : [];
    const parsedTypes = types ? types.split(',').filter(Boolean) : [];

    const query = {
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      userId: userId || null,
      categories: parsedCategories,
      types: parsedTypes,
    };

    let { whereSql, params } = buildExpensesWhereClause(query);
    let nextParam = params.length + 1;

    if (regex) {
      const andOrWhere = whereSql ? ' AND' : ' WHERE';
      whereSql += `${andOrWhere} description ~* $${nextParam}`;
      params.push(regex);
      nextParam++;
    }

    const countResult = await db.query(
      `SELECT COUNT(*) FROM transactions ${whereSql}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const dataResult = await db.query(
      `SELECT id, date, description, category, amount, type, user_id
       FROM transactions
       ${whereSql}
       ORDER BY date DESC
       LIMIT $${nextParam}`,
      [...params, parseInt(limit)]
    );

    const transactions = dataResult.rows.map(row => ({
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

// PATCH /api/dashboard-panels/:panelId — update panel config
router.patch('/dashboard-panels/:panelId', async (req, res) => {
  try {
    const { panelId } = req.params;
    const { title, chartType, filterType, filterCategories, filterRegex, seriesMode, netOrientation, panelOrder } = req.body;

    const fields = [];
    const params = [];
    let idx = 1;

    if (title !== undefined) { fields.push(`title = $${idx++}`); params.push(title); }
    if (chartType !== undefined) { fields.push(`chart_type = $${idx++}`); params.push(chartType); }
    if (filterType !== undefined) { fields.push(`filter_type = $${idx++}`); params.push(filterType); }
    if (filterCategories !== undefined) { fields.push(`filter_categories = $${idx++}`); params.push(JSON.stringify(filterCategories)); }
    if (filterRegex !== undefined) { fields.push(`filter_regex = $${idx++}`); params.push(filterRegex || null); }
    if (seriesMode !== undefined) { fields.push(`series_mode = $${idx++}`); params.push(seriesMode); }
    if (netOrientation !== undefined) { fields.push(`net_orientation = $${idx++}`); params.push(netOrientation || null); }
    if (panelOrder !== undefined) { fields.push(`panel_order = $${idx++}`); params.push(panelOrder); }
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
          filterType: panel.filterType,
          filterCategories: panel.filterCategories,
          filterRegex: panel.filterRegex,
        });

        const result = await db.query(sql, params);

        // Aggregate rows into per-month data
        const monthMap = {};
        for (const row of result.rows) {
          const month = row.month;
          if (!monthMap[month]) monthMap[month] = { month };
          const total = parseFloat(row.total);
          if (panel.seriesMode === 'net_amount') {
            const sign = row.type === 'income' ? 1 : -1;
            const orientSign = panel.netOrientation === 'expense_positive' ? -1 : 1;
            monthMap[month].net = ((monthMap[month].net || 0) + sign * total * orientSign);
          } else {
            if (row.type === 'income') monthMap[month].income = total;
            else monthMap[month].expenses = total;
          }
        }

        return {
          panelId: panel.id,
          data: Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)),
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
```

- [ ] **Step 2: Mount the router in `server.js`**

In `server.js`, add after the last `app.use('/api', ...)` line:

```js
app.use('/api', require('./routes/dashboards'));
```

- [ ] **Step 3: Smoke-test the API**

Start the server (`npm run server`) and run these curl commands:

```bash
# Create a dashboard
curl -s -X POST http://localhost:3001/api/dashboards \
  -H 'Content-Type: application/json' \
  -d '{"id":"test-dash-1","name":"My Dashboard","isDefault":true,"dateRangeStart":"2025-01-01","dateRangeEnd":"2025-12-31"}' | jq .

# List dashboards
curl -s http://localhost:3001/api/dashboards | jq .

# Delete it
curl -s -X DELETE http://localhost:3001/api/dashboards/test-dash-1 | jq .
```

Each should return valid JSON without errors.

- [ ] **Step 4: Commit**

```bash
git add routes/dashboards.js server.js helpers/queryBuilders.js
git commit -m "feat: add dashboard routes and buildPanelDataQuery helper"
```

---

## Task 4: Frontend types and storage methods

**Files:**
- Modify: `src/types.ts`
- Modify: `src/utils/storage.ts`

- [ ] **Step 1: Add types to `src/types.ts`**

Append to the end of `src/types.ts`:

```typescript
// Personal Dashboards types
export interface Dashboard {
  id: string;
  name: string;
  isDefault: boolean;
  dateRangeStart: string; // YYYY-MM-DD
  dateRangeEnd: string;   // YYYY-MM-DD
  panelCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardPanel {
  id: string;
  dashboardId: string;
  title: string;
  chartType: 'bar' | 'line';
  filterType: 'expense' | 'income' | 'both';
  filterCategories: string[];
  filterRegex: string | null;
  seriesMode: 'two_series' | 'net_amount';
  netOrientation: 'income_positive' | 'expense_positive' | null;
  panelOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PanelMonthData {
  month: string;      // "YYYY-MM"
  income?: number;
  expenses?: number;
  net?: number;
}

export interface PanelData {
  panelId: string;
  data: PanelMonthData[];
}
```

- [ ] **Step 2: Add storage methods to `src/utils/storage.ts`**

Append the following static methods inside the `LocalStorage` class, before the final closing `}`. Add the import for the new types at the top of the file by adding `Dashboard, DashboardPanel, PanelData` to the existing import from `'../types'`.

```typescript
// ─── Personal Dashboards ─────────────────────────────────────────────────────

static async loadDashboards(): Promise<Dashboard[]> {
  try {
    const response = await fetch(`${this.API_BASE}/dashboards`);
    if (!response.ok) throw new Error('Failed to load dashboards');
    return response.json();
  } catch (error) {
    console.error('Error loading dashboards:', error);
    return [];
  }
}

static async createDashboard(dashboard: Omit<Dashboard, 'createdAt' | 'updatedAt' | 'panelCount'>): Promise<Dashboard> {
  const response = await fetch(`${this.API_BASE}/dashboards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dashboard),
  });
  if (!response.ok) throw new Error('Failed to create dashboard');
  return response.json();
}

static async updateDashboard(id: string, updates: Partial<Pick<Dashboard, 'name' | 'isDefault' | 'dateRangeStart' | 'dateRangeEnd'>>): Promise<Dashboard> {
  const response = await fetch(`${this.API_BASE}/dashboards/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error('Failed to update dashboard');
  return response.json();
}

static async deleteDashboard(id: string): Promise<void> {
  const response = await fetch(`${this.API_BASE}/dashboards/${id}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete dashboard');
}

static async createPanel(dashboardId: string, panel: Omit<DashboardPanel, 'dashboardId' | 'createdAt' | 'updatedAt'>): Promise<DashboardPanel> {
  const response = await fetch(`${this.API_BASE}/dashboards/${dashboardId}/panels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...panel, dashboardId }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any).error || 'Failed to create panel');
  }
  return response.json();
}

static async updatePanel(panelId: string, updates: Partial<Omit<DashboardPanel, 'id' | 'dashboardId' | 'createdAt' | 'updatedAt'>>): Promise<DashboardPanel> {
  const response = await fetch(`${this.API_BASE}/dashboard-panels/${panelId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error('Failed to update panel');
  return response.json();
}

static async deletePanel(panelId: string): Promise<void> {
  const response = await fetch(`${this.API_BASE}/dashboard-panels/${panelId}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete panel');
}

static async reorderPanels(dashboardId: string, panelIds: string[]): Promise<void> {
  const response = await fetch(`${this.API_BASE}/dashboards/${dashboardId}/panel-order`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ panelIds }),
  });
  if (!response.ok) throw new Error('Failed to reorder panels');
}

static async loadDashboardData(dashboardId: string, opts: { userId?: string | null; dateRangeStart: string; dateRangeEnd: string }): Promise<PanelData[]> {
  try {
    const response = await fetch(`${this.API_BASE}/dashboards/${dashboardId}/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });
    if (!response.ok) throw new Error('Failed to load dashboard data');
    const data = await response.json();
    return data.panels as PanelData[];
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    return [];
  }
}

static async previewPanelTransactions(opts: {
  types?: string[];
  categories?: string[];
  regex?: string | null;
  userId?: string | null;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}): Promise<{ transactions: import('../types').Expense[]; total: number }> {
  const params = new URLSearchParams();
  if (opts.types?.length) params.set('types', opts.types.join(','));
  if (opts.categories?.length) params.set('categories', opts.categories.join(','));
  if (opts.regex) params.set('regex', opts.regex);
  if (opts.userId) params.set('userId', opts.userId);
  if (opts.dateFrom) params.set('dateFrom', opts.dateFrom);
  if (opts.dateTo) params.set('dateTo', opts.dateTo);
  if (opts.limit) params.set('limit', String(opts.limit));
  try {
    const response = await fetch(`${this.API_BASE}/dashboard-panels/preview?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to preview transactions');
    return response.json();
  } catch (error) {
    console.error('Error previewing transactions:', error);
    return { transactions: [], total: 0 };
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/utils/storage.ts
git commit -m "feat: add Dashboard/Panel types and storage methods"
```

---

## Task 5: `TransactionPreview` component

**Files:**
- Create: `src/components/dashboards/TransactionPreview.tsx`

This is a pure display component — build it first because `PanelEditorSidebar` depends on it.

- [ ] **Step 1: Create `src/components/dashboards/TransactionPreview.tsx`**

```tsx
import React from 'react';
import { Expense } from '../../types';
import { formatCurrency } from '../../utils';

interface TransactionPreviewProps {
  transactions: Expense[];
  total: number;
  loading: boolean;
}

export const TransactionPreview: React.FC<TransactionPreviewProps> = ({ transactions, total, loading }) => {
  if (loading) {
    return (
      <div className="mt-4">
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Loading preview...</div>
        <div className="space-y-1">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
        {total === 0
          ? 'No transactions match these filters'
          : `${total} transaction${total === 1 ? '' : 's'} matched${total > transactions.length ? ` (showing ${transactions.length})` : ''}`}
      </div>
      {transactions.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Date</th>
                <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Description</th>
                <th className="text-right px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {transactions.map(tx => (
                <tr key={tx.id} className="bg-white dark:bg-gray-900">
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {tx.date.toString().slice(0, 10)}
                  </td>
                  <td className="px-3 py-2 text-gray-900 dark:text-white truncate max-w-[140px]">
                    {tx.description}
                  </td>
                  <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${
                    tx.type === 'income'
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboards/TransactionPreview.tsx
git commit -m "feat: add TransactionPreview component"
```

---

## Task 6: `DashboardPanel` component

**Files:**
- Create: `src/components/dashboards/DashboardPanel.tsx`

- [ ] **Step 1: Create `src/components/dashboards/DashboardPanel.tsx`**

```tsx
import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { DashboardPanel as DashboardPanelType, PanelMonthData } from '../../types';
import { formatCurrency } from '../../utils';
import { useTheme } from '../../contexts/ThemeContext';

interface DashboardPanelProps {
  panel: DashboardPanelType;
  data: PanelMonthData[];
  loading: boolean;
  onEdit: (panel: DashboardPanelType) => void;
  onDelete: (panelId: string) => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-900 p-3 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg text-xs">
      <p className="font-medium text-gray-900 dark:text-white mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color ?? entry.fill }}>
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
};

export const DashboardPanel: React.FC<DashboardPanelProps> = ({ panel, data, loading, onEdit, onDelete }) => {
  const { theme } = useTheme();
  const gridStroke = theme === 'dark' ? '#374151' : '#e5e7eb';
  const axisStroke = theme === 'dark' ? '#9ca3af' : '#6b7280';

  const renderChart = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }

    if (!data.length) {
      return (
        <div className="flex items-center justify-center h-full text-sm text-gray-500 dark:text-gray-400">
          No data for selected period
        </div>
      );
    }

    const isNet = panel.seriesMode === 'net_amount';
    const yFormatter = (v: number) => `$${Math.abs(v).toFixed(0)}`;

    if (panel.chartType === 'line') {
      return (
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey="month" stroke={axisStroke} fontSize={11} />
          <YAxis stroke={axisStroke} fontSize={11} tickFormatter={yFormatter} />
          <Tooltip content={<CustomTooltip />} />
          {isNet ? (
            <Line type="monotone" dataKey="net" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Net" />
          ) : (
            <>
              {(panel.filterType === 'both' || panel.filterType === 'income') && (
                <Line type="monotone" dataKey="income" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Income" />
              )}
              {(panel.filterType === 'both' || panel.filterType === 'expense') && (
                <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Expenses" />
              )}
            </>
          )}
        </LineChart>
      );
    }

    // Bar chart
    return (
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
        <XAxis dataKey="month" stroke={axisStroke} fontSize={11} />
        <YAxis
          stroke={axisStroke}
          fontSize={11}
          tickFormatter={yFormatter}
          reversed={panel.netOrientation === 'expense_positive'}
        />
        <Tooltip content={<CustomTooltip />} />
        {isNet ? (
          <Bar dataKey="net" radius={[4, 4, 0, 0]} name="Net">
            {data.map((entry, i) => (
              <Cell key={i} fill={(entry.net ?? 0) >= 0 ? '#22c55e' : '#ef4444'} />
            ))}
          </Bar>
        ) : (
          <>
            {(panel.filterType === 'both' || panel.filterType === 'income') && (
              <Bar dataKey="income" fill="#22c55e" radius={[4, 4, 0, 0]} name="Income" />
            )}
            {(panel.filterType === 'both' || panel.filterType === 'expense') && (
              <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Expenses" />
            )}
          </>
        )}
      </BarChart>
    );
  };

  return (
    <div className="card group relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate pr-2">{panel.title}</h3>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(panel)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
            aria-label="Edit panel"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(panel.id)}
            className="p-1 text-gray-400 hover:text-red-500 rounded"
            aria-label="Delete panel"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={220}>
        {renderChart() as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
};
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboards/DashboardPanel.tsx
git commit -m "feat: add DashboardPanel component with Recharts line and bar charts"
```

---

## Task 7: `PanelEditorSidebar` component

**Files:**
- Create: `src/components/dashboards/PanelEditorSidebar.tsx`

- [ ] **Step 1: Create `src/components/dashboards/PanelEditorSidebar.tsx`**

```tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { DashboardPanel, Dashboard } from '../../types';
import { LocalStorage } from '../../utils/storage';
import { TransactionPreview } from './TransactionPreview';
import { generateId } from '../../utils';

interface PanelEditorSidebarProps {
  dashboard: Dashboard;
  panel: DashboardPanel | null; // null = create mode
  categories: string[];
  selectedUserId: string | null;
  onSave: (panel: DashboardPanel) => void;
  onClose: () => void;
}

const EMPTY_FORM = {
  title: '',
  chartType: 'bar' as 'bar' | 'line',
  filterType: 'both' as 'expense' | 'income' | 'both',
  filterCategories: [] as string[],
  filterRegex: '',
  seriesMode: 'two_series' as 'two_series' | 'net_amount',
  netOrientation: 'income_positive' as 'income_positive' | 'expense_positive',
};

export const PanelEditorSidebar: React.FC<PanelEditorSidebarProps> = ({
  dashboard,
  panel,
  categories,
  selectedUserId,
  onSave,
  onClose,
}) => {
  const isEdit = !!panel;
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [regexError, setRegexError] = useState('');
  const [previewTransactions, setPreviewTransactions] = useState<any[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Populate form when editing
  useEffect(() => {
    if (panel) {
      setForm({
        title: panel.title,
        chartType: panel.chartType,
        filterType: panel.filterType,
        filterCategories: panel.filterCategories,
        filterRegex: panel.filterRegex || '',
        seriesMode: panel.seriesMode,
        netOrientation: panel.netOrientation || 'income_positive',
      });
    } else {
      setForm({ ...EMPTY_FORM });
    }
    setRegexError('');
    setPreviewTransactions([]);
    setPreviewTotal(0);
  }, [panel]);

  // Validate regex
  const validateRegex = (value: string): boolean => {
    if (!value) { setRegexError(''); return true; }
    try { new RegExp(value); setRegexError(''); return true; }
    catch (e: any) { setRegexError(e.message); return false; }
  };

  // Debounced preview fetch
  const fetchPreview = useCallback((currentForm: typeof form) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setPreviewLoading(true);
      const types = currentForm.filterType === 'both' ? [] : [currentForm.filterType];
      const result = await LocalStorage.previewPanelTransactions({
        types,
        categories: currentForm.filterCategories,
        regex: currentForm.filterRegex || null,
        userId: selectedUserId,
        dateFrom: dashboard.dateRangeStart,
        dateTo: dashboard.dateRangeEnd,
        limit: 10,
      });
      setPreviewTransactions(result.transactions);
      setPreviewTotal(result.total);
      setPreviewLoading(false);
    }, 400);
  }, [dashboard, selectedUserId]);

  const handleChange = (updates: Partial<typeof form>) => {
    const next = { ...form, ...updates };
    if ('filterRegex' in updates) validateRegex(updates.filterRegex || '');
    setForm(next);
    fetchPreview(next);
  };

  // Initial preview fetch on open
  useEffect(() => { fetchPreview(form); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!form.title.trim()) return;
    if (form.filterRegex && !validateRegex(form.filterRegex)) return;
    setSaving(true);
    try {
      let saved: DashboardPanel;
      const payload = {
        id: panel?.id || generateId(),
        title: form.title.trim(),
        chartType: form.chartType,
        filterType: form.filterType,
        filterCategories: form.filterCategories,
        filterRegex: form.filterRegex || null,
        seriesMode: form.seriesMode,
        netOrientation: form.seriesMode === 'net_amount' ? form.netOrientation : null,
        panelOrder: panel?.panelOrder ?? 0,
      };
      if (isEdit) {
        saved = await LocalStorage.updatePanel(panel!.id, payload);
      } else {
        saved = await LocalStorage.createPanel(dashboard.id, payload);
      }
      onSave(saved);
    } catch (e: any) {
      console.error('Failed to save panel:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-25 z-40" onClick={onClose} />

      {/* Slide-in panel */}
      <div className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 z-50 flex flex-col shadow-xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {isEdit ? 'Edit Panel' : 'Add Panel'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 px-5 py-4 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={e => handleChange({ title: e.target.value })}
              placeholder="e.g. Uber / Lyft Spending"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Chart type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Chart Type</label>
            <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
              {(['bar', 'line'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => handleChange({ chartType: type })}
                  className={`flex-1 py-2 text-sm font-medium capitalize transition-colors ${
                    form.chartType === type
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Filter type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Transaction Type</label>
            <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
              {(['both', 'expense', 'income'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => handleChange({ filterType: type })}
                  className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
                    form.filterType === type
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Categories <span className="text-gray-400 font-normal">(leave empty for all)</span>
            </label>
            <div className="flex flex-wrap gap-1 p-2 border border-gray-300 dark:border-gray-600 rounded-lg max-h-32 overflow-y-auto">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => {
                    const next = form.filterCategories.includes(cat)
                      ? form.filterCategories.filter(c => c !== cat)
                      : [...form.filterCategories, cat];
                    handleChange({ filterCategories: next });
                  }}
                  className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                    form.filterCategories.includes(cat)
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Regex */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description Regex <span className="text-gray-400 font-normal">(POSIX, e.g. uber|lyft)</span>
            </label>
            <input
              type="text"
              value={form.filterRegex}
              onChange={e => handleChange({ filterRegex: e.target.value })}
              placeholder="uber|lyft"
              className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 ${
                regexError
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
              }`}
            />
            {regexError && <p className="mt-1 text-xs text-red-500">{regexError}</p>}
          </div>

          {/* Series mode */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Y-Axis Mode</label>
            <div className="space-y-2">
              {[
                { value: 'two_series', label: 'Two Series (Income & Expenses)' },
                { value: 'net_amount', label: 'Net Amount' },
              ].map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="seriesMode"
                    value={opt.value}
                    checked={form.seriesMode === opt.value}
                    onChange={() => handleChange({ seriesMode: opt.value as any })}
                    className="text-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Net orientation (only when net_amount) */}
          {form.seriesMode === 'net_amount' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Net Amount Orientation</label>
              <div className="space-y-2">
                {[
                  { value: 'income_positive', label: 'Income positive (surplus goes up)' },
                  { value: 'expense_positive', label: 'Expense positive (spending goes up)' },
                ].map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="netOrientation"
                      value={opt.value}
                      checked={form.netOrientation === opt.value}
                      onChange={() => handleChange({ netOrientation: opt.value as any })}
                      className="text-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Transaction preview */}
          <div>
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Transaction Preview</div>
            <TransactionPreview
              transactions={previewTransactions}
              total={previewTotal}
              loading={previewLoading}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!form.title.trim() || !!regexError || saving}
            className="flex-1 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving…' : 'Save Panel'}
          </button>
        </div>
      </div>
    </>
  );
};
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboards/PanelEditorSidebar.tsx
git commit -m "feat: add PanelEditorSidebar with debounced transaction preview"
```

---

## Task 8: `DashboardView` component

**Files:**
- Create: `src/components/dashboards/DashboardView.tsx`

Uses dnd-kit for drag-and-drop. Key concepts:
- `DndContext` wraps the sortable grid; `SortableContext` gets the ordered list of panel IDs.
- Each panel is wrapped in `useSortable` to get drag handle props.
- On `DragEndEvent`, compute new order and optimistically update local state before calling the server.

- [ ] **Step 1: Create `src/components/dashboards/DashboardView.tsx`**

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, rectSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Dashboard, DashboardPanel as DashboardPanelType, PanelData, PanelMonthData } from '../../types';
import { LocalStorage } from '../../utils/storage';
import { DateRangePicker } from '../DateRangePicker';
import { DashboardPanel } from './DashboardPanel';
import { PanelEditorSidebar } from './PanelEditorSidebar';

// Sortable wrapper for each panel
const SortablePanel: React.FC<{
  panel: DashboardPanelType;
  data: PanelMonthData[];
  loading: boolean;
  onEdit: (p: DashboardPanelType) => void;
  onDelete: (id: string) => void;
}> = ({ panel, data, loading, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: panel.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab',
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <DashboardPanel panel={panel} data={data} loading={loading} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
};

interface DashboardViewProps {
  dashboard: Dashboard;
  categories: string[];
  selectedUserId: string | null;
  onDashboardUpdated: (d: Dashboard) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  dashboard, categories, selectedUserId, onDashboardUpdated,
}) => {
  const [panels, setPanels] = useState<DashboardPanelType[]>([]);
  const [panelDataMap, setPanelDataMap] = useState<Record<string, PanelMonthData[]>>({});
  const [dataLoading, setDataLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: new Date(dashboard.dateRangeStart),
    end: new Date(dashboard.dateRangeEnd),
  });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPanel, setEditingPanel] = useState<DashboardPanelType | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Load panels list (not data) — only when dashboard changes
  useEffect(() => {
    // Panels come embedded in the data response; seed from empty until first fetch
    setPanels([]);
    setPanelDataMap({});
  }, [dashboard.id]);

  // Fetch batched panel data
  const fetchData = useCallback(async () => {
    setDataLoading(true);
    const results = await LocalStorage.loadDashboardData(dashboard.id, {
      userId: selectedUserId,
      dateRangeStart: dateRange.start.toISOString().slice(0, 10),
      dateRangeEnd: dateRange.end.toISOString().slice(0, 10),
    });
    const map: Record<string, PanelMonthData[]> = {};
    results.forEach(r => { map[r.panelId] = r.data; });
    setPanelDataMap(map);
    setDataLoading(false);
  }, [dashboard.id, selectedUserId, dateRange]);

  // Also need panel metadata — fetch panels list via a separate call or load them
  // from a GET endpoint. We derive the list from the stored panels state + editor saves.
  // On mount, do a GET to load panels:
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Re-use the dashboard data endpoint which returns per-panel data;
      // we also need panel configs. Add a GET /api/dashboards/:id/panels endpoint
      // OR derive from existing panels state after first save.
      // For now, load via the dashboards list (panelCount only) and separately
      // fetch panels after any mutation. We call fetchData which gives us data;
      // panel configs are loaded via a dedicated fetch below.
      try {
        const res = await fetch(`http://localhost:3001/api/dashboards/${dashboard.id}/panels`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setPanels(data);
      } catch { /* ignore */ }
    };
    load();
    return () => { cancelled = true; };
  }, [dashboard.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = panels.findIndex(p => p.id === active.id);
    const newIndex = panels.findIndex(p => p.id === over.id);
    const reordered = arrayMove(panels, oldIndex, newIndex);
    setPanels(reordered); // optimistic update
    await LocalStorage.reorderPanels(dashboard.id, reordered.map(p => p.id));
  };

  const handlePanelSaved = async (saved: DashboardPanelType) => {
    setPanels(prev => {
      const idx = prev.findIndex(p => p.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    setEditorOpen(false);
    setEditingPanel(null);
    await fetchData(); // refresh chart data for updated panel
  };

  const handleDeletePanel = async (panelId: string) => {
    await LocalStorage.deletePanel(panelId);
    setPanels(prev => prev.filter(p => p.id !== panelId));
    setPanelDataMap(prev => { const n = { ...prev }; delete n[panelId]; return n; });
  };

  const handleDateChange = async (range: { start: Date; end: Date }) => {
    setDateRange(range);
    // Persist to dashboard
    await LocalStorage.updateDashboard(dashboard.id, {
      dateRangeStart: range.start.toISOString().slice(0, 10),
      dateRangeEnd: range.end.toISOString().slice(0, 10),
    });
  };

  const panelLimitReached = panels.length >= 15;

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <DateRangePicker
          currentRange={dateRange}
          onDateRangeChange={handleDateChange}
        />
        <button
          onClick={() => { setEditingPanel(null); setEditorOpen(true); }}
          disabled={panelLimitReached}
          title={panelLimitReached ? 'Maximum of 15 panels reached' : 'Add panel'}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={16} />
          Add Panel
        </button>
      </div>

      {/* Panel grid */}
      {panels.length === 0 && !dataLoading ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
          <p className="text-sm">No panels yet.</p>
          <button
            onClick={() => { setEditingPanel(null); setEditorOpen(true); }}
            className="mt-3 text-sm text-blue-500 hover:underline"
          >
            Add your first panel
          </button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={panels.map(p => p.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-4">
              {panels.map(panel => (
                <SortablePanel
                  key={panel.id}
                  panel={panel}
                  data={panelDataMap[panel.id] || []}
                  loading={dataLoading}
                  onEdit={p => { setEditingPanel(p); setEditorOpen(true); }}
                  onDelete={handleDeletePanel}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Panel editor sidebar */}
      {editorOpen && (
        <PanelEditorSidebar
          dashboard={dashboard}
          panel={editingPanel}
          categories={categories}
          selectedUserId={selectedUserId}
          onSave={handlePanelSaved}
          onClose={() => { setEditorOpen(false); setEditingPanel(null); }}
        />
      )}
    </div>
  );
};
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboards/DashboardView.tsx routes/dashboards.js
git commit -m "feat: add DashboardView with dnd-kit panel grid and batched data fetch"
```

---

## Task 9: `PersonalDashboards` page and routing

**Files:**
- Create: `src/components/dashboards/PersonalDashboards.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/components/dashboards/PersonalDashboards.tsx`**

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { Star, Trash2, Pencil, Plus, LayoutDashboard } from 'lucide-react';
import { Dashboard } from '../../types';
import { LocalStorage } from '../../utils/storage';
import { DashboardView } from './DashboardView';
import { generateId } from '../../utils';
import { toast } from 'react-toastify';

interface PersonalDashboardsProps {
  categories: string[];
  selectedUserId: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const oneYearAgo = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
};

export const PersonalDashboards: React.FC<PersonalDashboardsProps> = ({ categories, selectedUserId }) => {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      const list = await LocalStorage.loadDashboards();
      setDashboards(list);
      if (list.length > 0) {
        const def = list.find(d => d.isDefault) || list[0];
        setSelectedId(def.id);
      }
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (renamingId && renameInputRef.current) renameInputRef.current.focus();
  }, [renamingId]);

  const selectedDashboard = dashboards.find(d => d.id === selectedId) || null;

  const handleCreateDashboard = async () => {
    const name = `Dashboard ${dashboards.length + 1}`;
    const created = await LocalStorage.createDashboard({
      id: generateId(),
      name,
      isDefault: dashboards.length === 0,
      dateRangeStart: oneYearAgo(),
      dateRangeEnd: today(),
    });
    setDashboards(prev => [...prev, created]);
    setSelectedId(created.id);
  };

  const handleSetDefault = async (id: string) => {
    const updated = await LocalStorage.updateDashboard(id, { isDefault: true });
    setDashboards(prev => prev.map(d => ({
      ...d,
      isDefault: d.id === id,
    })));
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this dashboard and all its panels?')) return;
    await LocalStorage.deleteDashboard(id);
    const remaining = dashboards.filter(d => d.id !== id);
    setDashboards(remaining);
    if (selectedId === id) setSelectedId(remaining[0]?.id || null);
    toast.success('Dashboard deleted');
  };

  const handleStartRename = (d: Dashboard) => {
    setRenamingId(d.id);
    setRenameValue(d.name);
  };

  const handleRenameSubmit = async (id: string) => {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    const updated = await LocalStorage.updateDashboard(id, { name: renameValue.trim() });
    setDashboards(prev => prev.map(d => d.id === id ? { ...d, name: updated.name } : d));
    setRenamingId(null);
  };

  const handleDashboardUpdated = (updated: Dashboard) => {
    setDashboards(prev => prev.map(d => d.id === updated.id ? updated : d));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Empty state
  if (dashboards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-4 p-8">
        <LayoutDashboard size={48} className="text-gray-300 dark:text-gray-600" />
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">No dashboards yet</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Create your first dashboard to start visualizing your transactions.</p>
        </div>
        <button
          onClick={handleCreateDashboard}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
        >
          <Plus size={16} />
          Create your first dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Dashboard selector header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        {/* Dropdown */}
        <select
          value={selectedId || ''}
          onChange={e => setSelectedId(e.target.value)}
          className="text-sm font-medium bg-transparent text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {dashboards.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>

        {/* Inline rename */}
        {selectedDashboard && (
          renamingId === selectedDashboard.id ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={() => handleRenameSubmit(selectedDashboard.id)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleRenameSubmit(selectedDashboard.id);
                if (e.key === 'Escape') setRenamingId(null);
              }}
              className="text-sm border border-blue-400 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none"
            />
          ) : (
            <button
              onClick={() => handleStartRename(selectedDashboard)}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
              title="Rename dashboard"
            >
              <Pencil size={14} />
            </button>
          )
        )}

        {/* Set default */}
        {selectedDashboard && (
          <button
            onClick={() => handleSetDefault(selectedDashboard.id)}
            className={`p-1.5 rounded transition-colors ${
              selectedDashboard.isDefault
                ? 'text-yellow-500'
                : 'text-gray-400 hover:text-yellow-500'
            }`}
            title={selectedDashboard.isDefault ? 'Default dashboard' : 'Set as default'}
          >
            <Star size={14} fill={selectedDashboard.isDefault ? 'currentColor' : 'none'} />
          </button>
        )}

        {/* Delete */}
        {selectedDashboard && (
          <button
            onClick={() => handleDelete(selectedDashboard.id)}
            className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
            title="Delete dashboard"
          >
            <Trash2 size={14} />
          </button>
        )}

        <div className="ml-auto">
          <button
            onClick={handleCreateDashboard}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
          >
            <Plus size={13} />
            New Dashboard
          </button>
        </div>
      </div>

      {/* Dashboard content */}
      {selectedDashboard && (
        <DashboardView
          key={selectedDashboard.id}
          dashboard={selectedDashboard}
          categories={categories}
          selectedUserId={selectedUserId}
          onDashboardUpdated={handleDashboardUpdated}
        />
      )}
    </div>
  );
};
```

- [ ] **Step 2: Add nav item to `src/components/Sidebar.tsx`**

In `Sidebar.tsx`, add an import for `LayoutDashboard` from lucide-react and add the nav item to the `navItems` array:

```typescript
// Add LayoutDashboard to the existing import
import { Menu, X, BarChart3, Receipt, FileText, Settings, TrendingUp, LayoutDashboard } from 'lucide-react';
```

```typescript
const navItems = [
  { path: '/', label: 'Dashboard', icon: BarChart3 },
  { path: '/transactions', label: 'Transactions', icon: Receipt },
  { path: '/reports', label: 'Reports', icon: FileText },
  { path: '/net-worth', label: 'Net Worth', icon: TrendingUp },
  { path: '/personal-dashboards', label: 'Personal Dashboards', icon: LayoutDashboard },
  { path: '/settings', label: 'Settings', icon: Settings },
];
```

- [ ] **Step 3: Add route to `src/App.tsx`**

In `App.tsx`:

1. Add import:
```typescript
import { PersonalDashboards } from './components/dashboards/PersonalDashboards';
```

2. Inside the `<Routes>` block, add the new route alongside the existing ones:
```tsx
<Route
  path="/personal-dashboards"
  element={
    <PersonalDashboards
      categories={categories}
      selectedUserId={selectedUserId}
    />
  }
/>
```

- [ ] **Step 4: Verify everything compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Start the app and do an end-to-end smoke test**

```bash
npm run dev
```

Open http://localhost:3000. In the sidebar, click "Personal Dashboards":
1. Empty state should appear with "Create your first dashboard"
2. Click it — dashboard is created, `DashboardView` renders
3. Click "Add Panel" — sidebar slides in from the right
4. Fill in title, set regex to `uber|lyft`, click "Save Panel"
5. Panel card appears in the grid with a chart (or "No data" if no transactions match)
6. Hover the panel — pencil and trash icons appear
7. Drag one panel over another — order updates
8. Click the star icon — dashboard marked as default
9. Create a second dashboard — dropdown shows both
10. Delete a dashboard with the trash icon — confirmation prompt, then removed

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboards/ src/components/Sidebar.tsx src/App.tsx
git commit -m "feat: add PersonalDashboards page, sidebar nav, and App routing"
```

---

## Task 10: Final polish and edge cases

**Files:**
- Modify: `src/components/dashboards/DashboardView.tsx` (minor cleanup)
- Modify: `routes/dashboards.js` (minor cleanup)

- [ ] **Step 1: Verify the 15-panel limit is enforced in the UI**

Open a dashboard. Add 15 panels. Verify "Add Panel" button becomes disabled and shows the tooltip "Maximum of 15 panels reached". Attempt to add a 16th panel via the API directly:

```bash
# Should return 400
curl -s -X POST http://localhost:3001/api/dashboards/<dashboard-id>/panels \
  -H 'Content-Type: application/json' \
  -d '{"id":"x","title":"x","chartType":"bar"}' | jq .error
```

Expected: `"Dashboard has reached the 15-panel limit"`

- [ ] **Step 2: Verify invalid regex is rejected in the editor**

Open the panel editor. Type `[invalid` in the regex field. Verify:
- Red border appears on the input
- Inline error message shows below
- "Save Panel" button is disabled

- [ ] **Step 3: Verify `is_default` constraint — only one default at a time**

Create two dashboards. Set dashboard A as default. Then set dashboard B as default. Verify:
```bash
curl -s http://localhost:3001/api/dashboards | jq '[.[] | {name: .name, isDefault: .isDefault}]'
```
Expected: only one has `isDefault: true`.

- [ ] **Step 4: Verify deleting a dashboard with panels also deletes the panels**

```bash
# Create dashboard + panel, then delete dashboard, then confirm panels are gone
curl -s http://localhost:3001/api/dashboards | jq '[.[] | {id, name, panelCount}]'
```

- [ ] **Step 5: Run TypeScript check one final time**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Final commit**

```bash
git add -p  # stage only intentional changes
git commit -m "feat: complete Personal Dashboards feature"
```
