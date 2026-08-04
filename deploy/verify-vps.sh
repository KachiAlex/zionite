#!/bin/bash
echo "=== API TEST ==="
curl -s http://localhost/ping
echo ""
echo "=== TABLE COUNT ==="
docker exec -e PGUSER=zionite -e PGDATABASE=zionite zionite-db psql -P pager=off -t -c "SELECT count(*) FROM pg_tables WHERE schemaname = current_schema();"
echo "=== ALL TABLES ==="
docker exec -e PGUSER=zionite -e PGDATABASE=zionite zionite-db psql -P pager=off -c "SELECT tablename FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename;"
echo "=== EXTERNAL TEST ==="
curl -s http://localhost/api/sermons | head -c 200
echo ""
echo "=== DONE ==="
