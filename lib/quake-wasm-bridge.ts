/**
 * Advanced WASM Quake 3 Client Integration Example
 * Shows how to connect your WASM Quake 3 module to the relay server
 */

import { QuakeRelayClient } from '@/lib/quake-ws-client';

/**
 * WASM Module Type Definition
 * Adjust based on your actual WASM Quake 3 module
 */
interface WasmQuake3Module {
  Instance: {
    exports: {
      // Network functions
      handleServerPacket: (packet: Uint8Array) => void;
      sendClientPacket: (bufferPtr: number, length: number) => void;
      
      // Connection state
      setRelayConnected: (connected: number) => void;
      isNetworkReady: () => number;
      
      // Game state
      getClientState: () => number;
      setPlayerName: (namePtr: number, nameLen: number) => void;
      getGameState: () => number;
      
      // Memory access (for passing data)
      memory: WebAssembly.Memory;
      malloc: (size: number) => number;
      free: (ptr: number) => void;
    };
  };
}

/**
 * Quake 3 WASM Relay Client Bridge
 * Bridges between WASM module and relay server
 */
export class QuakeWasmRelayBridge {
  private wasmModule: WasmQuake3Module;
  private relayClient: QuakeRelayClient;
  private isInitialized: boolean = false;
  private packet Buffer: Uint8Array | null = null;

  constructor(
    wasmModule: WasmQuake3Module,
    relayServerUrl: string
  ) {
    this.wasmModule = wasmModule;
    this.relayClient = new QuakeRelayClient({
      serverUrl: relayServerUrl,
      autoReconnect: true,
      debug: true,
    });

    this.setupEventHandlers();
  }

  /**
   * Initialize the bridge
   */
  public async initialize(playerName: string): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log('[wasm-relay] Initializing bridge...');

      // Connect to relay server
      const clientId = await this.relayClient.connect();
      console.log('[wasm-relay] Connected with client ID:', clientId);

      // Set player name in WASM module
      this.setPlayerName(playerName);

      // Notify WASM that network is ready
      this.wasmModule.Instance.exports.setRelayConnected(1);

      this.isInitialized = true;
      console.log('[wasm-relay] Bridge initialized');
    } catch (error) {
      console.error('[wasm-relay] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Set up relay client event handlers
   */
  private setupEventHandlers(): void {
    // Handle incoming packets from relay server
    this.relayClient.on('data', (packet: Uint8Array) => {
      console.log('[wasm-relay] Received packet:', packet.length, 'bytes');
      this.handleServerPacket(packet);
    });

    // Handle connection
    this.relayClient.on('connect', (clientId: string) => {
      console.log('[wasm-relay] Relay connected:', clientId);
    });

    // Handle disconnection
    this.relayClient.on('disconnect', (reason: string) => {
      console.log('[wasm-relay] Relay disconnected:', reason);
      this.wasmModule.Instance.exports.setRelayConnected(0);
    });

    // Handle errors
    this.relayClient.on('error', (error: string) => {
      console.error('[wasm-relay] Relay error:', error);
    });
  }

  /**
   * Handle incoming packet from relay server
   * Pass to WASM module for processing
   */
  private handleServerPacket(packet: Uint8Array): void {
    try {
      // Allocate memory in WASM for packet
      const bufferPtr = this.wasmModule.Instance.exports.malloc(packet.length);

      if (bufferPtr === 0) {
        console.error('[wasm-relay] Failed to allocate WASM memory');
        return;
      }

      // Copy packet data into WASM memory
      const wasmMemory = new Uint8Array(this.wasmModule.Instance.exports.memory.buffer);
      wasmMemory.set(packet, bufferPtr);

      // Call WASM function to handle the packet
      this.wasmModule.Instance.exports.handleServerPacket(packet);

      // Free allocated memory
      this.wasmModule.Instance.exports.free(bufferPtr);
    } catch (error) {
      console.error('[wasm-relay] Error handling server packet:', error);
    }
  }

  /**
   * Send a packet from WASM client to relay server
   * Called by WASM module via exported function
   */
  public sendPacket(packet: Uint8Array): void {
    if (!this.isInitialized || !this.relayClient.isConnected()) {
      console.warn('[wasm-relay] Not connected, dropping packet');
      return;
    }

    try {
      this.relayClient.sendPacket(packet);
    } catch (error) {
      console.error('[wasm-relay] Error sending packet:', error);
    }
  }

  /**
   * Set player name in WASM module
   */
  private setPlayerName(name: string): void {
    try {
      const wasmMemory = new Uint8Array(this.wasmModule.Instance.exports.memory.buffer);
      const nameBuffer = new TextEncoder().encode(name);

      // Allocate memory for name
      const namePtr = this.wasmModule.Instance.exports.malloc(nameBuffer.length);
      wasmMemory.set(nameBuffer, namePtr);

      // Call WASM function
      this.wasmModule.Instance.exports.setPlayerName(namePtr, nameBuffer.length);

      // Free memory
      this.wasmModule.Instance.exports.free(namePtr);

      console.log('[wasm-relay] Player name set:', name);
    } catch (error) {
      console.error('[wasm-relay] Error setting player name:', error);
    }
  }

  /**
   * Get current relay connection status
   */
  public isConnected(): boolean {
    return this.relayClient.isConnected();
  }

  /**
   * Disconnect from relay
   */
  public disconnect(): void {
    this.relayClient.disconnect();
    this.wasmModule.Instance.exports.setRelayConnected(0);
    this.isInitialized = false;
  }

  /**
   * Get relay stats
   */
  public getStats() {
    return {
      connected: this.isConnected(),
      clientId: this.relayClient.getClientId(),
    };
  }
}

/**
 * Example usage in a React component
 */
export function useQuakeWasmRelay(
  wasmModule: WasmQuake3Module | null,
  relayServerUrl: string
) {
  const [bridge, setBridge] = React.useState<QuakeWasmRelayBridge | null>(null);
  const [connected, setConnected] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!wasmModule) return;

    const newBridge = new QuakeWasmRelayBridge(wasmModule, relayServerUrl);
    setBridge(newBridge);

    return () => {
      newBridge.disconnect();
    };
  }, [wasmModule, relayServerUrl]);

  const initialize = React.useCallback(
    async (playerName: string) => {
      if (!bridge) return;

      try {
        await bridge.initialize(playerName);
        setConnected(true);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize');
        setConnected(false);
      }
    },
    [bridge]
  );

  const sendPacket = React.useCallback(
    (packet: Uint8Array) => {
      if (!bridge) return;
      bridge.sendPacket(packet);
    },
    [bridge]
  );

  const disconnect = React.useCallback(() => {
    if (!bridge) return;
    bridge.disconnect();
    setConnected(false);
  }, [bridge]);

  return {
    bridge,
    connected,
    error,
    initialize,
    sendPacket,
    disconnect,
  };
}

// Export for use in components
export default QuakeWasmRelayBridge;
