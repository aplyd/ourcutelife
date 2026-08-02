/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { expect, test } from "vitest";

import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const leaveCouple = makeFunctionReference<"mutation", Record<string, never>, { left: true }>(
  "pairing:leaveCouple",
);

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

test("authenticated user leaves without deleting their partner or shared couple data", async () => {
  const t = convexTest(schema, modules);
  const seeded = await seedCouple(t);

  await expect(
    t.withIdentity({ tokenIdentifier: "departing-auth" }).mutation(leaveCouple, {}),
  ).resolves.toEqual({ left: true });

  const state = await t.run(async (ctx) => ({
    activeCode: await ctx.db.get(seeded.activeCodeId),
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
  expect(state.partnerMembership).not.toBeNull();
  expect(state.partnerUser).not.toBeNull();
  expect(state.departingUser).not.toBeNull();
  expect(state.couple).not.toBeNull();
  expect(state.moment).toMatchObject({ summary: "Shared memory", coupleId: seeded.coupleId });
  expect(state.activeCode?.usedAt).toEqual(expect.any(Number));
  expect(state.departingDevice).toMatchObject({ enabled: false, coupleId: seeded.coupleId });
  expect(state.partnerDevice).toMatchObject({ enabled: true, coupleId: seeded.coupleId });

  await expect(
    t.withIdentity({ tokenIdentifier: "departing-auth" }).mutation(leaveCouple, {}),
  ).rejects.toThrow("Pair with your partner first.");
  await expect(
    t.run(async (ctx) => ctx.db.get(seeded.partnerMembershipId)),
  ).resolves.not.toBeNull();
});

test("leave couple fails closed for ambiguous membership without changing either couple", async () => {
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

  await expect(
    t.withIdentity({ tokenIdentifier: "departing-auth" }).mutation(leaveCouple, {}),
  ).rejects.toThrow("Ambiguous couple membership.");

  const memberships = await t.run(async (ctx) =>
    ctx.db
      .query("coupleMembers")
      .withIndex("by_user", (q) => q.eq("userId", seeded.departingUserId))
      .take(3),
  );
  expect(memberships.map((membership) => membership.coupleId)).toEqual([
    seeded.coupleId,
    secondCoupleId,
  ]);
});
