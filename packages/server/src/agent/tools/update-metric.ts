import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { getMetric, checkMetricNameConflict, updateMetric } from "../../store.js";
import { validateSqlViaExplain } from "../../mysql/executor.js";
import { normalizeSql } from "./sql-normalize.js";
import { confirmationBlocked } from "./confirm-guard.js";

const MetricStatus = Type.Union([
  Type.Literal("draft"),
  Type.Literal("published"),
  Type.Literal("deprecated"),
]);

const UpdateMetricParams = Type.Object({
  datasource_id: Type.String({ description: "数据源ID" }),
  name: Type.Optional(Type.String({ description: "要修改的指标英文名（与 metric_id 二选一）" })),
  metric_id: Type.Optional(Type.String({ description: "指标ID（与 name 二选一）" })),
  new_name: Type.Optional(Type.String({ description: "修改后的指标英文名(snake_case)" })),
  display_name: Type.Optional(Type.String({ description: "指标中文名" })),
  description: Type.Optional(Type.String({ description: "指标描述" })),
  sql: Type.Optional(Type.String({ description: "新的完整可执行SQL（会先做EXPLAIN校验）" })),
  metric_type: Type.Optional(Type.Union([Type.Literal("atomic"), Type.Literal("derived"), Type.Literal("compound")])),
  business_context: Type.Optional(Type.String({ description: "业务上下文" })),
  calculation_logic: Type.Optional(Type.String({ description: "计算逻辑" })),
  applicable_scenarios: Type.Optional(Type.String({ description: "适用场景" })),
  data_quality_notes: Type.Optional(Type.String({ description: "数据质量备注" })),
  dimensions: Type.Optional(Type.Array(Type.String(), { description: "关联维度名列表" })),
  default_granularity: Type.Optional(Type.String({ description: "默认粒度" })),
  unit: Type.Optional(Type.String({ description: "单位" })),
  category: Type.Optional(Type.String({ description: "分类" })),
  aliases: Type.Optional(Type.Array(Type.String(), { description: "别名列表" })),
  default_sort: Type.Optional(Type.String({ description: "默认排序" })),
  status: Type.Optional(MetricStatus),
  conversation_id: Type.Optional(Type.String({ description: "当前会话ID，用于确认态校验(由系统上下文提供)" })),
});

type UpdateMetricParams = Static<typeof UpdateMetricParams>;

/** Resolve a metric by id or name inside the given datasource. */
function resolveMetric(datasourceId: string, id?: string, name?: string) {
  if (id) {
    const byId = getMetric(id);
    return byId && byId.datasource_id === datasourceId ? byId : null;
  }
  if (name) return checkMetricNameConflict(datasourceId, name);
  return null;
}

export function createUpdateMetricTool(): AgentTool<typeof UpdateMetricParams, any> {
  return {
    name: "update_metric",
    description: `修改已有指标，等同于指标管理页面的「编辑 / 发布 / 弃用」操作。
支持修改名称、显示名、SQL、类型、描述、单位、分类、关联维度等字段，以及把状态改为 published（发布）或 deprecated（弃用）。
⚠️ 调用前必须先调用 request_user_confirm 让用户确认。修改 SQL 时会先做 EXPLAIN 校验，校验失败不会保存。`,
    label: "修改指标",
    parameters: UpdateMetricParams,
    execute: async (_toolCallId: string, params: any) => {
      const p = params as UpdateMetricParams;

      const blocked = confirmationBlocked(p.conversation_id, "修改指标");
      if (blocked) {
        return {
          content: [{ type: "text" as const, text: blocked }],
          details: { updated: false, blocked: "not_confirmed" },
        };
      }

      const existing = resolveMetric(p.datasource_id, p.metric_id, p.name);
      if (!existing) {
        return {
          content: [{ type: "text" as const, text: `❌ 未找到指标（name=${p.name ?? "-"}, id=${p.metric_id ?? "-"}）。请先用 lookup_semantic_layer 或查看指标管理页面确认指标名称。` }],
          details: { updated: false, not_found: true },
          isError: true,
        };
      }

      // 名称变更需要检查冲突
      if (p.new_name && p.new_name !== existing.name) {
        const conflict = checkMetricNameConflict(p.datasource_id, p.new_name);
        if (conflict) {
          return {
            content: [{ type: "text" as const, text: `❌ 指标名 "${p.new_name}" 已被占用（${conflict.display_name}）。请换一个名称。` }],
            details: { updated: false, conflict: true, existing_id: conflict.id },
            isError: true,
          };
        }
      }

      // SQL 变更先验证
      const sql = p.sql !== undefined ? normalizeSql(p.sql) : undefined;
      if (sql !== undefined) {
        const explainResult = await validateSqlViaExplain(p.datasource_id, sql);
        if (!explainResult.valid) {
          return {
            content: [{ type: "text" as const, text: `❌ SQL验证失败: ${explainResult.error}\n请先修复SQL后再更新。` }],
            details: { updated: false, validation_error: explainResult.error },
            isError: true,
          };
        }
      }

      const input: Record<string, unknown> = {};
      if (p.new_name !== undefined) input.name = p.new_name;
      if (p.display_name !== undefined) input.display_name = p.display_name;
      if (p.description !== undefined) input.description = p.description;
      if (sql !== undefined) input.sql = sql;
      if (p.metric_type !== undefined) input.metric_type = p.metric_type;
      if (p.business_context !== undefined) input.business_context = p.business_context;
      if (p.calculation_logic !== undefined) input.calculation_logic = p.calculation_logic;
      if (p.applicable_scenarios !== undefined) input.applicable_scenarios = p.applicable_scenarios;
      if (p.data_quality_notes !== undefined) input.data_quality_notes = p.data_quality_notes;
      if (p.dimensions !== undefined) input.dimensions = JSON.stringify(p.dimensions);
      if (p.default_granularity !== undefined) input.default_granularity = p.default_granularity || null;
      if (p.unit !== undefined) input.unit = p.unit || null;
      if (p.category !== undefined) input.category = p.category || null;
      if (p.aliases !== undefined) input.aliases = JSON.stringify(p.aliases);
      if (p.default_sort !== undefined) input.default_sort = p.default_sort || null;
      if (p.status !== undefined) input.status = p.status;

      if (Object.keys(input).length === 0) {
        return {
          content: [{ type: "text" as const, text: "⚠️ 没有提供任何要修改的字段。请说明要修改什么（如 SQL、显示名、状态等）。" }],
          details: { updated: false, no_changes: true },
        };
      }

      const updated = updateMetric(existing.id, input as any);
      if (!updated) {
        return {
          content: [{ type: "text" as const, text: "❌ 更新指标失败：指标不存在或已被删除。" }],
          details: { updated: false },
          isError: true,
        };
      }

      const changedFields = Object.keys(input);
      const statusNote = p.status === "published"
        ? "\n✅ 已发布，智能问数 Agent 现在可以通过语义层引用该指标。"
        : p.status === "deprecated"
          ? "\n⚠️ 已弃用，智能问数 Agent 将不再引用该指标。"
          : "";
      return {
        content: [{ type: "text" as const, text: `✅ 指标已更新: ${updated.display_name} (${updated.name})\n修改字段: ${changedFields.join(", ")}\n当前状态: ${updated.status}${statusNote}` }],
        details: {
          updated: true,
          metric_id: updated.id,
          metric_name: updated.name,
          display_name: updated.display_name,
          status: updated.status,
          previous_status: existing.status,
          changed_fields: changedFields,
          sql: updated.sql,
        },
      };
    },
  };
}
