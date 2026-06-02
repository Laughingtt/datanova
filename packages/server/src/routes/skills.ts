import { Hono } from "hono";
import { listSkillFiles, getSkillContent, saveSkill, deleteSkill } from "../agent/skill-manager.js";

const app = new Hono();

// List all skills
app.get("/", (c) => {
  const skills = listSkillFiles();
  return c.json(skills.map((s) => ({ name: s.name, path: s.path })));
});

// Get skill content
app.get("/:name", (c) => {
  const name = c.req.param("name");
  const content = getSkillContent(name);
  if (!content) return c.json({ error: "Skill not found" }, 404);
  return c.json({ name, content });
});

// Create or update skill
app.put("/:name", async (c) => {
  const name = c.req.param("name");
  const body = await c.req.json();

  if (!body.content) {
    return c.json({ error: "Missing required field: content" }, 400);
  }

  const skill = saveSkill(name, body.content);
  return c.json({ name: skill.name, path: skill.path });
});

// Delete skill
app.delete("/:name", (c) => {
  const name = c.req.param("name");
  const deleted = deleteSkill(name);
  if (!deleted) return c.json({ error: "Skill not found" }, 404);
  return c.json({ success: true });
});

export default app;
