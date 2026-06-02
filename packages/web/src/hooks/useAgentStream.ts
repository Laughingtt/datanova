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
    apiKey?: string;
  }) => void;
  sendMessage: (text: string, conversationId: string) => void;
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
      apiKey?: string;
    }) => {
      send({
        type: "init",
        payload: {
          conversationId: params.conversationId,
          datasourceId: params.datasourceId,
          datasourceName: params.datasourceName,
          apiKey: params.apiKey,
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
  const msgId = currentAssistantMessage?.id ?? `msg-${Date.now()}`;

  switch (event.type) {
    case "agent_start":
      return {
        id: msgId,
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
            id: `step-${Date.now()}`,
            type: "thinking",
            content: (event.content as string) ?? "Thinking...",
          },
        ],
      };

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
            id: `step-${Date.now()}`,
            type: "tool_call",
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
          // Update the matching tool_call step with result
          if (
            step.type === "tool_call" &&
            step.toolName === event.toolName
          ) {
            return {
              ...step,
              type: "tool_result" as const,
              isError: event.isError as boolean,
              result: event.details,
            };
          }
          return step;
        }),
      };

    case "agent_end":
      if (!currentAssistantMessage) return null;
      return {
        ...currentAssistantMessage,
        isStreaming: false,
      };

    case "error":
      if (!currentAssistantMessage) return null;
      return {
        ...currentAssistantMessage,
        content: currentAssistantMessage.content || `Error: ${event.error}`,
        isStreaming: false,
      };

    default:
      return currentAssistantMessage;
  }
}
