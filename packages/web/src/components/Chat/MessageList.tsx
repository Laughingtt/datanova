import { useEffect, useRef } from "react";
import type { ChatMessage, ConfirmAction } from "../../hooks/useAgentStream";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { EASE, DUR, prefersReducedMotion } from "../../utils/gsap-presets";
import EmptyState from "../common/EmptyState";
import MessageItem from "./MessageItem";

gsap.registerPlugin(useGSAP);

interface MessageListProps {
  messages: ChatMessage[];
  conversationId?: string;
  onConfirmAction?: (action: ConfirmAction) => void;
  onCancelAction?: (action: ConfirmAction) => void;
}

export default function MessageList({ messages, conversationId, onConfirmAction, onCancelAction }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  // Only animate NEW messages (not all messages on every update)
  useGSAP(
    () => {
      if (!listRef.current || prefersReducedMotion()) return;

      const prevCount = prevCountRef.current;
      const currentCount = messages.length;
      prevCountRef.current = currentCount;

      // On initial load (prevCount === 0), animate all messages in
      if (prevCount === 0 && currentCount > 0) {
        const items = listRef.current.querySelectorAll(".msg-item");
        if (items.length === 0) return;
        gsap.from(items, {
          autoAlpha: 0,
          y: 10,
          duration: DUR.normal,
          stagger: DUR.stagger,
          ease: EASE.entrance,
          clearProps: "autoAlpha,y",
        });
        return;
      }

      // On subsequent updates, only animate the newly added messages
      if (currentCount > prevCount) {
        const allItems = listRef.current.querySelectorAll(".msg-item");
        const newItems = Array.from(allItems).slice(prevCount);
        if (newItems.length === 0) return;
        gsap.from(newItems, {
          autoAlpha: 0,
          y: 10,
          duration: DUR.normal,
          stagger: DUR.stagger,
          ease: EASE.entrance,
          clearProps: "autoAlpha,y",
        });
      }    },
    { scope: listRef, dependencies: [messages.length] }
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <EmptyState
        icon={
          <svg className="w-8 h-8 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        }
        title="向你的数据提问"
        description="连接数据源后，用自然语言提问，DataNova 会自动发现 schema 并生成 SQL 查询。"
      />
    );
  }

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--surface)]">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} conversationId={conversationId} onConfirmAction={onConfirmAction} onCancelAction={onCancelAction} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
