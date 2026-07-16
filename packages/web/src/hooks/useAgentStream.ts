import { useCallback } from "react";

// ==================== Unique ID Generation ====================

let _idCounter = 0;
export function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++_idCounter}`;
}

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

export interface ConfirmAction {
  id: string;
  title: string;
  description?: string;
  items?: string[];
  actionType?: string;
  confirmed?: boolean;
  cancelled?: boolean;
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
  sqlQueryHistoryId?: string;
  confirmAction?: ConfirmAction;
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
      agentType?: string;
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
        id: uniqueId("assistant"),
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
            id: uniqueId("step"),
            type: "thinking" as const,
            content,
          },
        ],
      };
    }

    case "message_start": {
      if (!currentAssistantMessage) {
        return {
          id: uniqueId("assistant"),
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
      const endUpdate: Partial<ChatMessage> = { steps };

      // Also extract SQL and table data from tool_execution_end if details are present
      if (toolName === "execute_sql") {
        // details may be at event.details (if server sends it separately) or event.result.details (nested in result)
        const rawResult = event.result as Record<string, unknown> | undefined;
        const details = ((event as any).details ?? rawResult?.details) as Record<string, unknown> | undefined;
        if (details) {
          if (details.sql) {
            endUpdate.sqlBlock = details.sql as string;
          }
          if (Array.isArray(details.columns) && Array.isArray(details.rows)) {
            endUpdate.tableData = {
              columns: details.columns as string[],
              rows: details.rows as Record<string, unknown>[],
              executionTime: typeof details.executionTime === "number" ? details.executionTime : undefined,
            };
          }
          if (details.sqlQueryHistoryId) {
            endUpdate.sqlQueryHistoryId = details.sqlQueryHistoryId as string;
          }
        }
      }

      return { ...currentAssistantMessage, ...endUpdate };
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
      const update: Partial<ChatMessage> = { steps };

      // Extract SQL and table data from execute_sql tool results
      if (trToolName === "execute_sql" && event.details) {
        const details = event.details as Record<string, unknown>;
        if (details.sql) {
          update.sqlBlock = details.sql as string;
        }
        if (Array.isArray(details.columns) && Array.isArray(details.rows)) {
          update.tableData = {
            columns: details.columns as string[],
            rows: details.rows as Record<string, unknown>[],
            executionTime: typeof details.executionTime === "number" ? details.executionTime : undefined,
          };
        }
        if (details.sqlQueryHistoryId) {
          update.sqlQueryHistoryId = details.sqlQueryHistoryId as string;
        }
      }

      return { ...currentAssistantMessage, ...update };
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

    case "confirm_action": {
      if (!currentAssistantMessage) return null;
      return {
        ...currentAssistantMessage,
        confirmAction: {
          id: (event.confirmAction as any)?.id ?? uniqueId("confirm"),
          title: (event.confirmAction as any)?.title ?? "确认操作",
          description: (event.confirmAction as any)?.description,
          items: (event.confirmAction as any)?.items,
          actionType: (event.confirmAction as any)?.actionType,
          confirmed: false,
        },
      };
    }

    case "error": {
      if (!currentAssistantMessage) {
        // No assistant message yet — create one to display the error
        const errorMsg = (event.message as string) ?? (event.error as string) ?? "请求处理失败，请重试";
        return {
          id: uniqueId("assistant"),
          role: "assistant",
          content: `⚠️ ${errorMsg}`,
          timestamp: Date.now(),
          isStreaming: false,
          steps: [],
        };
      }
      const errorContent = (event.message as string) ?? (event.error as string) ?? "请求处理失败，请重试";
      return {
        ...currentAssistantMessage,
        content: currentAssistantMessage.content || `⚠️ ${errorContent}`,
        isStreaming: false,
      };
    }

    default:
      return null;
  }
}
