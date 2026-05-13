import type { ReactNode } from "react";
import { useThemeContext } from "../contexts/ThemeContext.js";

interface NotificationCountCardProps {
  label: string;
  value: number | string;
  icon: ReactNode;
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
  const { isDark } = useThemeContext();

  return (
    <div
      style={{
        backgroundColor: isDark ? "#1F2937" : "white",
        borderRadius: "12px",
        border: `0.5px solid ${isDark ? "#374151" : "#E5E7EB"}`,
        padding: "20px",
        display: "flex",
        alignItems: "center",
        gap: "16px",
        flex: 1,
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "10px",
          backgroundColor: bgColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>

      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: "12px",
            color: isDark ? "#9CA3AF" : "#6B7280",
            marginBottom: "4px",
            fontWeight: "500",
          }}
        >
          {label}
        </div>

        {isLoading ? (
          <div
            style={{
              width: "48px",
              height: "28px",
              backgroundColor: isDark ? "#374151" : "#F3F4F6",
              borderRadius: "6px",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
        ) : isError ? (
          <div style={{ fontSize: "13px", color: "#DC2626" }}>
            Error
          </div>
        ) : (
          <div
            style={{
              fontSize: "26px",
              fontWeight: "700",
              color: isDark ? "#F3F4F6" : "#111827",
              lineHeight: 1,
            }}
          >
            {value}
          </div>
        )}
      </div>

      <div
        style={{
          fontSize: "11px",
          color: isDark ? "#6B7280" : "#9CA3AF",
          alignSelf: "flex-end",
        }}
      >
        live
      </div>
    </div>
  );
}
