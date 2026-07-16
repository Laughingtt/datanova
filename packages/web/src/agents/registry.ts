import type { AgentInfo, EntryPoint } from "./types";

export const AGENT_REGISTRY: AgentInfo[] = [
  {
    id: "query",
    name: "智能问数",
    icon: "💬",
    description: "用自然语言查询数据",
    color: "var(--primary)",
    capabilities: ["查询数据", "生成图表", "探索Schema"],
    entryPoints: [{ view: "chat", label: "对话" }],
    welcomeMessage: "你好！我是智能问数助手，可以用自然语言帮你查询数据。请描述你想了解的信息。",
  },
  {
    id: "metric_dev",
    name: "指标开发",
    icon: "📊",
    description: "AI辅助开发业务指标和维度",
    color: "var(--success)",
    capabilities: ["探索数据源", "生成指标SQL", "自动验证修复", "检查指标冲突", "创建指标草稿"],
    entryPoints: [{ view: "metrics", label: "🤖 AI开发指标" }],
    welcomeMessage: "你好！我是指标开发助手，可以帮你开发和验证业务指标。\n\n我可以：\n• 根据你的描述生成指标SQL\n• 自动验证SQL正确性并测试\n• 检查与已有指标的冲突\n• 创建指标和维度草稿\n\n请描述你需要什么指标？",
  },
];

export function getAgentById(id: string): AgentInfo | undefined {
  return AGENT_REGISTRY.find(a => a.id === id);
}

export function getAgentEntryPoint(view: string): { agentId: string; label: string; initialPrompt?: string } | undefined {
  for (const agent of AGENT_REGISTRY) {
    const entry = agent.entryPoints.find(e => e.view === view);
    if (entry) return { agentId: agent.id, label: entry.label, initialPrompt: entry.initialPrompt };
  }
  return undefined;
}
