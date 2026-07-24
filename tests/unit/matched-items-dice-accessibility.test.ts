/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/(tabs)/plans.tsx"), "utf8");

void test("Matched Items dice exposes explicit native button semantics and a stable name", () => {
  const matchedItemsStart = source.indexOf('title="Matched Items"');
  const matchedItemsEnd = source.indexOf("{filteredMatches.length", matchedItemsStart);

  assert.notEqual(matchedItemsStart, -1, "expected the Matched Items section");
  assert.notEqual(matchedItemsEnd, -1, "expected the end of the Matched Items controls");

  const matchedItemsControls = source.slice(matchedItemsStart, matchedItemsEnd);
  const diceStart = matchedItemsControls.indexOf("<Pressable");
  const diceEnd = matchedItemsControls.indexOf("</Pressable>", diceStart);

  assert.notEqual(diceStart, -1, "expected the Matched Items dice control");
  assert.notEqual(diceEnd, -1, "expected the end of the Matched Items dice control");

  const dice = matchedItemsControls.slice(diceStart, diceEnd);
  assert.match(dice, /accessibilityRole="button"/);
  assert.match(dice, /accessibilityLabel="Pick random matched plan items"/);
  assert.match(dice, /onPress=\{showDicePicks\}/);
});
