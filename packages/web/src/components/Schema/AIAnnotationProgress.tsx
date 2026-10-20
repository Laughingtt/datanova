interface AIAnnotationProgressProps {
  status: "discovering" | "analyzing" | "generating" | "done" | "error";
  message: string;
  tableCount: number;
  completedCount: number;
}

const STATUS_ICONS: Record<string, string> = {
  discovering: "🔍",
  analyzing: "🧠",
  generating: "✍️",
  done: "✅",
  error: "❌",
};

export default function AIAnnotationProgress({
  status,
  message,
  tableCount,
  completedCount,
}: AIAnnotationProgressProps) {
  const progress = tableCount > 0 ? Math.round((completedCount / tableCount) * 100) : 0;
  const isRunning = status !== "done" && status !== "error";

  return (
    <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-xs)]">
      <div className="flex items-center gap-3 mb-3">
        <span className={`text-lg ${isRunning ? "animate-pulse" : ""}`}>
          {STATUS_ICONS[status] ?? "🔄"}
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium text-[var(--foreground)]">{message}</p>
          {tableCount > 0 && (
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              {completedCount}/{tableCount} tables processed
            </p>
          )}
        </div>
      </div>

      {isRunning && tableCount > 0 && (
        <div className="w-full h-1.5 bg-[var(--muted)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--primary)] rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {status === "error" && (
        <p className="text-xs text-[var(--error)] mt-2">{message}</p>
      )}
    </div>
  );
}
