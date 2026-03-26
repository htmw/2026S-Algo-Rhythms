import type { PoolClient } from 'pg';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      tenantId: string;
      apiKeyId: string;
      scopes: string[];
      dbClient: PoolClient;
    }
  }
}
