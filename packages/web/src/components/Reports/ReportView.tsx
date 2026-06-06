import { useState } from "react";

export interface ReportSection {
  title: string;
  content: string;
  hasTable: boolean;
}

interface ReportViewProps {
  sections: ReportSection[];
  rawContent: string;
}

export default function ReportView({ sections, rawContent }: ReportViewProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleSection = (title: string) => {
    setCollapsed((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  return (
    <div className="rounded-lg border border-[var(--hairline)] overflow-hidden bg-[var(--surface)]">
      {/* Report Header */}
      <div className="px-5 py-3 bg-gradient-to-r from-[var(--primary-soft,rgba(59,130,246,0.08))] to-transparent border-b border-[var(--hairline)]">
        <h3 className="text-sm font-medium text-[var(--ink)] flex items-center gap-2">
          <span>&#x1F4C4;</span> Analysis Report
        </h3>
      </div>

      {/* Sections */}
      <div className="divide-y divide-[var(--hairline)]">
        {sections.map((section, index) => (
          <div key={index}>
            <button
              onClick={() => toggleSection(section.title)}
              className="w-full text-left px-5 py-3 flex items-center justify-between hover:bg-[var(--canvas)] transition-colors"
            >
              <span className="text-sm font-medium text-[var(--ink)]">
                {section.title}
              </span>
              <span className="text-xs text-[var(--steel)]">
                {collapsed[section.title] ? "+" : "-"}
              </span>
            </button>
            {!collapsed[section.title] && (
              <div className="px-5 pb-4">
                {section.hasTable ? (
                  <pre className="text-xs font-mono text-[var(--ink)] whitespace-pre-wrap leading-relaxed bg-[var(--canvas)] rounded-md p-3 overflow-x-auto">
                    {section.content}
                  </pre>
                ) : (
                  <div className="text-sm text-[var(--ink)] leading-relaxed whitespace-pre-wrap">
                    {section.content}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Parse markdown content into report sections based on ## headers.
 * Returns empty array if fewer than 3 sections found (not a report).
 */
export function parseReportSections(content: string): ReportSection[] {
  const sections: ReportSection[] = [];
  const headerRegex = /^##\s+(.+)/gm;
  const headers: { title: string; index: number }[] = [];
  let match;
  while ((match = headerRegex.exec(content)) !== null) {
    headers.push({ title: match[1].trim(), index: match.index });
  }
  if (headers.length < 3) return [];
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index + content.slice(headers[i].index).indexOf("\n") + 1;
    const end = i + 1 < headers.length ? headers[i + 1].index : content.length;
    const sectionContent = content.slice(start, end).trim();
    if (sectionContent) {
      sections.push({
        title: headers[i].title,
        content: sectionContent,
        hasTable: sectionContent.includes("|") || sectionContent.includes("```"),
      });
    }
  }
  return sections.length >= 3 ? sections : [];
}
