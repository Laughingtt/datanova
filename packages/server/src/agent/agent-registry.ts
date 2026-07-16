import type { AgentTool } from "@earendil-works/pi-agent-core";

export interface AgentContext {
  datasourceId: string;
  datasourceName: string;
  existingMetricsCount?: number;
  existingDimensionsCount?: number;
}

export interface EntryPoint {
  view: string;
  label: string;
  initialPrompt?: string;
}

export interface AgentHarnessOptions {
  datasourceId: string;
  modelProvider?: string;
  modelId?: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
  version: string;
  capabilities: string[];
  toolSet: string[];
  systemPromptBuilder: (context: AgentContext) => string;
  harnessFactory: (options: AgentHarnessOptions, tools: AgentTool[]) => any;
  entryPoints: EntryPoint[];
  welcomeMessage: string;
}

export class AgentRegistry {
  private agents = new Map<string, AgentDefinition>();
  private toolPool = new Map<string, AgentTool>();

  registerTool(tool: AgentTool): void {
    this.toolPool.set(tool.name, tool);
  }

  registerAgent(def: AgentDefinition): void {
    this.agents.set(def.id, def);
  }

  getAgent(id: string): AgentDefinition | undefined {
    return this.agents.get(id);
  }

  getAgentTools(agentId: string): AgentTool[] {
    const def = this.agents.get(agentId);
    if (!def) return [];
    return def.toolSet
      .map(toolId => this.toolPool.get(toolId))
      .filter(Boolean) as AgentTool[];
  }

  listAgents(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  async createHarness(agentId: string, options: AgentHarnessOptions): Promise<any> {
    const def = this.agents.get(agentId);
    if (!def) throw new Error(`Agent not found: ${agentId}`);
    const tools = this.getAgentTools(agentId);
    return def.harnessFactory(options, tools);
  }
}

export const agentRegistry = new AgentRegistry();
