#!/bin/bash
NEON_URL="postgresql://neondb_owner:npg_ANUEDdq28mjg@ep-wandering-block-ahfs3q45-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
DEPLOY_DIR="/opt/zionite"

echo "=== Step 1: Dump from Neon using PG 18 Docker ==="
docker run --rm -v "$DEPLOY_DIR/backups:/backups" postgres:18-alpine \
  pg_dump "$NEON_URL" --no-owner --no-privileges --no-tablespaces --format=p --file="/backups/neon_full.sql" 2>&1

DUMP_SIZE=$(du -h "$DEPLOY_DIR/backups/neon_full.sql" 2>/dev/null | cut -f1)
echo "Dump size: $DUMP_SIZE"

if [ -z "$DUMP_SIZE" ]; then
  echo "ERROR: Dump file was not created!"
  exit 1
fi

echo "=== Step 2: Drop existing schema ==="
docker exec -e PGUSER=zionite -e PGDATABASE=zionite zionite-db psql -P pager=off -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>&1

echo "=== Step 3: Copy dump into DB container ==="
docker cp "$DEPLOY_DIR/backups/neon_full.sql" zionite-db:/tmp/neon_full.sql

echo "=== Step 4: Import from inside the container ==="
docker exec -e PGUSER=zionite -e PGDATABASE=zionite zionite-db psql -P pager=off -f /tmp/neon_full.sql 2>&1 | tail -30

echo "=== Step 5: Clean up dump file in container ==="
docker exec zionite-db rm -f /tmp/neon_full.sql

echo "=== Step 6: Verify migration ==="
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

echo "=== Step 7: Restart backend ==="
docker restart zionite-backend 2>&1
sleep 12
docker logs zionite-backend --tail 15 2>&1

echo "=== Step 8: API TEST ==="
curl -s http://localhost/api/sermons | head -c 500
echo ""
echo "=== DONE ==="
