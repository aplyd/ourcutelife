/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, expect, test, vi } from "vitest";

import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const registerGrantedDevice = makeFunctionReference<
  "mutation",
  {
    deviceId: string;
    platform: "ios" | "android" | "web" | "unknown";
    pushToken: string;
    timezone: string;
  },
  { permissionStatus: "granted"; enabled: boolean }
>("notificationDevices:registerGrantedDevice");
const leaveCouple = makeFunctionReference<"mutation", Record<string, never>, { left: true }>(
  "pairing:leaveCouple",
);
const joinWithCode = makeFunctionReference<
  "mutation",
  { code: string },
  { coupleId: Id<"couples"> }
>("pairing:joinWithCode");
const reservePairingAcceptedNotification = makeFunctionReference<
  "mutation",
  { notificationId: Id<"pairingAcceptedNotifications">; nowMs: number },
  | {
      disposition: "reserved";
      notificationId: Id<"pairingAcceptedNotifications">;
      pushToken: string;
    }
  | { disposition: "no_send"; reason: string }
>("pairingAcceptedNotificationState:reservePairingAcceptedNotification");
const dispatchPairingAcceptedNotification = makeFunctionReference<
  "action",
  { notificationId: Id<"pairingAcceptedNotifications"> },
  unknown
>("pairingAcceptedDispatch:dispatchPairingAcceptedNotification");

async function seedCouple(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const departingUserId = await ctx.db.insert("users", {
      authUserId: "departing-auth",
      email: "departing@example.com",
      createdAt: 1,
      updatedAt: 1,
    });
    const partnerUserId = await ctx.db.insert("users", {
      authUserId: "partner-auth",
      email: "partner@example.com",
      createdAt: 1,
      updatedAt: 1,
    });
    const coupleId = await ctx.db.insert("couples", {
      name: "Us",
      createdByUserId: departingUserId,
      createdAt: 1,
      updatedAt: 1,
    });
    const departingMembershipId = await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: departingUserId,
      role: "partner",
      joinedAt: 1,
    });
    const partnerMembershipId = await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: partnerUserId,
      role: "partner",
      joinedAt: 2,
    });
    const avatarStorageId = await ctx.storage.store(new Blob(["avatar"], { type: "image/png" }));
    await ctx.db.patch(departingMembershipId, { avatarStorageId });
    const momentId = await ctx.db.insert("moments", {
      coupleId,
      authorUserId: departingUserId,
      happenedAt: 1,
      createdAt: 1,
      summary: "Shared memory",
      feeling: "Loved",
      tone: "good",
      tags: [],
    });
    const activeCodeId = await ctx.db.insert("pairingCodes", {
      coupleId,
      code: "123456",
      createdByUserId: departingUserId,
      expiresAt: Date.now() + 60_000,
      createdAt: 1,
    });
    const departingDeviceId = await ctx.db.insert("notificationDevices", {
      coupleId,
      userId: departingUserId,
      deviceId: "departing-ios",
      pushToken: "ExponentPushToken[departing]",
      platform: "ios",
      permissionStatus: "granted",
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    });
    const partnerDeviceId = await ctx.db.insert("notificationDevices", {
      coupleId,
      userId: partnerUserId,
      deviceId: "partner-ios",
      pushToken: "ExponentPushToken[partner]",
      platform: "ios",
      permissionStatus: "granted",
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    });

    return {
      activeCodeId,
      avatarStorageId,
      coupleId,
      departingDeviceId,
      departingMembershipId,
      departingUserId,
      momentId,
      partnerDeviceId,
      partnerMembershipId,
      partnerUserId,
    };
  });
}

async function seedPendingPairingNotification(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const creatorUserId = await ctx.db.insert("users", {
      authUserId: "creator-notification-auth",
      createdAt: 1,
      updatedAt: 1,
    });
    const joinerUserId = await ctx.db.insert("users", {
      authUserId: "joiner-notification-auth",
      createdAt: 1,
      updatedAt: 1,
    });
    const coupleId = await ctx.db.insert("couples", {
      name: "Us",
      createdByUserId: creatorUserId,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: creatorUserId,
      role: "partner",
      joinedAt: 1,
    });
    await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: joinerUserId,
      role: "partner",
      joinedAt: 2,
    });
    const pairingCodeId = await ctx.db.insert("pairingCodes", {
      coupleId,
      code: "111222",
      createdByUserId: creatorUserId,
      expiresAt: 10_000,
      usedAt: 2,
      usedByUserId: joinerUserId,
      createdAt: 1,
    });
    const deviceId = await ctx.db.insert("notificationDevices", {
      coupleId,
      userId: creatorUserId,
      deviceId: "creator-notification-ios",
      pushToken: "ExponentPushToken[creator-notification]",
      platform: "ios",
      permissionStatus: "granted",
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    });
    const notificationId = await ctx.db.insert("pairingAcceptedNotifications", {
      pairingCodeId,
      coupleId,
      recipientUserId: creatorUserId,
      status: "pending",
      createdAt: 2,
      updatedAt: 2,
    });
    return { coupleId, creatorUserId, deviceId, notificationId };
  });
}

test("authenticated user leaves without deleting their partner or shared couple data", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedCouple(t);
  await t.run(async (ctx) => {
    for (let index = 0; index < 64; index += 1) {
      await ctx.db.insert("pairingCodes", {
        coupleId: seeded.coupleId,
        createdByUserId: seeded.departingUserId,
        code: String(200000 + index),
        expiresAt: Date.now() + 60_000,
        createdAt: index + 2,
      });
      await ctx.db.insert("notificationDevices", {
        coupleId: seeded.coupleId,
        userId: seeded.departingUserId,
        deviceId: `departing-extra-${index}`,
        platform: "ios",
        permissionStatus: "granted",
        enabled: true,
        createdAt: index + 2,
        updatedAt: index + 2,
      });
    }
  });

  vi.useFakeTimers();
  try {
    await expect(
      t.withIdentity({ tokenIdentifier: "departing-auth" }).mutation(leaveCouple, {}),
    ).resolves.toEqual({ left: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  } finally {
    vi.useRealTimers();
  }

  const state = await t.run(async (ctx) => ({
    activeCode: await ctx.db.get(seeded.activeCodeId),
    avatarStorage: await ctx.db.system.get("_storage", seeded.avatarStorageId),
    allCodes: await ctx.db
      .query("pairingCodes")
      .withIndex("by_couple", (q) => q.eq("coupleId", seeded.coupleId))
      .collect(),
    allDepartingDevices: await ctx.db
      .query("notificationDevices")
      .withIndex("by_couple_id_and_user_id", (q) =>
        q.eq("coupleId", seeded.coupleId).eq("userId", seeded.departingUserId),
      )
      .collect(),
    couple: await ctx.db.get(seeded.coupleId),
    departingDevice: await ctx.db.get(seeded.departingDeviceId),
    departingMembership: await ctx.db.get(seeded.departingMembershipId),
    departingUser: await ctx.db.get(seeded.departingUserId),
    moment: await ctx.db.get(seeded.momentId),
    partnerDevice: await ctx.db.get(seeded.partnerDeviceId),
    partnerMembership: await ctx.db.get(seeded.partnerMembershipId),
    partnerUser: await ctx.db.get(seeded.partnerUserId),
  }));

  expect(state.departingMembership).toBeNull();
  expect(state.avatarStorage).toBeNull();
  expect(state.partnerMembership).not.toBeNull();
  expect(state.partnerUser).not.toBeNull();
  expect(state.departingUser).not.toBeNull();
  expect(state.couple).not.toBeNull();
  expect(state.moment).toMatchObject({ summary: "Shared memory", coupleId: seeded.coupleId });
  expect(state.activeCode?.usedAt).toEqual(expect.any(Number));
  expect(state.allCodes).toHaveLength(65);
  expect(state.allCodes.every((code) => typeof code.usedAt === "number")).toBe(true);
  expect(state.allDepartingDevices).toHaveLength(65);
  expect(state.allDepartingDevices.every((device) => !device.enabled)).toBe(true);
  expect(state.departingDevice).toMatchObject({ enabled: false, coupleId: seeded.coupleId });
  expect(state.partnerDevice).toMatchObject({ enabled: true, coupleId: seeded.coupleId });

  await expect(
    t.withIdentity({ tokenIdentifier: "departing-auth" }).mutation(leaveCouple, {}),
  ).rejects.toThrow("Pair with your partner first.");
  await expect(
    t.run(async (ctx) => ctx.db.get(seeded.partnerMembershipId)),
  ).resolves.not.toBeNull();
});

test("leaving preserves avatar storage still referenced by the surviving membership", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const departingUserId = await ctx.db.insert("users", {
      authUserId: "shared-avatar-departing-auth",
      createdAt: 1,
      updatedAt: 1,
    });
    const partnerUserId = await ctx.db.insert("users", { createdAt: 1, updatedAt: 1 });
    const coupleId = await ctx.db.insert("couples", {
      name: "Us",
      createdByUserId: departingUserId,
      createdAt: 1,
      updatedAt: 1,
    });
    const sharedStorageId = await ctx.storage.store(
      new Blob([new Uint8Array([4])], { type: "image/png" }),
    );
    await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: departingUserId,
      role: "partner",
      joinedAt: 1,
      avatarStorageId: sharedStorageId,
    });
    const partnerMembershipId = await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: partnerUserId,
      role: "partner",
      joinedAt: 2,
      avatarStorageId: sharedStorageId,
    });
    return { partnerMembershipId, sharedStorageId };
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "shared-avatar-departing-auth" }).mutation(leaveCouple, {}),
  ).resolves.toEqual({ left: true });
  await expect(
    t.run(async (ctx) => ctx.db.get(seeded.partnerMembershipId)),
  ).resolves.not.toBeNull();
  await expect(
    t.run(async (ctx) => ctx.db.system.get(seeded.sharedStorageId)),
  ).resolves.not.toBeNull();
});

test("leave couple removes every caller membership so ambiguous pairing can recover", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedCouple(t);
  const secondCoupleId = await t.run(async (ctx) => {
    const coupleId = await ctx.db.insert("couples", {
      name: "Ambiguous",
      createdByUserId: seeded.departingUserId,
      createdAt: 2,
      updatedAt: 2,
    });
    await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: seeded.departingUserId,
      role: "partner",
      joinedAt: 2,
    });
    return coupleId;
  });
  const danglingCoupleId = await t.run(async (ctx) => {
    const coupleId = await ctx.db.insert("couples", {
      name: "Deleted",
      createdByUserId: seeded.departingUserId,
      createdAt: 3,
      updatedAt: 3,
    });
    await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: seeded.departingUserId,
      role: "partner",
      joinedAt: 3,
    });
    await ctx.db.delete(coupleId);
    return coupleId;
  });

  vi.useFakeTimers();
  try {
    await expect(
      t.withIdentity({ tokenIdentifier: "departing-auth" }).mutation(leaveCouple, {}),
    ).resolves.toEqual({ left: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  } finally {
    vi.useRealTimers();
  }

  const memberships = await t.run(async (ctx) =>
    ctx.db
      .query("coupleMembers")
      .withIndex("by_user", (q) => q.eq("userId", seeded.departingUserId))
      .take(3),
  );
  expect(memberships).toEqual([]);
  await expect(
    t.run(async (ctx) => ctx.db.get(seeded.partnerMembershipId)),
  ).resolves.not.toBeNull();
  await expect(t.run(async (ctx) => ctx.db.get(seeded.coupleId))).resolves.not.toBeNull();
  await expect(t.run(async (ctx) => ctx.db.get(secondCoupleId))).resolves.not.toBeNull();
  await expect(t.run(async (ctx) => ctx.db.get(danglingCoupleId))).resolves.toBeNull();
});

test("a crash after reservation remains explicitly uncertain and is never resent", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedPendingPairingNotification(t);

  await expect(
    t.mutation(reservePairingAcceptedNotification, {
      notificationId: seeded.notificationId,
      nowMs: 100,
    }),
  ).resolves.toMatchObject({ disposition: "reserved" });
  await expect(t.run(async (ctx) => ctx.db.get(seeded.notificationId))).resolves.toMatchObject({
    status: "sending_unknown",
    dispatchStartedAt: 100,
  });
  await expect(
    t.mutation(reservePairingAcceptedNotification, {
      notificationId: seeded.notificationId,
      nowMs: 101,
    }),
  ).resolves.toEqual({
    disposition: "no_send",
    reason: "notification_already_started",
  });
});

test("pairing acceptance waits for creator registration instead of permanently skipping", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-03T12:00:00.000Z"));
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ data: { status: "ok", id: "delayed-registration-ticket" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const t = convexTest(schema, modules);
  const seeded = await seedPendingPairingNotification(t);
  await t.run(async (ctx) => ctx.db.delete(seeded.deviceId));

  await t.action(dispatchPairingAcceptedNotification, { notificationId: seeded.notificationId });
  expect(fetchMock).not.toHaveBeenCalled();
  await expect(t.run(async (ctx) => ctx.db.get(seeded.notificationId))).resolves.toMatchObject({
    status: "awaiting_permission",
    registrationRetryCount: 1,
    nextRegistrationRetryAt: Date.now() + 2_000,
  });

  await t
    .withIdentity({ tokenIdentifier: "creator-notification-auth" })
    .mutation(registerGrantedDevice, {
      deviceId: "creator-delayed-ios",
      platform: "ios",
      pushToken: "ExponentPushToken[creator-delayed]",
      timezone: "America/Los_Angeles",
    });

  vi.advanceTimersByTime(2_000);
  await t.finishInProgressScheduledFunctions();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await expect(t.run(async (ctx) => ctx.db.get(seeded.notificationId))).resolves.toMatchObject({
    status: "provider_accepted",
    expoTicketId: "delayed-registration-ticket",
  });
});

test("concurrent duplicate dispatches reserve only one provider side effect", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedPendingPairingNotification(t);
  let announceFetchStarted: (() => void) | undefined;
  const fetchStarted = new Promise<void>((resolve) => {
    announceFetchStarted = resolve;
  });
  let releaseFetch: (() => void) | undefined;
  const fetchRelease = new Promise<void>((resolve) => {
    releaseFetch = resolve;
  });
  const fetchMock = vi.fn(async () => {
    announceFetchStarted?.();
    await fetchRelease;
    return new Response(JSON.stringify({ data: { status: "ok", id: "concurrent-ticket" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);

  const firstDispatch = t.action(dispatchPairingAcceptedNotification, {
    notificationId: seeded.notificationId,
  });
  await fetchStarted;
  await expect(
    t.action(dispatchPairingAcceptedNotification, { notificationId: seeded.notificationId }),
  ).resolves.toEqual({ disposition: "no_send", reason: "notification_already_started" });
  releaseFetch?.();
  await expect(firstDispatch).resolves.toMatchObject({ disposition: "persisted" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("registration retry exhaustion terminates without provider delivery", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-03T12:00:00.000Z"));
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const t = convexTest(schema, modules);
  const seeded = await seedPendingPairingNotification(t);
  await t.run(async (ctx) => ctx.db.delete(seeded.deviceId));

  await t.action(dispatchPairingAcceptedNotification, { notificationId: seeded.notificationId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(fetchMock).not.toHaveBeenCalled();
  await expect(t.run(async (ctx) => ctx.db.get(seeded.notificationId))).resolves.toMatchObject({
    status: "skipped",
    skippedReason: "permission_unavailable",
    registrationRetryCount: 60,
    outcomePersistedAt: expect.any(Number),
  });
});

test.each([
  {
    name: "provider rejection",
    response: () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ data: { status: "error", details: { error: "DeviceNotRegistered" } } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    expectedStatus: "provider_rejected",
    deviceEnabled: false,
  },
  {
    name: "malformed provider ticket",
    response: () =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { status: "ok" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    expectedStatus: "sending_unknown",
    deviceEnabled: true,
  },
  {
    name: "network failure",
    response: () => Promise.reject(new Error("offline")),
    expectedStatus: "sending_unknown",
    deviceEnabled: true,
  },
])(
  "pairing dispatch persists $name without retrying",
  async ({ response, expectedStatus, deviceEnabled }) => {
    const t = convexTest(schema, modules);
    const seeded = await seedPendingPairingNotification(t);
    const fetchMock = vi.fn(response);
    vi.stubGlobal("fetch", fetchMock);

    await t.action(dispatchPairingAcceptedNotification, { notificationId: seeded.notificationId });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(t.run(async (ctx) => ctx.db.get(seeded.notificationId))).resolves.toMatchObject({
      status: expectedStatus,
      outcomePersistedAt: expect.any(Number),
    });
    await expect(t.run(async (ctx) => ctx.db.get(seeded.deviceId))).resolves.toMatchObject({
      enabled: deviceEnabled,
    });
    await t.action(dispatchPairingAcceptedNotification, { notificationId: seeded.notificationId });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);

test("joining schedules one private idempotent notification for the code creator", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-03T12:00:00.000Z"));
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: { status: "ok", id: "pairing-ticket" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const creatorUserId = await ctx.db.insert("users", {
      authUserId: "creator-auth",
      email: "creator@example.com",
      createdAt: 1,
      updatedAt: 1,
    });
    const joinerUserId = await ctx.db.insert("users", {
      authUserId: "joiner-auth",
      email: "joiner@example.com",
      createdAt: 1,
      updatedAt: 1,
    });
    const coupleId = await ctx.db.insert("couples", {
      name: "Us",
      createdByUserId: creatorUserId,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: creatorUserId,
      role: "partner",
      joinedAt: 1,
    });
    const pairingCodeId = await ctx.db.insert("pairingCodes", {
      coupleId,
      code: "654321",
      createdByUserId: creatorUserId,
      expiresAt: Date.now() + 60_000,
      createdAt: 1,
    });
    await ctx.db.insert("notificationDevices", {
      coupleId,
      userId: creatorUserId,
      deviceId: "creator-ios",
      pushToken: "ExponentPushToken[creator]",
      platform: "ios",
      permissionStatus: "granted",
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    });
    return { coupleId, creatorUserId, joinerUserId, pairingCodeId };
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "joiner-auth" }).mutation(joinWithCode, { code: "654-321" }),
  ).resolves.toEqual({ coupleId: seeded.coupleId });

  const notification = await t.run(async (ctx) =>
    ctx.db
      .query("pairingAcceptedNotifications")
      .withIndex("by_pairing_code_id", (q) => q.eq("pairingCodeId", seeded.pairingCodeId))
      .unique(),
  );
  expect(notification).toMatchObject({
    coupleId: seeded.coupleId,
    pairingCodeId: seeded.pairingCodeId,
    recipientUserId: seeded.creatorUserId,
    status: "pending",
    schedulerJobId: expect.any(String),
  });
  if (!notification) throw new Error("Expected pairing acceptance notification");

  vi.advanceTimersByTime(0);
  await t.finishInProgressScheduledFunctions();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const request = fetchMock.mock.calls[0]?.[1];
  const body = request?.body;
  expect(typeof body).toBe("string");
  if (typeof body !== "string") throw new Error("Expected JSON push body");
  const payload = JSON.parse(body);
  expect(payload).toEqual({
    to: "ExponentPushToken[creator]",
    sound: "default",
    title: "You're paired!",
    body: "Your partner joined Our Cute Life.",
    data: { url: "/" },
  });

  await expect(
    t.mutation(reservePairingAcceptedNotification, {
      notificationId: notification._id,
      nowMs: Date.now() + 1,
    }),
  ).resolves.toEqual({
    disposition: "no_send",
    reason: "notification_already_started",
  });

  const persisted = await t.run(async (ctx) => ctx.db.get(notification._id));
  expect(persisted).toMatchObject({
    status: "provider_accepted",
    deviceId: "creator-ios",
    expoTicketId: "pairing-ticket",
  });
  expect(persisted).not.toHaveProperty("pushToken");
});
