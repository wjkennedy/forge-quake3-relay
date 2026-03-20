#!/usr/bin/env node

/**
 * Standalone Quake 3 Relay Server Entry Point
 * Run this with: node relay-server.js
 * Or: npx ts-node relay-server.ts
 *
 * Environment variables:
 * - RELAY_WS_PORT: WebSocket port (default: 8080)
 * - RELAY_HOST: Bind address (default: 0.0.0.0)
 * - GAME_SERVER_HOST: ioquake3 server address (default: localhost)
 * - GAME_SERVER_PORT: ioquake3 server port (default: 27960)
 * - MAX_CLIENTS: Max concurrent clients (default: 64)
 * - HEARTBEAT_INTERVAL: Heartbeat interval in ms (default: 30000)
 * - DEBUG: Enable debug logging (default: false)
 */

import { createRelayServer, Q3RelayServer } from './lib/relay-server';

let server: Q3RelayServer | null = null;

// Create and start relay server
try {
  server = createRelayServer();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[relay] Received SIGINT, shutting down...');
    if (server) {
      server.stop();
    }
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('[relay] Received SIGTERM, shutting down...');
    if (server) {
      server.stop();
    }
    process.exit(0);
  });

  // Periodic stats logging
  setInterval(() => {
    if (server) {
      const stats = server.getStats();
      console.log(`[relay] Stats: ${stats.connectedClients}/${stats.maxClients} clients | Sent: ${stats.totalBytesSent} bytes | Received: ${stats.totalBytesReceived} bytes`);
    }
  }, 60000);
} catch (error) {
  console.error('[relay] Failed to start relay server:', error);
  process.exit(1);
}
