#!/bin/bash
set -e

echo "--- Finance Manager Setup ---"
echo "This script will install dependencies, set up the database, and start the application."
echo "It is safe to run this script multiple times."

# Check for Docker
echo
echo "STEP 1: Checking for Docker..."
if ! [ -x "$(command -v docker)" ]; then
  echo "ERROR: Docker is not installed. Please install it to continue." >&2
  exit 1
fi

if ! docker info > /dev/null 2>&1; then
  echo "ERROR: Docker is not running. Please start the Docker daemon to continue." >&2
  exit 1
fi
echo "✅ Docker is installed and running."

# Install dependencies
echo
echo "STEP 2: Installing dependencies..."
if [ -d "node_modules" ] && [ -d "frontend/node_modules" ] && [ -d "legacy/node_modules" ]; then
  echo "--> All 'node_modules' directories already exist, skipping npm install."
else
  npm install
  cd frontend && npm install && cd ..
  cd legacy && npm install && cd ..
  echo "✅ npm dependencies installed."
fi

# Install Python backend dependencies
echo
echo "STEP 3: Installing Python backend dependencies..."
cd backend && uv sync && cd ..
echo "✅ Python dependencies installed."

# Start Docker services (postgres + nginx)
echo
echo "STEP 4: Starting PostgreSQL and nginx with Docker..."
docker-compose up -d
echo "✅ Docker services are running."

# Wait for DB to be ready
echo
echo "STEP 5: Waiting for the database to initialize..."
sleep 5
echo "✅ Database is likely ready."

# Run database migrations
echo
echo "STEP 6: Running database migrations..."
npm run migrate
echo "✅ Migrations completed or were already up-to-date."

# Sync REACT_APP_* vars from root .env to frontend/.env
echo
echo "STEP 7: Syncing frontend environment..."
{
  echo "REACT_APP_API_BASE_URL=http://localhost:3002/api"
  if [ -f .env ]; then
    grep "^REACT_APP_" .env 2>/dev/null || true
  fi
} > frontend/.env
echo "✅ frontend/.env updated (API base → nginx on port 3002)"

# Start all servers
echo
echo "STEP 8: Starting development servers..."
echo "  Frontend:  http://localhost:3000"
echo "  Express:   http://localhost:3001"
echo "  FastAPI:   http://localhost:8000"
echo "  nginx:     http://localhost:3002 (proxy)"
echo "Press Ctrl+C to stop all servers."
concurrently \
  --names "express,fastapi,frontend" \
  --prefix-colors "yellow,green,blue" \
  "node legacy/server.js" \
  "cd backend && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload" \
  "cd frontend && npm start"
