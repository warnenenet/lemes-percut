# Multi-stage build for SMKN 1 Percut LMS & CBT Express+Vite Application
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json bun.lock* package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV TZ=Asia/Jakarta

RUN apk add --no-cache tzdata \
  && cp /usr/share/zoneinfo/Asia/Jakarta /etc/localtime \
  && echo "Asia/Jakarta" > /etc/timezone \
  && delgroup dialout 2>/dev/null || true \
  && (getent group 1000 >/dev/null || addgroup -S -g 1000 appgroup) \
  && (id -u 1000 >/dev/null 2>&1 || adduser -S -u 1000 -G appgroup appuser)

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src/db ./src/db
COPY --from=builder /app/src/domain ./src/domain
COPY --from=builder /app/docker/app/entrypoint.sh ./entrypoint.sh

RUN mkdir -p /app/storage/modules /app/storage/notebooks /app/storage/submissions /app/data \
  && chmod +x /app/entrypoint.sh \
  && chown -R 1000:1000 /app

USER 1000:1000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/entrypoint.sh"]
