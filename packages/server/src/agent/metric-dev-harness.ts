import { AgentHarness, InMemorySessionRepo, type AgentTool, type ExecutionEnv } from "@earendil-works/pi-agent-core";
import { getModel, getEnvApiKey } from "@earendil-works/pi-ai";
import { buildMetricDevSystemPrompt } from "./prompt-builder-metric-dev.js";
import type { AgentContext, AgentHarnessOptions } from "./agent-registry.js";
import { listDatasources } from "../store.js";

const metricDevSessionRepo = new InMemorySessionRepo();

export async function createMetricDevHarness(options: AgentHarnessOptions, tools: AgentTool[]): Promise<AgentHarness> {
  const ds = listDatasources().find(d => d.id === options.datasourceId);
  const context: AgentContext = {
    datasourceId: options.datasourceId,
    datasourceName: ds?.name || options.datasourceId,
  };

  const systemPrompt = buildMetricDevSystemPrompt(context);

  // Use frontend-provided model config, same as query agent (harness-factory.ts)
  const provider = options.modelProvider ?? process.env.DATANOVA_PROVIDER ?? "anthropic";
  const modelId = options.modelId ?? process.env.DATANOVA_MODEL ?? "claude-sonnet-4-20250514";
  const model = getModel(provider as "anthropic", modelId as any);

  const session = await metricDevSessionRepo.create({ id: `metric-dev:${options.datasourceId}:${Date.now()}` });

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
