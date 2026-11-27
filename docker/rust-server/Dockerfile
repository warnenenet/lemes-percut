# syntax=docker/dockerfile:1.7
# Multi-stage BuildKit Dockerfile untuk LMS & CBT SMK Negeri 1 Percut Sei Tuan

# ==============================================================================
# Stage 1: Build Frontend React + Vite PWA
# ==============================================================================
FROM node:22-alpine AS frontend-builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then \
      npm ci --no-audit --no-fund; \
    else \
      npm install --no-audit --no-fund; \
    fi

COPY index.html vite.config.ts tsconfig.json ./
COPY public ./public
COPY src ./src
RUN npm run build

# ==============================================================================
# Stage 2: Compile Pure-Rust Backend (Axum + SQLx + lms-domain)
# ==============================================================================
FROM rust:1.85-slim-bookworm AS rust-builder
WORKDIR /app/rust

COPY rust/rust-toolchain.toml rust/Cargo.toml rust/Cargo.lock ./
COPY rust/migrations ./migrations
COPY rust/crates ./crates

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/app/rust/target \
    sh -c 'if ! grep -q "source = " Cargo.lock; then cargo generate-lockfile; fi && cargo build --release --locked --bin lms-server --bin seed' \
    && cp target/release/lms-server /tmp/lms-server \
    && cp target/release/seed /tmp/seed

# ==============================================================================
# Stage 3: Minimal Debian Bookworm Slim Runtime (Non-Root UID 1000)
# ==============================================================================
FROM debian:bookworm-slim AS runtime

LABEL org.opencontainers.image.title="LMS SMK Negeri 1 Percut Sei Tuan (Rust)"
LABEL org.opencontainers.image.description="Pure-Rust Axum + SQLx LMS & CBT Server untuk SMK Negeri 1 Percut Sei Tuan"
LABEL org.opencontainers.image.source="https://github.com/smkn1percut/lms-smkn1-percut"
LABEL org.opencontainers.image.licenses="Apache-2.0"

WORKDIR /app

ENV TZ=Asia/Jakarta
ENV PORT=3000
ENV APP_ENV=production
ENV STORAGE_DIR=/app/storage
ENV DIST_DIR=/app/dist
ENV BACKUP_DIR=/backup

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      wget \
      netcat-openbsd \
      tzdata \
    && ln -fs /usr/share/zoneinfo/Asia/Jakarta /etc/localtime \
    && dpkg-reconfigure -f noninteractive tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 1000 appgroup \
    && useradd -u 1000 -g appgroup -m appuser

COPY --from=rust-builder /tmp/lms-server /app/lms-server
COPY --from=rust-builder /tmp/seed /app/seed
COPY --from=frontend-builder /app/dist /app/dist
COPY docker/rust-server/entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/lms-server /app/seed /app/entrypoint.sh \
    && mkdir -p /app/storage/modules /app/storage/notebooks /app/storage/submissions \
    && chown -R 1000:1000 /app

USER 1000:1000

EXPOSE 3000 3001

HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
