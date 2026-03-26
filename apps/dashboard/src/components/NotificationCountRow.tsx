import NotificationCountCard from "./NotificationCountCard";
import { useNotificationSummary } from "../hooks/useNotificationSummary";

export default function NotificationCountRow() {
  const { data, isLoading, isError } = useNotificationSummary();

  const cards = [
    {
      label: "Total Notifications",
      value: data?.total ?? 0,
      icon: "🔔",
      bgColor: "#EFF6FF",
    },
    {
      label: "Delivered",
      value: data?.delivered ?? 0,
      icon: "✅",
      bgColor: "#F0FDF4",
    },
    {
      label: "Failed",
      value: data?.failed ?? 0,
      icon: "❌",
      bgColor: "#FEF2F2",
    },
    {
      label: "Queued / Processing",
      value: (data?.queued ?? 0) + (data?.processing ?? 0),
      icon: "⏳",
      bgColor: "#FEFCE8",
    },
  ];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gap: "12px",
      marginBottom: "24px",
    }}>
      {cards.map((card) => (
        <NotificationCountCard
          key={card.label}
          label={card.label}
          value={card.value}
          icon={card.icon}
          bgColor={card.bgColor}
          isLoading={isLoading}
          isError={isError}
        />
      ))}
    </div>
  );
}