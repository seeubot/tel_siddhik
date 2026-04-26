# ── Stage 1: Build React client ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app/client
COPY client/package*.json ./
RUN npm install

COPY client/ ./
RUN npm run build

# ── Stage 2: Production server ────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Install only production backend deps
COPY package*.json ./
RUN npm install --omit=dev

# Copy backend source
COPY src/ ./src/

# Copy built React app from builder stage (this has admin.html overwritten)
COPY --from=builder /app/public ./public/

# NOW restore admin.html from the original repo
# The file is at repo-root/public/admin.html
COPY public/admin.html ./public/admin.html

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/server.js"]
