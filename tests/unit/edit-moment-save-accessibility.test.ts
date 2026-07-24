/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const sourcePath = resolve(process.cwd(), "src/app/(sheet)/moments/edit/[id].tsx");
const sourceFile = ts.createSourceFile(
  sourcePath,
  readFileSync(sourcePath, "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

type OpeningControl = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

function unparenthesized(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

function isIdentifier(expression: ts.Expression, expected: string): boolean {
  const candidate = unparenthesized(expression);
  return ts.isIdentifier(candidate) && candidate.text === expected;
}

function isNegatedIdentifier(expression: ts.Expression, expected: string): boolean {
  const candidate = unparenthesized(expression);
  return (
    ts.isPrefixUnaryExpression(candidate) &&
    candidate.operator === ts.SyntaxKind.ExclamationToken &&
    isIdentifier(candidate.operand, expected)
  );
}

function directAttributes(control: OpeningControl, name: string): ts.JsxAttribute[] {
  return control.attributes.properties.filter(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === name,
  );
}

function directExpression(control: OpeningControl, name: string): ts.Expression | undefined {
  const attributes = directAttributes(control, name);
  if (attributes.length !== 1) return undefined;
  const initializer = attributes[0].initializer;
  return initializer && ts.isJsxExpression(initializer) ? initializer.expression : undefined;
}

function pressables(): OpeningControl[] {
  const controls: OpeningControl[] = [];
  function visit(node: ts.Node): void {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === "Pressable"
    ) {
      controls.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return controls;
}

function exactlyOne<T>(values: T[], message: string): T {
  assert.equal(values.length, 1, message);
  return values[0];
}

function requireDirectStringAttribute(
  control: OpeningControl,
  name: string,
  expected: string,
): void {
  const attribute = exactlyOne(
    directAttributes(control, name),
    `expected exactly one direct ${name} attribute`,
  );
  assert.ok(
    attribute.initializer && ts.isStringLiteral(attribute.initializer),
    `expected direct ${name} to be a string literal`,
  );
  assert.equal(attribute.initializer.text, expected);
}

void test("Edit Moment Save is a named button whose state mirrors the existing save gate", () => {
  const save = exactlyOne(
    pressables().filter((control): control is ts.JsxOpeningElement => {
      if (!ts.isJsxOpeningElement(control)) return false;
      const onPress = directExpression(control, "onPress");
      const disabled = directExpression(control, "disabled");
      return (
        onPress !== undefined &&
        isIdentifier(onPress, "handleSave") &&
        disabled !== undefined &&
        isNegatedIdentifier(disabled, "canSave")
      );
    }),
    "expected exactly one Pressable with direct onPress={handleSave} and disabled={!canSave}",
  );

  requireDirectStringAttribute(save, "accessibilityRole", "button");
  requireDirectStringAttribute(save, "accessibilityLabel", "Save moment changes");

  const stateExpression = directExpression(save, "accessibilityState");
  assert.ok(
    stateExpression && ts.isObjectLiteralExpression(unparenthesized(stateExpression)),
    "expected direct accessibilityState to be an object literal",
  );
  const state = unparenthesized(stateExpression);
  assert.ok(ts.isObjectLiteralExpression(state));
  assert.equal(
    state.properties.length,
    2,
    "expected accessibilityState to contain exactly two fields",
  );

  const fields = new Map<string, ts.Expression>();
  for (const property of state.properties) {
    assert.ok(
      ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)),
      "expected accessibilityState fields to be direct property assignments",
    );
    assert.ok(
      !fields.has(property.name.text),
      `duplicate accessibilityState field: ${property.name.text}`,
    );
    fields.set(property.name.text, property.initializer);
  }

  assert.deepEqual([...fields.keys()].sort(), ["busy", "disabled"]);
  const disabledState = fields.get("disabled");
  const busyState = fields.get("busy");
  assert.ok(disabledState && isNegatedIdentifier(disabledState, "canSave"));
  assert.ok(busyState && isIdentifier(busyState, "isSaving"));
});
