import { agentRegistry, type AgentHarnessOptions } from "./agent-registry.js";
export { agentRegistry } from "./agent-registry.js";
import { registerAllTools } from "./tool-registration.js";
import { createHarness as createQueryHarness } from "./harness-factory.js";
import { buildDataNovaSystemPrompt } from "./prompt-builder.js";
import { buildMetricDevSystemPrompt } from "./prompt-builder-metric-dev.js";
import { createMetricDevHarness } from "./metric-dev-harness.js";

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
}

export function initAgentFramework(): void {
  registerAllTools(agentRegistry);
  registerAllAgents();
}
