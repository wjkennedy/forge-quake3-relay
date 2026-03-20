# Dockerfile for Quake 3 WebSocket Relay Server

FROM node:22-alpine

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY lib ./lib
COPY scripts ./scripts

# Expose WebSocket port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const ws = new (require('ws')); const client = new ws('ws://localhost:8080'); client.on('open', () => process.exit(0)); setTimeout(() => process.exit(1), 5000);" || exit 1

# Start relay server
CMD ["node", "--loader", "ts-node/esm", "scripts/relay-server.ts"]
