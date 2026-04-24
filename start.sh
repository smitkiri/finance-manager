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
if [ -d "node_modules" ] && [ -d "frontend/node_modules" ]; then
  echo "--> All 'node_modules' directories already exist, skipping npm install."
else
  npm install
  cd frontend && npm install && cd ..
  echo "✅ npm dependencies installed."
fi

# Install Python backend dependencies
echo
echo "STEP 3: Installing Python backend dependencies..."
cd backend && uv sync && cd ..
echo "✅ Python dependencies installed."

# Sync REACT_APP_* vars from root .env to frontend/.env
echo
echo "STEP 4: Syncing frontend environment..."
{
  echo "REACT_APP_API_BASE_URL=http://localhost:3002/api"
  if [ -f .env ]; then
    grep "^REACT_APP_" .env 2>/dev/null || true
  fi
} > frontend/.env
echo "✅ frontend/.env updated (API base → nginx on port 3002)"

# Delegate to Makefile for docker, migrations, and dev servers
echo
echo "STEP 5: Starting the dev stack via make up..."
make up
