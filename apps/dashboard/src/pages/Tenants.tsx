import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";
import { getApiKey } from "../lib/apiKey";

interface TenantSummary {
  total: number;
  delivered: number;
  failed: number;
  queued: number;
  processing: number;
}

export default function Tenants() {
  const [summary, setSummary] = useState<TenantSummary | null>(null);
  const apiKey = getApiKey();
  const keyPrefix = apiKey ? apiKey.substring(0, 16) + "..." : "not configured";

  useEffect(() => {
    apiFetch<TenantSummary>("/v1/notifications/summary")
      .then(setSummary)
      .catch(() => {});
  }, []);

  return (
    <main className="flex-1 bg-gray-50 dark:bg-gray-900 p-8 min-h-screen">
      <div className="mb-7">
        <h1 className="text-[22px] font-bold text-gray-900 dark:text-gray-100">
          Tenant
        </h1>
        <p className="text-[13px] text-gray-400 dark:text-gray-500 mt-1">
          Current tenant context
        </p>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="rounded-xl bg-white dark:bg-gray-800 p-6 shadow-sm dark:shadow-none">
          <p className="mb-3 text-[13px] font-medium text-gray-500 dark:text-gray-400">
            API KEY
          </p>
          <div className="break-all font-mono text-base font-semibold text-gray-900 dark:text-gray-100">
            {keyPrefix}
          </div>
          <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            Configured via VITE_API_KEY environment variable
          </div>
        </div>

        <div className="rounded-xl bg-white dark:bg-gray-800 p-6 shadow-sm dark:shadow-none">
          <p className="mb-3 text-[13px] font-medium text-gray-500 dark:text-gray-400">
            NOTIFICATION USAGE
          </p>
          {summary ? (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Total", value: summary.total, cls: "text-gray-900 dark:text-gray-100" },
                { label: "Delivered", value: summary.delivered, cls: "text-green-700 dark:text-green-400" },
                { label: "Failed", value: summary.failed, cls: "text-red-600 dark:text-red-400" },
                { label: "Queued", value: summary.queued, cls: "text-amber-700 dark:text-amber-400" },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className={`text-2xl font-bold ${stat.cls}`}>
                    {stat.value}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-gray-400 dark:text-gray-500">Loading...</p>
          )}
        </div>
      </div>
    </main>
  );
}
