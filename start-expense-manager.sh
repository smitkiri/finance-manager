#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Start expense manager
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 🤖

# Documentation:
# @raycast.author Smit

PROJECT_DIR="/Users/smitkiri/Projects/finance-manager"
BACKUP_DIR="$HOME/finance-manager-backups"
DB_CONTAINER="expense_tracker_db"
DB_USER="expense_tracker"
DB_NAME="expense_tracker"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Start the DB container if it isn't already running
if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  echo "Starting PostgreSQL container..."
  (cd "$PROJECT_DIR" && npm run docker:up)
  sleep 5
fi

# Take a timestamped pg_dump backup
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/expense_tracker_${TIMESTAMP}.sql"
if docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE" 2>/dev/null; then
  echo "Backup saved: $BACKUP_FILE"
  # Keep only the latest 5 backups, delete older ones
  ls -t "$BACKUP_DIR"/expense_tracker_*.sql 2>/dev/null | tail -n +6 | xargs rm -f
else
  echo "Backup failed, continuing..."
  rm -f "$BACKUP_FILE"
fi

# Start the app
cd "$PROJECT_DIR" && BROWSER=firefox npm run dev
