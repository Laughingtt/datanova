import { useEffect, useRef } from "react";
import type { ChatMessage } from "../../hooks/useAgentStream";
import MessageItem from "./MessageItem";

interface MessageListProps {
  messages: ChatMessage[];
  conversationId?: string;
}

export default function MessageList({ messages, conversationId }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--surface-cream)]">
        <div className="text-center space-y-4 max-w-md px-8">
          <div className="w-16 h-16 mx-auto rounded-lg bg-[var(--cream)] border border-[var(--beige-deep)] flex items-center justify-center text-3xl">
            📊
          </div>
          <h2 className="text-heading-4 font-display text-[var(--ink)]">
            Ask about your data
          </h2>
          <p className="text-body-sm text-[var(--slate)]">
            Connect a datasource and ask questions in natural language.
            DataNova will discover your schema and generate SQL queries.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--surface)]">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} conversationId={conversationId} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
