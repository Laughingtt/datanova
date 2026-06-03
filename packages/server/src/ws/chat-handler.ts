import type { WSContext } from "hono/ws";
import { createHarness, getHarness, type CreateHarnessOptions } from "../agent/harness-factory.js";
import type { AgentHarnessEvent, Skill, PromptTemplate } from "@earendil-works/pi-agent-core";

interface WsMessage {
  type: "init" | "message";
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
    const harness = await createHarness(options);

    // Subscribe to harness events — this is the ONLY way to forward
    // streaming events (text deltas, thinking, tool calls, etc.)
    harness.subscribe((event: AgentHarnessEvent<Skill, PromptTemplate>) => {
      forwardEvent(ws, event);
    });

    sendEvent(ws, { type: "init_success", conversationId: options.conversationId });
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
    // prompt() triggers the agent loop. All streaming events
    // (agent_start, message_update, tool_execution, etc.)
    // are forwarded via the subscribe() handler in handleInit.
    // We just await the final result here.
    const response = await harness.prompt(text);

    // Send a final "response" event with the complete message content
    // so the frontend can use it if it missed streaming deltas.
    sendEvent(ws, {
      type: "response_complete",
      content: typeof response.content === "string"
        ? response.content
        : response.content.map((c: any) => c.text ?? "").join(""),
    });
  } catch (err) {
    const error = err as Error;
    sendEvent(ws, { type: "error", error: error.message });
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
      // Streaming delta — the key event for real-time text
      if ("assistantMessageEvent" in event && event.assistantMessageEvent) {
        const ame = event.assistantMessageEvent as Record<string, unknown>;
        if ("textDelta" in ame && ame.textDelta) {
          sendEvent(ws, { type: "text_delta", delta: ame.textDelta });
        }
        if ("thinkingDelta" in ame && ame.thinkingDelta) {
          sendEvent(ws, { type: "thinking", content: ame.thinkingDelta });
        }
      }
      break;
    }

    case "message_end":
      // Message complete — no special action needed
      break;

    // ---- Tool execution ----

    case "tool_execution_start":
      sendEvent(ws, {
        type: "tool_execution_start",
        toolCallId: (event as any).toolCallId,
        toolName: (event as any).toolName,
        args: (event as any).args,
      });
      break;

    case "tool_execution_end":
      sendEvent(ws, {
        type: "tool_execution_end",
        toolCallId: (event as any).toolCallId,
        toolName: (event as any).toolName,
        result: (event as any).result,
        isError: (event as any).isError,
      });
      break;

    // ---- Harness own events (tool_call/tool_result are pre/post hooks) ----

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
      break;
    }

    default:
      // Silently ignore other harness events (save_point, queue_update, etc.)
      break;
  }
}
