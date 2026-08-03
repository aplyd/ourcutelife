import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/(tabs)/index.tsx", "utf8");

void test("Today skips couple-scoped queries until the viewer has an active couple", () => {
  assert.match(source, /const hasCouple = Boolean\(viewer\?\.couple\);/);
  assert.match(source, /useAppQuery\(api\.prompts\.today, hasCouple \? \{\} : "skip"\)/);
  assert.match(source, /useAppQuery\(api\.moments\.listMine, hasCouple \? \{\} : "skip"\)/);
  assert.match(source, /if \(!viewer\?\.couple\) return <Redirect href="\/pairing" \/>;/);
});
