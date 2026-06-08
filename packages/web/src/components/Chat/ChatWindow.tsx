import { useState, useCallback, useRef } from "react";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useAgentStream, processWsEvent, type ChatMessage } from "../../hooks/useAgentStream";
import { conversationsApi, type Conversation } from "../../api/client";
import { useAppStore } from "../../stores/app";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import ModelSelector from "./ModelSelector";
import DatasourceSelector from "./DatasourceSelector";

const WS_URL = import.meta.env.VITE_WS_URL || `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/chat`;

/** Convert a persisted message from the server into a ChatMessage for the UI */
function toChatMessage(m: { id: string; role: string; content: string; steps?: unknown[]; timestamp?: number }): ChatMessage {
  return {
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    timestamp: m.timestamp ?? Date.now(),
    steps: Array.isArray(m.steps)
      ? (m.steps as Array<{ id?: string; type?: string; toolName?: string; args?: Record<string, unknown>; result?: unknown; isError?: boolean; content?: string }>).map((s, i) => ({
          id: s.id ?? `step-${i}`,
          type: (s.type as "thinking" | "tool_call" | "tool_result") ?? "thinking",
          toolName: s.toolName,
          args: s.args,
          result: s.result,
          isError: s.isError,
          content: s.content,
        }))
      : undefined,
  };
}

export default function ChatWindow() {
  const {
    selectedDatasourceId,
    selectedDatasourceName,
    selectedConversationId,
    modelProvider,
    modelId,
  } = useAppStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const currentAssistantRef = useRef<ChatMessage | null>(null);
  const initializedRef = useRef<string | null>(null);

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
        setMessages((prev) => [...prev, processed]);
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

      // Update Zustand store with the selected conversation
      const { setSelectedConversationId } = useAppStore.getState();
      setSelectedConversationId(conv.id);
      setMessages([]);

      initSession({
        conversationId: conv.id,
        datasourceId: selectedDatasourceId ?? undefined,
        datasourceName: selectedDatasourceName ?? undefined,
        modelProvider: modelProvider ?? undefined,
        modelId: modelId ?? undefined,
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
            id: `msg-${Date.now()}`,
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

  return (
    <div className="flex h-full">
      {/* Conversation list panel */}
      <div className="w-[240px] border-r border-[var(--hairline)] bg-[var(--surface)] flex flex-col">
        <div className="p-4 border-b border-[var(--hairline)]">
          <button onClick={handleNewConversation} className="w-full btn-primary text-center">
            + New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {conversations.map((conv) => {
            const { selectedConversationId } = useAppStore.getState();
            const isActive = selectedConversationId === conv.id;
            return (
              <div
                key={conv.id}
                onClick={() => handleSelectConversation(conv.id)}
                className={`px-4 py-3 cursor-pointer border-b border-[var(--hairline-soft)] transition-colors ${
                  isActive
                    ? "bg-[var(--primary-soft)] border-l-2 border-l-[var(--primary)]"
                    : "hover:bg-[var(--canvas)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[var(--ink)] truncate flex-1">
                    {conv.title ?? "Untitled"}
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteConversation(conv.id);
                    }}
                    className="btn-danger text-xs ml-2 px-1.5 py-0.5"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Connection status */}
        <div className="p-4 border-t border-[var(--hairline)]">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-[var(--success)]" : "bg-[var(--error)]"}`} />
            <span className="text-xs text-[var(--steel)]">
              {isConnected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header with selectors */}
        <div className="h-12 border-b border-[var(--hairline)] bg-[var(--canvas)] flex items-center px-4 justify-between">
          <div className="text-sm text-[var(--steel)]">
            {selectedDatasourceName ? (
              <span>
                Connected to <span className="text-[var(--ink)] font-medium">{selectedDatasourceName}</span>
              </span>
            ) : (
              "No datasource selected"
            )}
          </div>
          <div className="flex items-center gap-3">
            <DatasourceSelector />
            <ModelSelector />
          </div>
        </div>

        <MessageList messages={messages} conversationId={selectedConversationId ?? undefined} />
        <ChatInput onSend={handleSend} onNewTopic={handleNewTopic} disabled={isStreaming} />
      </div>
    </div>
  );
}
