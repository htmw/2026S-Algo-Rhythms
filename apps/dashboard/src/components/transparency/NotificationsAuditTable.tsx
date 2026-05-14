import { useState } from "react";
import { useNotifications, useNotification } from "../../hooks/useNotifications";

interface ContentClassification {
  urgency_score: number;
  category: string;
  category_encoded: number;
  time_sensitivity_score: number;
  sentiment_score: number;
  optimal_channel_hint: string;
  reasoning: string;
  keywords?: string[];
}

interface RoutingDecision {
  selected: string;
  reason: string;
  predictions?: Record<string, number>;
  exploration?: boolean;
  model_version?: string;
}

interface AuditNotification {
  id: string;
  recipient: string;
  status: string;
  routing_mode: string;
  content_classification: ContentClassification | null;
  routing_decision: RoutingDecision | null;
  created_at: string;
}

const statusClasses: Record<string, string> = {
  delivered:  "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400",
  failed:     "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400",
  queued:     "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400",
  processing: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400",
  pending:    "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
};

function ExpandedRow({ notificationId }: { notificationId: string }) {
  const { data, isLoading } = useNotification(notificationId);

  const featureVector = data?.delivery_attempts?.[0]?.feature_vector ?? null;

  return (
    <tr>
      <td colSpan={7} className="px-6 py-4 bg-blue-50/50 dark:bg-blue-950/20 border-b border-gray-200 dark:border-gray-700">
        {isLoading ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Loading details...</p>
        ) : (
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Content Classification</p>
              <pre className="text-gray-500 dark:text-gray-400 whitespace-pre-wrap m-0">
                {JSON.stringify(data?.content_classification ?? {}, null, 2)}
              </pre>
            </div>
            <div>
              <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Routing Decision</p>
              <pre className="text-gray-500 dark:text-gray-400 whitespace-pre-wrap m-0">
                {JSON.stringify(data?.routing_decision ?? {}, null, 2)}
              </pre>
            </div>
            <div>
              <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Feature Vector</p>
              {featureVector ? (
                <pre className="text-gray-500 dark:text-gray-400 whitespace-pre-wrap m-0">
                  {JSON.stringify(featureVector, null, 2)}
                </pre>
              ) : (
                <p className="text-gray-400 dark:text-gray-500">No feature vector available.</p>
              )}
              <p className="font-semibold text-gray-700 dark:text-gray-300 mt-3 mb-1.5">Full Notification ID</p>
              <p className="text-gray-400 dark:text-gray-500 font-mono break-all">{notificationId}</p>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

export function NotificationsAuditTable() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading, isError } = useNotifications(50);
  const notifications = (data?.data ?? []) as unknown as AuditNotification[];

  if (isLoading) {
    return <p className="text-sm text-gray-400 dark:text-gray-500">Loading notifications...</p>;
  }

  if (isError) {
    return (
      <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load notifications. Check API connection.
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6 text-sm text-gray-500 dark:text-gray-400">
        No notifications yet. Send one via the API to see data here.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            {["ID", "Recipient", "Urgency", "Category", "Channel", "Routing Reason", "Status"].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {notifications.map((n, i) => (
            <tbody key={n.id}>
              <tr
                onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}
                className={`border-b border-gray-100 dark:border-gray-700 cursor-pointer transition-colors ${
                  expandedId === n.id
                    ? "bg-blue-50 dark:bg-blue-950/30"
                    : i % 2 === 0
                      ? "bg-white dark:bg-gray-800"
                      : "bg-gray-50/50 dark:bg-gray-800/50"
                } hover:bg-blue-50/50 dark:hover:bg-blue-950/20`}
              >
                <td className="px-4 py-3 text-gray-400 dark:text-gray-500 font-mono text-[11px]">
                  {n.id.slice(0, 8)}...
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                  {n.recipient ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {n.content_classification?.urgency_score != null ? (
                    <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400">
                      {n.content_classification.urgency_score.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-gray-300 dark:text-gray-600">{"—"}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {n.content_classification?.category ? (
                    <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                      {n.content_classification.category}
                    </span>
                  ) : (
                    <span className="text-gray-300 dark:text-gray-600">{"—"}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300 capitalize">
                  {n.routing_decision?.selected ?? "—"}
                </td>
                <td className="px-4 py-3 text-gray-400 dark:text-gray-500 max-w-[200px]">
                  <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                    {n.routing_decision?.reason ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusClasses[n.status] ?? "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}>
                    {n.status}
                  </span>
                </td>
              </tr>

              {expandedId === n.id && <ExpandedRow notificationId={n.id} />}
            </tbody>
          ))}
        </tbody>
      </table>
    </div>
  );
}
