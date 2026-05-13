import NotificationCountRow from "../components/NotificationCountRow";
import NotificationsTable from "../components/NotificationsTable";
import { LiveEventFeed } from "../components/LiveEventFeed";

export default function Dashboard() {
  return (
    <main className="flex-1 bg-gray-50 dark:bg-gray-900 p-8 min-h-screen">
      <div className="mb-7">
        <h1 className="text-[22px] font-bold text-gray-900 dark:text-gray-100">
          Dashboard
        </h1>
        <p className="text-[13px] text-gray-400 dark:text-gray-500 mt-1">
          Live updates via Socket.IO
        </p>
      </div>

      <NotificationCountRow />

      <div className="my-7">
        <LiveEventFeed />
      </div>

      <NotificationsTable />
    </main>
  );
}