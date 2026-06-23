# syntax=docker/dockerfile:1
# Multi-stage build for the Next.js proxy (output: "standalone"). Produces a small runtime image
# that runs the self-contained server.js. better-sqlite3 is a native module kept external
# (serverExternalPackages) and traced into the standalone bundle.

# ---- builder: install deps + produce the standalone build ----
FROM node:22-slim AS builder
WORKDIR /app
# Toolchain for better-sqlite3 in case no prebuilt binary matches the build platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runner: minimal image running the standalone server ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    CLAUDE_FREE_HOST=0.0.0.0 \
    CLAUDE_FREE_HOME=/data
# SQLite DB + local state live here — mount a volume so they survive redeploys.
# Run as root (no USER drop): platforms like DevPanel bind-mount a host directory at /data that's
# owned by root, and a non-root user can't create/open the DB file there (SQLITE_CANTOPEN).
RUN mkdir -p /data
# Standalone output: self-contained server.js + traced node_modules (incl. better-sqlite3).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
