import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authSource = readFileSync("convex/auth.ts", "utf8");
const rootLayoutSource = readFileSync("src/app/_layout.tsx", "utf8");
const schemaSource = readFileSync("convex/schema.ts", "utf8");

void test("profile photos are stored on couple membership rather than the global user", () => {
  assert.match(
    schemaSource,
    /coupleMembers: defineTable\(\{[\s\S]*?avatarUrl: v\.optional\(v\.string\(\)\),[\s\S]*?avatarStorageId: v\.optional\(v\.id\("_storage"\)\)/,
  );
  assert.match(
    authSource,
    /export const saveProfilePhoto = mutation\([\s\S]*?ctx\.db\.patch\(membership\._id, \{[\s\S]*?avatarStorageId: args\.storageId,[\s\S]*?avatarUrl/,
  );
  assert.doesNotMatch(
    authSource,
    /export const saveProfilePhoto = mutation\([\s\S]*?ctx\.db\.patch\(user\._id, \{[\s\S]*?avatarStorageId/,
  );
});

void test("legacy global profile media is deleted through an authenticated app-launch migration", () => {
  assert.match(authSource, /cleanupMyLegacyGlobalAvatar = mutation/);
  assert.match(authSource, /ctx\.storage\.delete\(user\.avatarStorageId\)/);
  assert.match(authSource, /avatarUrl: undefined,[\s\S]*avatarStorageId: undefined/);
  assert.match(rootLayoutSource, /cleanupMyLegacyGlobalAvatar\(\)\.catch/);
});

void test("viewer projects sanitized avatars only from the active couple memberships", () => {
  assert.match(authSource, /const userAvatarUrl = membership\?\.avatarStorageId/);
  assert.match(authSource, /membership\.avatarUrl/);
  assert.match(authSource, /const partnerAvatarUrl = partnerMembership\?\.avatarStorageId/);
  assert.match(authSource, /partnerMembership\.avatarUrl/);
  assert.match(authSource, /partner: partner\s*\?\s*\{\s*_id: partner\._id,/);
  assert.doesNotMatch(authSource, /partner: partner \? \{ \.\.\.partner/);
  assert.doesNotMatch(authSource, /user: \{ \.\.\.user/);
  assert.doesNotMatch(authSource, /\n\s*membership,\n/);
  assert.match(
    authSource,
    /oldStorageId[\s\S]*avatarStorageIsReferenced\(ctx, oldStorageId\)[\s\S]*ctx\.storage\.delete\(oldStorageId\)/,
  );
  assert.match(authSource, /membership: membership\s*\?\s*\{/);
});
