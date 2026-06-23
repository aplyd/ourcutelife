import { defineApp } from "convex/server";
import { v } from "convex/values";
import betterAuth from "@convex-dev/better-auth/convex.config";

const app = defineApp({
  env: {
    OPENAI_API_KEY: v.string(),
    OPENAI_MODEL: v.optional(v.string()),
  },
});
app.use(betterAuth);

export default app;
