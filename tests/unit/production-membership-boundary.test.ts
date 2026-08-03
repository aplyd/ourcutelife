import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

void test("production pairing UI exposes no synthetic partner controls", () => {
  const source = readFileSync("src/app/pairing.tsx", "utf8");
  assert.doesNotMatch(source, /pairWithTestPartner/);
  assert.doesNotMatch(source, /Use test partner/);
  assert.doesNotMatch(source, /TestFlight shortcut/);
});

void test("Plans never seeds synthetic members from a client effect", () => {
  const source = readFileSync("src/app/(tabs)/plans.tsx", "utf8");
  assert.doesNotMatch(source, /seedDemoPartnerData/);
  assert.doesNotMatch(source, /hasRequestedDemoSeed/);
});

void test("synthetic membership seeders are not public Convex mutations", () => {
  const pairing = readFileSync("convex/pairing.ts", "utf8");
  const plans = readFileSync("convex/plans.ts", "utf8");
  assert.match(pairing, /export const pairWithTestPartner = internalMutation\(/);
  assert.match(plans, /export const seedDemoPartnerData = internalMutation\(/);
});

void test("authentication copy accurately describes persistent iOS session storage", () => {
  const source = readFileSync("src/app/auth.tsx", "utf8");
  assert.match(source, /stored securely in iOS Keychain/);
  assert.match(source, /may survive an app reinstall/);
  assert.doesNotMatch(source, /No device-owned session tokens/);
});
