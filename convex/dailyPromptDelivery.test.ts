/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { expect, test } from "vitest";

import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type ReservationResult =
  | {
      disposition: "reserved";
      attemptId: Id<"dailyPromptDeliveryAttempts">;
      deviceId: string;
      pushToken: string;
      promptDate: string;
      step: "first" | "second";
    }
  | { disposition: "no_send"; reason: string };

const reserveDailyPromptDelivery = makeFunctionReference<
  "mutation",
  {
    lifecycleId: Id<"dailyPromptLifecycles">;
    step: "first" | "second";
    nowMs: number;
    recoveryAttemptId?: Id<"dailyPromptDeliveryAttempts">;
  },
  ReservationResult
>("dailyPromptDeliveryReservation:reserveDailyPromptDelivery");

async function seedLifecycle(
  t: ReturnType<typeof convexTest>,
  options: {
    firstStatus?: "pending" | "scheduled" | "sending" | "sent" | "skipped";
    secondStatus?: "pending" | "scheduled" | "sending" | "sent" | "skipped";
    firstScheduledAt?: number;
    secondScheduledAt?: number;
  } = {},
) {
  const firstUserId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authUserId: "first-auth",
      email: "first@example.com",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const secondUserId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authUserId: "second-auth",
      email: "second@example.com",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const coupleId = await t.run(async (ctx) =>
    ctx.db.insert("couples", {
      name: "Us",
      createdByUserId: firstUserId,
      promptTimezone: "America/New_York",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.run(async (ctx) => {
    await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: firstUserId,
      role: "partner",
      joinedAt: 1,
    });
    await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: secondUserId,
      role: "partner",
      joinedAt: 2,
    });
  });
  const lifecycleId = await t.run(async (ctx) =>
    ctx.db.insert("dailyPromptLifecycles", {
      coupleId,
      promptDate: "2026-07-22",
      timezone: "America/New_York",
      firstUserId,
      secondUserId,
      randomizedFirstLocalMinute: 1140,
      firstScheduledAt: options.firstScheduledAt ?? 1_000,
      firstStatus: options.firstStatus ?? "scheduled",
      secondStatus: options.secondStatus ?? "pending",
      secondScheduledAt: options.secondScheduledAt,
      createdAt: 1,
      updatedAt: 1,
    }),
  );

  return { coupleId, firstUserId, secondUserId, lifecycleId };
}

async function insertDevice(
  t: ReturnType<typeof convexTest>,
  args: {
    coupleId: Id<"couples">;
    userId: Id<"users">;
    deviceId: string;
    pushToken?: string;
    enabled?: boolean;
    permissionStatus?: "undetermined" | "denied" | "granted" | "revoked";
    updatedAt: number;
  },
) {
  await t.run(async (ctx) =>
    ctx.db.insert("notificationDevices", {
      coupleId: args.coupleId,
      userId: args.userId,
      deviceId: args.deviceId,
      pushToken: args.pushToken,
      platform: "ios",
      permissionStatus: args.permissionStatus ?? "granted",
      enabled: args.enabled ?? true,
      createdAt: args.updatedAt,
      updatedAt: args.updatedAt,
    }),
  );
}

test("reserves the first step atomically with the latest eligible device and no stored raw token", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedLifecycle(t);
  await insertDevice(t, {
    coupleId: seeded.coupleId,
    userId: seeded.firstUserId,
    deviceId: "old-device",
    pushToken: "ExponentPushToken[old]",
    updatedAt: 10,
  });
  await insertDevice(t, {
    coupleId: seeded.coupleId,
    userId: seeded.firstUserId,
    deviceId: "latest-device",
    pushToken: "ExponentPushToken[latest]",
    updatedAt: 20,
  });
  await insertDevice(t, {
    coupleId: seeded.coupleId,
    userId: seeded.firstUserId,
    deviceId: "newer-denied-device",
    pushToken: "ExponentPushToken[denied]",
    permissionStatus: "denied",
    updatedAt: 30,
  });

  const result = await t.mutation(reserveDailyPromptDelivery, {
    lifecycleId: seeded.lifecycleId,
    step: "first",
    nowMs: 1_000,
  });
  const stored = await t.run(async (ctx) => ({
    lifecycle: await ctx.db.get(seeded.lifecycleId),
    attempts: await ctx.db
      .query("dailyPromptDeliveryAttempts")
      .withIndex("by_lifecycle_id_and_step", (q) =>
        q.eq("lifecycleId", seeded.lifecycleId).eq("step", "first"),
      )
      .take(2),
  }));

  expect(result).toMatchObject({
    disposition: "reserved",
    deviceId: "latest-device",
    pushToken: "ExponentPushToken[latest]",
    promptDate: "2026-07-22",
    step: "first",
  });
  expect(stored.lifecycle).toMatchObject({ firstStatus: "sending", secondStatus: "pending" });
  expect(stored.attempts).toHaveLength(1);
  expect(stored.attempts[0]).toMatchObject({
    lifecycleId: seeded.lifecycleId,
    coupleId: seeded.coupleId,
    promptDate: "2026-07-22",
    step: "first",
    recipientUserId: seeded.firstUserId,
    idempotencyKey: `${seeded.lifecycleId}:first`,
    deviceId: "latest-device",
    tokenHash: "3ee7f30504d1f22f928f91485e52344af67a148996603f34862debf2dd24c68d",
    status: "reserved",
    createdAt: 1_000,
    updatedAt: 1_000,
  });
  expect(stored.attempts[0]).not.toHaveProperty("pushToken");
  expect(JSON.stringify(stored.attempts[0])).not.toContain("ExponentPushToken");
});

test("exact replay returns no-send and never creates another attempt", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedLifecycle(t);
  await insertDevice(t, {
    coupleId: seeded.coupleId,
    userId: seeded.firstUserId,
    deviceId: "device",
    pushToken: "ExponentPushToken[first]",
    updatedAt: 10,
  });

  await t.mutation(reserveDailyPromptDelivery, {
    lifecycleId: seeded.lifecycleId,
    step: "first",
    nowMs: 1_000,
  });
  const replay = await t.mutation(reserveDailyPromptDelivery, {
    lifecycleId: seeded.lifecycleId,
    step: "first",
    nowMs: 2_000,
  });
  const attempts = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptDeliveryAttempts")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", `${seeded.lifecycleId}:first`))
      .take(2),
  );

  expect(replay).toEqual({ disposition: "no_send", reason: "attempt_exists" });
  expect(attempts).toHaveLength(1);
  expect(attempts[0].status).toBe("reserved");
});

test("concurrent reservations converge on one atomic attempt", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedLifecycle(t);
  await insertDevice(t, {
    coupleId: seeded.coupleId,
    userId: seeded.firstUserId,
    deviceId: "device",
    pushToken: "ExponentPushToken[first]",
    updatedAt: 10,
  });

  const results = await Promise.all([
    t.mutation(reserveDailyPromptDelivery, {
      lifecycleId: seeded.lifecycleId,
      step: "first",
      nowMs: 1_000,
    }),
    t.mutation(reserveDailyPromptDelivery, {
      lifecycleId: seeded.lifecycleId,
      step: "first",
      nowMs: 1_000,
    }),
  ]);
  const attempts = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptDeliveryAttempts")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", `${seeded.lifecycleId}:first`))
      .take(2),
  );

  expect(results.map((result) => result.disposition).sort()).toEqual(["no_send", "reserved"]);
  expect(attempts).toHaveLength(1);
});

test.each(["provider_accepted", "provider_rejected", "sending_unknown"] as const)(
  "an existing %s attempt never authorizes resend",
  async (status) => {
    const t = convexTest(schema, modules);
    const seeded = await seedLifecycle(t, { firstStatus: "sending" });
    await t.run(async (ctx) =>
      ctx.db.insert("dailyPromptDeliveryAttempts", {
        lifecycleId: seeded.lifecycleId,
        coupleId: seeded.coupleId,
        promptDate: "2026-07-22",
        step: "first",
        recipientUserId: seeded.firstUserId,
        idempotencyKey: `${seeded.lifecycleId}:first`,
        deviceId: "device",
        status,
        createdAt: 1,
        updatedAt: 1,
      }),
    );

    await expect(
      t.mutation(reserveDailyPromptDelivery, {
        lifecycleId: seeded.lifecycleId,
        step: "first",
        nowMs: 2_000,
      }),
    ).resolves.toEqual({ disposition: "no_send", reason: "attempt_exists" });
  },
);

test("wrong status and not-due lifecycle states fail closed without writes", async () => {
  for (const options of [
    { firstStatus: "pending" as const, firstScheduledAt: 1_000 },
    { firstStatus: "scheduled" as const, firstScheduledAt: 2_000 },
  ]) {
    const t = convexTest(schema, modules);
    const seeded = await seedLifecycle(t, options);
    await insertDevice(t, {
      coupleId: seeded.coupleId,
      userId: seeded.firstUserId,
      deviceId: "device",
      pushToken: "ExponentPushToken[first]",
      updatedAt: 10,
    });

    const result = await t.mutation(reserveDailyPromptDelivery, {
      lifecycleId: seeded.lifecycleId,
      step: "first",
      nowMs: 1_000,
    });
    const attempts = await t.run(async (ctx) =>
      ctx.db
        .query("dailyPromptDeliveryAttempts")
        .withIndex("by_lifecycle_id_and_step", (q) =>
          q.eq("lifecycleId", seeded.lifecycleId).eq("step", "first"),
        )
        .take(1),
    );

    expect(result).toEqual({
      disposition: "no_send",
      reason: options.firstStatus === "pending" ? "step_not_scheduled" : "step_not_due",
    });
    expect(attempts).toHaveLength(0);
  }
});

test("eligibility disappearing before first reservation terminalizes without an attempt", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedLifecycle(t);
  await insertDevice(t, {
    coupleId: seeded.coupleId,
    userId: seeded.firstUserId,
    deviceId: "denied-device",
    pushToken: "ExponentPushToken[denied]",
    permissionStatus: "denied",
    updatedAt: 20,
  });

  await expect(
    t.mutation(reserveDailyPromptDelivery, {
      lifecycleId: seeded.lifecycleId,
      step: "first",
      nowMs: 1_000,
    }),
  ).resolves.toEqual({ disposition: "no_send", reason: "delivery_abandoned" });
  const state = await t.run(async (ctx) => ({
    lifecycle: await ctx.db.get(seeded.lifecycleId),
    attempts: await ctx.db.query("dailyPromptDeliveryAttempts").collect(),
  }));
  expect(state.lifecycle).toMatchObject({
    firstStatus: "skipped",
    skippedAt: 1_000,
    skippedReason: "skipped_pre_provider_unavailable",
  });
  expect(state.attempts).toHaveLength(0);
});

test("malformed exact membership fails closed without writes", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedLifecycle(t);
  const thirdUserId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authUserId: "third-auth",
      email: "third@example.com",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.run(async (ctx) =>
    ctx.db.insert("coupleMembers", {
      coupleId: seeded.coupleId,
      userId: thirdUserId,
      role: "partner",
      joinedAt: 3,
    }),
  );
  await insertDevice(t, {
    coupleId: seeded.coupleId,
    userId: seeded.firstUserId,
    deviceId: "granted-device",
    pushToken: "ExponentPushToken[granted]",
    updatedAt: 30,
  });

  await expect(
    t.mutation(reserveDailyPromptDelivery, {
      lifecycleId: seeded.lifecycleId,
      step: "first",
      nowMs: 1_000,
    }),
  ).resolves.toEqual({ disposition: "no_send", reason: "invalid_membership" });
  const attempts = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptDeliveryAttempts")
      .withIndex("by_lifecycle_id_and_step", (q) =>
        q.eq("lifecycleId", seeded.lifecycleId).eq("step", "first"),
      )
      .take(1),
  );
  expect(attempts).toHaveLength(0);
});

test.each(["rotated", "disabled", "removed", "couple_mismatch"] as const)(
  "exact pre-provider recovery terminalizes an unavailable %s reserved route",
  async (change) => {
    const t = convexTest(schema, modules);
    const seeded = await seedLifecycle(t);
    await insertDevice(t, {
      coupleId: seeded.coupleId,
      userId: seeded.firstUserId,
      deviceId: "reserved-device",
      pushToken: "ExponentPushToken[original]",
      updatedAt: 10,
    });
    const reservation = await t.mutation(reserveDailyPromptDelivery, {
      lifecycleId: seeded.lifecycleId,
      step: "first",
      nowMs: 1_000,
    });
    if (reservation.disposition !== "reserved") throw new Error("Expected reservation");

    await t.run(async (ctx) => {
      const device = await ctx.db
        .query("notificationDevices")
        .withIndex("by_user_id_and_device_id", (q) =>
          q.eq("userId", seeded.firstUserId).eq("deviceId", "reserved-device"),
        )
        .unique();
      if (!device) throw new Error("Expected reserved device");
      if (change === "removed") await ctx.db.delete(device._id);
      else if (change === "rotated") {
        await ctx.db.patch(device._id, {
          pushToken: "ExponentPushToken[rotated]",
          updatedAt: 2_000,
        });
      } else if (change === "disabled") {
        await ctx.db.patch(device._id, { enabled: false, updatedAt: 2_000 });
      } else {
        const otherCoupleId = await ctx.db.insert("couples", {
          name: "Other",
          createdByUserId: seeded.firstUserId,
          createdAt: 2_000,
          updatedAt: 2_000,
        });
        await ctx.db.patch(device._id, { coupleId: otherCoupleId, updatedAt: 2_000 });
      }
    });

    await expect(
      t.mutation(reserveDailyPromptDelivery, {
        lifecycleId: seeded.lifecycleId,
        step: "first",
        nowMs: 2_000,
        recoveryAttemptId: reservation.attemptId,
      }),
    ).resolves.toEqual({ disposition: "no_send", reason: "delivery_abandoned" });
    const state = await t.run(async (ctx) => ({
      lifecycle: await ctx.db.get(seeded.lifecycleId),
      attempt: await ctx.db.get(reservation.attemptId),
    }));
    expect(state.attempt).toMatchObject({ status: "abandoned", abandonedAt: 2_000 });
    expect(state.attempt?.dispatchStartedAt).toBeUndefined();
    expect(state.attempt?.outcomePersistedAt).toBeUndefined();
    expect(state.lifecycle).toMatchObject({
      firstStatus: "skipped",
      skippedAt: 2_000,
      skippedReason: "skipped_pre_provider_unavailable",
    });
  },
);

test.each(["missing_identity", "malformed_attempt", "post_start", "ambiguous_device"] as const)(
  "%s recovery state fails closed instead of abandoning",
  async (state) => {
    const t = convexTest(schema, modules);
    const seeded = await seedLifecycle(t);
    await insertDevice(t, {
      coupleId: seeded.coupleId,
      userId: seeded.firstUserId,
      deviceId: "reserved-device",
      pushToken: "ExponentPushToken[original]",
      updatedAt: 10,
    });
    const reservation = await t.mutation(reserveDailyPromptDelivery, {
      lifecycleId: seeded.lifecycleId,
      step: "first",
      nowMs: 1_000,
    });
    if (reservation.disposition !== "reserved") throw new Error("Expected reservation");

    if (state === "malformed_attempt") {
      await t.run(async (ctx) => ctx.db.patch(reservation.attemptId, { tokenHash: "malformed" }));
    } else if (state === "post_start") {
      await t.run(async (ctx) =>
        ctx.db.patch(reservation.attemptId, {
          dispatchStartedAt: 1_500,
          updatedAt: 1_500,
        }),
      );
    } else if (state === "ambiguous_device") {
      await insertDevice(t, {
        coupleId: seeded.coupleId,
        userId: seeded.firstUserId,
        deviceId: "reserved-device",
        pushToken: "ExponentPushToken[original]",
        updatedAt: 20,
      });
    }

    const result = await t.mutation(reserveDailyPromptDelivery, {
      lifecycleId: seeded.lifecycleId,
      step: "first",
      nowMs: 2_000,
      ...(state === "missing_identity" ? {} : { recoveryAttemptId: reservation.attemptId }),
    });
    expect(result).toEqual({
      disposition: "no_send",
      reason: state === "ambiguous_device" ? "ambiguous_reserved_device" : "attempt_exists",
    });
    const persisted = await t.run(async (ctx) => ({
      lifecycle: await ctx.db.get(seeded.lifecycleId),
      attempt: await ctx.db.get(reservation.attemptId),
    }));
    expect(persisted.attempt?.status).toBe("reserved");
    expect(persisted.attempt?.abandonedAt).toBeUndefined();
    expect(persisted.lifecycle).toMatchObject({ firstStatus: "sending" });
  },
);

test("a lifecycle recipient outside the exact member pair fails closed", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedLifecycle(t);
  const outsiderUserId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authUserId: "outsider-auth",
      email: "outsider@example.com",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.run(async (ctx) => ctx.db.patch(seeded.lifecycleId, { firstUserId: outsiderUserId }));
  await insertDevice(t, {
    coupleId: seeded.coupleId,
    userId: outsiderUserId,
    deviceId: "outsider-device",
    pushToken: "ExponentPushToken[outsider]",
    updatedAt: 10,
  });

  await expect(
    t.mutation(reserveDailyPromptDelivery, {
      lifecycleId: seeded.lifecycleId,
      step: "first",
      nowMs: 1_000,
    }),
  ).resolves.toEqual({ disposition: "no_send", reason: "invalid_membership" });
});

test("the same reservation boundary supports a due second step without moving first status", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedLifecycle(t, {
    firstStatus: "sent",
    secondStatus: "scheduled",
    secondScheduledAt: 2_000,
  });
  await insertDevice(t, {
    coupleId: seeded.coupleId,
    userId: seeded.secondUserId,
    deviceId: "second-device",
    pushToken: "ExponentPushToken[second]",
    updatedAt: 30,
  });

  const result = await t.mutation(reserveDailyPromptDelivery, {
    lifecycleId: seeded.lifecycleId,
    step: "second",
    nowMs: 2_000,
  });
  const lifecycle = await t.run(async (ctx) => ctx.db.get(seeded.lifecycleId));

  expect(result).toMatchObject({
    disposition: "reserved",
    deviceId: "second-device",
    pushToken: "ExponentPushToken[second]",
    step: "second",
  });
  expect(lifecycle).toMatchObject({ firstStatus: "sent", secondStatus: "sending" });
});
