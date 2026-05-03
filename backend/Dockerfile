# Backend image — used by both `backend` and `backend-migrate` services.
# Build context is the repo root; paths are prefixed with `backend/`.

FROM python:3.14-slim

# Pull the uv binary from the official uv image.
COPY --from=ghcr.io/astral-sh/uv:0.5.13 /uv /usr/local/bin/uv

WORKDIR /app

# Install dependencies first (layer cached unless lockfile changes)
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

# Copy application code
COPY backend/app/ ./app/
COPY backend/alembic/ ./alembic/
COPY backend/alembic.ini ./

EXPOSE 8000

# Default command: run the API server.
# The `backend-migrate` service overrides this with `alembic upgrade head`.
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
