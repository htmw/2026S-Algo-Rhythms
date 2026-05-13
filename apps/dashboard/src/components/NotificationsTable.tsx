import { useRecentNotifications } from "../hooks/useRecentNotifications";
import { useThemeContext } from "../contexts/ThemeContext.js";

const statusStyle: Record<string, { bg: string; color: string }> = {
  delivered:  { bg: "#DCFCE7", color: "#15803D" },
  failed:     { bg: "#FEE2E2", color: "#DC2626" },
  queued:     { bg: "#FEF9C3", color: "#A16207" },
  processing: { bg: "#DBEAFE", color: "#1D4ED8" },
};

const channelStyle: Record<string, { bg: string; color: string }> = {
  email: { bg: "#EDE9FE", color: "#6D28D9" },
  push:  { bg: "#FFEDD5", color: "#C2410C" },
  sms:   { bg: "#CCFBF1", color: "#0F766E" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SkeletonRow({ isDark }: { isDark: boolean }) {
  return (
    <tr style={{ borderTop: `0.5px solid ${isDark ? "#374151" : "#F3F4F6"}` }}>
      {[90, 120, 160, 60, 70, 80].map((w, i) => (
        <td key={i} style={{ padding: "14px 20px" }}>
          <div style={{
            width: `${w}px`,
            height: "14px",
            backgroundColor: isDark ? "#374151" : "#F3F4F6",
            borderRadius: "4px",
            animation: "pulse 1.5s ease-in-out infinite",
          }} />
        </td>
      ))}
    </tr>
  );
}

export default function NotificationsTable() {
  const { data, isLoading, isError, refetch } = useRecentNotifications();
  const { isDark } = useThemeContext();

  const containerBg = isDark ? "#1F2937" : "white";
  const borderColor = isDark ? "#374151" : "#E5E7EB";
  const dividerColor = isDark ? "#374151" : "#F3F4F6";
  const headerBg = isDark ? "#111827" : "#F9FAFB";
  const titleColor = isDark ? "#F3F4F6" : "#111827";
  const labelColor = isDark ? "#9CA3AF" : "#6B7280";
  const mutedColor = isDark ? "#6B7280" : "#9CA3AF";
  const recipientColor = isDark ? "#F3F4F6" : "#111827";
  const msgColor = isDark ? "#9CA3AF" : "#6B7280";
  const evenRowBg = isDark ? "#1F2937" : "white";
  const oddRowBg = isDark ? "#1a2332" : "#FAFAFA";

  return (
    <div style={{
      backgroundColor: containerBg,
      borderRadius: "12px",
      border: `0.5px solid ${borderColor}`,
      overflow: "hidden",
    }}>

      <div style={{
        padding: "16px 20px",
        borderBottom: `0.5px solid ${dividerColor}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: "15px", fontWeight: "600", color: titleColor }}>
            Recent Notifications
          </div>
          <div style={{ fontSize: "12px", color: mutedColor, marginTop: "2px" }}>
            Fetches from GET /v1/notifications · updates every 30s
          </div>
        </div>
        <button
          onClick={() => refetch()}
          style={{
            fontSize: "12px",
            color: "#2563EB",
            background: isDark ? "#1E3A5F" : "#EFF6FF",
            border: `0.5px solid ${isDark ? "#2563EB" : "#BFDBFE"}`,
            borderRadius: "6px",
            padding: "6px 12px",
            cursor: "pointer",
            fontWeight: "500",
          }}
        >
          Refresh
        </button>
      </div>

      {isError && (
        <div style={{
          padding: "20px",
          color: "#DC2626",
          fontSize: "13px",
          background: isDark ? "#3B1111" : "#FEF2F2",
          borderBottom: `0.5px solid ${isDark ? "#7F1D1D" : "#FECACA"}`,
        }}>
          Failed to load notifications. Check API connection.
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "13px",
          tableLayout: "fixed",
        }}>
          <thead>
            <tr style={{ backgroundColor: headerBg }}>
              {[
                { label: "ID",        width: "100px" },
                { label: "Recipient", width: "150px" },
                { label: "Message",   width: "auto"  },
                { label: "Channel",   width: "80px"  },
                { label: "Status",    width: "100px" },
                { label: "Sent At",   width: "110px" },
              ].map(({ label, width }) => (
                <th key={label} style={{
                  padding: "10px 20px",
                  textAlign: "left",
                  fontSize: "11px",
                  fontWeight: "600",
                  color: labelColor,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  width,
                }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <>
                <SkeletonRow isDark={isDark} />
                <SkeletonRow isDark={isDark} />
                <SkeletonRow isDark={isDark} />
                <SkeletonRow isDark={isDark} />
                <SkeletonRow isDark={isDark} />
              </>
            ) : (
              data?.map((n, i) => (
                <tr
                  key={n.id}
                  style={{
                    borderTop: `0.5px solid ${dividerColor}`,
                    backgroundColor: i % 2 === 0 ? evenRowBg : oddRowBg,
                  }}
                >
                  <td style={{
                    padding: "13px 20px",
                    fontFamily: "monospace",
                    fontSize: "11px",
                    color: mutedColor,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {n.id}
                  </td>

                  <td style={{
                    padding: "13px 20px",
                    color: recipientColor,
                    fontWeight: "500",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {n.recipient}
                  </td>

                  <td style={{
                    padding: "13px 20px",
                    color: msgColor,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {n.message}
                  </td>

                  <td style={{ padding: "13px 20px" }}>
                    <span style={{
                      padding: "3px 10px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontWeight: "500",
                      backgroundColor: channelStyle[n.channel]?.bg,
                      color: channelStyle[n.channel]?.color,
                    }}>
                      {n.channel}
                    </span>
                  </td>

                  <td style={{ padding: "13px 20px" }}>
                    <span style={{
                      padding: "3px 10px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontWeight: "500",
                      backgroundColor: statusStyle[n.status]?.bg,
                      color: statusStyle[n.status]?.color,
                    }}>
                      {n.status}
                    </span>
                  </td>

                  <td style={{
                    padding: "13px 20px",
                    color: mutedColor,
                    fontSize: "11px",
                    whiteSpace: "nowrap",
                  }}>
                    {formatDate(n.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{
        padding: "10px 20px",
        borderTop: `0.5px solid ${dividerColor}`,
        fontSize: "11px",
        color: mutedColor,
        display: "flex",
        justifyContent: "space-between",
      }}>
        <span>{data?.length ?? 0} notifications</span>
        <span>Auto-refreshes every 30s</span>
      </div>

    </div>
  );
}
