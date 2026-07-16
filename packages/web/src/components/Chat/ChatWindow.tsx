import { useState, useCallback, useRef, useEffect } from "react";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useAgentStream, processWsEvent, uniqueId, type ChatMessage, type ConfirmAction } from "../../hooks/useAgentStream";
import { conversationsApi, type Conversation } from "../../api/client";
import { useAppStore } from "../../stores/app";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import ModelSelector from "./ModelSelector";
import DatasourceSelector from "./DatasourceSelector";
import ChannelTabs from "./ChannelTabs";
import AgentWelcome from "./AgentWelcome";
import { getAgentById } from "../../agents/registry";

const WS_URL = import.meta.env.VITE_WS_URL || `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/chat`;

import type { TableData } from "../../hooks/useAgentStream";

// Helper to extract sqlBlock and tableData from steps
function extractDataFromSteps(steps: Array<{ type?: string; toolName?: string; result?: unknown }> | undefined): { sqlBlock?: string; tableData?: TableData } {
  if (!steps) return {};
  for (const step of steps) {
    if (step.type === "tool_result" && step.toolName === "execute_sql" && step.result) {
      const result = step.result as Record<string, unknown>;
      const details = (result.details as Record<string, unknown>) ?? result;
      if (details.sql && Array.isArray(details.columns) && Array.isArray(details.rows)) {
        return {
          sqlBlock: details.sql as string,
          tableData: {
            columns: details.columns as string[],
            rows: details.rows as Record<string, unknown>[],
            executionTime: typeof details.executionTime === "number" ? details.executionTime : undefined,
          },
        };
      }
    }
  }
  return {};
}

function toChatMessage(m: { id: string; role: string; content: string; steps?: unknown[]; timestamp?: number }): ChatMessage {
  const steps = Array.isArray(m.steps)
    ? (m.steps as Array<{ id?: string; type?: string; toolName?: string; args?: Record<string, unknown>; result?: unknown; isError?: boolean; content?: string }>).map((s, i) => ({
        id: s.id ?? `step-${i}`,
        type: (s.type as "thinking" | "tool_call" | "tool_result") ?? "thinking",
        toolName: s.toolName,
        args: s.args,
        result: s.result,
        isError: s.isError,
        content: s.content,
      }))
    : undefined;
  const { sqlBlock, tableData } = extractDataFromSteps(steps);
  return {
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    timestamp: m.timestamp ?? Date.now(),
    steps,
    sqlBlock,
    tableData,
  };
}

export default function ChatWindow() {
  const {
    selectedDatasourceId,
    selectedDatasourceName,
    selectedConversationId,
    modelProvider,
    modelId,
    activeChannel,
    setActiveChannel,
  } = useAppStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const currentAssistantRef = useRef<ChatMessage | null>(null);
  const initializedRef = useRef<string | null>(null);
  const responseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When channel changes, reset conversation state so a fresh harness is created
  const prevChannelRef = useRef(activeChannel);
  useEffect(() => {
    if (prevChannelRef.current !== activeChannel) {
      prevChannelRef.current = activeChannel;
      // Clear current conversation and messages so the new channel
      // starts fresh with its own harness (via init with correct agentType)
      const { setSelectedConversationId } = useAppStore.getState();
      setSelectedConversationId(null);
      setMessages([]);
      initializedRef.current = null;
      currentAssistantRef.current = null;
      if (responseTimeoutRef.current) {
        clearTimeout(responseTimeoutRef.current);
        responseTimeoutRef.current = null;
      }
      setIsStreaming(false);
    }
  }, [activeChannel]);

  const handleWsEvent = useCallback((data: unknown) => {
    const event = data as { type: string; [key: string]: unknown };

    if (event.type === "connected") return;

    if (event.type === "init_success") {
      initializedRef.current = event.conversationId as string;
      return;
    }

    if (event.type === "message_history") {
      const historyMsgs = (event.messages as Array<{ id: string; role: string; content: string; steps?: unknown[]; timestamp?: number }>) ?? [];
      setMessages(historyMsgs.map(toChatMessage));
      return;
    }

    const processed = processWsEvent(event, currentAssistantRef.current);

    if (processed) {
      if (processed === "clear") return;

      currentAssistantRef.current = processed;

      if (event.type === "agent_start") {
        setIsStreaming(true);
        // Clear response timeout — agent has started responding
        if (responseTimeoutRef.current) {
          clearTimeout(responseTimeoutRef.current);
          responseTimeoutRef.current = null;
        }
        // Remove any timeout hint messages since agent is now responding
        setMessages((prev) => {
          const filtered = prev.filter(m => !m.id.startsWith("timeout-"));
          return [...filtered, processed];
        });
      } else if (event.type === "agent_end" || event.type === "error") {
        setIsStreaming(false);
        setMessages((prev) =>
          prev.map((m) => (m.id === processed.id ? processed : m))
        );
        currentAssistantRef.current = null;
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.id === processed.id ? processed : m))
        );
      }
    }
  }, []);

  const { send, isConnected } = useWebSocket({
    url: WS_URL,
    onMessage: handleWsEvent,
    onOpen: () => {
      conversationsApi.list(selectedDatasourceId ?? undefined).then(setConversations).catch(() => {});
    },
  });

  const { initSession, sendMessage } = useAgentStream({
    send,
    onEvent: handleWsEvent,
  });

  const handleNewConversation = async () => {
    try {
      const conv = await conversationsApi.create({
        title: "新建对话",
        datasourceId: selectedDatasourceId ?? undefined,
      });
      setConversations((prev) => [conv, ...prev]);

      const { setSelectedConversationId } = useAppStore.getState();
      setSelectedConversationId(conv.id);
      setMessages([]);

      initSession({
        conversationId: conv.id,
        datasourceId: selectedDatasourceId ?? undefined,
        datasourceName: selectedDatasourceName ?? undefined,
        modelProvider: modelProvider ?? undefined,
        modelId: modelId ?? undefined,
        agentType: activeChannel,
      });
    } catch (err) {
      console.error("Failed to create conversation:", err);
    }
  };

  const handleSelectConversation = (id: string) => {
    const { setSelectedConversationId } = useAppStore.getState();
    setSelectedConversationId(id);
    setMessages([]);
    initializedRef.current = null;

    initSession({
      conversationId: id,
      datasourceId: selectedDatasourceId ?? undefined,
      datasourceName: selectedDatasourceName ?? undefined,
      modelProvider: modelProvider ?? undefined,
      modelId: modelId ?? undefined,
      agentType: activeChannel,
    });
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await conversationsApi.delete(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      const { selectedConversationId, setSelectedConversationId } = useAppStore.getState();
      if (selectedConversationId === id) {
        setSelectedConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  const handleNewTopic = () => {
    const { selectedConversationId: convId } = useAppStore.getState();
    if (!convId) return;

    send({
      type: "reset_context",
      payload: {
        conversationId: convId,
        datasourceId: selectedDatasourceId,
        datasourceName: selectedDatasourceName,
        modelProvider,
        modelId,
      },
    });

    currentAssistantRef.current = null;
  };

  const handleSend = (text: string) => {
    const { selectedConversationId, setSelectedConversationId } = useAppStore.getState();

    // Set a response timeout — if no agent_start within 60s, show a hint
    // Metric dev agent needs multiple tool calls so longer timeout is needed
    if (responseTimeoutRef.current) clearTimeout(responseTimeoutRef.current);
    responseTimeoutRef.current = setTimeout(() => {
      setMessages((prev) => {
        // Only add timeout hint if still streaming (no response yet)
        const lastMsg = prev[prev.length - 1];
        if (lastMsg?.role === "user" || lastMsg?.isStreaming) {
          // Remove any previous timeout messages to avoid duplicates
          const filtered = prev.filter(m => !m.id.startsWith("timeout-"));
          return [...filtered, {
            id: uniqueId("timeout"),
            role: "assistant" as const,
            content: "⏳ AI 响应时间较长，请耐心等待或检查 API 配置。",
            timestamp: Date.now(),
            isStreaming: false,
            steps: [],
          }];
        }
        return prev;
      });
      // Don't set isStreaming to false on timeout — agent may still respond
      responseTimeoutRef.current = null;
    }, 60000);

    if (!selectedConversationId) {
      conversationsApi
        .create({
          title: text.slice(0, 50),
          datasourceId: selectedDatasourceId ?? undefined,
        })
        .then((conv) => {
          setSelectedConversationId(conv.id);
          setConversations((prev) => [conv, ...prev]);

          const userMsg: ChatMessage = {
            id: uniqueId("msg"),
            role: "user",
            content: text,
            timestamp: Date.now(),
          };
          setMessages([userMsg]);

          initSession({
            conversationId: conv.id,
            datasourceId: selectedDatasourceId ?? undefined,
            datasourceName: selectedDatasourceName ?? undefined,
            modelProvider: modelProvider ?? undefined,
            modelId: modelId ?? undefined,
            agentType: activeChannel,
          });

          setTimeout(() => {
            sendMessage(text, conv.id);
          }, 500);
        });
      return;
    }

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    sendMessage(text, selectedConversationId);
  };

  // Handle confirm action from ConfirmActionCard
  const handleConfirmAction = useCallback((action: ConfirmAction) => {
    const { selectedConversationId } = useAppStore.getState();
    if (!selectedConversationId) return;
    // Mark the confirm card as confirmed in messages
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.confirmAction?.id === action.id) {
          return { ...msg, confirmAction: { ...msg.confirmAction, confirmed: true } };
        }
        return msg;
      })
    );
    // Send confirmation message to agent
    const confirmText = "确认保存";
    const userMsg: ChatMessage = {
      id: uniqueId("user"),
      role: "user",
      content: confirmText,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    sendMessage(confirmText, selectedConversationId);
  }, [sendMessage]);

  const handleCancelAction = useCallback((action: ConfirmAction) => {
    const { selectedConversationId } = useAppStore.getState();
    if (!selectedConversationId) return;
    // Mark the confirm card as cancelled in messages
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.confirmAction?.id === action.id) {
          return { ...msg, confirmAction: { ...msg.confirmAction, cancelled: true } };
        }
        return msg;
      })
    );
    // Send cancel message to agent
    const cancelText = "取消保存";
    const userMsg: ChatMessage = {
      id: uniqueId("user"),
      role: "user",
      content: cancelText,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    sendMessage(cancelText, selectedConversationId);
  }, [sendMessage]);

  return (
    <div className="flex h-full">
      {/* Conversation sidebar */}
      <div className="w-[260px] border-r border-[var(--hairline)] bg-[var(--surface)] flex flex-col">
        <div className="p-4 border-b border-[var(--hairline)]">
          <button onClick={handleNewConversation} className="w-full btn-primary text-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            新建对话
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {conversations.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <svg className="w-8 h-8 mx-auto text-[var(--stone)] mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-xs text-[var(--stone)]">暂无对话记录</p>
            </div>
          ) : (
            conversations.map((conv) => {
              const { selectedConversationId } = useAppStore.getState();
              const isActive = selectedConversationId === conv.id;
              return (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={`px-4 py-3 cursor-pointer border-b border-[var(--hairline-soft)] transition-all duration-200 ${
                    isActive
                      ? "bg-[var(--primary-soft)] border-l-2 border-l-[var(--primary)]"
                      : "hover:bg-[var(--canvas)] border-l-2 border-l-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-[var(--ink)] truncate flex-1">{conv.title ?? "未命名对话"}</p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConversation(conv.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:bg-[var(--error-soft)] text-[var(--stone)] hover:text-[var(--error)] rounded p-0.5 transition-all ml-2"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-[10px] text-[var(--stone)] mt-0.5">
                    {new Date(conv.created_at).toLocaleDateString("zh-CN")}
                  </p>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-[var(--hairline)]">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-[var(--success)]" : "bg-[var(--error)]"}`} />
            <span className="text-xs text-[var(--steel)]">
              {isConnected ? "已连接" : "未连接"}
            </span>
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Channel Tabs */}
        <ChannelTabs activeChannel={activeChannel} onChannelChange={setActiveChannel} />

        {/* Header */}
        <div className="h-14 border-b border-[var(--hairline)] bg-[var(--surface)] flex items-center px-5 justify-between">
          <div className="flex items-center gap-2 text-sm text-[var(--steel)]">
            {selectedDatasourceName ? (
              <>
                <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
                <span className="text-[var(--charcoal)] font-medium">{selectedDatasourceName}</span>
              </>
            ) : (
              "未选择数据源"
            )}
          </div>
          <div className="flex items-center gap-3">
            <DatasourceSelector />
            <ModelSelector />
          </div>
        </div>

        {messages.length === 0 && activeChannel !== "query" ? (
          <AgentWelcome
            agent={getAgentById(activeChannel)!}
            onQuickAction={(prompt) => handleSend(prompt)}
          />
        ) : (
          <MessageList messages={messages} conversationId={selectedConversationId ?? undefined} onConfirmAction={handleConfirmAction} onCancelAction={handleCancelAction} />
        )}
        <ChatInput onSend={handleSend} onNewTopic={handleNewTopic} disabled={isStreaming} />
      </div>
    </div>
  );
}
