import { useQuery } from "@tanstack/react-query";
import { fetchNotificationSummary } from "../services/notificationService";

export function useNotificationSummary() {
  return useQuery({
    queryKey: ["notification-summary"],
    queryFn: fetchNotificationSummary,
    refetchInterval: 30000,
  });
}