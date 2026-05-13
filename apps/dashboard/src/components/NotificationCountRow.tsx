import {
  Bell,
  CheckCircle,
  XCircle,
  Hourglass,
} from "lucide-react";

import NotificationCountCard from "./NotificationCountCard";
import { useNotificationSummary } from "../hooks/useNotificationSummary";

export default function NotificationCountRow() {
  const { data, isLoading, isError } = useNotificationSummary();

  const cards = [
    {
      label: "Total Notifications",
      value: data?.total ?? 0,
      icon: <Bell className="h-5 w-5 text-blue-600" />,
      bgColor: "#EFF6FF",
    },
    {
      label: "Delivered",
      value: data?.delivered ?? 0,
      icon: <CheckCircle className="h-5 w-5 text-green-600" />,
      bgColor: "#F0FDF4",
    },
    {
      label: "Failed",
      value: data?.failed ?? 0,
      icon: <XCircle className="h-5 w-5 text-red-600" />,
      bgColor: "#FEF2F2",
    },
    {
      label: "Queued / Processing",
      value: (data?.queued ?? 0) + (data?.processing ?? 0),
      icon: <Hourglass className="h-5 w-5 text-yellow-600" />,
      bgColor: "#FEFCE8",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: "12px",
        marginBottom: "24px",
      }}
    >
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