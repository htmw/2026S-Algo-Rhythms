import { Queue, Worker } from 'bullmq';
import type { Job } from 'bullmq';
import { QUEUE_NAMES } from '@notifyengine/shared';
import { logger } from './logger.js';

// Spec 5.6 — initial-phase retrain cadence is every 6 hours.
const RETRAIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const REPEATABLE_JOB_NAME = 'retrain-global-model';

interface TrainResponse {
  promoted: boolean;
  version: string | null;
  metrics: Record<string, number> | null;
  message: string;
}

interface RetrainSchedulerHandle {
  queue: Queue;
  worker: Worker;
  close: () => Promise<void>;
}

/**
 * Sets up a BullMQ repeatable job that periodically calls the ml-service
 * POST /train endpoint to retrain the global engagement model.
 *
 * Best-effort: failures are logged but never crash the worker process.
 * The ml-service /train endpoint already enforces the AUC promotion gate
 * and handles insufficient-data cases internally.
 */
export function setupRetrainScheduler(connection: { url: string }): RetrainSchedulerHandle {
  const queue = new Queue(QUEUE_NAMES.ML_RETRAIN, { connection });

  const worker = new Worker(
    QUEUE_NAMES.ML_RETRAIN,
    async (job: Job) => {
      const baseUrl = process.env.ML_SERVICE_URL ?? 'http://localhost:8000';
      const log = logger.child({ jobId: job.id, queue: QUEUE_NAMES.ML_RETRAIN });

      log.info({ baseUrl }, 'Starting scheduled retrain');

      try {
        const res = await fetch(`${baseUrl}/train`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tenant_id: null }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          log.warn({ status: res.status, body: text }, 'ml-service /train returned non-2xx');
          return;
        }

        const body = (await res.json()) as TrainResponse;
        if (body.promoted) {
          log.info(
            { version: body.version, metrics: body.metrics },
            'Retrain completed: new model promoted',
          );
        } else {
          log.info(
            { version: body.version, metrics: body.metrics, message: body.message },
            'Retrain completed: model not promoted',
          );
        }
      } catch (err) {
        // Best-effort: log and swallow so the BullMQ worker stays healthy.
        log.error({ err }, 'Scheduled retrain failed');
      }
    },
    { connection },
  );

  worker.on('ready', () => {
    logger.info(
      { queue: QUEUE_NAMES.ML_RETRAIN, intervalMs: RETRAIN_INTERVAL_MS },
      'Retrain scheduler worker ready',
    );
  });

  worker.on('error', (err) => {
    logger.error({ queue: QUEUE_NAMES.ML_RETRAIN, err }, 'Retrain scheduler worker error');
  });

  // Register the repeatable job. BullMQ deduplicates by (name, repeat opts),
  // so re-running this on every worker startup is idempotent.
  void queue
    .add(
      REPEATABLE_JOB_NAME,
      {},
      {
        repeat: { every: RETRAIN_INTERVAL_MS },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    )
    .then(() => {
      logger.info(
        { queue: QUEUE_NAMES.ML_RETRAIN, intervalMs: RETRAIN_INTERVAL_MS },
        'Retrain repeatable job registered',
      );
    })
    .catch((err) => {
      logger.error({ err }, 'Failed to register retrain repeatable job');
    });

  return {
    queue,
    worker,
    close: async () => {
      await worker.close();
      await queue.close();
    },
  };
}
