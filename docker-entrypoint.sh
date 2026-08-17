#!/bin/sh
set -e
if [ -n "$DATABASE_URL" ]; then
    echo "[entrypoint] Running alembic upgrade head..."
    alembic upgrade head || { sleep 3; alembic upgrade head; }
fi
exec python -m uvicorn src.main:app --host 0.0.0.0 --port 8080
