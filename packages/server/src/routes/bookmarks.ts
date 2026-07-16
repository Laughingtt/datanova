import { Hono } from "hono";
import { listBookmarks, createBookmark, deleteBookmark } from "../store.js";
import { executeSql } from "../mysql/executor.js";

export function createBookmarkRoutes(): Hono {
  const app = new Hono();

  // GET bookmarks
  app.get("/api/datasources/:dsId/bookmarks", (c) => {
    const dsId = c.req.param("dsId");
    return c.json(listBookmarks(dsId));
  });

  // POST create bookmark (title + sql + optional description)
  app.post("/api/datasources/:dsId/bookmarks", async (c) => {
    const dsId = c.req.param("dsId");
    const { title, sql, description } = await c.req.json();
    if (!title || !sql) {
      return c.json({ error: "title and sql are required" }, 400);
    }
    const bm = createBookmark({
      datasource_id: dsId,
      title,
      sql,
      description: description ?? null,
      sort_order: 0,
    });
    return c.json(bm, 201);
  });

  // DELETE bookmark
  app.delete("/api/datasources/:dsId/bookmarks/:id", (c) => {
    const id = c.req.param("id");
    const ok = deleteBookmark(id);
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.json({ success: true });
  });

  // POST execute bookmark's SQL
  app.post("/api/datasources/:dsId/bookmarks/:id/execute", async (c) => {
    const id = c.req.param("id");
    const bookmark = listBookmarks(c.req.param("dsId")).find(b => b.id === id);
    if (!bookmark) return c.json({ error: "Bookmark not found" }, 404);

    try {
      const result = await executeSql(c.req.param("dsId"), bookmark.sql, { timeout: 30000, rowLimit: 500 });
      return c.json(result);
    } catch (err: any) {
      return c.json({ error: err.message || "Query execution failed" }, 500);
    }
  });

  return app;
}
