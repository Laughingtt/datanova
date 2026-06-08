import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createNodeWebSocket } from "@hono/node-ws";
import path from "node:path";
import fs from "node:fs";
import { ensureDataDirs, SKILLS_DIR, APP_DIR } from "./config.js";
import { closeAllPools } from "./mysql/pool.js";
import datasourcesRoutes from "./routes/datasources.js";
import schemasRoutes from "./routes/schemas.js";
import skillsRoutes from "./routes/skills.js";
import conversationsRoutes from "./routes/conversations.js";
import modelsRoutes from "./routes/models.js";
import { createChatHandler } from "./ws/chat-handler.js";
import { saveFeedback, listSqlQueryHistory, listAllSqlQueryHistory } from "./store.js";
import { createSemanticRoutes } from "./routes/semantic.js";
import { createScheduledRoutes } from "./routes/scheduled.js";
import { createDictionaryRoutes } from "./routes/dictionary.js";
import { startScheduler, stopScheduler } from "./scheduler.js";

// Ensure data directories exist
ensureDataDirs();

// Copy sample skill if not already present
const sampleSkillSrc = path.join(process.cwd(), "data", "skills", "bill-query", "SKILL.md");
const sampleSkillDest = path.join(SKILLS_DIR, "bill-query", "SKILL.md");

if (fs.existsSync(sampleSkillSrc) && !fs.existsSync(sampleSkillDest)) {
  fs.mkdirSync(path.join(SKILLS_DIR, "bill-query"), { recursive: true });
  fs.copyFileSync(sampleSkillSrc, sampleSkillDest);
  console.log("Copied sample skill: bill-query");
}

const app = new Hono();

// CORS middleware
app.use("/api/*", cors());

// Health check
app.get("/api/health", (c) => c.json({ status: "ok", version: "0.1.0" }));

// REST API routes
app.route("/api/datasources", datasourcesRoutes);
app.route("/api/schemas", schemasRoutes);
app.route("/api/skills", skillsRoutes);
app.route("/api/conversations", conversationsRoutes);
app.route("/api/models", modelsRoutes);

// Feedback API
app.post("/api/conversations/:convId/messages/:msgId/feedback", async (c) => {
  const convId = c.req.param("convId");
  const msgId = c.req.param("msgId");
  const body = await c.req.json();
  const feedback = saveFeedback({
    message_id: msgId,
    conversation_id: convId,
    rating: body.rating,
    issue_type: body.issue_type ?? null,
    issue_detail: body.issue_detail ?? null,
  });
  return c.json(feedback, 201);
});

// Semantic layer, scheduled queries, data dictionary routes
app.route("/", createSemanticRoutes());
app.route("/", createScheduledRoutes());
app.route("/", createDictionaryRoutes());

// Query history API
app.get("/api/datasources/:dsId/query-history", (c) => {
  const dsId = c.req.param("dsId");
  const limit = parseInt(c.req.query("limit") || "100", 10);
  return c.json(listSqlQueryHistory(dsId, limit));
});

app.get("/api/query-history", (c) => {
  const limit = parseInt(c.req.query("limit") || "200", 10);
  return c.json(listAllSqlQueryHistory(limit));
});

// WebSocket setup
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// WebSocket chat endpoint
app.get(
  "/ws/chat",
  upgradeWebSocket(() => createChatHandler())
);

const port = parseInt(process.env.PORT || "3000", 10);

// Handle EADDRINUSE gracefully (e.g. tsx watch HMR restart)
process.on("uncaughtException", (err: any) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n❌ Port ${port} 已被占用，可能已有 DataNova 实例在运行。`);
    console.error(`   运行 ./scripts/stop.sh 停止，或设置 PORT=xxxx 使用其他端口。\n`);
    process.exit(1);
  }
  throw err;
});

const server = serve(
  {
    fetch: app.fetch,
    port,
  },
  () => {
    console.log(`DataNova server running on http://localhost:${port}`);
    startScheduler();
  }
);

// Inject WebSocket upgrade handler
injectWebSocket(server);

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Shutting down...");
  stopScheduler();
  await closeAllPools();
  server.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  stopScheduler();
  await closeAllPools();
  server.close();
  process.exit(0);
});

export { app };