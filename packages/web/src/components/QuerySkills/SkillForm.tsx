import { useState, useEffect } from "react";
import { querySkillApi, type QuerySkill, type CoreTableEntry } from "../../api/client";

interface SkillFormProps {
  datasourceId: string;
  skill: QuerySkill | null; // null = create new
  initialData?: any | null; // AI-generated data to pre-fill
  onSave: () => void;
  onDelete: () => void;
  onCancel: () => void;
}

interface FormData {
  domain: string;
  name: string;
  trigger_keywords: string; // comma-separated input
  business_context: string;
  core_tables: CoreTableEntry[];
  join_path: string;
  query_steps: string;
  example_sql: string;
  caveats: string;
  common_issues: string;
}

export default function SkillForm({
  datasourceId,
  skill,
  initialData,
  onSave,
  onDelete,
  onCancel,
}: SkillFormProps) {
  // Helper to build initial form data from skill or initialData
  const buildInitialForm = (): FormData => {
    if (skill) {
      let keywords: string[] = [];
      try { keywords = JSON.parse(skill.trigger_keywords) as string[]; } catch {}
      let coreTables: CoreTableEntry[] = [];
      try { coreTables = JSON.parse(skill.core_tables) as CoreTableEntry[]; } catch {}
      return {
        domain: skill.domain,
        name: skill.name,
        trigger_keywords: keywords.join(", "),
        business_context: skill.business_context,
        core_tables: coreTables,
        join_path: skill.join_path,
        query_steps: skill.query_steps,
        example_sql: skill.example_sql,
        caveats: skill.caveats,
        common_issues: skill.common_issues,
      };
    } else if (initialData) {
      let keywords: string[] = initialData.trigger_keywords || [];
      let coreTables: CoreTableEntry[] = initialData.core_tables || [];
      const caveatsStr = Array.isArray(initialData.caveats) ? initialData.caveats.join("\n") : (initialData.caveats || "");
      const commonIssuesStr = Array.isArray(initialData.common_issues) ? initialData.common_issues.join("\n") : (initialData.common_issues || "");
      const queryStepsStr = Array.isArray(initialData.query_steps) ? initialData.query_steps.join("\n") : (initialData.query_steps || "");
      return {
        domain: initialData.domain || "",
        name: initialData.name || "",
        trigger_keywords: Array.isArray(keywords) ? keywords.join(", ") : String(keywords),
        business_context: initialData.business_context || "",
        core_tables: coreTables,
        join_path: initialData.join_path || "",
        query_steps: queryStepsStr,
        example_sql: initialData.example_sql || "",
        caveats: caveatsStr,
        common_issues: commonIssuesStr,
      };
    }
    return {
      domain: "",
      name: "",
      trigger_keywords: "",
      business_context: "",
      core_tables: [],
      join_path: "",
      query_steps: "",
      example_sql: "",
      caveats: "",
      common_issues: "",
    };
  };

  const [form, setForm] = useState<FormData>(buildInitialForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only needed for editing an existing skill when selectedSkill changes without remount
  useEffect(() => {
    if (skill) {
      let keywords: string[] = [];
      try { keywords = JSON.parse(skill.trigger_keywords) as string[]; } catch {}
      let coreTables: CoreTableEntry[] = [];
      try { coreTables = JSON.parse(skill.core_tables) as CoreTableEntry[]; } catch {}

      setForm({
        domain: skill.domain,
        name: skill.name,
        trigger_keywords: keywords.join(", "),
        business_context: skill.business_context,
        core_tables: coreTables,
        join_path: skill.join_path,
        query_steps: skill.query_steps,
        example_sql: skill.example_sql,
        caveats: skill.caveats,
        common_issues: skill.common_issues,
      });
    }
  }, [skill]);

  const handleFieldChange = (key: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCoreTableChange = (index: number, field: keyof CoreTableEntry, value: string) => {
    setForm((prev) => {
      const updated = [...prev.core_tables];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, core_tables: updated };
    });
  };

  const addCoreTable = () => {
    setForm((prev) => ({
      ...prev,
      core_tables: [...prev.core_tables, { table: "", purpose: "" }],
    }));
  };

  const removeCoreTable = (index: number) => {
    setForm((prev) => ({
      ...prev,
      core_tables: prev.core_tables.filter((_, i) => i !== index),
    }));
  };

  const handleSave = async () => {
    // Validate required fields
    if (!form.domain.trim()) { setError("请填写业务域"); return; }
    if (!form.name.trim()) { setError("请填写技能名称"); return; }
    if (!form.query_steps.trim()) { setError("请填写查询步骤"); return; }

    setSaving(true);
    setError(null);

    const keywords = form.trigger_keywords
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      domain: form.domain,
      name: form.name,
      trigger_keywords: keywords,
      business_context: form.business_context,
      core_tables: form.core_tables.filter((ct) => ct.table.trim()),
      join_path: form.join_path,
      query_steps: form.query_steps,
      example_sql: form.example_sql,
      caveats: form.caveats,
      common_issues: form.common_issues,
    };

    try {
      if (skill) {
        await querySkillApi.update(datasourceId, skill.id, payload);
      } else {
        await querySkillApi.create(datasourceId, payload);
      }
      onSave();
    } catch (err) {
      setError((err as Error).message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!skill) return;
    setDeleting(true);
    try {
      await querySkillApi.delete(datasourceId, skill.id);
      onDelete();
    } catch (err) {
      setError((err as Error).message || "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-display text-heading-3 text-[var(--ink)]">
            {skill ? "编辑" : "新增"}查询技能
          </h3>
        </div>
        {skill && (
          <button onClick={handleDelete} disabled={deleting} className="btn-danger text-xs">
            {deleting ? "删除中..." : "删除"}
          </button>
        )}
      </div>

      <div className="space-y-4">
        {/* Domain */}
        <div>
          <label className="label-mono mb-1.5 block">
            业务域<span className="text-[var(--error)] ml-0.5">*</span>
          </label>
          <input
            type="text"
            className="input-field w-full"
            value={form.domain}
            onChange={(e) => handleFieldChange("domain", e.target.value)}
            placeholder="如：账单、人力资源、库存"
          />
        </div>

        {/* Name */}
        <div>
          <label className="label-mono mb-1.5 block">
            技能名称<span className="text-[var(--error)] ml-0.5">*</span>
          </label>
          <input
            type="text"
            className="input-field w-full"
            value={form.name}
            onChange={(e) => handleFieldChange("name", e.target.value)}
            placeholder="如：客户账单明细查询"
          />
        </div>

        {/* Trigger Keywords */}
        <div>
          <label className="label-mono mb-1.5 block">触发关键词</label>
          <input
            type="text"
            className="input-field w-full"
            value={form.trigger_keywords}
            onChange={(e) => handleFieldChange("trigger_keywords", e.target.value)}
            placeholder="用逗号分隔，如：账单, billing, 客户明细"
          />
          <p className="text-[10px] text-[var(--stone)] mt-1">用户提到这些词时，Agent 会自动加载此技能</p>
        </div>

        {/* Business Context */}
        <div>
          <label className="label-mono mb-1.5 block">业务背景</label>
          <textarea
            className="input-field w-full resize-y"
            rows={2}
            value={form.business_context}
            onChange={(e) => handleFieldChange("business_context", e.target.value)}
            placeholder="2-3句话说明这个场景的业务含义"
          />
        </div>

        {/* Core Tables */}
        <div>
          <label className="label-mono mb-1.5 block">核心表</label>
          {form.core_tables.map((ct, idx) => (
            <div key={idx} className="flex items-center gap-2 mb-2">
              <input
                type="text"
                className="input-field flex-1"
                value={ct.table}
                onChange={(e) => handleCoreTableChange(idx, "table", e.target.value)}
                placeholder="表名"
              />
              <input
                type="text"
                className="input-field flex-1"
                value={ct.purpose}
                onChange={(e) => handleCoreTableChange(idx, "purpose", e.target.value)}
                placeholder="用途说明"
              />
              <button
                onClick={() => removeCoreTable(idx)}
                className="text-[var(--error)] text-xs hover:underline flex-shrink-0"
              >
                移除
              </button>
            </div>
          ))}
          <button onClick={addCoreTable} className="text-xs text-[var(--primary)] hover:underline">
            + 添加核心表
          </button>
        </div>

        {/* Join Path */}
        <div>
          <label className="label-mono mb-1.5 block">关联路径</label>
          <textarea
            className="input-field w-full resize-y"
            rows={2}
            value={form.join_path}
            onChange={(e) => handleFieldChange("join_path", e.target.value)}
            placeholder="如：ads_bill → dim_customer ON customer_id"
          />
        </div>

        {/* Query Steps */}
        <div>
          <label className="label-mono mb-1.5 block">
            查询步骤<span className="text-[var(--error)] ml-0.5">*</span>
          </label>
          <textarea
            className="input-field w-full resize-y"
            rows={3}
            value={form.query_steps}
            onChange={(e) => handleFieldChange("query_steps", e.target.value)}
            placeholder={"1.从ads_bill取客户账单汇总\n2.关联dim_customer取客户信息\n3.关联dwd_bill_detail取明细"}
          />
        </div>

        {/* Example SQL */}
        <div>
          <label className="label-mono mb-1.5 block">示例SQL</label>
          <textarea
            className="input-field w-full resize-y font-mono text-xs"
            rows={5}
            value={form.example_sql}
            onChange={(e) => handleFieldChange("example_sql", e.target.value)}
            placeholder="SELECT ... FROM ... JOIN ... WHERE ..."
          />
        </div>

        {/* Caveats */}
        <div>
          <label className="label-mono mb-1.5 block">注意事项</label>
          <textarea
            className="input-field w-full resize-y"
            rows={2}
            value={form.caveats}
            onChange={(e) => handleFieldChange("caveats", e.target.value)}
            placeholder="数据质量、字段含义、常见陷阱"
          />
        </div>

        {/* Common Issues */}
        <div>
          <label className="label-mono mb-1.5 block">常见问题</label>
          <textarea
            className="input-field w-full resize-y"
            rows={2}
            value={form.common_issues}
            onChange={(e) => handleFieldChange("common_issues", e.target.value)}
            placeholder="用户可能遇到的典型问题和处理方式"
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 px-3 py-2 rounded-lg border border-[var(--error)]/20 bg-[var(--error)]/5 text-[var(--error)] text-xs">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 mt-6 pt-4 border-t border-[var(--hairline)]">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? "保存中..." : "保存"}
        </button>
        <button onClick={onCancel} className="btn-ghost">取消</button>
      </div>
    </div>
  );
}
