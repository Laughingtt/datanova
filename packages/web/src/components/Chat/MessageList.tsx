import { useRef, useEffect } from "react";
import type { ChatMessage } from "../../hooks/useAgentStream";
import MessageItem from "./MessageItem";

interface MessageListProps {
  messages: ChatMessage[];
}

export default function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
        <h2 className="font-display text-card-heading text-ink mb-2">
          Welcome to DataNova
        </h2>
        <p className="text-body-large text-muted-slate max-w-md">
          Ask questions about your database in natural language.
          I will help you write SQL queries and analyze results.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
