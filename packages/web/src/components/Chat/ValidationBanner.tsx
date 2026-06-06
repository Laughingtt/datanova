// ==================== Types ====================

export type ValidationLevel = "error" | "warning" | "info";

// ==================== Component ====================

interface ValidationBannerProps {
  level: ValidationLevel;
  message: string;
}

export default function ValidationBanner({ level, message }: ValidationBannerProps) {
  const getStyles = () => {
    switch (level) {
      case "error":
        return {
          bg: "bg-[var(--error-soft)]",
          border: "border-[var(--error)]",
          icon: "🚫",
          text: "text-[var(--error)]",
        };
      case "warning":
        return {
          bg: "bg-[var(--warning-soft)]",
          border: "border-[var(--warning)]",
          icon: "⚠️",
          text: "text-[var(--warning)]",
        };
      case "info":
        return {
          bg: "bg-[var(--surface)]",
          border: "border-[var(--primary)]",
          icon: "ℹ️",
          text: "text-[var(--primary-text)]",
        };
    }
  };

  const styles = getStyles();

  return (
    <div className={`my-3 px-4 py-3 rounded-lg ${styles.bg} border-l-4 ${styles.border}`}>
      <div className="flex items-start gap-2">
        <span className="text-sm">{styles.icon}</span>
        <p className={`text-sm ${styles.text} leading-relaxed`}>{message}</p>
      </div>
    </div>
  );
}
