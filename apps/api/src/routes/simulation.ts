import { Router } from 'express';
import type { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { createAndEnqueueNotification } from '../services/notificationService.js';
import { logger } from '../logger.js';

const VALID_PERSONAS = ['email_lover', 'push_fan', 'sms_responder', 'balanced', 'disengaged'] as const;

const SimulationRunSchema = z.object({
  count: z.number().int().min(1).max(50),
  personas: z
    .array(z.enum(VALID_PERSONAS))
    .min(1)
    .optional(),
  scenario: z
    .object({
      subject: z.string().min(1).max(500),
      body: z.string().min(1),
    })
    .optional(),
});

const NOTIFICATION_TEMPLATES = [
  {
    subject: 'Security Alert: New sign-in from unrecognized device',
    body: 'We detected a sign-in to your account from a new device in San Francisco, CA. If this was you, no action is needed. If you do not recognize this activity, please reset your password immediately and enable two-factor authentication.',
  },
  {
    subject: 'Your weekly digest is ready',
    body: 'Here is your weekly summary: 12 updates across your projects, 3 new comments on items you follow, and 1 upcoming deadline. Visit your dashboard for the full breakdown.',
  },
  {
    subject: 'Limited time: 30% off your next purchase',
    body: 'As a valued customer, we are offering you an exclusive 30% discount on your next order. Use code SAVE30 at checkout. This offer expires in 48 hours and cannot be combined with other promotions.',
  },
  {
    subject: 'Account update: Your billing information has been changed',
    body: 'The payment method on your account has been updated. If you made this change, no further action is needed. If you did not authorize this change, please contact support immediately at support@example.com.',
  },
  {
    subject: 'Your order #8294 has shipped',
    body: 'Great news! Your order has been shipped and is on its way. Estimated delivery: 3-5 business days. Track your package using the link in your account dashboard.',
  },
  {
    subject: 'Scheduled maintenance: Service downtime on Saturday',
    body: 'We will be performing scheduled maintenance on Saturday from 2:00 AM to 6:00 AM UTC. During this window, the service may be intermittently unavailable. We apologize for any inconvenience.',
  },
  {
    subject: 'Welcome to NotifyEngine!',
    body: 'Thanks for signing up! Your account is now active. To get started, create your first API key in the dashboard and send a test notification. Check out our quickstart guide for a step-by-step walkthrough.',
  },
  {
    subject: 'Payment confirmed: Invoice #INV-2026-0451',
    body: 'Your payment of $49.99 has been successfully processed. A receipt has been added to your billing history. Your next billing date is June 12, 2026. Thank you for your continued subscription.',
  },
];

export const simulationRouter = Router();

simulationRouter.post('/run', async (req: Request, res: Response): Promise<void> => {
  const { requestId, tenantId, dbClient } = req;

  let parsed: z.infer<typeof SimulationRunSchema>;
  try {
    parsed = SimulationRunSchema.parse(req.body);
  } catch (err) {
    if (err instanceof ZodError) {
      const message = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message },
        request_id: requestId,
      });
      return;
    }
    throw err;
  }

  const personas = parsed.personas ?? [...VALID_PERSONAS];
  const recipients: string[] = [];
  let queued = 0;

  for (let i = 0; i < parsed.count; i++) {
    const personaKey = personas[i % personas.length];
    const recipientId = `user_${personaKey}_${i + 1}@test.local`;
    const template = parsed.scenario ?? NOTIFICATION_TEMPLATES[i % NOTIFICATION_TEMPLATES.length];

    try {
      await createAndEnqueueNotification(dbClient, {
        tenantId,
        recipient: recipientId,
        subject: template.subject,
        body: template.body,
        channelPreference: ['email', 'sms_webhook', 'websocket'],
      });
      recipients.push(recipientId);
      queued++;
    } catch (err) {
      logger.error({ err, requestId, tenantId, recipientId }, 'Failed to enqueue simulated notification');
    }
  }

  logger.info({ requestId, tenantId, queued, total: parsed.count }, 'Simulation run completed');

  res.status(202).json({
    queued,
    recipients,
    request_id: requestId,
  });
});

const RETRAIN_TIMEOUT_MS = 30_000;

simulationRouter.post('/retrain', async (req: Request, res: Response): Promise<void> => {
  const { requestId, tenantId } = req;
  const baseUrl = process.env.ML_SERVICE_URL ?? 'http://localhost:8000';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RETRAIN_TIMEOUT_MS);

  try {
    const mlRes = await fetch(`${baseUrl}/train`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantId }),
      signal: controller.signal,
    });

    if (!mlRes.ok) {
      const detail = await mlRes.text().catch(() => 'Unknown error');
      logger.warn({ requestId, status: mlRes.status, detail }, 'ML service /train returned non-2xx');
      res.status(503).json({
        error: { code: 'ML_SERVICE_UNAVAILABLE', message: 'ML service unavailable' },
        request_id: requestId,
      });
      return;
    }

    const body = await mlRes.json() as Record<string, unknown>;

    res.status(200).json({
      version: body.version ?? null,
      auc_roc: (body.metrics as Record<string, number> | null)?.auc_roc ?? null,
      training_samples: (body.metrics as Record<string, number> | null)?.training_samples ?? null,
      promoted: body.promoted ?? false,
      feature_importance: (body.metrics as Record<string, number> | null)?.feature_importance ?? {},
      message: body.message,
      request_id: requestId,
    });
  } catch (err) {
    logger.warn({ err, requestId }, 'ML service /train request failed');
    res.status(503).json({
      error: { code: 'ML_SERVICE_UNAVAILABLE', message: 'ML service unavailable' },
      request_id: requestId,
    });
  } finally {
    clearTimeout(timer);
  }
});
