# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Set default environment variables
ENV NODE_ENV=production \
    LOG_LEVEL=info

# Run the application
CMD ["npm", "start"]
