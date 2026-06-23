import { io } from 'socket.io-client';
let socket = null;
export function connect(token) {
  if (socket) socket.disconnect();
  const url = import.meta.env.VITE_API_URL || window.location.origin;
  socket = io(url, { auth: { token }, transports: ['websocket','polling'], reconnectionAttempts: 10, reconnectionDelay: 2000 });
  socket.on('connect_error', err => console.error('[socket]', err.message));
  return socket;
}
export function getSocket() { return socket; }
export function disconnect() { if (socket) { socket.disconnect(); socket = null; } }
