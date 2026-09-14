import type { WSContext } from "hono/ws";
import { createHarness, getHarness, removeHarness, harnessMap, type CreateHarnessOptions } from "../agent/harness-factory.js";
import type { AgentHarnessEvent, Skill, PromptTemplate } from "@earendil-works/pi-agent-core";
import { saveMessage, listMessages, getRecentSqlContext, createAgentTrace, listDatasources } from "../store.js";
import { discoverSchema } from "../mysql/discovery.js";
import { setSchemaCache } from "../mysql/validator.js";
import { agentRegistry } from "../agent/agent-registration.js";
import type { AgentTrace } from "../types.js";
import { setPending, getPending, markConfirmed, markCancelled } from "../agent/confirm-state.js";

// Track conversationId -> datasourceId for context injection
const conversationDatasourceMap = new Map<string, string>();
// Track conversationId -> agentType so traces record the correct agent
const conversationAgentTypeMap = new Map<string, string>();

// Shared streaming state per conversation, so handleInit and handleMessage
// accumulate into the same object. Without this, handleMessage creates its own
// empty state that never receives events from the harness subscriber.
const streamingStates = new Map<string, StreamingAssistantState>();

interface WsMessage {
  type: "init" | "message" | "reset_context" | "confirm_response";
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
  startTime: number;  // set when a new turn begins, for duration_ms tracking
  // Buffer of thinking text accumulated since the last tool_call/turn boundary.
  // On tool_execution_start, this buffer is snapshotted into the tool_call step's
  // `thinkingBefore` field so each tool carries its own "why I chose this tool" rationale.
  pendingThinking: string;
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
        } else if (data.type === "confirm_response") {
          await handleConfirmResponse(ws, data);
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
    const streamingState: StreamingAssistantState = { content: "", steps: [], startTime: Date.now(), pendingThinking: "" };
    streamingStates.set(options.conversationId, streamingState);

    // Subscribe to harness events — this is the ONLY way to forward
    // streaming events (text deltas, thinking, tool calls, etc.)
    harness.subscribe((event: AgentHarnessEvent<Skill, PromptTemplate>) => {
      // Accumulate streaming state for persistence
      accumulateStreamingState(streamingState, event);

      // Forward to frontend
      forwardEvent(ws, event, options.conversationId!);
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
    // Track agentType so traces record which agent produced the decision path
    conversationAgentTypeMap.set(options.conversationId, agentType);
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

  // Problem 2 — text fallback: if the user's plain-text message is a confirmation
  // or cancellation of a pending draft save, route it through the structured
  // confirm_response path instead of treating it as a normal chat message.
  // This keeps old frontends (which send "确认保存"/"取消保存" as text) working
  // and ensures the confirm-state machine is driven even without the structured
  // confirm_response WS message.
  const trimmed = text.trim();
  const pending = getPending(conversationId);
  if (pending && pending.status === "pending") {
    if (/^(确认|确认保存|确认?保存|保存|确定|ok|yes)$/i.test(trimmed)) {
      await handleConfirmResponse(ws, { type: "confirm_response", payload: { conversationId, confirmId: pending.confirmId, decision: "confirmed" } });
      return;
    }
    if (/^(取消|取消保存|不保存|no|cancel)$/i.test(trimmed)) {
      await handleConfirmResponse(ws, { type: "confirm_response", payload: { conversationId, confirmId: pending.confirmId, decision: "cancelled" } });
      return;
    }
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
      streamingState.startTime = Date.now();
      streamingState.pendingThinking = "";
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
    const rawSteps = streamingState?.steps ?? [];
    // Compact consecutive thinking steps to avoid bloating the JSON column
    const persistedSteps = compactThinkingSteps(rawSteps);
    saveMessage({
      conversationId,
      role: "assistant",
      content: fullContent || "（AI 未返回内容，请检查 API 配置）",
      steps: persistedSteps,
    });

    // Write agent trace record for observability (non-critical, never blocks)
    try {
      const datasourceId = conversationDatasourceMap.get(conversationId);
      const agentType = conversationAgentTypeMap.get(conversationId) ?? "query";
      const durationMs = streamingState ? Date.now() - streamingState.startTime : null;
      const traceData = extractTraceAnalytics(persistedSteps, text, conversationId, datasourceId, agentType, durationMs);
      createAgentTrace(traceData);
    } catch { /* trace recording failure must not affect the user experience */ }

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
    const streamingState: StreamingAssistantState = { content: "", steps: [], startTime: Date.now(), pendingThinking: "" };
    streamingStates.set(conversationId, streamingState);
    harness.subscribe((event: AgentHarnessEvent<Skill, PromptTemplate>) => {
      accumulateStreamingState(streamingState, event);
      forwardEvent(ws, event, conversationId);
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
 * Handle confirm_response (Problem 2) — the user clicked 确认保存 / 取消 on a
 * ConfirmActionCard. This drives the server-side confirm-state machine and, on
 * confirmation, re-triggers an agent turn so the save tools run automatically
 * (they will now pass the confirm-state guard).
 */
async function handleConfirmResponse(ws: WSContext, data: WsMessage): Promise<void> {
  const payload = data.payload ?? {};
  const conversationId = (payload.conversationId as string) ?? "";
  const confirmId = payload.confirmId as string | undefined;
  const decision = payload.decision as "confirmed" | "cancelled" | undefined;

  if (!conversationId) {
    sendEvent(ws, { type: "error", error: "Missing conversationId" });
    return;
  }
  if (decision !== "confirmed" && decision !== "cancelled") {
    sendEvent(ws, { type: "error", error: `Invalid confirm decision: ${decision}` });
    return;
  }

  const harness = getHarness(conversationId);
  if (!harness) {
    sendEvent(ws, { type: "error", error: "Session not initialized. Send init message first." });
    return;
  }

  if (decision === "cancelled") {
    markCancelled(conversationId, confirmId);
    sendEvent(ws, { type: "confirm_result", decision: "cancelled", confirmId: confirmId ?? null });
    // Re-prompt the agent so it acknowledges the cancellation rather than hanging.
    await runAgentTurn(ws, conversationId, "用户已取消保存，请停止保存操作并向用户确认下一步。");
    return;
  }

  // decision === "confirmed"
  const ok = markConfirmed(conversationId, confirmId);
  if (!ok) {
    sendEvent(ws, { type: "error", error: "无可确认的待确认操作（可能已过期或已处理）。请重新发起保存请求。" });
    return;
  }
  sendEvent(ws, { type: "confirm_result", decision: "confirmed", confirmId: confirmId ?? null });
  // Re-trigger an agent turn instructing it to execute the save. The save tools
  // will now find status==="confirmed" and persist the draft.
  await runAgentTurn(ws, conversationId, "用户已确认保存草稿，请立即执行 create_metric_draft / create_dimension_draft 完成保存，并传入 conversation_id 参数。");
}

/**
 * Shared helper: run one agent turn with a system-supplied prompt, persist the
 * assistant message, and send response_complete. Used by handleConfirmResponse
 * so confirmation flows reuse the same persistence + trace logic as a normal
 * user message (minus saving a user row, since the prompt is system-injected).
 */
async function runAgentTurn(ws: WSContext, conversationId: string, systemPrompt: string): Promise<void> {
  try {
    // Inject conversation_id context (same as handleMessage)
    const contextPrefix = `[Current conversation_id: ${conversationId}]\n\n`;

    const streamingState = streamingStates.get(conversationId);
    if (streamingState) {
      streamingState.content = "";
      streamingState.steps = [];
      streamingState.startTime = Date.now();
      streamingState.pendingThinking = "";
    }

    const response = await harness_prompt(conversationId, contextPrefix + systemPrompt);
    const fullContent = typeof response.content === "string"
      ? response.content
      : response.content.map((c: any) => c.text ?? "").join("");

    const rawSteps = streamingState?.steps ?? [];
    const persistedSteps = compactThinkingSteps(rawSteps);
    saveMessage({
      conversationId,
      role: "assistant",
      content: fullContent || "（AI 未返回内容，请检查 API 配置）",
      steps: persistedSteps,
    });

    try {
      const datasourceId = conversationDatasourceMap.get(conversationId);
      const agentType = conversationAgentTypeMap.get(conversationId) ?? "query";
      const durationMs = streamingState ? Date.now() - streamingState.startTime : null;
      const traceData = extractTraceAnalytics(persistedSteps, systemPrompt, conversationId, datasourceId, agentType, durationMs);
      createAgentTrace(traceData);
    } catch { /* trace recording failure must not affect the user experience */ }

    sendEvent(ws, {
      type: "response_complete",
      content: fullContent || "（AI 未返回内容，请检查 API 配置）",
    });
  } catch (err) {
    const error = err as Error;
    sendEvent(ws, { type: "error", error: error.message });
  }
}

/** Prompt the harness for a conversation by id. Kept as a named helper so the
 * getHarness lookup lives in one place within this module. */
async function harness_prompt(conversationId: string, text: string): Promise<{ content: string | Array<{ text?: string }> }> {
  const harness = getHarness(conversationId);
  if (!harness) throw new Error("Session not initialized. Send init message first.");
  return await harness.prompt(text) as { content: string | Array<{ text?: string }> };
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
    // ---- Turn boundary tracking ----
    // Each turn_start begins a new agent decision cycle:
    //   turn_start → thinking → tool_call → tool_result → turn_end
    // We record turn boundaries so extractTraceAnalytics can group
    // thinking ("why") with the tool call it precedes.

    case "turn_start": {
      state.steps.push({ type: "turn_start" });
      // A new turn resets the thinking buffer — thinking that belongs to the
      // previous turn must not leak into this turn's tool calls.
      state.pendingThinking = "";
      break;
    }

    case "turn_end": {
      state.steps.push({ type: "turn_end" });
      break;
    }

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
        } else if (subType === "thinking_delta" && ame.delta) {
          // Buffer thinking text. It is snapshotted into the next tool_call's
          // `thinkingBefore` field (tool-level rationale binding) AND persisted
          // as a step so it survives page refresh.
          // Each delta becomes one step; compactThinkingSteps() merges consecutive
          // thinking steps before saveMessage() to avoid bloating the JSON column.
          const delta = ame.delta as string;
          state.pendingThinking += delta;
          state.steps.push({
            type: "thinking",
            content: delta,
          });
        }
      }
      break;
    }

    case "tool_execution_start": {
      // Bind the buffered thinking to THIS tool call — this is the
      // "why I chose this tool" rationale that precedes the call.
      // Snapshot (not reference) so later thinking deltas don't mutate it.
      const thinkingBefore = state.pendingThinking;
      state.pendingThinking = "";
      state.steps.push({
        type: "tool_call",
        toolName: (event as any).toolName,
        args: (event as any).args,
        thinkingBefore,
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
 * Merge consecutive thinking steps into one to avoid bloating the JSON column.
 * Each thinking_delta event creates a separate step, but we only need the
 * concatenated content persisted as a single step per thinking phase.
 */
function compactThinkingSteps(steps: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const compacted: Array<Record<string, unknown>> = [];
  for (const step of steps) {
    if (step.type === "thinking" && compacted.length > 0 && compacted[compacted.length - 1].type === "thinking") {
      (compacted[compacted.length - 1] as any).content += step.content;
    } else {
      compacted.push({ ...step });
    }
  }
  return compacted;
}

/**
 * Generate a human-readable summary of tool arguments for admin observability.
 */
function summarizeArgs(toolName: string, args: any): string {
  if (!args) return "";
  switch (toolName) {
    case "lookup_semantic_layer":
      return `query: "${args.query ?? ""}"`;
    case "discover_schema":
      return args.table_names?.length
        ? `tables: ${JSON.stringify(args.table_names).slice(0, 150)}`
        : "全量发现";
    case "execute_sql":
      return `sql: ${(args.sql ?? "").slice(0, 150)}`;
    case "lookup_examples":
      return `query: "${args.query ?? ""}"`;
    case "read_skill":
      return `skill: ${args.skill_name ?? ""}`;
    case "ai_annotate_schema":
      return args.table_names?.length
        ? `tables: ${JSON.stringify(args.table_names).slice(0, 150)}`
        : "全量标注";
    case "validate_and_test_metric":
      return `metric_type: ${args.metric_type ?? "?"}`;
    case "check_metric_conflict":
      return `name: ${args.name ?? ""}`;
    case "create_metric_draft":
      return `name: ${args.name ?? ""}`;
    case "create_dimension_draft":
      return `name: ${args.name ?? ""}`;
    case "request_user_confirm":
      return `title: ${(args.title ?? "").slice(0, 100)}`;
    default:
      return JSON.stringify(args).slice(0, 200);
  }
}

/**
 * Generate a human-readable summary of tool results for admin observability.
 * Instead of "OK"/"ERROR", this produces specific descriptions that let
 * an admin infer WHY the agent proceeded to the next step.
 */
function summarizeResult(toolName: string, result: any): string {
  if (!result) return "等待结果";
  // A mutated tool_result step carries the payload in `result` (and isError on
  // the step itself). Normalize so the rest of this function can read a flat
  // result object with isError/details/content fields.
  const step = result;
  const isError = step.isError === true;
  const payload = step.result ?? step;
  if (isError) {
    const errMsg = extractErrorMessage(payload);
    return `失败: ${errMsg.slice(0, 100)}`;
  }

  // Tool results carry structured details in payload.details (for tool_execution_end events)
  // or in payload.result.details (for tool_result events)
  const details = payload.details ?? payload.result?.details;

  switch (toolName) {
    case "lookup_semantic_layer":
      return details?.matched ? "命中语义层指标" : "未命中匹配，需回退到 Schema 发现";
    case "discover_schema":
      return "发现数据库 Schema 结构与标注";
    case "execute_sql": {
      const rowCount = details?.rowCount ?? details?.rows?.length;
      const execTime = details?.executionTime;
      if (rowCount !== undefined) {
        return `返回 ${rowCount} 行${execTime ? `，耗时 ${execTime}ms` : ""}`;
      }
      return "SQL 执行完成";
    }
    case "lookup_examples":
      return "查找相似查询示例";
    case "read_skill":
      return "加载查询技能指导";
    case "ai_annotate_schema":
      return "AI 生成 Schema 业务标注";
    case "validate_and_test_metric": {
      const valid = details?.valid;
      if (valid === true) return "指标 SQL 验证通过";
      if (valid === false) return `验证失败: ${(details?.errors ?? []).join(", ").slice(0, 100)}`;
      return "指标验证完成";
    }
    case "check_metric_conflict": {
      const hasConflict = details?.has_conflict;
      if (hasConflict) return `发现冲突: ${(details?.conflicts ?? []).map((c: any) => c.type).join(", ").slice(0, 80)}`;
      return "无冲突，可安全创建";
    }
    case "create_metric_draft":
      return "指标草稿已创建";
    case "create_dimension_draft":
      return "维度草稿已创建";
    case "request_user_confirm":
      return "等待用户确认操作";
    default:
      return "完成";
  }
}

/**
 * Extract a concise error message from a tool result.
 */
function extractErrorMessage(result: any): string {
  if (typeof result === "string") return result;
  const content = result?.content;
  if (Array.isArray(content)) {
    for (const c of content) {
      if (c?.type === "text" && c?.text) return c.text.slice(0, 150);
    }
  }
  if (result?.error) return String(result.error).slice(0, 150);
  return "未知错误";
}

/**
 * Extract structured analytics from accumulated steps to create an AgentTrace.
 * Groups steps by turn (turn_start→...→turn_end) so each tool call is
 * associated with the thinking ("why") that preceded it.
 */
export function extractTraceAnalytics(
  steps: Array<Record<string, unknown>>,
  userQuestion: string,
  conversationId: string,
  datasourceId: string | undefined,
  agentType: string,
  durationMs: number | null,
): Omit<AgentTrace, "id" | "created_at"> {
  // ---- Group steps by turn ----
  // Each turn: turn_start → thinking* → tool_call/tool_result* → turn_end
  // If no turn_start events exist (legacy), fall back to flat grouping.
  //
  // IMPORTANT: accumulateStreamingState MUTATES a tool_call step into a
  // tool_result step when the tool completes (tool_execution_end / tool_result
  // handlers overwrite type:"tool_call" → type:"tool_result" on the SAME step
  // object, carrying forward toolName/args/thinkingBefore AND adding
  // result/isError). So by the time steps reach us, a completed tool is a
  // single tool_result step — there is no separate tool_call step left.
  // Therefore a tool "invocation" must be detected by step.toolName presence
  // across BOTH types, and toolDetails is built from tool_result steps (which
  // hold the full picture: args, thinkingBefore, result, isError).
  interface Turn {
    thinking: string;
    toolCalls: Array<Record<string, unknown>>;
    toolResults: Array<Record<string, unknown>>;
  }
  const turns: Turn[] = [];
  let currentTurn: Turn = { thinking: "", toolCalls: [], toolResults: [] };
  let hasTurnBoundary = false;

  // A step represents a tool invocation if it carries a toolName. This is true
  // for both tool_call (pre-execution) and tool_result (post-execution, after
  // mutation). We treat every toolName-bearing step as one tool invocation so
  // the chain stays consistent with what the chat window displayed.
  const isToolStep = (s: Record<string, unknown>) =>
    (s.type === "tool_call" || s.type === "tool_result") && typeof s.toolName === "string";

  for (const step of steps) {
    if (step.type === "turn_start") {
      hasTurnBoundary = true;
      // Save previous turn if it had any tool invocation or thinking
      if (currentTurn.toolCalls.length > 0 || currentTurn.thinking) {
        turns.push(currentTurn);
      }
      currentTurn = { thinking: "", toolCalls: [], toolResults: [] };
    } else if (step.type === "turn_end") {
      // turn_end is informational; we'll save at next turn_start or end
    } else if (step.type === "thinking") {
      currentTurn.thinking += (step.content ?? "") as string;
    } else if (isToolStep(step)) {
      // Record every tool invocation. For mutated steps (type tool_result)
      // the step already carries result/isError, so it is both the "call" and
      // the "result". For pure tool_call steps (tool never completed), it is a
      // call with no result yet.
      currentTurn.toolCalls.push(step);
      if (step.type === "tool_result") {
        currentTurn.toolResults.push(step);
      }
    }
  }
  // Don't forget the last turn
  if (currentTurn.toolCalls.length > 0 || currentTurn.thinking) {
    turns.push(currentTurn);
  }

  // Fallback: if no turn boundaries detected, create a single turn from all steps
  if (turns.length === 0) {
    const allThinking = steps.filter(s => s.type === "thinking").map(s => (s.content ?? "") as string).join("");
    const allToolCalls = steps.filter(isToolStep);
    turns.push({
      thinking: allThinking,
      toolCalls: allToolCalls,
      toolResults: allToolCalls.filter(s => s.type === "tool_result"),
    });
  }

  // ---- Build DecisionStep[] (per-tool decision rationale) ----
  // Each tool_call carries a `thinkingBefore` snapshot — the thinking the LLM
  // produced immediately before deciding to call this tool. This is the
  // tool-level "why" (as opposed to the turn-level thinking, which may precede
  // multiple tools). We fall back to the turn's thinking for legacy steps.
  const toolDetails: Array<{
    turn: number;
    thinking: string;
    tool: string;
    args_summary: string;
    result_summary: string;
    is_error: boolean;
  }> = [];

  for (let turnIndex = 0; turnIndex < turns.length; turnIndex++) {
    const turn = turns[turnIndex];
    const turnNumber = turnIndex + 1;
    const turnThinking = turn.thinking;

    for (const call of turn.toolCalls) {
      const name = call.toolName as string;

      // For a mutated step (type tool_result), the step itself carries the
      // result/isError — there is no separate result step to match against.
      // For a pure tool_call step (tool did not complete), result is undefined.
      const result = call.type === "tool_result" ? call : undefined;

      // Prefer the tool-level rationale snapshot; fall back to turn thinking.
      // Cap at 800 chars to keep the JSON column bounded while preserving far
      // more reasoning context than the previous 300-char turn-level limit.
      const rawThinking = (call.thinkingBefore as string) || turnThinking;
      const thinkingForTool = rawThinking.slice(0, 800);

      toolDetails.push({
        turn: turnNumber,
        thinking: thinkingForTool,
        tool: name,
        args_summary: summarizeArgs(name, call.args),
        result_summary: summarizeResult(name, result),
        is_error: result?.isError === true,
      });
    }
  }

  // ---- Derived analytics ----
  // Every toolName-bearing step is one tool invocation (see isToolStep above).
  // toolResults are the subset that completed (type tool_result).
  const toolCalls = steps.filter(isToolStep);
  const toolResults = steps.filter(s => s.type === "tool_result");
  const thinkingSteps = steps.filter(s => s.type === "thinking");
  const toolSequence = toolCalls.map(s => s.toolName as string);

  const usedSemanticLayer = toolSequence.includes("lookup_semantic_layer") ? 1 : 0;
  const usedDiscoverSchema = toolSequence.includes("discover_schema") ? 1 : 0;
  const usedExamples = toolSequence.includes("lookup_examples") ? 1 : 0;
  const usedSkill = toolSequence.includes("read_skill") ? 1 : 0;

  // Detect self-correction: an execute_sql error followed by another execute_sql
  // invocation (the retry). Both appear as tool_result steps after mutation, so
  // we walk the invocation order and look for an errored execute_sql followed by
  // a later execute_sql invocation.
  let selfCorrected = 0;
  let foundSqlError = false;
  for (const step of toolCalls) {
    if (step.toolName !== "execute_sql") continue;
    if (step.type === "tool_result" && step.isError) {
      foundSqlError = true;
    } else if (foundSqlError) {
      selfCorrected = 1;
      break;
    }
  }

  // Extract final_sql from last successful execute_sql
  let finalSql: string | null = null;
  for (let i = toolResults.length - 1; i >= 0; i--) {
    if (toolResults[i].toolName === "execute_sql" && !toolResults[i].isError) {
      const result = toolResults[i].result as any;
      finalSql = result?.details?.sql ?? result?.sql ?? null;
      break;
    }
  }

  // Thinking summary — expanded to 2000 chars so admins can read the full
  // reasoning arc, not just the opening fragment. tool_details[].thinking
  // holds the per-tool rationale; this is the conversation-level overview.
  const thinkingContent = thinkingSteps.map(s => (s.content ?? "") as string).join("");
  const thinkingSummary = thinkingContent.slice(0, 2000);

  // ---- Synthesize decision_rationale ----
  // A human-readable reconstruction of the agent's decision path: for each
  // tool call, why it was chosen (from thinkingBefore) and what the outcome
  // implied for the next step. This is what an admin reads to understand the
  // chain without re-reading raw thinking deltas.
  const rationaleLines: string[] = [];
  rationaleLines.push(`用户问题：${userQuestion.slice(0, 200)}`);
  for (const d of toolDetails) {
    const why = d.thinking.trim();
    const whySnippet = why ? why.slice(0, 200) : "（无明确推理记录）";
    rationaleLines.push(
      `[步骤${toolDetails.indexOf(d) + 1} · Turn${d.turn}] 调用 ${d.tool}` +
      (why ? ` —— 抉择理由：${whySnippet}` : "") +
      ` | 输入：${d.args_summary || "—"} | 结果：${d.result_summary}` +
      (d.is_error ? "（失败，触发后续修正）" : "")
    );
  }
  if (selfCorrected) {
    rationaleLines.push("链路包含自修复：SQL 执行失败后 Agent 重新生成并重试。");
  }
  const decisionRationale = rationaleLines.join("\n").slice(0, 8000);

  // Resolve datasource_name
  let datasourceName = "";
  if (datasourceId) {
    try {
      const ds = listDatasources().find(d => d.id === datasourceId);
      datasourceName = ds?.name ?? "";
    } catch { /* ignore */ }
  }

  return {
    conversation_id: conversationId,
    message_id: null,
    datasource_id: datasourceId ?? null,
    datasource_name: datasourceName,
    user_question: userQuestion,
    agent_type: agentType,
    tool_sequence: JSON.stringify(toolSequence),
    tool_details: JSON.stringify(toolDetails),
    thinking_summary: thinkingSummary,
    decision_rationale: decisionRationale,
    final_sql: finalSql,
    total_tool_calls: toolCalls.length,
    total_turns: turns.length,
    used_semantic_layer: usedSemanticLayer,
    used_discover_schema: usedDiscoverSchema,
    used_examples: usedExamples,
    used_skill: usedSkill,
    self_corrected: selfCorrected,
    duration_ms: durationMs,
  };
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
function forwardEvent(ws: WSContext, event: AgentHarnessEvent<Skill, PromptTemplate>, conversationId?: string): void {
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
        // Register pending confirmation state (Problem 2) so the save tools
        // can consult it as the authoritative guard.
        if (conversationId) {
          const ca = result.details.confirmAction;
          setPending(conversationId, ca.id, ca.actionType, ca.items || []);
        }
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
        if (conversationId) {
          const ca = tr.details.confirmAction;
          setPending(conversationId, ca.id, ca.actionType, ca.items || []);
        }
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
