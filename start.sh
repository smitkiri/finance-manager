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
echo "STEP 2: Installing npm dependencies..."
if [ -d "node_modules" ] && [ -d "frontend/node_modules" ] && [ -d "legacy/node_modules" ]; then
  echo "--> All 'node_modules' directories already exist, skipping install."
else
  npm install
  cd frontend && npm install && cd ..
  cd legacy && npm install && cd ..
  echo "✅ Dependencies installed."
fi

# Start PostgreSQL container
echo
echo "STEP 3: Starting PostgreSQL database with Docker..."
npm run docker:up
echo "✅ PostgreSQL container is running or was already running."

# Wait for DB to be ready
echo
echo "STEP 4: Waiting for the database to initialize..."
sleep 5
echo "✅ Database is likely ready."

# Run database migrations
echo
echo "STEP 5: Running database migrations..."
npm run migrate
echo "✅ Migrations completed or were already up-to-date."

# Sync REACT_APP_* vars from root .env to frontend/.env
echo
echo "STEP 6: Syncing frontend environment..."
if [ -f .env ]; then
  {
    echo "REACT_APP_API_BASE_URL=http://localhost:3001/api"
    grep "^REACT_APP_" .env
  } > frontend/.env
  echo "✅ frontend/.env updated from root .env"
fi

# Start the application
echo
echo "STEP 7: Starting the development server..."
echo "The application will be available at http://localhost:3000"
echo "Press Ctrl+C to stop the server."
npm run dev
