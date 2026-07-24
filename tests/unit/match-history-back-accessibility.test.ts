/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const source = readFileSync(resolve(process.cwd(), "src/app/plans/history.tsx"), "utf8");
const sourceFile = ts.createSourceFile(
  "history.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function unwrapParentheses(expression: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(expression)) {
    expression = expression.expression;
  }
  return expression;
}

function isRouterBackCall(expression: ts.Expression): boolean {
  expression = unwrapParentheses(expression);
  if (
    !ts.isCallExpression(expression) ||
    expression.questionDotToken !== undefined ||
    expression.arguments.length !== 0 ||
    expression.typeArguments !== undefined
  ) {
    return false;
  }

  const callee = unwrapParentheses(expression.expression);
  if (
    !ts.isPropertyAccessExpression(callee) ||
    callee.questionDotToken !== undefined ||
    callee.name.text !== "back"
  ) {
    return false;
  }

  const receiver = unwrapParentheses(callee.expression);
  return ts.isIdentifier(receiver) && receiver.text === "router";
}

function isRouterBackHandler(initializer: ts.JsxAttributeValue | undefined): boolean {
  if (!initializer || !ts.isJsxExpression(initializer) || !initializer.expression) {
    return false;
  }

  const expression = unwrapParentheses(initializer.expression);
  if (!ts.isArrowFunction(expression)) {
    return false;
  }

  const { body } = expression;
  if (ts.isBlock(body)) {
    return (
      body.statements.length === 1 &&
      ts.isExpressionStatement(body.statements[0]) &&
      isRouterBackCall(body.statements[0].expression)
    );
  }

  return isRouterBackCall(body);
}

void test("Match history Back retains navigation and exposes named button semantics", () => {
  const matches: ts.JsxOpeningElement[] = [];

  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(sourceFile) === "Pressable") {
      const onPress = node.attributes.properties.find(
        (property): property is ts.JsxAttribute =>
          ts.isJsxAttribute(property) && property.name.getText(sourceFile) === "onPress",
      );

      if (onPress && isRouterBackHandler(onPress.initializer)) {
        matches.push(node);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  assert.equal(matches.length, 1, "expected exactly one Match history Back Pressable");

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
