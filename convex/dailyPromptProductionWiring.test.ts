/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, expect, test, vi } from "vitest";

import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const planDailyPrompts = makeFunctionReference<
  "mutation",
  { cursor: string | null },
  { processed: number; continueCursor: string | null }
>("dailyPromptLifecycles:planDailyPrompts");
const answer = makeFunctionReference<
  "mutation",
  { promptDate: string; response: string },
  Id<"promptResponses">
>("prompts:answer");
const reserveDailyPromptDelivery = makeFunctionReference<
  "mutation",
  { lifecycleId: Id<"dailyPromptLifecycles">; step: "first" | "second"; nowMs: number },
  { disposition: "reserved" | "no_send"; attemptId?: Id<"dailyPromptDeliveryAttempts"> }
>("dailyPromptDeliveryReservation:reserveDailyPromptDelivery");
const startDailyPromptDeliveryDispatch = makeFunctionReference<
  "mutation",
  { attemptId: Id<"dailyPromptDeliveryAttempts">; nowMs: number },
  { disposition: "started" | "already_started" | "already_finalized" }
>("dailyPromptDeliveryStart:startDailyPromptDeliveryDispatch");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function seedReadyCouple(t: ReturnType<typeof convexTest>) {
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
      promptTimezoneUpdatedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.run(async (ctx) => {
    for (const [userId, deviceId] of [
      [firstUserId, "first-ios"],
      [secondUserId, "second-ios"],
    ] as const) {
      await ctx.db.insert("coupleMembers", {
        coupleId,
        userId,
        role: "partner",
        joinedAt: userId === firstUserId ? 10 : 20,
      });
      await ctx.db.insert("notificationDevices", {
        coupleId,
        userId,
        deviceId,
        pushToken: `ExponentPushToken[${deviceId}]`,
        platform: "ios",
        permissionStatus: "granted",
        timezone: "America/New_York",
        enabled: true,
        createdAt: 1,
        updatedAt: 1,
      });
    }
  });
  return { coupleId, firstUserId, secondUserId };
}

async function seedLegacySecondBoundary(
  t: ReturnType<typeof convexTest>,
  seeded: Awaited<ReturnType<typeof seedReadyCouple>>,
  boundaryState: "success" | "failed" | "canceled" | "pending" | "inProgress",
) {
  const lifecycleId = await t.run(async (ctx) =>
    ctx.db.insert("dailyPromptLifecycles", {
      coupleId: seeded.coupleId,
      promptDate: "2026-07-22",
      timezone: "America/New_York",
      firstUserId: seeded.firstUserId,
      secondUserId: seeded.secondUserId,
      randomizedFirstLocalMinute: 1140,
      firstScheduledAt: Date.now() - 600_000,
      firstStatus: "sent",
      secondStatus: "pending",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const firstStartedAt = Date.now() - 300_000;
  const secondScheduledAt = Date.now();
  const secondSchedulerJobId = await t.run(async (ctx) =>
    ctx.scheduler.runAt(
      secondScheduledAt,
      makeFunctionReference<"mutation", { lifecycleId: Id<"dailyPromptLifecycles"> }, null>(
        "prompts:secondAnswerBoundary",
      ),
      { lifecycleId },
    ),
  );
  const validPatch = {
    firstStartedAt,
    secondScheduledAt,
    secondDeliveryKey: `${lifecycleId}:second`,
    secondSchedulerJobId: String(secondSchedulerJobId),
    secondStatus: "scheduled" as const,
    updatedAt: Date.now(),
  };
  if (boundaryState === "success") {
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();
    await t.run(async (ctx) => ctx.db.patch(lifecycleId, validPatch));
  } else if (boundaryState === "failed") {
    await t.run(async (ctx) =>
      ctx.db.patch(lifecycleId, { ...validPatch, secondDeliveryKey: "malformed" }),
    );
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();
    await t.run(async (ctx) => ctx.db.patch(lifecycleId, validPatch));
  } else if (boundaryState === "canceled") {
    await t.run(async (ctx) => {
      await ctx.scheduler.cancel(secondSchedulerJobId);
      await ctx.db.patch(lifecycleId, validPatch);
    });
  } else if (boundaryState === "inProgress") {
    await t.run(async (ctx) => {
      await ctx.db.patch(lifecycleId, validPatch);
      await (ctx.db as unknown as { patch: (id: unknown, value: unknown) => Promise<void> }).patch(
        secondSchedulerJobId,
        { state: { kind: "inProgress" } },
      );
    });
  } else {
    await t.run(async (ctx) => ctx.db.patch(lifecycleId, validPatch));
  }
  return { lifecycleId, firstStartedAt, secondScheduledAt, secondSchedulerJobId };
}

test("production planner schedules and dispatches the first daily prompt through the Expo adapter", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T20:30:00.000Z"));
  vi.spyOn(Math, "random").mockReturnValue(0);
  const fetchMock = vi.fn(
    async (_input: string | URL | Request) =>
      new Response(JSON.stringify({ data: { status: "ok", id: "first-ticket" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const t = convexTest(schema, modules);
  const seeded = await seedReadyCouple(t);

  await expect(t.mutation(planDailyPrompts, { cursor: null })).resolves.toMatchObject({
    processed: 1,
    continueCursor: null,
  });
  const planned = await t.run(async (ctx) => ({
    lifecycle: await ctx.db.query("dailyPromptLifecycles").unique(),
    jobs: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(planned.lifecycle).toMatchObject({
    coupleId: seeded.coupleId,
    promptDate: "2026-07-22",
    firstUserId: seeded.firstUserId,
    firstStatus: "scheduled",
    firstScheduledAt: Date.parse("2026-07-22T23:00:00.000Z"),
  });
  expect(planned.jobs).toHaveLength(1);
  expect(planned.jobs[0]).toMatchObject({
    name: "dailyPromptDispatch:dispatchDailyPrompt",
    args: [{ lifecycleId: planned.lifecycle?._id, step: "first" }],
    scheduledTime: Date.parse("2026-07-22T23:00:00.000Z"),
  });

  vi.advanceTimersByTime(2.5 * 60 * 60 * 1000);
  await t.finishInProgressScheduledFunctions();

  const dispatched = await t.run(async (ctx) => ({
    lifecycle: await ctx.db.query("dailyPromptLifecycles").unique(),
    attempts: await ctx.db.query("dailyPromptDeliveryAttempts").collect(),
  }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]?.[0]).toBe("https://exp.host/--/api/v2/push/send");
  expect(dispatched.lifecycle).toMatchObject({ firstStatus: "sent" });
  expect(dispatched.attempts).toHaveLength(1);
  expect(dispatched.attempts[0]).toMatchObject({
    step: "first",
    status: "provider_accepted",
    expoTicketId: "first-ticket",
  });
  expect(JSON.stringify(dispatched.attempts)).not.toContain("ExponentPushToken");
});

test("planner replaces a failed first dispatch scheduler only while provider start is provably absent", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T20:30:00.000Z"));
  vi.spyOn(Math, "random").mockReturnValue(0);
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ data: { status: "ok", id: "recovered-first" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const t = convexTest(schema, modules);
  await seedReadyCouple(t);
  await t.mutation(planDailyPrompts, { cursor: null });

  const before = await t.run(async (ctx) => ctx.db.query("dailyPromptLifecycles").unique());
  if (!before?.firstSchedulerJobId) throw new Error("Expected first scheduler job");
  vi.spyOn(globalThis.crypto.subtle, "digest").mockRejectedValueOnce(
    new Error("simulated pre-provider reservation failure"),
  );
  vi.advanceTimersByTime(2.5 * 60 * 60 * 1000);
  await t.finishInProgressScheduledFunctions();
  expect(fetchMock).not.toHaveBeenCalled();

  await t.mutation(planDailyPrompts, { cursor: null });
  const recovered = await t.run(async (ctx) => ({
    lifecycle: await ctx.db.get(before._id),
    jobs: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(recovered.lifecycle?.firstSchedulerJobId).not.toBe(before.firstSchedulerJobId);
  expect(recovered.jobs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ _id: before.firstSchedulerJobId, state: { kind: "failed" } }),
      expect.objectContaining({
        _id: recovered.lifecycle?.firstSchedulerJobId,
        name: "dailyPromptDispatch:dispatchDailyPrompt",
        state: { kind: "pending" },
      }),
    ]),
  );

  vi.advanceTimersByTime(0);
  await t.finishInProgressScheduledFunctions();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await t.mutation(planDailyPrompts, { cursor: null });
  const finalized = await t.run(async (ctx) => ({
    lifecycle: await ctx.db.get(before._id),
    jobs: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(finalized.lifecycle).toMatchObject({ firstStatus: "sent" });
  expect(finalized.jobs).toHaveLength(2);
});

test("eligibility disappearing before first reservation terminalizes once with no provider call", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T20:30:00.000Z"));
  vi.spyOn(Math, "random").mockReturnValue(0);
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const t = convexTest(schema, modules);
  const seeded = await seedReadyCouple(t);
  await t.mutation(planDailyPrompts, { cursor: null });
  await t.run(async (ctx) => {
    const device = await ctx.db
      .query("notificationDevices")
      .withIndex("by_user_id_and_device_id", (q) =>
        q.eq("userId", seeded.firstUserId).eq("deviceId", "first-ios"),
      )
      .unique();
    if (!device) throw new Error("Expected first device");
    await ctx.db.patch(device._id, { enabled: false, updatedAt: Date.now() });
  });

  vi.advanceTimersByTime(2.5 * 60 * 60 * 1000);
  await t.finishInProgressScheduledFunctions();
  expect(fetchMock).not.toHaveBeenCalled();
  const terminal = await t.run(async (ctx) => ({
    lifecycle: await ctx.db.query("dailyPromptLifecycles").unique(),
    attempts: await ctx.db.query("dailyPromptDeliveryAttempts").collect(),
    jobs: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(terminal.lifecycle).toMatchObject({
    firstStatus: "skipped",
    skippedReason: "skipped_pre_provider_unavailable",
  });
  expect(terminal.attempts).toHaveLength(0);
  expect(terminal.jobs).toHaveLength(1);
  expect(terminal.jobs[0]).toMatchObject({ state: { kind: "success" } });

  await t.mutation(planDailyPrompts, { cursor: null });
  const replay = await t.run(async (ctx) => ({
    lifecycle: await ctx.db.query("dailyPromptLifecycles").unique(),
    jobs: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(fetchMock).not.toHaveBeenCalled();
  expect(replay.lifecycle).toMatchObject({ firstStatus: "skipped" });
  expect(replay.jobs).toHaveLength(1);
});

test.each(["rotated", "disabled", "removed", "couple_mismatch"] as const)(
  "reserved %s route is abandoned pre-provider and remains a planner no-op",
  async (change) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T20:30:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValue(0);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const seeded = await seedReadyCouple(t);
    await t.mutation(planDailyPrompts, { cursor: null });
    const lifecycle = await t.run(async (ctx) => ctx.db.query("dailyPromptLifecycles").unique());
    if (!lifecycle?.firstSchedulerJobId) throw new Error("Expected first scheduler job");
    const reservation = await t.mutation(reserveDailyPromptDelivery, {
      lifecycleId: lifecycle._id,
      step: "first",
      nowMs: lifecycle.firstScheduledAt,
    });
    if (reservation.disposition !== "reserved" || !reservation.attemptId) {
      throw new Error("Expected reservation");
    }
    const attemptId: Id<"dailyPromptDeliveryAttempts"> = reservation.attemptId;
    await t.run(async (ctx) =>
      ctx.scheduler.cancel(lifecycle.firstSchedulerJobId as Id<"_scheduled_functions">),
    );
    await t.mutation(planDailyPrompts, { cursor: null });

    await t.run(async (ctx) => {
      const device = await ctx.db
        .query("notificationDevices")
        .withIndex("by_user_id_and_device_id", (q) =>
          q.eq("userId", seeded.firstUserId).eq("deviceId", "first-ios"),
        )
        .unique();
      if (!device) throw new Error("Expected first device");
      if (change === "removed") await ctx.db.delete(device._id);
      else if (change === "rotated") {
        await ctx.db.patch(device._id, {
          pushToken: "ExponentPushToken[rotated-first]",
          updatedAt: lifecycle.firstScheduledAt,
        });
      } else if (change === "disabled") {
        await ctx.db.patch(device._id, { enabled: false, updatedAt: lifecycle.firstScheduledAt });
      } else {
        const otherCoupleId = await ctx.db.insert("couples", {
          name: "Other",
          createdByUserId: seeded.firstUserId,
          createdAt: lifecycle.firstScheduledAt,
          updatedAt: lifecycle.firstScheduledAt,
        });
        await ctx.db.patch(device._id, {
          coupleId: otherCoupleId,
          updatedAt: lifecycle.firstScheduledAt,
        });
      }
    });

    vi.advanceTimersByTime(2.5 * 60 * 60 * 1000);
    await t.finishInProgressScheduledFunctions();
    expect(fetchMock).not.toHaveBeenCalled();
    const terminal = await t.run(async (ctx) => ({
      lifecycle: await ctx.db.get(lifecycle._id),
      attempt: await ctx.db.get(attemptId),
      jobs: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(terminal.attempt).toMatchObject({
      status: "abandoned",
      abandonedAt: lifecycle.firstScheduledAt,
    });
    expect(terminal.attempt?.dispatchStartedAt).toBeUndefined();
    expect(terminal.attempt?.outcomePersistedAt).toBeUndefined();
    expect(terminal.lifecycle).toMatchObject({
      firstStatus: "skipped",
      skippedReason: "skipped_pre_provider_unavailable",
    });
    expect(terminal.jobs).toHaveLength(2);
    expect(terminal.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: { kind: "canceled" } }),
        expect.objectContaining({ state: { kind: "success" } }),
      ]),
    );

    await t.mutation(planDailyPrompts, { cursor: null });
    const jobs = await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(jobs).toHaveLength(2);
  },
);

test("planner never replaces a failed dispatch scheduler after durable provider start", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T20:30:00.000Z"));
  vi.spyOn(Math, "random").mockReturnValue(0);
  const t = convexTest(schema, modules);
  await seedReadyCouple(t);
  await t.mutation(planDailyPrompts, { cursor: null });
  const lifecycle = await t.run(async (ctx) => ctx.db.query("dailyPromptLifecycles").unique());
  if (!lifecycle?.firstSchedulerJobId) throw new Error("Expected first scheduler job");
  const reservation = await t.mutation(reserveDailyPromptDelivery, {
    lifecycleId: lifecycle._id,
    step: "first",
    nowMs: lifecycle.firstScheduledAt,
  });
  if (reservation.disposition !== "reserved" || !reservation.attemptId) {
    throw new Error("Expected reservation");
  }
  await t.mutation(startDailyPromptDeliveryDispatch, {
    attemptId: reservation.attemptId,
    nowMs: lifecycle.firstScheduledAt,
  });
  await t.run(async (ctx) =>
    ctx.scheduler.cancel(lifecycle.firstSchedulerJobId as Id<"_scheduled_functions">),
  );

  await t.mutation(planDailyPrompts, { cursor: null });
  const after = await t.run(async (ctx) => ({
    lifecycle: await ctx.db.get(lifecycle._id),
    jobs: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(after.lifecycle?.firstSchedulerJobId).toBe(lifecycle.firstSchedulerJobId);
  expect(after.lifecycle).toMatchObject({ firstStatus: "sending" });
  expect(after.jobs).toHaveLength(1);
});

test("answer-start boundary schedules and dispatches the second daily prompt through the same adapter", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T20:30:00.000Z"));
  vi.spyOn(Math, "random").mockReturnValue(0);
  let ticket = 0;
  const fetchMock = vi.fn(async () => {
    ticket += 1;
    return new Response(JSON.stringify({ data: { status: "ok", id: `ticket-${ticket}` } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  const t = convexTest(schema, modules);
  await seedReadyCouple(t);
  await t.mutation(planDailyPrompts, { cursor: null });

  vi.advanceTimersByTime(2.5 * 60 * 60 * 1000);
  await t.finishInProgressScheduledFunctions();
  vi.advanceTimersByTime(60_000);
  await t.withIdentity({ tokenIdentifier: "first-auth" }).mutation(answer, {
    promptDate: "2026-07-22",
    response: "I started",
  });

  vi.advanceTimersByTime(300_000);
  await t.finishInProgressScheduledFunctions();
  vi.advanceTimersByTime(0);
  await t.finishInProgressScheduledFunctions();

  const state = await t.run(async (ctx) => ({
    lifecycle: await ctx.db.query("dailyPromptLifecycles").unique(),
    attempts: await ctx.db.query("dailyPromptDeliveryAttempts").collect(),
    jobs: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(state.lifecycle).toMatchObject({
    firstStatus: "sent",
    secondStatus: "sent",
    secondDispatchSchedulerJobId: expect.any(String),
  });
  expect(state.attempts.map((attempt) => attempt.step).sort()).toEqual(["first", "second"]);
  expect(state.attempts.every((attempt) => attempt.status === "provider_accepted")).toBe(true);
  expect(state.jobs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "prompts:secondAnswerBoundary", state: { kind: "success" } }),
      expect.objectContaining({
        name: "dailyPromptDispatch:dispatchDailyPrompt",
        state: { kind: "success" },
      }),
    ]),
  );
});

test("planner persists and replaces a failed second dispatch scheduler before provider start", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T20:30:00.000Z"));
  vi.spyOn(Math, "random").mockReturnValue(0);
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ data: { status: "ok", id: "recovered-second" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const t = convexTest(schema, modules);
  await seedReadyCouple(t);
  await t.mutation(planDailyPrompts, { cursor: null });
  vi.advanceTimersByTime(2.5 * 60 * 60 * 1000);
  await t.finishInProgressScheduledFunctions();
  vi.advanceTimersByTime(60_000);
  await t.withIdentity({ tokenIdentifier: "first-auth" }).mutation(answer, {
    promptDate: "2026-07-22",
    response: "I started",
  });
  vi.advanceTimersByTime(300_000);
  await t.finishInProgressScheduledFunctions();

  const before = await t.run(async (ctx) => ctx.db.query("dailyPromptLifecycles").unique());
  if (!before?.secondDispatchSchedulerJobId || before.secondScheduledAt === undefined) {
    throw new Error("Expected persisted second dispatch scheduler");
  }
  vi.spyOn(globalThis.crypto.subtle, "digest").mockRejectedValueOnce(
    new Error("simulated second pre-provider reservation failure"),
  );
  vi.advanceTimersByTime(0);
  await t.finishInProgressScheduledFunctions();
  expect(fetchMock).toHaveBeenCalledTimes(1);

  await t.mutation(planDailyPrompts, { cursor: null });
  const firstRecovery = await t.run(async (ctx) => ({
    lifecycle: await ctx.db.get(before._id),
    jobs: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  const firstRecoveryJobId = firstRecovery.lifecycle?.secondDispatchSchedulerJobId;
  if (!firstRecoveryJobId) throw new Error("Expected first second-step recovery scheduler");
  expect(firstRecoveryJobId).not.toBe(before.secondDispatchSchedulerJobId);
  expect(firstRecovery.jobs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        _id: before.secondDispatchSchedulerJobId,
        state: { kind: "failed" },
      }),
      expect.objectContaining({ _id: firstRecoveryJobId, state: { kind: "pending" } }),
    ]),
  );

  const reservation = await t.mutation(reserveDailyPromptDelivery, {
    lifecycleId: before._id,
    step: "second",
    nowMs: before.secondScheduledAt,
  });
  expect(reservation.disposition).toBe("reserved");
  await t.run(async (ctx) =>
    ctx.scheduler.cancel(firstRecoveryJobId as Id<"_scheduled_functions">),
  );

  await t.mutation(planDailyPrompts, { cursor: null });
  const recovered = await t.run(async (ctx) => ctx.db.get(before._id));
  expect(recovered?.secondDispatchSchedulerJobId).not.toBe(firstRecoveryJobId);
  vi.advanceTimersByTime(0);
  await t.finishInProgressScheduledFunctions();
  expect(fetchMock).toHaveBeenCalledTimes(2);

  await t.mutation(planDailyPrompts, { cursor: null });
  const finalized = await t.run(async (ctx) => ({
    lifecycle: await ctx.db.get(before._id),
    jobs: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(finalized.lifecycle).toMatchObject({ secondStatus: "sent" });
  expect(
    finalized.jobs.filter((job) => job.name === "dailyPromptDispatch:dispatchDailyPrompt"),
  ).toHaveLength(4);
});

test("planner repairs a successful legacy second boundary with exactly one missing dispatch", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ data: { status: "ok", id: "legacy-repair-ticket" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const t = convexTest(schema, modules);
  const seeded = await seedReadyCouple(t);
  const lifecycleId = await t.run(async (ctx) =>
    ctx.db.insert("dailyPromptLifecycles", {
      coupleId: seeded.coupleId,
      promptDate: "2026-07-22",
      timezone: "America/New_York",
      firstUserId: seeded.firstUserId,
      secondUserId: seeded.secondUserId,
      randomizedFirstLocalMinute: 1140,
      firstScheduledAt: Date.parse("2026-07-22T21:00:00.000Z"),
      firstStatus: "sent",
      secondStatus: "pending",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const firstStartedAt = Date.now() - 300_000;
  const secondScheduledAt = Date.now();
  const secondSchedulerJobId = await t.run(async (ctx) =>
    ctx.scheduler.runAt(
      secondScheduledAt,
      makeFunctionReference<"mutation", { lifecycleId: Id<"dailyPromptLifecycles"> }, null>(
        "prompts:secondAnswerBoundary",
      ),
      { lifecycleId },
    ),
  );
  vi.advanceTimersByTime(0);
  await t.finishInProgressScheduledFunctions();
  await t.run(async (ctx) =>
    ctx.db.patch(lifecycleId, {
      firstStartedAt,
      secondScheduledAt,
      secondDeliveryKey: `${lifecycleId}:second`,
      secondSchedulerJobId: String(secondSchedulerJobId),
      secondStatus: "scheduled",
      updatedAt: Date.now(),
    }),
  );
  const legacyBoundary = await t.run(async (ctx) =>
    ctx.db.system.get("_scheduled_functions", secondSchedulerJobId),
  );
  expect(legacyBoundary).toMatchObject({
    name: "prompts:secondAnswerBoundary",
    args: [{ lifecycleId }],
    scheduledTime: secondScheduledAt,
    state: { kind: "success" },
  });

  await t.mutation(planDailyPrompts, { cursor: null });
  await t.mutation(planDailyPrompts, { cursor: null });

  const repaired = await t.run(async (ctx) => ({
    lifecycle: await ctx.db.get(lifecycleId),
    attempts: await ctx.db.query("dailyPromptDeliveryAttempts").collect(),
    jobs: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(fetchMock).not.toHaveBeenCalled();
  expect(repaired.attempts).toHaveLength(0);
  expect(repaired.lifecycle?.secondDispatchSchedulerJobId).toEqual(expect.any(String));
  expect(
    repaired.jobs.filter((job) => job.name === "dailyPromptDispatch:dispatchDailyPrompt"),
  ).toHaveLength(1);
  expect(repaired.jobs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        _id: repaired.lifecycle?.secondDispatchSchedulerJobId,
        args: [{ lifecycleId, step: "second" }],
        scheduledTime: secondScheduledAt,
        state: { kind: "pending" },
      }),
    ]),
  );

  vi.advanceTimersByTime(0);
  await t.finishInProgressScheduledFunctions();
  await t.mutation(planDailyPrompts, { cursor: null });
  vi.advanceTimersByTime(0);
  await t.finishInProgressScheduledFunctions();
  const dispatched = await t.run(async (ctx) => ({
    lifecycle: await ctx.db.get(lifecycleId),
    attempts: await ctx.db.query("dailyPromptDeliveryAttempts").collect(),
    jobs: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(dispatched.lifecycle).toMatchObject({ secondStatus: "sent" });
  expect(dispatched.attempts).toEqual([
    expect.objectContaining({
      idempotencyKey: `${lifecycleId}:second`,
      status: "provider_accepted",
      expoTicketId: "legacy-repair-ticket",
    }),
  ]);
  expect(
    dispatched.jobs.filter((job) => job.name === "dailyPromptDispatch:dispatchDailyPrompt"),
  ).toHaveLength(1);
});

test.each(["failed", "canceled"] as const)(
  "concurrent planners safely rerun a %s legacy second boundary before creating one dispatch",
  async (boundaryState) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const seeded = await seedReadyCouple(t);
    const legacy = await seedLegacySecondBoundary(t, seeded, boundaryState);

    await Promise.all([
      t.mutation(planDailyPrompts, { cursor: null }),
      t.mutation(planDailyPrompts, { cursor: null }),
    ]);
    let repaired = await t.run(async (ctx) => ({
      lifecycle: await ctx.db.get(legacy.lifecycleId),
      jobs: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(repaired.lifecycle?.secondSchedulerJobId).not.toBe(legacy.secondSchedulerJobId);
    expect(repaired.lifecycle?.secondDispatchSchedulerJobId).toBeUndefined();
    expect(repaired.jobs.filter((job) => job.name === "prompts:secondAnswerBoundary")).toHaveLength(
      2,
    );
    expect(
      repaired.jobs.filter((job) => job.name === "dailyPromptDispatch:dispatchDailyPrompt"),
    ).toHaveLength(0);

    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();
    await t.mutation(planDailyPrompts, { cursor: null });
    repaired = await t.run(async (ctx) => ({
      lifecycle: await ctx.db.get(legacy.lifecycleId),
      jobs: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(repaired.lifecycle?.secondDispatchSchedulerJobId).toEqual(expect.any(String));
    expect(
      repaired.jobs.filter((job) => job.name === "dailyPromptDispatch:dispatchDailyPrompt"),
    ).toHaveLength(1);
  },
);

test.each([
  ["reserved attempt", { status: "reserved" as const }],
  ["dispatch start", { status: "reserved" as const, dispatchStartedAt: 10 }],
  [
    "accepted provider ticket/outcome",
    { status: "provider_accepted" as const, expoTicketId: "ticket", outcomePersistedAt: 11 },
  ],
  [
    "rejected provider error/outcome",
    {
      status: "provider_rejected" as const,
      expoErrorCode: "DeviceNotRegistered",
      outcomePersistedAt: 11,
    },
  ],
  ["ambiguous provider outcome", { status: "sending_unknown" as const, outcomePersistedAt: 11 }],
] as const)(
  "legacy success with %s remains fail-closed with no dispatch",
  async (_label, evidence) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const seeded = await seedReadyCouple(t);
    const legacy = await seedLegacySecondBoundary(t, seeded, "success");
    await t.run(async (ctx) => {
      await ctx.db.insert("dailyPromptDeliveryAttempts", {
        lifecycleId: legacy.lifecycleId,
        coupleId: seeded.coupleId,
        promptDate: "2026-07-22",
        step: "second",
        recipientUserId: seeded.secondUserId,
        idempotencyKey: `${legacy.lifecycleId}:second`,
        deviceId: "second-ios",
        ...evidence,
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await t.mutation(planDailyPrompts, { cursor: null });
    const state = await t.run(async (ctx) => ({
      lifecycle: await ctx.db.get(legacy.lifecycleId),
      jobs: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.lifecycle?.secondDispatchSchedulerJobId).toBeUndefined();
    expect(
      state.jobs.filter((job) => job.name === "dailyPromptDispatch:dispatchDailyPrompt"),
    ).toHaveLength(0);
  },
);

test.each(["pending", "inProgress"] as const)(
  "legacy %s second boundary remains a planner no-op",
  async (boundaryState) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
    const t = convexTest(schema, modules);
    const seeded = await seedReadyCouple(t);
    const legacy = await seedLegacySecondBoundary(t, seeded, boundaryState);

    await t.mutation(planDailyPrompts, { cursor: null });
    const state = await t.run(async (ctx) => ({
      lifecycle: await ctx.db.get(legacy.lifecycleId),
      jobs: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.lifecycle?.secondSchedulerJobId).toBe(legacy.secondSchedulerJobId);
    expect(state.lifecycle?.secondDispatchSchedulerJobId).toBeUndefined();
    expect(
      state.jobs.filter((job) => job.name === "dailyPromptDispatch:dispatchDailyPrompt"),
    ).toHaveLength(0);
  },
);

test("missing or malformed second boundary scheduler identity remains fail-closed", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T21:15:00.000Z"));
  const t = convexTest(schema, modules);
  const seeded = await seedReadyCouple(t);
  const missing = await seedLegacySecondBoundary(t, seeded, "success");
  await t.run(async (ctx) =>
    ctx.db.patch(missing.lifecycleId, { secondSchedulerJobId: undefined }),
  );
  await t.mutation(planDailyPrompts, { cursor: null });

  const malformedSeeded = await seedReadyCouple(t);
  const malformed = await seedLegacySecondBoundary(t, malformedSeeded, "success");
  const wrongJobId = await t.run(async (ctx) =>
    ctx.scheduler.runAt(malformed.secondScheduledAt, planDailyPrompts, { cursor: null }),
  );
  await t.run(async (ctx) =>
    ctx.db.patch(malformed.lifecycleId, { secondSchedulerJobId: String(wrongJobId) }),
  );
  await t.mutation(planDailyPrompts, { cursor: null });

  const state = await t.run(async (ctx) => ({
    missing: await ctx.db.get(missing.lifecycleId),
    malformed: await ctx.db.get(malformed.lifecycleId),
    jobs: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(state.missing?.secondDispatchSchedulerJobId).toBeUndefined();
  expect(state.malformed?.secondDispatchSchedulerJobId).toBeUndefined();
  expect(
    state.jobs.filter((job) => job.name === "dailyPromptDispatch:dispatchDailyPrompt"),
  ).toHaveLength(0);
});
