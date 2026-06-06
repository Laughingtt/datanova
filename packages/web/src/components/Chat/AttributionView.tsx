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
    fact: "border-green-200 bg-green-50",
    dimension: "border-blue-200 bg-blue-50",
    root_cause: "border-orange-200 bg-orange-50",
    action: "border-purple-200 bg-purple-50",
  };

  return (
    <div className="my-3 border border-[var(--hairline)] rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-[var(--hairline)]">
        <span className="text-sm font-medium text-[var(--ink)]">🎯 归因分析</span>
      </div>
      <div className="divide-y divide-[var(--hairline)]">
        {sections.map((section, idx) => (
          <div key={idx} className={`px-4 py-3 border-l-4 ${colorMap[section.type] ?? ""}`}>
            <div className="flex items-center gap-2 mb-1">
              <span>{section.icon}</span>
              <span className="text-sm font-medium text-[var(--ink)]">{section.label}</span>
            </div>
            <p className="text-sm text-[var(--ink)] leading-relaxed whitespace-pre-wrap">{section.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}