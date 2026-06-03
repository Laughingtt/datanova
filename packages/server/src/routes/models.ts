import { Hono } from "hono";
import { getProviders, getModels, getEnvApiKey } from "@earendil-works/pi-ai";

const app = new Hono();

/**
 * GET /api/models
 *
 * Returns available LLM providers and models.
 * Only includes providers that have a configured API key in the environment.
 */
app.get("/", (c) => {
  const providers = getProviders();

  const result = providers
    .filter((provider) => {
      // Only show providers with a configured API key
      const key = getEnvApiKey(provider);
      return !!key;
    })
    .map((provider) => {
      const models = getModels(provider);
      return {
        provider,
        models: models.map((m) => ({
          id: m.id,
          name: m.name,
          contextWindow: m.contextWindow,
        })),
      };
    });

  return c.json(result);
});

export default app;
