import NotificationsTable from "../components/NotificationsTable";

export default function Notifications() {
  return (
    <main className="flex-1 bg-gray-50 dark:bg-gray-900 p-8 min-h-screen">
      <div className="mb-7">
        <h1 className="text-[22px] font-bold text-gray-900 dark:text-gray-100">
          Notifications
        </h1>
        <p className="text-[13px] text-gray-400 dark:text-gray-500 mt-1">
          All notifications for this tenant
        </p>
      </div>

      <NotificationsTable />
    </main>
  );
}
