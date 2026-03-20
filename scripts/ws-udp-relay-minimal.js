// Minimal WebSocket ↔ UDP relay (extracted from proxy/index.js)
import dgram from 'node:dgram';
import http from 'node:http';
import { WebSocketServer } from 'ws';

const TARGET_HOST = process.env.TARGET_HOST || '127.0.0.1';
const TARGET_PORT = Number(process.env.TARGET_PORT || 27960);
const PROXY_PORT = Number(process.env.PROXY_PORT || 27961);

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
  console.log(`WS↔UDP relay listening on ws://0.0.0.0:${PROXY_PORT}/`);
  console.log(`Default UDP target: ${TARGET_HOST}:${TARGET_PORT}`);
});

wss.on('connection', ws => {
  const udp = dgram.createSocket('udp4');

  udp.on('message', msg => {
    if (ws.readyState === ws.OPEN) {
      ws.send(msg);
    }
  });

  udp.on('error', err => {
    console.warn('UDP error:', err.message);
    try { udp.close(); } catch {}
  });

  ws.on('message', data => {
    try {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      udp.send(buf, TARGET_PORT, TARGET_HOST, sendErr => {
        if (sendErr) console.warn('UDP send error:', sendErr.message);
      });
    } catch (e) {
      console.warn('WS message error:', e.message);
    }
  });

  const close = () => { try { udp.close(); } catch {} };
  ws.on('close', close);
  ws.on('error', close);
});

