/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const source = readFileSync(resolve(process.cwd(), "src/app/(sheet)/plans/random.tsx"), "utf8");
const sourceFile = ts.createSourceFile(
  "random.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

void test("Surprise picker Back retains navigation and exposes named button semantics", () => {
  const matches: ts.JsxOpeningElement[] = [];

  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(sourceFile) === "Pressable") {
      const onPress = node.attributes.properties.find(
        (property): property is ts.JsxAttribute =>
          ts.isJsxAttribute(property) && property.name.getText(sourceFile) === "onPress",
      );

      if (
        onPress?.initializer &&
        /router\s*\.\s*back\s*\(\s*\)/.test(onPress.initializer.getText(sourceFile))
      ) {
        matches.push(node);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  assert.equal(matches.length, 1, "expected exactly one Surprise picker Back Pressable");

  const attributes = new Map(
    matches[0].attributes.properties
      .filter(ts.isJsxAttribute)
      .map((attribute) => [attribute.name.getText(sourceFile), attribute.initializer]),
  );
  const role = attributes.get("accessibilityRole");
  const label = attributes.get("accessibilityLabel");

  assert.ok(role && ts.isStringLiteral(role), "expected a direct accessibilityRole");
  assert.equal(role.text, "button");
  assert.ok(label && ts.isStringLiteral(label), "expected a direct accessibilityLabel");
  assert.equal(label.text, "Back to Plans");
});
