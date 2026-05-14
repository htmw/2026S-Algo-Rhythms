import { BarChart3, GitBranch, Zap, Target, CheckCircle } from 'lucide-react';

interface PredictionRoutingCardProps {
  routingDecision: {
    mode: string;
    reason: string;
    selected: string;
    exploration: boolean;
    predictions: Record<string, number>;
    model_version: string;
  };
  deliveredVia: string | null;
  status: string | null;
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

export function PredictionRoutingCard({ routingDecision, deliveredVia, status }: PredictionRoutingCardProps) {
  const sortedChannels = Object.entries(routingDecision.predictions)
    .sort(([, a], [, b]) => b - a);

  const maxProbability = sortedChannels.length > 0 ? sortedChannels[0][1] : 1;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Badge className={routingDecision.mode === 'adaptive' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}>
          <GitBranch className="h-3 w-3" />
          {routingDecision.mode === 'adaptive' ? 'Adaptive' : 'Static'}
        </Badge>

        {routingDecision.exploration ? (
          <Badge className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
            <Zap className="h-3 w-3" />
            Exploration
          </Badge>
        ) : (
          <Badge className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">
            <Target className="h-3 w-3" />
            Exploitation
          </Badge>
        )}

        {deliveredVia ? (
          <Badge className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">
            <CheckCircle className="h-3 w-3" />
            Delivered via {deliveredVia}
          </Badge>
        ) : status ? (
          <Badge className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
            {status}
          </Badge>
        ) : null}
      </div>

      <div className="mt-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
          <BarChart3 className="h-3 w-3" />
          Channel Predictions
        </div>
        <div className="space-y-1.5">
          {sortedChannels.map(([channel, probability]) => {
            const isSelected = channel === routingDecision.selected;
            const widthPercent = maxProbability > 0 ? (probability / maxProbability) * 100 : 0;
            return (
              <div key={channel} className="flex items-center gap-2">
                <span className={`w-20 text-xs truncate ${isSelected ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}>
                  {isSelected && <CheckCircle className="inline h-3 w-3 mr-1 text-green-600" />}
                  {channel}
                </span>
                <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
                  <div
                    className={`h-full rounded ${isSelected ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-500'}`}
                    style={{ width: `${widthPercent}%` }}
                  />
                </div>
                <span className={`w-14 text-right text-xs tabular-nums ${isSelected ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
                  {(probability * 100).toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 rounded bg-gray-50 dark:bg-gray-700/50 p-2.5 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
        {routingDecision.reason}
      </div>

      <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
        Model: {routingDecision.model_version}
      </p>
    </div>
  );
}
