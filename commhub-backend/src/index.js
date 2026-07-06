require('dotenv').config();
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors    = require('cors');

const authRoutes    = require('./routes/auth');
const channelRoutes = require('./routes/channels');
const messageRoutes = require('./routes/messages');
const userRoutes    = require('./routes/users');
const { authenticateToken } = require('./middleware/auth');
const { setupSocket } = require('./socket');
const fileRoutes    = require('./routes/files');

const app    = express();
const server = http.createServer(app);

const FRONTEND = process.env.FRONTEND_URL || '*';

const io = new Server(server, {
  cors: { origin: FRONTEND, methods: ['GET','POST'], credentials: true }
});

app.use(cors({ origin: FRONTEND, credentials: true }));
app.use(express.json());

app.get('/health', (_, res) => res.json({ ok: true, ts: Date.now() }));

app.use('/api/auth',     authRoutes);
app.use('/api/channels', authenticateToken, channelRoutes);
app.use('/api/messages', authenticateToken, messageRoutes);
app.use('/api/users',    authenticateToken, userRoutes);
app.use('/api/files',    authenticateToken, fileRoutes);

setupSocket(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`CommHub backend → http://localhost:${PORT}`));
