import type { ReactNode } from "react";

interface NotificationCountCardProps {
  label: string;
  value: number | string;
  icon: ReactNode;
  bgColor: string;
  isLoading?: boolean;
  isError?: boolean;
}

export default function NotificationCountCard({
  label,
  value,
  icon,
  bgColor,
  isLoading = false,
  isError = false,
}: NotificationCountCardProps) {
  return (
    <div className="flex flex-1 items-center gap-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px]"
        style={{ backgroundColor: bgColor }}
      >
        {icon}
      </div>

      <div className="flex-1">
        <div className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
          {label}
        </div>

        {isLoading ? (
          <div className="h-7 w-12 rounded-md bg-gray-100 dark:bg-gray-700" style={{ animation: "pulse 1.5s ease-in-out infinite" }} />
        ) : isError ? (
          <div className="text-[13px] text-red-600">Error</div>
        ) : (
          <div className="text-[26px] font-bold leading-none text-gray-900 dark:text-gray-100">
            {value}
          </div>
        )}
      </div>

      <div className="self-end text-[11px] text-gray-400 dark:text-gray-500">
        live
      </div>
    </div>
  );
}
