import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { getCurrentAppUser } from "./auth";

const PAIRING_CODE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function normalizeCode(code: string): string {
  return code.replace(/[^0-9]/g, "").slice(0, 6);
}

function displayCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function expireActiveCodesForCouple(ctx: MutationCtx, coupleId: Id<"couples">, now: number) {
  const activeCodes = await ctx.db
    .query("pairingCodes")
    .withIndex("by_couple", (q) => q.eq("coupleId", coupleId))
    .collect()
    .then((codes) => codes.filter((code) => !code.usedAt && code.expiresAt > now));

  await Promise.all(activeCodes.map((code) => ctx.db.patch(code._id, { usedAt: now })));
}

export const createCoupleAndCode = mutation({
  args: {
    anniversaryDate: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) throw new Error("Not signed in.");

    const existingMembership = await ctx.db
      .query("coupleMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (!Number.isFinite(args.anniversaryDate)) {
      throw new Error("Anniversary date is invalid.");
    }

    const now = Date.now();
    let coupleId = existingMembership?.coupleId ?? null;

    if (existingMembership) {
      const existingMembers = await ctx.db
        .query("coupleMembers")
        .withIndex("by_couple", (q) => q.eq("coupleId", existingMembership.coupleId))
        .collect();
      if (existingMembers.length >= 2) {
        throw new Error("You are already paired.");
      }
      await ctx.db.patch(existingMembership.coupleId, {
        anniversaryDate: args.anniversaryDate,
        updatedAt: now,
      });
      await expireActiveCodesForCouple(ctx, existingMembership.coupleId, now);
    } else {
      const name = user.fullName ? `${user.fullName}'s relationship` : "Our Cute Life";
      coupleId = await ctx.db.insert("couples", {
        name,
        anniversaryDate: args.anniversaryDate,
        createdByUserId: user._id,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("coupleMembers", {
        coupleId,
        userId: user._id,
        role: "partner",
        joinedAt: now,
      });
    }

    let code: string | null = null;
    for (let i = 0; i < 8; i += 1) {
      const candidate = generateCode();
      const existingActiveCode = await ctx.db
        .query("pairingCodes")
        .withIndex("by_code", (q) => q.eq("code", candidate))
        .collect()
        .then((codes) => codes.some((item) => !item.usedAt && item.expiresAt > now));
      if (!existingActiveCode) {
        code = candidate;
        break;
      }
    }
    if (!code) throw new Error("Could not generate a unique pairing code. Try again.");
    if (!coupleId) throw new Error("Could not create a relationship space. Try again.");
    const activeCoupleId = coupleId;
    const expiresAt = now + PAIRING_CODE_TTL_MS;

    await ctx.db.insert("pairingCodes", {
      coupleId: activeCoupleId,
      code,
      createdByUserId: user._id,
      expiresAt,
      createdAt: now,
    });

    return {
      coupleId: activeCoupleId,
      code: displayCode(code),
      expiresAt,
    };
  },
});

export const joinWithCode = mutation({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) throw new Error("Not signed in.");

    const existingMembership = await ctx.db
      .query("coupleMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (existingMembership) {
      throw new Error("You are already paired.");
    }

    const normalizedCode = normalizeCode(args.code);
    if (normalizedCode.length !== 6) {
      throw new Error("Pairing code must be six digits.");
    }

    const now = Date.now();
    const pairingCode = await ctx.db
      .query("pairingCodes")
      .withIndex("by_code", (q) => q.eq("code", normalizedCode))
      .collect()
      .then(
        (codes) =>
          codes
            .filter((item) => !item.usedAt && item.expiresAt > now)
            .sort((a, b) => b.createdAt - a.createdAt)[0],
      );

    if (!pairingCode) {
      throw new Error("That pairing code is invalid or expired.");
    }
    if (pairingCode.createdByUserId === user._id) {
      throw new Error("You cannot join your own pairing code. Share it with your partner instead.");
    }

    const members = await ctx.db
      .query("coupleMembers")
      .withIndex("by_couple", (q) => q.eq("coupleId", pairingCode.coupleId))
      .collect();
    if (members.length >= 2) {
      await ctx.db.patch(pairingCode._id, { usedAt: now });
      throw new Error("That relationship space is already full.");
    }

    await ctx.db.insert("coupleMembers", {
      coupleId: pairingCode.coupleId,
      userId: user._id,
      role: "partner",
      joinedAt: now,
    });

    await ctx.db.patch(pairingCode._id, {
      usedAt: now,
      usedByUserId: user._id,
    });

    await ctx.db.patch(pairingCode.coupleId, { updatedAt: now });

    return { coupleId: pairingCode.coupleId };
  },
});

export const pairWithTestPartner = mutation({
  args: {
    anniversaryDate: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) throw new Error("Not signed in.");
    if (!Number.isFinite(args.anniversaryDate)) {
      throw new Error("Anniversary date is invalid.");
    }

    const now = Date.now();
    const existingMembership = await ctx.db
      .query("coupleMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    let coupleId = existingMembership?.coupleId ?? null;
    if (!coupleId) {
      coupleId = await ctx.db.insert("couples", {
        name: user.fullName ? `${user.fullName}'s relationship` : "Our Cute Life",
        anniversaryDate: args.anniversaryDate,
        createdByUserId: user._id,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("coupleMembers", {
        coupleId,
        userId: user._id,
        role: "partner",
        joinedAt: now,
      });
    } else {
      await ctx.db.patch(coupleId, { anniversaryDate: args.anniversaryDate, updatedAt: now });
    }

    const activeCoupleId = coupleId;
    const existingMembers = await ctx.db
      .query("coupleMembers")
      .withIndex("by_couple", (q) => q.eq("coupleId", activeCoupleId))
      .collect();

    let testUserId = existingMembers.find((member) => member.userId !== user._id)?.userId ?? null;
    if (existingMembers.length < 2) {
      const testAuthUserId = `test-partner:${user._id}`;
      const existingTestUser = await ctx.db
        .query("users")
        .withIndex("by_auth_user_id", (q) => q.eq("authUserId", testAuthUserId))
        .first();
      testUserId =
        existingTestUser?._id ??
        (await ctx.db.insert("users", {
          authUserId: testAuthUserId,
          email: "test-partner@ourcutelife.local",
          fullName: "Test Partner",
          createdAt: now,
          updatedAt: now,
        }));

      const existingTestMembership = existingMembers.some((member) => member.userId === testUserId);
      if (!existingTestMembership) {
        await ctx.db.insert("coupleMembers", {
          coupleId: activeCoupleId,
          userId: testUserId,
          role: "partner",
          joinedAt: now,
        });
      }
    }

    if (testUserId) {
      const demoIdeas = [
        {
          title: "Gunther's Ice Cream",
          description: "Classic Sacramento ice cream stop.",
          kind: "place" as const,
          category: "food" as const,
          subcategories: ["ice cream", "classic"],
          costLevel: 1,
          durationMinutes: 45,
        },
        {
          title: "Dimple Records browsing",
          description: "Browse records and pick one album for each other.",
          kind: "place" as const,
          category: "entertainment" as const,
          subcategories: ["music", "browsing"],
          costLevel: 1,
          durationMinutes: 45,
        },
        {
          title: "Puzzle night at home",
          description: "Phones away, snacks out, puzzle on the table.",
          kind: "activity" as const,
          category: "activity" as const,
          subcategories: ["home", "cozy"],
          costLevel: 0,
          durationMinutes: 90,
        },
      ];
      const matchedIdeaIds = [];
      for (const idea of demoIdeas) {
        const existingIdea = await ctx.db
          .query("planIdeas")
          .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", activeCoupleId))
          .collect()
          .then((ideas) => ideas.find((item) => item.title === idea.title));
        const ideaId =
          existingIdea?._id ??
          (await ctx.db.insert("planIdeas", {
            coupleId: activeCoupleId,
            ...idea,
            vibeTags: idea.subcategories,
            source: "seed",
            createdAt: now,
          }));
        matchedIdeaIds.push(ideaId);
        for (const memberUserId of [user._id, testUserId]) {
          const existingSwipe = await ctx.db
            .query("planSwipes")
            .withIndex("by_user_and_idea", (q) => q.eq("userId", memberUserId).eq("ideaId", ideaId))
            .first();
          if (!existingSwipe) {
            await ctx.db.insert("planSwipes", {
              coupleId: activeCoupleId,
              ideaId,
              userId: memberUserId,
              vote: "like",
              createdAt: now,
            });
          }
        }
        const existingMatch = await ctx.db
          .query("planMatches")
          .withIndex("by_idea", (q) => q.eq("ideaId", ideaId))
          .first();
        if (!existingMatch) {
          await ctx.db.insert("planMatches", {
            coupleId: activeCoupleId,
            ideaId,
            createdAt: now,
            status: "matched",
          });
        }
      }
      const existingDates = await ctx.db
        .query("datePlans")
        .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", activeCoupleId))
        .collect();
      if (!existingDates.some((date) => date.title === "Gunther's → Dimple Records")) {
        await ctx.db.insert("datePlans", {
          coupleId: activeCoupleId,
          title: "Gunther's → Dimple Records",
          summary: "Ice cream first, then browse records and pick something weird for each other.",
          itemIds: matchedIdeaIds.slice(0, 2),
          freeformSteps: ["Get cones", "Browse one aisle each", "Trade one pick"],
          durationMinutes: 90,
          costLevel: 1,
          vibeTags: ["classic", "music", "low-key"],
          source: "seed",
          popularityScore: 8,
          trendingScore: 6,
          ratingAverage: 4,
          ratingCount: 2,
          createdAt: now,
        });
      }
      if (!existingDates.some((date) => date.title === "Gunther's to-go → puzzle night")) {
        await ctx.db.insert("datePlans", {
          coupleId: activeCoupleId,
          title: "Gunther's to-go → puzzle night",
          summary: "Grab ice cream, head home, and make the night intentionally cozy.",
          itemIds: [matchedIdeaIds[0], matchedIdeaIds[2]],
          freeformSteps: ["Pick up ice cream", "Put phones away", "Finish one puzzle section"],
          durationMinutes: 120,
          costLevel: 1,
          vibeTags: ["cozy", "home", "dessert"],
          source: "seed",
          popularityScore: 7,
          trendingScore: 7,
          ratingAverage: 4,
          ratingCount: 1,
          createdAt: now,
        });
      }
    }

    const activeZeroCode = await ctx.db
      .query("pairingCodes")
      .withIndex("by_code", (q) => q.eq("code", "000000"))
      .collect()
      .then((codes) => codes.find((item) => item.coupleId === activeCoupleId && !item.usedAt));
    if (!activeZeroCode) {
      await ctx.db.insert("pairingCodes", {
        coupleId: activeCoupleId,
        code: "000000",
        createdByUserId: user._id,
        expiresAt: now + PAIRING_CODE_TTL_MS,
        createdAt: now,
      });
    }

    return { coupleId: activeCoupleId, code: "000-000" };
  },
});
