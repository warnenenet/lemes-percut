#!/bin/sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backup}/db"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
STAMP="$(date +%Y%m%d_%H%M%S)"
DUMP_FILE="${BACKUP_DIR}/lms_smkn1percut_${STAMP}.sql.gz"
ALERT_LOG="${BACKUP_DIR}/backup_alerts.log"

mkdir -p "$BACKUP_DIR"

export MYSQL_PWD="${MYSQL_PASSWORD}"

echo "[backup] Memulai mysqldump ${MYSQL_DATABASE} -> ${DUMP_FILE}"
mysqldump \
  -h "${MYSQL_HOST:-mysql}" \
  -u "${MYSQL_USER:-lms_user}" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  "${MYSQL_DATABASE:-lms_smkn1}" | gzip -c > "$DUMP_FILE"

FILE_SIZE=$(wc -c < "$DUMP_FILE" | tr -d ' ')
if [ "${FILE_SIZE:-0}" -eq 0 ] || [ ! -s "$DUMP_FILE" ]; then
  MSG="[ALERT 0-BYTE] $(date -Iseconds) Backup ${DUMP_FILE} berukuran 0 byte! Periksa kapasitas disk atau kredensial MySQL."
  echo "$MSG" >&2
  echo "$MSG" >> "$ALERT_LOG"
  exit 1
fi

echo "[backup] Sukses: ${DUMP_FILE} (${FILE_SIZE} bytes)"

# Retensi otomatis: hapus backup lebih lama dari 7 hari
find "$BACKUP_DIR" -name "lms_smkn1percut_*.sql.gz" -type f -mtime +"$RETENTION_DAYS" -delete
echo "[backup] Pembersihan retensi > ${RETENTION_DAYS} hari selesai."
