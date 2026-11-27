# LMS & CBT Terpadu — SMK Negeri 1 Percut Sei Tuan

Sistem Learning Management System (LMS) dan Computer-Based Test (CBT) berbasis backend **Pure Rust (Axum + Tokio + SQLx MySQL 8)** dengan antarmuka **React + Vite PWA**.

---

## Arsitektur Singkat

- **`rust/crates/lms-domain`**: Domain logic murni (RBAC, absensi, CBT scoring, penilaian Rapor Merdeka, prompt engine, validasi import).
- **`rust/crates/lms-server`**: HTTP server Axum, koneksi pool MySQL 8 (`sqlx` runtime queries + `tls-rustls-ring`), migrasi otomatis, seeding idempoten (`seed` binary), Bearer token session store, dan serving static bundle `/app/dist`.
- **`src/`**: Frontend React + Vite PWA yang berkomunikasi langsung ke `/api/*` di backend Rust. Build produksi (`npm run build`) hanya menghasilkan aset statis SPA ke `dist/` tanpa `server.ts`.
- **`docker/docker-compose.prod.yml`**: Stack produksi berisi `mysql` (8.0), `app` (LMS port 3000), `cbt_app` (CBT port 3001), `nginx` (reverse proxy port 80/443), dan `backup` (otomatis setiap hari pukul 02:00 WIB).

> **Reproducibility (`Cargo.lock`)**: Seluruh dependency utama di `rust/Cargo.toml` sudah dikunci dengan exact pin (`=`). Pipeline CI (`ci.yml`) dan build Docker (`docker/rust-server/Dockerfile`) otomatis men-generate lockfile deterministik dari pin tersebut jika `rust/Cargo.lock` masih berupa placeholder workspace sebelum menjalankan `--locked`.

---

## Deploy ke Server Sekolah (CI/CD Otomatis)

Pipeline otomatis menghubungkan `push` ke branch `main` → **CI Check (Clippy + Unit + MySQL 8 E2E + Vite Build + Docker Smoke)** → **Build & Sign Image ke GHCR (`release.yml`)** → **Rolling Deploy via SSH ke Server Sekolah (`deploy.yml`)**.

Untuk panduan lengkap persiapan pertama kali di GitHub Actions dan server Ubuntu/aaPanel, ikuti **[Checklist Deploy Pertama (`docs/DEPLOY_CHECKLIST.md`)](docs/DEPLOY_CHECKLIST.md)**.

### Ringkasan Cepat

1. **Secrets di GitHub Actions** (`Settings → Secrets and variables → Actions`):
   - `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`, `SERVER_PORT` (`22`), `DEPLOY_DIR` (`/opt/lms-smkn1`), serta opsional `GHCR_USERNAME` & `GHCR_TOKEN` jika GHCR package bersifat Private.
2. **Konfigurasi Satu Kali di Server Sekolah**:
   ```bash
   sudo mkdir -p /opt/lms-smkn1 /var/lib/lms-smkn1/storage /var/lib/lms-smkn1/mysql-data /var/lib/lms-smkn1/backups
   sudo chown -R 1000:1000 /var/lib/lms-smkn1/storage
   sudo chown -R "$USER":"$USER" /opt/lms-smkn1
   git clone https://github.com/<ORG_ATAU_USER>/<NAMA_REPO>.git /opt/lms-smkn1
   cd /opt/lms-smkn1
   cp docker/.env.production.example docker/.env
   chmod 600 docker/.env
   ```
3. **Boot Pertama**:
   Set `AUTO_SEED=true` di `docker/.env`, jalankan:
   ```bash
   docker compose -f docker/docker-compose.prod.yml --env-file docker/.env up -d
   ```
   Setelah `app` berstatus `healthy`, ubah `AUTO_SEED=false` di `docker/.env`.

---

Untuk detail smoke test stack Docker, lihat [`docker/README.md`](docker/README.md) dan [`docs/DEPLOY_CHECKLIST.md`](docs/DEPLOY_CHECKLIST.md).
