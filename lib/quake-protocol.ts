/**
 * Quake 3 Protocol Utilities
 * Handles translation between WebSocket JSON format and Quake 3 UDP binary protocol
 */

// Quake 3 protocol constants
export const Q3_PACKET_HEADER = 0xffffffff; // 4 bytes of 0xFF
export const Q3_PACKET_HEADER_SIZE = 4;

// Quake 3 command types
export enum Q3CommandType {
  CLIENTCOMMAND = 1,
  SERVERCOMMAND = 2,
  GAME_STATE = 3,
  SNAPSHOT = 4,
  DOWNLOAD = 5,
  PRINT = 6,
  DISCONNECT = 7,
}

/**
 * Message format for WebSocket communication
 * Wraps raw Quake 3 protocol data in JSON for easier transport
 */
export interface RelayMessage {
  type: 'data' | 'connect' | 'disconnect' | 'ping' | 'pong' | 'error';
  data?: string; // Base64 encoded binary data
  clientId?: string;
  timestamp?: number;
  error?: string;
}

/**
 * Encode binary data to base64 string for JSON transport
 */
export function encodeToBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}

/**
 * Decode base64 string back to binary data
 */
export function decodeFromBase64(base64Str: string): Buffer {
  return Buffer.from(base64Str, 'base64');
}

/**
 * Wrap raw Quake 3 UDP packet data in a relay message
 */
export function wrapQ3Packet(
  data: Buffer,
  clientId: string,
  type: 'data' | 'disconnect' = 'data'
): RelayMessage {
  return {
    type,
    data: encodeToBase64(data),
    clientId,
    timestamp: Date.now(),
  };
}

/**
 * Unwrap relay message to get raw Quake 3 packet data
 */
export function unwrapQ3Packet(message: RelayMessage): Buffer | null {
  if (!message.data || !message.clientId) {
    return null;
  }
  try {
    return decodeFromBase64(message.data);
  } catch (e) {
    console.error('[relay] Failed to decode base64 data:', e);
    return null;
  }
}

/**
 * Serialize relay message to JSON string
 */
export function serializeRelayMessage(message: RelayMessage): string {
  return JSON.stringify(message);
}

/**
 * Deserialize relay message from JSON string
 */
export function deserializeRelayMessage(json: string): RelayMessage | null {
  try {
    return JSON.parse(json) as RelayMessage;
  } catch (e) {
    console.error('[relay] Failed to parse relay message:', e);
    return null;
  }
}

/**
 * Check if a buffer starts with Q3 packet header
 */
export function isValidQ3Packet(buffer: Buffer): boolean {
  if (buffer.length < Q3_PACKET_HEADER_SIZE) {
    return false;
  }

  // Check for 0xFFFFFFFF header (4 bytes of 0xFF in little-endian or big-endian)
  const header = buffer.readUInt32BE(0);
  return header === Q3_PACKET_HEADER;
}

/**
 * Extract command sequence number from Q3 packet
 * Sequence number is typically after the 4-byte header
 */
export function getQ3PacketSequence(buffer: Buffer): number {
  if (buffer.length < 8) {
    return 0;
  }
  return buffer.readUInt32LE(4);
}

/**
 * Create a simple acknowledgment packet
 */
export function createAckPacket(sequence: number): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(0, Q3_PACKET_HEADER);
  buffer.writeUInt32LE(4, sequence);
  return buffer;
}

/**
 * Parse Quake 3 command from packet
 * This is a simplified parser - actual Q3 protocol is more complex
 */
export function parseQ3Command(buffer: Buffer): { command: string; args: string } {
  if (buffer.length < 9) {
    return { command: 'unknown', args: '' };
  }

  // Skip header (4 bytes) and sequence (4 bytes)
  const commandByte = buffer[8];
  const commandStr = String.fromCharCode(commandByte);

  // Rest is command data
  const argsBuffer = buffer.slice(9);
  const args = argsBuffer.toString('utf8', 0, Math.min(128, argsBuffer.length));

  return { command: commandStr, args };
}

/**
 * Log packet information for debugging
 */
export function logPacketInfo(buffer: Buffer, source: 'ws' | 'udp', clientId?: string): void {
  const isValid = isValidQ3Packet(buffer);
  const sequence = isValid ? getQ3PacketSequence(buffer) : 0;
  const size = buffer.length;

  console.log(
    `[relay] ${source} packet from ${clientId || 'unknown'}: ` +
    `size=${size} bytes, valid=${isValid}, sequence=${sequence}`
  );
}
