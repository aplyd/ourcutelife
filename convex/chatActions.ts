"use node";

import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";

const systemPrompt = `You are the invoked relationship coach inside Our Cute Life.
You are not a therapist, not a judge, and not a surveillance layer.
Help the user say the thing clearly, kindly, and honestly.
Be concise, concrete, and emotionally mature.
Avoid therapy cosplay, diagnosis, manipulation, blame, and generic fluff.
If the user asks for a rephrase, return only the message they could send unless a safety caveat is essential.`;

function userPrompt(mode: "coach" | "rephrase", prompt: string) {
  if (mode === "rephrase") {
    return `Rewrite this into a message I can send my partner. Keep it honest, calm, specific, and not over-polished.\n\n${prompt.replace(/^rephrase this before i send it:\s*/i, "")}`;
  }

  return `Respond as the relationship coach. Help me understand what to say or ask next. Be brief and useful.\n\n${prompt}`;
}

export const respondToCoachPrompt = internalAction({
  args: {
    coupleId: v.id("couples"),
    userId: v.id("users"),
    prompt: v.string(),
    mode: v.union(v.literal("coach"), v.literal("rephrase")),
  },
  handler: async (ctx, args) => {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      await ctx.runMutation(internal.chat.insertAiMessage, {
        coupleId: args.coupleId,
        text: "Coach is not configured yet. Add OPENAI_API_KEY to Convex env vars, then try again.",
      });
      return { ok: false, error: "missing_openai_api_key" };
    }

    try {
      const openai = createOpenAI({ apiKey });
      const result = await generateText({
        model: openai(env.OPENAI_MODEL ?? "gpt-4o-mini"),
        system: systemPrompt,
        prompt: userPrompt(args.mode, args.prompt),
        temperature: 0.4,
        maxOutputTokens: 500,
      });

      await ctx.runMutation(internal.chat.insertAiMessage, {
        coupleId: args.coupleId,
        text: result.text,
      });
      return { ok: true };
    } catch (error) {
      await ctx.runMutation(internal.chat.insertAiMessage, {
        coupleId: args.coupleId,
        text: "Coach hit an AI error. Try again in a minute.",
      });
      return { ok: false, error: error instanceof Error ? error.message : "unknown" };
    }
  },
});
