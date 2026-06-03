import { useCallback, useRef } from "react";

// ==================== Types ====================

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  steps?: AgentStep[];
  sqlBlock?: string;
  tableData?: TableData;
  isStreaming?: boolean;
}

export interface AgentStep {
  id: string;
  type: "thinking" | "tool_call" | "tool_result";
  toolName?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  isError?: boolean;
  content?: string;
}

export interface TableData {
  columns: string[];
  rows: Record<string, unknown>[];
  executionTime?: number;
}

// ==================== Event Types ====================

interface WsEvent {
  type: string;
  [key: string]: unknown;
}

// ==================== Hook ====================

interface UseAgentStreamOptions {
  send: (data: unknown) => void;
  onEvent?: (event: WsEvent) => void;
}

interface UseAgentStreamReturn {
  initSession: (params: {
    conversationId: string;
    datasourceId?: string;
    datasourceName?: string;
    modelProvider?: string | null;
    modelId?: string | null;
  }) => void;
  sendMessage: (text: string, conversationId: string) => void;
}

/** Generate a unique message ID to avoid React key collisions */
let msgCounter = 0;
function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++msgCounter}`;
}

export function useAgentStream(options: UseAgentStreamOptions): UseAgentStreamReturn {
  const { send, onEvent } = options;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const initSession = useCallback(
    (params: {
      conversationId: string;
      datasourceId?: string;
      datasourceName?: string;
      modelProvider?: string | null;
      modelId?: string | null;
    }) => {
      send({
        type: "init",
        payload: {
          conversationId: params.conversationId,
          datasourceId: params.datasourceId,
          datasourceName: params.datasourceName,
          modelProvider: params.modelProvider ?? undefined,
          modelId: params.modelId ?? undefined,
        },
      });
    },
    [send]
  );

  const sendMessage = useCallback(
    (text: string, conversationId: string) => {
      send({
        type: "message",
        text,
        payload: { conversationId },
      });
    },
    [send]
  );

  return { initSession, sendMessage };
}

// ==================== Event Helper ====================

/**
 * Process a WebSocket event and update a ChatMessage.
 * Returns the updated message or a new message.
 */
export function processWsEvent(
  event: WsEvent,
  currentAssistantMessage: ChatMessage | null
): ChatMessage | null {
  switch (event.type) {
    case "agent_start":
      return {
        id: uniqueId("assistant"),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        steps: [],
        isStreaming: true,
      };

    case "thinking":
      if (!currentAssistantMessage) return null;
      return {
        ...currentAssistantMessage,
        steps: [
          ...(currentAssistantMessage.steps ?? []),
          {
            id: uniqueId("step"),
            type: "thinking" as const,
            content: (event.content as string) ?? "Thinking...",
          },
        ],
      };

    case "message_start":
      // A new assistant message stream is starting — create if not yet
      if (!currentAssistantMessage) {
        return {
          id: uniqueId("assistant"),
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          steps: [],
          isStreaming: true,
        };
      }
      return null;

    case "text_delta": {
      if (!currentAssistantMessage) return null;
      return {
        ...currentAssistantMessage,
        content: currentAssistantMessage.content + ((event.delta as string) ?? ""),
      };
    }

    case "tool_execution_start":
      if (!currentAssistantMessage) return null;
      return {
        ...currentAssistantMessage,
        steps: [
          ...(currentAssistantMessage.steps ?? []),
          {
            id: uniqueId("step"),
            type: "tool_call" as const,
            toolName: event.toolName as string,
            args: event.args as Record<string, unknown>,
          },
        ],
      };

    case "tool_execution_end":
      if (!currentAssistantMessage) return null;
      return {
        ...currentAssistantMessage,
        steps: (currentAssistantMessage.steps ?? []).map((step) => {
          if (
            step.type === "tool_call" &&
            step.toolName === event.toolName
          ) {
            return {
              ...step,
              type: "tool_result" as const,
              isError: event.isError as boolean,
              result: event.result,
            };
          }
          return step;
        }),
      };

    case "tool_result": {
      // Rich tool result with details (from harness tool_result event)
      if (!currentAssistantMessage) return null;
      return {
        ...currentAssistantMessage,
        steps: (currentAssistantMessage.steps ?? []).map((step) => {
          if (
            step.type === "tool_call" &&
            step.toolName === event.toolName
          ) {
            return {
              ...step,
              type: "tool_result" as const,
              isError: event.isError as boolean,
              result: event.details ?? event.result,
            };
          }
          return step;
        }),
      };
    }

    case "response_complete":
      // Final complete response — update content if we have it
      if (!currentAssistantMessage) return null;
      return {
        ...currentAssistantMessage,
        content: (event.content as string) || currentAssistantMessage.content,
        isStreaming: false,
      };

    case "agent_end":
      if (!currentAssistantMessage) return null;
      return {
        ...currentAssistantMessage,
        isStreaming: false,
      };

    case "settled":
      // Agent has fully settled — mark streaming complete
      if (!currentAssistantMessage) return null;
      return {
        ...currentAssistantMessage,
        isStreaming: false,
      };

    case "error":
      if (!currentAssistantMessage) {
        // Create an error message if no assistant message exists yet
        return {
          id: uniqueId("assistant"),
          role: "assistant",
          content: `❌ Error: ${event.error ?? "Unknown error"}`,
          timestamp: Date.now(),
          isStreaming: false,
        };
      }
      return {
        ...currentAssistantMessage,
        content: currentAssistantMessage.content || `❌ Error: ${event.error}`,
        isStreaming: false,
      };

    default:
      return currentAssistantMessage;
  }
}
