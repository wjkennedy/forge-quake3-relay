/**
 * React Hook for Quake 3 Relay Client
 * Integrates the relay client with React components
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { QuakeRelayClient, QuakeRelayClientConfig } from '@/lib/quake-ws-client';

/**
 * Hook state
 */
interface UseQuakeRelayState {
  connected: boolean;
  clientId: string | null;
  error: string | null;
  connecting: boolean;
  stats: {
    packetsReceived: number;
    packetsSent: number;
    bytesReceived: number;
    bytesSent: number;
  };
}

/**
 * useQuakeRelay Hook
 * Manages relay client connection and provides API for sending/receiving packets
 *
 * @example
 * const { connected, sendPacket, on } = useQuakeRelay('ws://localhost:8080');
 *
 * useEffect(() => {
 *   on('data', (packet) => {
 *     // Handle incoming packet from game server
 *   });
 * }, []);
 */
export function useQuakeRelay(
  serverUrl: string,
  options: Partial<QuakeRelayClientConfig> = {}
) {
  const clientRef = useRef<QuakeRelayClient | null>(null);
  const [state, setState] = useState<UseQuakeRelayState>({
    connected: false,
    clientId: null,
    error: null,
    connecting: false,
    stats: {
      packetsReceived: 0,
      packetsSent: 0,
      bytesReceived: 0,
      bytesSent: 0,
    },
  });

  // Initialize client on first render
  useEffect(() => {
    if (!clientRef.current) {
      clientRef.current = new QuakeRelayClient({
        serverUrl,
        autoReconnect: true,
        debug: options.debug,
        ...options,
      });

      // Set up event handlers
      clientRef.current.on('connect', (clientId: string) => {
        setState((prev) => ({
          ...prev,
          connected: true,
          clientId,
          connecting: false,
          error: null,
        }));
      });

      clientRef.current.on('disconnect', (reason: string) => {
        setState((prev) => ({
          ...prev,
          connected: false,
          clientId: null,
          error: `Disconnected: ${reason}`,
        }));
      });

      clientRef.current.on('error', (error: string) => {
        setState((prev) => ({
          ...prev,
          error,
          connecting: false,
        }));
      });
    }

    return () => {
      // Clean up on unmount
      if (clientRef.current) {
        clientRef.current.disconnect();
      }
    };
  }, [serverUrl]);

  // Connect to relay server
  const connect = useCallback(async () => {
    if (!clientRef.current) return;

    if (clientRef.current.isConnected()) {
      return;
    }

    setState((prev) => ({ ...prev, connecting: true, error: null }));

    try {
      await clientRef.current.connect();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        connecting: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      }));
    }
  }, []);

  // Disconnect from relay server
  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      setState((prev) => ({
        ...prev,
        connected: false,
        clientId: null,
      }));
    }
  }, []);

  // Send packet to game server
  const sendPacket = useCallback((data: Uint8Array) => {
    if (!clientRef.current) {
      console.error('Relay client not initialized');
      return false;
    }

    if (!clientRef.current.isConnected()) {
      console.warn('Not connected to relay server');
      return false;
    }

    try {
      clientRef.current.sendPacket(data);
      setState((prev) => ({
        ...prev,
        stats: {
          ...prev.stats,
          packetsSent: prev.stats.packetsSent + 1,
          bytesSent: prev.stats.bytesSent + data.length,
        },
      }));
      return true;
    } catch (error) {
      console.error('Failed to send packet:', error);
      return false;
    }
  }, []);

  // Register event handler
  const on = useCallback(
    (event: 'data' | 'connect' | 'disconnect' | 'error', callback: (data: any) => void) => {
      if (!clientRef.current) return;

      if (event === 'data') {
        clientRef.current.on('data', (packet: Uint8Array) => {
          setState((prev) => ({
            ...prev,
            stats: {
              ...prev.stats,
              packetsReceived: prev.stats.packetsReceived + 1,
              bytesReceived: prev.stats.bytesReceived + packet.length,
            },
          }));
          callback(packet);
        });
      } else {
        clientRef.current.on(event as any, callback);
      }
    },
    []
  );

  return {
    // State
    connected: state.connected,
    clientId: state.clientId,
    error: state.error,
    connecting: state.connecting,
    stats: state.stats,

    // Methods
    connect,
    disconnect,
    sendPacket,
    on,
    isConnected: () => clientRef.current?.isConnected() ?? false,
  };
}

export default useQuakeRelay;
