import type { ChatMessage, ConfirmAction } from "../../hooks/useAgentStream";
import { parseReportSections } from "../../hooks/useAgentStream";
import SqlBlock from "./SqlBlock";
import TableResult from "./TableResult";
import StepIndicator from "./StepIndicator";
import ResultSummaryCard, { parseSummarySections } from "./ResultSummaryCard";
import ValidationBanner from "./ValidationBanner";
import FeedbackButtons from "./FeedbackButtons";
import ConfirmActionCard from "./ConfirmActionCard";
import { feedbackApi } from "../../api/client";
import ReportView from "../Reports/ReportView";
import ReportExport from "../Reports/ReportExport";
import { useState, useMemo, useRef } from "react";
import ChartView from "./ChartView";
import MarkdownContent from "./MarkdownContent";
import MetricCard from "./cards/MetricCard";
import DimensionCard from "./cards/DimensionCard";
import ValidationResult from "./cards/ValidationResult";
import { inferChartType } from "../../utils/chart-inference";
import { extractMarkdownTables } from "../../utils/markdown-table-extractor";
import type { TableData } from "../../hooks/useAgentStream";
import { useCursorPulse } from "../../hooks/useGsapAnimations";

interface MessageItemProps {
  message: ChatMessage;
  conversationId?: string;
  onConfirmAction?: (action: ConfirmAction) => void;
  onCancelAction?: (action: ConfirmAction) => void;
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


type DataViewTab = "table" | "chart";

function DataViewToggle({ tableData, isMarkdownTable }: { tableData: TableData; isMarkdownTable?: boolean }) {
  const [tab, setTab] = useState<DataViewTab>(() => {
    const inference = inferChartType(tableData);
    return inference ? "chart" : "table";
  });

  return (
    <div className="my-3">
      <div className="flex items-center gap-1 mb-2">
        <button
          onClick={() => setTab("table")}
          className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
          style={{
            backgroundColor: tab === "table" ? "var(--primary-soft)" : "transparent",
            color: tab === "table" ? "var(--primary)" : "var(--steel)",
            border: tab === "table" ? "1px solid var(--primary)" : "1px solid transparent",
          }}
        >
          <svg className="w-3.5 h-3.5 inline -mt-0.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75H5.625m13.5 0H5.625M5.625 19.5V7.875C5.625 6.504 6.504 5.625 7.875 5.625h9.75c1.371 0 2.25.879 2.25 2.25v11.625" />
          </svg>
          表格
        </button>
        <button
          onClick={() => setTab("chart")}
          className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
          style={{
            backgroundColor: tab === "chart" ? "var(--primary-soft)" : "transparent",
            color: tab === "chart" ? "var(--primary)" : "var(--steel)",
            border: tab === "chart" ? "1px solid var(--primary)" : "1px solid transparent",
          }}
        >
          <svg className="w-3.5 h-3.5 inline -mt-0.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          图表
        </button>
      </div>
      {tab === "table"
        ? (isMarkdownTable ? <MarkdownContent content={markdownTableToText(tableData)} /> : <TableResult data={tableData} />)
        : <ChartView data={tableData} />}
    </div>
  );
}

function markdownTableToText(data: TableData): string {
  const header = "| " + data.columns.join(" | ") + " |";
  const sep = "| " + data.columns.map(() => "---").join(" | ") + " |";
  const rows = data.rows.map(r => "| " + data.columns.map(c => String(r[c] ?? "")).join(" | ") + " |").join("\n");
  return header + "\n" + sep + "\n" + rows;
}

export default function MessageItem({ message, conversationId, onConfirmAction, onCancelAction }: MessageItemProps) {
  const isUser = message.role === "user";
  const { sql, text } = extractSqlFromContent(message.content);

  // 流式输出时的呼吸光标（GSAP，遵循 prefers-reduced-motion）
  const cursorRef = useRef<HTMLSpanElement>(null);
  useCursorPulse(cursorRef, !!message.isStreaming);

  const handleFeedback = (rating: string, issueType?: string, issueDetail?: string, feedbackCategory?: string) => {
    if (!conversationId) return;
    feedbackApi.submit(conversationId, message.id, {
      rating,
      issue_type: issueType,
      issue_detail: issueDetail,
      feedback_category: feedbackCategory,
      sql_query_history_id: message.sqlQueryHistoryId,
    });
  };

  // Derive summary sections on render (P1-C8)
  const summarySections = parseSummarySections(message.content);
  const hasSummary = summarySections.length > 0;

  // Derive report sections on render (P4-Task3)
  const reportSections = message.reportSections ?? parseReportSections(message.content);
  const hasReport = reportSections.length > 0;

  // If we have summary sections, strip them from the text to avoid duplication
  const displayText = hasSummary ? stripSummaryFromText(text) : text;

  // Extract markdown tables for chart rendering when no execute_sql tableData
  const markdownTables = useMemo(() => {
    if (message.tableData) return []; // prefer execute_sql data
    return extractMarkdownTables(message.content);
  }, [message.content, message.tableData]);

  return (
    <div className={`msg-item px-6 py-4 ${isUser ? "flex justify-end" : ""}`}>
      <div className={`max-w-3xl ${isUser ? "" : "w-full"}`}>
        {/* Role label */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`text-xs font-body font-medium uppercase tracking-wider ${
            isUser ? "text-[var(--primary-text)]" : "text-[var(--steel)]"
          }`}>
            {isUser ? "你" : "DataNova"}
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
            {(sql || message.sqlBlock) && <SqlBlock sql={message.sqlBlock ?? sql!} />}

            {/* 4. Table / Chart view from execute_sql */}
            {message.tableData && <DataViewToggle tableData={message.tableData} />}

            {/* 4.5 Charts from markdown tables (when no execute_sql tableData) */}
            {!message.tableData && markdownTables.length > 0 && !message.isStreaming && (
              <div className="my-3 space-y-3">
                {markdownTables.map((tbl, idx) => {
                  const inference = inferChartType(tbl);
                  if (!inference) return null;
                  return <ChartView key={idx} data={tbl} />;
                })}
              </div>
            )}

            {/* 5. FeedbackButtons + Explain (if tableData exists and not streaming) */}
            {message.tableData && !message.isStreaming && conversationId && (
              <FeedbackButtons
                conversationId={conversationId}
                messageId={message.id}
                onFeedbackSubmit={handleFeedback}
              />
            )}

            {/* 6. ConfirmActionCard (if confirmAction exists and not streaming) */}
            {message.confirmAction && !message.isStreaming && onConfirmAction && onCancelAction && (
              <ConfirmActionCard
                confirmAction={message.confirmAction}
                onConfirm={onConfirmAction}
                onCancel={onCancelAction}
              />
            )}

            {/* 6.5 metric_dev rich cards (ValidationResult / MetricCard / DimensionCard) */}
            {message.validationResult && !message.isStreaming && (
              <ValidationResult
                valid={message.validationResult.valid}
                errors={message.validationResult.errors}
                warnings={message.validationResult.warnings}
                test_row_count={message.validationResult.test_row_count}
              />
            )}
            {message.metricDraft && !message.isStreaming && (
              <MetricCard
                name={message.metricDraft.metric_name}
                display_name={message.metricDraft.display_name}
                sql={message.metricDraft.sql}
                metric_type={message.metricDraft.metric_type}
                status={message.metricDraft.status}
                validation_status={message.metricDraft.validation_status}
                business_context={message.metricDraft.business_context}
              />
            )}
            {message.dimensionDraft && !message.isStreaming && (
              <DimensionCard
                name={message.dimensionDraft.dimension_name}
                display_name={message.dimensionDraft.display_name}
                sql_expression={message.dimensionDraft.sql_expression}
                data_type={message.dimensionDraft.data_type}
                grain={message.dimensionDraft.grain}
              />
            )}

            {/* Remaining text content - rendered as Markdown */}
            {displayText && !message.isStreaming && (
              <div className="bubble-assistant">
                <MarkdownContent content={displayText} />
              </div>
            )}
            {displayText && message.isStreaming && (
              <div className="bubble-assistant">
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--ink)]">
                  {displayText}
                  <span
                    ref={cursorRef}
                    className="stream-cursor inline-block w-[2px] h-[1em] align-text-bottom ml-0.5 bg-[var(--primary)]"
                    aria-hidden="true"
                  />
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
