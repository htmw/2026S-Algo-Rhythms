import { NotificationsAuditTable } from "../components/transparency/NotificationsAuditTable";
import { RecipientIntelligencePanel } from "../components/transparency/RecipientIntelligencePanel";
import { StaticVsAdaptiveChart } from "../components/transparency/StaticVsAdaptiveChart";
import { ModelMetricsPanel } from "../components/transparency/ModelMetricsPanel";

export function DataTransparency() {
  return (
    <main className="flex-1 bg-gray-50 dark:bg-gray-900 p-8 min-h-screen overflow-y-auto">
      <div className="mb-7">
        <h1 className="text-[22px] font-bold text-gray-900 dark:text-gray-100">
          Data Transparency
        </h1>
        <p className="text-[13px] text-gray-400 dark:text-gray-500 mt-1">
          Sprint 3 · Live ML learning evidence — notifications, engagement history, and model metrics
        </p>
      </div>

      <section className="mb-8">
        <h2 className="text-[15px] font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Notifications Audit
        </h2>
        <NotificationsAuditTable />
      </section>

      <section className="mb-8">
        <h2 className="text-[15px] font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Recipient Intelligence
        </h2>
        <RecipientIntelligencePanel />
      </section>

      <section className="mb-8">
        <h2 className="text-[15px] font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Model Metrics
        </h2>
        <ModelMetricsPanel />
      </section>

      <section className="mb-8">
        <h2 className="text-[15px] font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Static vs Adaptive Engagement
        </h2>
        <StaticVsAdaptiveChart />
      </section>
    </main>
  );
}
