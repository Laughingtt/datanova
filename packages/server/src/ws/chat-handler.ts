import type { WSContext } from "hono/ws";
import { createHarness, getHarness, type CreateHarnessOptions } from "../agent/harness-factory.js";
import type { AgentHarnessEvent, Skill, PromptTemplate, ToolCallEvent, ToolResultEvent } from "@earendil-works/pi-agent-core";
import type { AgentTool } from "@earendil-works/pi-agent-core";

interface WsMessage {
  type: "init" | "message";
  payload?: Record<string, unknown>;
  text?: string;
}

interface WsEvent {
  type: string;
  [key: string]: unknown;
}

function sendEvent(ws: WSContext, event: WsEvent): void {
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

    // Subscribe to harness events
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
    sendEvent(ws, { type: "agent_start" });

    const response = await harness.prompt(text);

    sendEvent(ws, {
      type: "agent_end",
      message: {
        role: "assistant",
        content: response.content,
      },
    });
  } catch (err) {
    const error = err as Error;
    sendEvent(ws, { type: "error", error: error.message });
  }
}

function forwardEvent(ws: WSContext, event: AgentHarnessEvent<Skill, PromptTemplate>): void {
  switch (event.type) {
    case "agent_start":
      sendEvent(ws, { type: "agent_start" });
      break;

    case "agent_end":
      sendEvent(ws, {
        type: "agent_end",
        messages: event.messages,
      });
      break;

    case "turn_start":
      sendEvent(ws, { type: "thinking" });
      break;

    case "turn_end":
      // Turn completed, handled via message_end or agent_end
      break;

    case "message_start":
      if ("message" in event && event.message && "role" in event.message && event.message.role === "assistant") {
        sendEvent(ws, { type: "text_delta", delta: "" });
      }
      break;

    case "message_update":
      if ("assistantMessageEvent" in event && event.assistantMessageEvent) {
        const ame = event.assistantMessageEvent;
        if ("textDelta" in ame && ame.textDelta) {
          sendEvent(ws, { type: "text_delta", delta: ame.textDelta });
        }
        if ("thinkingDelta" in ame && ame.thinkingDelta) {
          sendEvent(ws, { type: "thinking", content: ame.thinkingDelta });
        }
      }
      break;

    case "message_end":
      // Message complete
      break;

    case "tool_execution_start": {
      const toolEvent = event as unknown as ToolCallEvent;
      sendEvent(ws, {
        type: "tool_execution_start",
        toolCallId: toolEvent.toolCallId,
        toolName: toolEvent.toolName,
        args: toolEvent.input,
      });
      break;
    }

    case "tool_execution_end": {
      const toolEndEvent = event as unknown as ToolResultEvent;
      sendEvent(ws, {
        type: "tool_execution_end",
        toolCallId: toolEndEvent.toolCallId,
        toolName: toolEndEvent.toolName,
        isError: toolEndEvent.isError,
        details: toolEndEvent.details,
      });
      break;
    }

    case "settled":
      sendEvent(ws, { type: "settled" });
      break;

    default:
      // Forward other events as-is
      sendEvent(ws, { type: event.type, raw: true });
      break;
  }
}
