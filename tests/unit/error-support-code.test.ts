import assert from "node:assert/strict";
import test from "node:test";

import { getErrorSupportCode } from "../../src/lib/errorSupportCode";

void test("extracts a privacy-safe Convex diagnostic code and phase", () => {
  const error = Object.assign(new Error("Server Error"), {
    data: { code: "TODAY_READ_UNEXPECTED", phase: "assigned-prompt" },
  });

  assert.equal(getErrorSupportCode(error), "TODAY_READ_UNEXPECTED:assigned-prompt");
});

void test("falls back to a Convex request ID without exposing the error message", () => {
  const error = new Error(
    "private prefix [CONVEX Q(prompts:today)] [Request ID: 1ea8e5fcd9af78a5] Server Error private suffix",
  );

  assert.equal(getErrorSupportCode(error), "REQUEST:1ea8e5fcd9af78a5");
  assert.equal(getErrorSupportCode(new Error("private internal detail")), null);
  assert.equal(getErrorSupportCode(new Error("[Request ID: too-short]")), null);
  assert.equal(getErrorSupportCode(new Error("[Request ID: 1ea8e5fcd9af78a500]")), null);
});

void test("rejects unapproved diagnostic payloads without rendering their strings", () => {
  const unrelated = Object.assign(new Error("Server Error"), {
    data: { code: "PRIVATE_MESSAGE", phase: "partner response text" },
  });
  const unknownPhase = Object.assign(new Error("Server Error"), {
    data: { code: "TODAY_READ_UNEXPECTED", phase: "private-user-value" },
  });

  assert.equal(getErrorSupportCode(unrelated), null);
  assert.equal(getErrorSupportCode(unknownPhase), null);
  assert.equal(
    getErrorSupportCode({ data: { code: "TODAY_READ_UNEXPECTED", phase: "timezone" } }),
    null,
  );
});

void test("fails closed when error payload inspection invokes throwing traps or getters", () => {
  const throwingData = new Error("Server Error") as Error & { data?: unknown };
  Object.defineProperty(throwingData, "data", {
    get() {
      throw new Error("private getter detail");
    },
  });
  const throwingProxy = new Proxy(new Error("Server Error"), {
    has() {
      throw new Error("private proxy detail");
    },
  });

  assert.doesNotThrow(() => getErrorSupportCode(throwingData));
  assert.equal(getErrorSupportCode(throwingData), null);
  assert.doesNotThrow(() => getErrorSupportCode(throwingProxy));
  assert.equal(getErrorSupportCode(throwingProxy), null);
});
