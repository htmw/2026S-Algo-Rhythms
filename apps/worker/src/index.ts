import { Worker } from 'bullmq';
import { QUEUE_NAMES, QUEUE_CONCURRENCY } from '@notifyengine/shared';
import { logger } from './logger.js';

const connection = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
};

const worker = new Worker(
  QUEUE_NAMES.STANDARD,
  async (job) => {
    logger.info({ jobId: job.id, name: job.name }, 'Processing job');
  },
  {
    connection,
    concurrency: QUEUE_CONCURRENCY[QUEUE_NAMES.STANDARD],
  },
);

worker.on('ready', () => {
  logger.info('Worker connected and ready');
});

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Job failed');
});

export { worker };
