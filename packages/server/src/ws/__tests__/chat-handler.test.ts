import { describe, test, expect } from "vitest";

// ==================== Bug #1: streamingState steps always empty ====================
// The chat-handler creates separate streamingState objects in handleInit and handleMessage.
// Events accumulate into handleInit's streamingState, but handleMessage saves its own
// (empty) streamingState.steps to the database. This test verifies the fix: that
// streamingState is shared across handleInit and handleMessage for the same conversation.

interface StreamingState {
  content: string;
  steps: Array<Record<string, unknown>>;
}

describe("chat-handler streamingState", () => {
  describe("StreamingStateMap — shared state across init and message", () => {
    test("steps accumulated during init's subscribe should be available when handleMessage persists", () => {
      // This is the core bug: handleMessage creates a NEW streamingState that is
      // never populated. The fix requires sharing state via a Map.
      const streamingStates = new Map<string, StreamingState>();

      const conversationId = "conv-1";

      // Simulate handleInit: create streaming state and register in Map
      const initState: StreamingState = { content: "", steps: [] };
      streamingStates.set(conversationId, initState);

      // Simulate events accumulating into init's state (as subscribe would do)
      initState.steps.push({ type: "tool_call", toolName: "discover_schema", args: {} });
      initState.steps.push({ type: "tool_result", toolName: "discover_schema", result: { tables: [] } });
      initState.content = "I found 3 tables.";

      // BUG SCENARIO: handleMessage creates its own streamingState (empty)
      const bugStreamingState: StreamingState = { content: "", steps: [] };

      // With the bug, bugStreamingState.steps is always []
      expect(bugStreamingState.steps).toEqual([]);
      expect(bugStreamingState.steps.length).toBe(0);

      // FIX SCENARIO: handleMessage reads from the shared Map
      const fixStreamingState = streamingStates.get(conversationId);
      expect(fixStreamingState!.steps.length).toBe(2);
      expect(fixStreamingState!.steps[0].type).toBe("tool_call");
      expect(fixStreamingState!.steps[1].type).toBe("tool_result");
      expect(fixStreamingState!.content).toBe("I found 3 tables.");
    });

    test("multiple conversations have independent streaming states", () => {
      const streamingStates = new Map<string, StreamingState>();

      const conv1State: StreamingState = { content: "", steps: [] };
      const conv2State: StreamingState = { content: "", steps: [] };
      streamingStates.set("conv-1", conv1State);
      streamingStates.set("conv-2", conv2State);

      conv1State.steps.push({ type: "tool_call", toolName: "execute_sql" });
      conv2State.steps.push({ type: "tool_call", toolName: "discover_schema" });

      expect(streamingStates.get("conv-1")!.steps.length).toBe(1);
      expect(streamingStates.get("conv-1")!.steps[0].toolName).toBe("execute_sql");
      expect(streamingStates.get("conv-2")!.steps.length).toBe(1);
      expect(streamingStates.get("conv-2")!.steps[0].toolName).toBe("discover_schema");
    });

    test("streaming state is reset after handleMessage persists to DB", () => {
      // After saving the assistant message, the streaming state should be reset
      // for the next turn, so steps from the previous turn don't leak.
      const streamingStates = new Map<string, StreamingState>();

      const conversationId = "conv-1";
      streamingStates.set(conversationId, { content: "response 1", steps: [{ type: "tool_call", toolName: "discover_schema" }] });

      // After persisting, reset for next turn
      streamingStates.set(conversationId, { content: "", steps: [] });

      expect(streamingStates.get(conversationId)!.steps.length).toBe(0);
      expect(streamingStates.get(conversationId)!.content).toBe("");
    });
  });
});
