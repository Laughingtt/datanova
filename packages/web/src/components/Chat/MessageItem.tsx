import type { ChatMessage } from "../../hooks/useAgentStream";
import SqlBlock from "./SqlBlock";
import TableResult from "./TableResult";
import StepIndicator from "./StepIndicator";

interface MessageItemProps {
  message: ChatMessage;
}

function extractSqlFromContent(content: string): { sql: string | null; text: string } {
  // Extract SQL from markdown code blocks
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
    <div className={`px-6 py-4 ${isUser ? "" : "bg-near-black text-white"}`}>
      <div className={`max-w-3xl mx-auto`}>
        {/* Role indicator */}
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`mono-label ${
              isUser ? "text-muted-slate" : "text-white/50"
            }`}
          >
            {isUser ? "YOU" : "DATANOVA"}
          </span>
          {message.isStreaming && (
            <span className="inline-block w-2 h-2 rounded-full bg-coral animate-pulse" />
          )}
        </div>

        {/* Steps */}
        {message.steps && message.steps.length > 0 && (
          <div className="mb-3 space-y-1">
            {message.steps.map((step) => (
              <StepIndicator key={step.id} step={step} />
            ))}
          </div>
        )}

        {/* SQL Block */}
        {sql && <SqlBlock sql={sql} />}

        {/* Table Data */}
        {message.tableData && <TableResult data={message.tableData} />}

        {/* Text content */}
        {text && (
          <div
            className={`text-body-base leading-relaxed whitespace-pre-wrap ${
              isUser ? "text-ink" : "text-white/90"
            }`}
          >
            {text}
          </div>
        )}
      </div>
    </div>
  );
}
