#!/bin/sh
set -eu

if [ -n "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] Menunggu kesiapan MySQL 8..."
  MAX_RETRIES=30
  RETRY=0
  until node -e "
    const mysql = require('mysql2/promise');
    mysql.createConnection(process.env.DATABASE_URL)
      .then(async (c) => { await c.query('SELECT 1'); await c.end(); process.exit(0); })
      .catch(() => process.exit(1));
  " >/dev/null 2>&1; do
    RETRY=$((RETRY + 1))
    if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
      echo "[entrypoint] Gagal terhubung ke MySQL setelah ${MAX_RETRIES} percobaan."
      exit 1
    fi
    echo "[entrypoint] MySQL belum siap ($RETRY/$MAX_RETRIES), menunggu 2 detik..."
    sleep 2
  done

  echo "[entrypoint] Menjalankan migrasi skema Drizzle..."
  npx drizzle-kit migrate

  if [ "${AUTO_SEED:-false}" = "true" ]; then
    echo "[entrypoint] Menjalankan seed idempoten..."
    npm run db:seed
  fi
else
  echo "[entrypoint] DATABASE_URL tidak diset; memakai mode fallback JSON lokal."
fi

mkdir -p "${STORAGE_DIR:-/app/storage}/modules" "${STORAGE_DIR:-/app/storage}/notebooks" "${STORAGE_DIR:-/app/storage}/submissions"

echo "[entrypoint] Menjalankan server (${APP_MODE:-LMS}) pada port ${PORT:-3000}..."
exec node dist/server.js
