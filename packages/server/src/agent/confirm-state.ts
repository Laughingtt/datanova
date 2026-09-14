/**
 * In-process confirmation state for the metric_dev agent.
 *
 * Problem being solved: `request_user_confirm` returns immediately and the
 * agent loop is NOT mechanically blocked from calling the save tools
 * (`create_metric_draft` / `create_dimension_draft`) in the same turn. The
 * `terminate: true` hint on the confirm tool result halts *subsequent* tool
 * batches in the turn, but it cannot prevent a parallel save call in the
 * same batch, nor does it protect against the LLM simply skipping the
 * confirm step. The save tools therefore consult this module as the
 * authoritative guard: they refuse to persist anything unless the
 * conversation's state is `"confirmed"`.
 *
 * This is transient process state (lost on restart), mirroring
 * `InMemorySessionRepo` semantics — confirmation is a short-lived
 * interaction, not persisted data.
 */

export interface ConfirmState {
  confirmId: string;
  actionType: string;
  items: string[];
  status: "pending" | "confirmed" | "cancelled";
  expiresAt: number;
}

/** 10-minute TTL — a confirmation that is never answered should not linger. */
export const CONFIRM_TTL_MS = 10 * 60 * 1000;

const store = new Map<string, ConfirmState>();

/**
 * Register a pending confirmation for a conversation. Called by chat-handler
 * when forwarding a `confirm_action` event to the frontend.
 */
export function setPending(
  conversationId: string,
  confirmId: string,
  actionType: string,
  items: string[],
): void {
  store.set(conversationId, {
    confirmId,
    actionType,
    items,
    status: "pending",
    expiresAt: Date.now() + CONFIRM_TTL_MS,
  });
}

/**
 * Get the current confirmation state for a conversation.
 * Expired entries are pruned lazily and treated as absent (returns null).
 */
export function getPending(conversationId: string): ConfirmState | null {
  const state = store.get(conversationId);
  if (!state) return null;
  if (Date.now() > state.expiresAt) {
    store.delete(conversationId);
    return null;
  }
  return state;
}

/** Mark the conversation's pending confirmation as confirmed. */
export function markConfirmed(conversationId: string, confirmId?: string): boolean {
  const state = store.get(conversationId);
  if (!state) return false;
  if (confirmId && state.confirmId !== confirmId) return false;
  if (Date.now() > state.expiresAt) {
    store.delete(conversationId);
    return false;
  }
  state.status = "confirmed";
  return true;
}

/** Mark the conversation's pending confirmation as cancelled. */
export function markCancelled(conversationId: string, confirmId?: string): boolean {
  const state = store.get(conversationId);
  if (!state) return false;
  if (confirmId && state.confirmId !== confirmId) return false;
  state.status = "cancelled";
  return true;
}

/** Clear confirmation state for a conversation (e.g. after a successful save). */
export function clear(conversationId: string): void {
  store.delete(conversationId);
}

// ==================== Validation retry counter (Problem 4) ====================
//
// The metric_dev prompt promises "最多重试3次" self-correction, but that is
// purely prompt-driven. This counter is the code-level circuit breaker: after
// 3 consecutive failed validations for a conversation, the validate tool
// refuses further attempts and asks the agent to surface the problem to the
// user. State lives here alongside confirmation state because both are
// per-conversation transient agent-interaction state.

const MAX_VALIDATION_FAILURES = 3;
const validationFailures = new Map<string, number>();

export function getValidationFailures(conversationId: string): number {
  return validationFailures.get(conversationId) ?? 0;
}

/** Increment the consecutive-failure counter and return the new value. */
export function incrementValidationFailures(conversationId: string): number {
  const next = (validationFailures.get(conversationId) ?? 0) + 1;
  validationFailures.set(conversationId, next);
  return next;
}

/** Reset the counter (called after a successful validation). */
export function resetValidationFailures(conversationId: string): void {
  validationFailures.delete(conversationId);
}

export { MAX_VALIDATION_FAILURES };
