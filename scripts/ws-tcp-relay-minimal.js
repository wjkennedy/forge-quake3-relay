// Minimal WebSocket ↔ TCP relay (RDP-ready)
// Each WebSocket connection maps 1:1 to a TCP socket.
import net from 'node:net';
import http from 'node:http';
import { WebSocketServer } from 'ws';

const TARGET_HOST = process.env.TARGET_HOST || '127.0.0.1';
const TARGET_PORT = Number(process.env.TARGET_PORT || 3389); // RDP default
const PROXY_PORT = Number(process.env.PROXY_PORT || 8080);

// Optional tuning
const WS_BACKPRESSURE_THRESHOLD = Number(process.env.WS_BACKPRESSURE_THRESHOLD || 1 << 20); // 1MB

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

const httpServer = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/healthz') {
    sendJson(res, 200, { ok: true });
    return;
  }
  sendJson(res, 404, { error: 'Not found' });
});

const wss = new WebSocketServer({ server: httpServer });

httpServer.listen(PROXY_PORT, () => {
  console.log(`WS↔TCP relay listening on ws://0.0.0.0:${PROXY_PORT}/`);
  console.log(`Default TCP target: ${TARGET_HOST}:${TARGET_PORT}`);
});

wss.on('connection', ws => {
  const socket = new net.Socket();
  let closed = false;

  const closeBoth = () => {
    if (closed) return;
    closed = true;
    try { socket.destroy(); } catch {}
    try { ws.close(); } catch {}
  };

  socket.setNoDelay(true);
  socket.connect({ host: TARGET_HOST, port: TARGET_PORT }, () => {
    // Ready
  });

  // TCP → WS
  socket.on('data', chunk => {
    // Backpressure: if WS buffer is too large, pause TCP reads until drain
    if (ws.bufferedAmount > WS_BACKPRESSURE_THRESHOLD) {
      socket.pause();
      const resume = () => { socket.resume(); ws.off('drain', resume); };
      ws.once('drain', resume);
    }
    if (ws.readyState === ws.OPEN) {
      ws.send(chunk);
    }
  });

  socket.on('end', closeBoth);
  socket.on('error', err => {
    console.warn('TCP error:', err.message);
    closeBoth();
  });

  // WS → TCP
  ws.on('message', data => {
    try {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const ok = socket.write(buf);
      if (!ok) {
        // TCP backpressure — wait for 'drain'
        ws.pause?.();
        socket.once('drain', () => ws.resume?.());
      }
    } catch (e) {
      console.warn('WS message error:', e.message);
    }
  });

  ws.on('close', closeBoth);
  ws.on('error', () => closeBoth());
});

