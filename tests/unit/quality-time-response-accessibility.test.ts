/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const responderRoute = "src/app/plans/quality-time/[requestId]/respond.tsx";
const outcomeRoute = "src/app/plans/quality-time/[requestId]/outcome.tsx";
const initiatorRoute = "src/app/plans/quality-time/[requestId].tsx";
const responderSource = readFileSync(resolve(process.cwd(), responderRoute), "utf8");
const outcomeSource = readFileSync(resolve(process.cwd(), outcomeRoute), "utf8");
const initiatorSource = readFileSync(resolve(process.cwd(), initiatorRoute), "utf8");

function pressableWithLabel(source: string, labelPattern: string) {
  return source.match(
    new RegExp(
      `<Pressable\\b(?:(?!<Pressable\\b|<\\/Pressable>).)*accessibilityLabel=${labelPattern}(?:(?!<Pressable\\b|<\\/Pressable>).)*<\\/Pressable>`,
      "s",
    ),
  );
}

void test("exact responder and outcome routes query the request by route requestId", () => {
  for (const source of [responderSource, outcomeSource]) {
    assert.match(source, /useLocalSearchParams<\{ requestId: string \}>\(\)/);
    assert.match(
      source,
      /useAppQuery\(getQualityTimeRequest, requestId \? \{ requestId \} : "skip"\)/,
    );
  }
  assert.match(responderSource, /export default function QualityTimeRespondScreen/);
  assert.match(outcomeSource, /export default function QualityTimeOutcomeScreen/);
});

void test("responder sent state exposes requested category toggles and selected semantics", () => {
  for (const [category, label] of [
    ["eat", "Eat"],
    ["drink", "Drink"],
    ["explore_adventure", "Explore/Adventure"],
    ["entertainment", "Entertainment"],
    ["romance", "Romance"],
  ]) {
    assert.match(responderSource, new RegExp(`${category}: "${label}"`));
  }
  assert.match(
    responderSource,
    /accessibilityLabel=\{`Choose \$\{categoryLabels\[category\]\} for this Quality Time`\}/,
  );
  assert.match(
    responderSource,
    /accessibilityState=\{\{ selected: selectedCategories\.includes\(category\) \}\}/,
  );
});

void test("Start choosing together has the exact disabled and busy gate", () => {
  const start = pressableWithLabel(responderSource, '"Start choosing together"');
  assert.ok(start, "expected Start choosing together button");
  assert.match(start[0], /accessibilityRole="button"/);
  assert.match(start[0], /accessibilityState=\{\{ disabled: !canBegin, busy: isBeginning \}\}/);
  assert.match(start[0], /disabled=\{!canBegin\}/);
  assert.match(responderSource, /selectedCategories\.length > 0/);
  assert.match(
    responderSource,
    /beginResponse\(\{\s*requestId: currentRequest\.requestId,\s*expectedVersion: currentRequest\.version,\s*categories: selectedCategories,\s*\}\)/s,
  );
});

void test("title-specific responder Pass and Accept buttons share disabled and busy semantics", () => {
  for (const action of ["Pass", "Accept"]) {
    const control = pressableWithLabel(
      responderSource,
      `\\{\\\`${action} \\$\\{card\\.title\\}\\\`\\}`,
    );
    assert.ok(control, `expected title-specific ${action} button`);
    assert.match(control[0], /accessibilityRole="button"/);
  }
  assert.equal(
    responderSource.match(
      /accessibilityState=\{\{\s*disabled: isDecisionDisabled,\s*busy: isDecisionPending,\s*\}\}/g,
    )?.length,
    2,
  );
  assert.equal(responderSource.match(/disabled=\{isDecisionDisabled\}/g)?.length, 2);
});

void test("responder decisions submit optionId only and never planIdeaId", () => {
  const handler = responderSource.match(
    /async function handleDecision[\s\S]*?\n  }\n\n  async function confirmCancel/,
  );
  assert.ok(handler, "expected responder decision handler");
  assert.match(
    handler[0],
    /recordDecision\(\{\s*requestId: currentRequest\.requestId,\s*expectedVersion: currentRequest\.version,\s*optionId: card\.optionId,\s*decision,\s*\}\)/s,
  );
  assert.doesNotMatch(responderSource, /planIdeaId/);
});

void test("stale responder writes latch every mutation until a strictly newer projection", () => {
  assert.match(
    responderSource,
    /reconcileQualityTimeResponderStaleVersion\(\s*staleVersion,\s*request\?\.version,\s*\)/s,
  );
  assert.match(
    responderSource,
    /isQualityTimeResponderWriteDisabled\(\s*false,\s*staleVersion,\s*request\?\.version,\s*\)/s,
  );
  assert.equal(
    responderSource.match(/latchStaleProjection\(currentRequest\.version, err\)/g)?.length,
    3,
  );
  assert.match(responderSource, /This request changed\. Waiting for the latest state\./);
  assert.doesNotMatch(responderSource, /auto.?retry|retrying (?:the )?(?:choice|decision)/i);
});

void test("responder cancellation uses native confirmation and shared write gates", () => {
  const cancel = pressableWithLabel(responderSource, '"Cancel Quality Time request"');
  assert.ok(cancel, "expected Cancel Quality Time request button");
  assert.match(cancel[0], /accessibilityRole="button"/);
  assert.match(cancel[0], /busy: isCanceling/);
  assert.match(cancel[0], /disabled: isCancelDisabled/);
  assert.match(responderSource, /Alert\.alert\("Cancel Quality Time request\?"/);
  assert.match(responderSource, /\{ text: "Keep request", style: "cancel" \}/);
  assert.match(responderSource, /text: "Cancel request", style: "destructive"/);
  assert.match(
    responderSource,
    /cancelRequest\(\{\s*requestId: currentRequest\.requestId,\s*expectedVersion: currentRequest\.version,\s*\}\)/s,
  );
});

void test("completed responder redirects and initiator exposes the named outcome link", () => {
  assert.match(
    responderSource,
    /router\.replace\(`\/plans\/quality-time\/\$\{request\.requestId\}\/outcome`\)/,
  );
  const viewOutcome = pressableWithLabel(initiatorSource, '"View Quality Time outcome"');
  assert.ok(viewOutcome, "expected initiator outcome link");
  assert.match(viewOutcome[0], /accessibilityRole="button"/);
  assert.match(
    viewOutcome[0],
    /router\.replace\(`\/plans\/quality-time\/\$\{request\.requestId\}\/outcome`\)/,
  );
});

void test("outcome renders only completed mutual summaries and neutral no-match rows", () => {
  assert.match(outcomeSource, /request\.status === "completed"/);
  assert.match(
    outcomeSource,
    /buildQualityTimeOutcomeSummary\(\s*request\.selectedCategories,\s*request\.categoryResults,?\s*\)/s,
  );
  assert.match(outcomeSource, /Your Quality Time is ready/);
  assert.match(outcomeSource, /accessibilityLabel=\{result\.accessibilityLabel\}/);
  assert.match(outcomeSource, /result\.status === "matched"/);
  assert.match(outcomeSource, /No shared option this time/);
  assert.match(outcomeSource, /Quality Time is still in progress/);
  assert.match(outcomeSource, /Back to Plans/);
  assert.doesNotMatch(
    outcomeSource,
    /categoryResults\s*[:=].*useState|route\.params.*(?:option|result)/s,
  );
});

void test("in-progress outcome navigation never guesses that a neutral sent projection belongs to the responder", () => {
  assert.doesNotMatch(
    outcomeSource,
    /request\.status === "sent"\s*\|\|\s*"responderCategories" in request/,
  );
  assert.match(
    outcomeSource,
    /request\.status === "responding"\s*&&\s*"responderCategories" in request/,
  );
  assert.match(
    outcomeSource,
    /router\.replace\(`\/plans\/quality-time\/\$\{request\.requestId\}`\)/,
  );
});

void test("responder and outcome query failures render route-local generic unavailable boundaries", () => {
  for (const source of [responderSource, outcomeSource]) {
    assert.match(source, /export function ErrorBoundary\(/);
    assert.match(source, /Quality Time unavailable/);
  }
});

void test("terminal and unavailable responder states cannot render cached cards", () => {
  assert.doesNotMatch(responderSource, /useState<[^>]*(?:Card|Option)|setCard|cachedCard/i);
  assert.ok(
    responderSource.indexOf('if (request.status === "canceled" || request.status === "expired")') <
      responderSource.indexOf("const card ="),
  );
  assert.ok(
    responderSource.indexOf("if (!responderRequest || !progress)") <
      responderSource.indexOf("const card ="),
  );
});

void test("responder and outcome source avoid privacy-breaking fields and claims", () => {
  const combined = `${responderSource}\n${outcomeSource}`;
  assert.doesNotMatch(combined, /creator|createdBy|created by|authored by|authorship/i);
  assert.doesNotMatch(combined, /your partner (?:liked|chose|accepted|passed|rejected)/i);
  assert.doesNotMatch(combined, /decision (?:order|sequence)|rejected(?:Ids?| IDs?)/i);
  assert.doesNotMatch(combined, /notif(?:y|ied|ication)|push sent/i);
  assert.doesNotMatch(combined, /userId|coupleId|sourceCreatedByUserId/);
});
