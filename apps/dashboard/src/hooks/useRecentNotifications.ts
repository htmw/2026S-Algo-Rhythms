import { useQuery } from "@tanstack/react-query";
import { fetchRecentNotifications } from "../services/notificationService";

export function useRecentNotifications() {
  return useQuery({
    queryKey: ["recent-notifications"],
    queryFn: fetchRecentNotifications,
    refetchInterval: 30000,
  });
}