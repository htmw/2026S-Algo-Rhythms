interface StatsCardProps {
  label: string;
  value: number | string;
  icon: string;
  bgColor: string;
}

export default function StatsCard({ label, value, icon, bgColor }: StatsCardProps) {
  return (
    <div style={{
      backgroundColor: "white",
      borderRadius: "12px",
      border: "1px solid #F3F4F6",
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
        <div style={{ fontSize: "13px", color: "#6B7280" }}>{label}</div>
        <div style={{ fontSize: "24px", fontWeight: "700", color: "#111827" }}>{value}</div>
      </div>
    </div>
  );
}