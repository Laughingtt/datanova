import { getPending } from "../confirm-state.js";

/**
 * Confirmation guard shared by all metric_dev write tools.
 *
 * Mirrors the guard in create_metric_draft / create_dimension_draft: a write is
 * only allowed once the user confirmed the pending request_user_confirm card
 * (or when the caller omitted conversation_id, for backward compatibility).
 *
 * Returns the blocking message, or null when the write may proceed.
 */
export function confirmationBlocked(
  conversationId: string | undefined,
  actionLabel: string,
): string | null {
  if (!conversationId) return null;
  const pending = getPending(conversationId);
  if (pending && pending.status === "confirmed") return null;
  return `⚠️ 尚未获得用户确认，无法${actionLabel}。请先调用 request_user_confirm 展示确认卡片，等待用户点击「确认保存」后再执行。`;
}
