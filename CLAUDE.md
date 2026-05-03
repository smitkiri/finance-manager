# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Full-stack expense tracking application with a React/TypeScript frontend and Python/FastAPI backend. Multi-user support, CSV import, Teller bank integration, smart transfer detection, reports, and dark mode.

## Repository Structure

```
finance-manager/
├── frontend/          # React/TypeScript frontend (CRA)
│   ├── src/           # Source code
│   ├── public/        # Static assets
│   └── package.json   # Frontend dependencies
├── backend/           # FastAPI backend (all API routes)
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

# Install all dependencies (root + frontend + backend)
npm run install:all

# Manual development
npm run docker:up      # Start PostgreSQL + nginx containers
npm run migrate        # Run database migrations (Alembic)
npm run dev            # Start frontend (3000) + FastAPI (8000) concurrently

# Individual servers
npm run frontend       # Frontend only (port 3000, via cd frontend && npm start)
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

**FastAPI Backend** (`backend/app/`): Python 3.12+ with FastAPI, async SQLAlchemy ORM, Pydantic v2 schemas. Managed by uv. Serves all API routes including Teller bank integration.

**nginx** (`nginx.conf`): Reverse proxy on port 3002. Routes all API traffic to FastAPI (port 8000). Frontend points at nginx via `REACT_APP_API_BASE_URL`.

**Database**: PostgreSQL 15 via Docker Compose. Migrations managed by Alembic (`backend/alembic/`).

### Traffic flow

```
Browser → Frontend (3000) → nginx (3002) → FastAPI (8000) → PostgreSQL (5432)
```

### Key data flow

1. Frontend `LocalStorage` class (`frontend/src/utils/storage.ts`) wraps all API calls via configurable `REACT_APP_API_BASE_URL` (default: `http://localhost:3002/api`)
2. Falls back to browser localStorage if backend is unavailable
3. nginx routes all API traffic to FastAPI
4. FastAPI uses SQLAlchemy ORM for all database access
5. JSONB columns store flexible data: labels, metadata, transfer_info, source mappings, report filters

### Production deployment (Coolify)

Local dev (`make up`, `docker-compose.yml`) and production (`docker-compose.prod.yml`, deployed to Coolify) are intentionally separate stacks with different shapes:

- **Dev:** frontend + backend run on the host with hot-reload; postgres + a host-proxy nginx run in Docker.
- **Prod:** all three services (nginx, backend, backend-migrate) run as containers; postgres is an external Coolify-managed resource.

Prod-specific files: `docker-compose.prod.yml`, `backend/Dockerfile`, `nginx/Dockerfile`, `nginx/prod.conf`, `.dockerignore`.

In prod, nginx is the only exposed service. It serves the built React app as static files and proxies `/api/*` to `http://backend:8000`. Same-origin, so `REACT_APP_API_BASE_URL=/api`. Teller cert/key files live on a Coolify-managed `teller_secrets` volume mounted read-only at `/secrets/teller/`. See `README.md` § "Deploying to Coolify" for env vars and first-deploy steps.

When making changes that affect prod, remember:

- The backend `Dockerfile` is shared between `backend` and `backend-migrate` services (same image, different commands).
- `REACT_APP_*` vars are **build args** for the nginx Dockerfile, not runtime env vars (CRA bakes them into the JS bundle at build time).
- Compose service DNS: nginx talks to backend at `backend:8000` (not `localhost:8000`, not `host.docker.internal`).

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
- Python backend uses async/await throughout, Pydantic v2 schemas with camelCase field aliases
