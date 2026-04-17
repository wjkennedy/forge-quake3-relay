/**
 * Quake 3 WASM Client WebSocket Integration
 * Provides a simple interface for WASM Quake 3 clients to connect to the relay server
 */

/**
 * Callback types for relay client events
 */
export type OnConnectCallback = (clientId: string) => void;
export type OnDisconnectCallback = (reason: string) => void;
export type OnDataCallback = (data: Uint8Array) => void;
export type OnErrorCallback = (error: string) => void;

/**
 * Configuration for relay client
 */
export interface QuakeRelayClientConfig {
  serverUrl: string; // ws://relay-server:8080
  autoReconnect: boolean;
  reconnectInterval: number;
  reconnectMaxAttempts: number;
  debug: boolean;
  heartbeatTimeout: number;
}

/**
 * Quake 3 WASM Client
 * Bridges between browser WASM client and relay server
 */
export class QuakeRelayClient {
  private ws: WebSocket | null = null;
  private config: QuakeRelayClientConfig;
  private clientId: string | null = null;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastHeartbeat: number = 0;

  // Event callbacks
  private onConnect: OnConnectCallback | null = null;
  private onDisconnect: OnDisconnectCallback | null = null;
  private onData: OnDataCallback | null = null;
  private onError: OnErrorCallback | null = null;

  constructor(config: Partial<QuakeRelayClientConfig> = {}) {
    this.config = {
      serverUrl: config.serverUrl || 'ws://localhost:8080',
      autoReconnect: config.autoReconnect !== false,
      reconnectInterval: config.reconnectInterval || 3000,
      reconnectMaxAttempts: config.reconnectMaxAttempts || 10,
      debug: config.debug || false,
      heartbeatTimeout: config.heartbeatTimeout || 60000,
    };
  }

  /**
   * Register event callbacks
   */
  public on(
    event: 'connect' | 'disconnect' | 'data' | 'error',
    callback: OnConnectCallback | OnDisconnectCallback | OnDataCallback | OnErrorCallback
  ): void {
    if (event === 'connect') {
      this.onConnect = callback as OnConnectCallback;
    } else if (event === 'disconnect') {
      this.onDisconnect = callback as OnDisconnectCallback;
    } else if (event === 'data') {
      this.onData = callback as OnDataCallback;
    } else if (event === 'error') {
      this.onError = callback as OnErrorCallback;
    }
  }

  /**
   * Connect to the relay server
   */
  public connect(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve(this.clientId || '');
        return;
      }

      try {
        this.log('Connecting to relay server:', this.config.serverUrl);

        this.ws = new WebSocket(this.config.serverUrl);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
          this.log('WebSocket connected');
          this.reconnectAttempts = 0;
          const cid = Math.random().toString(36).substring(2);
          this.clientId = cid;
          this.startHeartbeat();
          this.emit('connect', cid);
          resolve(cid);
        };

        this.ws.onmessage = (event: MessageEvent) => {
          this.handleMessage(event.data as string);
        };

        this.ws.onerror = (event: Event) => {
          const errorMsg = 'WebSocket error';
          this.log(errorMsg, event);
          this.emit('error', errorMsg);
          reject(new Error(errorMsg));
        };

        this.ws.onclose = () => {
          this.log('WebSocket disconnected');
          this.clientId = null;
          this.stopHeartbeat();

          this.emit('disconnect', 'Connection closed');

          if (this.config.autoReconnect && this.reconnectAttempts < this.config.reconnectMaxAttempts) {
            this.scheduleReconnect();
          }
        };

      } catch (error) {
        const errorMsg = `Failed to connect: ${error}`;
        this.log(errorMsg);
        this.emit('error', errorMsg);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the relay server
   */
  public disconnect(): void {
    this.log('Disconnecting from relay server');

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.clientId = null;
  }

  /**
   * Send raw Quake 3 packet data to the server
   */
  public sendPacket(data: Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('Warning: WebSocket not connected, queueing message');
      return;
    }

    try {
      this.ws.send(data);
    } catch (error) {
      this.log('Error sending packet:', error);
      this.emit('error', `Failed to send packet: ${error}`);
    }
  }

  /**
   * Handle incoming message from relay server
   */
  private handleMessage(data: string | ArrayBuffer | Blob): void {
    try {
      this.lastHeartbeat = Date.now();

      if (typeof data === 'string') {
        this.emit('data', new TextEncoder().encode(data));
        return;
      }

      if (data instanceof ArrayBuffer) {
        this.emit('data', new Uint8Array(data));
        return;
      }

      data.arrayBuffer()
        .then((buffer) => this.emit('data', new Uint8Array(buffer)))
        .catch((error) => this.emit('error', `Failed to read packet: ${error}`));
    } catch (error) {
      this.log('Error handling message:', error);
    }
  }

  /**
   * Start heartbeat to detect connection loss
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastHeartbeat = Date.now();

    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();

      if (now - this.lastHeartbeat > this.config.heartbeatTimeout) {
        this.log('Heartbeat timeout, reconnecting...');
        this.disconnect();
        if (this.config.autoReconnect) {
          this.connect();
        }
      }
    }, this.config.heartbeatTimeout / 2);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.config.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1),
      30000 // Max 30 seconds
    );

    this.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Emit event to callback
   */
  private emit(
    event: 'connect' | 'disconnect' | 'data' | 'error',
    data: string | Uint8Array
  ): void {
    if (event === 'connect' && this.onConnect) {
      this.onConnect(data as string);
    } else if (event === 'disconnect' && this.onDisconnect) {
      this.onDisconnect(data as string);
    } else if (event === 'data' && this.onData) {
      this.onData(data as Uint8Array);
    } else if (event === 'error' && this.onError) {
      this.onError(data as string);
    }
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.clientId !== null;
  }

  /**
   * Get current client ID
   */
  public getClientId(): string | null {
    return this.clientId;
  }

  /**
   * Log debug message
   */
  private log(...args: any[]): void {
    if (this.config.debug) {
      console.log('[quake-relay-client]', ...args);
    }
  }
}

/**
 * Create relay client with default configuration
 */
export function createQuakeRelayClient(serverUrl: string): QuakeRelayClient {
  return new QuakeRelayClient({ serverUrl, debug: true });
}

export default QuakeRelayClient;
