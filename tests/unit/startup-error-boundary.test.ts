import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rootLayoutSource = readFileSync("src/app/_layout.tsx", "utf8");

void test("the root route exports a recoverable Expo Router error boundary", () => {
  assert.match(rootLayoutSource, /import type \{ ErrorBoundaryProps \} from "expo-router";/);
  assert.match(
    rootLayoutSource,
    /export function ErrorBoundary\(\{ error, retry \}: ErrorBoundaryProps\)/,
  );
  assert.match(rootLayoutSource, /onPress=\{retry\}/);
  assert.match(rootLayoutSource, /getErrorSupportCode\(error\)/);
  assert.match(rootLayoutSource, /Support code:/);
  assert.match(rootLayoutSource, /Try again/);
});
