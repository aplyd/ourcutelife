import { v } from "convex/values";
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

    await ctx.db.insert("pairingCodes", {
      coupleId: activeCoupleId,
      code,
      createdByUserId: user._id,
      expiresAt: now + PAIRING_CODE_TTL_MS,
      createdAt: now,
    });

    return {
      coupleId: activeCoupleId,
      code: displayCode(code),
      expiresAt: now + PAIRING_CODE_TTL_MS,
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
