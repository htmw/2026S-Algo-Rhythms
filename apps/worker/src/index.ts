import 'dotenv/config';
import { Worker, Queue } from 'bullmq';
import type { Job } from 'bullmq';
import { QUEUE_NAMES, QUEUE_CONCURRENCY } from '@notifyengine/shared';
import type { NotificationJob } from '@notifyengine/shared';
import { processNotification } from './processor.js';
import { pool } from './db.js';
import { logger } from './logger.js';
import { setupRetrainScheduler } from './retrainScheduler.js';

const connection = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
};

const dlqQueue = new Queue(QUEUE_NAMES.DLQ, { connection });

// SCRUM-164 — periodic ML retrain scheduler (spec 5.6, every 6h)
const retrainScheduler = setupRetrainScheduler(connection);

// ── One worker per priority queue ──
const queueConfigs = [
  { name: QUEUE_NAMES.CRITICAL, concurrency: QUEUE_CONCURRENCY[QUEUE_NAMES.CRITICAL] },
  { name: QUEUE_NAMES.HIGH, concurrency: QUEUE_CONCURRENCY[QUEUE_NAMES.HIGH] },
  { name: QUEUE_NAMES.STANDARD, concurrency: QUEUE_CONCURRENCY[QUEUE_NAMES.STANDARD] },
  { name: QUEUE_NAMES.BULK, concurrency: QUEUE_CONCURRENCY[QUEUE_NAMES.BULK] },
] as const;

const workers = queueConfigs.map(({ name, concurrency }) => {
  const worker = new Worker<NotificationJob>(
    name,
    async (job) => processNotification(job),
    { connection, concurrency },
  );

  worker.on('ready', () => {
    logger.info({ queue: name, concurrency }, 'Worker ready');
  });

  worker.on('completed', (job: Job<NotificationJob>) => {
    logger.info({ queue: name, jobId: job.id, notificationId: job.data.notificationId }, 'Job completed');
  });

  worker.on('failed', async (job: Job<NotificationJob> | undefined, err: Error) => {
    if (!job) return;

    logger.error({ queue: name, jobId: job.id, notificationId: job.data.notificationId, err }, 'Job failed');

    // Move to DLQ after all retries exhausted
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= maxAttempts) {
      logger.warn({ jobId: job.id, notificationId: job.data.notificationId }, 'All retries exhausted - moving to DLQ');

      try {
        await dlqQueue.add('dlq', job.data);

        const client = await pool.connect();
        try {
          await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [job.data.tenantId]);
          await client.query(
            `UPDATE notifications SET status = 'dlq', updated_at = NOW() WHERE id = $1`,
            [job.data.notificationId],
          );
        } finally {
          await client.query("SELECT set_config('app.current_tenant_id', '', false)").catch(() => {});
          client.release();
        }
      } catch (dlqErr) {
        logger.error({ err: dlqErr, jobId: job.id }, 'Failed to move job to DLQ');
      }
    }
  });

  worker.on('error', (err: Error) => {
    logger.error({ queue: name, err }, 'Worker error');
  });

  return worker;
});

// ── Graceful shutdown ──
async function shutdown(): Promise<void> {
  logger.info('Shutting down workers...');
  await Promise.all(workers.map((w) => w.close()));
  await retrainScheduler.close();
  await dlqQueue.close();
  await pool.end();
  logger.info('All workers stopped');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

logger.info(`Starting ${workers.length} workers across ${queueConfigs.length} priority queues`);
