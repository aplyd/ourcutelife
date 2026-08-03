import { v } from "convex/values";
import { createClient } from "@convex-dev/better-auth";
import { convex as convexPlugin } from "@convex-dev/better-auth/plugins";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
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
  let authUser: Awaited<ReturnType<typeof authComponent.safeGetAuthUser>>;
  try {
    authUser = await authComponent.safeGetAuthUser(ctx as never);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('Component "betterAuth"')) {
      throw error;
    }
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.tokenIdentifier) return null;
    const users = await ctx.db
      .query("users")
      .withIndex("by_auth_user_id", (q) => q.eq("authUserId", identity.tokenIdentifier))
      .take(2);
    if (users.length > 1) throw new Error("Ambiguous authenticated user.");
    return users[0] ?? null;
  }
  if (!authUser) return null;

  const byAuthUserId = await ctx.db
    .query("users")
    .withIndex("by_auth_user_id", (q) => q.eq("authUserId", authUser._id))
    .take(2);
  if (byAuthUserId.length > 1) throw new Error("Ambiguous authenticated user.");
  return byAuthUserId[0] ?? null;
}

async function getSingleMembership(ctx: QueryCtx | MutationCtx, userId: Doc<"users">["_id"]) {
  const memberships = await ctx.db
    .query("coupleMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(2);
  if (memberships.length > 1) throw new Error("Ambiguous couple membership.");
  return memberships[0] ?? null;
}

export async function avatarStorageIsReferenced(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  excludingUserId?: Id<"users">,
): Promise<boolean> {
  const membershipReference = await ctx.db
    .query("coupleMembers")
    .withIndex("by_avatar_storage_id", (q) => q.eq("avatarStorageId", storageId))
    .first();
  if (membershipReference) return true;
  const userReferences = await ctx.db
    .query("users")
    .withIndex("by_avatar_storage_id", (q) => q.eq("avatarStorageId", storageId))
    .take(excludingUserId ? 2 : 1);
  return excludingUserId
    ? userReferences.some((reference) => reference._id !== excludingUserId)
    : userReferences.length > 0;
}

export async function cleanupLegacyGlobalAvatar(
  ctx: MutationCtx,
  user: Doc<"users">,
): Promise<boolean> {
  if (!user.avatarUrl && !user.avatarStorageId) return false;

  if (
    user.avatarStorageId &&
    !(await avatarStorageIsReferenced(ctx, user.avatarStorageId, user._id))
  ) {
    await ctx.storage.delete(user.avatarStorageId);
  }

  await ctx.db.patch(user._id, {
    avatarUrl: undefined,
    avatarStorageId: undefined,
    updatedAt: Date.now(),
  });
  return true;
}

export const cleanupMyLegacyGlobalAvatar = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) throw new Error("Not signed in.");
    return { cleaned: await cleanupLegacyGlobalAvatar(ctx, user) };
  },
});

export const syncBetterAuthUser = mutation({
  args: {},
  handler: async (ctx) => {
    const authUser = await authComponent.getAuthUser(ctx as never);
    const byAuthUserId = await ctx.db
      .query("users")
      .withIndex("by_auth_user_id", (q) => q.eq("authUserId", authUser._id))
      .take(2);
    if (byAuthUserId.length > 1) throw new Error("Ambiguous authenticated user.");
    const byEmail = authUser.email
      ? await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", authUser.email!))
          .take(2)
      : [];
    if (byEmail.length > 1) throw new Error("Ambiguous authenticated email.");
    const existing = byAuthUserId[0] ?? byEmail[0] ?? null;
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        authUserId: authUser._id,
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
    await cleanupLegacyGlobalAvatar(ctx, user);
    const now = Date.now();
    await ctx.db.patch(user._id, {
      fullName,
      updatedAt: now,
    });
    if (args.avatarUrl?.trim()) {
      const membership = await getSingleMembership(ctx, user._id);
      if (!membership) throw new Error("Pair with your partner first.");
      await ctx.db.patch(membership._id, {
        avatarUrl: args.avatarUrl.trim(),
      });
    }
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
    await cleanupLegacyGlobalAvatar(ctx, user);
    const membership = await getSingleMembership(ctx, user._id);
    if (!membership) throw new Error("Pair with your partner first.");
    const oldStorageId = membership.avatarStorageId;
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata) throw new Error("Uploaded image is unavailable.");
    if (!metadata.contentType?.startsWith("image/")) throw new Error("Upload an image file.");
    if (metadata.size > 5_000_000) throw new Error("Keep profile photos under 5 MB.");
    const avatarUrl = await ctx.storage.getUrl(args.storageId);
    if (!avatarUrl) throw new Error("Uploaded image is unavailable.");
    await ctx.db.patch(membership._id, {
      avatarStorageId: args.storageId,
      avatarUrl,
    });
    if (
      oldStorageId &&
      oldStorageId !== args.storageId &&
      !(await avatarStorageIsReferenced(ctx, oldStorageId))
    ) {
      await ctx.storage.delete(oldStorageId);
    }
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
    await cleanupLegacyGlobalAvatar(ctx, user);
    const membership = await getSingleMembership(ctx, user._id);
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

    const membership = await getSingleMembership(ctx, user._id);

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
    const userAvatarUrl = membership?.avatarStorageId
      ? ((await ctx.storage.getUrl(membership.avatarStorageId)) ?? membership.avatarUrl)
      : membership?.avatarUrl;
    const partnerAvatarUrl = partnerMembership?.avatarStorageId
      ? ((await ctx.storage.getUrl(partnerMembership.avatarStorageId)) ??
        partnerMembership.avatarUrl)
      : partnerMembership?.avatarUrl;

    return {
      user: {
        _id: user._id,
        email: user.email,
        fullName: user.fullName,
        avatarUrl: userAvatarUrl,
      },
      partner: partner
        ? {
            _id: partner._id,
            email: partner.email,
            fullName: partner.fullName,
            avatarUrl: partnerAvatarUrl,
          }
        : null,
      membership: membership
        ? {
            _id: membership._id,
            coupleId: membership.coupleId,
            userId: membership.userId,
            role: membership.role,
            joinedAt: membership.joinedAt,
          }
        : null,
      couple,
      memberCount: members.length,
      activePairingCode: activePairingCode
        ? `${activePairingCode.code.slice(0, 3)}-${activePairingCode.code.slice(3)}`
        : null,
      activePairingCodeExpiresAt: activePairingCode?.expiresAt ?? null,
    };
  },
});
