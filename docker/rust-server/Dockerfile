# Multi-stage Pure Rust (Axum + SQLx) + Vite React Production Image
# 1. Build React PWA frontend bundle
FROM node:22-alpine AS frontend-builder
WORKDIR /web
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY index.html vite.config.ts tsconfig.json ./
COPY public ./public
COPY src ./src
RUN npm run build

# 2. Compile pure-Rust lms-server & seed binaries (Axum + SQLx + lms-domain)
FROM rust:1-bookworm AS rust-builder
WORKDIR /rust
COPY rust/Cargo.toml rust/Cargo.lock ./
COPY rust/migrations ./migrations
COPY rust/crates ./crates
RUN cargo build --release --bin lms-server --bin seed

# 3. Minimal Debian Bookworm Slim runtime executing compiled Rust binaries
FROM debian:bookworm-slim AS runner
WORKDIR /app
ENV TZ=Asia/Jakarta
ENV PORT=3000
ENV APP_ENV=production
ENV STORAGE_DIR=/app/storage
ENV DIST_DIR=/app/dist
ENV BACKUP_DIR=/backup

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates tzdata curl \
    && ln -fs /usr/share/zoneinfo/Asia/Jakarta /etc/localtime \
    && dpkg-reconfigure -f noninteractive tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 1000 appgroup \
    && useradd -u 1000 -g appgroup -m appuser

COPY --from=rust-builder /rust/target/release/lms-server /usr/local/bin/lms-server
COPY --from=rust-builder /rust/target/release/seed /usr/local/bin/seed
COPY --from=frontend-builder /web/dist /app/dist

RUN printf '%s\n' \
      '#!/bin/sh' \
      'set -eu' \
      'if [ "${AUTO_SEED:-false}" = "true" ]; then' \
      '  echo "[entrypoint] AUTO_SEED=true: menjalankan /usr/local/bin/seed..."' \
      '  /usr/local/bin/seed' \
      'fi' \
      'exec /usr/local/bin/lms-server' \
      > /usr/local/bin/entrypoint.sh \
    && chmod +x /usr/local/bin/entrypoint.sh \
    && mkdir -p /app/storage/modules /app/storage/notebooks /app/storage/submissions \
    && chown -R 1000:1000 /app

USER 1000:1000
EXPOSE 3000

HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=5 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["/usr/local/bin/entrypoint.sh"]
