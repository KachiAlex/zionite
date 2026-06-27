# Backend Docker image for Fly.io
FROM node:20

WORKDIR /app

# Copy root package files (has all deps including backend's missing ones)
COPY package.json package-lock.json ./
# Ensure ESM is enabled — backend code uses ESM imports
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json'));p.type='module';fs.writeFileSync('package.json',JSON.stringify(p,null,2))"
RUN npm ci

# Copy backend source and build
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npx tsc --outDir dist --strict false

# Remove dev deps after build to reduce image size
RUN npm prune --production

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
