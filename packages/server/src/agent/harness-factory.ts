import { AgentHarness, InMemorySessionRepo, type Skill, type AgentTool, type ExecutionEnv } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";
import { createDiscoverSchemaTool } from "./tools/discover-schema.js";
import { createExecuteSqlTool } from "./tools/execute-sql.js";
import { buildDataNovaSystemPrompt, type DataNovaSystemPromptOptions } from "./prompt-builder.js";
import { loadAllSkills } from "./skill-manager.js";

const harnessMap = new Map<string, AgentHarness>();
const sessionRepo = new InMemorySessionRepo();

export interface CreateHarnessOptions {
  conversationId: string;
  datasourceId?: string;
  datasourceName?: string;
  modelProvider?: string;
  modelId?: string;
  customInstructions?: string;
  apiKey?: string;
}

export async function createHarness(options: CreateHarnessOptions): Promise<AgentHarness> {
  // Remove existing harness if any
  if (harnessMap.has(options.conversationId)) {
    await removeHarness(options.conversationId);
  }

  // Create tools
  const tools: AgentTool[] = [
    createDiscoverSchemaTool(),
    createExecuteSqlTool(),
  ];

  // Load skills
  const skills = loadAllSkills();

  // Build system prompt options
  const promptOptions: DataNovaSystemPromptOptions = {
    datasourceId: options.datasourceId,
    datasourceName: options.datasourceName,
    skills,
    customInstructions: options.customInstructions,
  };

  // Create session
  const session = await sessionRepo.create({ id: options.conversationId });

  // Get model
  const provider = options.modelProvider ?? "anthropic";
  const modelId = options.modelId ?? "claude-sonnet-4-20250514";
  const model = getModel(provider as "anthropic", modelId as "claude-sonnet-4-20250514");

  // Create harness
  const harness = new AgentHarness({
    env: createMinimalEnv(),
    session,
    tools,
    resources: {
      skills,
    },
    systemPrompt: buildDataNovaSystemPrompt(promptOptions),
    model,
    getApiKeyAndHeaders: options.apiKey
      ? async () => ({
          apiKey: options.apiKey!,
          headers: {},
        })
      : undefined,
  });

  harnessMap.set(options.conversationId, harness);
  return harness;
}

export function getHarness(conversationId: string): AgentHarness | undefined {
  return harnessMap.get(conversationId);
}

export async function refreshHarnessSkills(conversationId: string): Promise<void> {
  const harness = harnessMap.get(conversationId);
  if (!harness) return;

  const skills = loadAllSkills();
  await harness.setResources({
    skills,
  });
}

export async function removeHarness(conversationId: string): Promise<void> {
  const harness = harnessMap.get(conversationId);
  if (harness) {
    try {
      await harness.abort();
    } catch {
      // Ignore abort errors
    }
    harnessMap.delete(conversationId);
  }
}

/**
 * Create a minimal ExecutionEnv for the harness.
 * DataNova doesn't need shell or filesystem access.
 * We use a type assertion since all stub methods are intentionally disabled
 * but the full interface requires specific parameter signatures.
 */
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
