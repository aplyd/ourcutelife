import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rootLayoutSource = readFileSync("src/app/_layout.tsx", "utf8");
const pairingSource = readFileSync("src/app/pairing.tsx", "utf8");

void test("mock-auth walkthroughs never reconcile or request push registration", () => {
  assert.doesNotMatch(rootLayoutSource, /from "@\/lib\/notifications"/);
  assert.doesNotMatch(pairingSource, /from "@\/lib\/notifications"/);
  assert.match(
    rootLayoutSource,
    /if \(isDevMockAuthEnabled \|\| !betterAuthSession\.data\?\.session\) return;/,
  );
  assert.match(
    pairingSource,
    /async function registerForNotificationsAfterPairing\(\) \{\s*if \(isDevMockAuthEnabled\) return;/,
  );
});
