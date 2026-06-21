import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { getCurrentAppUser } from "./auth";

async function requireSession(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentAppUser(ctx);
  if (!user) throw new Error("Not signed in.");
  const membership = await ctx.db
    .query("coupleMembers")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .first();
  if (!membership) throw new Error("Pair with your partner first.");
  return { user, membership };
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function stableIndex(seed: string, length: number): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1)
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return hash % length;
}

const promptBank = [
  {
    principle: "appreciation",
    prompt:
      "What is one specific thing your partner did recently that you want them to know mattered?",
  },
  {
    principle: "love maps",
    prompt:
      "What is one small detail about your inner world this week that your partner might not know yet?",
  },
  {
    principle: "bids for connection",
    prompt:
      "What is one tiny way your partner could get your attention or affection today that would land well?",
  },
  {
    principle: "repair",
    prompt:
      "Is there a small moment from this week that would feel better with a quick repair or clarification?",
  },
  {
    principle: "stress reducing conversation",
    prompt:
      "What stress are you carrying that you do not need your partner to fix, only understand?",
  },
  {
    principle: "shared meaning",
    prompt: "What is one little ritual you want more of in our life together?",
  },
];

const weeklyGames = [
  {
    title: "Bid bingo",
    description:
      "Each of you makes three tiny bids for connection this week. Notice and accept as many as you can.",
    principle: "bids for connection",
  },
  {
    title: "Two appreciations, one ask",
    description:
      "Trade two specific appreciations before making one small request. Keep the ask behavioral and doable.",
    principle: "positive sentiment + gentle startup",
  },
  {
    title: "Love map lightning round",
    description:
      "Take turns asking five quick questions about current stress, hopes, preferences, and tiny joys.",
    principle: "love maps",
  },
  {
    title: "Repair phrase practice",
    description:
      "Each partner picks one repair phrase they are willing to use this week: 'Can I try that again?' counts.",
    principle: "repair attempts",
  },
];

const quizzes = [
  {
    title: "Do I know your current stress?",
    question:
      "What is one thing your partner is dealing with this week that deserves more tenderness?",
    principle: "stress reducing conversation",
  },
  {
    title: "Tiny joy check",
    question: "What small thing would make your partner's next 24 hours 5% better?",
    principle: "turning toward",
  },
  {
    title: "Ritual audit",
    question:
      "Which ritual should you protect this week: greeting, goodbye, meal, bedtime, or weekend reset?",
    principle: "shared meaning",
  },
  {
    title: "Repair readiness",
    question:
      "When conflict gets tense, what helps your partner soften: space, touch, humor, clarity, or reassurance?",
    principle: "repair attempts",
  },
];

function chooseGeneratedContent(promptDate: string, tags: string[]) {
  const seed = `${promptDate}:${tags.join(",")}`;
  const tagText = tags[0] ? ` Recent theme: ${tags[0]}.` : "";
  const prompt = promptBank[stableIndex(seed, promptBank.length)];
  const weeklyGame = weeklyGames[stableIndex(`${seed}:game`, weeklyGames.length)];
  const quiz = quizzes[stableIndex(`${seed}:quiz`, quizzes.length)];
  return {
    prompt: `${prompt.prompt}${tagText}`,
    promptPrinciple: prompt.principle,
    weeklyGame,
    quiz,
  };
}

export const today = query({
  args: {},
  handler: async (ctx) => {
    const { user, membership } = await requireSession(ctx);
    const recent = await ctx.db
      .query("moments")
      .withIndex("by_couple_and_author_and_happened_at", (q) =>
        q.eq("coupleId", membership.coupleId).eq("authorUserId", user._id),
      )
      .order("desc")
      .take(10)
      .then((items) => items.filter((item) => !item.deletedAt));
    const tags = Array.from(new Set(recent.flatMap((moment) => moment.tags)));
    const promptDate = todayKey();
    const generated = chooseGeneratedContent(promptDate, tags);
    const responses = await ctx.db
      .query("promptResponses")
      .withIndex("by_couple_and_date", (q) =>
        q.eq("coupleId", membership.coupleId).eq("promptDate", promptDate),
      )
      .collect();
    const ownResponse = responses.find((response) => response.userId === user._id) ?? null;
    const partnerResponse = responses.find((response) => response.userId !== user._id) ?? null;
    const members = await ctx.db
      .query("coupleMembers")
      .withIndex("by_couple", (q) => q.eq("coupleId", membership.coupleId))
      .collect();
    const prompt = ownResponse?.prompt ?? partnerResponse?.prompt ?? generated.prompt;

    return {
      promptDate,
      prompt,
      promptPrinciple: generated.promptPrinciple,
      weeklyTopic: generated.weeklyGame.description,
      weeklyGame: generated.weeklyGame,
      quiz: generated.quiz,
      response: ownResponse?.response ?? null,
      answeredAt: ownResponse?.createdAt ?? null,
      partnerHasAnswered: Boolean(partnerResponse),
      partnerResponse:
        ownResponse && partnerResponse
          ? {
              response: partnerResponse.response,
              answeredAt: partnerResponse.createdAt,
            }
          : null,
      partnerCount: Math.max(0, members.length - 1),
      isRevealed: Boolean(ownResponse && partnerResponse),
    };
  },
});

export const answer = mutation({
  args: {
    promptDate: v.string(),
    prompt: v.string(),
    response: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, membership } = await requireSession(ctx);
    const response = args.response.trim();
    if (!response) throw new Error("Write an answer before saving.");
    if (response.length > 2000) throw new Error("Keep today's answer under 2,000 characters.");
    const existing = await ctx.db
      .query("promptResponses")
      .withIndex("by_user_and_date", (q) =>
        q.eq("userId", user._id).eq("promptDate", args.promptDate),
      )
      .first();
    const now = Date.now();
    const payload = {
      coupleId: membership.coupleId,
      userId: user._id,
      promptDate: args.promptDate,
      prompt: args.prompt,
      response,
      createdAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("promptResponses", payload);
  },
});
