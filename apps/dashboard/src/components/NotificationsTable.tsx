import { useRecentNotifications } from "../hooks/useRecentNotifications";

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

function SkeletonRow() {
  return (
    <tr style={{ borderTop: "0.5px solid #F3F4F6" }}>
      {[90, 120, 160, 60, 70, 80].map((w, i) => (
        <td key={i} style={{ padding: "14px 20px" }}>
          <div style={{
            width: `${w}px`,
            height: "14px",
            backgroundColor: "#F3F4F6",
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

  return (
    <div style={{
      backgroundColor: "white",
      borderRadius: "12px",
      border: "0.5px solid #E5E7EB",
      overflow: "hidden",
    }}>

      <div style={{
        padding: "16px 20px",
        borderBottom: "0.5px solid #F3F4F6",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: "15px", fontWeight: "600", color: "#111827" }}>
            Recent Notifications
          </div>
          <div style={{ fontSize: "12px", color: "#9CA3AF", marginTop: "2px" }}>
            Fetches from GET /v1/notifications · updates every 30s
          </div>
        </div>
        <button
          onClick={() => refetch()}
          style={{
            fontSize: "12px",
            color: "#2563EB",
            background: "#EFF6FF",
            border: "0.5px solid #BFDBFE",
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
          background: "#FEF2F2",
          borderBottom: "0.5px solid #FECACA",
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
            <tr style={{ backgroundColor: "#F9FAFB" }}>
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
                  color: "#6B7280",
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
                  style={{
                    borderTop: "0.5px solid #F3F4F6",
                    backgroundColor: i % 2 === 0 ? "white" : "#FAFAFA",
                  }}
                >
                  <td style={{
                    padding: "13px 20px",
                    fontFamily: "monospace",
                    fontSize: "11px",
                    color: "#9CA3AF",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {n.id}
                  </td>

                  <td style={{
                    padding: "13px 20px",
                    color: "#111827",
                    fontWeight: "500",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {n.recipient}
                  </td>

                  <td style={{
                    padding: "13px 20px",
                    color: "#6B7280",
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
                    color: "#9CA3AF",
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
        borderTop: "0.5px solid #F3F4F6",
        fontSize: "11px",
        color: "#9CA3AF",
        display: "flex",
        justifyContent: "space-between",
      }}>
        <span>{data?.length ?? 0} notifications</span>
        <span>Auto-refreshes every 30s</span>
      </div>

    </div>
  );
}