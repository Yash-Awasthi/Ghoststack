# --- Build Stage ---
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json tsconfig.json ./
RUN npm ci

# Copy source files
COPY orchestration/ ./orchestration/
COPY runtime/ ./runtime/
COPY schemas/ ./schemas/
COPY specs/ ./specs/

# Compile TypeScript (output: dist/)
RUN npx tsc

# --- Production Stage ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy compiled output and schemas from builder
COPY --from=builder /app/dist/ ./dist/
COPY --from=builder /app/schemas/ ./schemas/
COPY --from=builder /app/specs/ ./specs/
COPY --from=builder /app/runtime/*.yaml ./runtime/

EXPOSE 8080
ENV GHOSTSTACK_API_PORT=8080
CMD ["node", "dist/runtime/server.js"]
