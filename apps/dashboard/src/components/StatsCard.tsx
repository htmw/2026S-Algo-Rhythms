import { useThemeContext } from "../contexts/ThemeContext.js";

interface StatsCardProps {
  label: string;
  value: number | string;
  icon: string;
  bgColor: string;
}

export default function StatsCard({ label, value, icon, bgColor }: StatsCardProps) {
  const { isDark } = useThemeContext();

  return (
    <div style={{
      backgroundColor: isDark ? "#1F2937" : "white",
      borderRadius: "12px",
      border: `1px solid ${isDark ? "#374151" : "#F3F4F6"}`,
      padding: "20px",
      display: "flex",
      alignItems: "center",
      gap: "16px",
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
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: "13px", color: isDark ? "#9CA3AF" : "#6B7280" }}>{label}</div>
        <div style={{ fontSize: "24px", fontWeight: "700", color: isDark ? "#F3F4F6" : "#111827" }}>{value}</div>
      </div>
    </div>
  );
}
