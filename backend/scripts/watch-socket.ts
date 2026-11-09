// Dev helper: prints every Socket.IO event from the backend.
// Usage: npm run socket:watch            (defaults to http://localhost:4000)
//        npm run socket:watch -- http://192.168.1.50:4000
import { io } from 'socket.io-client';

const url = process.argv[2] ?? 'http://localhost:4000';
const socket = io(url, { transports: ['websocket'] });

socket.on('connect', () => {
  console.log(`connected to ${url} as ${socket.id ?? '?'}`);
});
socket.on('disconnect', (reason) => {
  console.log(`disconnected: ${reason}`);
});
socket.on('connect_error', (err) => {
  console.log(`connect error: ${err.message}`);
});
socket.onAny((event: string, payload: unknown) => {
  console.log(`\n[${new Date().toLocaleTimeString()}] ${event}`);
  console.log(JSON.stringify(payload, null, 2));
});
