import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { randomUUID } from "crypto";

const RequestConfirmParams = Type.Object({
  title: Type.String({ description: "确认标题，如'保存指标草稿'" }),
  description: Type.Optional(Type.String({ description: "确认描述，说明即将执行的操作" })),
  items: Type.Optional(Type.Array(Type.String(), { description: "待确认项目列表，如指标名称列表" })),
  action_type: Type.Optional(Type.Union([
    Type.Literal("save_draft"),
    Type.Literal("create"),
    Type.Literal("delete"),
    Type.Literal("update"),
  ], { description: "操作类型" })),
});

type RequestConfirmParams = Static<typeof RequestConfirmParams>;

export function createRequestUserConfirmTool(): AgentTool<typeof RequestConfirmParams, any> {
  return {
    name: "request_user_confirm",
    description: `请求用户确认操作。在保存草稿或创建指标之前，必须先调用此工具展示确认卡片，等待用户点击确认后再执行保存操作。绝对不要在调用此工具之前就调用 create_metric_draft 或 create_dimension_draft。
注意：如果用户已经明确说"保存"、"确认"、"创建"等，则不需要调用此工具，直接执行操作即可。`,
    label: "请求用户确认",
    parameters: RequestConfirmParams,
    execute: async (_toolCallId: string, params: any) => {
      const p = params as RequestConfirmParams;
      const confirmId = `confirm-${randomUUID().slice(0, 8)}`;

      const itemText = p.items && p.items.length > 0
        ? "\n待确认项目：\n" + p.items.map((item, i) => `  ${i + 1}. ${item}`).join("\n")
        : "";

      return {
        content: [{
          type: "text" as const,
          text: `📋 **${p.title}**${p.description ? `\n${p.description}` : ""}${itemText}\n\n等待用户确认...`,
        }],
        details: {
          confirmAction: {
            id: confirmId,
            title: p.title,
            description: p.description || "",
            items: p.items || [],
            actionType: p.action_type || "save_draft",
          },
        },
      };
    },
  };
}
