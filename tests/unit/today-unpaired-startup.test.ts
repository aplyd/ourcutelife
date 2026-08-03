import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/(tabs)/index.tsx", "utf8");
const promptsSource = readFileSync("convex/prompts.ts", "utf8");
const authSource = readFileSync("convex/auth.ts", "utf8");
const schemaSource = readFileSync("convex/schema.ts", "utf8");

void test("Today skips couple-scoped queries until the viewer has an active couple", () => {
  assert.match(source, /const hasCouple = Boolean\(viewer\?\.couple\);/);
  assert.match(source, /useAppQuery\(api\.prompts\.today, hasCouple \? \{\} : "skip"\)/);
  assert.match(source, /useAppQuery\(api\.moments\.listMine, hasCouple \? \{\} : "skip"\)/);
  assert.match(source, /if \(!viewer\?\.couple\) return <Redirect href="\/pairing" \/>;/);
});

void test("Today resolves the same Better Auth app user as the paired viewer", () => {
  assert.match(promptsSource, /import \{ getCurrentAppUser \} from "\.\/auth";/);
  assert.match(
    promptsSource,
    /export const today = query\([\s\S]*?const user = await getCurrentAppUser\(ctx\);/,
  );
  assert.doesNotMatch(
    source,
    /if \(!todayPrompt\) return <Redirect href="\/pairing" \/>;/,
    "a transient null Today read must not bounce a paired viewer into a pairing redirect loop",
  );
  assert.match(source, /Today is getting ready/);
});

void test("current app-user authorization never falls back to an email scan", () => {
  const resolver = authSource.slice(
    authSource.indexOf("export async function getCurrentAppUser"),
    authSource.indexOf("async function getSingleMembership"),
  );
  assert.doesNotMatch(resolver, /authUser\.email|query\("users"\)\.take/);
  assert.match(schemaSource, /\.index\("by_email", \["email"\]\)/);
  assert.match(
    authSource,
    /withIndex\("by_email",[\s\S]*?\.take\(2\)[\s\S]*?Ambiguous authenticated email/,
  );
});
