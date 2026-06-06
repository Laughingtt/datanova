import { useState, useMemo } from "react";

// ==================== Types ====================

export interface SummarySection {
  type: "key_finding" | "trend" | "anomaly" | "result";
  icon: string;
  label: string;
  content: string;
}

// ==================== Utility ====================

export function parseSummarySections(content: string): SummarySection[] {
  const sections: SummarySection[] = [];
  const patterns = [
    { regex: /\*\*关键发现\*\*\s*[:：]\s*(.+?)(?=\*\*|$)/s, type: "key_finding" as const, icon: "🔑", label: "关键发现" },
    { regex: /\*\*趋势\*\*\s*[:：]\s*(.+?)(?=\*\*|$)/s, type: "trend" as const, icon: "📈", label: "趋势" },
    { regex: /\*\*异常\*\*\s*[:：]\s*(.+?)(?=\*\*|$)/s, type: "anomaly" as const, icon: "⚠️", label: "异常" },
    { regex: /\*\*结果\*\*\s*[:：]\s*(.+?)(?=\*\*|$)/s, type: "result" as const, icon: "📋", label: "结果" },
  ];
  for (const p of patterns) {
    const match = content.match(p.regex);
    if (match && match[1]?.trim()) {
      sections.push({ type: p.type, icon: p.icon, label: p.label, content: match[1].trim() });
    }
  }
  return sections;
}

// ==================== Component ====================

interface ResultSummaryCardProps {
  content: string;
}

export default function ResultSummaryCard({ content }: ResultSummaryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // P1-C8: Derive summary sections on render, don't store in state
  const sections = useMemo(() => parseSummarySections(content), [content]);

  if (sections.length === 0) return null;

  const keyFinding = sections.find((s) => s.type === "key_finding");
  const otherSections = sections.filter((s) => s.type !== "key_finding");

  const getSectionColor = (type: SummarySection["type"]) => {
    switch (type) {
      case "anomaly":
        return {
          bg: "bg-[var(--error-soft)]",
          border: "border-[var(--error)]",
          text: "text-[var(--error)]",
        };
      case "trend":
        return {
          bg: "bg-[var(--primary-soft)]",
          border: "border-[var(--primary)]",
          text: "text-[var(--primary-text)]",
        };
      case "result":
        return {
          bg: "bg-[var(--surface)]",
          border: "border-[var(--hairline)]",
          text: "text-[var(--ink)]",
        };
      default:
        return {
          bg: "bg-[var(--surface)]",
          border: "border-[var(--hairline)]",
          text: "text-[var(--ink)]",
        };
    }
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-[var(--hairline)] bg-[var(--canvas)]">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-[var(--cream-soft)] hover:bg-[var(--cream)] transition-colors"
      >
        <span className="text-sm font-medium text-[var(--ink)] flex items-center gap-2">
          <span>📊</span>
          <span>查询总结</span>
        </span>
        <span className={`text-xs text-[var(--steel)] transition-transform ${isExpanded ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {/* Key finding - always visible */}
      {keyFinding && (
        <div className="px-4 py-3 border-b border-[var(--hairline-soft)]">
          <div className="flex items-start gap-2">
            <span className="text-sm">{keyFinding.icon}</span>
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-[var(--steel)]">
                {keyFinding.label}
              </span>
              <p className="text-sm text-[var(--ink)] mt-0.5 leading-relaxed">
                {keyFinding.content}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Other sections - collapsible */}
      {isExpanded && otherSections.length > 0 && (
        <div className="divide-y divide-[var(--hairline-soft)]">
          {otherSections.map((section, index) => {
            const colors = getSectionColor(section.type);
            return (
              <div key={index} className={`px-4 py-3 ${colors.bg} border-l-2 ${colors.border}`}>
                <div className="flex items-start gap-2">
                  <span className="text-sm">{section.icon}</span>
                  <div>
                    <span className={`text-xs font-mono uppercase tracking-wider ${colors.text}`}>
                      {section.label}
                    </span>
                    <p className="text-sm text-[var(--ink)] mt-0.5 leading-relaxed">
                      {section.content}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
