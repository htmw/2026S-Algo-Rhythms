import crypto from 'node:crypto';
import type { Namespace, Server, Socket } from 'socket.io';
import { pool } from '../db.js';
import { logger } from '../logger.js';

interface ApiKeyRow {
  id: string;
  tenant_id: string;
  key_hash: string;
}

interface DashboardSocketData {
  tenantId: string;
  apiKeyId: string;
}

const UNAUTHORIZED = new Error('UNAUTHORIZED');

async function authenticateSocket(token: string): Promise<DashboardSocketData | null> {
  if (!token) return null;

  const computedHash = crypto.createHash('sha256').update(token).digest('hex');

  const result = await pool.query<ApiKeyRow>(
    `SELECT id, tenant_id, key_hash
       FROM api_keys
      WHERE key_hash = $1
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())`,
    [computedHash],
  );

  const row = result.rows[0];
  if (!row) return null;

  const computedBuffer = Buffer.from(computedHash, 'hex');
  const storedBuffer = Buffer.from(row.key_hash, 'hex');
  if (computedBuffer.length !== storedBuffer.length) return null;
  if (!crypto.timingSafeEqual(computedBuffer, storedBuffer)) return null;

  return { tenantId: row.tenant_id, apiKeyId: row.id };
}

export function registerDashboardNamespace(io: Server): Namespace {
  const nsp = io.of('/dashboard');

  nsp.use(async (socket: Socket, next) => {
    try {
      const rawToken = socket.handshake.auth?.token;
      const token = typeof rawToken === 'string' ? rawToken : '';

      const auth = await authenticateSocket(token);
      if (!auth) {
        logger.warn(
          { socketId: socket.id, keyPrefix: token ? token.substring(0, 12) + '...' : 'none' },
          'Dashboard socket auth rejected',
        );
        next(UNAUTHORIZED);
        return;
      }

      socket.data.tenantId = auth.tenantId;
      socket.data.apiKeyId = auth.apiKeyId;
      next();
    } catch (err) {
      logger.error({ err, socketId: socket.id }, 'Dashboard socket auth error');
      next(UNAUTHORIZED);
    }
  });

  nsp.on('connection', (socket: Socket) => {
    const tenantId = socket.data.tenantId as string;
    const room = `tenant:${tenantId}`;
    void socket.join(room);

    logger.info(
      { socketId: socket.id, tenantId, room },
      'Dashboard socket connected',
    );

    socket.on('disconnect', (reason) => {
      logger.info(
        { socketId: socket.id, tenantId, reason },
        'Dashboard socket disconnected',
      );
    });
  });

  return nsp;
}
