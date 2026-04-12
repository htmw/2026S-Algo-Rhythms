import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import { Redis } from 'ioredis';
import { logger } from './logger.js';
import { authMiddleware } from './middleware/auth.js';
import { notificationRouter } from './routes/notifications.js';
import { tenantRouter } from './routes/tenants.js';
import { engagementRouter } from './routes/engagement.js';
import { registerDashboardNamespace } from './socket/dashboardNamespace.js';
import { startDashboardBridge } from './socket/dashboardBridge.js';
import { initApiEmitter } from './socket/apiEmitter.js';

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(helmet());
app.use(cors({
  origin: process.env.DASHBOARD_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Public routes (no API key required)
app.use('/v1/tenants', tenantRouter);
app.use('/v1/engagement', engagementRouter);

// Protected routes
app.use('/v1/notifications', authMiddleware, notificationRouter);

const httpServer = http.createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.DASHBOARD_URL || 'http://localhost:5173',
    credentials: true,
  },
  transports: ['websocket'],
});

const dashboardNsp = registerDashboardNamespace(io);
initApiEmitter(process.env.REDIS_URL || 'redis://localhost:6379');

// Dedicated Redis subscriber connection — must NOT be shared with BullMQ
// or rate limiting clients. ioredis subscribers cannot issue normal commands.
const dashboardSubscriber = new Redis(
  process.env.REDIS_PUBSUB_URL || process.env.REDIS_URL || 'redis://localhost:6379',
  { lazyConnect: false, maxRetriesPerRequest: null },
);

void startDashboardBridge(dashboardNsp, dashboardSubscriber).catch((err: unknown) => {
  logger.error({ err }, 'Failed to start dashboard bridge');
});

httpServer.listen(port, () => {
  logger.info({ port }, 'API server started');
});

export { app, httpServer, io };
