import { v } from "convex/values";
import { createClient } from "@convex-dev/better-auth";
import { convex as convexPlugin } from "@convex-dev/better-auth/plugins";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { components } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import authConfig from "./auth.config";

export const authComponent = createClient(components.betterAuth);
export const { getAuthUser } = authComponent.clientApi();

export const createAuth = (ctx: any) =>
  betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.CONVEX_SITE_URL,
    basePath: "/api/auth",
    database: authComponent.adapter(ctx),
    trustedOrigins: ["ourcutelife://", "exp://", "http://localhost:8081"],
    socialProviders: {
      apple:
        process.env.BETTER_AUTH_APPLE_CLIENT_ID && process.env.BETTER_AUTH_APPLE_CLIENT_SECRET
          ? {
              clientId: process.env.BETTER_AUTH_APPLE_CLIENT_ID,
              clientSecret: process.env.BETTER_AUTH_APPLE_CLIENT_SECRET,
              appBundleIdentifier: "com.ourcutelife.app",
              audience: [process.env.BETTER_AUTH_APPLE_CLIENT_ID, "com.ourcutelife.app"],
            }
          : undefined,
    },
    plugins: [expo(), convexPlugin({ authConfig })],
  });

export async function getCurrentAppUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users"> | null> {
  const authUser = await authComponent.safeGetAuthUser(ctx as never);
  if (!authUser) return null;

  return await ctx.db
    .query("users")
    .withIndex("by_auth_user_id", (q) => q.eq("authUserId", authUser._id))
    .first();
}

export const syncBetterAuthUser = mutation({
  args: {},
  handler: async (ctx) => {
    const authUser = await authComponent.getAuthUser(ctx as never);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_auth_user_id", (q) => q.eq("authUserId", authUser._id))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        email: authUser.email ?? existing.email,
        fullName: authUser.name ?? existing.fullName,
        updatedAt: now,
      });
      return { userId: existing._id };
    }
    const userId = await ctx.db.insert("users", {
      authUserId: authUser._id,
      email: authUser.email ?? undefined,
      fullName: authUser.name ?? undefined,
      createdAt: now,
      updatedAt: now,
    });
    return { userId };
  },
});

export const updateProfile = mutation({
  args: {
    fullName: v.string(),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) throw new Error("Not signed in.");
    const fullName = args.fullName.trim();
    if (!fullName) throw new Error("Add a name before saving.");
    await ctx.db.patch(user._id, {
      fullName,
      avatarUrl: args.avatarUrl?.trim() || user.avatarUrl,
      updatedAt: Date.now(),
    });
    return user._id;
  },
});

export const generateProfilePhotoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) throw new Error("Not signed in.");
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveProfilePhoto = mutation({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) throw new Error("Not signed in.");
    const oldStorageId = user.avatarStorageId;
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata) throw new Error("Uploaded image is unavailable.");
    if (!metadata.contentType?.startsWith("image/")) throw new Error("Upload an image file.");
    if (metadata.size > 5_000_000) throw new Error("Keep profile photos under 5 MB.");
    const avatarUrl = await ctx.storage.getUrl(args.storageId);
    if (!avatarUrl) throw new Error("Uploaded image is unavailable.");
    await ctx.db.patch(user._id, {
      avatarStorageId: args.storageId,
      avatarUrl,
      updatedAt: Date.now(),
    });
    if (oldStorageId && oldStorageId !== args.storageId) await ctx.storage.delete(oldStorageId);
    return { storageId: args.storageId, avatarUrl };
  },
});

export const updateAnniversary = mutation({
  args: {
    anniversaryDate: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) throw new Error("Not signed in.");
    const membership = await ctx.db
      .query("coupleMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!membership) throw new Error("Pair with your partner first.");
    if (!Number.isFinite(args.anniversaryDate)) throw new Error("Anniversary date is invalid.");
    await ctx.db.patch(membership.coupleId, {
      anniversaryDate: args.anniversaryDate,
      updatedAt: Date.now(),
    });
    return membership.coupleId;
  },
});

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return null;

    const membership = await ctx.db
      .query("coupleMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    const couple = membership ? await ctx.db.get(membership.coupleId) : null;
    const members = membership
      ? await ctx.db
          .query("coupleMembers")
          .withIndex("by_couple", (q) => q.eq("coupleId", membership.coupleId))
          .collect()
      : [];
    const activePairingCode = membership
      ? await ctx.db
          .query("pairingCodes")
          .withIndex("by_couple", (q) => q.eq("coupleId", membership.coupleId))
          .collect()
          .then(
            (codes) =>
              codes
                .filter((code) => !code.usedAt && code.expiresAt > Date.now())
                .sort((a, b) => b.createdAt - a.createdAt)[0],
          )
      : null;

    const partnerMembership = members.find((member) => member.userId !== user._id);
    const partner = partnerMembership ? await ctx.db.get(partnerMembership.userId) : null;
    const userAvatarUrl = user.avatarStorageId
      ? ((await ctx.storage.getUrl(user.avatarStorageId)) ?? user.avatarUrl)
      : user.avatarUrl;
    const partnerAvatarUrl = partner?.avatarStorageId
      ? ((await ctx.storage.getUrl(partner.avatarStorageId)) ?? partner.avatarUrl)
      : partner?.avatarUrl;

    return {
      user: { ...user, avatarUrl: userAvatarUrl },
      partner: partner ? { ...partner, avatarUrl: partnerAvatarUrl } : null,
      membership,
      couple,
      memberCount: members.length,
      activePairingCode: activePairingCode
        ? `${activePairingCode.code.slice(0, 3)}-${activePairingCode.code.slice(3)}`
        : null,
      activePairingCodeExpiresAt: activePairingCode?.expiresAt ?? null,
    };
  },
});
