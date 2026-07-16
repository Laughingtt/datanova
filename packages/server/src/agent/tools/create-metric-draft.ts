import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { createMetric, checkMetricNameConflict } from "../../store.js";
import { validateSqlViaExplain } from "../../mysql/executor.js";
import { normalizeSql } from "./sql-normalize.js";

const CreateMetricDraftParams = Type.Object({
  datasource_id: Type.String({ description: "数据源ID" }),
  name: Type.String({ description: "指标英文名(snake_case)" }),
  display_name: Type.String({ description: "指标中文名" }),
  sql: Type.String({ description: "完整的可执行SQL语句" }),
  metric_type: Type.Union([Type.Literal("atomic"), Type.Literal("derived"), Type.Literal("compound")]),
  description: Type.Optional(Type.String({ description: "指标描述(中文)" })),
  business_context: Type.Optional(Type.String({ description: "业务上下文" })),
  calculation_logic: Type.Optional(Type.String({ description: "计算逻辑" })),
  applicable_scenarios: Type.Optional(Type.String({ description: "适用场景" })),
  data_quality_notes: Type.Optional(Type.String({ description: "数据质量备注" })),
  dimensions: Type.Optional(Type.Array(Type.String(), { description: "关联维度名列表" })),
  unit: Type.Optional(Type.String({ description: "单位: yuan, %, ge, ..." })),
  category: Type.Optional(Type.String({ description: "分类" })),
  default_sort: Type.Optional(Type.String({ description: "默认排序" })),
  agent_session_id: Type.Optional(Type.String({ description: "Agent会话ID" })),
});

type CreateMetricDraftParams = Static<typeof CreateMetricDraftParams>;

export function createCreateMetricDraftTool(): AgentTool<typeof CreateMetricDraftParams, any> {
  return {
    name: "create_metric_draft",
    description: `创建指标草稿。自动执行验证后保存为draft状态。
⚠️ 重要：调用此工具前，必须先调用 request_user_confirm 让用户确认，除非用户已明确说"保存"/"确认"。
注意：如果同名指标已存在，将返回冲突错误，不会覆盖已有指标。`,
    label: "创建指标草稿",
    parameters: CreateMetricDraftParams,
    execute: async (_toolCallId: string, params: any) => {
      const p = params as CreateMetricDraftParams;
      // Normalize SQL — fix keyword粘连 (e.g. "revenueFROM" → "revenue FROM")
      const sql = normalizeSql(p.sql);

      // 1. 检查名称冲突
      const conflict = checkMetricNameConflict(p.datasource_id, p.name);
      if (conflict) {
        return {
          content: [{ type: "text" as const, text: `❌ 指标名 "${p.name}" 已存在（${conflict.display_name}, 状态: ${conflict.status}）。请使用不同的名称。` }],
          details: { created: false, conflict: true, existing_id: conflict.id },
          isError: true,
        };
      }

      // 2. EXPLAIN验证
      const explainResult = await validateSqlViaExplain(p.datasource_id, sql);
      if (!explainResult.valid) {
        return {
          content: [{ type: "text" as const, text: `❌ SQL验证失败: ${explainResult.error}\n请先修复SQL后再创建。` }],
          details: { created: false, validation_error: explainResult.error },
          isError: true,
        };
      }

      // 3. 创建草稿
      try {
        const metric = createMetric({
          datasource_id: p.datasource_id,
          name: p.name,
          display_name: p.display_name,
          description: p.description || "",
          sql: sql,
          dimensions: JSON.stringify(p.dimensions || []),
          default_granularity: null,
          unit: p.unit || null,
          category: p.category || null,
          aliases: "[]",
          metric_type: p.metric_type,
          business_context: p.business_context || "",
          calculation_logic: p.calculation_logic || "",
          applicable_scenarios: p.applicable_scenarios || "",
          data_quality_notes: p.data_quality_notes || "",
          default_sort: p.default_sort || null,
          status: "draft",
          version: 1,
          created_by: "agent",
          agent_session_id: p.agent_session_id || null,
          validation_status: "passed",
          validation_result: JSON.stringify({ validated_at: new Date().toISOString() }),
        });

        return {
          content: [{ type: "text" as const, text: `✅ 指标草稿已创建: ${metric.display_name} (${metric.name})\n类型: ${metric.metric_type} | 状态: 草稿 | 验证: 通过\nSQL: ${metric.sql.substring(0, 100)}${metric.sql.length > 100 ? "..." : ""}\n\n请前往指标管理页面审核并发布。` }],
          details: { created: true, metric_id: metric.id, metric_name: metric.name },
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `❌ 创建指标失败: ${(err as Error).message}` }],
          details: { created: false, error: (err as Error).message },
          isError: true,
        };
      }
    },
  };
}
