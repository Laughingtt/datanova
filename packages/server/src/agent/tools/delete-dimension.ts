import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { getDimension, checkDimensionNameConflict, deleteDimension } from "../../store.js";
import { confirmationBlocked } from "./confirm-guard.js";

const DeleteDimensionParams = Type.Object({
  datasource_id: Type.String({ description: "数据源ID" }),
  name: Type.Optional(Type.String({ description: "要删除的维度英文名（与 dimension_id 二选一）" })),
  dimension_id: Type.Optional(Type.String({ description: "维度ID（与 name 二选一）" })),
  conversation_id: Type.Optional(Type.String({ description: "当前会话ID，用于确认态校验(由系统上下文提供)" })),
});

type DeleteDimensionParams = Static<typeof DeleteDimensionParams>;

export function createDeleteDimensionTool(): AgentTool<typeof DeleteDimensionParams, any> {
  return {
    name: "delete_dimension",
    description: `删除维度，等同于指标管理页面的「删除」操作。该操作不可恢复。
⚠️ 调用前必须先调用 request_user_confirm 让用户确认；只有用户明确要求删除时才使用。`,
    label: "删除维度",
    parameters: DeleteDimensionParams,
    execute: async (_toolCallId: string, params: any) => {
      const p = params as DeleteDimensionParams;

      const blocked = confirmationBlocked(p.conversation_id, "删除维度");
      if (blocked) {
        return {
          content: [{ type: "text" as const, text: blocked }],
          details: { deleted: false, blocked: "not_confirmed" },
        };
      }

      const existing = p.dimension_id
        ? getDimension(p.dimension_id)
        : p.name
          ? checkDimensionNameConflict(p.datasource_id, p.name)
          : null;
      if (!existing || existing.datasource_id !== p.datasource_id) {
        return {
          content: [{ type: "text" as const, text: `❌ 未找到维度（name=${p.name ?? "-"}, id=${p.dimension_id ?? "-"}）。` }],
          details: { deleted: false, not_found: true },
          isError: true,
        };
      }

      const ok = deleteDimension(existing.id);
      return {
        content: [{ type: "text" as const, text: ok ? `✅ 已删除维度: ${existing.display_name} (${existing.name})` : "❌ 删除失败：维度不存在。" }],
        details: {
          deleted: ok,
          dimension_id: existing.id,
          dimension_name: existing.name,
          display_name: existing.display_name,
          previous_status: existing.status,
        },
        isError: !ok,
      };
    },
  };
}
