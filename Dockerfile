# Backend Docker image for Fly.io
FROM node:20-alpine

WORKDIR /app

# Copy backend package files and install ALL deps (need TypeScript for build)
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

# Copy source and build
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npx tsc --outDir dist

# Remove dev deps after build to reduce image size
RUN npm prune --production

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
