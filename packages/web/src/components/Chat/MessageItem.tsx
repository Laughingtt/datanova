import type { ChatMessage } from "../../hooks/useAgentStream";
import SqlBlock from "./SqlBlock";
import TableResult from "./TableResult";
import StepIndicator from "./StepIndicator";

interface MessageItemProps {
  message: ChatMessage;
}

function extractSqlFromContent(content: string): { sql: string | null; text: string } {
  const sqlMatch = content.match(/```sql\n([\s\S]*?)```/i);
  if (sqlMatch) {
    const sql = sqlMatch[1].trim();
    const text = content.replace(sqlMatch[0], "").trim();
    return { sql, text };
  }
  return { sql: null, text: content };
}

export default function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === "user";
  const { sql, text } = extractSqlFromContent(message.content);

  return (
    <div className={`px-6 py-4 ${isUser ? "flex justify-end" : ""}`}>
      <div className={`max-w-3xl ${isUser ? "" : "w-full"}`}>
        {/* Role label */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`text-xs font-mono uppercase tracking-wider ${
            isUser ? "text-[var(--primary-text)]" : "text-[var(--steel)]"
          }`}>
            {isUser ? "You" : "DataNova"}
          </span>
          {message.isStreaming && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse" />
          )}
        </div>

        {/* User bubble */}
        {isUser && text && (
          <div className="bubble-user inline-block max-w-[85%]">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
          </div>
        )}

        {/* Assistant content */}
        {!isUser && (
          <>
            {message.steps && message.steps.length > 0 && (
              <div className="mb-3 space-y-1">
                {message.steps.map((step) => (
                  <StepIndicator key={step.id} step={step} />
                ))}
              </div>
            )}

            {sql && <SqlBlock sql={sql} />}
            {message.tableData && <TableResult data={message.tableData} />}

            {text && (
              <div className="bubble-assistant">
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--ink)]">
                  {text}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
