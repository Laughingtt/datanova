import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { resolveModel, streamFn } from "./model-provider.js";
import { buildChainAuditorSystemPrompt } from "./prompt-builder-chain-auditor.js";
import type { AgentHarnessOptions } from "./agent-registry.js";

/**
 * Factory for the chain_auditor (管理员审计) Agent.
 *
 * This agent does NOT query user databases. It reads recorded agent_traces and
 * uses the `infer_agent_chain` tool to reconstruct the decision chain of a
 * function agent (query / metric_dev). Its job is to let an administrator
 * understand WHY a function agent took the path it did — each decision point,
 * tool choice rationale, and whether self-correction was triggered.
 */
export async function createChainAuditorHarness(options: AgentHarnessOptions, tools: AgentTool[]): Promise<Agent> {
  const systemPrompt = buildChainAuditorSystemPrompt();

  const provider = options.modelProvider ?? process.env.DATANOVA_PROVIDER ?? "anthropic";
  const modelId = options.modelId ?? process.env.DATANOVA_MODEL ?? "claude-sonnet-5";
  const model = resolveModel(provider, modelId);

  return new Agent({
    initialState: { systemPrompt, model, tools },
    streamFn,
    sessionId: `chain-auditor:${options.datasourceId}:${Date.now()}`,
    toolExecution: "sequential",
  });
}
