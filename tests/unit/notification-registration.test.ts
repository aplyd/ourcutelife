/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

void test("notification observation and explicit permission request remain separate client paths", () => {
  const notifications = readProjectFile("src/lib/notifications.ts");
  const layout = readProjectFile("src/app/_layout.tsx");

  assert.match(notifications, /export async function reconcileServerPushRegistration/);
  assert.match(notifications, /export async function requestServerPushRegistration/);
  assert.match(notifications, /Notifications\.getPermissionsAsync\(\)/);
  assert.match(notifications, /Notifications\.requestPermissionsAsync\(\)/);
  assert.match(layout, /reconcileServerPushRegistration/);
  assert.doesNotMatch(layout, /requestServerPushRegistration/);
});

void test("non-prompting notification reconciliation never depends on requestPermissionsAsync", () => {
  const notifications = readProjectFile("src/lib/notifications.ts");
  const reconcileMatch = notifications.match(
    /export async function reconcileServerPushRegistration\(\) \{(?<body>[\s\S]*?)\n\}/,
  );

  assert.ok(reconcileMatch?.groups?.body);
  assert.match(reconcileMatch.groups.body, /Notifications\.getPermissionsAsync\(\)/);
  assert.doesNotMatch(reconcileMatch.groups.body, /requestPermissionsAsync/);
  assert.match(reconcileMatch.groups.body, /getExpoPushTokenAsync/);
  assert.match(reconcileMatch.groups.body, /\.catch\(\(\) => null\)/);
});

void test("app start and membership creation report observation before granted registration", () => {
  const layout = readProjectFile("src/app/_layout.tsx");

  assert.match(layout, /reportPermissionObservation\(result\.observation\)/);
  assert.match(layout, /if \(result\.registration\)/);
  assert.match(layout, /registerGrantedDevice\(result\.registration\)/);
  assert.match(
    layout,
    /betterAuthSession\.data\?\.session,[\s\S]*viewer\?\.membership\?\.coupleId,[\s\S]*registerGrantedDevice/,
  );
  assert.doesNotMatch(layout, /requestServerPushRegistration/);
});

void test("both pairing paths register after membership mutation and backend defers their race", () => {
  const pairing = readProjectFile("src/app/pairing.tsx");
  const notificationState = readProjectFile("convex/pairingAcceptedNotificationState.ts");
  const createHandler = pairing.slice(
    pairing.indexOf("async function handleCreateCode"),
    pairing.indexOf("async function handleJoin"),
  );
  const joinHandler = pairing.slice(
    pairing.indexOf("async function handleJoin"),
    pairing.indexOf("async function handleLeaveCouple"),
  );

  assert.match(pairing, /requestServerPushRegistration/);
  assert.match(pairing, /reportPermissionObservation\(result\.observation\)/);
  assert.match(pairing, /registerGrantedDevice\(result\.registration\)/);
  assert.match(
    createHandler,
    /await createCoupleAndCode\([\s\S]*?await registerForNotificationsAfterPairing\(\)/,
  );
  assert.match(
    joinHandler,
    /await joinWithCode\([\s\S]*?await registerForNotificationsAfterPairing\(\)/,
  );
  assert.match(notificationState, /status: "awaiting_permission"/);
  assert.match(
    notificationState,
    /ctx\.scheduler\.runAfter\([\s\S]*?dispatchPairingAcceptedNotification/,
  );
});

void test("legacy push token registration requires canonical tokenIdentifier identity", () => {
  const push = readProjectFile("convex/push.ts");

  assert.match(push, /identity\?\.tokenIdentifier/);
  assert.doesNotMatch(push, /identity\?\.subject/);
});

void test("second-answer boundary uses the bounded ready-device index", () => {
  const prompts = readProjectFile("convex/prompts.ts");
  const boundary = prompts.slice(prompts.indexOf("export const secondAnswerBoundary"));

  assert.match(boundary, /withIndex\("by_ready_lookup"/);
  assert.doesNotMatch(boundary, /query\("notificationDevices"\)[\s\S]{0,400}\.collect\(\)/);
});
