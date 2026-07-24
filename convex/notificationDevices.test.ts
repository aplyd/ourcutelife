/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { expect, test } from "vitest";

import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const reportPermissionObservation = makeFunctionReference<
  "mutation",
  {
    deviceId: string;
    platform: "ios" | "android" | "web" | "unknown";
    permissionStatus: "undetermined" | "denied" | "granted";
    timezone: string;
  },
  { permissionStatus: "undetermined" | "denied" | "granted" | "revoked" }
>("notificationDevices:reportPermissionObservation");

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

const getNotificationReadiness = makeFunctionReference<
  "query",
  Record<string, never>,
  {
    memberCount: number;
    readyMemberCount: number;
    isReady: boolean;
    promptTimezone: string | null;
    blockedReason: string | null;
  }
>("notificationDevices:getNotificationReadiness");

const updatePromptTimezone = makeFunctionReference<
  "mutation",
  { timezone: string },
  { promptTimezone: string }
>("notificationDevices:updatePromptTimezone");

const legacyRegisterToken = makeFunctionReference<
  "mutation",
  {
    token: string;
    platform: "ios" | "android" | "web" | "unknown";
    deviceId?: string;
    timezone?: string;
  },
  { tokenId: string }
>("push:registerToken");

async function seedReadyCouple(t: ReturnType<typeof convexTest>) {
  const creatorUserId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authUserId: "creator-auth",
      email: "creator@example.com",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const partnerUserId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authUserId: "partner-auth",
      email: "partner@example.com",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const coupleId = await t.run(async (ctx) =>
    ctx.db.insert("couples", {
      name: "Us",
      createdByUserId: creatorUserId,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.run(async (ctx) => {
    await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: creatorUserId,
      role: "partner",
      joinedAt: 1,
    });
    await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: partnerUserId,
      role: "partner",
      joinedAt: 2,
    });
  });

  return { coupleId, creatorUserId, partnerUserId };
}

test("authenticated permission observation creates an undetermined device without user-id args", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, creatorUserId } = await seedReadyCouple(t);

  const result = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .mutation(reportPermissionObservation, {
      deviceId: "creator-ios-1",
      platform: "ios",
      permissionStatus: "undetermined",
      timezone: "America/New_York",
    });

  const device = await t.run(async (ctx) =>
    ctx.db
      .query("notificationDevices")
      .withIndex("by_user_id_and_device_id", (q) =>
        q.eq("userId", creatorUserId).eq("deviceId", "creator-ios-1"),
      )
      .unique(),
  );

  expect(result.permissionStatus).toBe("undetermined");
  expect(device).toMatchObject({
    coupleId,
    userId: creatorUserId,
    deviceId: "creator-ios-1",
    platform: "ios",
    permissionStatus: "undetermined",
    timezone: "America/New_York",
    enabled: false,
  });
  expect(device?.lastObservedAt).toBeGreaterThan(1_000_000_000_000);
  expect(device?.createdAt).toBe(device?.lastObservedAt);
  expect(device?.updatedAt).toBe(device?.lastObservedAt);
});

test("duplicate permission reports converge on one same-device row with server timestamps", async () => {
  const t = convexTest(schema, modules);
  const { creatorUserId } = await seedReadyCouple(t);

  await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(reportPermissionObservation, {
    deviceId: "creator-ios-1",
    platform: "ios",
    permissionStatus: "undetermined",
    timezone: "America/New_York",
  });
  await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(reportPermissionObservation, {
    deviceId: "creator-ios-1",
    platform: "ios",
    permissionStatus: "denied",
    timezone: "America/Chicago",
  });

  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("notificationDevices")
      .withIndex("by_user_id_and_device_id", (q) =>
        q.eq("userId", creatorUserId).eq("deviceId", "creator-ios-1"),
      )
      .take(10),
  );

  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    permissionStatus: "denied",
    timezone: "America/Chicago",
    enabled: false,
  });
  expect(rows[0].updatedAt).toBeGreaterThanOrEqual(rows[0].createdAt);
});

test("authenticated granted registration enables the current device token with server timestamps", async () => {
  const t = convexTest(schema, modules);
  const { creatorUserId } = await seedReadyCouple(t);
  const before = Date.now();

  const result = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .mutation(registerGrantedDevice, {
      deviceId: "creator-ios-1",
      platform: "ios",
      pushToken: "ExponentPushToken[creator-1]",
      timezone: "America/New_York",
    });
  const after = Date.now();

  const device = await t.run(async (ctx) =>
    ctx.db
      .query("notificationDevices")
      .withIndex("by_user_id_and_device_id", (q) =>
        q.eq("userId", creatorUserId).eq("deviceId", "creator-ios-1"),
      )
      .unique(),
  );

  expect(result).toEqual({ permissionStatus: "granted", enabled: true });
  expect(device).toMatchObject({
    userId: creatorUserId,
    deviceId: "creator-ios-1",
    pushToken: "ExponentPushToken[creator-1]",
    permissionStatus: "granted",
    timezone: "America/New_York",
    enabled: true,
  });
  expect(device?.lastObservedAt).toBeGreaterThanOrEqual(before);
  expect(device?.lastObservedAt).toBeLessThanOrEqual(after);
  expect(device?.createdAt).toBe(device?.lastObservedAt);
  expect(device?.updatedAt).toBe(device?.lastObservedAt);
});

test("push token collision never transfers ownership between users", async () => {
  const t = convexTest(schema, modules);
  const { creatorUserId, partnerUserId } = await seedReadyCouple(t);

  await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(registerGrantedDevice, {
    deviceId: "creator-ios-1",
    platform: "ios",
    pushToken: "ExponentPushToken[shared]",
    timezone: "America/New_York",
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "partner-auth" }).mutation(registerGrantedDevice, {
      deviceId: "partner-ios-1",
      platform: "ios",
      pushToken: "ExponentPushToken[shared]",
      timezone: "America/Chicago",
    }),
  ).rejects.toThrow("Push token already belongs to another user.");

  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("notificationDevices")
      .withIndex("by_push_token", (q) => q.eq("pushToken", "ExponentPushToken[shared]"))
      .take(10),
  );

  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    userId: creatorUserId,
    deviceId: "creator-ios-1",
    enabled: true,
  });
  expect(rows.some((row) => row.userId === partnerUserId)).toBe(false);
});

test("same-device token rotation replaces the active token and disables the stale token", async () => {
  const t = convexTest(schema, modules);
  const { creatorUserId } = await seedReadyCouple(t);

  await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(registerGrantedDevice, {
    deviceId: "creator-ios-1",
    platform: "ios",
    pushToken: "ExponentPushToken[creator-old]",
    timezone: "America/New_York",
  });
  await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(registerGrantedDevice, {
    deviceId: "creator-ios-1",
    platform: "ios",
    pushToken: "ExponentPushToken[creator-new]",
    timezone: "America/New_York",
  });

  const current = await t.run(async (ctx) =>
    ctx.db
      .query("notificationDevices")
      .withIndex("by_user_id_and_device_id", (q) =>
        q.eq("userId", creatorUserId).eq("deviceId", "creator-ios-1"),
      )
      .unique(),
  );
  const staleRows = await t.run(async (ctx) =>
    ctx.db
      .query("notificationDevices")
      .withIndex("by_push_token", (q) => q.eq("pushToken", "ExponentPushToken[creator-old]"))
      .take(10),
  );

  expect(current).toMatchObject({
    pushToken: "ExponentPushToken[creator-new]",
    enabled: true,
    permissionStatus: "granted",
  });
  expect(staleRows.filter((row) => row.enabled)).toHaveLength(0);
});

test("same-user cross-device token movement leaves one unambiguous token owner", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, creatorUserId } = await seedReadyCouple(t);

  await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(registerGrantedDevice, {
    deviceId: "creator-ios-old",
    platform: "ios",
    pushToken: "ExponentPushToken[moved]",
    timezone: "America/New_York",
  });
  await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(registerGrantedDevice, {
    deviceId: "creator-ios-new",
    platform: "ios",
    pushToken: "ExponentPushToken[moved]",
    timezone: "America/New_York",
  });

  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("notificationDevices")
      .withIndex("by_couple_id_and_user_id", (q) =>
        q.eq("coupleId", coupleId).eq("userId", creatorUserId),
      )
      .take(10),
  );
  const tokenRows = rows.filter((row) => row.pushToken === "ExponentPushToken[moved]");

  expect(tokenRows).toHaveLength(1);
  expect(tokenRows[0]).toMatchObject({ deviceId: "creator-ios-new", enabled: true });
  expect(rows.find((row) => row.deviceId === "creator-ios-old")?.pushToken).toBeUndefined();
});

test("denied observation can later become granted registration on the same device", async () => {
  const t = convexTest(schema, modules);
  const { creatorUserId } = await seedReadyCouple(t);

  await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(reportPermissionObservation, {
    deviceId: "creator-ios-1",
    platform: "ios",
    permissionStatus: "denied",
    timezone: "America/New_York",
  });
  await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(registerGrantedDevice, {
    deviceId: "creator-ios-1",
    platform: "ios",
    pushToken: "ExponentPushToken[creator-1]",
    timezone: "America/New_York",
  });

  const device = await t.run(async (ctx) =>
    ctx.db
      .query("notificationDevices")
      .withIndex("by_user_id_and_device_id", (q) =>
        q.eq("userId", creatorUserId).eq("deviceId", "creator-ios-1"),
      )
      .unique(),
  );

  expect(device).toMatchObject({
    permissionStatus: "granted",
    pushToken: "ExponentPushToken[creator-1]",
    enabled: true,
  });
});

test("reinstall with a new stable device id remains distinct for the same user", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, creatorUserId } = await seedReadyCouple(t);

  await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(registerGrantedDevice, {
    deviceId: "creator-ios-install-1",
    platform: "ios",
    pushToken: "ExponentPushToken[creator-install-1]",
    timezone: "America/New_York",
  });
  await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(registerGrantedDevice, {
    deviceId: "creator-ios-install-2",
    platform: "ios",
    pushToken: "ExponentPushToken[creator-install-2]",
    timezone: "America/New_York",
  });

  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("notificationDevices")
      .withIndex("by_couple_id_and_user_id", (q) =>
        q.eq("coupleId", coupleId).eq("userId", creatorUserId),
      )
      .take(10),
  );

  expect(rows.map((row) => row.deviceId).sort()).toEqual([
    "creator-ios-install-1",
    "creator-ios-install-2",
  ]);
  expect(rows.filter((row) => row.enabled)).toHaveLength(2);
});

test("same-device non-granted observation after granted token is inferred revoked and disabled", async () => {
  const t = convexTest(schema, modules);
  const { creatorUserId } = await seedReadyCouple(t);

  await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(registerGrantedDevice, {
    deviceId: "creator-ios-1",
    platform: "ios",
    pushToken: "ExponentPushToken[creator-1]",
    timezone: "America/New_York",
  });

  const result = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .mutation(reportPermissionObservation, {
      deviceId: "creator-ios-1",
      platform: "ios",
      permissionStatus: "denied",
      timezone: "America/New_York",
    });

  const device = await t.run(async (ctx) =>
    ctx.db
      .query("notificationDevices")
      .withIndex("by_user_id_and_device_id", (q) =>
        q.eq("userId", creatorUserId).eq("deviceId", "creator-ios-1"),
      )
      .unique(),
  );

  expect(result.permissionStatus).toBe("revoked");
  expect(device).toMatchObject({
    permissionStatus: "revoked",
    enabled: false,
  });
  expect(device?.pushToken).toBeUndefined();
});

test("couple readiness requires two tokenized granted members and initializes from creator timezone only", async () => {
  const t = convexTest(schema, modules);
  const { coupleId } = await seedReadyCouple(t);

  await t.withIdentity({ tokenIdentifier: "partner-auth" }).mutation(registerGrantedDevice, {
    deviceId: "partner-ios-1",
    platform: "ios",
    pushToken: "ExponentPushToken[partner-1]",
    timezone: "America/Chicago",
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).query(getNotificationReadiness, {}),
  ).resolves.toMatchObject({
    memberCount: 2,
    readyMemberCount: 1,
    isReady: false,
    promptTimezone: null,
    blockedReason: "not_all_members_ready",
  });

  await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(registerGrantedDevice, {
    deviceId: "creator-ios-1",
    platform: "ios",
    pushToken: "ExponentPushToken[creator-1]",
    timezone: "America/New_York",
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "partner-auth" }).query(getNotificationReadiness, {}),
  ).resolves.toMatchObject({
    memberCount: 2,
    readyMemberCount: 2,
    isReady: true,
    promptTimezone: "America/New_York",
    blockedReason: null,
  });

  const couple = await t.run(async (ctx) => ctx.db.get(coupleId));
  expect(couple?.promptTimezone).toBe("America/New_York");
  expect(couple?.promptTimezoneUpdatedAt).toBeGreaterThan(1_000_000_000_000);
});

test("readiness blocks couples with more than two members even when two are ready", async () => {
  const t = convexTest(schema, modules);
  const { coupleId } = await seedReadyCouple(t);
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
      coupleId,
      userId: thirdUserId,
      role: "partner",
      joinedAt: 3,
    }),
  );

  await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(registerGrantedDevice, {
    deviceId: "creator-ios-1",
    platform: "ios",
    pushToken: "ExponentPushToken[creator-1]",
    timezone: "America/New_York",
  });
  await t.withIdentity({ tokenIdentifier: "partner-auth" }).mutation(registerGrantedDevice, {
    deviceId: "partner-ios-1",
    platform: "ios",
    pushToken: "ExponentPushToken[partner-1]",
    timezone: "America/Chicago",
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).query(getNotificationReadiness, {}),
  ).resolves.toMatchObject({
    memberCount: 3,
    readyMemberCount: 2,
    isReady: false,
    blockedReason: "invalid_member_count",
  });
});

test("creator timezone unavailable keeps readiness blocked and does not fall back to partner", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, creatorUserId } = await seedReadyCouple(t);

  await t.run(async (ctx) =>
    ctx.db.insert("notificationDevices", {
      coupleId,
      userId: creatorUserId,
      deviceId: "creator-bad-tz",
      platform: "ios",
      pushToken: "ExponentPushToken[creator-bad-tz]",
      permissionStatus: "granted",
      enabled: true,
      lastObservedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.withIdentity({ tokenIdentifier: "partner-auth" }).mutation(registerGrantedDevice, {
    deviceId: "partner-ios-1",
    platform: "ios",
    pushToken: "ExponentPushToken[partner-1]",
    timezone: "America/Chicago",
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).query(getNotificationReadiness, {}),
  ).resolves.toMatchObject({
    memberCount: 2,
    readyMemberCount: 2,
    isReady: false,
    promptTimezone: null,
    blockedReason: "creator_timezone_unavailable",
  });

  const couple = await t.run(async (ctx) => ctx.db.get(coupleId));
  expect(couple?.promptTimezone).toBeUndefined();
});

test("readiness and creator timezone consider valid devices beyond twenty stale registrations", async () => {
  const t = convexTest(schema, modules);
  const { coupleId, creatorUserId } = await seedReadyCouple(t);

  await t.run(async (ctx) => {
    for (let index = 0; index < 20; index += 1) {
      await ctx.db.insert("notificationDevices", {
        coupleId,
        userId: creatorUserId,
        deviceId: `creator-stale-${index}`,
        platform: "ios",
        permissionStatus: "denied",
        timezone: "America/Chicago",
        enabled: false,
        lastObservedAt: index + 1,
        createdAt: index + 1,
        updatedAt: index + 1,
      });
    }
  });
  await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(registerGrantedDevice, {
    deviceId: "creator-current",
    platform: "ios",
    pushToken: "ExponentPushToken[creator-current]",
    timezone: "America/Los_Angeles",
  });
  await t.withIdentity({ tokenIdentifier: "partner-auth" }).mutation(registerGrantedDevice, {
    deviceId: "partner-current",
    platform: "ios",
    pushToken: "ExponentPushToken[partner-current]",
    timezone: "America/New_York",
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).query(getNotificationReadiness, {}),
  ).resolves.toMatchObject({
    memberCount: 2,
    readyMemberCount: 2,
    isReady: true,
    promptTimezone: "America/Los_Angeles",
    blockedReason: null,
  });
});

test("public readiness output omits partner, device, and token details", async () => {
  const t = convexTest(schema, modules);
  await seedReadyCouple(t);

  const readiness = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .query(getNotificationReadiness, {});

  expect(Object.keys(readiness).sort()).toEqual([
    "blockedReason",
    "isReady",
    "memberCount",
    "promptTimezone",
    "readyMemberCount",
  ]);
});

test("unauthenticated and non-member notification calls fail closed", async () => {
  const t = convexTest(schema, modules);
  await seedReadyCouple(t);
  await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authUserId: "outsider-auth",
      email: "outsider@example.com",
      createdAt: 1,
      updatedAt: 1,
    }),
  );

  await expect(
    t.withIdentity({ subject: "creator-auth" }).query(getNotificationReadiness, {}),
  ).rejects.toThrow("Not signed in.");
  await expect(
    t.mutation(reportPermissionObservation, {
      deviceId: "anon-ios-1",
      platform: "ios",
      permissionStatus: "denied",
      timezone: "America/New_York",
    }),
  ).rejects.toThrow("Not signed in.");
  await expect(
    t.withIdentity({ tokenIdentifier: "outsider-auth" }).mutation(registerGrantedDevice, {
      deviceId: "outsider-ios-1",
      platform: "ios",
      pushToken: "ExponentPushToken[outsider]",
      timezone: "America/New_York",
    }),
  ).rejects.toThrow("Pair with your partner first.");
});

test("ambiguous duplicate memberships fail closed", async () => {
  const t = convexTest(schema, modules);
  const { creatorUserId } = await seedReadyCouple(t);
  const secondCoupleId = await t.run(async (ctx) =>
    ctx.db.insert("couples", {
      name: "Other",
      createdByUserId: creatorUserId,
      createdAt: 2,
      updatedAt: 2,
    }),
  );
  await t.run(async (ctx) =>
    ctx.db.insert("coupleMembers", {
      coupleId: secondCoupleId,
      userId: creatorUserId,
      role: "partner",
      joinedAt: 2,
    }),
  );

  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).query(getNotificationReadiness, {}),
  ).rejects.toThrow("Ambiguous couple membership.");
});

test("explicit timezone update args contain only timezone and use server timestamps", async () => {
  const t = convexTest(schema, modules);
  const { coupleId } = await seedReadyCouple(t);

  await expect(
    t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(updatePromptTimezone, {
      timezone: "Mars/Olympus_Mons",
    }),
  ).rejects.toThrow("Timezone is invalid.");

  const before = Date.now();
  const result = await t
    .withIdentity({ tokenIdentifier: "creator-auth" })
    .mutation(updatePromptTimezone, {
      timezone: "America/Los_Angeles",
    });
  const after = Date.now();

  const couple = await t.run(async (ctx) => ctx.db.get(coupleId));
  expect(result).toEqual({ promptTimezone: "America/Los_Angeles" });
  expect(couple).toMatchObject({
    promptTimezone: "America/Los_Angeles",
  });
  expect(couple?.promptTimezoneUpdatedAt).toBeGreaterThanOrEqual(before);
  expect(couple?.promptTimezoneUpdatedAt).toBeLessThanOrEqual(after);
  expect(couple?.updatedAt).toBe(couple?.promptTimezoneUpdatedAt);
});

test("legacy push token registration also rejects cross-user token transfer", async () => {
  const t = convexTest(schema, modules);
  await seedReadyCouple(t);

  await t.withIdentity({ tokenIdentifier: "creator-auth" }).mutation(legacyRegisterToken, {
    token: "ExponentPushToken[legacy-shared]",
    platform: "ios",
    deviceId: "creator-ios-legacy",
    timezone: "America/New_York",
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "partner-auth" }).mutation(legacyRegisterToken, {
      token: "ExponentPushToken[legacy-shared]",
      platform: "ios",
      deviceId: "partner-ios-legacy",
      timezone: "America/Chicago",
    }),
  ).rejects.toThrow("Push token already belongs to another user.");

  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", "ExponentPushToken[legacy-shared]"))
      .take(10),
  );

  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    deviceId: "creator-ios-legacy",
    timezone: "America/New_York",
    enabled: true,
  });
});

test("legacy push token registration rejects subject-only identity", async () => {
  const t = convexTest(schema, modules);
  await seedReadyCouple(t);

  await expect(
    t.withIdentity({ subject: "creator-auth" }).mutation(legacyRegisterToken, {
      token: "ExponentPushToken[subject-only]",
      platform: "ios",
      deviceId: "creator-subject-only",
      timezone: "America/New_York",
    }),
  ).rejects.toThrow("Not signed in.");
});
