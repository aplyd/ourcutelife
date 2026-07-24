/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { expect, test } from "vitest";

import type { Id } from "./_generated/dataModel";
import { dispatchReservedDailyPrompt } from "./dailyPromptDelivery";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const persistDailyPromptDeliveryOutcome = makeFunctionReference<
  "mutation",
  {
    attemptId: Id<"dailyPromptDeliveryAttempts">;
    outcome:
      | { status: "provider_accepted"; expoTicketId: string }
      | { status: "provider_rejected"; expoErrorCode: string; disableDevice: boolean }
      | { status: "sending_unknown" };
    nowMs: number;
  },
  {
    disposition: "persisted" | "already_persisted";
    status: "provider_accepted" | "provider_rejected" | "sending_unknown";
  }
>("dailyPromptDeliveryOutcome:persistDailyPromptDeliveryOutcome");

const reserveDailyPromptDelivery = makeFunctionReference<
  "mutation",
  {
    lifecycleId: Id<"dailyPromptLifecycles">;
    step: "first" | "second";
    nowMs: number;
  },
  | {
      disposition: "reserved";
      attemptId: Id<"dailyPromptDeliveryAttempts">;
      deviceId: string;
      pushToken: string;
      promptDate: string;
      step: "first" | "second";
    }
  | { disposition: "no_send"; reason: string }
>("dailyPromptDeliveryReservation:reserveDailyPromptDelivery");

const startDailyPromptDeliveryDispatch = makeFunctionReference<
  "mutation",
  { attemptId: Id<"dailyPromptDeliveryAttempts">; nowMs: number },
  {
    disposition: "started" | "already_started" | "already_finalized";
    status: "sending_unknown";
  }
>("dailyPromptDeliveryStart:startDailyPromptDeliveryDispatch");

async function seedReservedAttempt(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const firstUserId = await ctx.db.insert("users", {
      authUserId: "first-auth",
      email: "first@example.com",
      createdAt: 1,
      updatedAt: 1,
    });
    const secondUserId = await ctx.db.insert("users", {
      authUserId: "second-auth",
      email: "second@example.com",
      createdAt: 1,
      updatedAt: 1,
    });
    const coupleId = await ctx.db.insert("couples", {
      name: "Us",
      createdByUserId: firstUserId,
      createdAt: 1,
      updatedAt: 1,
    });
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
    const lifecycleId = await ctx.db.insert("dailyPromptLifecycles", {
      coupleId,
      promptDate: "2026-07-22",
      timezone: "America/New_York",
      firstUserId,
      secondUserId,
      randomizedFirstLocalMinute: 1140,
      firstScheduledAt: 1_000,
      firstStatus: "sending",
      secondStatus: "pending",
      createdAt: 1,
      updatedAt: 1_000,
    });
    await ctx.db.insert("notificationDevices", {
      coupleId,
      userId: firstUserId,
      deviceId: "device-1",
      pushToken: "ExponentPushToken[stored-only-in-routing]",
      platform: "ios",
      permissionStatus: "granted",
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    });
    const attemptId = await ctx.db.insert("dailyPromptDeliveryAttempts", {
      lifecycleId,
      coupleId,
      promptDate: "2026-07-22",
      step: "first",
      recipientUserId: firstUserId,
      idempotencyKey: `${lifecycleId}:first`,
      deviceId: "device-1",
      tokenHash: "5bbfacf2bf1f2c8d240eea5b8b017640a9bb178aecd5a242d48f29b905a60bfa",
      status: "reserved",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    return { attemptId, lifecycleId, firstUserId };
  });
}

async function startProvisional(
  t: ReturnType<typeof convexTest>,
  attemptId: Id<"dailyPromptDeliveryAttempts">,
) {
  return await t.mutation(startDailyPromptDeliveryDispatch, { attemptId, nowMs: 1_500 });
}

test("dispatch start durably marks an exact reserved attempt ambiguous before provider invocation", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedReservedAttempt(t);

  await expect(startProvisional(t, seeded.attemptId)).resolves.toEqual({
    disposition: "started",
    status: "sending_unknown",
  });
  const stored = await t.run(async (ctx) => ctx.db.get(seeded.attemptId));
  expect(stored).toMatchObject({
    status: "sending_unknown",
    dispatchStartedAt: 1_500,
    updatedAt: 1_500,
  });
  expect(stored).not.toHaveProperty("outcomePersistedAt");
});

test("accepted outcome atomically finalizes the attempt and lifecycle without storing a token", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedReservedAttempt(t);
  await startProvisional(t, seeded.attemptId);

  await expect(
    t.mutation(persistDailyPromptDeliveryOutcome, {
      attemptId: seeded.attemptId,
      outcome: { status: "provider_accepted", expoTicketId: "ticket-1" },
      nowMs: 2_000,
    }),
  ).resolves.toEqual({ disposition: "persisted", status: "provider_accepted" });
  await expect(
    t.mutation(persistDailyPromptDeliveryOutcome, {
      attemptId: seeded.attemptId,
      outcome: {
        status: "provider_rejected",
        expoErrorCode: "MessageRateExceeded",
        disableDevice: false,
      },
      nowMs: 3_000,
    }),
  ).resolves.toEqual({ disposition: "already_persisted", status: "provider_accepted" });

  const stored = await t.run(async (ctx) => ({
    attempt: await ctx.db.get(seeded.attemptId),
    lifecycle: await ctx.db.get(seeded.lifecycleId),
  }));
  expect(stored.attempt).toMatchObject({
    status: "provider_accepted",
    expoTicketId: "ticket-1",
    outcomePersistedAt: 2_000,
    updatedAt: 2_000,
  });
  expect(stored.lifecycle).toMatchObject({ firstStatus: "sent", firstSentAt: 2_000 });
  expect(JSON.stringify(stored.attempt)).not.toContain("ExponentPushToken");
});

test.each([
  ["DeviceNotRegistered", true],
  ["MessageRateExceeded", false],
] as const)("rejection %s disables routing only when required", async (expoErrorCode, disabled) => {
  const t = convexTest(schema, modules);
  const seeded = await seedReservedAttempt(t);
  await startProvisional(t, seeded.attemptId);

  await t.mutation(persistDailyPromptDeliveryOutcome, {
    attemptId: seeded.attemptId,
    outcome: { status: "provider_rejected", expoErrorCode, disableDevice: disabled },
    nowMs: 2_000,
  });
  const stored = await t.run(async (ctx) => ({
    attempt: await ctx.db.get(seeded.attemptId),
    lifecycle: await ctx.db.get(seeded.lifecycleId),
    device: await ctx.db
      .query("notificationDevices")
      .withIndex("by_user_id_and_device_id", (q) =>
        q.eq("userId", seeded.firstUserId).eq("deviceId", "device-1"),
      )
      .unique(),
  }));

  expect(stored.attempt).toMatchObject({
    status: "provider_rejected",
    expoErrorCode,
    outcomePersistedAt: 2_000,
  });
  expect(stored.lifecycle).toMatchObject({
    firstStatus: "skipped",
    skippedAt: 2_000,
    skippedReason: `provider_rejected:${expoErrorCode}`,
  });
  expect(stored.device?.enabled).toBe(!disabled);
});

test("ambiguous outcome remains terminal for automated dispatch but keeps lifecycle sending", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedReservedAttempt(t);
  await startProvisional(t, seeded.attemptId);

  await t.mutation(persistDailyPromptDeliveryOutcome, {
    attemptId: seeded.attemptId,
    outcome: { status: "sending_unknown" },
    nowMs: 2_000,
  });
  const stored = await t.run(async (ctx) => ({
    attempt: await ctx.db.get(seeded.attemptId),
    lifecycle: await ctx.db.get(seeded.lifecycleId),
  }));

  expect(stored.attempt).toMatchObject({ status: "sending_unknown", outcomePersistedAt: 2_000 });
  expect(stored.lifecycle?.firstStatus).toBe("sending");
});

test("whitespace-only accepted ticket ids and rejected error codes fail closed without writes", async () => {
  for (const outcome of [
    { status: "provider_accepted" as const, expoTicketId: " \t " },
    {
      status: "provider_rejected" as const,
      expoErrorCode: " \n ",
      disableDevice: false,
    },
  ]) {
    const t = convexTest(schema, modules);
    const seeded = await seedReservedAttempt(t);
    await startProvisional(t, seeded.attemptId);

    await expect(
      t.mutation(persistDailyPromptDeliveryOutcome, {
        attemptId: seeded.attemptId,
        outcome,
        nowMs: 2_000,
      }),
    ).rejects.toThrow(
      outcome.status === "provider_accepted" ? "Missing Expo ticket ID" : "Missing Expo error code",
    );
    const stored = await t.run(async (ctx) => ({
      attempt: await ctx.db.get(seeded.attemptId),
      lifecycle: await ctx.db.get(seeded.lifecycleId),
    }));
    expect(stored.attempt).toMatchObject({ status: "sending_unknown", updatedAt: 1_500 });
    expect(stored.attempt).not.toHaveProperty("outcomePersistedAt");
    expect(stored.lifecycle?.firstStatus).toBe("sending");
  }
});

test("forged device-disable classifications fail closed without finalizing", async () => {
  for (const outcome of [
    {
      status: "provider_rejected" as const,
      expoErrorCode: "DeviceNotRegistered",
      disableDevice: false,
    },
    {
      status: "provider_rejected" as const,
      expoErrorCode: "MessageRateExceeded",
      disableDevice: true,
    },
  ]) {
    const t = convexTest(schema, modules);
    const seeded = await seedReservedAttempt(t);
    await startProvisional(t, seeded.attemptId);

    await expect(
      t.mutation(persistDailyPromptDeliveryOutcome, {
        attemptId: seeded.attemptId,
        outcome,
        nowMs: 2_000,
      }),
    ).rejects.toThrow("Invalid device-disable classification");
    const attempt = await t.run(async (ctx) => ctx.db.get(seeded.attemptId));
    expect(attempt).toMatchObject({ status: "sending_unknown", updatedAt: 1_500 });
    expect(attempt).not.toHaveProperty("outcomePersistedAt");
  }
});

test("duplicate idempotency-key attempt rows fail closed before outcome persistence", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedReservedAttempt(t);
  await startProvisional(t, seeded.attemptId);
  await t.run(async (ctx) => {
    const attempt = await ctx.db.get(seeded.attemptId);
    if (!attempt) throw new Error("missing fixture attempt");
    await ctx.db.insert("dailyPromptDeliveryAttempts", {
      lifecycleId: attempt.lifecycleId,
      coupleId: attempt.coupleId,
      promptDate: attempt.promptDate,
      step: attempt.step,
      recipientUserId: attempt.recipientUserId,
      idempotencyKey: attempt.idempotencyKey,
      deviceId: "duplicate-device",
      status: "reserved",
      createdAt: 1_600,
      updatedAt: 1_600,
    });
  });

  await expect(
    t.mutation(persistDailyPromptDeliveryOutcome, {
      attemptId: seeded.attemptId,
      outcome: { status: "provider_accepted", expoTicketId: "must-not-persist" },
      nowMs: 2_000,
    }),
  ).rejects.toThrow("Ambiguous delivery attempt identity");
  const attempt = await t.run(async (ctx) => ctx.db.get(seeded.attemptId));
  expect(attempt).toMatchObject({ status: "sending_unknown", updatedAt: 1_500 });
  expect(attempt).not.toHaveProperty("outcomePersistedAt");
});

test("lifecycle ownership and sending-state mismatches fail closed before outcome persistence", async () => {
  for (const mismatch of ["recipient", "state"] as const) {
    const t = convexTest(schema, modules);
    const seeded = await seedReservedAttempt(t);
    await startProvisional(t, seeded.attemptId);
    await t.run(async (ctx) => {
      if (mismatch === "recipient") {
        const lifecycle = await ctx.db.get(seeded.lifecycleId);
        if (!lifecycle) throw new Error("missing fixture lifecycle");
        await ctx.db.patch(seeded.attemptId, { recipientUserId: lifecycle.secondUserId });
      } else {
        await ctx.db.patch(seeded.lifecycleId, { firstStatus: "scheduled" });
      }
    });

    await expect(
      t.mutation(persistDailyPromptDeliveryOutcome, {
        attemptId: seeded.attemptId,
        outcome: { status: "provider_accepted", expoTicketId: "must-not-persist" },
        nowMs: 2_000,
      }),
    ).rejects.toThrow("Delivery attempt does not match a sending lifecycle step");
    const attempt = await t.run(async (ctx) => ctx.db.get(seeded.attemptId));
    expect(attempt).toMatchObject({ status: "sending_unknown", updatedAt: 1_500 });
    expect(attempt).not.toHaveProperty("outcomePersistedAt");
  }
});

test("exact device ownership mismatch fails closed without disabling or finalizing", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedReservedAttempt(t);
  await startProvisional(t, seeded.attemptId);
  const deviceId = await t.run(async (ctx) => {
    const wrongCoupleId = await ctx.db.insert("couples", {
      name: "Wrong couple",
      createdByUserId: seeded.firstUserId,
      createdAt: 1,
      updatedAt: 1,
    });
    const device = await ctx.db
      .query("notificationDevices")
      .withIndex("by_user_id_and_device_id", (q) =>
        q.eq("userId", seeded.firstUserId).eq("deviceId", "device-1"),
      )
      .unique();
    if (!device) throw new Error("missing fixture device");
    await ctx.db.patch(device._id, { coupleId: wrongCoupleId });
    return device._id;
  });

  await expect(
    t.mutation(persistDailyPromptDeliveryOutcome, {
      attemptId: seeded.attemptId,
      outcome: {
        status: "provider_rejected",
        expoErrorCode: "DeviceNotRegistered",
        disableDevice: true,
      },
      nowMs: 2_000,
    }),
  ).rejects.toThrow("Reserved delivery device is ambiguous");
  const stored = await t.run(async (ctx) => ({
    attempt: await ctx.db.get(seeded.attemptId),
    device: await ctx.db.get(deviceId),
  }));
  expect(stored.attempt).toMatchObject({ status: "sending_unknown", updatedAt: 1_500 });
  expect(stored.attempt).not.toHaveProperty("outcomePersistedAt");
  expect(stored.device?.enabled).toBe(true);
});

test("outcome replay is idempotent and cannot overwrite the first persisted result", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedReservedAttempt(t);
  await startProvisional(t, seeded.attemptId);
  await t.mutation(persistDailyPromptDeliveryOutcome, {
    attemptId: seeded.attemptId,
    outcome: {
      status: "provider_rejected",
      expoErrorCode: "MessageRateExceeded",
      disableDevice: false,
    },
    nowMs: 2_000,
  });

  await expect(
    t.mutation(persistDailyPromptDeliveryOutcome, {
      attemptId: seeded.attemptId,
      outcome: { status: "provider_accepted", expoTicketId: "conflicting-ticket" },
      nowMs: 3_000,
    }),
  ).resolves.toEqual({ disposition: "already_persisted", status: "provider_rejected" });
  const attempt = await t.run(async (ctx) => ctx.db.get(seeded.attemptId));
  expect(attempt).toMatchObject({
    status: "provider_rejected",
    expoErrorCode: "MessageRateExceeded",
    updatedAt: 2_000,
  });
  expect(attempt).not.toHaveProperty("expoTicketId");
});

test("conflicting replay after finalized unknown cannot overwrite it", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedReservedAttempt(t);
  await startProvisional(t, seeded.attemptId);
  await t.mutation(persistDailyPromptDeliveryOutcome, {
    attemptId: seeded.attemptId,
    outcome: { status: "sending_unknown" },
    nowMs: 2_000,
  });

  await expect(
    t.mutation(persistDailyPromptDeliveryOutcome, {
      attemptId: seeded.attemptId,
      outcome: { status: "provider_accepted", expoTicketId: "conflicting-ticket" },
      nowMs: 3_000,
    }),
  ).resolves.toEqual({ disposition: "already_persisted", status: "sending_unknown" });
  const attempt = await t.run(async (ctx) => ctx.db.get(seeded.attemptId));
  expect(attempt).toMatchObject({ status: "sending_unknown", outcomePersistedAt: 2_000 });
  expect(attempt).not.toHaveProperty("expoTicketId");
});

test("stale DeviceNotRegistered cannot disable a device after its token rotates", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedReservedAttempt(t);
  await startProvisional(t, seeded.attemptId);
  await t.run(async (ctx) => {
    const device = await ctx.db
      .query("notificationDevices")
      .withIndex("by_user_id_and_device_id", (q) =>
        q.eq("userId", seeded.firstUserId).eq("deviceId", "device-1"),
      )
      .unique();
    if (!device) throw new Error("missing fixture device");
    await ctx.db.patch(device._id, {
      pushToken: "ExponentPushToken[rotated]",
      updatedAt: 1_750,
    });
  });

  await t.mutation(persistDailyPromptDeliveryOutcome, {
    attemptId: seeded.attemptId,
    outcome: {
      status: "provider_rejected",
      expoErrorCode: "DeviceNotRegistered",
      disableDevice: true,
    },
    nowMs: 2_000,
  });
  const stored = await t.run(async (ctx) => ({
    attempt: await ctx.db.get(seeded.attemptId),
    device: await ctx.db
      .query("notificationDevices")
      .withIndex("by_user_id_and_device_id", (q) =>
        q.eq("userId", seeded.firstUserId).eq("deviceId", "device-1"),
      )
      .unique(),
  }));
  expect(stored.attempt).toMatchObject({
    status: "provider_rejected",
    outcomePersistedAt: 2_000,
  });
  expect(stored.device).toMatchObject({
    enabled: true,
    pushToken: "ExponentPushToken[rotated]",
    updatedAt: 1_750,
  });
});

test("actual reservation and outcome mutations let a mocked provider dispatch exactly once across retries", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedReservedAttempt(t);
  await t.run(async (ctx) => {
    await ctx.db.delete(seeded.attemptId);
    await ctx.db.patch(seeded.lifecycleId, { firstStatus: "scheduled" });
  });
  let providerCalls = 0;
  const dependencies = {
    reserve: async (args: { lifecycleId: string; step: "first" | "second"; nowMs: number }) =>
      await t.mutation(reserveDailyPromptDelivery, {
        ...args,
        lifecycleId: args.lifecycleId as Id<"dailyPromptLifecycles">,
      }),
    startDispatch: async (args: { attemptId: string; nowMs: number }) =>
      await t.mutation(startDailyPromptDeliveryDispatch, {
        ...args,
        attemptId: args.attemptId as Id<"dailyPromptDeliveryAttempts">,
      }),
    provider: {
      send: async () => {
        providerCalls += 1;
        const attemptBeforeProvider = await t.run(async (ctx) =>
          ctx.db
            .query("dailyPromptDeliveryAttempts")
            .withIndex("by_lifecycle_id_and_step", (q) =>
              q.eq("lifecycleId", seeded.lifecycleId).eq("step", "first"),
            )
            .unique(),
        );
        expect(attemptBeforeProvider).toMatchObject({
          status: "sending_unknown",
          dispatchStartedAt: 1_000,
        });
        expect(attemptBeforeProvider).not.toHaveProperty("outcomePersistedAt");
        expect(JSON.stringify(attemptBeforeProvider)).not.toContain("ExponentPushToken");
        return { status: "ok", id: "mock-ticket" };
      },
    },
    persist: async (args: {
      attemptId: string;
      outcome:
        | { status: "provider_accepted"; expoTicketId: string }
        | { status: "provider_rejected"; expoErrorCode: string; disableDevice: boolean }
        | { status: "sending_unknown" };
      nowMs: number;
    }) =>
      await t.mutation(persistDailyPromptDeliveryOutcome, {
        ...args,
        attemptId: args.attemptId as Id<"dailyPromptDeliveryAttempts">,
      }),
  };

  const first = await dispatchReservedDailyPrompt(
    { lifecycleId: seeded.lifecycleId, step: "first", nowMs: 1_000 },
    dependencies,
  );
  const retry = await dispatchReservedDailyPrompt(
    { lifecycleId: seeded.lifecycleId, step: "first", nowMs: 2_000 },
    dependencies,
  );
  const attempts = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptDeliveryAttempts")
      .withIndex("by_lifecycle_id_and_step", (q) =>
        q.eq("lifecycleId", seeded.lifecycleId).eq("step", "first"),
      )
      .take(2),
  );

  expect(first).toEqual({ disposition: "persisted", status: "provider_accepted" });
  expect(retry).toEqual({ disposition: "no_send", reason: "attempt_exists" });
  expect(providerCalls).toBe(1);
  expect(attempts).toHaveLength(1);
  expect(attempts[0]).toMatchObject({ status: "provider_accepted", expoTicketId: "mock-ticket" });
});

test("dispatch start distinguishes provisional replay from finalized and legacy unknown", async () => {
  const provisional = convexTest(schema, modules);
  const provisionalSeeded = await seedReservedAttempt(provisional);
  await startProvisional(provisional, provisionalSeeded.attemptId);
  await expect(
    provisional.mutation(startDailyPromptDeliveryDispatch, {
      attemptId: provisionalSeeded.attemptId,
      nowMs: 1_600,
    }),
  ).resolves.toEqual({ disposition: "already_started", status: "sending_unknown" });

  const finalized = convexTest(schema, modules);
  const finalizedSeeded = await seedReservedAttempt(finalized);
  await startProvisional(finalized, finalizedSeeded.attemptId);
  await finalized.mutation(persistDailyPromptDeliveryOutcome, {
    attemptId: finalizedSeeded.attemptId,
    outcome: { status: "sending_unknown" },
    nowMs: 2_000,
  });
  await expect(
    finalized.mutation(startDailyPromptDeliveryDispatch, {
      attemptId: finalizedSeeded.attemptId,
      nowMs: 2_500,
    }),
  ).resolves.toEqual({ disposition: "already_finalized", status: "sending_unknown" });

  const legacy = convexTest(schema, modules);
  const legacySeeded = await seedReservedAttempt(legacy);
  await legacy.run(async (ctx) =>
    ctx.db.patch(legacySeeded.attemptId, { status: "sending_unknown", updatedAt: 1_250 }),
  );
  await expect(
    legacy.mutation(startDailyPromptDeliveryDispatch, {
      attemptId: legacySeeded.attemptId,
      nowMs: 1_500,
    }),
  ).resolves.toEqual({ disposition: "already_finalized", status: "sending_unknown" });
});

test("conflicting concurrent outcome persistence keeps exactly the first committed result", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedReservedAttempt(t);
  await startProvisional(t, seeded.attemptId);

  const results = await Promise.all([
    t.mutation(persistDailyPromptDeliveryOutcome, {
      attemptId: seeded.attemptId,
      outcome: { status: "provider_accepted", expoTicketId: "concurrent-ticket" },
      nowMs: 2_000,
    }),
    t.mutation(persistDailyPromptDeliveryOutcome, {
      attemptId: seeded.attemptId,
      outcome: {
        status: "provider_rejected",
        expoErrorCode: "MessageRateExceeded",
        disableDevice: false,
      },
      nowMs: 2_000,
    }),
  ]);
  const attempt = await t.run(async (ctx) => ctx.db.get(seeded.attemptId));

  expect(results.filter((result) => result.disposition === "persisted")).toHaveLength(1);
  expect(results.filter((result) => result.disposition === "already_persisted")).toHaveLength(1);
  expect(new Set(results.map((result) => result.status))).toEqual(new Set([attempt?.status]));
  expect(attempt?.outcomePersistedAt).toBe(2_000);
  expect(
    attempt?.status === "provider_accepted" ? attempt.expoTicketId : attempt?.expoErrorCode,
  ).toBe(attempt?.status === "provider_accepted" ? "concurrent-ticket" : "MessageRateExceeded");
});

test("replay after a post-provider crash cannot call the provider again", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedReservedAttempt(t);
  await t.run(async (ctx) => {
    await ctx.db.delete(seeded.attemptId);
    await ctx.db.patch(seeded.lifecycleId, { firstStatus: "scheduled" });
  });
  let providerCalls = 0;
  const dependencies = {
    reserve: async (args: { lifecycleId: string; step: "first" | "second"; nowMs: number }) =>
      await t.mutation(reserveDailyPromptDelivery, {
        ...args,
        lifecycleId: args.lifecycleId as Id<"dailyPromptLifecycles">,
      }),
    startDispatch: async (args: { attemptId: string; nowMs: number }) =>
      await t.mutation(startDailyPromptDeliveryDispatch, {
        ...args,
        attemptId: args.attemptId as Id<"dailyPromptDeliveryAttempts">,
      }),
    provider: {
      send: async () => {
        providerCalls += 1;
        return { status: "ok", id: "provider-may-have-sent" };
      },
    },
    persist: async () => {
      throw new Error("simulated crash after provider before outcome persistence");
    },
  };

  await expect(
    dispatchReservedDailyPrompt(
      { lifecycleId: seeded.lifecycleId, step: "first", nowMs: 1_000 },
      dependencies,
    ),
  ).rejects.toThrow("simulated crash after provider");
  await expect(
    dispatchReservedDailyPrompt(
      { lifecycleId: seeded.lifecycleId, step: "first", nowMs: 2_000 },
      dependencies,
    ),
  ).resolves.toEqual({ disposition: "no_send", reason: "attempt_exists" });
  expect(providerCalls).toBe(1);
  const attempts = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptDeliveryAttempts")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", `${seeded.lifecycleId}:first`))
      .take(2),
  );
  expect(attempts).toHaveLength(1);
  expect(attempts[0]).toMatchObject({ status: "sending_unknown", dispatchStartedAt: 1_000 });
  expect(attempts[0]).not.toHaveProperty("outcomePersistedAt");
});

test("concurrent full dispatcher calls converge on one provider invocation and one outcome", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedReservedAttempt(t);
  await t.run(async (ctx) => {
    await ctx.db.delete(seeded.attemptId);
    await ctx.db.patch(seeded.lifecycleId, { firstStatus: "scheduled" });
  });
  let providerCalls = 0;
  const dependencies = {
    reserve: async (args: { lifecycleId: string; step: "first" | "second"; nowMs: number }) =>
      await t.mutation(reserveDailyPromptDelivery, {
        ...args,
        lifecycleId: args.lifecycleId as Id<"dailyPromptLifecycles">,
      }),
    startDispatch: async (args: { attemptId: string; nowMs: number }) =>
      await t.mutation(startDailyPromptDeliveryDispatch, {
        ...args,
        attemptId: args.attemptId as Id<"dailyPromptDeliveryAttempts">,
      }),
    provider: {
      send: async () => {
        providerCalls += 1;
        return { status: "ok", id: "concurrent-ticket" };
      },
    },
    persist: async (args: {
      attemptId: string;
      outcome:
        | { status: "provider_accepted"; expoTicketId: string }
        | { status: "provider_rejected"; expoErrorCode: string; disableDevice: boolean }
        | { status: "sending_unknown" };
      nowMs: number;
    }) =>
      await t.mutation(persistDailyPromptDeliveryOutcome, {
        ...args,
        attemptId: args.attemptId as Id<"dailyPromptDeliveryAttempts">,
      }),
  };

  const results = await Promise.all([
    dispatchReservedDailyPrompt(
      { lifecycleId: seeded.lifecycleId, step: "first", nowMs: 1_000 },
      dependencies,
    ),
    dispatchReservedDailyPrompt(
      { lifecycleId: seeded.lifecycleId, step: "first", nowMs: 1_000 },
      dependencies,
    ),
  ]);

  expect(providerCalls).toBe(1);
  expect(results.map((result) => result.disposition).sort()).toEqual(["no_send", "persisted"]);
  expect(results.find((result) => result.disposition === "no_send")).toEqual({
    disposition: "no_send",
    reason: "attempt_exists",
  });
  const attempts = await t.run(async (ctx) =>
    ctx.db
      .query("dailyPromptDeliveryAttempts")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", `${seeded.lifecycleId}:first`))
      .take(2),
  );
  expect(attempts).toHaveLength(1);
  expect(attempts[0]).toMatchObject({
    status: "provider_accepted",
    expoTicketId: "concurrent-ticket",
    outcomePersistedAt: 1_000,
  });
});
