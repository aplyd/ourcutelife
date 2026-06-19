import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { getCurrentAppUser } from "./auth";

const toneValidator = v.union(v.literal("good"), v.literal("bad"), v.literal("mixed"));

async function requireMembership(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const membership = await ctx.db
    .query("coupleMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (!membership) throw new Error("Pair with your partner before logging moments.");

  const members = await ctx.db
    .query("coupleMembers")
    .withIndex("by_couple", (q) => q.eq("coupleId", membership.coupleId))
    .collect();
  if (members.length < 2) throw new Error("Pair with your partner before logging moments.");

  return membership;
}

function cleanOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const listMine = query({
  args: {},
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) throw new Error("Not signed in.");
    const membership = await requireMembership(ctx, user._id);

    return await ctx.db
      .query("moments")
      .withIndex("by_couple_and_author_and_happened_at", (q) =>
        q.eq("coupleId", membership.coupleId).eq("authorUserId", user._id),
      )
      .order("desc")
      .take(50);
  },
});

export const getMine = query({
  args: {
    momentId: v.id("moments"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) throw new Error("Not signed in.");
    await requireMembership(ctx, user._id);

    const moment = await ctx.db.get(args.momentId);
    if (!moment || moment.authorUserId !== user._id) return null;
    return moment;
  },
});

export const create = mutation({
  args: {
    happenedAt: v.number(),
    summary: v.string(),
    feeling: v.string(),
    tone: toneValidator,
    partnerCouldDo: v.optional(v.string()),
    authorCouldDo: v.optional(v.string()),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) throw new Error("Not signed in.");
    const membership = await requireMembership(ctx, user._id);

    const summary = args.summary.trim();
    const feeling = args.feeling.trim();
    if (!summary) throw new Error("Write what happened before saving.");
    if (!feeling) throw new Error("Write how it made you feel before saving.");
    if (!Number.isFinite(args.happenedAt)) throw new Error("Moment date is invalid.");

    const needsRepairFields = args.tone === "bad" || args.tone === "mixed";
    const partnerCouldDo = cleanOptionalText(args.partnerCouldDo);
    const authorCouldDo = cleanOptionalText(args.authorCouldDo);

    const tagSet = new Set(args.tags.map((tag) => tag.trim()).filter(Boolean));

    return await ctx.db.insert("moments", {
      coupleId: membership.coupleId,
      authorUserId: user._id,
      happenedAt: args.happenedAt,
      createdAt: Date.now(),
      summary,
      feeling,
      tone: args.tone,
      partnerCouldDo: needsRepairFields ? partnerCouldDo : undefined,
      authorCouldDo: needsRepairFields ? authorCouldDo : undefined,
      tags: Array.from(tagSet).slice(0, 8),
    });
  },
});
