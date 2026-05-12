FROM oven/bun:1.3.11-alpine

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
COPY feed-sources.json ./

ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATA_DIR=/app/data

RUN mkdir -p /app/data

EXPOSE 3000
CMD ["bun", "src/server.ts"]
