import { AgentHarness, InMemorySessionRepo, type AgentTool, type ExecutionEnv } from "@earendil-works/pi-agent-core";
import { getEnvApiKey } from "@earendil-works/pi-ai";
import { resolveModel } from "./model-provider.js";
import { buildChainAuditorSystemPrompt } from "./prompt-builder-chain-auditor.js";
import type { AgentHarnessOptions } from "./agent-registry.js";

const chainAuditorSessionRepo = new InMemorySessionRepo();

/**
 * Factory for the chain_auditor (管理员审计) Agent.
 *
 * This agent does NOT query user databases. It reads recorded agent_traces and
 * uses the `infer_agent_chain` tool to reconstruct the decision chain of a
 * function agent (query / metric_dev). Its job is to let an administrator
 * understand WHY a function agent took the path it did — each decision point,
 * tool choice rationale, and whether self-correction was triggered.
 *
 * It reuses the metric-dev-style harness construction (minimal env, env-based
 * API key) but with its own system prompt and a single-tool toolset.
 */
export async function createChainAuditorHarness(options: AgentHarnessOptions, tools: AgentTool[]): Promise<AgentHarness> {
  const systemPrompt = buildChainAuditorSystemPrompt();

  const provider = options.modelProvider ?? process.env.DATANOVA_PROVIDER ?? "anthropic";
  const modelId = options.modelId ?? process.env.DATANOVA_MODEL ?? "claude-sonnet-5";
  const model = resolveModel(provider, modelId);

  const session = await chainAuditorSessionRepo.create({ id: `chain-auditor:${options.datasourceId}:${Date.now()}` });

  return new AgentHarness({
    env: createMinimalEnv(),
    session,
    tools,
    resources: {},
    systemPrompt,
    model,
    getApiKeyAndHeaders: async (model) => {
      const apiKey = getEnvApiKey(model.provider);
      if (!apiKey) {
        throw new Error(`No API key found for provider "${model.provider}".`);
      }
      return { apiKey, headers: {} };
    },
  });
}

function createMinimalEnv(): ExecutionEnv {
  return {
    cwd: process.cwd(),
    absolutePath: async (p: string) => ({ ok: true as const, value: p }),
    joinPath: async (parts: string[]) => ({ ok: true as const, value: parts.join("/") }),
    readTextFile: async () => ({ ok: false as const, error: new Error("Not supported") as any }),
    readTextLines: async () => ({ ok: false as const, error: new Error("Not supported") as any }),
    readBinaryFile: async () => ({ ok: false as const, error: new Error("Not supported") as any }),
    writeFile: async () => ({ ok: false as const, error: new Error("Not supported") as any }),
    appendFile: async () => ({ ok: false as const, error: new Error("Not supported") as any }),
    fileInfo: async () => ({ ok: false as const, error: new Error("Not supported") as any }),
    listDir: async () => ({ ok: false as const, error: new Error("Not supported") as any }),
    canonicalPath: async (p: string) => ({ ok: true as const, value: p }),
    exists: async () => ({ ok: true as const, value: false }),
    createDir: async () => ({ ok: false as const, error: new Error("Not supported") as any }),
    remove: async () => ({ ok: false as const, error: new Error("Not supported") as any }),
    createTempDir: async () => ({ ok: false as const, error: new Error("Not supported") as any }),
    createTempFile: async () => ({ ok: false as const, error: new Error("Not supported") as any }),
    cleanup: async () => {},
    exec: async () => ({
      ok: false as const,
      error: new Error("Shell not available in DataNova") as any,
    }),
  } as ExecutionEnv;
}
