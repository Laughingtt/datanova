import { useCallback } from "react";

// ==================== Types ====================

export interface ReportSection {
  title: string;
  content: string;
  hasTable: boolean;
}

export function parseReportSections(content: string): ReportSection[] {
  const sections: ReportSection[] = [];
  const headerRegex = /^##\s+(.+)/gm;
  const headers: { title: string; index: number }[] = [];
  let match;
  while ((match = headerRegex.exec(content)) !== null) {
    headers.push({ title: match[1].trim(), index: match.index });
  }
  if (headers.length < 3) return [];
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index + content.slice(headers[i].index).indexOf("\n") + 1;
    const end = i + 1 < headers.length ? headers[i + 1].index : content.length;
    const sectionContent = content.slice(start, end).trim();
    if (sectionContent) {
      sections.push({
        title: headers[i].title,
        content: sectionContent,
        hasTable: sectionContent.includes("|") || sectionContent.includes("```"),
      });
    }
  }
  return sections.length >= 3 ? sections : [];
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

export interface ValidationStatus {
  level: "error" | "warning" | "info";
  message: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  steps?: AgentStep[];
  sqlBlock?: string;
  tableData?: TableData;
  validationStatus?: ValidationStatus;
  followUpContext?: string;
  reportSections?: ReportSection[];
}

export interface TableData {
  columns: string[];
  rows: Record<string, unknown>[];
  executionTime?: number;
}

export interface WsEvent {
  type: string;
  [key: string]: unknown;
}

// ==================== Hook ====================

interface UseAgentStreamOptions {
  send: (data: Record<string, unknown>) => void;
  onEvent: (data: unknown) => void;
}

export function useAgentStream({ send, onEvent }: UseAgentStreamOptions) {
  const initSession = useCallback(
    (payload: {
      conversationId: string;
      datasourceId?: string;
      datasourceName?: string;
      modelProvider?: string;
      modelId?: string;
    }) => {
      send({ type: "init", payload });
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

// ==================== Event Processing ====================

/**
 * Process a WebSocket event and return the updated assistant ChatMessage,
 * or null if the event doesn't update the current assistant message.
 *
 * Returns `"clear"` for message_history events (caller should replace all messages).
 */
export function processWsEvent(
  event: WsEvent,
  currentAssistantMessage: ChatMessage | null
): ChatMessage | null | "clear" {
  switch (event.type) {
    case "message_history": {
      // Server sent persisted message history — signal to replace all messages.
      return "clear";
    }

    case "agent_start": {
      const msg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        isStreaming: true,
        steps: [],
      };
      return msg;
    }

    case "thinking": {
      if (!currentAssistantMessage) return null;
      const content = (event.content as string) ?? (event.delta as string) ?? "";
      return {
        ...currentAssistantMessage,
        steps: [
          ...(currentAssistantMessage.steps ?? []),
          {
            id: `step-${Date.now()}`,
            type: "thinking" as const,
            content,
          },
        ],
      };
    }

    case "message_start": {
      if (!currentAssistantMessage) {
        return {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          isStreaming: true,
          steps: [],
        };
      }
      return null;
    }

    case "text_delta": {
      if (!currentAssistantMessage) return null;
      const delta = (event.delta as string) ?? "";
      return {
        ...currentAssistantMessage,
        content: currentAssistantMessage.content + delta,
      };
    }

    case "tool_execution_start": {
      if (!currentAssistantMessage) return null;
      const step: AgentStep = {
        id: `step-${Date.now()}`,
        type: "tool_call",
        toolName: (event.toolName as string) ?? "unknown",
        args: (event.args as Record<string, unknown>) ?? {},
      };
      return {
        ...currentAssistantMessage,
        steps: [...(currentAssistantMessage.steps ?? []), step],
      };
    }

    case "tool_execution_end": {
      if (!currentAssistantMessage) return null;
      const toolName = (event.toolName as string) ?? "unknown";
      const steps = [...(currentAssistantMessage.steps ?? [])];
      // Find the last matching tool_call step and convert to tool_result
      for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i].type === "tool_call" && steps[i].toolName === toolName) {
          steps[i] = {
            ...steps[i],
            type: "tool_result",
            result: event.result,
            isError: event.isError as boolean | undefined,
          };
          break;
        }
      }
      return { ...currentAssistantMessage, steps };
    }

    case "tool_result": {
      if (!currentAssistantMessage) return null;
      const trToolName = (event.toolName as string) ?? "unknown";
      const steps = [...(currentAssistantMessage.steps ?? [])];
      for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i].type === "tool_call" && steps[i].toolName === trToolName) {
          steps[i] = {
            ...steps[i],
            type: "tool_result",
            result: event.details ?? event.result,
            isError: event.isError as boolean | undefined,
          };
          break;
        }
      }
      return { ...currentAssistantMessage, steps };
    }

    case "agent_end":
    case "settled":
    case "response_complete": {
      if (!currentAssistantMessage) return null;
      const content = event.type === "response_complete"
        ? (event.content as string) ?? currentAssistantMessage.content
        : currentAssistantMessage.content;
      return {
        ...currentAssistantMessage,
        content,
        isStreaming: false,
      };
    }

    case "validation_warning": {
      if (!currentAssistantMessage) return null;
      return {
        ...currentAssistantMessage,
        validationStatus: { level: "warning" as const, message: (event.message as string) ?? "" },
      };
    }

    case "validation_error": {
      if (!currentAssistantMessage) return null;
      return {
        ...currentAssistantMessage,
        validationStatus: { level: "error" as const, message: (event.message as string) ?? "" },
      };
    }

    case "error": {
      if (!currentAssistantMessage) return null;
      return {
        ...currentAssistantMessage,
        isStreaming: false,
      };
    }

    default:
      return null;
  }
}
