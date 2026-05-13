import { Router } from 'express';
import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { z, ZodError } from 'zod';
import type { NotificationPriority } from '@notifyengine/shared';
import { createAndEnqueueNotification } from '../services/notificationService.js';
import { logger } from '../logger.js';

// ─── Scenario definitions ───────────────────────────────────────

interface ScenarioTemplate {
  subject: string;
  body: string;
  priority: NotificationPriority;
}

interface ScenarioDefinition {
  personas: string[];
  templates: ScenarioTemplate[];
}

const ALL_PERSONAS = ['email_lover', 'push_fan', 'sms_responder', 'balanced', 'disengaged'];

const SCENARIOS: Record<string, ScenarioDefinition> = {
  security_blast: {
    personas: ALL_PERSONAS,
    templates: [
      {
        subject: 'Unauthorized access attempt detected on your account',
        body: 'We detected an unauthorized login attempt from IP 203.0.113.42 in São Paulo, Brazil. If this was not you, reset your password immediately and review your recent account activity.',
        priority: 'critical',
      },
      {
        subject: 'Data breach notification: Immediate action required',
        body: 'A security breach affecting your account has been identified. As a precaution, we have temporarily locked your account. Please verify your identity to restore access and review affected data.',
        priority: 'critical',
      },
      {
        subject: 'Suspicious activity on your payment method',
        body: 'We noticed unusual transactions on the payment method ending in 4821. Two charges of $299.99 were attempted from an unrecognized merchant. Your card has been temporarily frozen pending verification.',
        priority: 'critical',
      },
      {
        subject: 'Mandatory credential rotation: API keys expiring in 24 hours',
        body: 'Your API keys were generated over 90 days ago and must be rotated per our security policy. All keys older than 90 days will be automatically revoked at midnight UTC. Generate new keys in your dashboard now.',
        priority: 'critical',
      },
      {
        subject: 'Firewall alert: Anomalous traffic pattern detected',
        body: 'Our intrusion detection system flagged a sustained spike in requests from your account — 15,000 requests in the last 10 minutes, compared to your typical 200/min baseline. If this is expected, no action is needed. Otherwise, review your integrations for compromised credentials.',
        priority: 'critical',
      },
    ],
  },

  marketing_campaign: {
    personas: ALL_PERSONAS,
    templates: [
      {
        subject: 'Flash sale: 50% off all plans for the next 6 hours',
        body: 'For the next 6 hours only, every NotifyEngine plan is half price. Upgrade now and lock in the discounted rate for a full year. Use code FLASH50 at checkout. Offer ends at midnight UTC.',
        priority: 'standard',
      },
      {
        subject: 'Introducing Smart Batching: Send smarter, not more',
        body: 'We just shipped Smart Batching — our new feature that groups related notifications and delivers them as a single digest. Early adopters are seeing 40% fewer unsubscribes. Enable it in your dashboard today.',
        priority: 'standard',
      },
      {
        subject: 'You have earned a loyalty reward: 1 free month',
        body: 'Thank you for being a NotifyEngine customer for 6 months! As a thank you, we are crediting your account with one free month of service. No action required — the credit is already applied to your next billing cycle.',
        priority: 'standard',
      },
      {
        subject: 'Spring into savings: Seasonal plan upgrades',
        body: 'Spring cleaning your notification stack? Upgrade to our Growth plan this month and get 3 months of premium analytics included free. See how your engagement rates compare to industry benchmarks.',
        priority: 'standard',
      },
      {
        subject: 'Refer a friend, earn $50 in credits',
        body: 'Know someone who could use smarter notifications? Refer them to NotifyEngine and you both get $50 in account credits when they activate. Share your unique referral link from your dashboard.',
        priority: 'standard',
      },
    ],
  },

  // Designed to trip circuit breaker. Depends on PRs #55-57 (channel registry + circuit breaker) being merged.
  channel_failure: {
    personas: ['email_lover'],
    templates: [
      {
        subject: 'System notification: Connectivity check alpha',
        body: 'This is an automated connectivity verification message. No action is required on your part. If you did not expect this message, please contact your system administrator.',
        priority: 'high',
      },
      {
        subject: 'System notification: Connectivity check bravo',
        body: 'Automated delivery pipeline health check. This message verifies that the notification channel is functioning correctly under load. Ref: SIM-HEALTH-BRAVO.',
        priority: 'high',
      },
      {
        subject: 'System notification: Connectivity check charlie',
        body: 'Routine channel saturation test in progress. This message is part of a batch designed to validate circuit breaker thresholds. Ref: SIM-HEALTH-CHARLIE.',
        priority: 'high',
      },
      {
        subject: 'System notification: Connectivity check delta',
        body: 'Load simulation message delta. The system is verifying failover behavior when a single channel receives sustained high-volume traffic. No user action required.',
        priority: 'high',
      },
      {
        subject: 'System notification: Connectivity check echo',
        body: 'Final connectivity verification in this batch. Channel resilience metrics are being recorded. If circuit breaker trips, the system will automatically reroute subsequent messages.',
        priority: 'high',
      },
    ],
  },

  cold_start: {
    personas: ALL_PERSONAS,
    templates: [
      {
        subject: 'Security Alert: Password changed successfully',
        body: 'Your account password was changed at 14:32 UTC today. If you made this change, no action is needed. If you did not initiate this change, contact support immediately.',
        priority: 'critical',
      },
      {
        subject: 'New feature announcement: Real-time analytics dashboard',
        body: 'We are excited to announce our new real-time analytics dashboard. Track delivery rates, engagement metrics, and channel performance as they happen. Available now on all paid plans.',
        priority: 'standard',
      },
      {
        subject: 'Your invoice for May 2026 is ready',
        body: 'Your monthly invoice of $129.00 for the Growth plan has been generated. Payment will be automatically charged to your card ending in 7734 on June 1. View the full invoice in your billing settings.',
        priority: 'high',
      },
      {
        subject: 'Alex commented on your shared project',
        body: 'Alex M. left a comment on the "Q2 Launch Campaign" project: "The A/B test results look promising — channel C has a 23% higher open rate. Let\'s discuss in tomorrow\'s standup."',
        priority: 'standard',
      },
      {
        subject: 'Scheduled maintenance window: May 18, 2026',
        body: 'Planned maintenance is scheduled for Sunday, May 18 from 03:00 to 05:00 UTC. API latency may increase during this window. No downtime is expected. Status updates will be posted to status.notifyengine.dev.',
        priority: 'bulk',
      },
    ],
  },
};

// ─── Zod schema ─────────────────────────────────────────────────

const SCENARIO_KEYS = Object.keys(SCENARIOS) as [string, ...string[]];

const RunSimulationSchema = z.object({
  scenario: z.enum(SCENARIO_KEYS as [string, ...string[]]),
  count: z.number().int().min(1).max(50).default(5),
  speed: z.enum(['sequential', 'burst']).default('sequential'),
});

// ─── Helpers ────────────────────────────────────────────────────

function buildNotifications(
  scenario: ScenarioDefinition,
  count: number,
  tenantId: string,
): Array<{ recipient: string; subject: string; body: string; priority: NotificationPriority }> {
  const ts = Date.now();
  const items: Array<{ recipient: string; subject: string; body: string; priority: NotificationPriority }> = [];

  for (let i = 0; i < count; i++) {
    const persona = scenario.personas[i % scenario.personas.length];
    const template = scenario.templates[i % scenario.templates.length];
    items.push({
      recipient: `user_${persona}_${ts}@test.notifyengine.dev`,
      subject: template.subject,
      body: template.body,
      priority: template.priority,
    });
  }

  return items;
}

async function enqueueOne(
  dbClient: PoolClient,
  tenantId: string,
  item: { recipient: string; subject: string; body: string; priority: NotificationPriority },
  requestId: string,
): Promise<boolean> {
  try {
    await createAndEnqueueNotification(dbClient, {
      tenantId,
      recipient: item.recipient,
      subject: item.subject,
      body: item.body,
      priority: item.priority,
      channelPreference: ['email', 'sms_webhook', 'websocket'],
    });
    return true;
  } catch (err) {
    logger.error({ err, requestId, tenantId, recipient: item.recipient }, 'Failed to enqueue simulated notification');
    return false;
  }
}

// ─── Routes ─────────────────────────────────────────────────────

export const simulationRouter = Router();

simulationRouter.post('/run', async (req: Request, res: Response): Promise<void> => {
  const { requestId, tenantId, dbClient } = req;

  let parsed: z.infer<typeof RunSimulationSchema>;
  try {
    parsed = RunSimulationSchema.parse(req.body);
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

  const scenario = SCENARIOS[parsed.scenario];
  const items = buildNotifications(scenario, parsed.count, tenantId);

  if (parsed.speed === 'burst') {
    const results = await Promise.all(
      items.map((item) => enqueueOne(dbClient, tenantId, item, requestId)),
    );
    const queued = results.filter(Boolean).length;
    logger.info({ requestId, tenantId, scenario: parsed.scenario, queued, total: parsed.count }, 'Simulation burst completed');

    res.status(202).json({
      scenario: parsed.scenario,
      count: queued,
      speed: 'burst',
      started: true,
      request_id: requestId,
    });
    return;
  }

  // Sequential: respond immediately, enqueue in background.
  // If the process restarts mid-loop, remaining notifications are lost (acceptable for simulation).
  res.status(202).json({
    scenario: parsed.scenario,
    count: parsed.count,
    speed: 'sequential',
    started: true,
    request_id: requestId,
  });

  void (async () => {
    let queued = 0;
    for (const item of items) {
      const ok = await enqueueOne(dbClient, tenantId, item, requestId);
      if (ok) queued++;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    logger.info({ requestId, tenantId, scenario: parsed.scenario, queued, total: items.length }, 'Simulation sequential run completed');
  })();
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
