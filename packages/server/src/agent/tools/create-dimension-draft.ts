import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { createDimension, checkDimensionNameConflict } from "../../store.js";
import { validateSqlViaExplain } from "../../mysql/executor.js";
import { getPending, clear } from "../confirm-state.js";

const CreateDimensionDraftParams = Type.Object({
  datasource_id: Type.String({ description: "数据源ID" }),
  name: Type.String({ description: "维度英文名(snake_case)" }),
  display_name: Type.String({ description: "维度中文名" }),
  sql_expression: Type.String({ description: "SQL表达式(字段名或表达式)" }),
  data_type: Type.Union([Type.Literal("string"), Type.Literal("number"), Type.Literal("date")]),
  description: Type.Optional(Type.String({ description: "维度描述(中文)" })),
  grain: Type.Optional(Type.Union([Type.Literal("day"), Type.Literal("week"), Type.Literal("month"), Type.Literal("quarter"), Type.Literal("year")])),
  date_column: Type.Optional(Type.String({ description: "源日期列" })),
  agent_session_id: Type.Optional(Type.String({ description: "Agent会话ID" })),
  conversation_id: Type.Optional(Type.String({ description: "当前会话ID，用于确认态校验(由系统上下文提供)" })),
});

type CreateDimensionDraftParams = Static<typeof CreateDimensionDraftParams>;

export function createCreateDimensionDraftTool(): AgentTool<typeof CreateDimensionDraftParams, any> {
  return {
    name: "create_dimension_draft",
    description: `创建维度草稿。保存为draft状态，需用户审核后发布。
⚠️ 重要：调用此工具前，必须先调用 request_user_confirm 让用户确认，除非用户已明确说"保存"/"确认"。
注意：如果同名维度已存在，将返回冲突错误，不会覆盖已有维度。`,
    label: "创建维度草稿",
    parameters: CreateDimensionDraftParams,
    execute: async (_toolCallId: string, params: any) => {
      const p = params as CreateDimensionDraftParams;

      // 0. 确认态守卫 (Problem 2) — 未获得用户确认时拒绝保存。
      if (p.conversation_id) {
        const pending = getPending(p.conversation_id);
        if (!pending || pending.status !== "confirmed") {
          return {
            content: [{ type: "text" as const, text: `⚠️ 尚未获得用户确认，无法保存维度草稿。请先调用 request_user_confirm 展示确认卡片，等待用户点击「确认保存」后再执行保存。\n（如用户已在消息中明确要求"保存"/"确认"，系统会自动标记为已确认。）` }],
            details: { created: false, blocked: "not_confirmed" },
          };
        }
      }

      // 1. 检查名称冲突 (Problem 3) — 与 create_metric_draft 对齐。
      const conflict = checkDimensionNameConflict(p.datasource_id, p.name);
      if (conflict) {
        return {
          content: [{ type: "text" as const, text: `❌ 维度名 "${p.name}" 已存在（${conflict.display_name}, 状态: ${conflict.status}）。请使用不同的名称。` }],
          details: { created: false, conflict: true, existing_id: conflict.id },
          isError: true,
        };
      }

      // 2. 条件 EXPLAIN 验证 (Problem 3) — 维度 sql_expression 通常是裸字段/表达式
      // (如 `DATE(order_time)`)，对裸表达式跑 EXPLAIN 会失败。仅当表达式包含
      // SELECT 关键字（完整子查询）时才做 EXPLAIN 校验。
      if (/select\b/i.test(p.sql_expression)) {
        const explainResult = await validateSqlViaExplain(p.datasource_id, p.sql_expression);
        if (!explainResult.valid) {
          return {
            content: [{ type: "text" as const, text: `❌ 维度表达式SQL验证失败: ${explainResult.error}\n请先修复表达式后再创建。` }],
            details: { created: false, validation_error: explainResult.error },
            isError: true,
          };
        }
      }

      // 3. 创建草稿
      try {
        const dim = createDimension({
          datasource_id: p.datasource_id,
          name: p.name,
          display_name: p.display_name,
          sql_expression: p.sql_expression,
          data_type: p.data_type,
          hierarchy: null,
          values: null,
          description: p.description || "",
          grain: p.grain || null,
          date_column: p.date_column || null,
          status: "draft",
          is_enum_dict: false,
          created_by: "agent",
          agent_session_id: p.agent_session_id || null,
        });

        // 保存成功后清除确认态。
        if (p.conversation_id) {
          clear(p.conversation_id);
        }

        return {
          content: [{ type: "text" as const, text: `✅ 维度草稿已创建: ${dim.display_name} (${dim.name})\n类型: ${dim.data_type}${dim.grain ? ` | 粒度: ${dim.grain}` : ""}\n表达式: ${dim.sql_expression}` }],
          details: {
            created: true,
            dimension_id: dim.id,
            dimension_name: dim.name,
            // Enriched fields for Chat card rendering (DimensionCard)
            display_name: dim.display_name,
            sql_expression: dim.sql_expression,
            data_type: dim.data_type,
            grain: dim.grain,
          },
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `❌ 创建维度失败: ${(err as Error).message}` }],
          details: { created: false, error: (err as Error).message },
          isError: true,
        };
      }
    },
  };
}
