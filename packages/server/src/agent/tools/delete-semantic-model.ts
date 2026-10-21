import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { listModels, getModel, deleteModel } from "../../store.js";
import { confirmationBlocked } from "./confirm-guard.js";

const DeleteSemanticModelParams = Type.Object({
  datasource_id: Type.String({ description: "数据源ID" }),
  name: Type.Optional(Type.String({ description: "要删除的模型名（与 model_id 二选一）" })),
  model_id: Type.Optional(Type.String({ description: "模型ID（与 name 二选一）" })),
  conversation_id: Type.Optional(Type.String({ description: "当前会话ID，用于确认态校验(由系统上下文提供)" })),
});

type DeleteSemanticModelParams = Static<typeof DeleteSemanticModelParams>;

export function createDeleteSemanticModelTool(): AgentTool<typeof DeleteSemanticModelParams, any> {
  return {
    name: "delete_semantic_model",
    description: `删除语义模型，等同于指标管理「模型」页签的删除操作。该操作不可恢复。
⚠️ 调用前必须先调用 request_user_confirm 让用户确认；只有用户明确要求删除时才使用。`,
    label: "删除语义模型",
    parameters: DeleteSemanticModelParams,
    execute: async (_toolCallId: string, params: any) => {
      const p = params as DeleteSemanticModelParams;

      const blocked = confirmationBlocked(p.conversation_id, "删除语义模型");
      if (blocked) {
        return {
          content: [{ type: "text" as const, text: blocked }],
          details: { deleted: false, blocked: "not_confirmed" },
        };
      }

      const existing = p.model_id
        ? getModel(p.model_id)
        : p.name
          ? listModels(p.datasource_id).find((m) => m.name === p.name) ?? null
          : null;
      if (!existing || existing.datasource_id !== p.datasource_id) {
        return {
          content: [{ type: "text" as const, text: `❌ 未找到语义模型（name=${p.name ?? "-"}, id=${p.model_id ?? "-"}）。` }],
          details: { deleted: false, not_found: true },
          isError: true,
        };
      }

      const ok = deleteModel(existing.id);
      return {
        content: [{ type: "text" as const, text: ok ? `✅ 已删除语义模型: ${existing.name}` : "❌ 删除失败：模型不存在。" }],
        details: {
          deleted: ok,
          model_id: existing.id,
          model_name: existing.name,
          previous_status: existing.status,
        },
        isError: !ok,
      };
    },
  };
}
