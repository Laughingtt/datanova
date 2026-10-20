import { useState } from "react";
import { querySkillApi } from "../../api/client";

interface AIGenerateDialogProps {
  datasourceId: string;
  onGenerated: (skillData: any) => void;
  onClose: () => void;
}

export default function AIGenerateDialog({
  datasourceId,
  onGenerated,
  onClose,
}: AIGenerateDialogProps) {
  const [domain, setDomain] = useState("");
  const [scenario, setScenario] = useState("");
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!domain.trim()) { setError("请填写业务域"); return; }
    if (mode === "single" && !scenario.trim()) { setError("请填写场景描述"); return; }

    setGenerating(true);
    setError(null);

    try {
      if (mode === "single") {
        const result = await querySkillApi.generate(datasourceId, {
          domain: domain.trim(),
          scenario: scenario.trim(),
        });
        onGenerated(result.skill);
      } else {
        const result = await querySkillApi.generateBatch(datasourceId, {
          domain: domain.trim(),
        });
        // Auto-create all generated skills
        // AI may return array types for fields typed as string, so coerce them
        const coerceField = (val: any): string => {
          if (typeof val === "string") return val;
          if (Array.isArray(val)) return val.join("\n");
          return "";
        };
        for (const raw of result.skills) {
          const skillData = raw as Record<string, any>;
          await querySkillApi.create(datasourceId, {
            domain: domain.trim(),
            name: skillData.name,
            trigger_keywords: skillData.trigger_keywords,
            business_context: skillData.business_context,
            core_tables: skillData.core_tables,
            join_path: skillData.join_path,
            query_steps: coerceField(skillData.query_steps),
            example_sql: skillData.example_sql,
            caveats: coerceField(skillData.caveats),
            common_issues: coerceField(skillData.common_issues),
          });
        }
        onGenerated({ _batch: true, count: result.skills.length });
      }
    } catch (err) {
      setError((err as Error).message || "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/10 backdrop-blur-[2px] flex items-center justify-center">
      <div className="rounded-xl bg-[var(--popover)] ring-1 ring-[color-mix(in_srgb,var(--foreground)_10%,transparent)] shadow-[var(--shadow-3)] w-full max-w-lg mx-4">
        <div className="px-6 py-4 border-b border-[var(--border)]">
          <h3 className="text-lg font-semibold text-[var(--foreground)]">AI 生成查询技能</h3>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            AI 分析数据库 Schema，自动生成查询技能攻略
          </p>
        </div>

        <div className="p-6 space-y-3">
          {/* Mode toggle */}
          <div className="tabs-track">
            <button
              onClick={() => setMode("single")}
              data-active={mode === "single"}
              className="tab-trigger"
            >
              单个场景
            </button>
            <button
              onClick={() => setMode("batch")}
              data-active={mode === "batch"}
              className="tab-trigger"
            >
              批量生成
            </button>
          </div>

          {/* Domain */}
          <div>
            <label className="label-mono mb-1.5 block">
              业务域<span className="text-[var(--error)] ml-0.5">*</span>
            </label>
            <input
              type="text"
              className="input-field w-full"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="如：账单、人力资源、库存"
            />
          </div>

          {/* Scenario (single mode only) */}
          {mode === "single" && (
            <div>
              <label className="label-mono mb-1.5 block">
                场景描述<span className="text-[var(--error)] ml-0.5">*</span>
              </label>
              <textarea
                className="input-field w-full resize-y"
                rows={3}
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                placeholder="如：查询客户的账单明细，包括账单汇总和明细流水"
              />
            </div>
          )}

          {mode === "batch" && (
            <p className="text-xs text-[var(--muted-foreground)]">
              AI 将自动识别「{domain || "该业务域"}」下的 3-5 个典型查询场景，为每个场景生成完整技能
            </p>
          )}

          {error && (
            <div className="px-3 py-2 rounded-lg bg-[var(--error-soft)] text-[var(--error)] text-xs">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border)]">
          <button onClick={onClose} className="btn-ghost">取消</button>
          <button onClick={handleGenerate} disabled={generating} className="btn-primary">
            {generating ? "生成中..." : "生成"}
          </button>
        </div>
      </div>
    </div>
  );
}
