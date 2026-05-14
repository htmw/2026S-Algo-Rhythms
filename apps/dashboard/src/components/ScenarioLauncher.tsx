import { useState, useRef, type ReactNode } from 'react';
import { ShieldAlert, Megaphone, Zap, Brain, Play, Loader2, RefreshCw, Layers, Square } from 'lucide-react';
import { apiFetch } from '../lib/api.js';

interface ScenarioConfig {
  id: 'security_blast' | 'marketing_campaign' | 'channel_failure' | 'cold_start';
  title: string;
  description: string;
  icon: ReactNode;
  borderColor: string;
  iconBg: string;
  defaultCount: number;
}

const SCENARIOS: ScenarioConfig[] = [
  {
    id: 'security_blast',
    title: 'Security Alert Blast',
    description: 'Flood all personas with critical security alerts. Tests urgency classification and high-priority routing.',
    icon: <ShieldAlert className="h-5 w-5 text-red-600" />,
    borderColor: 'border-l-red-500',
    iconBg: 'bg-red-50 dark:bg-red-900/30',
    defaultCount: 10,
  },
  {
    id: 'marketing_campaign',
    title: 'Marketing Campaign',
    description: 'Send promotional content to all personas. Tests how the model routes low-urgency marketing across channels.',
    icon: <Megaphone className="h-5 w-5 text-blue-600" />,
    borderColor: 'border-l-blue-500',
    iconBg: 'bg-blue-50 dark:bg-blue-900/30',
    defaultCount: 10,
  },
  {
    id: 'channel_failure',
    title: 'Channel Failure',
    description: 'Overwhelm email channel to trip the circuit breaker. Tests failover routing behavior.',
    icon: <Zap className="h-5 w-5 text-amber-600" />,
    borderColor: 'border-l-amber-500',
    iconBg: 'bg-amber-50 dark:bg-amber-900/30',
    defaultCount: 15,
  },
  {
    id: 'cold_start',
    title: 'Cold Start to Learned',
    description: 'Send mixed content to fresh personas. Retrain the model after completion to show prediction improvement.',
    icon: <Brain className="h-5 w-5 text-green-600" />,
    borderColor: 'border-l-green-500',
    iconBg: 'bg-green-50 dark:bg-green-900/30',
    defaultCount: 5,
  },
];

interface ScenarioTemplate {
  subject: string;
  body: string;
  priority: 'critical' | 'high' | 'standard' | 'bulk';
}

interface ScenarioData {
  personas: string[];
  templates: ScenarioTemplate[];
}

const ALL_PERSONAS = ['email_lover', 'push_fan', 'sms_responder', 'balanced', 'disengaged'];

const SCENARIO_DATA: Record<ScenarioConfig['id'], ScenarioData> = {
  security_blast: {
    personas: ALL_PERSONAS,
    templates: [
      { subject: 'Unauthorized access attempt detected on your account', body: 'We detected an unauthorized login attempt from IP 203.0.113.42 in São Paulo, Brazil. If this was not you, reset your password immediately and review your recent account activity.', priority: 'critical' },
      { subject: 'Data breach notification: Immediate action required', body: 'A security breach affecting your account has been identified. As a precaution, we have temporarily locked your account. Please verify your identity to restore access and review affected data.', priority: 'critical' },
      { subject: 'Suspicious activity on your payment method', body: 'We noticed unusual transactions on the payment method ending in 4821. Two charges of $299.99 were attempted from an unrecognized merchant. Your card has been temporarily frozen pending verification.', priority: 'critical' },
      { subject: 'Mandatory credential rotation: API keys expiring in 24 hours', body: 'Your API keys were generated over 90 days ago and must be rotated per our security policy. All keys older than 90 days will be automatically revoked at midnight UTC. Generate new keys in your dashboard now.', priority: 'critical' },
      { subject: 'Firewall alert: Anomalous traffic pattern detected', body: 'Our intrusion detection system flagged a sustained spike in requests from your account — 15,000 requests in the last 10 minutes, compared to your typical 200/min baseline. If this is expected, no action is needed.', priority: 'critical' },
    ],
  },
  marketing_campaign: {
    personas: ALL_PERSONAS,
    templates: [
      { subject: 'Flash sale: 50% off all plans for the next 6 hours', body: 'For the next 6 hours only, every NotifyEngine plan is half price. Upgrade now and lock in the discounted rate for a full year. Use code FLASH50 at checkout.', priority: 'standard' },
      { subject: 'Introducing Smart Batching: Send smarter, not more', body: 'We just shipped Smart Batching — our new feature that groups related notifications and delivers them as a single digest. Early adopters are seeing 40% fewer unsubscribes.', priority: 'standard' },
      { subject: 'You have earned a loyalty reward: 1 free month', body: 'Thank you for being a NotifyEngine customer for 6 months! As a thank you, we are crediting your account with one free month of service. No action required.', priority: 'standard' },
      { subject: 'Spring into savings: Seasonal plan upgrades', body: 'Spring cleaning your notification stack? Upgrade to our Growth plan this month and get 3 months of premium analytics included free.', priority: 'standard' },
      { subject: 'Refer a friend, earn $50 in credits', body: 'Know someone who could use smarter notifications? Refer them to NotifyEngine and you both get $50 in account credits when they activate.', priority: 'standard' },
    ],
  },
  channel_failure: {
    personas: ['email_lover'],
    templates: [
      { subject: 'System notification: Connectivity check alpha', body: 'This is an automated connectivity verification message. No action is required on your part.', priority: 'high' },
      { subject: 'System notification: Connectivity check bravo', body: 'Automated delivery pipeline health check. This message verifies that the notification channel is functioning correctly under load.', priority: 'high' },
      { subject: 'System notification: Connectivity check charlie', body: 'Routine channel saturation test in progress. This message is part of a batch designed to validate circuit breaker thresholds.', priority: 'high' },
      { subject: 'System notification: Connectivity check delta', body: 'Load simulation message delta. The system is verifying failover behavior when a single channel receives sustained high-volume traffic.', priority: 'high' },
      { subject: 'System notification: Connectivity check echo', body: 'Final connectivity verification in this batch. Channel resilience metrics are being recorded.', priority: 'high' },
    ],
  },
  cold_start: {
    personas: ALL_PERSONAS,
    templates: [
      { subject: 'Security Alert: Password changed successfully', body: 'Your account password was changed at 14:32 UTC today. If you made this change, no action is needed.', priority: 'critical' },
      { subject: 'New feature announcement: Real-time analytics dashboard', body: 'We are excited to announce our new real-time analytics dashboard. Track delivery rates, engagement metrics, and channel performance as they happen.', priority: 'standard' },
      { subject: 'Your invoice for May 2026 is ready', body: 'Your monthly invoice of $129.00 for the Growth plan has been generated. Payment will be automatically charged to your card ending in 7734 on June 1.', priority: 'high' },
      { subject: 'Alex commented on your shared project', body: 'Alex M. left a comment on the "Q2 Launch Campaign" project: "The A/B test results look promising — channel C has a 23% higher open rate."', priority: 'standard' },
      { subject: 'Scheduled maintenance window: May 18, 2026', body: 'Planned maintenance is scheduled for Sunday, May 18 from 03:00 to 05:00 UTC. API latency may increase during this window. No downtime is expected.', priority: 'bulk' },
    ],
  },
};

interface BatchPostResponse {
  id: string;
  status: string;
}

interface BatchState {
  scenario: ScenarioConfig['id'];
  batchSize: number;
  running: boolean;
  sent: number;
  succeeded: number;
  failed: number;
  done: boolean;
}

const BATCH_DELAY_MS = 250;

function BatchModePanel() {
  const [state, setState] = useState<BatchState>({
    scenario: 'security_blast',
    batchSize: 10,
    running: false,
    sent: 0,
    succeeded: 0,
    failed: 0,
    done: false,
  });
  const cancelledRef = useRef(false);

  async function handleRunBatch() {
    cancelledRef.current = false;
    setState((s) => ({ ...s, running: true, sent: 0, succeeded: 0, failed: 0, done: false }));

    const data = SCENARIO_DATA[state.scenario];
    const ts = Date.now();
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < state.batchSize; i++) {
      if (cancelledRef.current) break;

      const persona = data.personas[Math.floor(Math.random() * data.personas.length)];
      const template = data.templates[Math.floor(Math.random() * data.templates.length)];

      try {
        await apiFetch<BatchPostResponse>('/v1/notifications', {
          method: 'POST',
          body: JSON.stringify({
            recipient: `user_${persona}_${ts}_${i}@test.notifyengine.dev`,
            subject: template.subject,
            body: template.body,
            priority: template.priority,
            routing_mode: 'adaptive',
          }),
        });
        succeeded++;
      } catch {
        failed++;
      }

      setState((s) => ({ ...s, sent: i + 1, succeeded, failed }));

      if (i < state.batchSize - 1 && !cancelledRef.current) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    setState((s) => ({ ...s, running: false, done: true }));
  }

  function handleCancel() {
    cancelledRef.current = true;
  }

  const selectedScenario = SCENARIOS.find((s) => s.id === state.scenario);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-sm">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="flex items-center justify-center rounded-md bg-purple-50 dark:bg-purple-900/30 h-8 w-8">
          <Layers className="h-5 w-5 text-purple-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Batch Mode</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Fire N notifications for training data generation</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Scenario</label>
            <select
              value={state.scenario}
              onChange={(e) => setState((s) => ({ ...s, scenario: e.target.value as ScenarioConfig['id'] }))}
              disabled={state.running}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            >
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Batch Size</label>
            <input
              type="number"
              min={1}
              max={50}
              value={state.batchSize}
              onChange={(e) => setState((s) => ({ ...s, batchSize: Math.max(1, Math.min(50, Number(e.target.value) || 1)) }))}
              disabled={state.running}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 text-center focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
        </div>

        {selectedScenario && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{selectedScenario.description}</p>
        )}

        {state.running && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
              <span>{state.sent}/{state.batchSize} sent</span>
              <span>{state.succeeded} ok, {state.failed} failed</span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
              <div
                className="h-full bg-purple-600 dark:bg-purple-500 rounded transition-all duration-200"
                style={{ width: `${(state.sent / state.batchSize) * 100}%` }}
              />
            </div>
          </div>
        )}

        {state.done && !state.running && (
          <p className={`text-xs font-medium ${state.failed === 0 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
            Batch complete: {state.succeeded}/{state.sent} delivered, {state.failed} failed
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={state.running}
            onClick={handleRunBatch}
            className="flex items-center gap-2 rounded-md bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {state.running ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
            ) : (
              <><Play className="h-4 w-4" /> Run Batch</>
            )}
          </button>
          {state.running && (
            <button
              type="button"
              onClick={handleCancel}
              className="flex items-center gap-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              <Square className="h-3.5 w-3.5" /> Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface RunResponse {
  scenario: string;
  count: number;
  speed: string;
  started: boolean;
  request_id: string;
}

interface RetrainResponse {
  version: string;
  auc_roc: number;
  training_samples: number;
  promoted: boolean;
  feature_importance: Record<string, number>;
  message: string;
  request_id: string;
}

interface CardState {
  count: number;
  speed: 'sequential' | 'burst';
  loading: boolean;
  result: string | null;
  error: string | null;
}

function ScenarioCard({ config }: { config: ScenarioConfig }) {
  const [state, setState] = useState<CardState>({
    count: config.defaultCount,
    speed: 'sequential',
    loading: false,
    result: null,
    error: null,
  });

  async function handleLaunch() {
    setState((s) => ({ ...s, loading: true, error: null, result: null }));

    try {
      const res = await apiFetch<RunResponse>('/v1/simulation/run', {
        method: 'POST',
        body: JSON.stringify({
          scenario: config.id,
          count: state.count,
          speed: state.speed,
        }),
      });

      setState((s) => ({
        ...s,
        loading: false,
        result: `Queued — ${res.count} notifications launched`,
      }));

      setTimeout(() => {
        setState((s) => ({ ...s, result: null }));
      }, 5000);
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Launch failed',
      }));
    }
  }

  return (
    <div className={`rounded-lg border border-gray-200 dark:border-gray-700 ${config.borderColor} border-l-4 bg-white dark:bg-gray-800 p-4 text-sm flex flex-col`}>
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`flex items-center justify-center rounded-md ${config.iconBg} h-8 w-8`}>
          {config.icon}
        </div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{config.title}</h3>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-3">{config.description}</p>

      <div className="mt-auto space-y-2.5">
        <div className="flex items-center gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Count</label>
            <input
              type="number"
              min={1}
              max={50}
              value={state.count}
              onChange={(e) => setState((s) => ({ ...s, count: Math.max(1, Math.min(50, Number(e.target.value) || 1)) }))}
              disabled={state.loading}
              className="w-16 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 text-center focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Speed</label>
            <div className="flex rounded-md overflow-hidden border border-gray-300 dark:border-gray-600">
              <button
                type="button"
                disabled={state.loading}
                onClick={() => setState((s) => ({ ...s, speed: 'sequential' }))}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                  state.speed === 'sequential'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                Sequential
              </button>
              <button
                type="button"
                disabled={state.loading}
                onClick={() => setState((s) => ({ ...s, speed: 'burst' }))}
                className={`px-2.5 py-1.5 text-xs font-medium border-l border-gray-300 dark:border-gray-600 transition-colors disabled:opacity-50 ${
                  state.speed === 'burst'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                Burst
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={state.loading}
          onClick={handleLaunch}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 w-full justify-center"
        >
          {state.loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Launching {state.count} notifications...</>
          ) : (
            <><Play className="h-4 w-4" /> Launch</>
          )}
        </button>

        {state.result && (
          <p className="text-xs text-green-600 dark:text-green-400 font-medium">{state.result}</p>
        )}
        {state.error && (
          <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>
        )}
      </div>
    </div>
  );
}

export function ScenarioLauncher() {
  const [retraining, setRetraining] = useState(false);
  const [retrainResult, setRetrainResult] = useState<RetrainResponse | null>(null);
  const [retrainError, setRetrainError] = useState<string | null>(null);

  async function handleRetrain() {
    setRetraining(true);
    setRetrainResult(null);
    setRetrainError(null);

    try {
      const res = await apiFetch<RetrainResponse>('/v1/simulation/retrain', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setRetrainResult(res);
    } catch (err) {
      setRetrainError(err instanceof Error ? err.message : 'Retrain failed');
    } finally {
      setRetraining(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Scenario Launcher</h2>

      <div className="grid grid-cols-2 gap-3">
        {SCENARIOS.map((s) => (
          <ScenarioCard key={s.id} config={s} />
        ))}
      </div>

      <BatchModePanel />

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            disabled={retraining}
            onClick={handleRetrain}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {retraining ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Retraining model...</>
            ) : (
              <><RefreshCw className="h-4 w-4" /> Retrain Model</>
            )}
          </button>

          {retrainResult && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Model {retrainResult.version}</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">AUC: {retrainResult.auc_roc.toFixed(4)}</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">{retrainResult.training_samples} samples</span>
              {retrainResult.promoted ? (
                <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/40 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">Promoted</span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">Not promoted</span>
              )}
            </div>
          )}

          {retrainError && (
            <p className="text-sm text-red-600 dark:text-red-400">{retrainError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
