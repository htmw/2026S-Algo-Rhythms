interface NotificationCountCardProps {
  label: string;
  value: number | string;
  icon: string;
  bgColor: string;
  isLoading?: boolean;
  isError?: boolean;
}

export default function NotificationCountCard({
  label,
  value,
  icon,
  bgColor,
  isLoading = false,
  isError = false,
}: NotificationCountCardProps) {
  return (
    <div style={{
      backgroundColor: "white",
      borderRadius: "12px",
      border: "0.5px solid #E5E7EB",
      padding: "20px",
      display: "flex",
      alignItems: "center",
      gap: "16px",
      flex: 1,
    }}>

      <div style={{
        width: "48px",
        height: "48px",
        borderRadius: "10px",
        backgroundColor: bgColor,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "22px",
        flexShrink: 0,
      }}>
        {icon}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: "12px",
          color: "#6B7280",
          marginBottom: "4px",
          fontWeight: "500",
        }}>
          {label}
        </div>

        {isLoading ? (
          <div style={{
            width: "48px",
            height: "28px",
            backgroundColor: "#F3F4F6",
            borderRadius: "6px",
            animation: "pulse 1.5s ease-in-out infinite",
          }} />
        ) : isError ? (
          <div style={{ fontSize: "13px", color: "#DC2626" }}>Error</div>
        ) : (
          <div style={{
            fontSize: "26px",
            fontWeight: "700",
            color: "#111827",
            lineHeight: 1,
          }}>
            {value}
          </div>
        )}
      </div>

      <div style={{
        fontSize: "11px",
        color: "#9CA3AF",
        alignSelf: "flex-end",
      }}>
        live
      </div>
    </div>
  );
}