# ==================================
# Stage 1: Builder
# ==================================
FROM node:20 AS builder
WORKDIR /app

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Configure npm
RUN npm config set registry https://registry.npmjs.org/

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci || npm install

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# ==================================
# Stage 2: Production
# ==================================
FROM node:20-slim

WORKDIR /app

# Install runtime dependencies (NOT alpine - slim is needed for native modules)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Configure npm
RUN npm config set registry https://registry.npmjs.org/

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production || npm install --only=production

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist

# Create data and temp directories
RUN mkdir -p /app/data /app/temp

# Set environment
ENV NODE_ENV=production
EXPOSE 3000

# Start the application
CMD ["node", "dist/index.js"]
