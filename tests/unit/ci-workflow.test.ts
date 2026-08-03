import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

void test("production OTA publishing requires an explicit workflow dispatch", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /eas-update-ios:[\s\S]*?if: github\.event_name == 'workflow_dispatch'/);
  assert.doesNotMatch(
    workflow,
    /eas-update-ios:[\s\S]*?if: github\.ref == 'refs\/heads\/main' && github\.event_name == 'push'/,
  );
});
