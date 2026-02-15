#!/bin/bash
set -e

echo "--- Expense Tracker Setup ---"
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
if [ -d "node_modules" ]; then
  echo "--> 'node_modules' directory already exists, skipping 'npm install'."
else
  npm install
  echo "✅ Dependencies installed."
fi

# Start PostgreSQL container
echo
echo "STEP 3: Starting PostgreSQL database with Docker..."
# The 'docker-compose up -d' command is idempotent. It will only start the container if it's not already running.
npm run docker:up
echo "✅ PostgreSQL container is running or was already running."

# Wait for DB to be ready
echo
echo "STEP 4: Waiting for the database to initialize..."
sleep 5 # Give the container a few seconds to initialize properly
echo "✅ Database is likely ready."

# Run database migrations
echo
echo "STEP 5: Running database migrations..."
# The migrate.js script is idempotent and will automatically skip if the database is already migrated.
npm run migrate
echo "✅ Migrations completed or were already up-to-date."

# Start the application
echo
echo "STEP 6: Starting the development server..."
echo "The application will be available at http://localhost:3000"
echo "Press Ctrl+C to stop the server."
npm run dev
