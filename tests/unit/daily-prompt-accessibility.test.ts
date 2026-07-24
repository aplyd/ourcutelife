/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const todaySource = readFileSync(resolve(process.cwd(), "src/app/(tabs)/index.tsx"), "utf8");
const promptSource = readFileSync(
  resolve(process.cwd(), "src/app/(sheet)/prompts/today.tsx"),
  "utf8",
);

void test("Today daily-prompt entry is an explicitly named button", () => {
  const match = todaySource.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*router\.push\("\/prompts\/today"\)(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );

  assert.ok(match, "expected the Today daily-prompt entry Pressable");
  assert.match(match[0], /accessibilityRole="button"/);
  assert.match(match[0], /accessibilityLabel="Answer today's daily prompt"/);
});

void test("Daily Prompt answer input has an explicit accessible name", () => {
  const match = promptSource.match(/<TextInput\b[^>]*\/>/s);

  assert.ok(match, "expected the Daily Prompt TextInput");
  assert.match(match[0], /accessibilityLabel="Daily prompt answer"/);
});

void test("Daily Prompt records answer start on first input and retries after failure while typing", () => {
  const input = promptSource.match(/<TextInput\b[^>]*\/>/s);

  assert.ok(input, "expected the Daily Prompt TextInput");
  assert.match(promptSource, /useAppMutation\(api\.prompts\.startAnswering\)/);
  assert.match(promptSource, /function handleAnswerChange\(nextAnswer: string\)/);
  assert.match(
    promptSource,
    /nextAnswer\.trim\(\) &&\s*\(!answer\.trim\(\) \|\| answerStartPromiseRef\.current === null\)/,
  );
  assert.match(input[0], /onChangeText=\{handleAnswerChange\}/);
  assert.match(promptSource, /await ensureAnswerStarted\(\)/);
});

void test("Submit is a named button whose accessibility state mirrors its disabled and saving state", () => {
  const match = promptSource.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*onPress=\{handleSave\}(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );

  assert.ok(match, "expected the Daily Prompt submit Pressable");
  assert.match(match[0], /accessibilityRole="button"/);
  assert.match(match[0], /accessibilityLabel="Submit daily prompt answer"/);
  assert.match(match[0], /disabled=\{!answer\.trim\(\) \|\| isSaving\}/);
  assert.match(
    match[0],
    /accessibilityState=\{\{\s*disabled: !answer\.trim\(\) \|\| isSaving,\s*busy: isSaving,?\s*\}\}/s,
  );
});
