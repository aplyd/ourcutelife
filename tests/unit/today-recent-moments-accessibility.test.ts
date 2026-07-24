/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const source = readFileSync(resolve(process.cwd(), "src/app/(tabs)/index.tsx"), "utf8");
const sourceFile = ts.createSourceFile(
  "index.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function findPressableOpeningTag(onPressPattern: RegExp, description: string) {
  const matches: ts.JsxOpeningElement[] = [];

  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(sourceFile) === "Pressable") {
      const onPress = node.attributes.properties.find(
        (property): property is ts.JsxAttribute =>
          ts.isJsxAttribute(property) && property.name.getText(sourceFile) === "onPress",
      );

      if (onPress?.initializer && onPressPattern.test(onPress.initializer.getText(sourceFile))) {
        matches.push(node);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  assert.equal(matches.length, 1, `expected exactly one ${description} opening Pressable`);
  return matches[0];
}

function getDirectAttribute(openingTag: ts.JsxOpeningElement, name: string) {
  const attribute = openingTag.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText(sourceFile) === name,
  );

  assert.ok(attribute, `expected ${name} on the navigation Pressable opening tag`);
  assert.ok(attribute.initializer, `expected ${name} to have a value`);
  return attribute.initializer;
}

function assertDirectStringAttribute(
  openingTag: ts.JsxOpeningElement,
  name: string,
  value: string,
) {
  const initializer = getDirectAttribute(openingTag, name);
  assert.ok(ts.isStringLiteral(initializer), `expected ${name} to be a string literal`);
  assert.equal(initializer.text, value);
}

void test("Today recent-moments navigation exposes descriptive named button semantics", () => {
  const seeAll = findPressableOpeningTag(
    /router\s*\.\s*push\s*\(\s*["']\/moments["']\s*\)/,
    "See all moments navigation action",
  );
  const momentPreview = findPressableOpeningTag(
    /router\s*\.\s*push\s*\(\s*`\/moments\/\$\{\s*moment\s*\.\s*_id\s*\}`\s*\)/,
    "recent-moment preview navigation action",
  );

  assertDirectStringAttribute(seeAll, "accessibilityRole", "button");
  assertDirectStringAttribute(seeAll, "accessibilityLabel", "See all moments");

  assertDirectStringAttribute(momentPreview, "accessibilityRole", "button");
  const momentLabel = getDirectAttribute(momentPreview, "accessibilityLabel");
  assert.ok(ts.isJsxExpression(momentLabel), "expected the moment label to be a JSX expression");
  const momentLabelExpression = momentLabel.expression;
  if (!momentLabelExpression) {
    assert.fail("expected the moment label expression to have a value");
  }
  assert.ok(
    ts.isTemplateExpression(momentLabelExpression),
    "expected the moment label to be a template",
  );
  assert.equal(momentLabelExpression.head.text, "Open moment: ");
  assert.equal(momentLabelExpression.templateSpans.length, 1);
  assert.match(
    momentLabelExpression.templateSpans[0].expression.getText(sourceFile),
    /^moment\s*\.\s*summary$/,
  );
  assert.equal(momentLabelExpression.templateSpans[0].literal.text, "");
});
