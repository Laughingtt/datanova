import { describe, test, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the create_dimension_draft tool — Problem 2 (confirm-state guard)
 * + Problem 3 (conflict check + conditional EXPLAIN validation).
 *
 * Mocks: store (createDimension / checkDimensionNameConflict),
 * executor (validateSqlViaExplain), sql-normalize passthrough.
 */

vi.mock("../../../store.js", () => ({
  createDimension: vi.fn(),
  checkDimensionNameConflict: vi.fn(),
}));

vi.mock("../../../mysql/executor.js", () => ({
  validateSqlViaExplain: vi.fn(),
}));

vi.mock("../sql-normalize.js", () => ({
  normalizeSql: (s: string) => s,
}));

import { createCreateDimensionDraftTool } from "../create-dimension-draft.js";
import { createDimension, checkDimensionNameConflict } from "../../../store.js";
import { validateSqlViaExplain } from "../../../mysql/executor.js";
import {
  setPending,
  markConfirmed,
  clear,
  resetValidationFailures,
} from "../../confirm-state.js";

const mockedCreateDimension = vi.mocked(createDimension);
const mockedCheckConflict = vi.mocked(checkDimensionNameConflict);
const mockedExplain = vi.mocked(validateSqlViaExplain);

const baseParams = {
  datasource_id: "ds-1",
  name: "order_date",
  display_name: "下单日期",
  sql_expression: "DATE(order_time)",
  data_type: "date" as const,
  conversation_id: "conv-dim-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  clear("conv-dim-1");
  resetValidationFailures("conv-dim-1");
  mockedCheckConflict.mockReturnValue(null);
  mockedExplain.mockResolvedValue({ valid: true } as any);
  mockedCreateDimension.mockReturnValue({
    id: "dim-1",
    name: "order_date",
    display_name: "下单日期",
    sql_expression: "DATE(order_time)",
    data_type: "date",
    grain: "day",
  } as any);
});

async function runTool(params: any) {
  const tool = createCreateDimensionDraftTool();
  return tool.execute("call-1", params);
}

describe("create_dimension_draft: confirm-state guard (Problem 2)", () => {
  test("refuses when no confirmation exists", async () => {
    const result: any = await runTool(baseParams);

    expect(result.details.created).toBe(false);
    expect(result.details.blocked).toBe("not_confirmed");
    expect(mockedCreateDimension).not.toHaveBeenCalled();
    expect(mockedCheckConflict).not.toHaveBeenCalled();
  });

  test("saves when confirmed", async () => {
    setPending("conv-dim-1", "confirm-1", "save_draft", ["下单日期"]);
    markConfirmed("conv-dim-1", "confirm-1");

    const result: any = await runTool(baseParams);

    expect(result.details.created).toBe(true);
    expect(result.details.dimension_id).toBe("dim-1");
    expect(mockedCreateDimension).toHaveBeenCalledTimes(1);
    expect(result.details.data_type).toBe("date");
  });

  test("without conversation_id, guard is bypassed (backward compat)", async () => {
    const { conversation_id, ...rest } = baseParams;
    const result: any = await runTool(rest);
    expect(result.details.created).toBe(true);
    expect(mockedCreateDimension).toHaveBeenCalled();
  });
});

describe("create_dimension_draft: conflict check (Problem 3)", () => {
  beforeEach(() => {
    setPending("conv-dim-1", "confirm-1", "save_draft", []);
    markConfirmed("conv-dim-1", "confirm-1");
  });

  test("refuses on name conflict", async () => {
    mockedCheckConflict.mockReturnValue({
      id: "existing-dim",
      display_name: "已有下单日期",
      status: "published",
    } as any);

    const result: any = await runTool(baseParams);

    expect(result.details.created).toBe(false);
    expect(result.details.conflict).toBe(true);
    expect(mockedCreateDimension).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("已存在");
  });
});

describe("create_dimension_draft: conditional EXPLAIN (Problem 3)", () => {
  beforeEach(() => {
    setPending("conv-dim-1", "confirm-1", "save_draft", []);
    markConfirmed("conv-dim-1", "confirm-1");
  });

  test("bare expression (no SELECT) skips EXPLAIN and creates directly", async () => {
    const result: any = await runTool(baseParams);

    expect(result.details.created).toBe(true);
    expect(mockedExplain).not.toHaveBeenCalled();
    expect(mockedCreateDimension).toHaveBeenCalledTimes(1);
  });

  test("expression containing SELECT triggers EXPLAIN validation", async () => {
    const params = {
      ...baseParams,
      sql_expression: "SELECT MAX(order_time) FROM orders",
    };
    const result: any = await runTool(params);

    expect(result.details.created).toBe(true);
    expect(mockedExplain).toHaveBeenCalledWith(
      "ds-1",
      "SELECT MAX(order_time) FROM orders"
    );
  });

  test("expression containing SELECT that fails EXPLAIN is refused", async () => {
    mockedExplain.mockResolvedValue({ valid: false, error: "syntax error" } as any);

    const params = {
      ...baseParams,
      sql_expression: "SELECT BAD(col) FROM orders",
    };
    const result: any = await runTool(params);

    expect(result.details.created).toBe(false);
    expect(result.details.validation_error).toBe("syntax error");
    expect(mockedCreateDimension).not.toHaveBeenCalled();
  });
});
