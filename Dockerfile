FROM oven/bun:1.3.11-alpine

WORKDIR /app

COPY package.json bun.lock* ./
COPY apps/patch/package.json ./apps/patch/package.json
COPY docs/package.json ./docs/package.json
RUN bun install --frozen-lockfile --production

COPY apps/patch/src ./apps/patch/src
COPY apps/patch/feed-sources.json ./apps/patch/feed-sources.json

ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATA_DIR=/app/data

RUN mkdir -p /app/data

EXPOSE 3000
WORKDIR /app/apps/patch
CMD ["bun", "src/server.ts"]
