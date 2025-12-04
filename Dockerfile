# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create logs directory
RUN mkdir -p logs

# Expose port if needed (MCP servers typically use stdio, but good to have)
EXPOSE 3000

# Set default environment variables (can be overridden)
ENV NODE_ENV=production \
    LOG_LEVEL=info \
    ENABLE_FILE_LOGGING=true \
    ENABLE_CONSOLE_LOGGING=false

# Run the application
CMD ["node", "hana-mcp-server.js"]
