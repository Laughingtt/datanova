import type { AgentRegistry } from "./agent-registry.js";
import { createDiscoverSchemaTool } from "./tools/discover-schema.js";
import { createExecuteSqlTool } from "./tools/execute-sql.js";
import { createAiAnnotateSchemaTool } from "./tools/ai-annotate-schema.js";
import { createLookupSemanticLayerTool } from "./tools/lookup-semantic-layer.js";
import { createLookupExamplesTool } from "./tools/lookup-examples.js";
import { createReadSkillTool } from "./tools/read-skill.js";
import { createValidateAndTestMetricTool } from "./tools/validate-and-test-metric.js";
import { createCheckMetricConflictTool } from "./tools/check-metric-conflict.js";
import { createCreateMetricDraftTool } from "./tools/create-metric-draft.js";
import { createCreateDimensionDraftTool } from "./tools/create-dimension-draft.js";
import { createRequestUserConfirmTool } from "./tools/request-confirm.js";
import { createInferAgentChainTool } from "./tools/infer-agent-chain.js";
import { loadAllSkills } from "./skill-manager.js";

export function registerAllTools(registry: AgentRegistry): void {
  // 共享工具（多个Agent复用）
  registry.registerTool(createDiscoverSchemaTool());
  registry.registerTool(createExecuteSqlTool());
  registry.registerTool(createAiAnnotateSchemaTool());
  registry.registerTool(createLookupSemanticLayerTool());
  registry.registerTool(createLookupExamplesTool());
  const getSkills = () => loadAllSkills();
  registry.registerTool(createReadSkillTool(getSkills));

  // 指标开发专用工具
  registry.registerTool(createValidateAndTestMetricTool());
  registry.registerTool(createCheckMetricConflictTool());
  registry.registerTool(createCreateMetricDraftTool());
  registry.registerTool(createCreateDimensionDraftTool());
  registry.registerTool(createRequestUserConfirmTool());

  // 管理员审计工具 — 供 chain_auditor Agent 反推功能 Agent 的决策链路
  registry.registerTool(createInferAgentChainTool());
}
