import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { resolveModel, streamFn } from "./model-provider.js";
import { buildMetricDevSystemPrompt } from "./prompt-builder-metric-dev.js";
import type { AgentContext, AgentHarnessOptions } from "./agent-registry.js";
import { listDatasources } from "../store.js";

export async function createMetricDevHarness(options: AgentHarnessOptions, tools: AgentTool[]): Promise<Agent> {
  const ds = listDatasources().find(d => d.id === options.datasourceId);
  const context: AgentContext = {
    datasourceId: options.datasourceId,
    datasourceName: ds?.name || options.datasourceId,
  };

  const systemPrompt = buildMetricDevSystemPrompt(context);

  // Use frontend-provided model config, same as query agent (harness-factory.ts)
  const provider = options.modelProvider ?? process.env.DATANOVA_PROVIDER ?? "anthropic";
  const modelId = options.modelId ?? process.env.DATANOVA_MODEL ?? "claude-sonnet-5";
  const model = resolveModel(provider, modelId);

  return new Agent({
    initialState: { systemPrompt, model, tools },
    streamFn,
    sessionId: `metric-dev:${options.datasourceId}:${Date.now()}`,
    toolExecution: "sequential",
  });
}
