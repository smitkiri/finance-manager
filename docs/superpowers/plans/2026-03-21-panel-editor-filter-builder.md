# Panel Editor & Advanced Filter Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the slide-in panel editor sidebar with a full-page Grafana-like editor and a composable AND/OR filter builder.

**Architecture:** New `filter_groups` JSONB column replaces flat filter fields. Backend builds SQL WHERE clauses from nested filter groups (AND within groups, OR between groups). Frontend replaces `PanelEditorSidebar` with full-page `PanelEditor` containing a `FilterBuilder` component, chart preview, and transaction preview.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Recharts, Express.js, PostgreSQL, pg

**Spec:** `docs/superpowers/specs/2026-03-21-panel-editor-filter-builder-design.md`

---

### Task 1: Database Migration — Add `filter_groups` Column

**Files:**
- Modify: `migrate.js:568-611` (add new migration function and register it)

- [ ] **Step 1: Add migration function `addPanelFilterGroups`**

Add this function before `runMigration` in `migrate.js`:

```javascript
/**
 * Add filter_groups JSONB column and populate from flat filter fields
 */
const addPanelFilterGroups = async () => {
  const alreadyRun = await db.query(
    "SELECT 1 FROM migrations WHERE migration_name = $1",
    ['add_panel_filter_groups']
  );
  if (alreadyRun.rows.length > 0) return;

  console.log('Adding filter_groups column to dashboard_panels...');

  // Add the new column
  await db.query(`
    ALTER TABLE dashboard_panels
    ADD COLUMN IF NOT EXISTS filter_groups JSONB NOT NULL DEFAULT '[]'::jsonb
  `);

  // Populate from existing flat fields
  const panels = await db.query('SELECT id, filter_type, filter_categories, filter_labels, filter_regex FROM dashboard_panels');
  for (const row of panels.rows) {
    const conditions = [];
    if (row.filter_type && row.filter_type !== 'both') {
      conditions.push({ field: 'type', operator: 'is', value: row.filter_type });
    }
    const categories = row.filter_categories || [];
    if (categories.length > 0) {
      conditions.push({ field: 'category', operator: 'is', value: categories });
    }
    const labels = row.filter_labels || [];
    if (labels.length > 0) {
      conditions.push({ field: 'labels', operator: 'includes', value: labels });
    }
    if (row.filter_regex) {
      conditions.push({ field: 'description', operator: 'matches', value: row.filter_regex });
    }
    const filterGroups = conditions.length > 0 ? [{ conditions }] : [];
    await db.query(
      'UPDATE dashboard_panels SET filter_groups = $1 WHERE id = $2',
      [JSON.stringify(filterGroups), row.id]
    );
  }

  await db.query(
    "INSERT INTO migrations (migration_name) VALUES ($1) ON CONFLICT DO NOTHING",
    ['add_panel_filter_groups']
  );
  console.log('Panel filter_groups column added and populated successfully');
};
```

- [ ] **Step 2: Register migration in `runMigration`**

Add `await addPanelFilterGroups();` after the `await addPanelFilterLabels();` line (line 610).

- [ ] **Step 3: Run migration and verify**

Run: `npm run migrate`
Expected: "Panel filter_groups column added and populated successfully"

- [ ] **Step 4: Commit**

```bash
git add migrate.js
git commit -m "feat: add filter_groups JSONB column to dashboard_panels with data migration"
```

---

### Task 2: Database Migration — Drop Old Flat Filter Columns

> **Note:** This migration should be deployed SEPARATELY from Task 1, after Task 1 is confirmed working. Define the function now but do NOT register it in `runMigration` yet. It will be registered in a future deploy.

**Files:**
- Modify: `migrate.js` (add migration function — do NOT register yet)

- [ ] **Step 1: Add migration function `dropOldPanelFilterColumns`**

Add after `addPanelFilterGroups`. Do NOT add a call to it in `runMigration` — it will be registered after the new code is validated.

```javascript
/**
 * Drop old flat filter columns now that filter_groups is in use.
 * NOTE: Register this in runMigration() only AFTER the new filter_groups
 * code path is confirmed working in production.
 */
const dropOldPanelFilterColumns = async () => {
  const alreadyRun = await db.query(
    "SELECT 1 FROM migrations WHERE migration_name = $1",
    ['drop_old_panel_filter_columns']
  );
  if (alreadyRun.rows.length > 0) return;

  console.log('Dropping old panel filter columns...');
  await db.query(`ALTER TABLE dashboard_panels DROP COLUMN IF EXISTS filter_type`);
  await db.query(`ALTER TABLE dashboard_panels DROP COLUMN IF EXISTS filter_categories`);
  await db.query(`ALTER TABLE dashboard_panels DROP COLUMN IF EXISTS filter_labels`);
  await db.query(`ALTER TABLE dashboard_panels DROP COLUMN IF EXISTS filter_regex`);

  await db.query(
    "INSERT INTO migrations (migration_name) VALUES ($1) ON CONFLICT DO NOTHING",
    ['drop_old_panel_filter_columns']
  );
  console.log('Old panel filter columns dropped successfully');
};
```

- [ ] **Step 2: Commit (function only, not registered)**

```bash
git add migrate.js
git commit -m "feat: add dropOldPanelFilterColumns migration (not yet registered)"
```

---

### Task 3: Update TypeScript Types

**Files:**
- Modify: `src/types.ts:229-243`

- [ ] **Step 1: Add FilterCondition and FilterGroup interfaces**

Add before the `DashboardPanel` interface (before line 229):

```typescript
export interface FilterCondition {
  field: 'type' | 'category' | 'labels' | 'description' | 'amount';
  operator: string; // 'is' | 'is_not' | 'includes' | 'excludes' | 'matches' | 'gte' | 'lte'
  value: string | string[] | number;
}

export interface FilterGroup {
  conditions: FilterCondition[];
}
```

- [ ] **Step 2: Update DashboardPanel interface**

Replace the current `DashboardPanel` interface (lines 229-243) with:

```typescript
export interface DashboardPanel {
  id: string;
  dashboardId: string;
  title: string;
  chartType: 'bar' | 'line';
  seriesMode: 'two_series' | 'net_amount';
  netOrientation: 'income_positive' | 'expense_positive' | null;
  filterGroups: FilterGroup[];
  panelOrder: number;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: Compilation errors in files that still reference old fields (expected at this stage)

- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat: add FilterCondition/FilterGroup types, update DashboardPanel interface"
```

---

### Task 4: Update Backend — Query Builder and `rowToPanel`

**Files:**
- Modify: `helpers/queryBuilders.js:110-171` (replace `buildPanelDataQuery`)
- Modify: `routes/dashboards.js:21-37` (update `rowToPanel`)

- [ ] **Step 1: Replace `buildPanelDataQuery` with `buildFilterGroupsWhereClause` and updated `buildPanelDataQuery`**

Replace lines 110-169 in `helpers/queryBuilders.js` with:

```javascript
/**
 * Build a WHERE clause fragment from filter_groups JSONB.
 * Groups are OR'd; conditions within a group are AND'd.
 * Appends to an existing parameterized query.
 *
 * @param {Array} filterGroups - parsed filter_groups JSONB
 * @param {any[]} params - existing params array (mutated in place)
 * @param {number} startParam - next $N index
 * @returns {{ sql: string, nextParam: number }} - SQL fragment (without leading AND/OR) and updated param index
 */
function buildFilterGroupsWhereClause(filterGroups, params, startParam) {
  if (!filterGroups || filterGroups.length === 0) {
    return { sql: '', nextParam: startParam };
  }

  let nextParam = startParam;
  const groupSqls = [];

  for (const group of filterGroups) {
    if (!group.conditions || group.conditions.length === 0) continue;

    const condSqls = [];
    for (const cond of group.conditions) {
      switch (cond.field) {
        case 'type':
          if (cond.operator === 'is' && cond.value) {
            condSqls.push(`type = $${nextParam}`);
            params.push(cond.value);
            nextParam++;
          }
          break;
        case 'category':
          if (Array.isArray(cond.value) && cond.value.length > 0) {
            if (cond.operator === 'is') {
              condSqls.push(`category = ANY($${nextParam}::text[])`);
            } else {
              condSqls.push(`category != ALL($${nextParam}::text[])`);
            }
            params.push(cond.value);
            nextParam++;
          }
          break;
        case 'labels':
          if (Array.isArray(cond.value) && cond.value.length > 0) {
            const exists = cond.operator === 'excludes' ? 'NOT EXISTS' : 'EXISTS';
            condSqls.push(`${exists} (
              SELECT 1 FROM jsonb_array_elements_text(COALESCE(labels, '[]'::jsonb)) AS lbl
              WHERE lbl = ANY($${nextParam}::text[])
            )`);
            params.push(cond.value);
            nextParam++;
          }
          break;
        case 'description':
          if (cond.operator === 'matches' && cond.value) {
            condSqls.push(`description ~* $${nextParam}`);
            params.push(cond.value);
            nextParam++;
          }
          break;
        case 'amount':
          if (cond.value != null && cond.value !== '') {
            if (cond.operator === 'gte') {
              condSqls.push(`amount >= $${nextParam}`);
            } else {
              condSqls.push(`amount <= $${nextParam}`);
            }
            params.push(parseFloat(cond.value));
            nextParam++;
          }
          break;
      }
    }

    if (condSqls.length > 0) {
      groupSqls.push(`(${condSqls.join(' AND ')})`);
    }
  }

  if (groupSqls.length === 0) {
    return { sql: '', nextParam };
  }

  const sql = groupSqls.length === 1
    ? groupSqls[0]
    : `(${groupSqls.join(' OR ')})`;

  return { sql, nextParam };
}

/**
 * Build the monthly aggregate SQL query for a single dashboard panel.
 * Extends buildStatsWhereClause with filter groups.
 */
function buildPanelDataQuery({ dateFrom, dateTo, userId, filterGroups }) {
  const { whereSql, params } = buildStatsWhereClause(dateFrom, dateTo, userId);
  let nextParam = params.length + 1;

  const { sql: filterSql, nextParam: updatedParam } = buildFilterGroupsWhereClause(
    filterGroups, params, nextParam
  );
  nextParam = updatedParam;

  const extraConditions = filterSql ? ` AND ${filterSql}` : '';

  const sql = `
    SELECT
      TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM') AS sort_month,
      TO_CHAR(date, 'Mon YYYY') AS month,
      type,
      SUM(amount) AS total
    FROM transactions
    ${whereSql}${extraConditions}
    GROUP BY sort_month, month, type
    ORDER BY sort_month ASC
  `;

  return { sql, params };
}
```

- [ ] **Step 2: Update module.exports**

Change line 171 to:

```javascript
module.exports = { buildExpensesWhereClause, buildStatsWhereClause, rowToExpense, buildPanelDataQuery, buildFilterGroupsWhereClause };
```

- [ ] **Step 3: Update `rowToPanel` in `routes/dashboards.js`**

Replace lines 21-37 with:

```javascript
function rowToPanel(row) {
  return {
    id: row.id,
    dashboardId: row.dashboard_id,
    title: row.title,
    chartType: row.chart_type,
    seriesMode: row.series_mode,
    netOrientation: row.net_orientation || null,
    filterGroups: row.filter_groups || [],
    panelOrder: row.panel_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add helpers/queryBuilders.js routes/dashboards.js
git commit -m "feat: add buildFilterGroupsWhereClause, update rowToPanel for filter_groups"
```

---

### Task 5: Update Backend — Panel CRUD and Data Endpoints

**Files:**
- Modify: `routes/dashboards.js:4` (imports)
- Modify: `routes/dashboards.js:139-175` (create panel)
- Modify: `routes/dashboards.js:177-237` (preview endpoint — change to POST)
- Modify: `routes/dashboards.js:239-273` (update panel)
- Modify: `routes/dashboards.js:310-367` (data endpoint)

- [ ] **Step 1: Update import at line 4**

```javascript
const { buildStatsWhereClause, buildPanelDataQuery, buildFilterGroupsWhereClause } = require('../helpers/queryBuilders');
```

- [ ] **Step 2: Update create panel endpoint (lines 139-175)**

Replace the destructuring and INSERT query in the create handler:

```javascript
router.post('/dashboards/:id/panels', async (req, res) => {
  try {
    const { id: dashboardId } = req.params;
    const { id, title, chartType, filterGroups, seriesMode, netOrientation, panelOrder } = req.body;

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
         (id, dashboard_id, title, chart_type, filter_groups, series_mode, net_orientation, panel_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id, dashboardId, title, chartType,
        JSON.stringify(filterGroups || []),
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
```

- [ ] **Step 3: Change preview endpoint from GET to POST**

Replace the preview handler (lines 177-237) with:

```javascript
// POST /api/dashboard-panels/preview — MUST be before /:panelId
router.post('/dashboard-panels/preview', async (req, res) => {
  try {
    const { filterGroups, userId, dateFrom, dateTo, limit = 10, offset = 0 } = req.body;

    const { whereSql: baseSql, params } = buildStatsWhereClause(dateFrom, dateTo, userId);
    let nextParam = params.length + 1;

    const { sql: filterSql, nextParam: updatedParam } = buildFilterGroupsWhereClause(
      filterGroups || [], params, nextParam
    );
    nextParam = updatedParam;

    const extraConditions = filterSql ? ` AND ${filterSql}` : '';
    const fullWhere = `${baseSql}${extraConditions}`;

    const countResult = await db.query(
      `SELECT COUNT(*) FROM transactions ${fullWhere}`,
      params
    );
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
```

- [ ] **Step 4: Add chart data preview endpoint**

Add a new endpoint after the transaction preview endpoint that returns monthly aggregated data for the chart preview (avoids fetching thousands of rows client-side):

```javascript
// POST /api/dashboard-panels/chart-preview — monthly aggregates for filter preview
router.post('/dashboard-panels/chart-preview', async (req, res) => {
  try {
    const { filterGroups, userId, dateFrom, dateTo } = req.body;

    const { sql, params } = buildPanelDataQuery({
      dateFrom, dateTo, userId: userId || null,
      filterGroups: filterGroups || [],
    });

    const result = await db.query(sql, params);

    // Return raw rows — client aggregates by seriesMode
    const rows = result.rows.map(row => ({
      sortMonth: row.sort_month,
      month: row.month,
      type: row.type,
      total: parseFloat(row.total),
    }));

    res.json({ rows });
  } catch (err) {
    console.error('Error generating chart preview:', err);
    res.status(500).json({ error: 'Failed to generate chart preview' });
  }
});
```

- [ ] **Step 5: Update panel PATCH endpoint (lines 239-273)**

Replace the destructuring and field-building logic:

```javascript
router.patch('/dashboard-panels/:panelId', async (req, res) => {
  try {
    const { panelId } = req.params;
    const { title, chartType, filterGroups, seriesMode, netOrientation, panelOrder } = req.body;

    const fields = [];
    const params = [];
    let idx = 1;

    if (title !== undefined) { fields.push(`title = $${idx++}`); params.push(title); }
    if (chartType !== undefined) { fields.push(`chart_type = $${idx++}`); params.push(chartType); }
    if (filterGroups !== undefined) { fields.push(`filter_groups = $${idx++}`); params.push(JSON.stringify(filterGroups)); }
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
```

- [ ] **Step 6: Update data endpoint to use filterGroups**

In the data endpoint (line 311 area), update the `panels.map` callback to pass `filterGroups`:

```javascript
const { sql, params } = buildPanelDataQuery({
  dateFrom: dateRangeStart,
  dateTo: dateRangeEnd,
  userId: userId || null,
  filterGroups: panel.filterGroups,
});
```

Also update the `seriesMode` check — since `filterType` no longer exists, the two-series chart should always show both income and expenses bars. Remove the `filterType`-based logic from the aggregation code. The aggregation loop (lines 339-351) stays the same since it uses `panel.seriesMode`.

- [ ] **Step 7: Verify backend starts**

Run: `npm run server`
Expected: Server starts without errors on port 3001

- [ ] **Step 8: Commit**

```bash
git add routes/dashboards.js helpers/queryBuilders.js
git commit -m "feat: update panel CRUD, preview, and data endpoints for filter_groups"
```

---

### Task 6: Update Frontend API Layer (`storage.ts`)

**Files:**
- Modify: `src/utils/storage.ts:1247-1276` (previewPanelTransactions)

- [ ] **Step 1: Update `previewPanelTransactions` to use POST with filterGroups**

Replace lines 1247-1276 with:

```typescript
  static async previewPanelTransactions(opts: {
    filterGroups?: FilterGroup[];
    userId?: string | null;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ transactions: Expense[]; total: number }> {
    try {
      const response = await LocalStorage.apiFetch(`${this.API_BASE}/dashboard-panels/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      });
      if (!response.ok) throw new Error('Failed to preview transactions');
      return response.json();
    } catch (error) {
      console.error('Error previewing transactions:', error);
      return { transactions: [], total: 0 };
    }
  }
```

- [ ] **Step 2: Add `chartPreview` method**

Add after `previewPanelTransactions`:

```typescript
  static async chartPreview(opts: {
    filterGroups?: FilterGroup[];
    userId?: string | null;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<{ rows: { sortMonth: string; month: string; type: string; total: number }[] }> {
    try {
      const response = await LocalStorage.apiFetch(`${this.API_BASE}/dashboard-panels/chart-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      });
      if (!response.ok) throw new Error('Failed to fetch chart preview');
      return response.json();
    } catch (error) {
      console.error('Error fetching chart preview:', error);
      return { rows: [] };
    }
  }
```

- [ ] **Step 3: Add FilterGroup import**

At the top of `storage.ts`, ensure `FilterGroup` is imported from `../../types` (add it to the existing import).

- [ ] **Step 4: Commit**

```bash
git add src/utils/storage.ts
git commit -m "feat: update previewPanelTransactions to POST with filterGroups, add chartPreview"
```

---

### Task 7: Create FilterBuilder Component

**Files:**
- Create: `src/components/dashboards/FilterBuilder.tsx`

- [ ] **Step 1: Create the FilterBuilder component**

```typescript
import React from 'react';
import { X, Plus } from 'lucide-react';
import { FilterCondition, FilterGroup } from '../../types';

interface FilterBuilderProps {
  filterGroups: FilterGroup[];
  onChange: (filterGroups: FilterGroup[]) => void;
  categories: string[];
  allLabels: string[];
}

const FIELD_OPTIONS: { value: FilterCondition['field']; label: string }[] = [
  { value: 'type', label: 'Type' },
  { value: 'category', label: 'Category' },
  { value: 'labels', label: 'Labels' },
  { value: 'description', label: 'Description' },
  { value: 'amount', label: 'Amount' },
];

const OPERATORS_BY_FIELD: Record<FilterCondition['field'], { value: string; label: string }[]> = {
  type: [{ value: 'is', label: 'is' }],
  category: [{ value: 'is', label: 'is' }, { value: 'is_not', label: 'is not' }],
  labels: [{ value: 'includes', label: 'includes' }, { value: 'excludes', label: 'excludes' }],
  description: [{ value: 'matches', label: 'matches' }],
  amount: [{ value: 'gte', label: '>=' }, { value: 'lte', label: '<=' }],
};

function defaultOperator(field: FilterCondition['field']): string {
  return OPERATORS_BY_FIELD[field][0].value;
}

function defaultValue(field: FilterCondition['field']): FilterCondition['value'] {
  if (field === 'category' || field === 'labels') return [];
  if (field === 'amount') return '';
  return '';
}

const ConditionValueInput: React.FC<{
  condition: FilterCondition;
  categories: string[];
  allLabels: string[];
  onChange: (value: FilterCondition['value']) => void;
}> = ({ condition, categories, allLabels, onChange }) => {
  const { field, value } = condition;

  if (field === 'type') {
    return (
      <select
        value={(value as string) || ''}
        onChange={e => onChange(e.target.value)}
        className="flex-1 px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">Select...</option>
        <option value="expense">Expense</option>
        <option value="income">Income</option>
      </select>
    );
  }

  if (field === 'category') {
    const selected = Array.isArray(value) ? value as string[] : [];
    return (
      <div className="flex-1 flex flex-wrap gap-1 p-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded min-h-[34px] max-h-24 overflow-y-auto">
        {categories.map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => {
              const next = selected.includes(cat)
                ? selected.filter(c => c !== cat)
                : [...selected, cat];
              onChange(next);
            }}
            className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
              selected.includes(cat)
                ? 'bg-blue-500 border-blue-500 text-white'
                : 'border-gray-500 text-gray-400 hover:border-blue-400'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
    );
  }

  if (field === 'labels') {
    const selected = Array.isArray(value) ? value as string[] : [];
    return (
      <div className="flex-1 flex flex-wrap gap-1 p-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded min-h-[34px] max-h-24 overflow-y-auto">
        {allLabels.map(label => (
          <button
            key={label}
            type="button"
            onClick={() => {
              const next = selected.includes(label)
                ? selected.filter(l => l !== label)
                : [...selected, label];
              onChange(next);
            }}
            className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
              selected.includes(label)
                ? 'bg-blue-500 border-blue-500 text-white'
                : 'border-gray-500 text-gray-400 hover:border-blue-400'
            }`}
          >
            {label}
          </button>
        ))}
        {allLabels.length === 0 && (
          <span className="text-xs text-gray-500 px-1">No labels available</span>
        )}
      </div>
    );
  }

  if (field === 'amount') {
    return (
      <input
        type="number"
        value={value as number | string}
        onChange={e => onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
        placeholder="0.00"
        className="flex-1 px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    );
  }

  // description
  return (
    <input
      type="text"
      value={(value as string) || ''}
      onChange={e => onChange(e.target.value)}
      placeholder="regex pattern (e.g. uber|lyft)"
      className="flex-1 px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  );
};

export const FilterBuilder: React.FC<FilterBuilderProps> = ({
  filterGroups, onChange, categories, allLabels,
}) => {
  const updateCondition = (gi: number, ci: number, updates: Partial<FilterCondition>) => {
    const next = filterGroups.map((g, gIdx) => {
      if (gIdx !== gi) return g;
      return {
        ...g,
        conditions: g.conditions.map((c, cIdx) => {
          if (cIdx !== ci) return c;
          return { ...c, ...updates };
        }),
      };
    });
    onChange(next);
  };

  const addCondition = (gi: number) => {
    const next = filterGroups.map((g, gIdx) => {
      if (gIdx !== gi) return g;
      return {
        ...g,
        conditions: [...g.conditions, { field: 'type' as const, operator: 'is', value: '' }],
      };
    });
    onChange(next);
  };

  const removeCondition = (gi: number, ci: number) => {
    const group = filterGroups[gi];
    if (group.conditions.length <= 1) {
      // Remove the entire group
      onChange(filterGroups.filter((_, i) => i !== gi));
    } else {
      const next = filterGroups.map((g, gIdx) => {
        if (gIdx !== gi) return g;
        return { ...g, conditions: g.conditions.filter((_, i) => i !== ci) };
      });
      onChange(next);
    }
  };

  const addGroup = () => {
    onChange([
      ...filterGroups,
      { conditions: [{ field: 'type' as const, operator: 'is', value: '' }] },
    ]);
  };

  const removeGroup = (gi: number) => {
    onChange(filterGroups.filter((_, i) => i !== gi));
  };

  const handleFieldChange = (gi: number, ci: number, newField: FilterCondition['field']) => {
    updateCondition(gi, ci, {
      field: newField,
      operator: defaultOperator(newField),
      value: defaultValue(newField),
    });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Filters</span>
      </div>

      {filterGroups.map((group, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && (
            <div className="text-center my-2">
              <span className="text-xs font-semibold text-amber-400">OR</span>
            </div>
          )}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 mb-2 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Group {gi + 1}</span>
              <button
                type="button"
                onClick={() => removeGroup(gi)}
                className="text-red-400 hover:text-red-300 text-xs"
              >
                <X size={14} />
              </button>
            </div>

            {group.conditions.map((cond, ci) => (
              <React.Fragment key={ci}>
                {ci > 0 && (
                  <div className="text-center my-1">
                    <span className="text-xs text-indigo-400 font-medium">AND</span>
                  </div>
                )}
                <div className="flex items-start gap-2 mb-1">
                  {/* Field */}
                  <select
                    value={cond.field}
                    onChange={e => handleFieldChange(gi, ci, e.target.value as FilterCondition['field'])}
                    className="min-w-[100px] px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {FIELD_OPTIONS.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>

                  {/* Operator */}
                  <select
                    value={cond.operator}
                    onChange={e => updateCondition(gi, ci, { operator: e.target.value })}
                    className="min-w-[70px] px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {OPERATORS_BY_FIELD[cond.field].map(op => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>

                  {/* Value */}
                  <ConditionValueInput
                    condition={cond}
                    categories={categories}
                    allLabels={allLabels}
                    onChange={val => updateCondition(gi, ci, { value: val })}
                  />

                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => removeCondition(gi, ci)}
                    className="text-red-400 hover:text-red-300 p-1.5 flex-shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              </React.Fragment>
            ))}

            <button
              type="button"
              onClick={() => addCondition(gi)}
              className="mt-2 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              <Plus size={12} /> Add condition
            </button>
          </div>
        </React.Fragment>
      ))}

      <div className="text-center mt-3">
        <button
          type="button"
          onClick={addGroup}
          className="text-xs text-amber-400 hover:text-amber-300 border border-dashed border-amber-400/50 hover:border-amber-400 px-3 py-1.5 rounded-md transition-colors"
        >
          <Plus size={12} className="inline mr-1" />
          Add OR group
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify file was created**

Run: `ls -la src/components/dashboards/FilterBuilder.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboards/FilterBuilder.tsx
git commit -m "feat: create FilterBuilder component with AND/OR group UI"
```

---

### Task 8: Create PanelEditor Component

**Files:**
- Create: `src/components/dashboards/PanelEditor.tsx`

This is the full-page panel editor. It reuses the existing `DashboardPanel` chart rendering approach and the `TransactionPreview` component.

- [ ] **Step 1: Create the PanelEditor component**

```typescript
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { DashboardPanel, Dashboard, Expense, FilterGroup, PanelMonthData } from '../../types';
import { LocalStorage } from '../../utils/storage';
import { TransactionPreview } from './TransactionPreview';
import { FilterBuilder } from './FilterBuilder';
import { formatCurrency, generateId } from '../../utils';
import { useTheme } from '../../contexts/ThemeContext';

interface PanelEditorProps {
  dashboard: Dashboard;
  panel: DashboardPanel | null; // null = create mode
  categories: string[];
  allLabels: string[];
  selectedUserId: string | null;
  dateRange: { start: Date; end: Date };
  onSave: (panel: DashboardPanel) => void;
  onCancel: () => void;
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

export const PanelEditor: React.FC<PanelEditorProps> = ({
  dashboard, panel, categories, allLabels, selectedUserId, dateRange, onSave, onCancel,
}) => {
  const { theme } = useTheme();
  const isEdit = !!panel;

  const [title, setTitle] = useState(panel?.title || '');
  const [chartType, setChartType] = useState<'bar' | 'line'>(panel?.chartType || 'bar');
  const [seriesMode, setSeriesMode] = useState<'two_series' | 'net_amount'>(panel?.seriesMode || 'two_series');
  const [netOrientation, setNetOrientation] = useState<'income_positive' | 'expense_positive'>(panel?.netOrientation || 'income_positive');
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>(panel?.filterGroups || []);

  const [chartData, setChartData] = useState<PanelMonthData[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [previewTransactions, setPreviewTransactions] = useState<Expense[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gridStroke = theme === 'dark' ? '#374151' : '#e5e7eb';
  const axisStroke = theme === 'dark' ? '#9ca3af' : '#6b7280';

  // Validate regex conditions
  const regexErrors = filterGroups.flatMap((g, gi) =>
    g.conditions
      .map((c, ci) => {
        if (c.field !== 'description' || !c.value) return null;
        try { new RegExp(c.value as string); return null; }
        catch (e: any) { return { gi, ci, message: e.message }; }
      })
      .filter(Boolean)
  );
  const hasRegexError = regexErrors.length > 0;
  const canSave = title.trim() !== '' && !hasRegexError && !saving;

  // Debounced data fetch
  const fetchPreviewData = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const dateFrom = dateRange.start.toISOString().slice(0, 10);
      const dateTo = dateRange.end.toISOString().slice(0, 10);

      // Fetch transaction preview
      setPreviewLoading(true);
      const previewResult = await LocalStorage.previewPanelTransactions({
        filterGroups,
        userId: selectedUserId,
        dateFrom,
        dateTo,
        limit: 10,
      });
      setPreviewTransactions(previewResult.transactions);
      setPreviewTotal(previewResult.total);
      setPreviewLoading(false);

      // Fetch chart data via server-side aggregation endpoint
      setChartLoading(true);
      try {
        const chartResult = await LocalStorage.chartPreview({
          filterGroups,
          userId: selectedUserId,
          dateFrom,
          dateTo,
        });

        // Aggregate rows into PanelMonthData by month
        const monthMap: Record<string, PanelMonthData> = {};
        for (const row of chartResult.rows) {
          const key = row.sortMonth;
          if (!monthMap[key]) monthMap[key] = { month: row.month };
          if (seriesMode === 'net_amount') {
            const sign = row.type === 'income' ? 1 : -1;
            monthMap[key].net = (monthMap[key].net || 0) + sign * row.total;
          } else {
            if (row.type === 'income') monthMap[key].income = row.total;
            else monthMap[key].expenses = row.total;
          }
        }

        const sorted = Object.entries(monthMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, v]) => v);
        setChartData(sorted);
      } catch {
        setChartData([]);
      }
      setChartLoading(false);
    }, 400);
  }, [filterGroups, dateRange, selectedUserId, seriesMode]);

  useEffect(() => { fetchPreviewData(); }, [fetchPreviewData]);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      // Strip empty groups before saving
      const cleanedGroups = filterGroups
        .map(g => ({ ...g, conditions: g.conditions.filter(c => {
          if (c.field === 'type') return !!c.value;
          if (c.field === 'category' || c.field === 'labels') return Array.isArray(c.value) && c.value.length > 0;
          if (c.field === 'amount') return c.value !== '' && c.value != null;
          if (c.field === 'description') return !!c.value;
          return false;
        })}))
        .filter(g => g.conditions.length > 0);

      const payload = {
        id: panel?.id || generateId(),
        title: title.trim(),
        chartType,
        seriesMode,
        netOrientation: seriesMode === 'net_amount' ? netOrientation : null,
        filterGroups: cleanedGroups,
        panelOrder: panel?.panelOrder ?? 0,
      };

      let saved: DashboardPanel;
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

  const yFormatter = (v: number) => `$${Math.abs(v).toFixed(0)}`;

  const renderChart = () => {
    if (chartLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    if (!chartData.length) {
      return (
        <div className="flex items-center justify-center h-full text-sm text-gray-500 dark:text-gray-400">
          No data for selected filters
        </div>
      );
    }

    const isNet = seriesMode === 'net_amount';

    if (chartType === 'line') {
      return (
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey="month" stroke={axisStroke} fontSize={11} />
          <YAxis stroke={axisStroke} fontSize={11} tickFormatter={yFormatter} />
          <Tooltip content={<CustomTooltip />} />
          {isNet ? (
            <Line type="monotone" dataKey="net" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Net" />
          ) : (
            <>
              <Line type="monotone" dataKey="income" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Income" />
              <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Expenses" />
            </>
          )}
        </LineChart>
      );
    }

    return (
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
        <XAxis dataKey="month" stroke={axisStroke} fontSize={11} />
        <YAxis stroke={axisStroke} fontSize={11} tickFormatter={yFormatter} reversed={netOrientation === 'expense_positive'} />
        <Tooltip content={<CustomTooltip />} />
        {isNet ? (
          <Bar dataKey="net" radius={[4, 4, 0, 0]} name="Net">
            {chartData.map((entry, i) => (
              <Cell key={i} fill={(entry.net ?? 0) >= 0 ? '#22c55e' : '#ef4444'} />
            ))}
          </Bar>
        ) : (
          <>
            <Bar dataKey="income" fill="#22c55e" radius={[4, 4, 0, 0]} name="Income" />
            <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Expenses" />
          </>
        )}
      </BarChart>
    );
  };

  return (
    <div className="fixed inset-0 z-40 bg-white dark:bg-gray-900 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex items-center gap-1 text-sm">
            <ArrowLeft size={16} /> Back
          </button>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Untitled Panel"
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-transparent text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-4 py-1.5 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Panel'}
          </button>
        </div>
      </div>

      {/* Chart settings toolbar */}
      <div className="flex items-center gap-4 px-5 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Chart</span>
          <div className="flex border border-gray-300 dark:border-gray-600 rounded overflow-hidden">
            {(['bar', 'line'] as const).map(t => (
              <button
                key={t}
                onClick={() => setChartType(t)}
                className={`px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  chartType === t ? 'bg-blue-500 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Series</span>
          <div className="flex border border-gray-300 dark:border-gray-600 rounded overflow-hidden">
            {([
              { value: 'two_series', label: 'Two Series' },
              { value: 'net_amount', label: 'Net Amount' },
            ] as const).map(s => (
              <button
                key={s.value}
                onClick={() => setSeriesMode(s.value)}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  seriesMode === s.value ? 'bg-blue-500 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {seriesMode === 'net_amount' && (
          <>
            <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Orientation</span>
              <div className="flex border border-gray-300 dark:border-gray-600 rounded overflow-hidden">
                {([
                  { value: 'income_positive', label: 'Income \u2191' },
                  { value: 'expense_positive', label: 'Expense \u2191' },
                ] as const).map(o => (
                  <button
                    key={o.value}
                    onClick={() => setNetOrientation(o.value)}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      netOrientation === o.value ? 'bg-blue-500 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Chart area */}
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0" style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          {renderChart() as React.ReactElement}
        </ResponsiveContainer>
      </div>

      {/* Bottom section: Filters + Preview */}
      <div className="flex flex-1 min-h-0 border-t border-gray-200 dark:border-gray-700">
        {/* Filter builder (left) */}
        <div className="w-3/5 overflow-y-auto p-5 border-r border-gray-200 dark:border-gray-700">
          <FilterBuilder
            filterGroups={filterGroups}
            onChange={setFilterGroups}
            categories={categories}
            allLabels={allLabels}
          />
        </div>

        {/* Transaction preview (right) */}
        <div className="w-2/5 overflow-y-auto p-5">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Matching Transactions</div>
          <TransactionPreview
            transactions={previewTransactions}
            total={previewTotal}
            loading={previewLoading}
          />
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify file was created**

Run: `ls -la src/components/dashboards/PanelEditor.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboards/PanelEditor.tsx
git commit -m "feat: create full-page PanelEditor component"
```

---

### Task 9: Update DashboardView to Use PanelEditor

**Files:**
- Modify: `src/components/dashboards/DashboardView.tsx`

- [ ] **Step 1: Replace PanelEditorSidebar import with PanelEditor**

Change line 15:
```typescript
import { PanelEditor } from './PanelEditor';
```

- [ ] **Step 2: Update editor rendering**

Replace lines 181-193 (the `PanelEditorSidebar` block) with:

```typescript
      {/* Full-page panel editor */}
      {editorOpen && (
        <PanelEditor
          dashboard={dashboard}
          panel={editingPanel}
          categories={categories}
          allLabels={allLabels}
          selectedUserId={selectedUserId}
          dateRange={dateRange}
          onSave={handlePanelSaved}
          onCancel={() => { setEditorOpen(false); setEditingPanel(null); }}
        />
      )}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboards/DashboardView.tsx
git commit -m "feat: replace PanelEditorSidebar with full-page PanelEditor in DashboardView"
```

---

### Task 10: Update PanelTransactionsModal for filterGroups

**Files:**
- Modify: `src/components/dashboards/PanelTransactionsModal.tsx:26-43`

- [ ] **Step 1: Update fetchPage to use filterGroups**

Replace the `fetchPage` callback (lines 26-43) with:

```typescript
  const fetchPage = useCallback(async (pageNum: number) => {
    setLoading(true);
    const result = await LocalStorage.previewPanelTransactions({
      filterGroups: panel.filterGroups,
      userId: selectedUserId,
      dateFrom: dateRange.start.toISOString().slice(0, 10),
      dateTo: dateRange.end.toISOString().slice(0, 10),
      limit: ITEMS_PER_PAGE,
      offset: (pageNum - 1) * ITEMS_PER_PAGE,
    });
    setTransactions(result.transactions);
    setTotal(result.total);
    setLoading(false);
  }, [panel, dateRange, selectedUserId]);
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboards/PanelTransactionsModal.tsx
git commit -m "feat: update PanelTransactionsModal to use filterGroups"
```

---

### Task 11: Update DashboardPanel Chart (Remove filterType references)

**Files:**
- Modify: `src/components/dashboards/DashboardPanel.tsx:70-76, 102-108`

- [ ] **Step 1: Update line chart series rendering**

Replace lines 69-76 (the two-series line rendering that checks `panel.filterType`) with:

```typescript
            <>
              <Line type="monotone" dataKey="income" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Income" />
              <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Expenses" />
            </>
```

- [ ] **Step 2: Update bar chart series rendering**

Replace lines 101-108 (the two-series bar rendering that checks `panel.filterType`) with:

```typescript
          <>
            <Bar dataKey="income" fill="#22c55e" radius={[4, 4, 0, 0]} name="Income" />
            <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Expenses" />
          </>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboards/DashboardPanel.tsx
git commit -m "fix: remove filterType references from DashboardPanel chart rendering"
```

---

### Task 12: Delete PanelEditorSidebar and Verify Build

**Files:**
- Delete: `src/components/dashboards/PanelEditorSidebar.tsx`

- [ ] **Step 1: Delete the old sidebar component**

```bash
rm src/components/dashboards/PanelEditorSidebar.tsx
```

- [ ] **Step 2: Remove any remaining imports of PanelEditorSidebar**

Search for any remaining references:
```bash
grep -r "PanelEditorSidebar" src/
```
Expected: No results (already replaced in Task 9)

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove PanelEditorSidebar (replaced by PanelEditor)"
```

---

### Task 13: Manual Integration Test

- [ ] **Step 1: Start the application**

Run: `npm run dev`

- [ ] **Step 2: Test creating a new panel**

1. Navigate to Personal Dashboards
2. Click "Add Panel"
3. Verify full-page editor opens with chart area, toolbar, filter builder, and transaction preview
4. Enter a title, add filter conditions, verify chart and preview update live
5. Add an OR group with different conditions
6. Save the panel
7. Verify the panel appears on the dashboard with correct data

- [ ] **Step 3: Test editing an existing panel**

1. Hover over a panel, click edit
2. Verify existing filterGroups are loaded correctly
3. Modify filters, verify live preview updates
4. Save and verify changes persist

- [ ] **Step 4: Test the transactions modal**

1. Hover over a panel, click the list icon
2. Verify transactions modal shows filtered results using the new filterGroups

- [ ] **Step 5: Test edge cases**

1. Create a panel with no filters (should show all transactions)
2. Create a panel with an invalid regex (should show error, disable save)
3. Create a panel with amount filters (gte/lte)
4. Cancel editing (should discard changes)
5. Delete a panel (should still work)

- [ ] **Step 6: Commit any fixes found during testing**

```bash
git add -A
git commit -m "fix: address issues found during integration testing"
```
