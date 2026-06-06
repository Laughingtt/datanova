import type { ChatMessage } from "../../hooks/useAgentStream";
import { parseReportSections } from "../../hooks/useAgentStream";
import SqlBlock from "./SqlBlock";
import TableResult from "./TableResult";
import StepIndicator from "./StepIndicator";
import ResultSummaryCard, { parseSummarySections } from "./ResultSummaryCard";
import ValidationBanner from "./ValidationBanner";
import FeedbackButtons from "./FeedbackButtons";
import ReportView from "../Reports/ReportView";
import ReportExport from "../Reports/ReportExport";

interface MessageItemProps {
  message: ChatMessage;
  conversationId?: string;
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

/**
 * Strip summary section patterns from text content so they don't
 * appear both in the summary card and as raw text.
 */
function stripSummaryFromText(text: string): string {
  return text
    .replace(/\*\*关键发现\*\*\s*[:：]\s*(.+?)(?=\*\*|$)/gs, "")
    .replace(/\*\*趋势\*\*\s*[:：]\s*(.+?)(?=\*\*|$)/gs, "")
    .replace(/\*\*异常\*\*\s*[:：]\s*(.+?)(?=\*\*|$)/gs, "")
    .replace(/\*\*结果\*\*\s*[:：]\s*(.+?)(?=\*\*|$)/gs, "")
    .trim();
}

export default function MessageItem({ message, conversationId }: MessageItemProps) {
  const isUser = message.role === "user";
  const { sql, text } = extractSqlFromContent(message.content);

  // Derive summary sections on render (P1-C8)
  const summarySections = parseSummarySections(message.content);
  const hasSummary = summarySections.length > 0;

  // Derive report sections on render (P4-Task3)
  const reportSections = message.reportSections ?? parseReportSections(message.content);
  const hasReport = reportSections.length > 0;

  // If we have summary sections, strip them from the text to avoid duplication
  const displayText = hasSummary ? stripSummaryFromText(text) : text;

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

        {/* Follow-up context tag */}
        {message.followUpContext && (
          <div className="mb-2 inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs text-blue-600">
            <span>&#x1F4AC;</span><span>{message.followUpContext}</span>
          </div>
        )}

        {/* User bubble */}
        {isUser && text && (
          <div className="bubble-user inline-block max-w-[85%]">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
          </div>
        )}

        {/* Assistant content */}
        {!isUser && (
          <>
            {/* Steps */}
            {message.steps && message.steps.length > 0 && (
              <div className="mb-3 space-y-1">
                {message.steps.map((step) => (
                  <StepIndicator key={step.id} step={step} />
                ))}
              </div>
            )}

            {/* 1. ResultSummaryCard (derived from content on render) */}
            <ResultSummaryCard content={message.content} />

            {/* 1.5 ReportView (if report sections detected, P4-Task3) */}
            {hasReport && !message.isStreaming && (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <div />
                  <ReportExport rawContent={message.content} />
                </div>
                <ReportView sections={reportSections} rawContent={message.content} />
              </div>
            )}

            {/* 2. ValidationBanner (if validationStatus exists) */}
            {message.validationStatus && (
              <ValidationBanner
                level={message.validationStatus.level}
                message={message.validationStatus.message}
              />
            )}

            {/* 3. SqlBlock */}
            {sql && <SqlBlock sql={sql} />}

            {/* 4. TableResult */}
            {message.tableData && <TableResult data={message.tableData} />}

            {/* 5. FeedbackButtons + Explain (if tableData exists and not streaming) */}
            {message.tableData && !message.isStreaming && conversationId && (
              <FeedbackButtons
                conversationId={conversationId}
                messageId={message.id}
              />
            )}

            {/* Remaining text content */}
            {displayText && (
              <div className="bubble-assistant">
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--ink)]">
                  {displayText}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
