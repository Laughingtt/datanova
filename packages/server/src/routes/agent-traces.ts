import { Hono } from "hono";
import { listAgentTraces, getAgentTrace, getAgentTraceStats } from "../store.js";
import { inferAgentChain } from "../agent/tools/infer-agent-chain.js";

/**
 * Agent trace routes — provides administrator observability into agent decisions.
 * Factory route registered at "/" root in index.ts.
 */
export function createAgentTraceRoutes(): Hono {
  const app = new Hono();

  // GET /api/agent-traces — list traces with optional filters
  app.get("/api/agent-traces", (c) => {
    const datasourceId = c.req.query("datasourceId") || undefined;
    const agentType = c.req.query("agentType") || undefined;
    const selfCorrected = c.req.query("selfCorrected") === "1";
    const noSemanticLayer = c.req.query("noSemanticLayer") === "1";
    const dateFrom = c.req.query("dateFrom") || undefined;
    const dateTo = c.req.query("dateTo") || undefined;
    const limit = parseInt(c.req.query("limit") || "50", 10);
    const offset = parseInt(c.req.query("offset") || "0", 10);

    const traces = listAgentTraces({
      datasourceId,
      agentType,
      selfCorrected,
      noSemanticLayer,
      dateFrom,
      dateTo,
      limit,
      offset,
    });
    return c.json(traces);
  });

  // GET /api/agent-traces/stats — aggregated analytics
  app.get("/api/agent-traces/stats", (c) => {
    const datasourceId = c.req.query("datasourceId") || undefined;
    const stats = getAgentTraceStats(datasourceId);
    return c.json(stats);
  });

  // GET /api/agent-traces/:id — single trace detail
  app.get("/api/agent-traces/:id", (c) => {
    const id = c.req.param("id");
    const trace = getAgentTrace(id);
    if (!trace) {
      return c.json({ error: "Trace not found" }, 404);
    }
    return c.json(trace);
  });

  // GET /api/datasources/:dsId/agent-traces — traces scoped to a datasource
  app.get("/api/datasources/:dsId/agent-traces", (c) => {
    const dsId = c.req.param("dsId");
    const selfCorrected = c.req.query("selfCorrected") === "1";
    const noSemanticLayer = c.req.query("noSemanticLayer") === "1";
    const limit = parseInt(c.req.query("limit") || "50", 10);

    const traces = listAgentTraces({
      datasourceId: dsId,
      selfCorrected,
      noSemanticLayer,
      limit,
    });
    return c.json(traces);
  });

  // GET /api/datasources/:dsId/agent-traces/stats — stats scoped to a datasource
  app.get("/api/datasources/:dsId/agent-traces/stats", (c) => {
    const dsId = c.req.param("dsId");
    const stats = getAgentTraceStats(dsId);
    return c.json(stats);
  });

  // POST /api/agent-traces/:id/infer-chain — reconstruct an agent's decision
  // chain from its trace. Administrator-facing; powers the "审计链路" button.
  // Body: { focus?: string }
  app.post("/api/agent-traces/:id/infer-chain", async (c) => {
    const id = c.req.param("id");
    let focus: string | undefined;
    try {
      const body = await c.req.json();
      focus = typeof body?.focus === "string" ? body.focus : undefined;
    } catch { /* no body or invalid JSON — focus stays undefined */ }

    try {
      const result = await inferAgentChain(id, focus);
      if (result.isError) {
        return c.json({ error: result.text ?? "Failed to infer chain" }, 404);
      }
      return c.json(result);
    } catch (err) {
      return c.json({ error: `Failed to infer chain: ${(err as Error).message}` }, 500);
    }
  });

  return app;
}
