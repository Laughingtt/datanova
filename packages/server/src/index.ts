import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createNodeWebSocket } from "@hono/node-ws";
import { ensureDataDirs } from "./config.js";
import datasourcesRoutes from "./routes/datasources.js";
import schemasRoutes from "./routes/schemas.js";
import skillsRoutes from "./routes/skills.js";
import conversationsRoutes from "./routes/conversations.js";
import { createChatHandler } from "./ws/chat-handler.js";

// Ensure data directories exist
ensureDataDirs();

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

serve(
  {
    fetch: app.fetch,
    port,
    upgrade: injectWebSocket,
  },
  () => {
    console.log(`DataNova server running on http://localhost:${port}`);
  }
);

export { app };
