# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Full-stack expense tracking application with a React/TypeScript frontend and Python/FastAPI backend. Express.js legacy backend remains only for Teller bank integration (Phase 6 migration). Multi-user support, CSV import, smart transfer detection, reports, and dark mode.

## Repository Structure

```
finance-manager/
├── frontend/          # React/TypeScript frontend (CRA)
│   ├── src/           # Source code
│   ├── public/        # Static assets
│   └── package.json   # Frontend dependencies
├── legacy/            # Express.js backend (Teller integration only)
│   ├── server.js      # Express entry point (Teller routes only)
│   ├── database.js    # pg connection pool
│   ├── routes/teller.js # Teller bank integration routes
│   ├── helpers/       # categoryMatcher + transferDetection (used by Teller)
│   └── package.json   # Backend dependencies
├── backend/           # FastAPI backend (all non-Teller routes)
│   ├── app/           # Application code
│   │   ├── main.py    # FastAPI app, middleware, router mounting
│   │   ├── config.py  # Settings via pydantic-settings
│   │   ├── database.py # Async SQLAlchemy engine + session
│   │   ├── models/    # SQLAlchemy ORM models
│   │   ├── schemas/   # Pydantic request/response schemas
│   │   ├── routes/    # FastAPI route handlers
│   │   └── utils/     # Shared utilities
│   ├── alembic/       # Alembic migration scripts
│   ├── alembic.ini    # Alembic configuration
│   ├── tests/         # pytest + httpx async tests
│   └── pyproject.toml # Python project config (uv)
├── nginx.conf         # Reverse proxy config
├── package.json       # Root orchestrator scripts
├── docker-compose.yml # PostgreSQL + nginx services
└── start.sh           # Full setup script
```

## Development Commands

```bash
# Full setup (idempotent - installs deps, starts Docker, migrates, launches all servers)
./start.sh

# Install all dependencies (root + frontend + legacy + backend)
npm run install:all

# Manual development
npm run docker:up      # Start PostgreSQL + nginx containers
npm run migrate        # Run database migrations (Alembic)
npm run dev            # Start frontend (3000) + Express (3001) + FastAPI (8000) concurrently

# Individual servers
npm run frontend       # Frontend only (port 3000, via cd frontend && npm start)
npm run server         # Express backend only (port 3001, Teller routes only)
npm run fastapi        # FastAPI backend only (port 8000, via uvicorn)

# Build & test
npm run build          # Production build (cd frontend && npm run build)
npm test               # Frontend tests (cd frontend && npm test)
npm run test:backend   # Python backend tests (cd backend && uv run pytest)

# Database
npm run docker:up      # Start PostgreSQL 15 + nginx containers
npm run docker:down    # Stop all Docker containers
```

## Architecture

**Frontend** (`frontend/src/`): React 18 + TypeScript, built with Create React App (react-scripts). Styled with Tailwind CSS. Charts via Recharts, icons via Lucide React. Routing via react-router-dom v7.

**Legacy Backend** (`legacy/`): Express.js server serving only Teller bank integration routes at `/api/teller/*`. Uses `pg` connection pool from `legacy/database.js`. Will be removed when Teller migrates to FastAPI (Phase 6).

**FastAPI Backend** (`backend/app/`): Python 3.12+ with FastAPI, async SQLAlchemy ORM, Pydantic v2 schemas. Managed by uv. Serves all non-Teller API routes.

**nginx** (`nginx.conf`): Reverse proxy on port 3002. Routes `/api/teller/` to Express (port 3001), everything else to FastAPI (port 8000). Frontend points at nginx via `REACT_APP_API_BASE_URL`.

**Database**: PostgreSQL 15 via Docker Compose. Migrations managed by Alembic (`backend/alembic/`). Both Express and FastAPI share the same database.

### Traffic flow

```
Browser → Frontend (3000) → nginx (3002) → FastAPI (8000) or Express (3001) → PostgreSQL (5432)
```

### Key data flow

1. Frontend `LocalStorage` class (`frontend/src/utils/storage.ts`) wraps all API calls via configurable `REACT_APP_API_BASE_URL` (default: `http://localhost:3002/api`)
2. Falls back to browser localStorage if backend is unavailable
3. nginx routes all API traffic to FastAPI, except `/api/teller/` which goes to Express
4. FastAPI uses SQLAlchemy ORM; Express (Teller only) uses raw pg queries against the same database
5. JSONB columns store flexible data: labels, metadata, transfer_info, source mappings, report filters

## Conventions

- Frontend components are PascalCase `.tsx` files; utilities are camelCase `.ts`
- Constants use UPPER_SNAKE_CASE
- State lives in App.tsx and is passed via props to route components; ThemeContext is the only React Context
- Pagination version-bumping pattern: increment a version number to trigger re-fetch
- Debounced search (400ms) on text input to reduce API calls
- `cancelled` flag pattern in useEffect for cleanup on unmount
- Toast notifications (react-toastify) for user feedback
- Dark mode via Tailwind `dark:` prefix with system preference detection
- Commit messages follow Conventional Commits: `feat:`, `fix:`, `chore:`, etc.
- Python backend uses async/await throughout, Pydantic v2 schemas with camelCase field aliases to match Express JSON responses
- FastAPI routes mirror Express response shapes exactly for frontend compatibility
