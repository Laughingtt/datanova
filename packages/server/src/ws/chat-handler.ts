import type { WSContext } from "hono/ws";
import { createHarness, getHarness, removeHarness, harnessMap, type CreateHarnessOptions } from "../agent/harness-factory.js";
import type { AgentHarnessEvent, Skill, PromptTemplate } from "@earendil-works/pi-agent-core";
import { saveMessage, listMessages, getRecentSqlContext } from "../store.js";
import { discoverSchema } from "../mysql/discovery.js";
import { setSchemaCache } from "../mysql/validator.js";
import { agentRegistry } from "../agent/agent-registration.js";

// Track conversationId -> datasourceId for context injection
const conversationDatasourceMap = new Map<string, string>();

// Shared streaming state per conversation, so handleInit and handleMessage
// accumulate into the same object. Without this, handleMessage creates its own
// empty state that never receives events from the harness subscriber.
const streamingStates = new Map<string, StreamingAssistantState>();

interface WsMessage {
  type: "init" | "message" | "reset_context";
  payload?: Record<string, unknown>;
  text?: string;
}

function sendEvent(ws: WSContext, event: Record<string, unknown>): void {
  try {
    ws.send(JSON.stringify(event));
  } catch {
    // Connection may have been closed
  }
}

/**
 * Tracked state for an in-flight assistant message being streamed.
 * Accumulates content and steps so we can persist the full message
 * when the agent loop finishes.
 */
interface StreamingAssistantState {
  content: string;
  steps: Array<Record<string, unknown>>;
}

export function createChatHandler() {
  return {
    onOpen(_event: Event, ws: WSContext) {
      sendEvent(ws, { type: "connected" });
    },

    async onMessage(event: MessageEvent, ws: WSContext) {
      let data: WsMessage;
      try {
        data = JSON.parse(event.data as string) as WsMessage;
      } catch {
        sendEvent(ws, { type: "error", error: "Invalid JSON" });
        return;
      }

      try {
        if (data.type === "init") {
          await handleInit(ws, data);
        } else if (data.type === "message") {
          await handleMessage(ws, data);
        } else if (data.type === "reset_context") {
          await handleResetContext(ws, data);
        } else {
          sendEvent(ws, { type: "error", error: `Unknown message type: ${data.type}` });
        }
      } catch (err) {
        const error = err as Error;
        sendEvent(ws, { type: "error", error: error.message });
      }
    },

    onClose(_event: CloseEvent, _ws: WSContext) {
      // Cleanup could be done here if needed
    },
  };
}

async function handleInit(ws: WSContext, data: WsMessage): Promise<void> {
  const payload = data.payload ?? {};

  const options: CreateHarnessOptions = {
    conversationId: payload.conversationId as string,
    datasourceId: payload.datasourceId as string | undefined,
    datasourceName: payload.datasourceName as string | undefined,
    modelProvider: payload.modelProvider as string | undefined,
    modelId: payload.modelId as string | undefined,
    customInstructions: payload.customInstructions as string | undefined,
  };

  if (!options.conversationId) {
    sendEvent(ws, { type: "error", error: "Missing conversationId" });
    return;
  }

  try {
    // Agent routing: query走原有createHarness，其他Agent走注册表
    const agentType = (payload.agentType as string) || "query";
    let harness: Awaited<ReturnType<typeof createHarness>>;

    if (agentType === "query") {
      // 现有流程，零改动
      harness = await createHarness(options);
    } else {
      // 新Agent走注册表 — 传入完整的模型配置，与query agent一致
      harness = await agentRegistry.createHarness(agentType, {
        datasourceId: options.datasourceId!,
        modelProvider: options.modelProvider,
        modelId: options.modelId,
      });
      harnessMap.set(options.conversationId, harness);
    }

    // Pre-populate schema cache for validator so column validation works
    // even if the LLM skips discover_schema on the first query
    if (options.datasourceId) {
      try {
        const schemaInfo = await discoverSchema(options.datasourceId);
        if (schemaInfo && schemaInfo.tables) {
          const tables = schemaInfo.tables.map((t: any) => t.table.name);
          const columnsByTable = new Map<string, string[]>();
          for (const tableSchema of schemaInfo.tables) {
            columnsByTable.set(
              tableSchema.table.name,
              tableSchema.columns.map((c: any) => c.name)
            );
          }
          setSchemaCache(options.datasourceId, tables, columnsByTable);
        }
      } catch {
        // Non-critical: schema discovery may fail if DB is unreachable
      }
    }

    // Streaming assistant state — shared via Map so handleMessage can access it
    const streamingState: StreamingAssistantState = { content: "", steps: [] };
    streamingStates.set(options.conversationId, streamingState);

    // Subscribe to harness events — this is the ONLY way to forward
    // streaming events (text deltas, thinking, tool calls, etc.)
    harness.subscribe((event: AgentHarnessEvent<Skill, PromptTemplate>) => {
      // Accumulate streaming state for persistence
      accumulateStreamingState(streamingState, event);

      // Forward to frontend
      forwardEvent(ws, event);
    });

    // Load and send persisted message history
    const history = listMessages(options.conversationId);
    if (history.length > 0) {
      sendEvent(ws, {
        type: "message_history",
        messages: history.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          steps: m.steps ? JSON.parse(m.steps) : undefined,
          timestamp: new Date(m.created_at).getTime(),
        })),
      });
    }

    sendEvent(ws, { type: "init_success", conversationId: options.conversationId });

    // Track datasource for context injection in follow-up messages
    if (options.datasourceId) {
      conversationDatasourceMap.set(options.conversationId, options.datasourceId);
    }
  } catch (err) {
    const error = err as Error;
    sendEvent(ws, { type: "error", error: `Failed to initialize: ${error.message}` });
  }
}

async function handleMessage(ws: WSContext, data: WsMessage): Promise<void> {
  const conversationId = (data.payload?.conversationId as string) ?? "";
  const text = data.text ?? (data.payload?.text as string) ?? "";

  if (!conversationId) {
    sendEvent(ws, { type: "error", error: "Missing conversationId" });
    return;
  }

  if (!text.trim()) {
    sendEvent(ws, { type: "error", error: "Empty message" });
    return;
  }

  const harness = getHarness(conversationId);
  if (!harness) {
    sendEvent(ws, { type: "error", error: "Session not initialized. Send init message first." });
    return;
  }

  try {
    // Persist user message
    saveMessage({
      conversationId,
      role: "user",
      content: text,
    });

    // Build structured SQL context for multi-turn follow-up queries
    const datasourceId = conversationDatasourceMap.get(conversationId);
    let contextPrefix = "";
    if (datasourceId) {
      const recentSql = getRecentSqlContext(datasourceId, 3);
      if (recentSql.length > 0) {
        const contextLines = recentSql.map((ctx, i) => {
          const tables = ctx.tables.join(", ");
          return "[Recent query " + (i + 1) + "] Question: \"" + ctx.question + "\" | Tables: " + tables + " | Rows: " + (ctx.rowCount ?? "?") + " | Time: " + (ctx.executionTimeMs ?? "?") + "ms\n  SQL: " + ctx.sql;
        });
        contextPrefix = "[Conversation SQL Context - " + recentSql.length + " recent queries]\n" + contextLines.join("\n") + "\n\n";
      }
    }

    // Inject conversation_id into context so LLM can pass it to tools
    if (conversationId) {
      contextPrefix += `[Current conversation_id: ${conversationId}]\n\n`;
    }

    // Reset streaming state for this turn (shared with handleInit's subscriber)
    const streamingState = streamingStates.get(conversationId);
    if (streamingState) {
      streamingState.content = "";
      streamingState.steps = [];
    }

    // prompt() triggers the agent loop. All streaming events
    // are forwarded via the subscribe() handler in handleInit,
    // which accumulates into the shared streamingState.
    const response = await harness.prompt(contextPrefix + text);

    // Extract full response content
    const fullContent = typeof response.content === "string"
      ? response.content
      : response.content.map((c: any) => c.text ?? "").join("");

    // If the LLM returned no content (e.g. API key error, rate limit),
    // the streaming error event was already forwarded via message_end handler.
    // Still persist and send response_complete so the frontend can close the stream.
    const persistedSteps = streamingState?.steps ?? [];
    saveMessage({
      conversationId,
      role: "assistant",
      content: fullContent || "（AI 未返回内容，请检查 API 配置）",
      steps: persistedSteps,
    });

    // Send a final "response" event with the complete message content
    // so the frontend can use it if it missed streaming deltas.
    sendEvent(ws, {
      type: "response_complete",
      content: fullContent || "（AI 未返回内容，请检查 API 配置）",
    });
  } catch (err) {
    const error = err as Error;
    sendEvent(ws, { type: "error", error: error.message });
  }
}

/**
 * Handle reset_context — re-create the harness to clear conversation context.
 */
async function handleResetContext(ws: WSContext, data: WsMessage): Promise<void> {
  const conversationId = (data.payload?.conversationId as string) ?? "";
  if (!conversationId) {
    sendEvent(ws, { type: "error", error: "Missing conversationId" });
    return;
  }

  try {
    // Remove existing harness (clears agent context)
    conversationDatasourceMap.delete(conversationId);
    await removeHarness(conversationId);

    // Re-create with the same options (datasource info from payload)
    const options: CreateHarnessOptions = {
      conversationId,
      datasourceId: data.payload?.datasourceId as string | undefined,
      datasourceName: data.payload?.datasourceName as string | undefined,
      modelProvider: data.payload?.modelProvider as string | undefined,
      modelId: data.payload?.modelId as string | undefined,
    };

    const harness = await createHarness(options);

    // Re-subscribe to events with shared streaming state
    const streamingState: StreamingAssistantState = { content: "", steps: [] };
    streamingStates.set(conversationId, streamingState);
    harness.subscribe((event: AgentHarnessEvent<Skill, PromptTemplate>) => {
      accumulateStreamingState(streamingState, event);
      forwardEvent(ws, event);
    });

    sendEvent(ws, { type: "init_success", conversationId });
    // Track datasource for context injection
    const resetDsId = data.payload?.datasourceId as string | undefined;
    if (resetDsId) {
      conversationDatasourceMap.set(conversationId, resetDsId);
    }
  } catch (err) {
    const error = err as Error;
    sendEvent(ws, { type: "error", error: `Failed to reset context: ${error.message}` });
  }
}

/**
 * Accumulate streaming state from harness events so we can persist
 * the final assistant message (with steps) to the database.
 */
function accumulateStreamingState(
  state: StreamingAssistantState,
  event: AgentHarnessEvent<Skill, PromptTemplate>
): void {
  switch (event.type) {
    case "message_update": {
      if ("assistantMessageEvent" in event && event.assistantMessageEvent) {
        const ame = event.assistantMessageEvent as Record<string, unknown>;
        const subType = ame.type as string;

        if (subType === "text_delta" && ame.delta) {
          state.content += ame.delta as string;
        } else if (subType === "text_start") {
          const partial = ame.partial as Record<string, unknown> | undefined;
          if (partial) {
            const content = partial.content as Array<Record<string, unknown>> | undefined;
            if (content && content.length > 0 && content[0].text) {
              state.content += content[0].text as string;
            }
          }
        }
      }
      break;
    }

    case "tool_execution_start": {
      state.steps.push({
        type: "tool_call",
        toolName: (event as any).toolName,
        args: (event as any).args,
      });
      break;
    }

    case "tool_execution_end": {
      // Update the last matching tool_call step to tool_result
      const toolName = (event as any).toolName;
      for (let i = state.steps.length - 1; i >= 0; i--) {
        if (state.steps[i].type === "tool_call" && state.steps[i].toolName === toolName) {
          state.steps[i] = {
            ...state.steps[i],
            type: "tool_result",
            result: (event as any).result,
            isError: (event as any).isError,
          };
          break;
        }
      }
      break;
    }

    case "tool_result": {
      const tr = event as any;
      const toolName = tr.toolName;
      for (let i = state.steps.length - 1; i >= 0; i--) {
        if (state.steps[i].type === "tool_call" && state.steps[i].toolName === toolName) {
          state.steps[i] = {
            ...state.steps[i],
            type: "tool_result",
            result: tr.details ?? tr.result,
            isError: tr.isError,
          };
          break;
        }
      }
      break;
    }

    default:
      break;
  }
}

/**
 * Forward AgentHarness events to the WebSocket client.
 *
 * AgentEvent types (from pi-agent-core):
 *   agent_start | agent_end | turn_start | turn_end |
 *   message_start | message_update | message_end |
 *   tool_execution_start | tool_execution_update | tool_execution_end
 *
 * AgentHarnessOwnEvent types:
 *   settled | save_point | tool_call | tool_result | ...etc
 */
function forwardEvent(ws: WSContext, event: AgentHarnessEvent<Skill, PromptTemplate>): void {
  switch (event.type) {
    // ---- Agent lifecycle ----

    case "agent_start":
      sendEvent(ws, { type: "agent_start" });
      break;

    case "agent_end":
      sendEvent(ws, { type: "agent_end" });
      break;

    case "settled":
      sendEvent(ws, { type: "settled" });
      break;

    // ---- Turn lifecycle ----

    case "turn_start":
      sendEvent(ws, { type: "thinking" });
      break;

    case "turn_end":
      // Turn completed — no special action needed
      break;

    // ---- Message streaming ----

    case "message_start":
      // A new message is starting (could be assistant or tool-result)
      if ("message" in event && event.message && "role" in event.message && event.message.role === "assistant") {
        sendEvent(ws, { type: "message_start" });
      }
      break;

    case "message_update": {
      // Streaming delta — the key event for real-time text.
      //
      // assistantMessageEvent has a nested "type" field:
      //   type: "text_start"   — first text chunk (contentIndex, partial)
      //   type: "text_delta"   — incremental text delta (delta field)
      //   type: "thinking_delta" — thinking content (delta field)
      //   type: "done"         — stream complete
      if ("assistantMessageEvent" in event && event.assistantMessageEvent) {
        const ame = event.assistantMessageEvent as Record<string, unknown>;
        const subType = ame.type as string;

        if (subType === "text_delta" && ame.delta) {
          sendEvent(ws, { type: "text_delta", delta: ame.delta });
        } else if (subType === "text_start") {
          // First chunk may carry initial text in partial.content[0].text
          // Forward it as a text_delta so the frontend sees immediate output
          const partial = ame.partial as Record<string, unknown> | undefined;
          if (partial) {
            const content = partial.content as Array<Record<string, unknown>> | undefined;
            if (content && content.length > 0 && content[0].text) {
              sendEvent(ws, { type: "text_delta", delta: content[0].text });
            }
          }
        } else if (subType === "thinking_delta" && ame.delta) {
          sendEvent(ws, { type: "thinking", content: ame.delta });
        }
      }
      break;
    }

    case "message_end": {
      // Check for error stopReason — LLM API failures (invalid key, rate limit, etc.)
      // result in stopReason="error" but no explicit error event from the harness.
      const msg = (event as any).message;
      if (msg && msg.stopReason === "error") {
        const errorDetail = msg.content?.find((c: any) => c.type === "error")?.text
          || "AI 服务调用失败，请检查 API Key 配置或网络连接";
        sendEvent(ws, { type: "error", error: errorDetail });
      }
      break;
    }

    // ---- Tool execution ----

    case "tool_execution_start":
      sendEvent(ws, {
        type: "tool_execution_start",
        toolCallId: (event as any).toolCallId,
        toolName: (event as any).toolName,
        args: (event as any).args,
      });
      break;

    case "tool_execution_end": {
      const toolName = (event as any).toolName;
      const result = (event as any).result;
      sendEvent(ws, {
        type: "tool_execution_end",
        toolCallId: (event as any).toolCallId,
        toolName,
        result,
        details: result?.details,
        isError: (event as any).isError,
      });
      // Detect confirmAction in tool result and forward as confirm_action event
      if (result?.details?.confirmAction) {
        sendEvent(ws, {
          type: "confirm_action",
          confirmAction: result.details.confirmAction,
        });
      }
      break;
    }
    case "tool_call":
      // Pre-execution hook — skip, we use tool_execution_start instead
      break;

    case "tool_result": {
      // Post-execution hook — forward details for rich UI display
      const tr = event as any;
      sendEvent(ws, {
        type: "tool_result",
        toolCallId: tr.toolCallId,
        toolName: tr.toolName,
        isError: tr.isError,
        details: tr.details,
      });
      // Detect confirmAction in tool result and forward as confirm_action event
      if (tr.details?.confirmAction) {
        sendEvent(ws, {
          type: "confirm_action",
          confirmAction: tr.details.confirmAction,
        });
      }
      break;
    }

    default:
      // Silently ignore other harness events (save_point, queue_update, etc.)
      break;
  }
}
