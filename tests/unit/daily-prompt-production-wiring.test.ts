import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { runSingleInFlight } from "../../src/lib/runSingleInFlight";

const promptSheetSource = readFileSync("src/app/(sheet)/prompts/today.tsx", "utf8");
const promptBackendSource = readFileSync("convex/prompts.ts", "utf8");

void test("the production answer sheet reconciles lifecycle state before recording answer start", () => {
  assert.match(promptSheetSource, /api\.dailyPromptLifecycles\.reconcileToday/);
  assert.match(promptSheetSource, /ensureLifecycleReconciled\(\)[\s\S]*startAnswering\(\{\}\)/);
  assert.match(
    promptSheetSource,
    /runSingleInFlight\(\s*lifecycleReconcilePromiseRef,\s*\(\) => reconcileLifecycle\(\{\}\)\s*\)/,
  );
});

void test("blocked lifecycle reconciliation settles and a later ready answer attempt retries", async () => {
  const requestRef: { current: Promise<{ status: string }> | null } = { current: null };
  let ready = false;
  let calls = 0;
  const reconcile = () =>
    runSingleInFlight(requestRef, async () => {
      calls += 1;
      return { status: ready ? "scheduled" : "blocked" };
    });

  assert.deepEqual(await reconcile(), { status: "blocked" });
  assert.equal(requestRef.current, null, "a successful blocked result must not remain cached");
  ready = true;
  assert.deepEqual(await reconcile(), { status: "scheduled" });
  assert.equal(calls, 2, "the later answer attempt must invoke reconciliation again");
});

void test("the production client omits prompt text while the backend tolerates legacy input", () => {
  const saveCall = promptSheetSource.match(/await saveAnswer\(\{[\s\S]*?\}\);/)?.[0] ?? "";
  assert.ok(saveCall, "expected saveAnswer call");
  assert.doesNotMatch(saveCall, /prompt:/);
  assert.match(
    promptBackendSource,
    /export const answer = mutation\(\{[\s\S]*?prompt: v\.optional\(v\.string\(\)\)/,
    "the backend must continue accepting the legacy prompt argument during rollout",
  );
  const answerMutation =
    promptBackendSource.match(/export const answer = mutation\(\{[\s\S]*?\n\}\);/)?.[0] ?? "";
  assert.ok(answerMutation, "expected answer mutation");
  assert.doesNotMatch(answerMutation, /args\.prompt(?!Date)/);
});
