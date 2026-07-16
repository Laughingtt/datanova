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
});
