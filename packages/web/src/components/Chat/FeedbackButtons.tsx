import { useState, useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { EASE, prefersReducedMotion } from "../../utils/gsap-presets";

gsap.registerPlugin(useGSAP);

// ==================== Types ====================

type Rating = "positive" | "negative" | null;

interface IssueType {
  value: string;
  label: string;
}

const ISSUE_TYPES: IssueType[] = [
  { value: "wrong_table", label: "表不对" },
  { value: "wrong_field", label: "字段不对" },
  { value: "wrong_condition", label: "条件不对" },
  { value: "wrong_value", label: "数值不对" },
  { value: "other", label: "其他" },
];

// ==================== Component ====================

interface FeedbackButtonsProps {
  conversationId: string;
  messageId: string;
  onFeedbackSubmit?: (rating: string, issueType?: string, issueDetail?: string, feedbackCategory?: string) => void;
  onExplainRequest?: () => void;
}

export default function FeedbackButtons({
  conversationId,
  messageId,
  onFeedbackSubmit,
  onExplainRequest,
}: FeedbackButtonsProps) {
  const [rating, setRating] = useState<Rating>(null);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<string>("");
  const [issueDetail, setIssueDetail] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const { contextSafe } = useGSAP(() => {}, { scope: containerRef });

  const bounceClick = contextSafe((e: React.MouseEvent<HTMLButtonElement>) => {
    if (prefersReducedMotion()) return;
    gsap.fromTo(e.currentTarget, { scale: 0.85 }, { scale: 1, duration: 0.4, ease: EASE.bounce, clearProps: "scale" });
  });

  const handleRatingClick = (newRating: Rating) => {
    setRating(newRating);
    if (newRating === "positive") {
      // Submit positive feedback immediately
      onFeedbackSubmit?.("positive");
      setSubmitted(true);
    } else {
      // Show feedback form for negative rating
      setShowFeedbackForm(true);
    }
  };

  const handleSubmitFeedback = () => {
    onFeedbackSubmit?.("negative", selectedIssue, issueDetail, selectedIssue);
    setSubmitted(true);
    setShowFeedbackForm(false);
  };

  const handleCancelFeedback = () => {
    setShowFeedbackForm(false);
    setSelectedIssue("");
    setIssueDetail("");
    setRating(null);
  };

  if (submitted) {
    return (
      <div className="my-3 px-4 py-2 rounded-lg bg-[var(--success-soft)] border border-[var(--success)]">
        <p className="text-sm text-[var(--success)] flex items-center gap-2">
          <span>✓</span>
          <span>感谢反馈！</span>
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="my-3 px-4 py-3 rounded-lg bg-[var(--surface)] border border-[var(--hairline)]">
      <div className="flex items-center justify-between">
        {/* Feedback buttons */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--steel)]">这个回答有帮助吗？</span>
          <button
            onClick={(e) => { bounceClick(e); handleRatingClick("positive"); }}
            className={`transition-transform hover:scale-110 ${rating === "positive" ? "opacity-100" : "opacity-60 hover:opacity-100"}`}
            title="有帮助"
            aria-label="有帮助"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203 4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z" />
            </svg>
          </button>
          <button
            onClick={(e) => { bounceClick(e); handleRatingClick("negative"); }}
            className={`transition-transform hover:scale-110 ${rating === "negative" ? "opacity-100" : "opacity-60 hover:opacity-100"}`}
            title="没帮助"
            aria-label="没帮助"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 15h2.125m3.125 0h2.094M15 15V9.75m0 0L18.282 6.47c.654-.654.855-1.626.5-2.471A1.875 1.875 0 0017.063 3H6.937A1.875 1.875 0 005.218 4c-.355.845-.154 1.817.5 2.47L9 9.75V15m6 0v3.75a2.25 2.25 0 01-2.25 2.25H9.375a1.125 1.125 0 01-1.125-1.125V15M9 15h6" />
            </svg>
          </button>
        </div>

        {/* Explain button */}
        <button
          onClick={onExplainRequest}
          className="btn-ghost text-xs flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.166 1.404-.564 2.492-1.776 2.492-3.302V8.25c0-1.65-1.35-3-3-3s-3 1.35-3 3v7.5c0 1.526-1.088 2.738-2.492 3.302-.85.343-1.508 1.183-1.508 2.166V18M4.5 9.75a8.25 8.25 0 0115 0" />
          </svg>
          <span>解释结果</span>
        </button>
      </div>

      {/* Negative feedback form */}
      {showFeedbackForm && (
        <div className="mt-3 pt-3 border-t border-[var(--hairline-soft)]">
          <p className="text-xs text-[var(--steel)] mb-2">请告诉我们问题所在：</p>

          {/* Issue type selection */}
          <div className="flex flex-wrap gap-2 mb-3">
            {ISSUE_TYPES.map((issue) => (
              <button
                key={issue.value}
                onClick={() => setSelectedIssue(issue.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  selectedIssue === issue.value
                    ? "bg-[var(--primary)] text-[var(--on-dark)]"
                    : "bg-[var(--canvas)] border border-[var(--hairline)] text-[var(--slate)] hover:border-[var(--primary)]"
                }`}
              >
                {issue.label}
              </button>
            ))}
          </div>

          {/* Issue detail textarea */}
          <textarea
            value={issueDetail}
            onChange={(e) => setIssueDetail(e.target.value)}
            placeholder="请描述具体问题（可选）"
            className="input-field w-full h-20 text-xs resize-none mb-3"
          />

          {/* Action buttons */}
          <div className="flex justify-end gap-2">
            <button onClick={handleCancelFeedback} className="btn-secondary text-xs px-3 py-1.5">
              取消
            </button>
            <button
              onClick={handleSubmitFeedback}
              disabled={!selectedIssue}
              className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              提交反馈
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
