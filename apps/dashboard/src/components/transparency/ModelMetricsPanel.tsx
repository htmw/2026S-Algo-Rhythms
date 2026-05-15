import { ArrowUp, ArrowDown } from "lucide-react";
import { useModelMetrics, useModelHistory } from "../../hooks/useModelMetrics";

function MetricDelta({ current, previous, label }: { current: number | null; previous: number | null; label: string }) {
  if (current == null || previous == null) return <span className="text-gray-400 dark:text-gray-500">—</span>;
  const delta = current - previous;
  const improved = delta > 0;
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-gray-500 dark:text-gray-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{current.toFixed(4)}</span>
        <span className={`flex items-center gap-0.5 text-xs font-medium ${improved ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
          {improved ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {Math.abs(delta).toFixed(4)}
        </span>
      </div>
    </div>
  );
}

export function ModelMetricsPanel() {
  const { data: model, isLoading, isError } = useModelMetrics();
  const { data: historyData } = useModelHistory();

  if (isLoading) {
    return (
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading model info...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load model metrics. Check API connection.
      </div>
    );
  }

  if (!model?.loaded) {
    return (
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">No model trained yet.</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Send notifications with adaptive routing to generate training data.
        </p>
      </div>
    );
  }

  const features = model.feature_importance
    ? Object.entries(model.feature_importance).sort(([, a], [, b]) => b - a)
    : [];
  const maxVal = features.length > 0 ? Math.max(...features.map(([, v]) => v)) : 1;

  const history = historyData?.data ?? [];
  const current = history[0] ?? null;
  const previous = history[1] ?? null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-5">
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
          <p className="text-[13px] text-gray-500 dark:text-gray-400 font-medium mb-4 uppercase">
            Model Metadata
          </p>
          <div className="flex flex-col gap-3">
            {[
              { label: "Version", value: model.version ?? "—" },
              { label: "Training Samples", value: model.training_samples?.toLocaleString() ?? "—" },
              { label: "Status", value: model.loaded ? "Active" : "Not loaded" },
              ...(model.metrics
                ? Object.entries(model.metrics).map(([k, v]) => ({
                    label: k.toUpperCase(),
                    value: typeof v === "number" ? v.toFixed(4) : String(v),
                  }))
                : []),
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center">
                <span className="text-[13px] text-gray-500 dark:text-gray-400">{label}</span>
                <span
                  className={`text-[13px] font-semibold ${
                    label === "Status"
                      ? model.loaded
                        ? "bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-2.5 py-0.5 rounded-full"
                        : "bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-2.5 py-0.5 rounded-full"
                      : "text-gray-900 dark:text-gray-100"
                  }`}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
          <p className="text-[13px] text-gray-500 dark:text-gray-400 font-medium mb-4 uppercase">
            Feature Importance
          </p>
          {features.length > 0 ? (
            <div className="flex flex-col gap-3">
              {features.map(([name, importance]) => (
                <div key={name}>
                  <div className="flex justify-between mb-1">
                    <span className="text-[13px] text-gray-700 dark:text-gray-300">{name}</span>
                    <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                      {(importance * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
                    <div
                      className="h-full bg-blue-600 dark:bg-blue-500 rounded transition-all duration-500"
                      style={{ width: `${(importance / maxVal) * 100}%` }}
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

      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
        <p className="text-[13px] text-gray-500 dark:text-gray-400 font-medium mb-4 uppercase">
          Pre/Post Retrain Comparison
        </p>
        {current && previous ? (
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center text-xs text-gray-400 dark:text-gray-500 mb-1">
              <span>Previous: {previous.version} ({new Date(previous.created_at).toLocaleDateString()})</span>
              <span>Current: {current.version} ({new Date(current.created_at).toLocaleDateString()})</span>
            </div>
            <MetricDelta current={current.auc_roc} previous={previous.auc_roc} label="AUC-ROC" />
            <MetricDelta current={current.accuracy} previous={previous.accuracy} label="Accuracy" />
            <MetricDelta current={current.precision_score} previous={previous.precision_score} label="Precision" />
            <MetricDelta current={current.recall_score} previous={previous.recall_score} label="Recall" />
            <MetricDelta current={current.f1_score} previous={previous.f1_score} label="F1 Score" />
            <div className="flex justify-between items-center">
              <span className="text-[13px] text-gray-500 dark:text-gray-400">Training Samples</span>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                  {current.training_samples.toLocaleString()}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  (was {previous.training_samples.toLocaleString()})
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            No previous model to compare. A comparison will appear after the first retrain.
          </p>
        )}
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          Compares the most recent retrain against the previously active model to show whether performance improved.
        </p>
      </div>

      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
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
  );
}
