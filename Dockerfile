# Backend Docker image for Fly.io
FROM node:20

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend package files (has correct @types dev deps)
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

# Copy backend source and build
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npx tsc --outDir dist
COPY backend/src/migrations ./dist/migrations

# Remove dev deps after build to reduce image size
RUN npm prune --production

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
