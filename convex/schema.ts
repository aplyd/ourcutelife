import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    authUserId: v.optional(v.string()),
    appleSubject: v.optional(v.string()),
    email: v.optional(v.string()),
    fullName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_auth_user_id", ["authUserId"]),
  couples: defineTable({
    name: v.string(),
    anniversaryDate: v.optional(v.number()),
    createdByUserId: v.id("users"),
    promptTimezone: v.optional(v.string()),
    promptTimezoneUpdatedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),
  coupleMembers: defineTable({
    coupleId: v.id("couples"),
    userId: v.id("users"),
    role: v.literal("partner"),
    joinedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_couple", ["coupleId"])
    .index("by_couple_and_user", ["coupleId", "userId"]),
  pairingCodes: defineTable({
    coupleId: v.id("couples"),
    code: v.string(),
    createdByUserId: v.id("users"),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    usedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_couple", ["coupleId"]),
  moments: defineTable({
    coupleId: v.id("couples"),
    authorUserId: v.id("users"),
    happenedAt: v.number(),
    createdAt: v.number(),
    summary: v.string(),
    feeling: v.string(),
    tone: v.union(v.literal("good"), v.literal("bad"), v.literal("mixed")),
    partnerCouldDo: v.optional(v.string()),
    authorCouldDo: v.optional(v.string()),
    tags: v.array(v.string()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_couple_and_author_and_happened_at", ["coupleId", "authorUserId", "happenedAt"])
    .index("by_couple_and_happened_at", ["coupleId", "happenedAt"]),
  monthlyReviews: defineTable({
    coupleId: v.id("couples"),
    ownerUserId: v.id("users"),
    month: v.string(),
    status: v.union(v.literal("draft"), v.literal("shared"), v.literal("completed")),
    generatedAt: v.number(),
    summary: v.string(),
    highlights: v.array(v.string()),
    patterns: v.array(v.string()),
    questions: v.array(v.string()),
    ownerWorkOns: v.array(v.string()),
    partnerRequests: v.array(v.string()),
    agreements: v.array(v.string()),
    sharedAt: v.optional(v.number()),
  })
    .index("by_owner_and_month", ["ownerUserId", "month"])
    .index("by_couple_and_month", ["coupleId", "month"]),
  coupleChatMessages: defineTable({
    coupleId: v.id("couples"),
    senderKind: v.union(v.literal("ai"), v.literal("user")),
    senderUserId: v.optional(v.id("users")),
    text: v.string(),
    createdAt: v.number(),
    relatedReviewId: v.optional(v.id("monthlyReviews")),
  }).index("by_couple_and_created_at", ["coupleId", "createdAt"]),
  promptResponses: defineTable({
    coupleId: v.id("couples"),
    userId: v.id("users"),
    promptDate: v.string(),
    prompt: v.string(),
    response: v.string(),
    createdAt: v.number(),
  })
    .index("by_user_and_date", ["userId", "promptDate"])
    .index("by_couple_and_date", ["coupleId", "promptDate"]),
  dailyPrompts: defineTable({
    text: v.string(),
    normalizedFingerprint: v.string(),
    principle: v.string(),
    category: v.string(),
    source: v.union(v.literal("seed"), v.literal("ai")),
    safetyStatus: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    model: v.optional(v.string()),
    generationPromptVersion: v.optional(v.string()),
    generatedAt: v.optional(v.number()),
    completionCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_normalized_fingerprint", ["normalizedFingerprint"])
    .index("by_safety_status_and_completion_count_and_created_at", [
      "safetyStatus",
      "completionCount",
      "createdAt",
    ]),
  pushTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    platform: v.union(
      v.literal("ios"),
      v.literal("android"),
      v.literal("web"),
      v.literal("unknown"),
    ),
    deviceId: v.optional(v.string()),
    timezone: v.optional(v.string()),
    enabled: v.boolean(),
    lastPromptReminderDate: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_token", ["token"])
    .index("by_enabled", ["enabled"]),
  notificationDevices: defineTable({
    coupleId: v.id("couples"),
    userId: v.id("users"),
    deviceId: v.string(),
    pushToken: v.optional(v.string()),
    platform: v.union(
      v.literal("ios"),
      v.literal("android"),
      v.literal("web"),
      v.literal("unknown"),
    ),
    permissionStatus: v.union(
      v.literal("undetermined"),
      v.literal("denied"),
      v.literal("granted"),
      v.literal("revoked"),
    ),
    timezone: v.optional(v.string()),
    enabled: v.boolean(),
    lastObservedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_id_and_device_id", ["userId", "deviceId"])
    .index("by_couple_id_and_user_id", ["coupleId", "userId"])
    .index("by_couple_id_and_user_id_and_enabled_and_permission_status_and_updated_at", [
      "coupleId",
      "userId",
      "enabled",
      "permissionStatus",
      "updatedAt",
    ])
    .index("by_ready_lookup", ["coupleId", "userId", "enabled", "permissionStatus", "pushToken"])
    .index("by_push_token", ["pushToken"])
    .index("by_enabled_and_updated_at", ["enabled", "updatedAt"]),
  dailyPromptLifecycles: defineTable({
    coupleId: v.id("couples"),
    promptDate: v.string(),
    promptId: v.optional(v.id("dailyPrompts")),
    timezone: v.string(),
    firstUserId: v.id("users"),
    secondUserId: v.id("users"),
    randomizedFirstLocalMinute: v.number(),
    firstScheduledAt: v.number(),
    firstDeliveryKey: v.optional(v.string()),
    firstSchedulerJobId: v.optional(v.string()),
    firstStatus: v.union(
      v.literal("pending"),
      v.literal("scheduled"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("skipped"),
    ),
    secondStatus: v.union(
      v.literal("pending"),
      v.literal("scheduled"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("skipped"),
    ),
    firstStartedAt: v.optional(v.number()),
    secondScheduledAt: v.optional(v.number()),
    secondDeliveryKey: v.optional(v.string()),
    secondSchedulerJobId: v.optional(v.string()),
    secondDispatchSchedulerJobId: v.optional(v.string()),
    firstSentAt: v.optional(v.number()),
    secondSentAt: v.optional(v.number()),
    skippedAt: v.optional(v.number()),
    skippedReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_couple_id_and_prompt_date", ["coupleId", "promptDate"])
    .index("by_first_scheduled_at_and_first_status", ["firstScheduledAt", "firstStatus"])
    .index("by_second_scheduled_at_and_second_status", ["secondScheduledAt", "secondStatus"]),
  dailyPromptCompletions: defineTable({
    lifecycleId: v.id("dailyPromptLifecycles"),
    coupleId: v.id("couples"),
    promptDate: v.string(),
    promptId: v.id("dailyPrompts"),
    completedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_couple_id_and_prompt_date", ["coupleId", "promptDate"])
    .index("by_lifecycle_id", ["lifecycleId"])
    .index("by_prompt_id_and_completed_at", ["promptId", "completedAt"]),
  dailyPromptDeliveryAttempts: defineTable({
    lifecycleId: v.id("dailyPromptLifecycles"),
    coupleId: v.id("couples"),
    promptDate: v.string(),
    step: v.union(v.literal("first"), v.literal("second")),
    recipientUserId: v.id("users"),
    idempotencyKey: v.string(),
    deviceId: v.string(),
    tokenRef: v.optional(v.string()),
    tokenHash: v.optional(v.string()),
    status: v.union(
      v.literal("reserved"),
      v.literal("provider_accepted"),
      v.literal("provider_rejected"),
      v.literal("sending_unknown"),
      v.literal("abandoned"),
    ),
    expoTicketId: v.optional(v.string()),
    expoErrorCode: v.optional(v.string()),
    dispatchStartedAt: v.optional(v.number()),
    outcomePersistedAt: v.optional(v.number()),
    abandonedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_lifecycle_id_and_step", ["lifecycleId", "step"])
    .index("by_status_and_created_at", ["status", "createdAt"]),
  dailyPromptAnswerStarts: defineTable({
    coupleId: v.id("couples"),
    promptDate: v.string(),
    userId: v.id("users"),
    startedAt: v.number(),
    source: v.literal("first_non_empty_input"),
    createdAt: v.number(),
  })
    .index("by_couple_id_and_prompt_date", ["coupleId", "promptDate"])
    .index("by_user_id_and_prompt_date", ["userId", "promptDate"]),
  planIdeas: defineTable({
    coupleId: v.id("couples"),
    createdByUserId: v.optional(v.id("users")),
    title: v.string(),
    description: v.string(),
    kind: v.optional(v.union(v.literal("activity"), v.literal("place"))),
    category: v.union(
      v.literal("food"),
      v.literal("drinks"),
      v.literal("entertainment"),
      v.literal("activity"),
      v.literal("intimacy"),
      v.literal("dinner"),
      v.literal("date"),
      v.literal("weekend"),
    ),
    costLevel: v.number(),
    durationMinutes: v.number(),
    subcategories: v.optional(v.array(v.string())),
    vibeTags: v.array(v.string()),
    source: v.optional(
      v.union(v.literal("manual"), v.literal("seed"), v.literal("osm"), v.literal("ai")),
    ),
    externalId: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    address: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_couple_and_created_at", ["coupleId", "createdAt"])
    .index("by_couple_and_category", ["coupleId", "category"])
    .index("by_couple_and_external_id", ["coupleId", "externalId"]),
  planSwipes: defineTable({
    coupleId: v.id("couples"),
    ideaId: v.id("planIdeas"),
    userId: v.id("users"),
    vote: v.union(v.literal("like"), v.literal("pass")),
    createdAt: v.number(),
  })
    .index("by_user_and_idea", ["userId", "ideaId"])
    .index("by_idea", ["ideaId"]),
  planMatches: defineTable({
    coupleId: v.id("couples"),
    ideaId: v.id("planIdeas"),
    createdAt: v.number(),
    status: v.union(
      v.literal("matched"),
      v.literal("planned"),
      v.literal("done"),
      v.literal("archived"),
    ),
    archivedAt: v.optional(v.number()),
  })
    .index("by_couple_and_created_at", ["coupleId", "createdAt"])
    .index("by_idea", ["ideaId"]),
  planArchiveVotes: defineTable({
    coupleId: v.id("couples"),
    matchId: v.id("planMatches"),
    userId: v.id("users"),
    vote: v.literal("archive"),
    createdAt: v.number(),
  })
    .index("by_match", ["matchId"])
    .index("by_user_and_match", ["userId", "matchId"]),
  datePlans: defineTable({
    coupleId: v.id("couples"),
    itemKey: v.optional(v.string()),
    title: v.string(),
    summary: v.string(),
    itemIds: v.array(v.id("planIdeas")),
    freeformSteps: v.array(v.string()),
    durationMinutes: v.number(),
    costLevel: v.number(),
    vibeTags: v.array(v.string()),
    source: v.union(v.literal("seed"), v.literal("suggested"), v.literal("manual")),
    popularityScore: v.number(),
    trendingScore: v.number(),
    ratingAverage: v.optional(v.number()),
    ratingCount: v.number(),
    createdAt: v.number(),
  })
    .index("by_couple_and_created_at", ["coupleId", "createdAt"])
    .index("by_couple_and_item_key", ["coupleId", "itemKey"])
    .index("by_couple_and_popularity", ["coupleId", "popularityScore"])
    .index("by_couple_and_trending", ["coupleId", "trendingScore"]),
  datePlanLikes: defineTable({
    coupleId: v.id("couples"),
    datePlanId: v.id("datePlans"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_date_plan", ["datePlanId"])
    .index("by_user_and_date_plan", ["userId", "datePlanId"]),
  savedDatePlans: defineTable({
    coupleId: v.id("couples"),
    datePlanId: v.id("datePlans"),
    savedByUserId: v.id("users"),
    status: v.union(
      v.literal("saved"),
      v.literal("scheduled"),
      v.literal("completed"),
      v.literal("archived"),
    ),
    scheduledFor: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_couple_and_status", ["coupleId", "status"])
    .index("by_couple_and_created_at", ["coupleId", "createdAt"])
    .index("by_couple_and_date_plan", ["coupleId", "datePlanId"])
    .index("by_date_plan", ["datePlanId"]),
  datePlanRatings: defineTable({
    coupleId: v.id("couples"),
    datePlanId: v.id("datePlans"),
    userId: v.id("users"),
    rating: v.number(),
    tags: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_date_plan", ["datePlanId"])
    .index("by_user_and_date_plan", ["userId", "datePlanId"]),
});
