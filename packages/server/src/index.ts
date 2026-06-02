import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();
app.get("/api/health", (c) => c.json({ status: "ok" }));

const port = 3000;
serve({ fetch: app.fetch, port }, () => {
  console.log(`DataNova server running on http://localhost:${port}`);
});
