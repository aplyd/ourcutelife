import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveMembershipAccess } from "../../src/lib/membershipAccess";

void test("membership access stays loading until auth and viewer projections settle", () => {
  assert.equal(
    resolveMembershipAccess({ sessionPending: true, hasSession: false, viewer: undefined }),
    "loading",
  );
  assert.equal(
    resolveMembershipAccess({ sessionPending: false, hasSession: true, viewer: undefined }),
    "loading",
  );
});

void test("membership access sends signed-out sessions to auth", () => {
  assert.equal(
    resolveMembershipAccess({ sessionPending: false, hasSession: false, viewer: undefined }),
    "signed-out",
  );
});

void test("membership access fails closed for singleton, duplicate, and synthetic partners", () => {
  const realUser = { _id: "user-a", authUserId: "auth-a" };
  const realPartner = { _id: "user-b", authUserId: "auth-b" };

  for (const viewer of [
    null,
    { couple: { _id: "couple" }, memberCount: 1, user: realUser, partner: null },
    { couple: { _id: "couple" }, memberCount: 2, user: realUser, partner: realUser },
    {
      couple: { _id: "couple" },
      memberCount: 2,
      user: realUser,
      partner: { _id: "test", authUserId: "test-partner:user-a" },
    },
    {
      couple: { _id: "couple" },
      memberCount: 2,
      user: realUser,
      partner: { _id: "legacy-user" },
    },
    {
      couple: { _id: "couple" },
      memberCount: 2,
      user: realUser,
      partner: { _id: "duplicate-auth-user", authUserId: "auth-a" },
    },
    { couple: { _id: "couple" }, memberCount: 3, user: realUser, partner: realPartner },
  ]) {
    assert.equal(
      resolveMembershipAccess({ sessionPending: false, hasSession: true, viewer }),
      "pairing",
    );
  }
});

void test("membership access unlocks only an exact two-person real pair", () => {
  assert.equal(
    resolveMembershipAccess({
      sessionPending: false,
      hasSession: true,
      viewer: {
        couple: { _id: "couple" },
        memberCount: 2,
        user: { _id: "user-a", authUserId: "auth-a" },
        partner: { _id: "user-b", authUserId: "auth-b" },
      },
    }),
    "paired",
  );
});

void test("root navigation protects tabs and couple routes before native tabs mount", () => {
  const rootLayout = readFileSync("src/app/_layout.tsx", "utf8");
  assert.match(rootLayout, /resolveMembershipAccess/);
  assert.match(rootLayout, /<Stack\.Protected guard=\{membershipAccess === "signed-out"\}>/);
  assert.match(rootLayout, /<Stack\.Protected guard=\{membershipAccess === "pairing"\}>/);
  assert.match(rootLayout, /<Stack\.Protected guard=\{membershipAccess === "paired"\}>/);
  assert.match(rootLayout, /<Stack\.Screen name="\(tabs\)" \/>/);
  assert.match(rootLayout, /<Stack\.Screen\s+name="\(sheet\)"/);
});

void test("pairing uses the same fail-closed membership projection as the root guard", () => {
  const pairing = readFileSync("src/app/pairing.tsx", "utf8");
  assert.match(pairing, /resolveMembershipAccess/);
  assert.match(pairing, /membershipAccess === "paired"/);
  assert.doesNotMatch(pairing, /memberCount >= 2/);
  assert.doesNotMatch(pairing, /router\.replace\("\/\(tabs\)"\)/);
  assert.match(pairing, /api\.pairing\.leaveCouple/);
  assert.match(pairing, /Reset pairing setup/);
});

void test("auth and pairing wait for the protected navigator instead of forcing guarded routes", () => {
  const auth = readFileSync("src/app/auth.tsx", "utf8");
  const pairing = readFileSync("src/app/pairing.tsx", "utf8");
  assert.doesNotMatch(auth, /router\.replace/);
  assert.doesNotMatch(pairing, /router\.replace/);
});
