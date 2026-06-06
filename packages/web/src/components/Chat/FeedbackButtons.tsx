import { useState } from "react";

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
  onFeedbackSubmit?: (rating: string, issueType?: string, issueDetail?: string) => void;
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
    onFeedbackSubmit?.("negative", selectedIssue, issueDetail);
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
    <div className="my-3 px-4 py-3 rounded-lg bg-[var(--surface)] border border-[var(--hairline)]">
      <div className="flex items-center justify-between">
        {/* Feedback buttons */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--steel)]">这个回答有帮助吗？</span>
          <button
            onClick={() => handleRatingClick("positive")}
            className={`text-lg transition-transform hover:scale-110 ${
              rating === "positive" ? "opacity-100" : "opacity-60 hover:opacity-100"
            }`}
            title="有帮助"
          >
            👍
          </button>
          <button
            onClick={() => handleRatingClick("negative")}
            className={`text-lg transition-transform hover:scale-110 ${
              rating === "negative" ? "opacity-100" : "opacity-60 hover:opacity-100"
            }`}
            title="没帮助"
          >
            👎
          </button>
        </div>

        {/* Explain button */}
        <button
          onClick={onExplainRequest}
          className="btn-ghost text-xs flex items-center gap-1"
        >
          <span>💡</span>
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
