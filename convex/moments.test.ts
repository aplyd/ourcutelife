/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { expect, test } from "vitest";

import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const listMine = makeFunctionReference<"query", Record<string, never>, unknown[]>(
  "moments:listMine",
);

async function seedUser(t: ReturnType<typeof convexTest>, withSoloCouple: boolean) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authUserId: "austin-auth",
      email: "austin@example.com",
      createdAt: 1,
      updatedAt: 1,
    });
    if (withSoloCouple) {
      const coupleId = await ctx.db.insert("couples", {
        name: "Austin's relationship",
        createdByUserId: userId,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("coupleMembers", {
        coupleId,
        userId,
        role: "partner",
        joinedAt: 1,
      });
    }
    return userId;
  });
}

test.each([
  ["after leaving a couple", false],
  ["while waiting for a partner", true],
])("moment startup read stays available %s", async (_label, withSoloCouple) => {
  const t = convexTest(schema, modules);
  await seedUser(t, withSoloCouple);

  await expect(
    t.withIdentity({ tokenIdentifier: "austin-auth" }).query(listMine, {}),
  ).resolves.toEqual([]);
});
