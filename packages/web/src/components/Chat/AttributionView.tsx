/**
 * AttributionView — renders attribution analysis sections parsed from assistant messages.
 * Sections: 事实确认, 维度拆解, 根因定位, 行动建议
 */

export interface AttributionSection {
  type: "fact" | "dimension" | "root_cause" | "action";
  icon: string;
  label: string;
  content: string;
}

export function parseAttributionSections(content: string): AttributionSection[] {
  const sections: AttributionSection[] = [];
  const patterns = [
    { regex: /\*\*事实确认\*\*\s*[:：]\s*(.+?)(?=\*\*|$)/s, type: "fact" as const, icon: "✅", label: "事实确认" },
    { regex: /\*\*维度拆解\*\*\s*[:：]\s*(.+?)(?=\*\*|$)/s, type: "dimension" as const, icon: "🔍", label: "维度拆解" },
    { regex: /\*\*根因定位\*\*\s*[:：]\s*(.+?)(?=\*\*|$)/s, type: "root_cause" as const, icon: "🎯", label: "根因定位" },
    { regex: /\*\*行动建议\*\*\s*[:：]\s*(.+?)(?=\*\*|$)/s, type: "action" as const, icon: "💡", label: "行动建议" },
  ];

  for (const p of patterns) {
    const match = content.match(p.regex);
    if (match && match[1]?.trim()) {
      sections.push({ type: p.type, icon: p.icon, label: p.label, content: match[1].trim() });
    }
  }
  return sections;
}

interface AttributionViewProps {
  sections: AttributionSection[];
}

export default function AttributionView({ sections }: AttributionViewProps) {
  if (sections.length === 0) return null;

  const colorMap: Record<string, string> = {
    fact: "border-l-[var(--success)] bg-[var(--success-soft)]",
    dimension: "border-l-[var(--info)] bg-[var(--info-soft)]",
    root_cause: "border-l-[var(--warning)] bg-[var(--warning-soft)]",
    action: "border-l-[var(--primary)] bg-[var(--accent)]",
  };

  return (
    <div className="my-3 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-xs)] overflow-hidden">
      <div className="px-4 py-3 bg-[color-mix(in_srgb,var(--muted)_50%,transparent)] border-b border-[var(--border)]">
        <span className="text-sm font-medium text-[var(--foreground)]">🎯 归因分析</span>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {sections.map((section, idx) => (
          <div key={idx} className={`px-4 py-3 border-l-4 ${colorMap[section.type] ?? ""}`}>
            <div className="flex items-center gap-2 mb-1">
              <span>{section.icon}</span>
              <span className="text-sm font-medium text-[var(--foreground)]">{section.label}</span>
            </div>
            <p className="text-sm text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">{section.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}