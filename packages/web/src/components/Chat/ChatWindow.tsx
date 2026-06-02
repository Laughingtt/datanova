import { useState, useCallback, useRef } from "react";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useAgentStream, processWsEvent, type ChatMessage } from "../../hooks/useAgentStream";
import { conversationsApi, type Conversation } from "../../api/client";
import { useAppStore } from "../../stores/app";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";

const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.host}/ws/chat`;

export default function ChatWindow() {
  const { selectedDatasourceId, selectedConversationId, setSelectedConversationId } = useAppStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const currentAssistantRef = useRef<ChatMessage | null>(null);
  const initializedRef = useRef<string | null>(null);

  const handleWsEvent = useCallback((data: unknown) => {
    const event = data as { type: string; [key: string]: unknown };

    if (event.type === "connected") {
      return;
    }

    if (event.type === "init_success") {
      initializedRef.current = event.conversationId as string;
      return;
    }

    // Process agent events
    const processed = processWsEvent(event, currentAssistantRef.current);

    if (processed) {
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
      // Load conversations
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
        title: "New Conversation",
        datasourceId: selectedDatasourceId ?? undefined,
      });
      setConversations((prev) => [conv, ...prev]);
      setSelectedConversationId(conv.id);
      setMessages([]);

      // Initialize agent session
      initSession({
        conversationId: conv.id,
        datasourceId: selectedDatasourceId ?? undefined,
        datasourceName: undefined,
      });
    } catch (err) {
      console.error("Failed to create conversation:", err);
    }
  };

  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
    setMessages([]);
    initializedRef.current = null;

    // Re-initialize agent session
    initSession({
      conversationId: id,
      datasourceId: selectedDatasourceId ?? undefined,
    });
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await conversationsApi.delete(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (selectedConversationId === id) {
        setSelectedConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  const handleSend = (text: string) => {
    if (!selectedConversationId) {
      // Auto-create conversation
      conversationsApi
        .create({
          title: text.slice(0, 50),
          datasourceId: selectedDatasourceId ?? undefined,
        })
        .then((conv) => {
          setSelectedConversationId(conv.id);
          setConversations((prev) => [conv, ...prev]);

          // Add user message
          const userMsg: ChatMessage = {
            id: `msg-${Date.now()}`,
            role: "user",
            content: text,
            timestamp: Date.now(),
          };
          setMessages([userMsg]);

          // Init and send
          initSession({
            conversationId: conv.id,
            datasourceId: selectedDatasourceId ?? undefined,
          });

          // Small delay to allow init to complete
          setTimeout(() => {
            sendMessage(text, conv.id);
          }, 500);
        });
      return;
    }

    // Add user message
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Send to agent
    sendMessage(text, selectedConversationId);
  };

  return (
    <div className="flex h-screen">
      {/* Conversation list sidebar */}
      <div className="w-[220px] border-r border-hairline bg-soft-stone/30 flex flex-col">
        <div className="p-4 border-b border-hairline">
          <button
            onClick={handleNewConversation}
            className="w-full btn-primary text-center"
          >
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => handleSelectConversation(conv.id)}
              className={`px-4 py-3 cursor-pointer border-b border-card-border transition-colors ${
                selectedConversationId === conv.id
                  ? "bg-canvas-white border-l-2 border-l-coral"
                  : "hover:bg-soft-stone/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-caption text-ink truncate flex-1">
                  {conv.title ?? "Untitled"}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteConversation(conv.id);
                  }}
                  className="text-muted-slate hover:text-error-red text-micro ml-2"
                >
                  x
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Connection status */}
        <div className="p-4 border-t border-hairline">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-deep-green" : "bg-error-red"
              }`}
            />
            <span className="text-micro text-muted-slate">
              {isConnected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        <MessageList messages={messages} />
        <ChatInput onSend={handleSend} disabled={isStreaming} />
      </div>
    </div>
  );
}
