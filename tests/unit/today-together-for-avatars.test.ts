/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/(tabs)/index.tsx"), "utf8");

void test("Together For renders profile images with warm initial fallbacks", () => {
  const header = source.match(
    /<View className="flex-row items-center gap-3">[\s\S]*?<View className="flex-row flex-wrap gap-2">/,
  );

  assert.ok(header, "expected the Together For header");
  assert.match(header[0], /viewer\.user\.avatarUrl/);
  assert.match(header[0], /viewer\.partner\?\.avatarUrl/);
  assert.match(header[0], /<Image source=\{\{ uri: viewer\.user\.avatarUrl \}\}/);
  assert.match(header[0], /<Image source=\{\{ uri: viewer\.partner\.avatarUrl \}\}/);
  assert.match(header[0], /profileInitial\(viewer\.user\.fullName \?\? viewer\.user\.email, "Y"\)/);
  assert.match(
    header[0],
    /profileInitial\(\s*viewer\.partner\?\.fullName \?\? viewer\.partner\?\.email,\s*"P",?\s*\)/,
  );
  assert.doesNotMatch(header[0], />You</);
  assert.doesNotMatch(header[0], />♥</);
});

void test("Together For avatar pair is decorative while its complete sentence remains public", () => {
  const header = source.match(
    /<View className="flex-row items-center gap-3">[\s\S]*?<View className="flex-row flex-wrap gap-2">/,
  );

  assert.ok(header, "expected the Together For header");
  assert.match(header[0], /accessibilityElementsHidden/);
  assert.match(header[0], /importantForAccessibility="no-hide-descendants"/);
  assert.match(header[0], /You and \{partnerName\} have been together for…/);
});
