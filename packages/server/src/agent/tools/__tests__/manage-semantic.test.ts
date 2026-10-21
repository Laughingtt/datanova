import { describe, test, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the metric-management tools (update/delete metric, dimension and
 * semantic model). These mirror the operations available on the 指标管理 page
 * and share the same confirm-state guard as the create tools.
 */

vi.mock("../../../store.js", () => ({
  getMetric: vi.fn(),
  checkMetricNameConflict: vi.fn(),
  updateMetric: vi.fn(),
  deleteMetric: vi.fn(),
  getDimension: vi.fn(),
  checkDimensionNameConflict: vi.fn(),
  updateDimension: vi.fn(),
  deleteDimension: vi.fn(),
  getModel: vi.fn(),
  listModels: vi.fn(),
  listMetrics: vi.fn(),
  listDimensions: vi.fn(),
  updateModel: vi.fn(),
  deleteModel: vi.fn(),
}));

vi.mock("../../../mysql/executor.js", () => ({
  validateSqlViaExplain: vi.fn(),
}));

vi.mock("../sql-normalize.js", () => ({
  normalizeSql: (s: string) => s,
}));

import {
  getMetric, checkMetricNameConflict, updateMetric, deleteMetric,
  getDimension, checkDimensionNameConflict, updateDimension, deleteDimension,
  getModel, listModels, listMetrics, listDimensions, updateModel, deleteModel,
} from "../../../store.js";
import { validateSqlViaExplain } from "../../../mysql/executor.js";
import { createUpdateMetricTool } from "../update-metric.js";
import { createDeleteMetricTool } from "../delete-metric.js";
import { createUpdateDimensionTool } from "../update-dimension.js";
import { createDeleteDimensionTool } from "../delete-dimension.js";
import { createListSemanticDefinitionsTool } from "../list-semantic-definitions.js";
import { createUpdateSemanticModelTool } from "../update-semantic-model.js";
import { createDeleteSemanticModelTool } from "../delete-semantic-model.js";
import { setPending, markConfirmed, clear } from "../../confirm-state.js";

const mocked = {
  getMetric: vi.mocked(getMetric),
  checkMetricNameConflict: vi.mocked(checkMetricNameConflict),
  updateMetric: vi.mocked(updateMetric),
  deleteMetric: vi.mocked(deleteMetric),
  getDimension: vi.mocked(getDimension),
  checkDimensionNameConflict: vi.mocked(checkDimensionNameConflict),
  updateDimension: vi.mocked(updateDimension),
  deleteDimension: vi.mocked(deleteDimension),
  getModel: vi.mocked(getModel),
  listModels: vi.mocked(listModels),
  listMetrics: vi.mocked(listMetrics),
  listDimensions: vi.mocked(listDimensions),
  updateModel: vi.mocked(updateModel),
  deleteModel: vi.mocked(deleteModel),
  explain: vi.mocked(validateSqlViaExplain),
};

const CONV = "conv-manage-1";
const DS = "ds-1";

const existingMetric = {
  id: "metric-1",
  datasource_id: DS,
  name: "order_count",
  display_name: "订单数量",
  description: "",
  sql: "SELECT COUNT(*) AS cnt FROM orders",
  dimensions: "[]",
  default_granularity: null,
  unit: null,
  category: null,
  aliases: "[]",
  metric_type: "atomic",
  business_context: "",
  calculation_logic: "",
  applicable_scenarios: "",
  data_quality_notes: "",
  default_sort: null,
  status: "draft",
  version: 1,
  created_by: "agent",
  agent_session_id: null,
  validation_status: "passed",
  validation_result: null,
  created_at: "",
  updated_at: "",
} as any;

const existingDimension = {
  id: "dim-1",
  datasource_id: DS,
  name: "order_month",
  display_name: "订单月份",
  sql_expression: "DATE_FORMAT(created_at, '%Y-%m')",
  data_type: "date",
  hierarchy: null,
  values: null,
  status: "draft",
  grain: "month",
  date_column: "created_at",
  description: "",
  is_enum_dict: false,
  created_by: "agent",
  agent_session_id: null,
  created_at: "",
  updated_at: "",
} as any;

const existingModel = {
  id: "model-1",
  datasource_id: DS,
  name: "order_model",
  description: "",
  base_table: "orders",
  joins: "[]",
  metrics: "[]",
  dimensions: "[]",
  status: "draft",
  created_at: "",
  updated_at: "",
} as any;

function confirm(): void {
  setPending(CONV, "confirm-1", "modify", ["test"]);
  markConfirmed(CONV, "confirm-1");
}

beforeEach(() => {
  vi.clearAllMocks();
  clear(CONV);
  mocked.checkMetricNameConflict.mockReturnValue(existingMetric);
  mocked.getMetric.mockReturnValue(existingMetric);
  mocked.updateMetric.mockReturnValue(existingMetric);
  mocked.deleteMetric.mockReturnValue(true);
  mocked.checkDimensionNameConflict.mockReturnValue(existingDimension);
  mocked.getDimension.mockReturnValue(existingDimension);
  mocked.updateDimension.mockReturnValue(existingDimension);
  mocked.deleteDimension.mockReturnValue(true);
  mocked.getModel.mockReturnValue(existingModel);
  mocked.listModels.mockReturnValue([existingModel] as any);
  mocked.listMetrics.mockReturnValue([existingMetric] as any);
  mocked.listDimensions.mockReturnValue([existingDimension] as any);
  mocked.updateModel.mockReturnValue(existingModel);
  mocked.deleteModel.mockReturnValue(true);
  mocked.explain.mockResolvedValue({ valid: true } as any);
  // Avoid name-conflict false positives for renames.
  mocked.checkMetricNameConflict.mockImplementation(((_ds: string, name: string) =>
    name === existingMetric.name ? existingMetric : null) as any);
  mocked.checkDimensionNameConflict.mockImplementation(((_ds: string, name: string) =>
    name === existingDimension.name ? existingDimension : null) as any);
});

describe("write tools share the confirm-state guard", () => {
  test("update_metric refuses without confirmation", async () => {
    const tool = createUpdateMetricTool();
    const result: any = await tool.execute("call", { datasource_id: DS, name: "order_count", status: "published", conversation_id: CONV });

    expect(result.details.blocked).toBe("not_confirmed");
    expect(mocked.updateMetric).not.toHaveBeenCalled();
  });

  test("delete_metric refuses without confirmation", async () => {
    const tool = createDeleteMetricTool();
    const result: any = await tool.execute("call", { datasource_id: DS, name: "order_count", conversation_id: CONV });

    expect(result.details.blocked).toBe("not_confirmed");
    expect(mocked.deleteMetric).not.toHaveBeenCalled();
  });

  test("update_dimension refuses without confirmation", async () => {
    const tool = createUpdateDimensionTool();
    const result: any = await tool.execute("call", { datasource_id: DS, name: "order_month", status: "published", conversation_id: CONV });

    expect(result.details.blocked).toBe("not_confirmed");
    expect(mocked.updateDimension).not.toHaveBeenCalled();
  });

  test("delete_dimension refuses without confirmation", async () => {
    const tool = createDeleteDimensionTool();
    const result: any = await tool.execute("call", { datasource_id: DS, name: "order_month", conversation_id: CONV });

    expect(result.details.blocked).toBe("not_confirmed");
    expect(mocked.deleteDimension).not.toHaveBeenCalled();
  });

  test("update_semantic_model refuses without confirmation", async () => {
    const tool = createUpdateSemanticModelTool();
    const result: any = await tool.execute("call", { datasource_id: DS, name: "order_model", status: "published", conversation_id: CONV });

    expect(result.details.blocked).toBe("not_confirmed");
    expect(mocked.updateModel).not.toHaveBeenCalled();
  });

  test("delete_semantic_model refuses without confirmation", async () => {
    const tool = createDeleteSemanticModelTool();
    const result: any = await tool.execute("call", { datasource_id: DS, name: "order_model", conversation_id: CONV });

    expect(result.details.blocked).toBe("not_confirmed");
    expect(mocked.deleteModel).not.toHaveBeenCalled();
  });
});

describe("update_metric", () => {
  test("publishes a metric after confirmation", async () => {
    confirm();
    mocked.updateMetric.mockReturnValue({ ...existingMetric, status: "published" } as any);

    const tool = createUpdateMetricTool();
    const result: any = await tool.execute("call", { datasource_id: DS, name: "order_count", status: "published", conversation_id: CONV });

    expect(result.details.updated).toBe(true);
    expect(result.details.status).toBe("published");
    expect(result.details.previous_status).toBe("draft");
    expect(mocked.updateMetric).toHaveBeenCalledWith("metric-1", { status: "published" });
    expect(result.content[0].text).toContain("已发布");
  });

  test("validates new SQL before saving", async () => {
    confirm();
    mocked.explain.mockResolvedValue({ valid: false, error: "bad column" } as any);

    const tool = createUpdateMetricTool();
    const result: any = await tool.execute("call", {
      datasource_id: DS, name: "order_count", sql: "SELECT bad FROM orders", conversation_id: CONV,
    });

    expect(result.details.validation_error).toBe("bad column");
    expect(mocked.updateMetric).not.toHaveBeenCalled();
  });

  test("maps editable fields like the metrics page", async () => {
    confirm();
    const tool = createUpdateMetricTool();
    await tool.execute("call", {
      datasource_id: DS,
      name: "order_count",
      display_name: "订单数",
      unit: "单",
      category: "交易",
      dimensions: ["order_month"],
      aliases: ["单量"],
      status: "deprecated",
      conversation_id: CONV,
    });

    expect(mocked.updateMetric).toHaveBeenCalledWith("metric-1", {
      display_name: "订单数",
      unit: "单",
      category: "交易",
      dimensions: JSON.stringify(["order_month"]),
      aliases: JSON.stringify(["单量"]),
      status: "deprecated",
    });
  });

  test("reports a missing metric", async () => {
    confirm();
    mocked.checkMetricNameConflict.mockReturnValue(null as any);
    const tool = createUpdateMetricTool();
    const result: any = await tool.execute("call", { datasource_id: DS, name: "nope", status: "published", conversation_id: CONV });

    expect(result.details.not_found).toBe(true);
    expect(result.isError).toBe(true);
  });
});

describe("delete_metric / delete_dimension", () => {
  test("deletes a metric after confirmation", async () => {
    confirm();
    const tool = createDeleteMetricTool();
    const result: any = await tool.execute("call", { datasource_id: DS, name: "order_count", conversation_id: CONV });

    expect(result.details.deleted).toBe(true);
    expect(mocked.deleteMetric).toHaveBeenCalledWith("metric-1");
  });

  test("deletes a dimension after confirmation", async () => {
    confirm();
    const tool = createDeleteDimensionTool();
    const result: any = await tool.execute("call", { datasource_id: DS, name: "order_month", conversation_id: CONV });

    expect(result.details.deleted).toBe(true);
    expect(mocked.deleteDimension).toHaveBeenCalledWith("dim-1");
  });
});

describe("list_semantic_definitions", () => {
  test("includes drafts (unlike lookup_semantic_layer)", async () => {
    const tool = createListSemanticDefinitionsTool();
    const result: any = await tool.execute("call", { datasource_id: DS });

    expect(result.details.total).toBe(3);
    expect(result.details.metrics[0].status).toBe("draft");
    expect(result.content[0].text).toContain("order_count");
    expect(result.content[0].text).toContain("order_month");
    expect(result.content[0].text).toContain("order_model");
  });

  test("filters by type, status and keyword", async () => {
    const tool = createListSemanticDefinitionsTool();

    const published: any = await tool.execute("call", { datasource_id: DS, status: "published" });
    expect(published.details.total).toBe(0);

    const onlyDims: any = await tool.execute("call", { datasource_id: DS, type: "dimension" });
    expect(onlyDims.details.metrics).toHaveLength(0);
    expect(onlyDims.details.dimensions).toHaveLength(1);

    const keyword: any = await tool.execute("call", { datasource_id: DS, keyword: "订单数" });
    expect(keyword.details.total).toBe(1);
    expect(keyword.details.metrics[0].name).toBe("order_count");
  });
});

describe("update_dimension / update_semantic_model", () => {
  test("publishes a dimension", async () => {
    confirm();
    mocked.updateDimension.mockReturnValue({ ...existingDimension, status: "published" } as any);
    const tool = createUpdateDimensionTool();
    const result: any = await tool.execute("call", { datasource_id: DS, name: "order_month", status: "published", conversation_id: CONV });

    expect(result.details.updated).toBe(true);
    expect(mocked.updateDimension).toHaveBeenCalledWith("dim-1", { status: "published" });
  });

  test("publishes a semantic model and serializes joins", async () => {
    confirm();
    mocked.updateModel.mockReturnValue({ ...existingModel, status: "published" } as any);
    const tool = createUpdateSemanticModelTool();
    const result: any = await tool.execute("call", {
      datasource_id: DS,
      name: "order_model",
      joins: [{ table: "users", on: "orders.user_id = users.id" }],
      status: "published",
      conversation_id: CONV,
    });

    expect(result.details.updated).toBe(true);
    expect(mocked.updateModel).toHaveBeenCalledWith("model-1", {
      joins: JSON.stringify([{ table: "users", on: "orders.user_id = users.id", type: "LEFT" }]),
      status: "published",
    });
  });

  test("deletes a semantic model", async () => {
    confirm();
    const tool = createDeleteSemanticModelTool();
    const result: any = await tool.execute("call", { datasource_id: DS, name: "order_model", conversation_id: CONV });

    expect(result.details.deleted).toBe(true);
    expect(mocked.deleteModel).toHaveBeenCalledWith("model-1");
  });
});
