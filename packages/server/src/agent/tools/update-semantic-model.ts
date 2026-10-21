import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { listModels, getModel, updateModel } from "../../store.js";
import { confirmationBlocked } from "./confirm-guard.js";

const ModelStatus = Type.Union([
  Type.Literal("draft"),
  Type.Literal("published"),
  Type.Literal("deprecated"),
]);

const JoinEntry = Type.Object({
  table: Type.String({ description: "关联表名" }),
  on: Type.String({ description: "关联条件，如 orders.user_id = users.id" }),
  type: Type.Optional(Type.Union([Type.Literal("INNER"), Type.Literal("LEFT"), Type.Literal("RIGHT")])),
});

const UpdateSemanticModelParams = Type.Object({
  datasource_id: Type.String({ description: "数据源ID" }),
  name: Type.Optional(Type.String({ description: "要修改的模型名（与 model_id 二选一）" })),
  model_id: Type.Optional(Type.String({ description: "模型ID（与 name 二选一）" })),
  new_name: Type.Optional(Type.String({ description: "修改后的模型名" })),
  description: Type.Optional(Type.String({ description: "模型描述" })),
  base_table: Type.Optional(Type.String({ description: "事实表" })),
  joins: Type.Optional(Type.Array(JoinEntry, { description: "关联定义列表" })),
  metrics: Type.Optional(Type.Array(Type.String(), { description: "包含的指标名列表" })),
  dimensions: Type.Optional(Type.Array(Type.String(), { description: "包含的维度名列表" })),
  status: Type.Optional(ModelStatus),
  conversation_id: Type.Optional(Type.String({ description: "当前会话ID，用于确认态校验(由系统上下文提供)" })),
});

type UpdateSemanticModelParams = Static<typeof UpdateSemanticModelParams>;

export function createUpdateSemanticModelTool(): AgentTool<typeof UpdateSemanticModelParams, any> {
  return {
    name: "update_semantic_model",
    description: `修改语义模型，等同于指标管理「模型」页签的编辑/发布/弃用操作。
支持修改模型名、描述、事实表、关联关系、包含的指标与维度，以及状态（published/deprecated）。
⚠️ 调用前必须先调用 request_user_confirm 让用户确认。`,
    label: "修改语义模型",
    parameters: UpdateSemanticModelParams,
    execute: async (_toolCallId: string, params: any) => {
      const p = params as UpdateSemanticModelParams;

      const blocked = confirmationBlocked(p.conversation_id, "修改语义模型");
      if (blocked) {
        return {
          content: [{ type: "text" as const, text: blocked }],
          details: { updated: false, blocked: "not_confirmed" },
        };
      }

      const existing = p.model_id
        ? getModel(p.model_id)
        : p.name
          ? listModels(p.datasource_id).find((m) => m.name === p.name) ?? null
          : null;
      if (!existing || existing.datasource_id !== p.datasource_id) {
        const available = listModels(p.datasource_id).map((m) => m.name).join(", ") || "（无）";
        return {
          content: [{ type: "text" as const, text: `❌ 未找到语义模型（name=${p.name ?? "-"}, id=${p.model_id ?? "-"}）。当前可用模型: ${available}` }],
          details: { updated: false, not_found: true },
          isError: true,
        };
      }

      if (p.new_name && p.new_name !== existing.name) {
        const conflict = listModels(p.datasource_id).find((m) => m.name === p.new_name);
        if (conflict) {
          return {
            content: [{ type: "text" as const, text: `❌ 模型名 "${p.new_name}" 已被占用。请换一个名称。` }],
            details: { updated: false, conflict: true, existing_id: conflict.id },
            isError: true,
          };
        }
      }

      const input: Record<string, unknown> = {};
      if (p.new_name !== undefined) input.name = p.new_name;
      if (p.description !== undefined) input.description = p.description;
      if (p.base_table !== undefined) input.base_table = p.base_table;
      if (p.joins !== undefined) {
        input.joins = JSON.stringify(p.joins.filter((j) => j.table && j.on).map((j) => ({ ...j, type: j.type ?? "LEFT" })));
      }
      if (p.metrics !== undefined) input.metrics = JSON.stringify(p.metrics);
      if (p.dimensions !== undefined) input.dimensions = JSON.stringify(p.dimensions);
      if (p.status !== undefined) input.status = p.status;

      if (Object.keys(input).length === 0) {
        return {
          content: [{ type: "text" as const, text: "⚠️ 没有提供任何要修改的字段。" }],
          details: { updated: false, no_changes: true },
        };
      }

      const updated = updateModel(existing.id, input as any);
      if (!updated) {
        return {
          content: [{ type: "text" as const, text: "❌ 更新语义模型失败：模型不存在或已被删除。" }],
          details: { updated: false },
          isError: true,
        };
      }

      return {
        content: [{ type: "text" as const, text: `✅ 语义模型已更新: ${updated.name}\n修改字段: ${Object.keys(input).join(", ")}\n当前状态: ${updated.status}` }],
        details: {
          updated: true,
          model_id: updated.id,
          model_name: updated.name,
          status: updated.status,
          previous_status: existing.status,
          changed_fields: Object.keys(input),
        },
      };
    },
  };
}
