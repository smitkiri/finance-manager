# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Full-stack expense tracking application with a React/TypeScript frontend and Express.js/PostgreSQL backend. Multi-user support, CSV import, smart transfer detection, reports, and dark mode.

## Development Commands

```bash
# Full setup (idempotent - installs deps, starts Docker, migrates, launches dev servers)
./start.sh

# Manual development
npm run docker:up      # Start PostgreSQL container
npm run migrate        # Run database migrations
npm run dev            # Start frontend (port 3000) + backend (port 3001) concurrently

# Individual servers
npm start              # Frontend only (port 3000)
npm run server         # Backend only (port 3001)

# Build & production
npm run build          # Production build to build/
npm run serve-prod     # Serve production build on port 3001

# Tests
npm test               # Jest via react-scripts (interactive watch mode)

# Database
npm run docker:up      # Start PostgreSQL 15 container
npm run docker:down    # Stop PostgreSQL container
```

## Architecture

**Frontend** (`src/`): React 18 + TypeScript, built with Create React App (react-scripts). Styled with Tailwind CSS. Charts via Recharts, icons via Lucide React. Routing via react-router-dom v7.

**Backend** (`server.js` + `routes/` + `helpers/`): Express.js server serving RESTful API at `/api/*`. Uses `pg` connection pool from `database.js`. `server.js` is a slim entry point (~40 lines) that sets up middleware and mounts route modules.

**Database**: PostgreSQL 15 via Docker Compose. Schema in `schema.sql`, migrations tracked in `migrations` table and run via `migrate.js`.

### Key data flow

1. Frontend `LocalStorage` class (`src/utils/storage.ts`) wraps all API calls to `http://localhost:3001/api/*`
2. Falls back to browser localStorage if backend is unavailable
3. Backend builds dynamic SQL queries with parameterized WHERE clauses
4. JSONB columns store flexible data: labels, metadata, transfer_info, source mappings, report filters

### Routing

Uses react-router-dom v7 with `BrowserRouter`. All pages are route-based:
- `/` — Dashboard (catch-all `*` route)
- `/transactions` — Transactions list with filters sidebar
- `/reports` — Reports page
- `/settings` — Settings page (converted from modal, supports `asPage` prop)

Sidebar (`src/components/Sidebar.tsx`) uses `useNavigate`/`useLocation` for all navigation. Data-loading useEffects in App.tsx trigger based on `location.pathname`.

### Frontend organization

- `src/App.tsx` — Main state holder, routes, and top-level logic
- `src/components/` — Feature-grouped: `transactions/`, `modals/`, `reports/`, `charts/`, `ui/`
- `src/hooks/` — `useCategories`, `useFilters` for shared logic
- `src/services/csvService.ts` — CSV import/export parsing
- `src/utils/` — `storage.ts` (API wrapper), `reportUtils.ts`, `transferDetection.ts`
- `src/types.ts` — All TypeScript interfaces (`Expense`, `User`, `Category`, `Source`, `Report`)
- `src/constants/index.ts` — App-wide constants (ITEMS_PER_PAGE=30, colors, storage keys)

### Backend organization

- `server.js` — Entry point: middleware, DB init, route mounting
- `routes/` — Express Router modules, one per domain:
  - `expenses.js` — GET/POST/PATCH `/api/expenses`, GET `/api/stats`
  - `categories.js` — GET/POST `/api/categories`
  - `users.js` — GET/POST `/api/users`
  - `sources.js` — GET/POST/PUT/DELETE `/api/sources`
  - `reports.js` — GET/POST/DELETE `/api/reports`, report data endpoints
  - `import.js` — `/api/import-csv`, `/api/import-with-mapping`, `/api/export-csv`, `/api/column-mappings`
  - `dateRange.js` — GET/POST `/api/date-range`
  - `transfers.js` — `/api/detect-transfers`, `/api/transfer-override`, `/api/rerun-transfer-detection`
  - `backup.js` — GET `/api/backup`, POST `/api/restore`
  - `data.js` — DELETE `/api/delete-all`, POST `/api/delete-selected`, POST `/api/undo-import`
- `helpers/` — Pure function modules (no Express dependency):
  - `queryBuilders.js` — `buildExpensesWhereClause`, `buildStatsWhereClause`, `rowToExpense`
  - `csvParser.js` — `parseCSV`, `parseCSVLine`, `parseCSVWithMapping`, `mergeExpenses`
  - `transferDetection.js` — `detectTransfers`, `isTransferPair`, `calculateTransferConfidence`
  - `categoryMatcher.js` — `findSimilarTransactionCategory`, `calculateDescriptionSimilarity`
  - `fileUtils.js` — `getArtifactsDir`, `getFilePath`, `ensureArtifactsDir`

Each route file exports an Express Router. All routes are mounted under `/api` in `server.js`. Server-side pagination (limit/offset), filtering, and search. No authentication layer.

### Database tables

`transactions` (main records), `categories`, `users`, `sources` (CSV import mappings), `reports` (saved report configs), `metadata` (key-value store), `migrations`.

## Conventions

- Frontend components are PascalCase `.tsx` files; utilities are camelCase `.ts`
- Constants use UPPER_SNAKE_CASE
- State lives in App.tsx and is passed via props to route components; ThemeContext is the only React Context
- Pagination version-bumping pattern: increment a version number to trigger re-fetch
- Debounced search (400ms) on text input to reduce API calls
- `cancelled` flag pattern in useEffect for cleanup on unmount
- Toast notifications (react-toastify) for user feedback
- Dark mode via Tailwind `dark:` prefix with system preference detection
