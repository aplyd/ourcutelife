/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/(sheet)/moments/new.tsx"), "utf8");

void test("New Moment repair reflections expose stable native names", () => {
  assert.match(source, /accessibilityLabel="What your partner could have done differently"/);
  assert.match(source, /accessibilityLabel="What you could have done differently"/);
});
