# Phase 3: Semantic Layer Completion + Intelligent Attribution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise accuracy from ~90% to ~95% by closing the semantic layer feedback loop and supporting attribution analysis to move from "viewing data" to "using data."

**Architecture:** Attribution analysis is implemented primarily through system prompt instructions that guide the Agent to execute multi-dimensional decomposition queries. Frontend adds `AttributionView` component for structured display. Semantic layer gets version management and feedback-driven corrections.

**Tech Stack:** Same as Phase 1. No new external dependencies.

---

## File Structure

### Server — Modified Files
| File | Changes |
|------|---------|
| `packages/server/src/agent/prompt-builder.ts` | Add attribution analysis instructions |
| `packages/server/src/store.ts` | Add metric version field migration |

### Web — New Files
| File | Responsibility |
|------|---------------|
| `packages/web/src/components/Chat/AttributionView.tsx` | Attribution analysis structured display |

### Web — Modified Files
| File | Changes |
|------|---------|
| `packages/web/src/components/Chat/MessageItem.tsx` | Render AttributionView |
| `packages/web/src/hooks/useAgentStream.ts` | Parse attribution sections |
| `packages/web/src/components/Metrics/MetricsPage.tsx` | Deprecation workflow, feedback correction |

---

## Task 1: Attribution Analysis — System Prompt + Frontend Display

**Files:**
- Modify: `packages/server/src/agent/prompt-builder.ts`
- Create: `packages/web/src/components/Chat/AttributionView.tsx`
- Modify: `packages/web/src/components/Chat/MessageItem.tsx`
- Modify: `packages/web/src/hooks/useAgentStream.ts`

- [ ] **Step 1: Add attribution analysis instructions to system prompt**

In `packages/server/src/agent/prompt-builder.ts`, add:

```typescript
`- Attribution Analysis Guidelines:
  - When user asks "为什么" or "什么原因" about data changes, perform attribution analysis:
    1. Confirm the fact: verify the change is real with a comparison query
    2. Multi-dimensional decomposition: for each dimension in the semantic model, execute a comparison query grouped by that dimension
    3. Identify the largest contributing factor: which dimension value has the largest absolute change
    4. Cross-reference: drill into the top contributing dimension value by other dimensions
    5. Generate conclusion: "X changed Y%, mainly due to Z (contributing W%). Possible reason: ..."
  - If the change is within normal variance (<5% change), inform the user it may not need attribution analysis.
  - Format attribution results clearly:
    **事实确认**: [confirmed change with numbers]
    **维度拆解**: [breakdown by each dimension with contributions]
    **根因定位**: [cross-referenced root cause]
    **行动建议**: [suggested next steps]`
```

- [ ] **Step 2: Add attribution sections to ChatMessage type**

In `useAgentStream.ts`:

```typescript
export interface AttributionSection {
  type: "fact" | "decomposition" | "root_cause" | "action";
  title: string;
  content: string;
  contributionData?: Array<{ label: string; value: number; direction: "up" | "down" }>;
}

// Add to ChatMessage:
attributionSections?: AttributionSection[];
```

- [ ] **Step 3: Parse attribution sections from Agent response**

```typescript
export function parseAttributionSections(content: string): AttributionSection[] {
  const sections: AttributionSection[] = [];
  const patterns: Array<{ regex: RegExp; type: AttributionSection["type"]; title: string }> = [
    { regex: /\*\*事实确认\*\*\s*[:：]\s*(.+?)(?=\*\*|$)/s, type: "fact", title: "事实确认" },
    { regex: /\*\*维度拆解\*\*\s*[:：]\s*(.+?)(?=\*\*|$)/s, type: "decomposition", title: "维度拆解" },
    { regex: /\*\*根因定位\*\*\s*[:：]\s*(.+?)(?=\*\*|$)/s, type: "root_cause", title: "根因定位" },
    { regex: /\*\*行动建议\*\*\s*[:：]\s*(.+?)(?=\*\*|$)/s, type: "action", title: "行动建议" },
  ];
  for (const p of patterns) {
    const match = content.match(p.regex);
    if (match && match[1]?.trim()) {
      sections.push({ type: p.type, title: p.title, content: match[1].trim() });
    }
  }
  return sections.length >= 2 ? sections : []; // Only return if at least 2 sections found
}
```

In `processWsEvent`, when finalizing a message, parse attribution sections and store in ChatMessage.

- [ ] **Step 4: Create AttributionView component**

`packages/web/src/components/Chat/AttributionView.tsx`:

```tsx
import { useState } from "react";
import type { AttributionSection } from "../../hooks/useAgentStream";

interface AttributionViewProps {
  sections: AttributionSection[];
}

const SECTION_ICONS: Record<AttributionSection["type"], string> = {
  fact: "📊",
  decomposition: "🔍",
  root_cause: "🎯",
  action: "💡",
};

const SECTION_COLORS: Record<AttributionSection["type"], string> = {
  fact: "border-blue-200 bg-blue-50",
  decomposition: "border-purple-200 bg-purple-50",
  root_cause: "border-red-200 bg-red-50",
  action: "border-green-200 bg-green-50",
};

export default function AttributionView({ sections }: AttributionViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(sections.map(s => s.type)));

  const toggle = (type: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  };

  return (
    <div className="my-3 border border-[var(--hairline)] rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-gradient-to-r from-blue-50 to-purple-50 border-b border-[var(--hairline)]">
        <span className="text-sm font-medium text-[var(--ink)]">🔎 归因分析</span>
      </div>

      <div className="divide-y divide-[var(--hairline-soft)]">
        {sections.map(section => {
          const isExpanded = expanded.has(section.type);
          return (
            <div key={section.type}>
              <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[var(--canvas)] transition-colors"
                onClick={() => toggle(section.type)}
              >
                <span>{SECTION_ICONS[section.type]}</span>
                <span className="text-xs font-medium text-[var(--ink)]">{section.title}</span>
                <span className="ml-auto text-xs text-[var(--steel)]">{isExpanded ? "▼" : "▶"}</span>
              </div>

              {isExpanded && (
                <div className={`px-4 py-3 ${SECTION_COLORS[section.type]} border-t border-[var(--hairline-soft)]`}>
                  <p className="text-sm text-[var(--ink)] leading-relaxed whitespace-pre-wrap">{section.content}</p>

                  {/* Contribution chart for decomposition */}
                  {section.contributionData && section.contributionData.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {section.contributionData
                        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
                        .map((item, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs text-[var(--steel)] w-24 truncate">{item.label}</span>
                            <div className="flex-1 h-5 bg-[var(--canvas)] rounded overflow-hidden relative">
                              <div
                                className={`h-full rounded ${item.direction === "up" ? "bg-green-400" : "bg-red-400"}`}
                                style={{ width: `${Math.min(Math.abs(item.value), 100)}%` }}
                              />
                            </div>
                            <span className={`text-xs font-mono w-16 text-right ${item.direction === "up" ? "text-green-600" : "text-red-600"}`}>
                              {item.direction === "up" ? "↑" : "↓"} {Math.abs(item.value)}%
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Integrate AttributionView into MessageItem**

```tsx
import AttributionView from "./AttributionView";

// Before the main text content:
{message.attributionSections && message.attributionSections.length > 0 && (
  <AttributionView sections={message.attributionSections} />
)}
```

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/agent/prompt-builder.ts packages/web/src/components/Chat/AttributionView.tsx packages/web/src/components/Chat/MessageItem.tsx packages/web/src/hooks/useAgentStream.ts
git commit -m "feat: intelligent attribution analysis — system prompt and structured display with contribution chart"
```

---

## Task 2: Semantic Layer Phase 3 — Feedback Loop + Version Management

**Files:**
- Modify: `packages/server/src/store.ts`
- Modify: `packages/web/src/components/Metrics/MetricsPage.tsx`

- [ ] **Step 1: Add version field to semantic_metrics table**

Migration in `initTables`:

```typescript
const metricColumns = (database.pragma("table_info(semantic_metrics)") as Array<{ name: string }>).map(c => c.name);
if (!metricColumns.includes("version")) {
  database.exec("ALTER TABLE semantic_metrics ADD COLUMN version INTEGER NOT NULL DEFAULT 1");
}
```

- [ ] **Step 2: Auto-increment version on update**

In `updateMetric`, add:

```typescript
updates.push("version = version + 1");
```

- [ ] **Step 3: Add deprecation workflow in MetricsPage**

On a published metric card, add a "Deprecate" button that calls:

```typescript
await semanticApi.updateMetric(dsId, metric.id, { status: "deprecated" });
```

Add a "Show deprecated" toggle at the top of the metrics list. When off, filter out deprecated metrics.

- [ ] **Step 4: Add feedback-driven metric correction**

When a metric has negative feedback, show a "修正" button next to it. Clicking opens the MetricForm pre-filled with current values. After saving, version increments.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/store.ts packages/web/src/components/Metrics/MetricsPage.tsx
git commit -m "feat: semantic layer Phase 3 — version management, deprecation, feedback correction"
```

---

## Self-Review Checklist

**1. Spec coverage:**

| Spec Requirement | Task |
|---|---|
| Attribution analysis Agent capability | Task 1 Step 1 (system prompt) |
| Dimension-aware decomposition | Task 1 Step 1 (system prompt) |
| Attribution analysis result display | Task 1 Steps 2-5 |
| Attribution analysis triggered by follow-up | Task 1 Step 1 (explain intent) |
| Semantic layer Phase 3 feedback correction | Task 2 |
| Metric version management | Task 2 |

**2. Placeholder scan:** No TBD/TODO patterns found.

**3. Type consistency:** `AttributionSection` type consistent across parser, ChatMessage, and AttributionView.

---

Plan complete and saved to `docs/superpowers/plans/2026-06-06-data-agent-phase3.md`.
