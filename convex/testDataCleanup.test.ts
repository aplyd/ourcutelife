/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { expect, test } from "vitest";

import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const cleanup = makeFunctionReference<
  "mutation",
  { confirm: boolean },
  {
    deleted: boolean;
    eligibleCouples: number;
    preservedCouples: number;
    records: number;
    syntheticUsers: number;
  }
>("testDataCleanup:cleanupMySyntheticTestData");

test("cleanup previews then deletes only the authenticated user's synthetic test topology", async () => {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const austinId = await ctx.db.insert("users", {
      authUserId: "austin-auth",
      email: "austin@example.com",
      fullName: "Austin",
      createdAt: 1,
      updatedAt: 1,
    });
    const sariyaId = await ctx.db.insert("users", {
      authUserId: "sariya-auth",
      email: "sariya@example.com",
      fullName: "Sariya",
      createdAt: 1,
      updatedAt: 1,
    });
    const testUserId = await ctx.db.insert("users", {
      authUserId: `test-partner:${austinId}`,
      email: "test-partner@ourcutelife.local",
      fullName: "Test Partner",
      createdAt: 1,
      updatedAt: 1,
    });
    const realCoupleId = await ctx.db.insert("couples", {
      name: "Austin + Sariya",
      createdByUserId: austinId,
      createdAt: 1,
      updatedAt: 1,
    });
    for (const userId of [austinId, sariyaId]) {
      await ctx.db.insert("coupleMembers", {
        coupleId: realCoupleId,
        userId,
        role: "partner",
        joinedAt: 1,
      });
    }
    const realMomentId = await ctx.db.insert("moments", {
      coupleId: realCoupleId,
      authorUserId: austinId,
      happenedAt: 1,
      createdAt: 1,
      summary: "Real shared memory",
      feeling: "Loved",
      tone: "good",
      tags: [],
    });
    const testCoupleId = await ctx.db.insert("couples", {
      name: "Austin's relationship",
      createdByUserId: austinId,
      createdAt: 2,
      updatedAt: 2,
    });
    await ctx.db.insert("coupleMembers", {
      coupleId: testCoupleId,
      userId: testUserId,
      role: "partner",
      joinedAt: 2,
    });
    const testIdeaId = await ctx.db.insert("planIdeas", {
      coupleId: testCoupleId,
      title: "Synthetic idea",
      description: "Delete me",
      category: "date",
      costLevel: 1,
      durationMinutes: 30,
      vibeTags: ["test"],
      source: "seed",
      createdAt: 2,
    });
    const testSwipeId = await ctx.db.insert("planSwipes", {
      coupleId: testCoupleId,
      ideaId: testIdeaId,
      userId: testUserId,
      vote: "like",
      createdAt: 2,
    });
    return {
      austinId,
      realCoupleId,
      realMomentId,
      sariyaId,
      testCoupleId,
      testIdeaId,
      testSwipeId,
      testUserId,
    };
  });

  const asAustin = t.withIdentity({ tokenIdentifier: "austin-auth" });
  const preview = await asAustin.mutation(cleanup, { confirm: false });
  expect(preview).toMatchObject({
    deleted: false,
    eligibleCouples: 1,
    preservedCouples: 1,
    syntheticUsers: 1,
  });
  await expect(t.run(async (ctx) => ctx.db.get(seeded.testCoupleId))).resolves.not.toBeNull();

  await expect(asAustin.mutation(cleanup, { confirm: true })).resolves.toMatchObject({
    deleted: true,
    eligibleCouples: 1,
    preservedCouples: 1,
    syntheticUsers: 1,
  });

  const state = await t.run(async (ctx) => ({
    austin: await ctx.db.get(seeded.austinId),
    realCouple: await ctx.db.get(seeded.realCoupleId),
    realMoment: await ctx.db.get(seeded.realMomentId),
    sariya: await ctx.db.get(seeded.sariyaId),
    testCouple: await ctx.db.get(seeded.testCoupleId),
    testIdea: await ctx.db.get(seeded.testIdeaId),
    testSwipe: await ctx.db.get(seeded.testSwipeId),
    testUser: await ctx.db.get(seeded.testUserId),
  }));
  expect(state).toMatchObject({
    austin: expect.any(Object),
    realCouple: expect.any(Object),
    realMoment: expect.any(Object),
    sariya: expect.any(Object),
    testCouple: null,
    testIdea: null,
    testSwipe: null,
    testUser: null,
  });
});

test("cleanup fails closed when the synthetic identity marker does not match", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      authUserId: "austin-auth",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("users", {
      authUserId: `test-partner:${id}`,
      email: "real-person@example.com",
      fullName: "Not Test Partner",
      createdAt: 1,
      updatedAt: 1,
    });
    return id;
  });
  expect(userId).toBeTruthy();
  await expect(
    t.withIdentity({ tokenIdentifier: "austin-auth" }).mutation(cleanup, { confirm: true }),
  ).rejects.toThrow("Synthetic test user identity mismatch.");
});
