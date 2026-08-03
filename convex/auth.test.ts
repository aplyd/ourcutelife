/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { expect, test } from "vitest";

import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const viewer = makeFunctionReference<
  "query",
  Record<string, never>,
  {
    user: { avatarUrl?: string };
    partner: { avatarUrl?: string } | null;
    membership: Record<string, unknown> | null;
  } | null
>("auth:viewer");
const cleanupMyLegacyGlobalAvatar = makeFunctionReference<
  "mutation",
  Record<string, never>,
  { cleaned: boolean }
>("auth:cleanupMyLegacyGlobalAvatar");
const updateProfile = makeFunctionReference<
  "mutation",
  { fullName: string; avatarUrl?: string },
  Id<"users">
>("auth:updateProfile");

test("viewer returns a sanitized unpaired state", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      authUserId: "unpaired-auth",
      fullName: "Unpaired",
      email: "unpaired@example.com",
      createdAt: 1,
      updatedAt: 1,
    });
  });

  const result = await t.withIdentity({ tokenIdentifier: "unpaired-auth" }).query(viewer, {});
  expect(result?.membership).toBeNull();
  expect(result?.partner).toBeNull();
  expect(JSON.stringify(result)).not.toContain('"avatarStorageId"');
  expect(JSON.stringify(result)).not.toContain('"authUserId"');
});

test("viewer ignores user-global photos and projects only the active couple profile", async () => {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const userLegacyStorageId = await ctx.storage.store(
      new Blob([new Uint8Array([1])], { type: "image/png" }),
    );
    const partnerLegacyStorageId = await ctx.storage.store(
      new Blob([new Uint8Array([2])], { type: "image/png" }),
    );
    const userId = await ctx.db.insert("users", {
      authUserId: "user-auth",
      fullName: "Austin",
      avatarUrl: "https://old.test/user.jpg",
      avatarStorageId: userLegacyStorageId,
      createdAt: 1,
      updatedAt: 1,
    });
    const partnerUserId = await ctx.db.insert("users", {
      authUserId: "partner-auth",
      fullName: "Sariya",
      avatarUrl: "https://old.test/partner.jpg",
      avatarStorageId: partnerLegacyStorageId,
      createdAt: 1,
      updatedAt: 1,
    });
    const coupleId = await ctx.db.insert("couples", {
      name: "Us",
      createdByUserId: userId,
      createdAt: 1,
      updatedAt: 1,
    });
    const membershipId = await ctx.db.insert("coupleMembers", {
      coupleId,
      userId,
      role: "partner",
      joinedAt: 1,
    });
    const partnerMembershipId = await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: partnerUserId,
      role: "partner",
      joinedAt: 2,
    });
    return { membershipId, partnerMembershipId, userId };
  });

  const initial = await t.withIdentity({ tokenIdentifier: "user-auth" }).query(viewer, {});
  expect(initial?.user.avatarUrl).toBeUndefined();
  expect(initial?.partner?.avatarUrl).toBeUndefined();
  expect(initial?.user).not.toHaveProperty("avatarStorageId");
  expect(initial?.user).not.toHaveProperty("authUserId");
  expect(initial?.partner).not.toHaveProperty("avatarStorageId");
  expect(initial?.partner).not.toHaveProperty("authUserId");
  expect(initial?.membership).not.toHaveProperty("avatarStorageId");
  expect(JSON.stringify(initial)).not.toContain('"avatarStorageId"');
  expect(JSON.stringify(initial)).not.toContain('"authUserId"');

  await t.run(async (ctx) => {
    await ctx.db.patch(seeded.membershipId, { avatarUrl: "https://active.test/austin.jpg" });
    await ctx.db.patch(seeded.partnerMembershipId, { avatarUrl: "https://active.test/sariya.jpg" });
  });
  const scoped = await t.withIdentity({ tokenIdentifier: "user-auth" }).query(viewer, {});
  expect(scoped?.user.avatarUrl).toBe("https://active.test/austin.jpg");
  expect(scoped?.partner?.avatarUrl).toBe("https://active.test/sariya.jpg");

  await t.withIdentity({ tokenIdentifier: "user-auth" }).mutation(updateProfile, {
    fullName: "Austin F",
    avatarUrl: "https://active.test/new-austin.jpg",
  });
  const persisted = await t.run(async (ctx) => ({
    membership: await ctx.db.get(seeded.membershipId),
    user: await ctx.db.get(seeded.userId),
  }));
  expect(persisted.membership?.avatarUrl).toBe("https://active.test/new-austin.jpg");
  expect(persisted.user?.avatarUrl).toBeUndefined();
});

test("cleanup preserves a global blob still referenced by another user's membership", async () => {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const sharedStorageId = await ctx.storage.store(
      new Blob([new Uint8Array([3])], { type: "image/png" }),
    );
    const userId = await ctx.db.insert("users", {
      authUserId: "alias-cleanup-auth",
      avatarStorageId: sharedStorageId,
      avatarUrl: "https://legacy.test/shared.jpg",
      createdAt: 1,
      updatedAt: 1,
    });
    const partnerId = await ctx.db.insert("users", { createdAt: 1, updatedAt: 1 });
    const coupleId = await ctx.db.insert("couples", {
      name: "Us",
      createdByUserId: userId,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("coupleMembers", {
      coupleId,
      userId: partnerId,
      role: "partner",
      joinedAt: 1,
      avatarStorageId: sharedStorageId,
    });
    return { sharedStorageId, userId };
  });

  await expect(
    t
      .withIdentity({ tokenIdentifier: "alias-cleanup-auth" })
      .mutation(cleanupMyLegacyGlobalAvatar, {}),
  ).resolves.toEqual({ cleaned: true });

  await expect(
    t.run(async (ctx) => ctx.db.system.get(seeded.sharedStorageId)),
  ).resolves.not.toBeNull();
  const cleanedUser = await t.run(async (ctx) => ctx.db.get(seeded.userId));
  expect(cleanedUser).not.toHaveProperty("avatarStorageId");
  expect(cleanedUser).not.toHaveProperty("avatarUrl");
});

test("authenticated cleanup deletes abandoned global avatar storage without touching couple media", async () => {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const legacyStorageId = await ctx.storage.store(new Blob(["legacy"], { type: "image/jpeg" }));
    const membershipStorageId = await ctx.storage.store(
      new Blob(["membership"], { type: "image/jpeg" }),
    );
    const userId = await ctx.db.insert("users", {
      authUserId: "cleanup-auth",
      avatarUrl: "https://legacy.test/photo.jpg",
      avatarStorageId: legacyStorageId,
      createdAt: 1,
      updatedAt: 1,
    });
    const coupleId = await ctx.db.insert("couples", {
      name: "Us",
      createdByUserId: userId,
      createdAt: 1,
      updatedAt: 1,
    });
    const membershipId = await ctx.db.insert("coupleMembers", {
      coupleId,
      userId,
      role: "partner",
      joinedAt: 1,
      avatarStorageId: membershipStorageId,
    });
    return { legacyStorageId, membershipId, membershipStorageId, userId };
  });

  await expect(
    t.withIdentity({ tokenIdentifier: "cleanup-auth" }).mutation(cleanupMyLegacyGlobalAvatar, {}),
  ).resolves.toEqual({ cleaned: true });

  const persisted = await t.run(async (ctx) => ({
    legacyStorage: await ctx.db.system.get("_storage", seeded.legacyStorageId),
    membership: await ctx.db.get(seeded.membershipId),
    membershipStorage: await ctx.db.system.get("_storage", seeded.membershipStorageId),
    user: await ctx.db.get(seeded.userId),
  }));
  expect(persisted.user?.avatarUrl).toBeUndefined();
  expect(persisted.user?.avatarStorageId).toBeUndefined();
  expect(persisted.legacyStorage).toBeNull();
  expect(persisted.membership?.avatarStorageId).toBe(seeded.membershipStorageId);
  expect(persisted.membershipStorage).not.toBeNull();
});
