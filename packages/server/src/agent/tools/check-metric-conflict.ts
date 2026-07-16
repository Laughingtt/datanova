import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { checkMetricNameConflict, checkMetricDisplayNameConflict } from "../../store.js";

const CheckMetricConflictParams = Type.Object({
  datasource_id: Type.String({ description: "数据源ID" }),
  name: Type.String({ description: "拟使用的指标英文名" }),
  sql: Type.Optional(Type.String({ description: "拟使用的SQL语句" })),
  display_name: Type.Optional(Type.String({ description: "拟使用的指标中文名" })),
});

type CheckMetricConflictParams = Static<typeof CheckMetricConflictParams>;

interface ConflictInfo {
  has_conflict: boolean;
  conflicts: Array<{
    type: "name_duplicate" | "display_name_duplicate";
    severity: "error" | "warning";
    existing_metric: { id: string; name: string; display_name: string; status: string };
    suggestion: string;
  }>;
}

export function createCheckMetricConflictTool(): AgentTool<typeof CheckMetricConflictParams, ConflictInfo> {
  return {
    name: "check_metric_conflict",
    description: `检查拟创建的指标与已有指标的冲突。检测：
1. 同名指标（name重复）— 严重冲突
2. 同显示名（display_name重复）— 可能混淆
返回冲突列表和建议。`,
    label: "检查指标冲突",
    parameters: CheckMetricConflictParams,
    execute: async (_toolCallId: string, params: any): Promise<{ content: Array<{ type: "text"; text: string }>; details: ConflictInfo }> => {
      const typedParams = params as CheckMetricConflictParams;
      const conflicts: ConflictInfo["conflicts"] = [];

      // 检查name重复
      const nameConflict = checkMetricNameConflict(typedParams.datasource_id, typedParams.name);
      if (nameConflict) {
        conflicts.push({
          type: "name_duplicate",
          severity: "error",
          existing_metric: {
            id: nameConflict.id,
            name: nameConflict.name,
            display_name: nameConflict.display_name,
            status: nameConflict.status,
          },
          suggestion: nameConflict.status === "deprecated"
            ? `已有弃用指标 "${nameConflict.display_name}"(${nameConflict.name})，建议覆盖或使用新名称`
            : `已有指标 "${nameConflict.display_name}"(${nameConflict.name})，请使用不同的英文名`,
        });
      }

      // 检查display_name重复
      if (typedParams.display_name) {
        const displayNameConflicts = checkMetricDisplayNameConflict(typedParams.datasource_id, typedParams.display_name);
        for (const existing of displayNameConflicts) {
          if (existing.name !== typedParams.name) {  // 避免与name重复的报告重复
            conflicts.push({
              type: "display_name_duplicate",
              severity: "warning",
              existing_metric: {
                id: existing.id,
                name: existing.name,
                display_name: existing.display_name,
                status: existing.status,
              },
              suggestion: `已有指标使用显示名 "${existing.display_name}"(${existing.name})，可能造成混淆`,
            });
          }
        }
      }

      const result: ConflictInfo = {
        has_conflict: conflicts.length > 0,
        conflicts,
      };

      const summary = conflicts.length === 0
        ? "✅ 无冲突，可以使用该名称"
        : `⚠️ 发现${conflicts.length}个冲突`;

      return {
        content: [{ type: "text", text: `${summary}\n${JSON.stringify(result, null, 2)}` }],
        details: result,
      };
    },
  };
}
