/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  exhaustedQualityTimeInventoryCopy,
  isQualityTimeWriteDisabled,
  qualityTimeStaleVersionFromError,
  reconcileQualityTimeStaleVersion,
} from "../../src/lib/qualityTimeInitiatorState";

const plansSource = readFileSync(resolve(process.cwd(), "src/app/(tabs)/plans.tsx"), "utf8");
const composerSource = readFileSync(
  resolve(process.cwd(), "src/app/plans/quality-time/new.tsx"),
  "utf8",
);
const requestSource = readFileSync(
  resolve(process.cwd(), "src/app/plans/quality-time/[requestId].tsx"),
  "utf8",
);

void test("Plans exposes the additive Quality Time entry without replacing legacy actions", () => {
  const start = plansSource.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*accessibilityLabel="Start Quality Time"(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );

  assert.ok(start, "expected the Start Quality Time action");
  assert.match(start[0], /accessibilityRole="button"/);
  assert.match(start[0], /router\.push\("\/plans\/quality-time\/new"\)/);
  assert.match(plansSource, /accessibilityLabel="Open surprise plan item picker"/);
  assert.match(plansSource, /accessibilityLabel="Open matched plan item history"/);
  assert.match(plansSource, /title="Swipe plan items"/);
  assert.match(plansSource, /title="Our Dates"/);
  assert.match(plansSource, /title="Explore Dates"/);
});

void test("Quality Time composer exposes timing, category, and submit semantics", () => {
  assert.match(composerSource, /accessibilityLabel="Back to Plans"/);

  for (const label of ["Now", "Plan for later"]) {
    assert.match(composerSource, new RegExp(`label: "${label}"`));
  }
  assert.match(composerSource, /accessibilityState=\{\{ selected: timingKind === item\.value \}\}/);

  for (const label of ["Eat", "Drink", "Explore/Adventure", "Entertainment", "Romance"]) {
    assert.match(composerSource, new RegExp(`label: "${label}"`));
  }
  assert.match(
    composerSource,
    /accessibilityState=\{\{ selected: selectedCategories\.includes\(item\.value\) \}\}/,
  );

  const submit = composerSource.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*onPress=\{handleCreateDraft\}(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );
  assert.ok(submit, "expected the Choose private options action");
  assert.match(submit[0], /accessibilityRole="button"/);
  assert.match(submit[0], /accessibilityLabel="Choose private options"/);
  assert.match(submit[0], /accessibilityState=\{\{ disabled: !canSubmit, busy: isSubmitting \}\}/);
  assert.match(composerSource, /accessibilityLabel="Quality Time future date and time"/);
});

void test("Quality Time composer avoids privacy-breaking and proactive copy", () => {
  assert.doesNotMatch(composerSource, /date night/i);
  assert.doesNotMatch(composerSource, /creator|created by/i);
  assert.doesNotMatch(composerSource, /we(?:'|’)ll notify|notification sent|notify your partner/i);
});

void test("initiator shortlist exposes selected categories and exact server-count send readiness", () => {
  assert.match(requestSource, /accessibilityLabel=\{`Choose \$\{categoryLabels\[category\]\}`\}/);
  assert.match(requestSource, /accessibilityState=\{\{ selected: activeCategory === category \}\}/);
  assert.match(
    requestSource,
    /request\.shortlistCounts\.every\(\s*\(count\) => count\.acceptedCount >= 3 && count\.acceptedCount <= 5,?\s*\)/s,
  );

  const send = requestSource.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*onPress=\{handleSend\}(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );
  assert.ok(send, "expected the Send Quality Time request action");
  assert.match(send[0], /accessibilityRole="button"/);
  assert.match(send[0], /accessibilityLabel="Send Quality Time request"/);
  assert.match(send[0], /accessibilityState=\{\{ disabled: !canSend, busy: isSending \}\}/);
  assert.match(send[0], /disabled=\{!canSend\}/);
});

void test("initiator card decisions share named busy and disabled semantics", () => {
  assert.match(requestSource, /accessibilityLabel=\{`Pass \$\{card\.title\}`\}/);
  assert.match(requestSource, /accessibilityLabel=\{`Accept \$\{card\.title\}`\}/);
  assert.equal(
    requestSource.match(
      /accessibilityState=\{\{\s*disabled: isDecisionPending \|\| isAwaitingFreshProjection,\s*busy: isDecisionPending,\s*\}\}/g,
    )?.length,
    2,
  );
  assert.equal(
    requestSource.match(/disabled=\{isDecisionPending \|\| isAwaitingFreshProjection\}/g)?.length,
    2,
  );
});

void test("stale writes stay disabled until a newer server projection arrives", () => {
  for (const operation of ["decision", "send", "cancel"] as const) {
    const submittedVersion = 7;
    let staleVersion = qualityTimeStaleVersionFromError(
      new Error(`Quality Time request changed during ${operation}. Refresh and try again.`),
      submittedVersion,
    );

    assert.equal(staleVersion, submittedVersion);
    assert.equal(isQualityTimeWriteDisabled(false, staleVersion, submittedVersion), true);

    staleVersion = reconcileQualityTimeStaleVersion(staleVersion, submittedVersion);
    assert.equal(
      staleVersion,
      submittedVersion,
      `${operation} must remain latched on same version`,
    );
    assert.equal(isQualityTimeWriteDisabled(false, staleVersion, submittedVersion), true);

    staleVersion = reconcileQualityTimeStaleVersion(staleVersion, submittedVersion + 1);
    assert.equal(staleVersion, null, `${operation} may clear only on a newer projection`);
    assert.equal(isQualityTimeWriteDisabled(false, staleVersion, submittedVersion + 1), false);
  }

  assert.equal(isQualityTimeWriteDisabled(true, null, 7), true);
  assert.equal(
    requestSource.match(/latchStaleProjection\(currentRequest\.version, err\)/g)?.length,
    3,
  );
  const decisionHandler = requestSource.match(
    /async function handleDecision[\s\S]*?\n  }\n\n  async function handleSend/,
  );
  const sendHandler = requestSource.match(
    /async function handleSend[\s\S]*?\n  }\n\n  async function confirmCancel/,
  );
  const cancelHandler = requestSource.match(
    /async function confirmCancel[\s\S]*?\n  }\n\n  function requestCancel/,
  );
  assert.ok(decisionHandler);
  assert.ok(sendHandler);
  assert.ok(cancelHandler);
  assert.match(decisionHandler[0], /isDecisionPending \|\| isAwaitingFreshProjection\) return/);
  assert.match(sendHandler[0], /currentRequest\.status !== "draft" \|\| !canSend\) return/);
  assert.match(cancelHandler[0], /isCanceling \|\|\s*isAwaitingFreshProjection/);
  assert.match(requestSource, /Waiting for the latest server state before retrying\./);
  assert.doesNotMatch(requestSource, /latest server state is shown/i);
});

void test("exhausted send-ready inventory does not claim three choices are unreachable", () => {
  for (const acceptedCount of [0, 1, 2]) {
    const copy = exhaustedQualityTimeInventoryCopy(acceptedCount);
    assert.equal(copy.isSendReady, false);
    assert.match(copy.title, /Not enough/i);
    assert.match(copy.body, /does not have enough choices to reach 3/i);
  }

  for (const acceptedCount of [3, 4, 5]) {
    const copy = exhaustedQualityTimeInventoryCopy(acceptedCount);
    assert.equal(copy.isSendReady, true);
    assert.match(copy.title, /ready to send/i);
    assert.match(copy.body, /No more choices are available/i);
    assert.doesNotMatch(`${copy.title} ${copy.body}`, /does not have enough|cannot reach 3/i);
  }

  assert.match(
    requestSource,
    /exhaustedQualityTimeInventoryCopy\(activeCount\?\.acceptedCount \?\? 0\)/,
  );
});

void test("initiator route exposes cancel and back button semantics", () => {
  for (const label of ["Cancel Quality Time request", "Back to Plans"]) {
    const control = requestSource.match(
      new RegExp(
        `<Pressable\\b(?:(?!<Pressable\\b|<\\/Pressable>).)*accessibilityLabel="${label}"(?:(?!<Pressable\\b|<\\/Pressable>).)*<\\/Pressable>`,
        "s",
      ),
    );
    assert.ok(control, `expected ${label}`);
    assert.match(control[0], /accessibilityRole="button"/);
  }
  assert.match(requestSource, /Alert\.alert\("Cancel Quality Time request\?"/);
});

void test("initiator route contains no responder preference or authorship labels", () => {
  assert.doesNotMatch(requestSource, /creator|created by|authored by/i);
  assert.doesNotMatch(
    requestSource,
    /partner (?:selected|chose|accepted|passed|rejected)|responder (?:category|choice|decision)/i,
  );
  assert.doesNotMatch(requestSource, /notif(?:y|ication)/i);
});
