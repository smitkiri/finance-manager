# Personal Dashboards — Design Spec

**Date:** 2026-03-21
**Status:** Approved

---

## Overview

Personal Dashboards lets users build their own dashboards composed of chart panels. Each panel visualizes aggregated transaction data (monthly amounts) with user-defined filters. Dashboards are accessible via a new "Personal Dashboards" entry in the sidebar.

---

## Requirements Summary

- Users can create multiple named dashboards
- Each dashboard has a date range and up to 15 panels
- Panels support bar or line chart types
- Panel filters: transaction type (income/expense/both), categories (multi-select), description regex (POSIX)
- Y-axis is always amount; X-axis is always months
- Series mode per panel: two series (income + expense) or net amount (with orientation setting)
- Panels arranged in a fixed 2-column grid, draggable to reorder
- Dashboard-level date range; inherits the global user filter
- Panel editor is a slide-in right sidebar with a live transaction preview
- One dashboard can be marked as default (opens on navigation)
- Empty state shown when no dashboards exist

---

## Data Model

### Table: `dashboards`

```sql
CREATE TABLE dashboards (
  id           VARCHAR(255) PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  date_range_start DATE NOT NULL,
  date_range_end   DATE NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Only one row may have `is_default = TRUE`. Enforced in application logic: setting a dashboard as default first clears all others.

### Table: `dashboard_panels`

```sql
CREATE TABLE dashboard_panels (
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
);

CREATE INDEX idx_dashboard_panels_dashboard ON dashboard_panels(dashboard_id);
```

`net_orientation` is only relevant when `series_mode = 'net_amount'`.
`filter_categories = []` means no category filter (all categories included).
`filter_regex = NULL` means no regex filter.
`panel_order` is a zero-based integer; the frontend sends a full ordered array of panel IDs on drag-and-drop and the server updates all affected rows.

---

## API Design

New route file: `routes/dashboards.js`, mounted under `/api` in `server.js`.

### Dashboard CRUD

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/dashboards` | List all dashboards (id, name, is_default, date range, panel count) |
| `POST` | `/api/dashboards` | Create a new dashboard |
| `PATCH` | `/api/dashboards/:id` | Update name, date range, or set as default |
| `DELETE` | `/api/dashboards/:id` | Delete dashboard and all panels (CASCADE) |

### Panel CRUD

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/dashboards/:id/panels` | Create a panel on a dashboard |
| `PATCH` | `/api/dashboard-panels/:panelId` | Update panel config |
| `DELETE` | `/api/dashboard-panels/:panelId` | Delete a panel |
| `PATCH` | `/api/dashboards/:id/panel-order` | Reorder panels; body: `{ panelIds: string[] }` |

### Data Endpoint

**`POST /api/dashboards/:id/data`**

Request body:
```json
{
  "userId": "string | null",
  "dateRangeStart": "YYYY-MM-DD",
  "dateRangeEnd": "YYYY-MM-DD"
}
```

Response:
```json
{
  "panels": [
    {
      "panelId": "string",
      "data": [
        { "month": "2025-01", "income": 3200.00, "expenses": 1800.00 },
        { "month": "2025-02", "income": 3100.00, "expenses": 2200.00 }
      ]
    }
  ]
}
```

For `series_mode = 'net_amount'`, `data` entries contain `{ month, net }` instead.
For `filter_type = 'expense'` or `'income'`, only that type's series is returned.

**Implementation:** Fetch all panels for the dashboard, then run one aggregate SQL query per panel concurrently via `Promise.all` against the pg pool:

```sql
SELECT
  TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM') AS month,
  type,
  SUM(amount) AS total
FROM transactions
WHERE
  date BETWEEN $1 AND $2
  AND excluded_from_calculations = FALSE
  AND (transfer_info IS NULL OR (transfer_info->>'excludedFromCalculations')::boolean = FALSE)
  [AND user_id = $n]
  [AND category = ANY($n)]
  [AND description ~* $n]
  [AND type = $n]
GROUP BY month, type
ORDER BY month ASC
```

Regex is applied using PostgreSQL's `~*` (case-insensitive POSIX match). If `filter_regex` is present it is passed as a parameter; if absent, the condition is omitted.

### Transaction Preview

**`GET /api/dashboard-panels/preview`**

Query params: `type`, `categories` (comma-separated), `regex`, `userId`, `dateFrom`, `dateTo`, `limit` (default 10).

Returns: `{ transactions: Expense[], total: number }`

Reuses `buildExpensesWhereClause` from `helpers/queryBuilders.js` and appends an optional `description ~* $n` condition. Used by the panel editor for live filter validation. Max 10 rows returned; total is a separate `COUNT(*)` subquery.

---

## Frontend

### New Route

`/personal-dashboards` added to `App.tsx` (Routes) and `Sidebar.tsx` (nav items).

### New Types (`src/types.ts`)

```typescript
export interface Dashboard {
  id: string;
  name: string;
  isDefault: boolean;
  dateRangeStart: string; // YYYY-MM-DD
  dateRangeEnd: string;
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
  month: string;         // "YYYY-MM"
  income?: number;
  expenses?: number;
  net?: number;
}

export interface PanelData {
  panelId: string;
  data: PanelMonthData[];
}
```

### New Storage Methods (`src/utils/storage.ts`)

One static method per API call, following existing patterns:
- `loadDashboards()`, `createDashboard()`, `updateDashboard()`, `deleteDashboard()`
- `createPanel()`, `updatePanel()`, `deletePanel()`, `reorderPanels()`
- `loadDashboardData()` (the batched data endpoint)
- `previewPanelTransactions()` (the preview endpoint)

### Component Tree

```
src/components/dashboards/
  PersonalDashboards.tsx     — page root; owns dashboard list + selected dashboard state
  DashboardView.tsx          — date range picker, 2-col panel grid, "Add Panel" button
  DashboardPanel.tsx         — single panel card with chart, edit/delete icons
  PanelEditorSidebar.tsx     — slide-in right panel for create/edit
  TransactionPreview.tsx     — compact preview table inside the editor
```

#### `PersonalDashboards.tsx`
- Fetches dashboard list on mount
- Renders empty state ("Create your first dashboard") when list is empty
- Renders dashboard selector header:
  - Dropdown (left) to switch dashboards
  - Inline rename (pencil icon)
  - Delete with confirmation (trash icon)
  - "New Dashboard" button
  - Star icon to set/unset default
- Renders `DashboardView` for the selected dashboard
- On first load, opens the dashboard marked `is_default`; if none, opens the first in the list

#### `DashboardView.tsx`
- Owns date range state (initialized from `dashboard.dateRangeStart/End`)
- Fetches `POST /api/dashboards/:id/data` on mount and on date range change; passes `selectedUserId` from props
- Manages dnd-kit drag context for panel reordering; calls `reorderPanels()` on drop, updates local order optimistically
- Renders panels in a `grid grid-cols-2 gap-4`
- Enforces 15-panel maximum: "Add Panel" button is disabled with a tooltip when limit is reached

#### `DashboardPanel.tsx`
- Receives `panel: DashboardPanel` and `data: PanelMonthData[]` as props
- Renders a Recharts `ResponsiveContainer` with `LineChart` or `BarChart`
  - `two_series`: two `Line`/`Bar` — income (green) and expenses (red)
  - `net_amount` with `income_positive`: single series, positive = income surplus
  - `net_amount` with `expense_positive`: single series, Y-axis inverted so high-expense months show tall bars going up
- Edit (pencil) and delete (trash) icons in top-right, visible on hover
- Shows a loading skeleton while data is being fetched

#### `PanelEditorSidebar.tsx`
- Slides in from the right (fixed position, `translate-x` transition, same pattern as the existing sidebar)
- Form fields: title (text input), chart type (toggle bar/line), filter type (segmented control: expense/income/both), categories (multi-select using existing category list), regex (text input with inline POSIX validation), series mode (radio: two series / net amount), net orientation (shown only when net amount selected)
- Regex validated client-side via `new RegExp(value)` in try/catch; shows inline error if invalid
- Debounced (400ms) preview fetch fires on any filter field change
- "Save" button calls create or update; closes sidebar on success

#### `TransactionPreview.tsx`
- Compact table: date, description, category, amount (colored by type)
- Shows "X transactions matched" above the table
- Shows a loading spinner during fetch
- Shows "No transactions match these filters" when total is 0

---

## Performance Considerations

- **Batched data fetch:** All panel data loads in one HTTP request; per-panel aggregate queries run concurrently on the server via `Promise.all`
- **Lightweight queries:** Each panel query is a `GROUP BY month` aggregate — no raw row fetching, no joins. Hits indexed columns (`date`, `type`, `user_id`, `category`)
- **Regex:** PostgreSQL `~*` on `description` cannot use a B-tree index. This is acceptable for typical transaction volumes. Regex is POSIX syntax; the UI labels it clearly and shows an example
- **Preview debounce:** 400ms debounce on filter changes in the panel editor, max 10 rows returned
- **Re-fetch scope:** Drag-and-drop reorder and panel saves do not trigger a full data re-fetch. Only dashboard switch or date range change triggers the batched endpoint
- **Excluded transactions:** The data query filters out `excluded_from_calculations = TRUE` and transfers excluded from calculations, matching the behavior of the existing stats endpoint

---

## Migration

New migration file (e.g. `migrations/010_personal_dashboards.sql`) creating both tables with indexes. Tracked in the `migrations` table via the existing `migrate.js` runner.

---

## Out of Scope (this iteration)

- Panel types other than bar/line (e.g. pie, table)
- Dashboard sharing between users
- Data sources other than transactions (e.g. net worth)
- Export/print of dashboards
- Per-panel date range override
