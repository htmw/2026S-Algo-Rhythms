import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";

interface RoutingDecision {
  mode: string;
  selected: string;
  predictions: Record<string, number>;
  exploration: boolean;
  reason: string;
  model_version: string;
}

interface NotificationListItem {
  id: string;
  routing_mode: string;
  routing_decision: RoutingDecision | null;
}

interface ModelInfo {
  loaded: boolean;
  version?: string;
  metrics?: Record<string, number>;
  feature_importance?: Record<string, number>;
}

const channelColors: Record<string, string> = {
  email: "#2563EB",
  sms_webhook: "#16A34A",
  websocket: "#9333EA",
  webhook: "#EA580C",
};

export default function RoutingIntelligence() {
  const [routing, setRouting] = useState<RoutingDecision | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const notifResp = await apiFetch<{ data: NotificationListItem[] }>("/v1/notifications?limit=20");
        const items = notifResp.data ?? [];

        const adaptive = items.find(
          (n) => n.routing_decision?.mode === "adaptive" && n.routing_decision?.predictions,
        );
        const fallback = items.find((n) => n.routing_decision != null);
        const best = adaptive ?? fallback;

        if (best?.routing_decision) {
          setRouting(best.routing_decision);
        }
      } catch {
        // API unreachable — page shows empty state
      }

      try {
        const mlResp = await apiFetch<ModelInfo>("/v1/routing/model");
        setModelInfo(mlResp);
      } catch (err) {
        console.error("Failed to fetch model info:", err);
      }

      setLoading(false);
    };

    void fetchData();
  }, []);

  const selectedChannel = routing?.selected ?? "—";
  const confidence = routing?.predictions?.[selectedChannel] ?? 0;
  const modelVersion = modelInfo?.version ?? routing?.model_version ?? "—";
  const exploration = routing?.exploration ?? false;
  const reason = routing?.reason ?? "";

  const features = modelInfo?.feature_importance
    ? Object.entries(modelInfo.feature_importance)
        .sort(([, a], [, b]) => b - a)
        .map(([name, importance]) => ({ name, importance }))
    : [];

  const maxImportance = features.length > 0 ? Math.max(...features.map((f) => f.importance)) : 1;

  if (loading) {
    return (
      <main className="flex-1 bg-gray-50 dark:bg-gray-900 p-8 min-h-screen">
        <p className="text-gray-400 dark:text-gray-500">Loading routing data...</p>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-gray-50 dark:bg-gray-900 p-8 min-h-screen">
      <div className="mb-7">
        <h1 className="text-[22px] font-bold text-gray-900 dark:text-gray-100">
          Routing Intelligence
        </h1>
        <p className="text-[13px] text-gray-400 dark:text-gray-500 mt-1">
          ML-powered channel selection
        </p>
      </div>

      {!routing && (
        <div className="mb-5 rounded-xl bg-white dark:bg-gray-800 p-6 text-sm text-gray-500 dark:text-gray-400 shadow-sm dark:shadow-none">
          No routing decisions yet. Send a notification with routing_mode: adaptive to see data here.
        </div>
      )}

      <div className="grid grid-cols-2 gap-5">

        {/* Selected Channel Card */}
        <div className="rounded-xl bg-white dark:bg-gray-800 p-6 shadow-sm dark:shadow-none">
          <p className="mb-3 text-[13px] font-medium text-gray-500 dark:text-gray-400">
            SELECTED CHANNEL
          </p>
          <div className="flex items-center gap-4">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-xl text-2xl font-bold text-white"
              style={{ backgroundColor: channelColors[selectedChannel] ?? "#6B7280" }}
            >
              {selectedChannel.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="text-2xl font-bold capitalize text-gray-900 dark:text-gray-100">
                {selectedChannel}
              </div>
              <div className="text-[13px] text-gray-500 dark:text-gray-400">
                {exploration ? "Exploration (random)" : "Exploitation (model pick)"}
              </div>
            </div>
          </div>
          {reason && (
            <div className="mt-3 text-xs text-gray-400 dark:text-gray-500">
              {reason}
            </div>
          )}
        </div>

        {/* Prediction Scores Card */}
        <div className="rounded-xl bg-white dark:bg-gray-800 p-6 shadow-sm dark:shadow-none">
          <p className="mb-3 text-[13px] font-medium text-gray-500 dark:text-gray-400">
            PREDICTION SCORES
          </p>
          {routing?.predictions ? (
            <div className="flex flex-col gap-2.5">
              {Object.entries(routing.predictions)
                .sort(([, a], [, b]) => b - a)
                .map(([channel, score]) => {
                  const isSelected = channel === selectedChannel;
                  return (
                    <div key={channel}>
                      <div className="mb-1 flex justify-between">
                        <span className={`text-[13px] ${isSelected ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
                          {channel}
                        </span>
                        <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                          {(score * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded bg-gray-100 dark:bg-gray-700">
                        <div
                          className={`h-full rounded transition-all duration-500 ${isSelected ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-500'}`}
                          style={{ width: `${score * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="text-[40px] font-bold text-green-600">
              {(confidence * 100).toFixed(0)}%
            </div>
          )}
        </div>

        {/* Model Version Card */}
        <div className="rounded-xl bg-white dark:bg-gray-800 p-6 shadow-sm dark:shadow-none">
          <p className="mb-3 text-[13px] font-medium text-gray-500 dark:text-gray-400">
            MODEL VERSION
          </p>
          <div className="break-all text-xl font-bold text-gray-900 dark:text-gray-100">
            {modelVersion}
          </div>
          {modelInfo?.metrics && (
            <div className="mt-3 flex flex-wrap gap-4">
              {Object.entries(modelInfo.metrics).map(([key, val]) => (
                <div key={key} className="text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-semibold text-gray-600 dark:text-gray-300">{key}:</span>{" "}
                  {typeof val === "number" ? val.toFixed(4) : String(val)}
                </div>
              ))}
            </div>
          )}
          <div className={`mt-3 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
            modelInfo?.loaded
              ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
              : 'bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400'
          }`}>
            {modelInfo?.loaded ? "Active" : "Not loaded"}
          </div>
          <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-3">
            <p className="mb-2 text-xs font-medium text-slate-400 dark:text-slate-500">Metric Legend</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-slate-500 dark:text-slate-400 font-medium">Accuracy</dt>
              <dd className="text-slate-400 dark:text-slate-500">Percentage of predictions that were correct</dd>
              <dt className="text-slate-500 dark:text-slate-400 font-medium">AUC-ROC</dt>
              <dd className="text-slate-400 dark:text-slate-500">How well the model separates &ldquo;will engage&rdquo; from &ldquo;won&rsquo;t&rdquo; across all thresholds (promotion gate)</dd>
              <dt className="text-slate-500 dark:text-slate-400 font-medium">Precision</dt>
              <dd className="text-slate-400 dark:text-slate-500">When predicting engagement, how often was it right</dd>
              <dt className="text-slate-500 dark:text-slate-400 font-medium">Recall</dt>
              <dd className="text-slate-400 dark:text-slate-500">Of all actual engagements, how many did the model catch</dd>
              <dt className="text-slate-500 dark:text-slate-400 font-medium">F1</dt>
              <dd className="text-slate-400 dark:text-slate-500">Harmonic mean of precision and recall</dd>
              <dt className="text-slate-500 dark:text-slate-400 font-medium">Training Samples</dt>
              <dd className="text-slate-400 dark:text-slate-500">Data points the model learned from</dd>
              <dt className="text-slate-500 dark:text-slate-400 font-medium">Test Samples</dt>
              <dd className="text-slate-400 dark:text-slate-500">Held-out data points used to evaluate the model</dd>
            </dl>
          </div>
        </div>

        {/* Feature Importance Chart */}
        <div className="rounded-xl bg-white dark:bg-gray-800 p-6 shadow-sm dark:shadow-none">
          <p className="mb-4 text-[13px] font-medium text-gray-500 dark:text-gray-400">
            FEATURE IMPORTANCE
          </p>
          {features.length > 0 ? (
            <div className="flex flex-col gap-3">
              {features.map((feature) => (
                <div key={feature.name}>
                  <div className="mb-1 flex justify-between">
                    <span className="text-[13px] text-gray-600 dark:text-gray-300">{feature.name}</span>
                    <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                      {(feature.importance * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-gray-100 dark:bg-gray-700">
                    <div
                      className="h-full rounded bg-blue-600 transition-all duration-500"
                      style={{ width: `${(feature.importance / maxImportance) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-gray-400 dark:text-gray-500">
              No feature importance data available. Train the model first.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
