#!/bin/bash

# Start script for expense tracker with PostgreSQL

set -e

echo "Starting Expense Tracker..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker and try again."
    exit 1
fi

# Start PostgreSQL container if not already running
if ! docker ps | grep -q expense_tracker_db; then
    echo "Starting PostgreSQL container..."
    docker-compose up -d postgres
    
    # Wait for PostgreSQL to be ready
    echo "Waiting for PostgreSQL to be ready..."
    max_attempts=30
    attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if docker exec expense_tracker_db pg_isready -U expense_tracker > /dev/null 2>&1; then
            echo "PostgreSQL is ready!"
            break
        fi
        attempt=$((attempt + 1))
        echo "Waiting for PostgreSQL... ($attempt/$max_attempts)"
        sleep 1
    done
    
    if [ $attempt -eq $max_attempts ]; then
        echo "Error: PostgreSQL failed to start within $max_attempts seconds"
        exit 1
    fi
else
    echo "PostgreSQL container is already running"
fi

# Run migration
echo "Running database migration..."
node migrate.js || {
    echo "Warning: Migration script failed or already completed"
}

# Start the server
echo "Starting Express server..."
node server.js
