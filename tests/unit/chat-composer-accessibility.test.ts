/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/app/(tabs)/chat.tsx"), "utf8");

void test("Chat message field and send action expose stable native accessibility semantics", () => {
  const messageInput = source.match(
    /<TextInput\b(?:(?!\/>).)*placeholder="Write the honest version…"(?:(?!\/>).)*\/>/s,
  );
  const send = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*onPress=\{handleSend\}(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );

  assert.ok(messageInput, "expected the Chat message input");
  assert.match(messageInput[0], /accessibilityLabel="Chat message"/);

  assert.ok(send, "expected the Send message action");
  assert.match(send[0], /accessibilityRole="button"/);
  assert.match(send[0], /accessibilityLabel="Send message"/);
  assert.match(
    send[0],
    /accessibilityState=\{\{ disabled: !text\.trim\(\) \|\| isSending, busy: isSending \}\}/,
  );
});

void test("Chat exposes every accepted invoked-coach mode with one selected state", () => {
  for (const label of [
    "Normal message",
    "Ask coach",
    "Rephrase before sending",
    "Help us talk about this",
  ]) {
    assert.match(source, new RegExp(`\\[\\"[^\\"]+\\", \\"${label}\\"\\]`));
  }

  const modeControl = source.match(
    /<Pressable\b(?:(?!<Pressable\b|<\/Pressable>).)*key=\{value\}(?:(?!<Pressable\b|<\/Pressable>).)*<\/Pressable>/s,
  );
  assert.ok(modeControl, "expected the shared Chat mode control");
  assert.match(modeControl[0], /accessibilityRole="button"/);
  assert.match(modeControl[0], /accessibilityState=\{\{ selected: mode === value \}\}/);
  assert.match(source, /const \[mode, setMode\] = useState<ComposerMode>\("normal"\)/);
  assert.match(source, /asCoachPrompt: mode !== "normal"/);
});
