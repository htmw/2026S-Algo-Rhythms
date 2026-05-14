import { useState } from "react";
import { useRecipients, useRecipientEngagement } from "../../hooks/useRecipients";

export function RecipientIntelligencePanel() {
  const [selected, setSelected] = useState("");
  const { data: recipientData, isLoading: recipientsLoading, isError: recipientsError } = useRecipients();
  const { data: engagementData, isLoading: engagementLoading, isError: engagementError } = useRecipientEngagement(selected);

  const recipients = recipientData?.data ?? [];
  const history = engagementData?.data ?? [];
  const totalSent = history.reduce((s, r) => s + r.sent, 0);
  const totalEngaged = history.reduce((s, r) => s + r.engaged, 0);

  return (
    <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
      <div className="mb-5">
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
          Select Recipient
        </label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full max-w-[400px] px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
        >
          <option value="">Choose a recipient...</option>
          {recipients.map((r) => (
            <option key={r.recipient} value={r.recipient}>
              {r.recipient} ({r.total_sent} sent)
            </option>
          ))}
        </select>
      </div>

      {recipientsLoading && (
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading recipients...</p>
      )}

      {recipientsError && (
        <p className="text-sm text-red-500 dark:text-red-400">Failed to load recipients. Check API connection.</p>
      )}

      {engagementLoading && selected && (
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading engagement data...</p>
      )}

      {engagementError && selected && (
        <p className="text-sm text-red-500 dark:text-red-400">Failed to load engagement data.</p>
      )}

      {!engagementLoading && selected && history.length === 0 && !engagementError && (
        <p className="text-sm text-gray-400 dark:text-gray-500">No engagement data yet for this recipient.</p>
      )}

      {!engagementLoading && history.length > 0 && (
        <>
          <div className="flex gap-3 mb-5">
            {[
              { label: "Total Sent", value: totalSent, textClass: "text-blue-600 dark:text-blue-400" },
              { label: "Total Engaged", value: totalEngaged, textClass: "text-green-600 dark:text-green-400" },
              {
                label: "Overall Rate",
                value: totalSent > 0 ? ((totalEngaged / totalSent) * 100).toFixed(1) + "%" : "0%",
                textClass: "text-purple-600 dark:text-purple-400",
              },
            ].map((s) => (
              <div key={s.label} className="flex-1 bg-gray-50 dark:bg-gray-900 rounded-lg px-4 py-3">
                <p className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold uppercase m-0">{s.label}</p>
                <p className={`text-[22px] font-bold mt-1 m-0 ${s.textClass}`}>{s.value}</p>
              </div>
            ))}
          </div>

          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                {["Channel", "Sent", "Engaged", "Rate"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500 dark:text-gray-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((row) => {
                const rate = row.sent > 0 ? (row.engaged / row.sent) * 100 : 0;
                return (
                  <tr key={row.channel} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-gray-100 capitalize">{row.channel}</td>
                    <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">{row.sent}</td>
                    <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">{row.engaged}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              rate > 50 ? "bg-green-500" : rate > 20 ? "bg-yellow-500" : "bg-red-500"
                            }`}
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 min-w-[36px]">
                          {rate.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {!selected && recipients.length === 0 && !recipientsLoading && !recipientsError && (
        <p className="text-sm text-gray-400 dark:text-gray-500">No recipients yet. Send notifications to see data here.</p>
      )}
    </div>
  );
}
