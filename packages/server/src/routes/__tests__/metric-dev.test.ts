import { describe, it, expect, beforeAll } from "vitest";
import { agentRegistry } from "../../agent/agent-registry.js";
import { initAgentFramework } from "../../agent/agent-registration.js";

describe("Agent Registry", () => {
  beforeAll(() => {
    initAgentFramework();
  });

  it("should have query and metric_dev agents registered", () => {
    const agents = agentRegistry.listAgents();
    expect(agents.length).toBeGreaterThanOrEqual(2);
    expect(agents.find(a => a.id === "query")).toBeDefined();
    expect(agents.find(a => a.id === "metric_dev")).toBeDefined();
  });

  it("metric_dev agent should have 10 tools", () => {
    const tools = agentRegistry.getAgentTools("metric_dev");
    expect(tools.length).toBe(10);
    const toolNames = tools.map(t => t.name);
    expect(toolNames).toContain("discover_schema");
    expect(toolNames).toContain("execute_sql");
    expect(toolNames).toContain("validate_and_test_metric");
    expect(toolNames).toContain("check_metric_conflict");
    expect(toolNames).toContain("create_metric_draft");
    expect(toolNames).toContain("create_dimension_draft");
    expect(toolNames).toContain("request_user_confirm");
  });

  it("query agent should have 6 tools", () => {
    const tools = agentRegistry.getAgentTools("query");
    expect(tools.length).toBe(6);
  });

  it("should throw for unknown agent", async () => {
    await expect(() => agentRegistry.createHarness("unknown", { datasourceId: "ds-123" })).rejects.toThrow("Agent not found");
  });

  it("request_user_confirm returns terminate:true (Problem 2 mechanism guard)", async () => {
    const tools = agentRegistry.getAgentTools("metric_dev");
    const confirmTool = tools.find(t => t.name === "request_user_confirm");
    expect(confirmTool).toBeDefined();

    const result: any = await confirmTool!.execute("call-1", {
      title: "保存指标草稿",
      items: ["月度营收"],
      action_type: "save_draft",
    });

    // The terminate flag halts the agent loop after this tool batch so the
    // LLM cannot call a save tool in a subsequent batch before confirmation.
    expect(result.terminate).toBe(true);
    expect(result.details.confirmAction).toBeDefined();
    expect(result.details.confirmAction.id).toMatch(/^confirm-/);
    expect(result.details.confirmAction.title).toBe("保存指标草稿");
    expect(result.details.confirmAction.actionType).toBe("save_draft");
  });

  it("save tools accept an optional conversation_id parameter (Problem 2/4)", () => {
    const tools = agentRegistry.getAgentTools("metric_dev");
    const metricTool = tools.find(t => t.name === "create_metric_draft");
    const dimensionTool = tools.find(t => t.name === "create_dimension_draft");
    const validateTool = tools.find(t => t.name === "validate_and_test_metric");

    // TypeBox schemas expose properties as a plain object.
    const metricProps = (metricTool!.parameters as any).properties;
    const dimensionProps = (dimensionTool!.parameters as any).properties;
    const validateProps = (validateTool!.parameters as any).properties;

    expect(metricProps.conversation_id).toBeDefined();
    expect(dimensionProps.conversation_id).toBeDefined();
    expect(validateProps.conversation_id).toBeDefined();
  });
});
