import { AgentHarness, InMemorySessionRepo, type Skill, type AgentTool, type ExecutionEnv } from "@earendil-works/pi-agent-core";
import { getModel, getEnvApiKey } from "@earendil-works/pi-ai";
import { createDiscoverSchemaTool } from "./tools/discover-schema.js";
import { createExecuteSqlTool } from "./tools/execute-sql.js";
import { createAiAnnotateSchemaTool } from "./tools/ai-annotate-schema.js";
import { createLookupSemanticLayerTool } from "./tools/lookup-semantic-layer.js";
import { createLookupExamplesTool } from "./tools/lookup-examples.js";
import { createAiSuggestSemanticTool } from "./tools/ai-suggest-semantic.js";
import { createReadSkillTool } from "./tools/read-skill.js";
import { buildDataNovaSystemPrompt, type DataNovaSystemPromptOptions } from "./prompt-builder.js";
import { loadAllSkills } from "./skill-manager.js";

export const harnessMap = new Map<string, AgentHarness>();
const sessionRepo = new InMemorySessionRepo();

export interface CreateHarnessOptions {
  conversationId: string;
  datasourceId?: string;
  datasourceName?: string;
  modelProvider?: string;
  modelId?: string;
  customInstructions?: string;
}

export async function createHarness(options: CreateHarnessOptions): Promise<AgentHarness> {
  // Remove existing harness if any
  if (harnessMap.has(options.conversationId)) {
    await removeHarness(options.conversationId);
  }

  // Load skills
  const skills = loadAllSkills();

  // Create tools — read_skill needs access to the current skills list
  const getSkills = () => loadAllSkills();
  const tools: AgentTool[] = [
    createDiscoverSchemaTool(),
    createExecuteSqlTool(),
    createAiAnnotateSchemaTool(),
    createLookupSemanticLayerTool(),
    createLookupExamplesTool(),
    createAiSuggestSemanticTool(),
    createReadSkillTool(getSkills),
  ];

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

  // Create harness — API key is resolved automatically by pi-ai from
  // environment variables (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)
  // via getEnvApiKey(). We provide getApiKeyAndHeaders so that
  // compact() / navigateTree() also work (they require explicit auth).
  const harness = new AgentHarness({
    env: createMinimalEnv(),
    session,
    tools,
    resources: {
      skills,
    },
    systemPrompt: buildDataNovaSystemPrompt(promptOptions),
    model,
    getApiKeyAndHeaders: async (model) => {
      const apiKey = getEnvApiKey(model.provider);
      if (!apiKey) {
        throw new Error(
          `No API key found for provider "${model.provider}". ` +
          `Please set the corresponding environment variable (e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY).`
        );
      }
      return { apiKey, headers: {} };
    },
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

/**
 * Refresh skills for all harnesses using a specific datasource.
 * Called after annotation changes to keep Agent prompts up-to-date.
 */
export function refreshHarnessesForDatasource(_datasourceId: string): void {
  // Refresh all harnesses — we don't track which harness uses which datasource
  // so we refresh all. This is fine since there are typically few active sessions.
  for (const [conversationId] of harnessMap) {
    refreshHarnessSkills(conversationId).catch(() => {
      // Ignore errors during background refresh
    });
  }
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
