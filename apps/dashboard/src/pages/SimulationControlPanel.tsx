import { ComposeNotificationForm } from '../components/ComposeNotificationForm.js';
import { ScenarioLauncher } from '../components/ScenarioLauncher.js';

export function SimulationControlPanel() {
  return (
    <main className="flex-1 bg-gray-50 dark:bg-gray-900 p-8 min-h-screen">
      <div className="mb-7">
        <h1 className="text-[22px] font-bold text-gray-900 dark:text-gray-100">
          Simulation Control Panel
        </h1>
        <p className="text-[13px] text-gray-400 dark:text-gray-500 mt-1">
          Compose, predict, and simulate notification delivery
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <ComposeNotificationForm />
        {/* SCRUM-239: PredictionRoutingCard rendered inline in ComposeNotificationForm after send */}
        {/* SCRUM-241: EngagementResponseCard rendered inline in ComposeNotificationForm after send */}
        <ScenarioLauncher />
      </div>
    </main>
  );
}
