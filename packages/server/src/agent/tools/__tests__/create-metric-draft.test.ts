import { describe, test, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the create_metric_draft tool — Problem 2 confirm-state guard.
 *
 * The tool must refuse to persist anything unless the conversation's
 * confirm-state is "confirmed". We mock the store (createMetric /
 * checkMetricNameConflict), the executor (validateSqlViaExplain), and drive
 * confirm-state directly to exercise each branch. No real MySQL/SQLite.
 */

// Mock store.js — the tool imports "../../store.js" from tools/.
// From tools/__tests__/, that store is "../../../store.js".
vi.mock("../../../store.js", () => ({
  createMetric: vi.fn(),
  checkMetricNameConflict: vi.fn(),
}));

// Mock executor.js — validateSqlViaExplain. From tools/__tests__/, executor is
// "../../../mysql/executor.js".
vi.mock("../../../mysql/executor.js", () => ({
  validateSqlViaExplain: vi.fn(),
}));

// Mock the SQL normalizer to passthrough — keeps assertions readable.
vi.mock("../sql-normalize.js", () => ({
  normalizeSql: (s: string) => s,
}));

import { createCreateMetricDraftTool } from "../create-metric-draft.js";
import { createMetric, checkMetricNameConflict } from "../../../store.js";
import { validateSqlViaExplain } from "../../../mysql/executor.js";
import {
  setPending,
  markConfirmed,
  clear,
  resetValidationFailures,
} from "../../confirm-state.js";

const mockedCreateMetric = vi.mocked(createMetric);
const mockedCheckConflict = vi.mocked(checkMetricNameConflict);
const mockedExplain = vi.mocked(validateSqlViaExplain);

const baseParams = {
  datasource_id: "ds-1",
  name: "monthly_revenue",
  display_name: "月度营收",
  sql: "SELECT SUM(amount) FROM orders",
  metric_type: "atomic" as const,
  conversation_id: "conv-metric-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  clear("conv-metric-1");
  resetValidationFailures("conv-metric-1");
  // Default: no conflict, EXPLAIN passes.
  mockedCheckConflict.mockReturnValue(null);
  mockedExplain.mockResolvedValue({ valid: true } as any);
  mockedCreateMetric.mockReturnValue({
    id: "metric-1",
    name: "monthly_revenue",
    display_name: "月度营收",
    sql: "SELECT SUM(amount) FROM orders",
    metric_type: "atomic",
    status: "draft",
    validation_status: "passed",
    business_context: "",
  } as any);
});

async function runTool(params: any) {
  const tool = createCreateMetricDraftTool();
  return tool.execute("call-1", params);
}

describe("create_metric_draft: confirm-state guard (Problem 2)", () => {
  test("refuses to save when no pending confirmation exists", async () => {
    // No setPending — getPending returns null.
    const result: any = await runTool(baseParams);

    expect(result.details.created).toBe(false);
    expect(result.details.blocked).toBe("not_confirmed");
    expect(mockedCreateMetric).not.toHaveBeenCalled();
    // Conflict check and EXPLAIN should also be skipped — guard is the first gate.
    expect(mockedCheckConflict).not.toHaveBeenCalled();
    expect(mockedExplain).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("尚未获得用户确认");
  });

  test("refuses to save when confirmation is pending but not yet confirmed", async () => {
    setPending("conv-metric-1", "confirm-1", "save_draft", ["月度营收"]);
    // status is "pending" — not "confirmed".
    const result: any = await runTool(baseParams);

    expect(result.details.created).toBe(false);
    expect(result.details.blocked).toBe("not_confirmed");
    expect(mockedCreateMetric).not.toHaveBeenCalled();
  });

  test("saves successfully when confirmation is confirmed, then clears state", async () => {
    setPending("conv-metric-1", "confirm-1", "save_draft", ["月度营收"]);
    markConfirmed("conv-metric-1", "confirm-1");

    const result: any = await runTool(baseParams);

    expect(result.details.created).toBe(true);
    expect(result.details.metric_id).toBe("metric-1");
    expect(mockedCheckConflict).toHaveBeenCalledWith("ds-1", "monthly_revenue");
    expect(mockedExplain).toHaveBeenCalledWith("ds-1", "SELECT SUM(amount) FROM orders");
    expect(mockedCreateMetric).toHaveBeenCalledTimes(1);
    // Enriched fields for MetricCard rendering are present.
    expect(result.details.metric_name).toBe("monthly_revenue");
    expect(result.details.metric_type).toBe("atomic");
  });

  test("without conversation_id, the guard is bypassed (backward compat)", async () => {
    const { conversation_id, ...rest } = baseParams;
    const result: any = await runTool(rest);

    expect(result.details.created).toBe(true);
    expect(mockedCreateMetric).toHaveBeenCalled();
  });
});

describe("create_metric_draft: conflict + EXPLAIN gates", () => {
  beforeEach(() => {
    // Pre-confirm so the guard passes and we reach the downstream gates.
    setPending("conv-metric-1", "confirm-1", "save_draft", []);
    markConfirmed("conv-metric-1", "confirm-1");
  });

  test("refuses on name conflict without calling createMetric", async () => {
    mockedCheckConflict.mockReturnValue({
      id: "existing-1",
      display_name: "已有月度营收",
      status: "published",
    } as any);

    const result: any = await runTool(baseParams);

    expect(result.details.created).toBe(false);
    expect(result.details.conflict).toBe(true);
    expect(mockedCreateMetric).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("已存在");
  });

  test("refuses when EXPLAIN validation fails", async () => {
    mockedExplain.mockResolvedValue({ valid: false, error: "Unknown column 'foo'" } as any);

    const result: any = await runTool(baseParams);

    expect(result.details.created).toBe(false);
    expect(result.details.validation_error).toBe("Unknown column 'foo'");
    expect(mockedCreateMetric).not.toHaveBeenCalled();
  });
});
