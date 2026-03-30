.PHONY: up down

# Start the entire local stack: Docker services, migrations, and dev servers
up:
	@echo "Starting Docker services (postgres + nginx)..."
	docker-compose up -d
	@echo "Waiting for database to be ready..."
	@until docker exec expense_tracker_db pg_isready -U expense_tracker > /dev/null 2>&1; do sleep 1; done
	@echo "Running database migrations..."
	node legacy/migrate.js
	@echo ""
	@echo "Starting dev servers..."
	@echo "  Frontend:  http://localhost:3000"
	@echo "  Express:   http://localhost:3001"
	@echo "  FastAPI:   http://localhost:8000"
	@echo "  nginx:     http://localhost:3002 (proxy)"
	@echo ""
	npx concurrently \
		--names "express,fastapi,frontend" \
		--prefix-colors "yellow,green,blue" \
		"node legacy/server.js" \
		"cd backend && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload" \
		"cd frontend && npm start"

# Stop everything: kill dev servers (via Ctrl+C / make down), then stop Docker
down:
	@echo "Stopping Docker services..."
	docker-compose down --remove-orphans
	@echo "Done."
