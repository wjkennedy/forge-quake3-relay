'use client';

import { useEffect, useState, useRef } from 'react';
import { useQuakeRelay } from '@/hooks/useQuakeRelay';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/**
 * Example Quake 3 Game Client Component
 * Demonstrates how to use the relay client in a Forge app
 */
export function QuakeGameClient() {
  const [mounted, setMounted] = useState(false);
  const relayServerUrl = process.env.NEXT_PUBLIC_RELAY_SERVER_URL || 'ws://localhost:8080';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<{
    isRunning: boolean;
    playerName: string;
    fraglimit: number;
  }>({
    isRunning: false,
    playerName: '',
    fraglimit: 0,
  });

  // Mark component as mounted (client-side only)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize relay client
  const { connected, clientId, error, connecting, sendPacket, on, isConnected, stats } =
    useQuakeRelay(relayServerUrl, {
      debug: true,
      autoReconnect: true,
    });

  // Generate player name on mount (after hydration)
  useEffect(() => {
    if (mounted) {
      setGameState((prev) => ({
        ...prev,
        playerName: `Player_${Math.random().toString(36).substring(7)}`,
      }));
    }
  }, [mounted]);

  // Set up event handlers
  useEffect(() => {
    // Handle incoming game packets
    on('data', (packet: Uint8Array) => {
      console.log('[game] Received packet from server:', packet.length, 'bytes');
      // TODO: Pass packet to WASM Quake 3 client
      // wasmModule.handleServerPacket(packet);
    });

    // Handle connection
    on('connect', (cid: string) => {
      console.log('[game] Connected with client ID:', cid);
      setGameState((prev) => ({ ...prev, isRunning: true }));
    });

    // Handle disconnection
    on('disconnect', (reason: string) => {
      console.log('[game] Disconnected:', reason);
      setGameState((prev) => ({ ...prev, isRunning: false }));
    });

    // Handle errors
    on('error', (errorMsg: string) => {
      console.error('[game] Relay error:', errorMsg);
    });
  }, [on]);

  // Simulate sending a game packet
  const handleSendTestPacket = () => {
    if (!isConnected()) {
      console.warn('Not connected to relay');
      return;
    }

    // Create a dummy Quake 3 packet for testing
    // Real packets come from the WASM client
    const packet = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x01]);
    sendPacket(packet);
    console.log('[game] Sent test packet');
  };

  const handleStartGame = () => {
    if (!isConnected()) {
      console.warn('Connect to relay first');
      return;
    }

    setGameState((prev) => ({ ...prev, isRunning: true }));
    console.log('[game] Game started');
  };

  const handleStopGame = () => {
    setGameState((prev) => ({ ...prev, isRunning: false }));
    console.log('[game] Game stopped');
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-4">
      {!mounted ? (
        <div className="flex items-center justify-center p-8">
          <p className="text-gray-600">Loading...</p>
        </div>
      ) : (
        <>
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Quake 3 Relay Client</h1>
        <p className="text-gray-600">WebSocket relay for multiplayer Quake 3</p>
      </div>

      {/* Connection Status */}
      <Card className="p-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Connection Status:</span>
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  connected ? 'bg-green-500' : error ? 'bg-red-500' : 'bg-yellow-500'
                }`}
              />
              <span>
                {connecting ? 'Connecting...' : connected ? 'Connected' : error ? 'Error' : 'Disconnected'}
              </span>
            </div>
          </div>

          {clientId && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Client ID:</span>
              <code className="bg-gray-100 px-2 py-1 rounded">{clientId}</code>
            </div>
          )}

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
              {error}
            </div>
          )}
        </div>
      </Card>

      {/* Player Info */}
      <Card className="p-4">
        <div className="space-y-2">
          <h2 className="font-semibold">Player Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-gray-600">Player Name:</span>
              <p className="font-mono">{gameState.playerName || 'Loading...'}</p>
            </div>
            <div>
              <span className="text-gray-600">Status:</span>
              <p>{gameState.isRunning ? 'In Game' : 'Lobby'}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Game Canvas (placeholder) */}
      <Card className="p-4">
        <div className="space-y-2">
          <h2 className="font-semibold">Game Canvas</h2>
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            className="w-full border border-gray-300 bg-black rounded"
          />
          <p className="text-sm text-gray-600">
            Canvas for WASM Quake 3 client (not yet rendering)
          </p>
        </div>
      </Card>

      {/* Statistics */}
      <Card className="p-4">
        <div className="space-y-2">
          <h2 className="font-semibold">Network Statistics</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Packets Sent:</span>
              <p className="font-mono">{stats.packetsSent}</p>
            </div>
            <div>
              <span className="text-gray-600">Packets Received:</span>
              <p className="font-mono">{stats.packetsReceived}</p>
            </div>
            <div>
              <span className="text-gray-600">Bytes Sent:</span>
              <p className="font-mono">{(stats.bytesSent / 1024).toFixed(2)} KB</p>
            </div>
            <div>
              <span className="text-gray-600">Bytes Received:</span>
              <p className="font-mono">{(stats.bytesReceived / 1024).toFixed(2)} KB</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Controls */}
      <Card className="p-4">
        <div className="space-y-2">
          <h2 className="font-semibold">Controls</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleStartGame}
              disabled={!connected || gameState.isRunning}
              variant="default"
            >
              Start Game
            </Button>
            <Button
              onClick={handleStopGame}
              disabled={!gameState.isRunning}
              variant="secondary"
            >
              Stop Game
            </Button>
            <Button
              onClick={handleSendTestPacket}
              disabled={!connected}
              variant="outline"
            >
              Send Test Packet
            </Button>
          </div>
        </div>
      </Card>

      {/* Debug Info */}
      <Card className="p-4">
        <div className="space-y-2">
          <h2 className="font-semibold">Debug Information</h2>
          <div className="bg-gray-100 p-3 rounded text-sm font-mono text-gray-800 space-y-1">
            <p>Relay URL: {relayServerUrl}</p>
            <p>Connected: {connected ? 'true' : 'false'}</p>
            <p>Client ID: {clientId || 'null'}</p>
            <p>Game Running: {gameState.isRunning ? 'true' : 'false'}</p>
            <p>Error: {error || 'null'}</p>
          </div>
        </div>
      </Card>

      {/* Integration Instructions */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="space-y-2">
          <h2 className="font-semibold text-blue-900">Next Steps</h2>
          <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
            <li>Start relay server: <code className="bg-white px-1 rounded">docker-compose up</code></li>
            <li>Integrate WASM Quake 3 client with relay connection</li>
            <li>Load WASM module in canvas element</li>
            <li>Wire packet sending/receiving to relay client</li>
            <li>Test multiplayer with multiple browser instances</li>
          </ol>
        </div>
      </Card>
        </>
      )}
    </div>
  );
}

export default QuakeGameClient;
