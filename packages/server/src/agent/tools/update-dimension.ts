import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { getDimension, checkDimensionNameConflict, updateDimension } from "../../store.js";
import { validateSqlViaExplain } from "../../mysql/executor.js";
import { confirmationBlocked } from "./confirm-guard.js";

const DimensionStatus = Type.Union([
  Type.Literal("draft"),
  Type.Literal("published"),
  Type.Literal("deprecated"),
]);

const UpdateDimensionParams = Type.Object({
  datasource_id: Type.String({ description: "数据源ID" }),
  name: Type.Optional(Type.String({ description: "要修改的维度英文名（与 dimension_id 二选一）" })),
  dimension_id: Type.Optional(Type.String({ description: "维度ID（与 name 二选一）" })),
  new_name: Type.Optional(Type.String({ description: "修改后的维度英文名(snake_case)" })),
  display_name: Type.Optional(Type.String({ description: "维度中文名" })),
  description: Type.Optional(Type.String({ description: "维度描述" })),
  sql_expression: Type.Optional(Type.String({ description: "新的SQL表达式（字段名或表达式；若为完整SELECT会先做EXPLAIN校验）" })),
  data_type: Type.Optional(Type.Union([Type.Literal("string"), Type.Literal("number"), Type.Literal("date")])),
  grain: Type.Optional(Type.Union([Type.Literal("day"), Type.Literal("week"), Type.Literal("month"), Type.Literal("quarter"), Type.Literal("year")])),
  date_column: Type.Optional(Type.String({ description: "源日期列" })),
  hierarchy: Type.Optional(Type.String({ description: "层级定义(JSON字符串)" })),
  values: Type.Optional(Type.Array(Type.String(), { description: "枚举值列表" })),
  is_enum_dict: Type.Optional(Type.Boolean({ description: "是否为枚举字典" })),
  status: Type.Optional(DimensionStatus),
  conversation_id: Type.Optional(Type.String({ description: "当前会话ID，用于确认态校验(由系统上下文提供)" })),
});

type UpdateDimensionParams = Static<typeof UpdateDimensionParams>;

export function createUpdateDimensionTool(): AgentTool<typeof UpdateDimensionParams, any> {
  return {
    name: "update_dimension",
    description: `修改已有维度，等同于指标管理页面的「编辑 / 发布 / 弃用」操作。
支持修改名称、显示名、SQL表达式、数据类型、粒度、枚举值等字段，以及把状态改为 published 或 deprecated。
⚠️ 调用前必须先调用 request_user_confirm 让用户确认。`,
    label: "修改维度",
    parameters: UpdateDimensionParams,
    execute: async (_toolCallId: string, params: any) => {
      const p = params as UpdateDimensionParams;

      const blocked = confirmationBlocked(p.conversation_id, "修改维度");
      if (blocked) {
        return {
          content: [{ type: "text" as const, text: blocked }],
          details: { updated: false, blocked: "not_confirmed" },
        };
      }

      const existing = p.dimension_id
        ? getDimension(p.dimension_id)
        : p.name
          ? checkDimensionNameConflict(p.datasource_id, p.name)
          : null;
      if (!existing || existing.datasource_id !== p.datasource_id) {
        return {
          content: [{ type: "text" as const, text: `❌ 未找到维度（name=${p.name ?? "-"}, id=${p.dimension_id ?? "-"}）。请先用 lookup_semantic_layer 确认维度名称。` }],
          details: { updated: false, not_found: true },
          isError: true,
        };
      }

      if (p.new_name && p.new_name !== existing.name) {
        const conflict = checkDimensionNameConflict(p.datasource_id, p.new_name);
        if (conflict) {
          return {
            content: [{ type: "text" as const, text: `❌ 维度名 "${p.new_name}" 已被占用（${conflict.display_name}）。请换一个名称。` }],
            details: { updated: false, conflict: true, existing_id: conflict.id },
            isError: true,
          };
        }
      }

      // 与 create_dimension_draft 一致：仅完整 SELECT 表达式需要 EXPLAIN。
      if (p.sql_expression && /select\b/i.test(p.sql_expression)) {
        const explainResult = await validateSqlViaExplain(p.datasource_id, p.sql_expression);
        if (!explainResult.valid) {
          return {
            content: [{ type: "text" as const, text: `❌ 维度表达式SQL验证失败: ${explainResult.error}\n请先修复表达式后再更新。` }],
            details: { updated: false, validation_error: explainResult.error },
            isError: true,
          };
        }
      }

      const input: Record<string, unknown> = {};
      if (p.new_name !== undefined) input.name = p.new_name;
      if (p.display_name !== undefined) input.display_name = p.display_name;
      if (p.description !== undefined) input.description = p.description;
      if (p.sql_expression !== undefined) input.sql_expression = p.sql_expression;
      if (p.data_type !== undefined) input.data_type = p.data_type;
      if (p.grain !== undefined) input.grain = p.grain || null;
      if (p.date_column !== undefined) input.date_column = p.date_column || null;
      if (p.hierarchy !== undefined) input.hierarchy = p.hierarchy || null;
      if (p.values !== undefined) {
        input.values = p.values.length > 0
          ? JSON.stringify(p.values.map((v) => ({ key: v, value: v })))
          : null;
      }
      if (p.is_enum_dict !== undefined) input.is_enum_dict = p.is_enum_dict ? 1 : 0;
      if (p.status !== undefined) input.status = p.status;

      if (Object.keys(input).length === 0) {
        return {
          content: [{ type: "text" as const, text: "⚠️ 没有提供任何要修改的字段。请说明要修改什么（如表达式、显示名、状态等）。" }],
          details: { updated: false, no_changes: true },
        };
      }

      const updated = updateDimension(existing.id, input as any);
      if (!updated) {
        return {
          content: [{ type: "text" as const, text: "❌ 更新维度失败：维度不存在或已被删除。" }],
          details: { updated: false },
          isError: true,
        };
      }

      const changedFields = Object.keys(input);
      const statusNote = p.status === "published"
        ? "\n✅ 已发布，智能问数 Agent 现在可以通过语义层引用该维度。"
        : p.status === "deprecated"
          ? "\n⚠️ 已弃用，智能问数 Agent 将不再引用该维度。"
          : "";
      return {
        content: [{ type: "text" as const, text: `✅ 维度已更新: ${updated.display_name} (${updated.name})\n修改字段: ${changedFields.join(", ")}\n当前状态: ${updated.status}${statusNote}` }],
        details: {
          updated: true,
          dimension_id: updated.id,
          dimension_name: updated.name,
          display_name: updated.display_name,
          sql_expression: updated.sql_expression,
          data_type: updated.data_type,
          status: updated.status,
          previous_status: existing.status,
          changed_fields: changedFields,
        },
      };
    },
  };
}
