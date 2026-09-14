import { agentRegistry, type AgentHarnessOptions } from "./agent-registry.js";
export { agentRegistry } from "./agent-registry.js";
import { registerAllTools } from "./tool-registration.js";
import { createHarness as createQueryHarness } from "./harness-factory.js";
import { buildDataNovaSystemPrompt } from "./prompt-builder.js";
import { buildMetricDevSystemPrompt } from "./prompt-builder-metric-dev.js";
import { createMetricDevHarness } from "./metric-dev-harness.js";
import { createChainAuditorHarness } from "./chain-auditor-harness.js";
import { buildChainAuditorSystemPrompt } from "./prompt-builder-chain-auditor.js";

function registerAllAgents(): void {
  // 智能问数Agent — 复用现有createHarness，零改动
  agentRegistry.registerAgent({
    id: "query",
    name: "智能问数",
    icon: "💬",
    description: "用自然语言查询数据",
    color: "var(--primary)",
    version: "1.0.0",
    capabilities: ["查询数据", "生成图表", "探索Schema"],
    toolSet: [
      "discover_schema", "execute_sql", "lookup_semantic_layer",
      "lookup_examples", "read_skill", "ai_annotate_schema",
    ],
    systemPromptBuilder: (ctx) => buildDataNovaSystemPrompt({
      datasourceId: ctx.datasourceId,
      datasourceName: ctx.datasourceName,
      skills: [],
    }),
    harnessFactory: (options, _tools) => createQueryHarness({
      conversationId: `query:${options.datasourceId}:${Date.now()}`,
      datasourceId: options.datasourceId,
      modelProvider: options.modelProvider,
      modelId: options.modelId,
    }),
    entryPoints: [{ view: "chat", label: "对话" }],
    welcomeMessage: "你好！我是智能问数助手，可以用自然语言帮你查询数据。请描述你想了解的信息。",
  });

  // 指标开发Agent
  agentRegistry.registerAgent({
    id: "metric_dev",
    name: "指标开发",
    icon: "📊",
    description: "AI辅助开发业务指标和维度",
    color: "var(--success)",
    version: "1.0.0",
    capabilities: ["探索数据源", "生成指标SQL", "自动验证修复", "检查指标冲突", "创建指标草稿"],
    toolSet: [
      "discover_schema", "execute_sql", "lookup_semantic_layer",
      "lookup_examples", "read_skill",
      "validate_and_test_metric", "check_metric_conflict",
      "create_metric_draft", "create_dimension_draft",
      "request_user_confirm",
    ],
    systemPromptBuilder: (ctx) => buildMetricDevSystemPrompt(ctx),
    harnessFactory: (options, tools) => createMetricDevHarness(options, tools),
    entryPoints: [{ view: "metrics", label: "🤖 AI开发指标" }],
    welcomeMessage: "你好！我是指标开发助手，可以帮你开发和验证业务指标。\n\n我可以：\n• 根据你的描述生成指标SQL\n• 自动验证SQL正确性并测试\n• 检查与已有指标的冲突\n• 创建指标和维度草稿\n\n请描述你需要什么指标？",
  });

  // 链路审计Agent（管理员视角）— 不查询用户数据库，只根据 trace 反推功能 Agent 决策链
  agentRegistry.registerAgent({
    id: "chain_auditor",
    name: "链路审计",
    icon: "🔍",
    description: "管理员审计：根据 Agent 追踪记录反推决策链路",
    color: "var(--accent-600)",
    version: "1.0.0",
    capabilities: ["反推决策链路", "解释工具抉择", "分析自修复", "评估链路合理性"],
    toolSet: ["infer_agent_chain"],
    systemPromptBuilder: () => buildChainAuditorSystemPrompt(),
    harnessFactory: (options, tools) => createChainAuditorHarness(options, tools),
    entryPoints: [{ view: "agentTraces", label: "🔍 审计链路" }],
    welcomeMessage: "你好！我是 Agent 链路审计员（管理员视角）。\n\n给我一条 Agent 追踪记录的 trace_id，我会调用 infer_agent_chain 反推出功能 Agent 的完整决策链路：每一步为什么选某个工具、期望与实际结果、是否触发自修复、链路是否合理。\n\ntrace_id 可在「Agent 追踪」页面找到。请提供 trace_id：",
  });
}

export function initAgentFramework(): void {
  registerAllTools(agentRegistry);
  registerAllAgents();
}
