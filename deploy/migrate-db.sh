#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
# Database Migration Script: Neon → Self-hosted PostgreSQL
# Run this on the VPS after docker-compose services are up
# Usage: bash migrate-db.sh "postgres://user:pass@neon-host/db"
# ─────────────────────────────────────────────────────────────────────
set -e

NEON_URL="${1:-}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/zionite}"

if [ -z "$NEON_URL" ]; then
  echo "Usage: bash migrate-db.sh \"postgres://user:pass@neon-host/db\""
  echo "Or set NEON_DATABASE_URL env var"
  exit 1
fi

if [ -z "$NEON_URL" ]; then
  NEON_URL="$NEON_DATABASE_URL"
fi

echo "► Starting database migration from Neon to local PostgreSQL..."
echo "  Source: $NEON_URL"
echo "  Target: local PostgreSQL in Docker"

# ── Check if pg_dump is available ───────────────────────────────────
if ! command -v pg_dump &> /dev/null; then
  echo "► Installing postgresql-client for pg_dump..."
  apt-get update && apt-get install -y postgresql-client
fi

# ── Create backup directory ────────────────────────────────────────
mkdir -p $DEPLOY_DIR/backups
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_FILE="$DEPLOY_DIR/backups/neon_full_$TIMESTAMP.sql"

# ── Dump from Neon ─────────────────────────────────────────────────
echo "► Dumping database from Neon..."
pg_dump "$NEON_URL" \
  --no-owner \
  --no-privileges \
  --no-tablespaces \
  --format=p \
  --file="$DUMP_FILE"

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "✓ Dump created: $DUMP_FILE ($DUMP_SIZE)"

# ── Load .env for local DB credentials ─────────────────────────────
if [ -f "$DEPLOY_DIR/.env" ]; then
  source $DEPLOY_DIR/.env
fi

PG_USER="${POSTGRES_USER:-zionite}"
PG_DB="${POSTGRES_DB:-zionite}"

# ── Import to local PostgreSQL ─────────────────────────────────────
echo "► Importing to local PostgreSQL..."
cd $DEPLOY_DIR

# Drop and recreate to ensure clean import
docker compose exec -T db psql -U "$PG_USER" -d "$PG_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Import the dump
docker compose exec -T db psql -U "$PG_USER" -d "$PG_DB" < "$DUMP_FILE"

echo "✓ Import complete!"

# ── Verify ─────────────────────────────────────────────────────────
echo "► Verifying migration..."
TABLE_COUNT=$(docker compose exec -T db psql -U "$PG_USER" -d "$PG_DB" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
USER_COUNT=$(docker compose exec -T db psql -U "$PG_USER" -d "$PG_DB" -t -c "SELECT count(*) FROM users;")
SERMON_COUNT=$(docker compose exec -T db psql -U "$PG_USER" -d "$PG_DB" -t -c "SELECT count(*) FROM sermons;")
MUSIC_COUNT=$(docker compose exec -T db psql -U "$PG_USER" -d "$PG_DB" -t -c "SELECT count(*) FROM music;")

echo ""
echo "── Migration Summary ──"
echo "  Tables: $TABLE_COUNT"
echo "  Users:  $USER_COUNT"
echo "  Sermons: $SERMON_COUNT"
echo "  Music:   $MUSIC_COUNT"
echo ""
echo "✓ Database migration complete!"
echo "  Backup saved at: $DUMP_FILE"
