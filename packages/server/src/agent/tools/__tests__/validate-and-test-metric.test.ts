import { describe, test, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the validate_and_test_metric tool — Problem 4 retry counter.
 *
 * The tool must refuse further validation attempts after 3 consecutive
 * failures for a conversation (code-level circuit breaker). We mock the
 * executor (validateSqlViaExplain + executeSql) and drive the counter.
 */

vi.mock("../../../mysql/executor.js", () => ({
  validateSqlViaExplain: vi.fn(),
  executeSql: vi.fn(),
}));

vi.mock("../sql-normalize.js", () => ({
  normalizeSql: (s: string) => s,
}));

import { createValidateAndTestMetricTool } from "../validate-and-test-metric.js";
import { validateSqlViaExplain, executeSql } from "../../../mysql/executor.js";
import {
  resetValidationFailures,
  getValidationFailures,
  MAX_VALIDATION_FAILURES,
} from "../../confirm-state.js";

const mockedExplain = vi.mocked(validateSqlViaExplain);
const mockedExecuteSql = vi.mocked(executeSql);

const baseParams = {
  datasource_id: "ds-1",
  sql: "SELECT SUM(amount) FROM orders",
  metric_type: "atomic",
  conversation_id: "conv-val-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  resetValidationFailures("conv-val-1");
});

async function runTool(params: any) {
  const tool = createValidateAndTestMetricTool();
  return tool.execute("call-1", params);
}

describe("validate_and_test_metric: retry circuit breaker (Problem 4)", () => {
  test("allows validation when counter is below the limit", async () => {
    mockedExplain.mockResolvedValue({ valid: true } as any);
    mockedExecuteSql.mockResolvedValue({ rows: [{ amount: 100 }], columns: ["amount"] } as any);

    const result: any = await runTool(baseParams);

    expect(result.details.valid).toBe(true);
    expect(mockedExplain).toHaveBeenCalled();
    // Success resets the counter (still 0).
    expect(getValidationFailures("conv-val-1")).toBe(0);
  });

  test("increments counter on EXPLAIN failure", async () => {
    mockedExplain.mockResolvedValue({ valid: false, error: "bad sql" } as any);

    const result: any = await runTool(baseParams);

    expect(result.details.valid).toBe(false);
    expect(getValidationFailures("conv-val-1")).toBe(1);
    // executeSql should not be reached when EXPLAIN fails.
    expect(mockedExecuteSql).not.toHaveBeenCalled();
  });

  test("increments counter on execution failure", async () => {
    mockedExplain.mockResolvedValue({ valid: true } as any);
    mockedExecuteSql.mockRejectedValue(new Error("connection lost"));

    const result: any = await runTool(baseParams);

    expect(result.details.valid).toBe(false);
    expect(getValidationFailures("conv-val-1")).toBe(1);
  });

  test("after 3 consecutive failures, the 4th attempt is refused at entry", async () => {
    // Drive the counter to the limit by simulating 3 EXPLAIN failures.
    mockedExplain.mockResolvedValue({ valid: false, error: "fail" } as any);
    for (let i = 0; i < MAX_VALIDATION_FAILURES; i++) {
      await runTool(baseParams);
    }
    expect(getValidationFailures("conv-val-1")).toBe(MAX_VALIDATION_FAILURES);

    // 4th attempt: even with a now-valid SQL, the entry guard must refuse
    // before touching EXPLAIN or executeSql.
    vi.clearAllMocks();
    mockedExplain.mockResolvedValue({ valid: true } as any);
    mockedExecuteSql.mockResolvedValue({ rows: [], columns: [] } as any);

    const result: any = await runTool(baseParams);

    expect(result.details.valid).toBe(false);
    expect(result.details.errors[0].step).toBe("重试熔断");
    expect(mockedExplain).not.toHaveBeenCalled();
    expect(mockedExecuteSql).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("已达最大重试次数");
  });

  test("success after some failures resets the counter", async () => {
    // Two failures first.
    mockedExplain.mockResolvedValue({ valid: false, error: "fail" } as any);
    await runTool(baseParams);
    await runTool(baseParams);
    expect(getValidationFailures("conv-val-1")).toBe(2);

    // Then a success.
    mockedExplain.mockResolvedValue({ valid: true } as any);
    mockedExecuteSql.mockResolvedValue({ rows: [{ amount: 1 }], columns: ["amount"] } as any);
    const result: any = await runTool(baseParams);

    expect(result.details.valid).toBe(true);
    expect(getValidationFailures("conv-val-1")).toBe(0);
  });

  test("without conversation_id, the counter is never engaged (backward compat)", async () => {
    const { conversation_id, ...rest } = baseParams;
    mockedExplain.mockResolvedValue({ valid: false, error: "fail" } as any);

    // Many failures without a conversation_id must never trip the breaker —
    // the entry guard only activates when conversation_id is present.
    for (let i = 0; i < MAX_VALIDATION_FAILURES + 2; i++) {
      const result: any = await runTool(rest);
      expect(result.details.valid).toBe(false);
      // EXPLAIN is still called each time (no early refusal).
      expect(mockedExplain).toHaveBeenCalled();
    }
  });
});
