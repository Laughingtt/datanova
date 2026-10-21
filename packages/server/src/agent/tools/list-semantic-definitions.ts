import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { listMetrics, listDimensions, listModels } from "../../store.js";

const ListSemanticDefinitionsParams = Type.Object({
  datasource_id: Type.String({ description: "数据源ID" }),
  type: Type.Optional(Type.Union([
    Type.Literal("metric"),
    Type.Literal("dimension"),
    Type.Literal("model"),
    Type.Literal("all"),
  ], { description: "要列出的类型，默认 all" })),
  status: Type.Optional(Type.Union([
    Type.Literal("draft"),
    Type.Literal("published"),
    Type.Literal("deprecated"),
    Type.Literal("all"),
  ], { description: "按状态过滤，默认 all（包含草稿）" })),
  keyword: Type.Optional(Type.String({ description: "按名称/显示名模糊过滤" })),
});

type ListSemanticDefinitionsParams = Static<typeof ListSemanticDefinitionsParams>;

function matches(keyword: string | undefined, ...fields: Array<string | null | undefined>): boolean {
  if (!keyword) return true;
  const k = keyword.toLowerCase();
  return fields.some((f) => (f ?? "").toLowerCase().includes(k));
}

/**
 * Lists semantic definitions including drafts.
 *
 * `lookup_semantic_layer` deliberately only returns *published* metrics — that
 * is correct for the query agent, but the metric_dev agent must be able to see
 * and operate on drafts (which is exactly what the 指标管理 page lists). This
 * tool mirrors that page.
 */
export function createListSemanticDefinitionsTool(): AgentTool<typeof ListSemanticDefinitionsParams, any> {
  return {
    name: "list_semantic_definitions",
    description: `列出当前数据源的指标、维度、语义模型（包含草稿，等同于指标管理页面的列表）。
可按类型、状态、关键词过滤，返回 id / name / display_name / status / SQL。
修改、发布、弃用、删除前先用它定位对象。`,
    label: "列出语义定义",
    parameters: ListSemanticDefinitionsParams,
    execute: async (_toolCallId: string, params: any) => {
      const p = params as ListSemanticDefinitionsParams;
      const type = p.type ?? "all";
      const status = p.status ?? "all";

      const metrics = type === "all" || type === "metric"
        ? listMetrics(p.datasource_id).filter((m) =>
            (status === "all" || m.status === status) &&
            matches(p.keyword, m.name, m.display_name, m.category, m.aliases))
        : [];
      const dimensions = type === "all" || type === "dimension"
        ? listDimensions(p.datasource_id).filter((d) =>
            (status === "all" || d.status === status) &&
            matches(p.keyword, d.name, d.display_name))
        : [];
      const models = type === "all" || type === "model"
        ? listModels(p.datasource_id).filter((m) =>
            (status === "all" || m.status === status) &&
            matches(p.keyword, m.name, m.description))
        : [];

      if (metrics.length === 0 && dimensions.length === 0 && models.length === 0) {
        return {
          content: [{ type: "text" as const, text: "当前过滤条件下没有找到任何指标/维度/模型。可去掉 keyword 或 status 过滤后重试。" }],
          details: { metrics: [], dimensions: [], models: [], total: 0 },
        };
      }

      const lines: string[] = [];
      if (metrics.length > 0) {
        lines.push(`## 指标 (${metrics.length})`);
        for (const m of metrics) {
          lines.push(`- id=${m.id} | ${m.name} | ${m.display_name} | 状态: ${m.status} | 类型: ${m.metric_type}${m.unit ? ` | 单位: ${m.unit}` : ""}${m.category ? ` | 分类: ${m.category}` : ""}`);
          lines.push(`  SQL: ${(m.sql ?? "").replace(/\s+/g, " ").slice(0, 160)}`);
        }
      }
      if (dimensions.length > 0) {
        lines.push(`## 维度 (${dimensions.length})`);
        for (const d of dimensions) {
          lines.push(`- id=${d.id} | ${d.name} | ${d.display_name} | 状态: ${d.status} | 类型: ${d.data_type}${d.grain ? ` | 粒度: ${d.grain}` : ""}`);
          lines.push(`  表达式: ${d.sql_expression}`);
        }
      }
      if (models.length > 0) {
        lines.push(`## 语义模型 (${models.length})`);
        for (const m of models) {
          lines.push(`- id=${m.id} | ${m.name} | 状态: ${m.status} | 事实表: ${m.base_table}`);
        }
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        details: {
          total: metrics.length + dimensions.length + models.length,
          metrics: metrics.map((m) => ({ id: m.id, name: m.name, display_name: m.display_name, status: m.status })),
          dimensions: dimensions.map((d) => ({ id: d.id, name: d.name, display_name: d.display_name, status: d.status })),
          models: models.map((m) => ({ id: m.id, name: m.name, status: m.status })),
        },
      };
    },
  };
}
