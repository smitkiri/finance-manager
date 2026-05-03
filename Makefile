.PHONY: up down

# Start the entire local stack: Docker services, migrations, and dev servers
up:
	@echo "Starting Docker services (postgres + nginx)..."
	docker-compose up -d
	@echo "Waiting for database to be ready..."
	@until docker exec finance_manager_db pg_isready -U finance_manager > /dev/null 2>&1; do sleep 1; done
	@echo "Running database migrations (Alembic)..."
	cd backend && uv run alembic upgrade head
	@echo ""
	@echo "Starting dev servers..."
	@echo "  Frontend:  http://localhost:3000"
	@echo "  FastAPI:   http://localhost:8000"
	@echo "  nginx:     http://localhost:3002 (proxy)"
	@echo ""
	npm run dev

# Stop everything: kill dev servers (via Ctrl+C / make down), then stop Docker
down:
	@echo "Stopping Docker services..."
	docker-compose down --remove-orphans
	@echo "Done."
