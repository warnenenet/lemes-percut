# Checklist Deploy Pertama — Server Sekolah (Ubuntu + aaPanel + GHCR)

Dokumen ini digunakan **setelah** workflow GitHub Actions (`CI` dan `Release Docker Image`) berstatus hijau dan image sudah ter-push ke GitHub Container Registry (GHCR).

---

## Fase 1: Verifikasi Prasyarat GitHub & GHCR

- [ ] Workflow **CI** (`ci.yml`) pada commit terbaru di `main` berstatus **Success** (Clippy, Rust unit + MySQL 8 E2E, Vite build tanpa `server.ts`, Docker smoke build).
- [ ] Workflow **Release Docker Image** (`release.yml`) berstatus **Success** dan image `ghcr.io/<owner>/<repo>:latest` serta tag `sha-...` sudah muncul di menu **Packages** repository.
- [ ] Jika visibility package di GHCR **Private**, buat Personal Access Token (classic) dengan scope `read:packages` untuk disimpan di secret `GHCR_TOKEN` (atau ubah package menjadi **Public** di Package Settings jika sesuai kebijakan sekolah).
- [ ] Seluruh **GitHub Actions Secrets** sudah terisi di `Settings → Secrets and variables → Actions`:
  - [ ] `SERVER_HOST` — IP publik atau hostname SSH server sekolah.
  - [ ] `SERVER_USER` — User non-root yang masuk grup `docker` (`sudo usermod -aG docker <user>`).
  - [ ] `SERVER_SSH_KEY` — Private key SSH yang public key-nya sudah ada di `~/.ssh/authorized_keys` server.
  - [ ] `SERVER_PORT` — Port SSH server (`22` atau custom port aaPanel).
  - [ ] `DEPLOY_DIR` — Direktori kerja di server (default: `/opt/lms-smkn1`).
  - [ ] `GHCR_USERNAME` & `GHCR_TOKEN` — Wajib jika package GHCR bersifat Private.

---

## Fase 2: Persiapan Host Server Ubuntu / aaPanel (Satu Kali)

- [ ] **Docker & Compose v2 aktif**: `docker --version` dan `docker compose version` berjalan tanpa error.
- [ ] **Cek bentrok port 80 / 443 dengan Nginx bawaan aaPanel**:
  - Stack `docker/docker-compose.prod.yml` memakai container `nginx` pada port `80` dan `443`.
  - Jika aaPanel menjalankan Nginx/Apache di host pada port `80`/`443`:
    - **Opsi A (Disarankan bila server khusus LMS+CBT)**: Hentikan Nginx aaPanel (`bt stop` / matikan Nginx dari aaPanel App Store) agar container `smkn1_prod_nginx` memegang langsung port `80` dan `443`.
    - **Opsi B (Bila ada situs lain di aaPanel)**: Ubah port mapping service `nginx` di `docker/docker-compose.prod.yml` (misal `"127.0.0.1:8080:80"`), lalu buat **Reverse Proxy** di aaPanel Website menuju `http://127.0.0.1:8080`.
- [ ] **Siapkan direktori persisten & izin UID 1000**:
  ```bash
  sudo mkdir -p /opt/lms-smkn1 /var/lib/lms-smkn1/storage /var/lib/lms-smkn1/mysql-data /var/lib/lms-smkn1/backups
  sudo chown -R 1000:1000 /var/lib/lms-smkn1/storage
  sudo chmod 755 /var/lib/lms-smkn1/storage
  sudo chown -R "$USER":"$USER" /opt/lms-smkn1
  ```
- [ ] **Clone repository & siapkan `docker/.env`**:
  ```bash
  git clone https://github.com/<ORG_ATAU_USER>/<NAMA_REPO>.git /opt/lms-smkn1
  cd /opt/lms-smkn1
  cp docker/.env.production.example docker/.env
  chmod 600 docker/.env
  ```
- [ ] **Isi variabel wajib di `docker/.env`**:
  - [ ] `GITHUB_REPOSITORY_LOWER=<owner>/<repo>` *(huruf kecil semua)*
  - [ ] `IMAGE_TAG=latest`
  - [ ] `MYSQL_ROOT_PASSWORD=<password kuat min 16 karakter>`
  - [ ] `MYSQL_DATABASE=lms_smkn1`
  - [ ] `MYSQL_USER=lms_user`
  - [ ] `MYSQL_PASSWORD=<password kuat min 16 karakter>` *(hindari karakter unescaped `@ : / # ? &`)*
  - [ ] `AUTO_SEED=true` *(khusus boot pertama kali saja)*

---

## Fase 3: First Boot & Verifikasi Awal di Server

- [ ] **Login GHCR** (jika package Private):
  ```bash
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin
  ```
- [ ] **Jalankan stack pertama kali**:
  ```bash
  cd /opt/lms-smkn1
  docker compose -f docker/docker-compose.prod.yml --env-file docker/.env pull
  docker compose -f docker/docker-compose.prod.yml --env-file docker/.env up -d
  ```
- [ ] **Pantau status container hingga semua `healthy`**:
  ```bash
  docker compose -f docker/docker-compose.prod.yml --env-file docker/.env ps
  docker compose -f docker/docker-compose.prod.yml --env-file docker/.env logs -f app
  ```
- [ ] **Verifikasi endpoint health & UI**:
  - [ ] `curl -fsS http://127.0.0.1/api/health` mengembalikan JSON dengan `"ok":true` dan `"engine":"mysql"`.
  - [ ] `curl -fsS http://127.0.0.1/api/public/bootstrap` mengembalikan profil `SMK Negeri 1 Percut Sei Tuan`, `"engine":"mysql"`, dan `"demo_users":[]` (mode produksi).
  - [ ] Halaman login dapat dibuka via browser dan login multi-role berfungsi.
- [ ] **Matikan `AUTO_SEED` segera setelah boot pertama sukses**:
  - [ ] Edit `docker/.env`, ubah `AUTO_SEED=false`.
  - [ ] Restart `app` ringan atau biarkan berlaku pada deploy berikutnya.
- [ ] **Ganti kata sandi akun bawaan** (terutama akun `ADMIN`, `KEPALA_SEKOLAH`, `WAKASEK`, dan guru) jika memakai data seed pada lingkungan produksi live.

---

## Fase 4: Konfigurasi Domain, SSL & Backup

- [ ] **Domain & DNS** (`lms.smkn1percut.sch.id` dan `cbt.smkn1percut.sch.id`): pastikan A record mengarah ke IP publik server dan sesuaikan `server_name` / blok SSL di `docker/nginx/conf.d/lms_cbt.conf`.
- [ ] **Sertifikat SSL (Let's Encrypt)**: pastikan `/etc/letsencrypt` ter-mount dan terisi sebelum mengaktifkan blok `listen 443 ssl` di Nginx.
- [ ] **Uji Backup Manual Pertama (Verifikasi > 0 byte)**:
  ```bash
  docker compose -f docker/docker-compose.prod.yml --env-file docker/.env exec -T backup /scripts/backup.sh
  ls -lh /var/lib/lms-smkn1/backups/db/
  ```
- [ ] **Uji Auto-Deploy Pipeline (`deploy.yml`)**:
  - Jalankan workflow **Deploy to School Server** (`workflow_dispatch`) atau lakukan push kecil ke `main`, lalu pastikan job SSH rolling deploy selesai tanpa rollback dan `docker compose ps` menunjukkan image tag terbaru berjalan `healthy`.

---

## Prosedur Rollback Darurat

Jika versi baru bermasalah setelah deploy:
```bash
cd /opt/lms-smkn1
IMAGE_TAG=sha-<COMMIT_SHA_SEBELUMNYA> \
  docker compose -f docker/docker-compose.prod.yml --env-file docker/.env up -d --pull always app cbt_app
```
Untuk memulihkan database dari arsip `.sql.gz`:
```bash
gunzip < /var/lib/lms-smkn1/backups/db/<NAMA_FILE>.sql.gz | \
  docker compose -f docker/docker-compose.prod.yml --env-file docker/.env exec -T mysql \
  sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u "$MYSQL_USER" "$MYSQL_DATABASE"'
```
