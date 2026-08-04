#!/bin/bash
docker exec -e PGUSER=zionite -e PGDATABASE=zionite zionite-db psql -P pager=off -t -c "SELECT count(*) FROM pg_tables WHERE schemaname = current_schema();"
echo "---TABLES---"
docker exec -e PGUSER=zionite -e PGDATABASE=zionite zionite-db psql -P pager=off -c "SELECT tablename FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename;"
echo "---BACKEND_LOGS---"
docker logs zionite-backend 2>&1 | tail -30
