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
import { createChatHandler } from "./ws/chat-handler.js";

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

// WebSocket setup
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// WebSocket chat endpoint
app.get(
  "/ws/chat",
  upgradeWebSocket(() => createChatHandler())
);

const port = parseInt(process.env.PORT || "3000", 10);

const server = serve(
  {
    fetch: app.fetch,
    port,
  },
  () => {
    console.log(`DataNova server running on http://localhost:${port}`);
  }
);

// Inject WebSocket upgrade handler
injectWebSocket(server);

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Shutting down...");
  await closeAllPools();
  server.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  await closeAllPools();
  server.close();
  process.exit(0);
});

export { app };