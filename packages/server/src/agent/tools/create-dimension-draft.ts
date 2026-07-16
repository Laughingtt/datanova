import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { createDimension } from "../../store.js";

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
});

type CreateDimensionDraftParams = Static<typeof CreateDimensionDraftParams>;

export function createCreateDimensionDraftTool(): AgentTool<typeof CreateDimensionDraftParams, any> {
  return {
    name: "create_dimension_draft",
    description: `创建维度草稿。保存为draft状态，需用户审核后发布。
⚠️ 重要：调用此工具前，必须先调用 request_user_confirm 让用户确认，除非用户已明确说"保存"/"确认"。`,
    label: "创建维度草稿",
    parameters: CreateDimensionDraftParams,
    execute: async (_toolCallId: string, params: any) => {
      const p = params as CreateDimensionDraftParams;

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

        return {
          content: [{ type: "text" as const, text: `✅ 维度草稿已创建: ${dim.display_name} (${dim.name})\n类型: ${dim.data_type}${dim.grain ? ` | 粒度: ${dim.grain}` : ""}\n表达式: ${dim.sql_expression}` }],
          details: { created: true, dimension_id: dim.id, dimension_name: dim.name },
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
