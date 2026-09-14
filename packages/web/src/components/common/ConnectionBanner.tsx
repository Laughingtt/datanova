import { useConnectionStore } from "../../stores/connection";

const CONFIG = {
  connected:    { visible: false, dot: "bg-[var(--success)]", text: "",                  label: "已连接" },
  connecting:   { visible: true,  dot: "bg-[var(--warning)]", text: "正在连接服务器…",    label: "连接中" },
  reconnecting: { visible: true,  dot: "bg-[var(--warning)]", text: "连接断开，正在重连…", label: "重连中" },
  disconnected: { visible: true,  dot: "bg-[var(--error)]",   text: "无法连接到服务器",    label: "已断开" },
} as const;

export default function ConnectionBanner() {
  const { status, attempts, lastError, reconnect } = useConnectionStore();
  const cfg = CONFIG[status];
  if (!cfg.visible) return null;

  const isDisconnected = status === "disconnected";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium border-b ${
        isDisconnected
          ? "bg-[var(--error-soft)] text-[var(--error)] border-[var(--error)]/20"
          : "bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning)]/20"
      }`}
    >
      <span className="relative flex">
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {!isDisconnected && (
          <span
            className={`absolute inset-0 rounded-full ${cfg.dot} animate-ping`}
            aria-hidden="true"
          />
        )}
      </span>
      <span>
        {cfg.text}
        {status === "reconnecting" && attempts > 0 && (
          <span className="font-mono opacity-80">（第 {attempts} 次）</span>
        )}
        {isDisconnected && lastError && (
          <span className="opacity-80">· {lastError}</span>
        )}
      </span>
      {isDisconnected && (
        <button
          onClick={reconnect}
          className="ml-2 px-2 py-0.5 rounded text-[var(--error)] border border-[var(--error)]/30 hover:bg-[var(--error)] hover:text-white transition-colors"
        >
          重连
        </button>
      )}
    </div>
  );
}
