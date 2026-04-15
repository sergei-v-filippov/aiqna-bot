# ── Stage 1: build ───────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
 
COPY package*.json ./
RUN npm ci
 
COPY . .
RUN npm run build      # tsc → dist/
 
# ── Stage 2: production image ────────────────────────────────────────────
# Start from a clean image — no TypeScript compiler, no dev dependencies.
FROM node:20-alpine AS production
WORKDIR /app
 
COPY package*.json ./
RUN npm ci --only=production
 
COPY --from=builder /app/dist ./dist
 
# Run as non-root for security
USER node
 
CMD ["node", "dist/bot.js"]
