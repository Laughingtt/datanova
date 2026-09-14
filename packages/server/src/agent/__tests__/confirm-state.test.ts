import { describe, test, expect, beforeEach, vi } from "vitest";

/**
 * Unit tests for confirm-state.ts (Problem 2 confirmation guard).
 *
 * These cover the state machine that the save tools consult before persisting
 * metric/dimension drafts. State is process-local (Map) and lives only for the
 * duration of a confirmation interaction, so we reset between cases.
 */

// Date.now is read inside the module — patch it so TTL expiry is deterministic.
const NOW = 1_700_000_000_000;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

// Import fresh module state per file (module-level Map persists across tests
// within a file, so we clear explicitly in beforeEach below).
import {
  setPending,
  getPending,
  markConfirmed,
  markCancelled,
  clear,
  CONFIRM_TTL_MS,
  getValidationFailures,
  incrementValidationFailures,
  resetValidationFailures,
  MAX_VALIDATION_FAILURES,
} from "../confirm-state.js";

beforeEach(() => {
  clear("conv-1");
  clear("conv-2");
  resetValidationFailures("conv-1");
  resetValidationFailures("conv-2");
});

describe("confirm-state: confirmation lifecycle", () => {
  test("getPending returns null when no state has been set", () => {
    expect(getPending("conv-1")).toBeNull();
  });

  test("setPending then getPending returns pending state", () => {
    setPending("conv-1", "confirm-abc", "save_draft", ["指标A", "维度B"]);
    const state = getPending("conv-1");
    expect(state).not.toBeNull();
    expect(state!.status).toBe("pending");
    expect(state!.confirmId).toBe("confirm-abc");
    expect(state!.actionType).toBe("save_draft");
    expect(state!.items).toEqual(["指标A", "维度B"]);
  });

  test("markConfirmed transitions pending -> confirmed", () => {
    setPending("conv-1", "confirm-abc", "save_draft", []);
    expect(markConfirmed("conv-1", "confirm-abc")).toBe(true);
    expect(getPending("conv-1")!.status).toBe("confirmed");
  });

  test("markConfirmed returns false when no pending state exists", () => {
    expect(markConfirmed("conv-1", "confirm-abc")).toBe(false);
  });

  test("markConfirmed returns false when confirmId mismatches", () => {
    setPending("conv-1", "confirm-abc", "save_draft", []);
    expect(markConfirmed("conv-1", "confirm-wrong")).toBe(false);
    // State should remain pending (not corrupted)
    expect(getPending("conv-1")!.status).toBe("pending");
  });

  test("markCancelled transitions pending -> cancelled", () => {
    setPending("conv-1", "confirm-abc", "save_draft", []);
    expect(markCancelled("conv-1", "confirm-abc")).toBe(true);
    expect(getPending("conv-1")!.status).toBe("cancelled");
  });

  test("clear removes the state", () => {
    setPending("conv-1", "confirm-abc", "save_draft", []);
    clear("conv-1");
    expect(getPending("conv-1")).toBeNull();
  });

  test("state is scoped per conversation (conv-1 and conv-2 are independent)", () => {
    setPending("conv-1", "c1", "save_draft", []);
    setPending("conv-2", "c2", "create", []);
    markConfirmed("conv-1", "c1");
    expect(getPending("conv-1")!.status).toBe("confirmed");
    expect(getPending("conv-2")!.status).toBe("pending");
  });

  test("expired state is pruned lazily and treated as absent", () => {
    setPending("conv-1", "confirm-abc", "save_draft", []);
    // Sanity: state is present at NOW.
    expect(getPending("conv-1")).not.toBeNull();
    // Advance just past the TTL.
    vi.setSystemTime(NOW + CONFIRM_TTL_MS + 1);
    expect(getPending("conv-1")).toBeNull();
    // After lazy prune, markConfirmed should also fail.
    expect(markConfirmed("conv-1", "confirm-abc")).toBe(false);
  });
});

describe("confirm-state: validation retry counter (Problem 4)", () => {
  test("getValidationFailures defaults to 0", () => {
    expect(getValidationFailures("conv-1")).toBe(0);
  });

  test("incrementValidationFailures increments and returns the new count", () => {
    expect(incrementValidationFailures("conv-1")).toBe(1);
    expect(incrementValidationFailures("conv-1")).toBe(2);
    expect(incrementValidationFailures("conv-1")).toBe(3);
  });

  test("resetValidationFailures clears the counter", () => {
    incrementValidationFailures("conv-1");
    incrementValidationFailures("conv-1");
    resetValidationFailures("conv-1");
    expect(getValidationFailures("conv-1")).toBe(0);
  });

  test("MAX_VALIDATION_FAILURES is 3", () => {
    expect(MAX_VALIDATION_FAILURES).toBe(3);
  });

  test("counter is scoped per conversation", () => {
    incrementValidationFailures("conv-1");
    incrementValidationFailures("conv-1");
    expect(getValidationFailures("conv-2")).toBe(0);
  });
});
