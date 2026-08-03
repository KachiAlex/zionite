# Zionite Backend — VPS Docker image (Node.js + FFmpeg)
FROM node:20-bookworm-slim

# Install FFmpeg and necessary system packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend package files and install dependencies
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci || npm install

# Copy backend source and build
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npx tsc --outDir dist
COPY backend/src/migrations ./dist/migrations

# Remove dev deps after build to reduce image size
RUN npm prune --production

# Create HLS output directory
RUN mkdir -p /tmp/hls

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production
ENV HLS_DIR=/tmp/hls

CMD ["node", "dist/server.js"]
