import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { getCurrentAppUser } from "./auth";

async function coupleRows(ctx: MutationCtx, coupleId: Id<"couples">) {
  const [
    pairingCodes,
    moments,
    monthlyReviews,
    coupleChatMessages,
    promptResponses,
    notificationDevices,
    dailyPromptLifecycles,
    dailyPromptCompletions,
    dailyPromptDeliveryAttempts,
    dailyPromptAnswerStarts,
    qualityTimeRequests,
    qualityTimeOptions,
    qualityTimeDecisions,
    qualityTimeOutcomes,
    planIdeas,
    planSwipes,
    planMatches,
    planArchiveVotes,
    datePlans,
    datePlanLikes,
    savedDatePlans,
    datePlanRatings,
  ] = await Promise.all([
    ctx.db
      .query("pairingCodes")
      .withIndex("by_couple", (q) => q.eq("coupleId", coupleId))
      .collect(),
    ctx.db
      .query("moments")
      .filter((q) => q.eq(q.field("coupleId"), coupleId))
      .collect(),
    ctx.db
      .query("monthlyReviews")
      .filter((q) => q.eq(q.field("coupleId"), coupleId))
      .collect(),
    ctx.db
      .query("coupleChatMessages")
      .filter((q) => q.eq(q.field("coupleId"), coupleId))
      .collect(),
    ctx.db
      .query("promptResponses")
      .filter((q) => q.eq(q.field("coupleId"), coupleId))
      .collect(),
    ctx.db
      .query("notificationDevices")
      .filter((q) => q.eq(q.field("coupleId"), coupleId))
      .collect(),
    ctx.db
      .query("dailyPromptLifecycles")
      .filter((q) => q.eq(q.field("coupleId"), coupleId))
      .collect(),
    ctx.db
      .query("dailyPromptCompletions")
      .filter((q) => q.eq(q.field("coupleId"), coupleId))
      .collect(),
    ctx.db
      .query("dailyPromptDeliveryAttempts")
      .filter((q) => q.eq(q.field("coupleId"), coupleId))
      .collect(),
    ctx.db
      .query("dailyPromptAnswerStarts")
      .filter((q) => q.eq(q.field("coupleId"), coupleId))
      .collect(),
    ctx.db
      .query("qualityTimeRequests")
      .filter((q) => q.eq(q.field("coupleId"), coupleId))
      .collect(),
    ctx.db
      .query("qualityTimeOptions")
      .filter((q) => q.eq(q.field("coupleId"), coupleId))
      .collect(),
    ctx.db
      .query("qualityTimeDecisions")
      .filter((q) => q.eq(q.field("coupleId"), coupleId))
      .collect(),
    ctx.db
      .query("qualityTimeOutcomes")
      .filter((q) => q.eq(q.field("coupleId"), coupleId))
      .collect(),
    ctx.db
      .query("planIdeas")
      .filter((q) => q.eq(q.field("coupleId"), coupleId))
      .collect(),
    ctx.db
      .query("planSwipes")
      .filter((q) => q.eq(q.field("coupleId"), coupleId))
      .collect(),
    ctx.db
      .query("planMatches")
      .filter((q) => q.eq(q.field("coupleId"), coupleId))
      .collect(),
    ctx.db
      .query("planArchiveVotes")
      .filter((q) => q.eq(q.field("coupleId"), coupleId))
      .collect(),
    ctx.db
      .query("datePlans")
      .filter((q) => q.eq(q.field("coupleId"), coupleId))
      .collect(),
    ctx.db
      .query("datePlanLikes")
      .filter((q) => q.eq(q.field("coupleId"), coupleId))
      .collect(),
    ctx.db
      .query("savedDatePlans")
      .filter((q) => q.eq(q.field("coupleId"), coupleId))
      .collect(),
    ctx.db
      .query("datePlanRatings")
      .filter((q) => q.eq(q.field("coupleId"), coupleId))
      .collect(),
  ]);

  return [
    ...pairingCodes,
    ...moments,
    ...monthlyReviews,
    ...coupleChatMessages,
    ...promptResponses,
    ...notificationDevices,
    ...dailyPromptCompletions,
    ...dailyPromptDeliveryAttempts,
    ...dailyPromptAnswerStarts,
    ...qualityTimeDecisions,
    ...qualityTimeOutcomes,
    ...qualityTimeOptions,
    ...qualityTimeRequests,
    ...planArchiveVotes,
    ...planSwipes,
    ...planMatches,
    ...datePlanLikes,
    ...savedDatePlans,
    ...datePlanRatings,
    ...datePlans,
    ...planIdeas,
    ...dailyPromptLifecycles,
  ];
}

export const cleanupMySyntheticTestData = mutation({
  args: { confirm: v.boolean() },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) throw new Error("Not signed in.");

    const syntheticUsers = await ctx.db
      .query("users")
      .withIndex("by_auth_user_id", (q) => q.eq("authUserId", `test-partner:${user._id}`))
      .take(2);
    if (syntheticUsers.length > 1) throw new Error("Ambiguous synthetic test user state.");
    const syntheticUser = syntheticUsers[0] ?? null;
    if (
      syntheticUser &&
      (syntheticUser.email !== "test-partner@ourcutelife.local" ||
        syntheticUser.fullName !== "Test Partner")
    ) {
      throw new Error("Synthetic test user identity mismatch.");
    }

    const allowedUserIds = new Set<string>([user._id]);
    if (syntheticUser) allowedUserIds.add(syntheticUser._id);
    const memberships = [
      ...(await ctx.db
        .query("coupleMembers")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect()),
      ...(syntheticUser
        ? await ctx.db
            .query("coupleMembers")
            .withIndex("by_user", (q) => q.eq("userId", syntheticUser._id))
            .collect()
        : []),
    ];
    const coupleIds = [...new Set(memberships.map((membership) => membership.coupleId))];
    const eligibleCoupleIds: Id<"couples">[] = [];
    let preservedCouples = 0;
    let recordCount = 0;

    for (const coupleId of coupleIds) {
      const members = await ctx.db
        .query("coupleMembers")
        .withIndex("by_couple", (q) => q.eq("coupleId", coupleId))
        .take(3);
      if (members.length > 2 || members.some((member) => !allowedUserIds.has(member.userId))) {
        preservedCouples += 1;
        continue;
      }
      const rows = await coupleRows(ctx, coupleId);
      recordCount += rows.length + members.length + ((await ctx.db.get(coupleId)) ? 1 : 0);
      eligibleCoupleIds.push(coupleId);
    }

    const preview = {
      eligibleCouples: eligibleCoupleIds.length,
      preservedCouples,
      syntheticUsers: syntheticUser ? 1 : 0,
      records: recordCount + (syntheticUser ? 1 : 0),
    };
    if (!args.confirm) return { deleted: false as const, ...preview };

    for (const coupleId of eligibleCoupleIds) {
      const rows = await coupleRows(ctx, coupleId);
      for (const row of rows) await ctx.db.delete(row._id);
      const members = await ctx.db
        .query("coupleMembers")
        .withIndex("by_couple", (q) => q.eq("coupleId", coupleId))
        .collect();
      for (const membership of members) await ctx.db.delete(membership._id);
      if (await ctx.db.get(coupleId)) await ctx.db.delete(coupleId);
    }

    if (syntheticUser) {
      const remainingMemberships = await ctx.db
        .query("coupleMembers")
        .withIndex("by_user", (q) => q.eq("userId", syntheticUser._id))
        .take(1);
      if (remainingMemberships.length > 0)
        throw new Error("Synthetic test user still has membership.");
      const pushTokens = await ctx.db
        .query("pushTokens")
        .withIndex("by_user", (q) => q.eq("userId", syntheticUser._id))
        .collect();
      for (const token of pushTokens) await ctx.db.delete(token._id);
      await ctx.db.delete(syntheticUser._id);
    }

    return { deleted: true as const, ...preview };
  },
});
