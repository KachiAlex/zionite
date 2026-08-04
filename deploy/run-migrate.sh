#!/bin/bash
NEON_URL="postgresql://neondb_owner:npg_ANUEDdq28mjg@ep-wandering-block-ahfs3q45-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
DEPLOY_DIR="/opt/zionite"

echo "=== Using PostgreSQL 18 pg_dump inside Docker ==="
docker run --rm -v "$DEPLOY_DIR/backups:/backups" postgres:18-alpine \
  pg_dump "$NEON_URL" --no-owner --no-privileges --no-tablespaces --format=p --file="/backups/neon_full.sql" 2>&1

if [ ! -f "$DEPLOY_DIR/backups/neon_full.sql" ]; then
  echo "ERROR: Dump file was not created!"
  exit 1
fi

echo "Dump size: $(du -h $DEPLOY_DIR/backups/neon_full.sql | cut -f1)"

echo "=== Dropping existing schema (fresh import) ==="
docker exec -e PGUSER=zionite -e PGDATABASE=zionite zionite-db psql -P pager=off -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>&1

echo "=== Importing to local PostgreSQL ==="
docker exec -e PGUSER=zionite -e PGDATABASE=zionite zionite-db psql -P pager=off < "$DEPLOY_DIR/backups/neon_full.sql" 2>&1 | tail -20

echo "=== Verifying migration ==="
TABLE_COUNT=$(docker exec -e PGUSER=zionite -e PGDATABASE=zionite zionite-db psql -P pager=off -t -c "SELECT count(*) FROM pg_tables WHERE schemaname = current_schema();")
echo "$TABLE_COUNT tables total"

docker exec -e PGUSER=zionite -e PGDATABASE=zionite zionite-db psql -P pager=off -c "
SELECT 'users' as tbl, count(*) FROM users
UNION ALL SELECT 'sermons', count(*) FROM sermons
UNION ALL SELECT 'music', count(*) FROM music
UNION ALL SELECT 'broadcasts', count(*) FROM broadcasts
UNION ALL SELECT 'events', count(*) FROM events
UNION ALL SELECT 'prayer_requests', count(*) FROM prayer_requests
UNION ALL SELECT 'testimonies', count(*) FROM testimonies;
" 2>&1

echo "=== Restarting backend ==="
docker restart zionite-backend 2>&1
sleep 12
docker logs zionite-backend --tail 15 2>&1

echo "=== API TEST ==="
curl -s http://localhost/api/sermons | head -c 500
echo ""
echo "=== DONE ==="
