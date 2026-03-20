/**
 * Quake 3 WebSocket-to-UDP Relay Server
 * Bridges WebSocket connections from browser clients to ioquake3 UDP servers
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createSocket, Socket } from 'dgram';
import { v4 as uuidv4 } from 'crypto';
import {
  RelayMessage,
  wrapQ3Packet,
  unwrapQ3Packet,
  deserializeRelayMessage,
  serializeRelayMessage,
  logPacketInfo,
} from './quake-protocol';

/**
 * Configuration from environment variables
 */
export interface RelayConfig {
  wsPort: number;
  wsHost: string;
  gameServerHost: string;
  gameServerPort: number;
  maxClients: number;
  heartbeatInterval: number;
  debug: boolean;
}

/**
 * Get configuration from environment variables
 */
export function getRelayConfig(): RelayConfig {
  return {
    wsPort: parseInt(process.env.RELAY_WS_PORT || '8080', 10),
    wsHost: process.env.RELAY_HOST || '0.0.0.0',
    gameServerHost: process.env.GAME_SERVER_HOST || 'localhost',
    gameServerPort: parseInt(process.env.GAME_SERVER_PORT || '27960', 10),
    maxClients: parseInt(process.env.MAX_CLIENTS || '64', 10),
    heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '30000', 10),
    debug: process.env.DEBUG === 'true',
  };
}

/**
 * Client connection state
 */
interface RelayClient {
  id: string;
  ws: WebSocket;
  udpSocket: Socket;
  clientAddr: string | null;
  clientPort: number | null;
  lastActivity: number;
  bytesSent: number;
  bytesReceived: number;
}

/**
 * Quake 3 Relay Server
 */
export class Q3RelayServer {
  private wss: WebSocketServer;
  private config: RelayConfig;
  private clients: Map<string, RelayClient> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(config: RelayConfig) {
    this.config = config;
    this.wss = new WebSocketServer({ port: config.wsPort, host: config.wsHost });
    this.setupWebSocketServer();
    this.startHeartbeat();
  }

  /**
   * Set up WebSocket server event handlers
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = uuidv4().substring(0, 8);

      if (this.clients.size >= this.config.maxClients) {
        console.warn(`[relay] Max clients (${this.config.maxClients}) reached, rejecting connection`);
        ws.close(1008, 'Server at capacity');
        return;
      }

      const udpSocket = createSocket('udp4');
      const client: RelayClient = {
        id: clientId,
        ws,
        udpSocket,
        clientAddr: null,
        clientPort: null,
        lastActivity: Date.now(),
        bytesSent: 0,
        bytesReceived: 0,
      };

      this.clients.set(clientId, client);
      console.log(`[relay] Client connected: ${clientId} (total: ${this.clients.size})`);

      // Set up WebSocket handlers
      ws.on('message', (data: Buffer) => this.handleWebSocketMessage(client, data));
      ws.on('close', () => this.handleClientDisconnect(clientId));
      ws.on('error', (error: Error) => this.handleWebSocketError(clientId, error));

      // Set up UDP handlers
      udpSocket.on('message', (data: Buffer, rinfo) => {
        this.handleUDPMessage(client, data, rinfo);
      });

      udpSocket.on('error', (error: Error) => {
        console.error(`[relay] UDP socket error for client ${clientId}:`, error);
      });

      // Send connection acknowledgment
      const ackMessage: RelayMessage = {
        type: 'connect',
        clientId,
        timestamp: Date.now(),
      };
      ws.send(serializeRelayMessage(ackMessage));
    });

    this.wss.on('error', (error: Error) => {
      console.error('[relay] WebSocket server error:', error);
    });
  }

  /**
   * Handle incoming WebSocket message from client
   */
  private handleWebSocketMessage(client: RelayClient, data: Buffer): void {
    try {
      const message = deserializeRelayMessage(data.toString('utf8'));

      if (!message) {
        console.warn(`[relay] Failed to parse message from client ${client.id}`);
        return;
      }

      client.lastActivity = Date.now();

      if (message.type === 'ping') {
        // Respond to ping
        const pongMessage: RelayMessage = {
          type: 'pong',
          clientId: client.id,
          timestamp: Date.now(),
        };
        client.ws.send(serializeRelayMessage(pongMessage));
        return;
      }

      if (message.type === 'disconnect') {
        console.log(`[relay] Client ${client.id} requested disconnect`);
        client.ws.close(1000, 'Client disconnect');
        return;
      }

      if (message.type === 'data') {
        // Extract raw Q3 packet data
        const packetData = unwrapQ3Packet(message);

        if (!packetData) {
          console.warn(`[relay] Failed to unwrap packet from client ${client.id}`);
          return;
        }

        // If this is the first message, extract client address info if provided
        if (!client.clientAddr && message.clientId) {
          // clientAddr can be passed in the message for debugging
          client.clientAddr = 'browser';
        }

        client.bytesReceived += packetData.length;

        if (this.config.debug) {
          logPacketInfo(packetData, 'ws', client.id);
        }

        // Send to ioquake3 server
        client.udpSocket.send(
          packetData,
          0,
          packetData.length,
          this.config.gameServerPort,
          this.config.gameServerHost,
          (error: Error | null) => {
            if (error) {
              console.error(`[relay] Failed to send UDP packet from ${client.id}:`, error);
            }
          }
        );
      }
    } catch (error) {
      console.error(`[relay] Error handling WebSocket message from ${client.id}:`, error);
    }
  }

  /**
   * Handle incoming UDP message from game server
   */
  private handleUDPMessage(client: RelayClient, data: Buffer, rinfo: any): void {
    try {
      // Only process messages from the game server
      if (rinfo.address !== this.config.gameServerHost) {
        if (this.config.debug) {
          console.warn(`[relay] Ignoring UDP packet from unexpected address: ${rinfo.address}`);
        }
        return;
      }

      if (rinfo.port !== this.config.gameServerPort) {
        if (this.config.debug) {
          console.warn(`[relay] Ignoring UDP packet from unexpected port: ${rinfo.port}`);
        }
        return;
      }

      client.bytesSent += data.length;

      if (this.config.debug) {
        logPacketInfo(data, 'udp', client.id);
      }

      // Wrap in relay message and send over WebSocket
      const message = wrapQ3Packet(data, client.id, 'data');
      const serialized = serializeRelayMessage(message);

      // Check WebSocket state before sending
      if (client.ws.readyState === 1) { // OPEN
        client.ws.send(serialized);
      } else {
        console.warn(`[relay] WebSocket not open for client ${client.id}, dropping packet`);
      }
    } catch (error) {
      console.error(`[relay] Error handling UDP message for ${client.id}:`, error);
    }
  }

  /**
   * Handle WebSocket error
   */
  private handleWebSocketError(clientId: string, error: Error): void {
    console.error(`[relay] WebSocket error for client ${clientId}:`, error);
  }

  /**
   * Handle client disconnect
   */
  private handleClientDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);

    if (!client) {
      return;
    }

    // Clean up UDP socket
    client.udpSocket.close();
    this.clients.delete(clientId);

    console.log(
      `[relay] Client disconnected: ${clientId} ` +
      `(sent: ${client.bytesSent} bytes, received: ${client.bytesReceived} bytes, total: ${this.clients.size})`
    );
  }

  /**
   * Start heartbeat to keep connections alive and detect dead clients
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const timeout = 60000; // 60 seconds

      for (const [clientId, client] of this.clients) {
        // Send ping to keep connection alive
        if (client.ws.readyState === 1) { // OPEN
          const pingMessage: RelayMessage = {
            type: 'ping',
            clientId,
            timestamp: now,
          };
          client.ws.send(serializeRelayMessage(pingMessage));
        }

        // Check for dead connections
        if (now - client.lastActivity > timeout) {
          console.warn(`[relay] Client ${clientId} inactive for ${timeout}ms, disconnecting`);
          client.ws.close(1000, 'Inactivity timeout');
        }
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Get server statistics
   */
  public getStats(): {
    connectedClients: number;
    maxClients: number;
    totalBytesSent: number;
    totalBytesReceived: number;
  } {
    let totalBytesSent = 0;
    let totalBytesReceived = 0;

    for (const client of this.clients.values()) {
      totalBytesSent += client.bytesSent;
      totalBytesReceived += client.bytesReceived;
    }

    return {
      connectedClients: this.clients.size,
      maxClients: this.config.maxClients,
      totalBytesSent,
      totalBytesReceived,
    };
  }

  /**
   * Start the relay server
   */
  public start(): void {
    console.log(`[relay] Quake 3 Relay Server starting...`);
    console.log(`[relay] WebSocket: ws://${this.config.wsHost}:${this.config.wsPort}`);
    console.log(`[relay] Game Server: ${this.config.gameServerHost}:${this.config.gameServerPort}`);
    console.log(`[relay] Max Clients: ${this.config.maxClients}`);
    console.log(`[relay] Debug: ${this.config.debug}`);
  }

  /**
   * Stop the relay server
   */
  public stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    for (const client of this.clients.values()) {
      client.ws.close(1000, 'Server shutting down');
      client.udpSocket.close();
    }

    this.clients.clear();
    this.wss.close();
    console.log('[relay] Relay server stopped');
  }
}

/**
 * Create and start relay server
 */
export function createRelayServer(): Q3RelayServer {
  const config = getRelayConfig();
  const server = new Q3RelayServer(config);
  server.start();
  return server;
}

// Export for Node.js require
export default Q3RelayServer;
