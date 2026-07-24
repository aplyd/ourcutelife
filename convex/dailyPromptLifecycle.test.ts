/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function insertUserAndCouple(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const coupleId = await t.run(async (ctx) =>
    ctx.db.insert("couples", {
      name: "Us",
      createdByUserId: userId,
      createdAt: 1,
      updatedAt: 1,
    }),
  );

  return { coupleId, userId };
}

test("legacy couple and push token inserts remain accepted", async () => {
  const t = convexTest(schema, modules);

  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const coupleId = await t.run(async (ctx) =>
    ctx.db.insert("couples", {
      name: "Us",
      createdByUserId: userId,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const tokenId = await t.run(async (ctx) =>
    ctx.db.insert("pushTokens", {
      userId,
      token: "ExponentPushToken[legacy]",
      platform: "ios",
      enabled: true,
      lastPromptReminderDate: "2026-07-21",
      createdAt: 1,
      updatedAt: 1,
    }),
  );

  const couple = await t.run(async (ctx) => ctx.db.get(coupleId));
  const token = await t.run(async (ctx) => ctx.db.get(tokenId));

  expect(couple).toMatchObject({ name: "Us" });
  expect(token).toMatchObject({ lastPromptReminderDate: "2026-07-21" });
});

test("couples accept optional prompt timezone fields", async () => {
  const t = convexTest(schema, modules);

  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      createdAt: 1,
      updatedAt: 1,
    }),
  );

  const coupleId = await t.run(async (ctx) =>
    ctx.db.insert("couples", {
      name: "Us",
      createdByUserId: userId,
      promptTimezone: "America/New_York",
      promptTimezoneUpdatedAt: 2,
      createdAt: 1,
      updatedAt: 2,
    }),
  );

  const couple = await t.run(async (ctx) => ctx.db.get(coupleId));
  expect(couple).toMatchObject({
    promptTimezone: "America/New_York",
    promptTimezoneUpdatedAt: 2,
  });
});

test("notification devices accept planned fields, unions, and indexes", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, userId } = await insertUserAndCouple(t);

  const deviceId = await t.run(async (ctx) =>
    ctx.db.insert("notificationDevices", {
      coupleId,
      userId,
      deviceId: "ios-install-1",
      pushToken: "ExponentPushToken[current]",
      platform: "ios",
      permissionStatus: "granted",
      timezone: "America/New_York",
      enabled: true,
      lastObservedAt: 10,
      createdAt: 1,
      updatedAt: 10,
    }),
  );

  await expect(
    t.run(async (ctx) =>
      ctx.db.insert("notificationDevices", {
        coupleId,
        userId,
        deviceId: "missing-platform",
        permissionStatus: "granted",
        enabled: true,
        createdAt: 1,
        updatedAt: 10,
      } as never),
    ),
  ).rejects.toThrow("Validator error");

  await expect(
    t.run(async (ctx) =>
      ctx.db.insert("notificationDevices", {
        coupleId,
        userId,
        deviceId: "ios-install-invalid",
        platform: "ios",
        permissionStatus: "maybe" as never,
        enabled: true,
        createdAt: 1,
        updatedAt: 10,
      }),
    ),
  ).rejects.toThrow("Validator error");

  const byUserAndDevice = await t.run(async (ctx) =>
    ctx.db
      .query("notificationDevices")
      .withIndex("by_user_id_and_device_id", (q) =>
        q.eq("userId", userId).eq("deviceId", "ios-install-1"),
      )
      .unique(),
  );
  const byCoupleAndUser = await t.run(async (ctx) =>
    ctx.db
      .query("notificationDevices")
      .withIndex("by_couple_id_and_user_id", (q) => q.eq("coupleId", coupleId).eq("userId", userId))
      .unique(),
  );
  const byPushToken = await t.run(async (ctx) =>
    ctx.db
      .query("notificationDevices")
      .withIndex("by_push_token", (q) => q.eq("pushToken", "ExponentPushToken[current]"))
      .unique(),
  );
  const byEnabledAndUpdatedAt = await t.run(async (ctx) =>
    ctx.db
      .query("notificationDevices")
      .withIndex("by_enabled_and_updated_at", (q) => q.eq("enabled", true))
      .take(1),
  );

  expect(byUserAndDevice?._id).toBe(deviceId);
  expect(byCoupleAndUser?._id).toBe(deviceId);
  expect(byPushToken?._id).toBe(deviceId);
  expect(byEnabledAndUpdatedAt.map((device) => device._id)).toEqual([deviceId]);
});

test("daily prompt lifecycles accept planned fields, unions, and indexes", async () => {
  const t = convexTest(schema, modules);
  const first = await insertUserAndCouple(t);
  const secondUserId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      createdAt: 2,
      updatedAt: 2,
    }),
  );

  const lifecycleId = await t.run(async (ctx) =>
    ctx.db.insert("dailyPromptLifecycles", {
      coupleId: first.coupleId,
      promptDate: "2026-07-22",
      timezone: "America/New_York",
      firstUserId: first.userId,
      secondUserId,
      randomizedFirstLocalMinute: 1197,
      firstScheduledAt: 1784764800000,
      firstStatus: "scheduled",
      secondStatus: "pending",
      firstStartedAt: 1784765100000,
      secondScheduledAt: 1784765400000,
      firstSentAt: 1784764860000,
      secondSentAt: 1784765460000,
      skippedAt: 1784765500000,
      skippedReason: "permission_loss",
      createdAt: 1,
      updatedAt: 2,
    }),
  );

  await expect(
    t.run(async (ctx) =>
      ctx.db.insert("dailyPromptLifecycles", {
        coupleId: first.coupleId,
        promptDate: "2026-07-23",
        timezone: "America/New_York",
        firstUserId: first.userId,
        secondUserId,
        randomizedFirstLocalMinute: 1197,
        firstScheduledAt: 1784851200000,
        firstStatus: "queued" as never,
        secondStatus: "pending",
        createdAt: 1,
        updatedAt: 2,
      }),
    ),
  ).rejects.toThrow("Validator error");

  const byCoupleDate = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptLifecycles")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", first.coupleId).eq("promptDate", "2026-07-22"),
      )
      .unique(),
  );
  const dueFirst = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptLifecycles")
      .withIndex("by_first_scheduled_at_and_first_status", (q) =>
        q.eq("firstScheduledAt", 1784764800000).eq("firstStatus", "scheduled"),
      )
      .take(1),
  );
  const dueSecond = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptLifecycles")
      .withIndex("by_second_scheduled_at_and_second_status", (q) =>
        q.eq("secondScheduledAt", 1784765400000).eq("secondStatus", "pending"),
      )
      .take(1),
  );

  expect(byCoupleDate?._id).toBe(lifecycleId);
  expect(dueFirst.map((lifecycle) => lifecycle._id)).toEqual([lifecycleId]);
  expect(dueSecond.map((lifecycle) => lifecycle._id)).toEqual([lifecycleId]);
});

test("daily prompt delivery attempts accept planned fields, unions, and indexes", async () => {
  const t = convexTest(schema, modules);
  const first = await insertUserAndCouple(t);
  const lifecycleId = await t.run(async (ctx) =>
    ctx.db.insert("dailyPromptLifecycles", {
      coupleId: first.coupleId,
      promptDate: "2026-07-22",
      timezone: "America/New_York",
      firstUserId: first.userId,
      secondUserId: first.userId,
      randomizedFirstLocalMinute: 1197,
      firstScheduledAt: 1784764800000,
      firstStatus: "scheduled",
      secondStatus: "pending",
      createdAt: 1,
      updatedAt: 2,
    }),
  );

  const attemptId = await t.run(async (ctx) =>
    ctx.db.insert("dailyPromptDeliveryAttempts", {
      lifecycleId,
      coupleId: first.coupleId,
      promptDate: "2026-07-22",
      step: "first",
      recipientUserId: first.userId,
      idempotencyKey: `${lifecycleId}:first`,
      deviceId: "ios-install-1",
      tokenRef: "notificationDevices:ios-install-1",
      tokenHash: "sha256-token",
      status: "reserved",
      expoTicketId: "ticket-1",
      expoErrorCode: "DeviceNotRegistered",
      createdAt: 1,
      updatedAt: 2,
    }),
  );

  await expect(
    t.run(async (ctx) =>
      ctx.db.insert("dailyPromptDeliveryAttempts", {
        lifecycleId,
        coupleId: first.coupleId,
        promptDate: "2026-07-22",
        step: "third" as never,
        recipientUserId: first.userId,
        idempotencyKey: `${lifecycleId}:third`,
        deviceId: "ios-install-1",
        status: "reserved",
        createdAt: 1,
        updatedAt: 2,
      }),
    ),
  ).rejects.toThrow("Validator error");

  const byKey = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptDeliveryAttempts")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", `${lifecycleId}:first`))
      .unique(),
  );
  const byLifecycleAndStep = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptDeliveryAttempts")
      .withIndex("by_lifecycle_id_and_step", (q) =>
        q.eq("lifecycleId", lifecycleId).eq("step", "first"),
      )
      .unique(),
  );
  const byStatusAndCreatedAt = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptDeliveryAttempts")
      .withIndex("by_status_and_created_at", (q) => q.eq("status", "reserved"))
      .take(1),
  );

  expect(byKey?._id).toBe(attemptId);
  expect(byLifecycleAndStep?._id).toBe(attemptId);
  expect(byStatusAndCreatedAt.map((attempt) => attempt._id)).toEqual([attemptId]);
});

test("daily prompt answer starts accept planned fields, unions, and indexes", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, userId } = await insertUserAndCouple(t);
  const partnerUserId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      createdAt: 2,
      updatedAt: 2,
    }),
  );

  const startId = await t.run(async (ctx) =>
    ctx.db.insert("dailyPromptAnswerStarts", {
      coupleId,
      promptDate: "2026-07-22",
      userId,
      startedAt: 1784765100000,
      source: "first_non_empty_input",
      createdAt: 1784765100000,
    }),
  );
  const partnerStartId = await t.run(async (ctx) =>
    ctx.db.insert("dailyPromptAnswerStarts", {
      coupleId,
      promptDate: "2026-07-22",
      userId: partnerUserId,
      startedAt: 1784765200000,
      source: "first_non_empty_input",
      createdAt: 1784765200000,
    }),
  );

  await expect(
    t.run(async (ctx) =>
      ctx.db.insert("dailyPromptAnswerStarts", {
        coupleId,
        promptDate: "2026-07-22",
        userId,
        startedAt: 1784765100000,
        source: "focus" as never,
        createdAt: 1784765100000,
      }),
    ),
  ).rejects.toThrow("Validator error");

  const byCoupleAndPromptDate = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptAnswerStarts")
      .withIndex("by_couple_id_and_prompt_date", (q) =>
        q.eq("coupleId", coupleId).eq("promptDate", "2026-07-22"),
      )
      .take(2),
  );
  const byUserAndPromptDate = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptAnswerStarts")
      .withIndex("by_user_id_and_prompt_date", (q) =>
        q.eq("userId", userId).eq("promptDate", "2026-07-22"),
      )
      .unique(),
  );

  expect(byCoupleAndPromptDate.map((start) => start._id)).toEqual([startId, partnerStartId]);
  expect(byUserAndPromptDate?._id).toBe(startId);
});
