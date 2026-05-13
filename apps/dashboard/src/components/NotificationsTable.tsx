import { useRecentNotifications } from "../hooks/useRecentNotifications";

const statusClasses: Record<string, string> = {
  delivered:  "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400",
  failed:     "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400",
  queued:     "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400",
  processing: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400",
};

const channelClasses: Record<string, string> = {
  email: "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400",
  push:  "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400",
  sms:   "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SkeletonRow() {
  return (
    <tr className="border-t border-gray-100 dark:border-gray-700">
      {[90, 120, 160, 60, 70, 80].map((w, i) => (
        <td key={i} className="px-5 py-3.5">
          <div
            className="h-3.5 rounded bg-gray-100 dark:bg-gray-700"
            style={{ width: `${w}px`, animation: "pulse 1.5s ease-in-out infinite" }}
          />
        </td>
      ))}
    </tr>
  );
}

export default function NotificationsTable() {
  const { data, isLoading, isError, refetch } = useRecentNotifications();

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">

      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 px-5 py-4">
        <div>
          <div className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">
            Recent Notifications
          </div>
          <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            Fetches from GET /v1/notifications · updates every 30s
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/40 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60"
        >
          Refresh
        </button>
      </div>

      {isError && (
        <div className="border-b border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 px-5 py-5 text-[13px] text-red-600 dark:text-red-400">
          Failed to load notifications. Check API connection.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900">
              {[
                { label: "ID",        width: "100px" },
                { label: "Recipient", width: "150px" },
                { label: "Message",   width: "auto"  },
                { label: "Channel",   width: "80px"  },
                { label: "Status",    width: "100px" },
                { label: "Sent At",   width: "110px" },
              ].map(({ label, width }) => (
                <th
                  key={label}
                  className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  style={{ width }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : (
              data?.map((n, i) => (
                <tr
                  key={n.id}
                  className={`border-t border-gray-100 dark:border-gray-700 ${
                    i % 2 === 0
                      ? 'bg-white dark:bg-gray-800'
                      : 'bg-gray-50/50 dark:bg-gray-800/50'
                  }`}
                >
                  <td className="truncate px-5 py-3 font-mono text-[11px] text-gray-400 dark:text-gray-500">
                    {n.id}
                  </td>

                  <td className="truncate px-5 py-3 font-medium text-gray-900 dark:text-gray-100">
                    {n.recipient}
                  </td>

                  <td className="truncate px-5 py-3 text-gray-500 dark:text-gray-400">
                    {n.message}
                  </td>

                  <td className="px-5 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${channelClasses[n.channel] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                      {n.channel}
                    </span>
                  </td>

                  <td className="px-5 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusClasses[n.status] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                      {n.status}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-5 py-3 text-[11px] text-gray-400 dark:text-gray-500">
                    {formatDate(n.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between border-t border-gray-100 dark:border-gray-700 px-5 py-2.5 text-[11px] text-gray-400 dark:text-gray-500">
        <span>{data?.length ?? 0} notifications</span>
        <span>Auto-refreshes every 30s</span>
      </div>

    </div>
  );
}
