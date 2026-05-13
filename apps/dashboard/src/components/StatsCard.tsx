interface StatsCardProps {
  label: string;
  value: number | string;
  icon: string;
  bgColor: string;
}

export default function StatsCard({ label, value, icon, bgColor }: StatsCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-[10px] text-[22px]"
        style={{ backgroundColor: bgColor }}
      >
        {icon}
      </div>
      <div>
        <div className="text-[13px] text-gray-500 dark:text-gray-400">{label}</div>
        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
      </div>
    </div>
  );
}
