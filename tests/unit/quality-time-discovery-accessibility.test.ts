/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/(tabs)/plans.tsx", "utf8");

void test("Plans preserves legacy and Start actions while adding named discovery buttons", () => {
  for (const marker of [
    "Start Quality Time",
    "Open surprise plan item picker",
    "Open matched plan item history",
    'title="Swipe plan items"',
    'title="Our Dates"',
    'title="Explore Dates"',
    'title="Matched Items"',
    'accessibilityLabel="Add a private plan item"',
  ]) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /accessibilityRole="button"[\s\S]*accessibilityLabel=\{actionLabel\}/);
  assert.match(
    source,
    /entry\.status === "sent" \? "Respond to Quality Time" : "Continue Quality Time"/,
  );
});

void test("discovery routes only with the projected requestId and renders a neutral summary", () => {
  assert.match(source, /useAppQuery\(listQualityTimePendingResponses, \{\}\)/);
  assert.match(source, /`\/plans\/quality-time\/\$\{entry\.requestId\}\/respond`/);
  assert.doesNotMatch(
    source,
    /quality-time\/\$\{(?:requestId|routeId|FIXED_REQUEST_ID)\}\/respond/,
  );
  assert.match(source, /accessibilityLabel=\{summaryLabel\}/);
  assert.match(source, /formatQualityTimeDiscoveryTiming\(entry\.timing\)/);
  assert.match(source, /entry\.selectedCategories\s*\.map\(.*qualityTimeCategoryLabels/s);
});

void test("discovery is independently loading and fails locally without hiding Plans", () => {
  assert.doesNotMatch(source, /pendingResponses === undefined[\s\S]*ActivityIndicator/);
  assert.match(source, /getDerivedStateFromError/);
  assert.match(source, /return <QualityTimeDiscovery \/>/);
  assert.match(source, /Quality Time requests unavailable/);
  assert.doesNotMatch(
    source,
    /useAppMutation\([^)]*qualityTime|markRead|readReceipt|badge|router\.(?:replace|push)\([^)]*pendingResponses/,
  );
});

void test("discovery card contains no private or delivery claims", () => {
  const discovery = source.match(/function QualityTimePendingResponseCard[\s\S]*?\n}\n/)?.[0] ?? "";
  assert.ok(discovery);
  assert.doesNotMatch(
    discovery,
    /partner|creator|initiator|responderCategories|progress|remaining|accepted|passed|decision|match|reject|outcome|expir|abandon|notif|deliver|seen|opened/i,
  );
});
