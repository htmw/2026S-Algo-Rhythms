import { useState, type ReactNode } from 'react';
import { ShieldAlert, Megaphone, Zap, Brain, Play, Loader2, RefreshCw } from 'lucide-react';
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
    iconBg: 'bg-red-50',
    defaultCount: 10,
  },
  {
    id: 'marketing_campaign',
    title: 'Marketing Campaign',
    description: 'Send promotional content to all personas. Tests how the model routes low-urgency marketing across channels.',
    icon: <Megaphone className="h-5 w-5 text-blue-600" />,
    borderColor: 'border-l-blue-500',
    iconBg: 'bg-blue-50',
    defaultCount: 10,
  },
  {
    id: 'channel_failure',
    title: 'Channel Failure',
    description: 'Overwhelm email channel to trip the circuit breaker. Tests failover routing behavior.',
    icon: <Zap className="h-5 w-5 text-amber-600" />,
    borderColor: 'border-l-amber-500',
    iconBg: 'bg-amber-50',
    defaultCount: 15,
  },
  {
    id: 'cold_start',
    title: 'Cold Start to Learned',
    description: 'Send mixed content to fresh personas. Retrain the model after completion to show prediction improvement.',
    icon: <Brain className="h-5 w-5 text-green-600" />,
    borderColor: 'border-l-green-500',
    iconBg: 'bg-green-50',
    defaultCount: 5,
  },
];

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
    <div className={`rounded-lg border border-gray-200 ${config.borderColor} border-l-4 bg-white p-4 text-sm flex flex-col`}>
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`flex items-center justify-center rounded-md ${config.iconBg} h-8 w-8`}>
          {config.icon}
        </div>
        <h3 className="text-sm font-semibold text-gray-900">{config.title}</h3>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed mb-3">{config.description}</p>

      <div className="mt-auto space-y-2.5">
        <div className="flex items-center gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Count</label>
            <input
              type="number"
              min={1}
              max={50}
              value={state.count}
              onChange={(e) => setState((s) => ({ ...s, count: Math.max(1, Math.min(50, Number(e.target.value) || 1)) }))}
              disabled={state.loading}
              className="w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 text-center focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Speed</label>
            <div className="flex rounded-md overflow-hidden border border-gray-300">
              <button
                type="button"
                disabled={state.loading}
                onClick={() => setState((s) => ({ ...s, speed: 'sequential' }))}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                  state.speed === 'sequential'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Sequential
              </button>
              <button
                type="button"
                disabled={state.loading}
                onClick={() => setState((s) => ({ ...s, speed: 'burst' }))}
                className={`px-2.5 py-1.5 text-xs font-medium border-l border-gray-300 transition-colors disabled:opacity-50 ${
                  state.speed === 'burst'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
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
          <p className="text-xs text-green-600 font-medium">{state.result}</p>
        )}
        {state.error && (
          <p className="text-xs text-red-600">{state.error}</p>
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
      <h2 className="text-base font-semibold text-gray-900">Scenario Launcher</h2>

      <div className="grid grid-cols-2 gap-3">
        {SCENARIOS.map((s) => (
          <ScenarioCard key={s.id} config={s} />
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
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
              <span className="text-sm font-semibold text-gray-900">Model {retrainResult.version}</span>
              <span className="text-sm text-gray-600">AUC: {retrainResult.auc_roc.toFixed(4)}</span>
              <span className="text-sm text-gray-600">{retrainResult.training_samples} samples</span>
              {retrainResult.promoted ? (
                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Promoted</span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">Not promoted</span>
              )}
            </div>
          )}

          {retrainError && (
            <p className="text-sm text-red-600">{retrainError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
