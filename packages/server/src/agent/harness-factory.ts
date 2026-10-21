import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { createInitialSystemMessage, toToolDeclaration } from "@earendil-works/pi-ai";
import { resolveModel, streamFn } from "./model-provider.js";
import { createDiscoverSchemaTool } from "./tools/discover-schema.js";
import { createExecuteSqlTool } from "./tools/execute-sql.js";
import { createAiAnnotateSchemaTool } from "./tools/ai-annotate-schema.js";
import { createLookupSemanticLayerTool } from "./tools/lookup-semantic-layer.js";
import { createLookupExamplesTool } from "./tools/lookup-examples.js";
import { createAiSuggestSemanticTool } from "./tools/ai-suggest-semantic.js";
import { createReadSkillTool } from "./tools/read-skill.js";
import { buildDataNovaSystemPrompt, type DataNovaSystemPromptOptions } from "./prompt-builder.js";
import { loadAllSkills } from "./skill-manager.js";

/** Conversation id → running pi Agent. */
export const harnessMap = new Map<string, Agent>();
/** Conversation id → creation options, kept so the system prompt can be rebuilt. */
const harnessOptionsMap = new Map<string, CreateHarnessOptions>();

export interface CreateHarnessOptions {
  conversationId: string;
  datasourceId?: string;
  datasourceName?: string;
  modelProvider?: string;
  modelId?: string;
  customInstructions?: string;
}

export async function createHarness(options: CreateHarnessOptions): Promise<Agent> {
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

  // Get model
  const provider = options.modelProvider ?? process.env.DATANOVA_PROVIDER ?? "anthropic";
  const modelId = options.modelId ?? process.env.DATANOVA_MODEL ?? "claude-sonnet-5";
  const model = resolveModel(provider, modelId);

  // pi-agent-core 1.3: Agent owns transcript + tool execution. Auth is resolved
  // by pi-ai's Models collection from environment variables (ANTHROPIC_API_KEY,
  // OPENAI_API_KEY, DEEPSEEK_API_KEY, …) on every request.
  //
  // toolExecution is "sequential" because several tools mutate shared draft /
  // confirmation state in call order (request_user_confirm → create_*_draft).
  const agent = new Agent({
    initialState: {
      systemPrompt: buildDataNovaSystemPrompt(promptOptions),
      model,
      tools,
    },
    streamFn,
    sessionId: options.conversationId,
    toolExecution: "sequential",
  });

  harnessMap.set(options.conversationId, agent);
  harnessOptionsMap.set(options.conversationId, options);
  return agent;
}

export function getHarness(conversationId: string): Agent | undefined {
  return harnessMap.get(conversationId);
}

export async function refreshHarnessSkills(conversationId: string): Promise<void> {
  const harness = harnessMap.get(conversationId);
  const options = harnessOptionsMap.get(conversationId);
  if (!harness || !options) return;
  // Never rewrite the transcript while a run is in flight.
  if (harness.state.isStreaming) return;

  const skills = loadAllSkills();
  const systemPrompt = buildDataNovaSystemPrompt({
    datasourceId: options.datasourceId,
    datasourceName: options.datasourceName,
    skills,
    customInstructions: options.customInstructions,
  });

  const systemMessage = createInitialSystemMessage(
    systemPrompt,
    harness.state.tools.map(toToolDeclaration),
  );
  if (!systemMessage) return;

  // Replace the leading system message (prompt + tool declarations) and keep
  // the conversation transcript intact.
  const transcript = harness.state.messages.filter((message) => message.role !== "system");
  harness.state.messages = [systemMessage, ...transcript];
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
      harness.abort();
    } catch {
      // Ignore abort errors
    }
    harnessMap.delete(conversationId);
    harnessOptionsMap.delete(conversationId);
  }
}
