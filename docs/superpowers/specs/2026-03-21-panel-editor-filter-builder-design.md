# Panel Editor & Advanced Filter Builder — Design Spec

## Overview

Refactor the personal dashboard panel editor from a slide-in sidebar to a full-page Grafana-like editor. Replace flat filter fields with a structured filter group system supporting AND/OR composition, enabling complex queries like `(description=uber|lyft AND category=Travel) OR (labels in ('uber', 'lyft'))`.

## Data Model

### Filter Types

```typescript
interface FilterCondition {
  field: 'type' | 'category' | 'labels' | 'description' | 'amount';
  operator: string;
  value: string | string[] | number;
}

interface FilterGroup {
  conditions: FilterCondition[];
}

// Top-level: groups joined by OR
type FilterGroups = FilterGroup[];
```

### Operators Per Field

| Field | Operators | Value Type |
|-------|-----------|------------|
| `type` | `is` | `'expense'` or `'income'` |
| `category` | `is`, `is_not` | `string[]` (multi-select) |
| `labels` | `includes`, `excludes` | `string[]` (multi-select) |
| `description` | `matches` | `string` (POSIX regex) |
| `amount` | `gte`, `lte` | `number` |

### Database Changes

Replace flat filter columns on `dashboard_panels` with a single JSONB column:

- **Add:** `filter_groups JSONB DEFAULT '[]'`
- **Drop (in a follow-up migration):** `filter_type`, `filter_categories`, `filter_labels`, `filter_regex`

Migration populates `filter_groups` from existing flat fields before dropping them. Each existing panel maps to a single filter group with conditions derived from its non-empty flat fields.

### Updated DashboardPanel Interface

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

Empty `filterGroups` (`[]`) means "match all transactions."

## Full-Page Panel Editor Layout

The editor is a full-page takeover (not a route change — refreshing returns to the dashboard grid), activated from DashboardView when creating or editing a panel. A back/cancel button returns to the dashboard grid.

### Layout Structure (top to bottom)

1. **Top bar:** Back button, editable panel title input, Cancel and Save buttons.
2. **Chart settings toolbar:** Compact toggle buttons for chart type (Bar/Line), series mode (Two Series/Net Amount), and net orientation (Income positive/Expense positive). Orientation toggles only visible when series mode is Net Amount.
3. **Chart area:** Full-width Recharts chart preview. Updates live (debounced) as filters change.
4. **Bottom split section:**
   - **Left (~60%):** Filter builder.
   - **Right (~40%):** Paginated transaction preview table (Date, Description, Amount) with result count.

## Filter Builder UI

Inline row builder style. Each condition is a row: `[Field dropdown] [Operator dropdown] [Value input] [Remove button]`.

### Group Structure

- Conditions within a group are joined by **AND** (shown as a label between rows).
- Groups are joined by **OR** (shown as a prominent label between group boxes).
- Each group is a visually distinct box with a group label and a remove button.
- "+ Add condition" link at the bottom of each group.
- "+ Add OR group" button (dashed border) below all groups.

### Value Inputs Per Field

- **Type:** Single-select dropdown (`expense` / `income`).
- **Category:** Multi-select dropdown populated from available categories.
- **Labels:** Multi-select dropdown populated from `allLabels`.
- **Description:** Text input for POSIX regex pattern.
- **Amount:** Numeric text input. Operator dropdown shows `>=` and `<=`.

### Operator Dropdown

Updates dynamically based on the selected field. Only shows operators valid for that field.

## Backend Changes

### New Query Builder: `buildPanelFilterGroupsQuery()`

Replaces the panel-specific filter logic in `buildPanelDataQuery()`. Takes `filter_groups` JSONB and constructs a WHERE clause that composes on top of `buildStatsWhereClause()` (which provides date range, user filtering, transfer exclusion, and calculation exclusion logic):

```sql
WHERE (base_stats_conditions from buildStatsWhereClause)
AND (
  (group1_cond1 AND group1_cond2 AND ...)
  OR
  (group2_cond1 AND group2_cond2 AND ...)
  OR ...
)
```

SQL mapping per condition:

| Condition | SQL |
|-----------|-----|
| `type` / `is` | `type = $N` |
| `category` / `is` | `category = ANY($N::text[])` |
| `category` / `is_not` | `category != ALL($N::text[])` |
| `labels` / `includes` | `EXISTS (SELECT 1 FROM jsonb_array_elements_text(labels) WHERE value = ANY($N::text[]))` |
| `labels` / `excludes` | `NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(labels) WHERE value = ANY($N::text[]))` |
| `description` / `matches` | `description ~* $N` |
| `amount` / `gte` | `amount >= $N` |
| `amount` / `lte` | `amount <= $N` |

Empty `filter_groups` produces no additional WHERE conditions.

### Endpoint Changes

- **Preview:** Change `GET /api/dashboard-panels/preview` to `POST /api/dashboard-panels/preview`. Accept `filterGroups` in the request body instead of individual query params. Also accepts `userId`, `dateFrom`, `dateTo`, `limit`, `offset`. The preview endpoint should use `buildStatsWhereClause()` as its base (same as the data endpoint) so that the preview results match what appears in the chart — currently it uses `buildExpensesWhereClause()` which does not apply transfer/exclusion logic.
- **Data:** `POST /api/dashboards/:id/data` preserves its external API contract (same request/response shape). Internally, it reads `filter_groups` from each panel row and uses `buildPanelFilterGroupsQuery()` instead of the old flat-field logic. The `rowToPanel()` helper must be updated to map `row.filter_groups` to `filterGroups` (replacing the old flat field mappings).
- **Panel CRUD:** Create and update endpoints accept `filterGroups` (JSONB) instead of flat filter fields. The `rowToPanel()` function is updated to return `filterGroups` instead of `filterType`, `filterCategories`, `filterLabels`, `filterRegex`.

## Frontend Component Changes

### New Components

**`PanelEditor.tsx`** — Full-page panel editor container.
- Manages editor state: title, chartType, seriesMode, netOrientation, filterGroups.
- Renders top bar, chart settings toolbar, chart preview, filter builder, and transaction preview.
- Debounced (400ms) preview fetch on any filter or setting change — updates both chart and transaction list.
- Save calls `createPanel` or `updatePanel` then returns to dashboard grid.
- Cancel discards changes and returns to grid.

**`FilterBuilder.tsx`** — Filter groups UI component.
- Renders filter groups with inline row conditions.
- Manages add/remove groups, add/remove conditions.
- Field dropdown adapts operator dropdown; operator dropdown adapts value input widget.
- Emits `onChange(filterGroups: FilterGroup[])` to parent on every change.

### Modified Components

**`DashboardView.tsx`** — Adds `editingPanel` state (`string | 'new' | null`). When set, renders `PanelEditor` instead of the dashboard grid. Passes save/cancel callbacks.

**`PanelTransactionsModal.tsx`** — Updated to accept `filterGroups` instead of flat filter fields. Preview API call updated to POST with filterGroups body.

**`src/types.ts`** — Add `FilterCondition`, `FilterGroup` interfaces. Update `DashboardPanel` to use `filterGroups`.

**`src/utils/storage.ts`** — `previewPanelTransactions` updated to POST with `filterGroups`. Panel CRUD methods updated for new field shape.

### Unchanged Components

**`TransactionPreview.tsx`** — Pure display component. Receives `transactions`, `total`, and `loading` as props. No changes needed; the parent (`PanelEditor`) handles the API call.

### Removed Components

**`PanelEditorSidebar.tsx`** — Fully replaced by PanelEditor + FilterBuilder.

## Interaction & Edge Cases

### Live Preview

- Chart and transaction preview update on 400ms debounce after any change.
- Subtle loading indicator (opacity fade or spinner) during fetch — not a full skeleton.
- Empty filter groups show all transactions.

### Validation

- Description regex validated client-side via `new RegExp()` — invalid regex shows inline error on the condition row.
- Amount fields accept only numbers.
- Save disabled if: title is empty, or any regex condition has an invalid pattern.
- Empty groups (zero conditions) are stripped before saving.

### Default State (New Panel)

- Title: empty (placeholder "Untitled Panel").
- Chart type: bar. Series mode: two_series.
- One empty filter group with one empty condition row.
- Empty filters match everything, so chart and preview populate immediately.

### Deleting Conditions/Groups

- Removing the last condition in a group removes the group.
- Removing the last group leaves empty filters (matches all).
- No confirmation prompt (cancel discards all changes).

### Cancel Behavior

- Discards all changes, returns to dashboard grid.
- No "unsaved changes" prompt.

## Database Migration

Migrations are JS functions in `migrate.js`, following the existing pattern. Two-phase approach:

### Phase 1: Add `filter_groups` and populate (deployed with new code)

Added as a new migration function in `migrate.js`:

1. `ALTER TABLE dashboard_panels ADD COLUMN IF NOT EXISTS filter_groups JSONB DEFAULT '[]'`
2. For each existing panel row, build a `FilterGroup[]` from flat fields:
   - If `filter_type` is `'expense'` or `'income'` (not `'both'`), add a condition: `{field: 'type', operator: 'is', value: filter_type}`
   - If `filter_categories` is non-empty, add: `{field: 'category', operator: 'is', value: filter_categories}`
   - If `filter_labels` is non-empty, add: `{field: 'labels', operator: 'includes', value: filter_labels}`
   - If `filter_regex` is non-null and non-empty, add: `{field: 'description', operator: 'matches', value: filter_regex}`
   - All conditions go into a single group (AND). If no conditions, set `filter_groups` to `[]`.
3. `UPDATE dashboard_panels SET filter_groups = $computed_value WHERE id = $panel_id` for each panel.

### Phase 2: Drop old columns (deployed after Phase 1 is confirmed working)

A second migration function:

```sql
ALTER TABLE dashboard_panels DROP COLUMN IF EXISTS filter_type;
ALTER TABLE dashboard_panels DROP COLUMN IF EXISTS filter_categories;
ALTER TABLE dashboard_panels DROP COLUMN IF EXISTS filter_labels;
ALTER TABLE dashboard_panels DROP COLUMN IF EXISTS filter_regex;
```

This two-phase approach allows rollback to old code if issues arise after Phase 1.
