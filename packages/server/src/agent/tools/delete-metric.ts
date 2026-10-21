import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { getMetric, checkMetricNameConflict, deleteMetric } from "../../store.js";
import { confirmationBlocked } from "./confirm-guard.js";

const DeleteMetricParams = Type.Object({
  datasource_id: Type.String({ description: "数据源ID" }),
  name: Type.Optional(Type.String({ description: "要删除的指标英文名（与 metric_id 二选一）" })),
  metric_id: Type.Optional(Type.String({ description: "指标ID（与 name 二选一）" })),
  conversation_id: Type.Optional(Type.String({ description: "当前会话ID，用于确认态校验(由系统上下文提供)" })),
});

type DeleteMetricParams = Static<typeof DeleteMetricParams>;

export function createDeleteMetricTool(): AgentTool<typeof DeleteMetricParams, any> {
  return {
    name: "delete_metric",
    description: `删除指标，等同于指标管理页面的「删除」操作。该操作不可恢复。
⚠️ 调用前必须先调用 request_user_confirm 让用户确认；只有用户明确要求删除时才使用。`,
    label: "删除指标",
    parameters: DeleteMetricParams,
    execute: async (_toolCallId: string, params: any) => {
      const p = params as DeleteMetricParams;

      const blocked = confirmationBlocked(p.conversation_id, "删除指标");
      if (blocked) {
        return {
          content: [{ type: "text" as const, text: blocked }],
          details: { deleted: false, blocked: "not_confirmed" },
        };
      }

      const existing = p.metric_id
        ? getMetric(p.metric_id)
        : p.name
          ? checkMetricNameConflict(p.datasource_id, p.name)
          : null;
      if (!existing || existing.datasource_id !== p.datasource_id) {
        return {
          content: [{ type: "text" as const, text: `❌ 未找到指标（name=${p.name ?? "-"}, id=${p.metric_id ?? "-"}）。` }],
          details: { deleted: false, not_found: true },
          isError: true,
        };
      }

      const ok = deleteMetric(existing.id);
      return {
        content: [{ type: "text" as const, text: ok ? `✅ 已删除指标: ${existing.display_name} (${existing.name})` : "❌ 删除失败：指标不存在。" }],
        details: {
          deleted: ok,
          metric_id: existing.id,
          metric_name: existing.name,
          display_name: existing.display_name,
          previous_status: existing.status,
        },
        isError: !ok,
      };
    },
  };
}
