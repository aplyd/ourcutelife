import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

void test("every main push deploys Convex and publishes an iOS OTA update", () => {
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(
    workflow,
    /convex-deploy:[\s\S]*?if: github\.ref == 'refs\/heads\/main' && github\.event_name == 'push'/,
  );
  assert.match(
    workflow,
    /eas-update-ios:[\s\S]*?if: github\.ref == 'refs\/heads\/main' && github\.event_name == 'push'/,
  );
  assert.match(workflow, /eas-update-ios:[\s\S]*?needs: \[quality, convex-deploy\]/);
});
