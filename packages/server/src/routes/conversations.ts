import { Hono } from "hono";
import {
  listConversations,
  createConversation,
  deleteConversation,
  updateConversationTitle,
  listMessages,
} from "../store.js";
import { removeHarness } from "../agent/harness-factory.js";

const app = new Hono();

// List conversations
app.get("/", (c) => {
  const datasourceId = c.req.query("datasourceId");
  const conversations = listConversations(datasourceId);
  return c.json(conversations);
});

// Create conversation
app.post("/", async (c) => {
  const body = await c.req.json();

  const conversation = createConversation({
    title: body.title,
    datasourceId: body.datasourceId,
  });

  return c.json(conversation, 201);
});

// Get conversation messages
app.get("/:id/messages", (c) => {
  const id = c.req.param("id");
  const messages = listMessages(id);
  return c.json(messages);
});

// Update conversation title
app.put("/:id/title", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  if (!body.title) {
    return c.json({ error: "Missing required field: title" }, 400);
  }

  const conversation = updateConversationTitle(id, body.title);
  if (!conversation) return c.json({ error: "Not found" }, 404);

  return c.json(conversation);
});

// Delete conversation
app.delete("/:id", async (c) => {
  const id = c.req.param("id");

  // Clean up harness if exists
  await removeHarness(id);

  const deleted = deleteConversation(id);
  if (!deleted) return c.json({ error: "Not found" }, 404);

  return c.json({ success: true });
});

export default app;