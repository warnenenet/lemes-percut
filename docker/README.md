# Panduan Deployment & Smoke Test Docker (Wajib Sebelum T04)

Arsitektur container untuk **SMK Negeri 1 Percut Sei Tuan**:
- `mysql`: MySQL 8.0 (`my.cnf` khusus 4-8 GB RAM, `utf8mb4_unicode_ci`, `TZ=Asia/Jakarta`, init charset script).
- `app`: Portal LMS utama (`lms.sekolah.sch.id`, `APP_MODE=LMS`, `NODE_ENV=production`, UID `1000`).
- `cbt_app`: Container terpisah khusus ujian CBT (`cbt.sekolah.sch.id`, `APP_MODE=CBT`, UID `1000`).
- `nginx`: Reverse proxy split-subdomain + fallback LAN lokal (port 80/443), sertifikat SSL Certbot dari `/etc/letsencrypt:ro`.
- `backup`: Cron harian pukul 02:00 WIB (`MYSQL_PWD` non-interaktif, `mysqldump | gzip`, retensi 7 hari, alert 0-byte).

> **Aturan Keras Production**: Fallback JSON (`ALLOW_JSON_FALLBACK`) **dilarang keras** di production. Jika `DATABASE_URL` kosong atau `NODE_ENV=production` tanpa MySQL aktif, aplikasi menolak start (`exit 1`) dan `/api/health` mengembalikan `status: "DEGRADED"` dengan HTTP `503`.

## 1. Persiapan Bind Mount Host (Non-Root UID 1000)

```bash
sudo mkdir -p /var/lib/lms-smkn1/storage /var/lib/lms-smkn1/mysql-data /var/lib/lms-smkn1/backups
sudo chown -R 1000:1000 /var/lib/lms-smkn1/storage
chmod 755 /var/lib/lms-smkn1/storage
```

## 2. Build & Distribusi Offline (`docker save` / `docker load`)

Di mesin build (dengan internet):
```bash
docker compose -f docker/docker-compose.yml build
docker save smkn1-lms-app:1.0.0 smkn1-nginx:1.0.0 smkn1-backup:1.0.0 mysql:8.0 -o smkn1-lms-images.tar
```

Di server sekolah:
```bash
docker load -i smkn1-lms-images.tar
cp docker/.env.example docker/.env
# Edit docker/.env dengan password produksi kuat (>= 16 karakter)
```

## 3. Checklist Smoke Test Docker (10 Langkah Wajib Sebelum T04)

Jalankan di mesin yang memiliki Docker Engine & MySQL container:

1. Salin `cp docker/.env.example docker/.env` dan isi `MYSQL_ROOT_PASSWORD` serta `MYSQL_PASSWORD`.
2. Jalankan stack: `docker compose -f docker/docker-compose.yml --env-file docker/.env up -d`.
3. Tunggu `mysql` dan `app` berstatus `healthy`: `docker compose -f docker/docker-compose.yml ps`.
4. Cek log `app` (`docker logs smkn1_lms_app`): harus menampilkan `[entrypoint] Menjalankan migrasi skema Drizzle...` dan `[entrypoint] Menjalankan server (LMS)...`, **bukan** mode fallback JSON.
5. Uji healthcheck: `curl -s http://localhost/api/health` → harus `status: "OK"`, `engine: "mysql"`, `mysql_configured: true`, `mysql_reachable: true`, `storage_dir: "/app/storage"`.
6. Verifikasi tabel di MySQL 8: `MYSQL_PWD=<pass> docker exec smkn1_mysql mysql -u lms_user lms_smkn1 -e "SHOW TABLES;"` → harus berjumlah **43 tabel**.
7. Jalankan seed idempoten (jika `AUTO_SEED=false`): `docker exec smkn1_lms_app npm run db:seed` → cek `/api/health` `counts` (`14` jurusan, `18` rombel, `180` siswa, `20` guru, `5` BK, `10` PKL).
8. Verifikasi karakter `utf8mb4` dan timezone `+07:00`: `SELECT @@global.time_zone, @@session.time_zone;` di MySQL harus `+07:00`.
9. Jalankan backup manual: `docker exec smkn1_backup /scripts/backup.sh` → pastikan `/var/lib/lms-smkn1/backups/db/lms_smkn1percut_*.sql.gz` berukuran `> 0` bytes.
10. Uji restore: `gunzip < /var/lib/lms-smkn1/backups/db/<file>.sql.gz | MYSQL_PWD=<pass> docker exec -i smkn1_mysql mysql -u lms_user lms_smkn1` → pastikan seluruh tabel dan data pulih utuh.
