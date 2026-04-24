# ── Stage 1: Build React client ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app/client
COPY client/package*.json ./
RUN npm install

COPY client/ ./
RUN npm run build
# Output lands in /app/client/dist (unless you configured outDir differently)

# ── Stage 2: Production server ────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Install only production backend deps
COPY package*.json ./
RUN npm install --omit=dev

# Copy backend source
COPY src/ ./src/

# Copy built React app from builder stage
# Adjust path based on where Vite actually outputs
COPY --from=builder /app/client/dist ./public/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/server.js"]
