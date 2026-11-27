#!/bin/sh
set -eu

# Ekstrak host & port MySQL dari DATABASE_URL (fallback ke mysql:3306)
DB_HOST="${MYSQL_HOST:-}"
DB_PORT="${MYSQL_PORT:-}"

if [ -z "$DB_HOST" ] && [ -n "${DATABASE_URL:-}" ]; then
  HOST_PORT=$(printf '%s' "$DATABASE_URL" | sed -n 's|^mysql://[^@]*@\([^/?]*\).*|\1|p')
  DB_HOST=$(printf '%s' "$HOST_PORT" | cut -d: -f1)
  PARSED_PORT=$(printf '%s' "$HOST_PORT" | awk -F: '{if (NF>1) print $2}')
  if [ -z "$DB_PORT" ] && [ -n "$PARSED_PORT" ]; then
    DB_PORT="$PARSED_PORT"
  fi
fi

DB_HOST="${DB_HOST:-mysql}"
DB_PORT="${DB_PORT:-3306}"

echo "[entrypoint] Menunggu MySQL di ${DB_HOST}:${DB_PORT}..."
MAX_WAIT="${DB_WAIT_SECONDS:-60}"
ELAPSED=0
while ! nc -z "$DB_HOST" "$DB_PORT" >/dev/null 2>&1; do
  if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
    echo "[entrypoint] FATAL: MySQL di ${DB_HOST}:${DB_PORT} tidak merespons setelah ${MAX_WAIT} detik." >&2
    exit 1
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done
echo "[entrypoint] MySQL di ${DB_HOST}:${DB_PORT} siap."

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] RUN_MIGRATIONS=true: migrasi SQLx akan dieksekusi oleh /app/lms-server saat startup."
fi

if [ "${AUTO_SEED:-false}" = "true" ]; then
  echo "[entrypoint] AUTO_SEED=true: menjalankan /app/seed (idempoten)..."
  /app/seed
  # Hindari eksekusi seed ganda di dalam lms-server setelah /app/seed sukses
  export AUTO_SEED="false"
fi

echo "[entrypoint] Menjalankan /app/lms-server (APP_MODE=${APP_MODE:-LMS}, PORT=${PORT:-3000})..."
exec /app/lms-server
