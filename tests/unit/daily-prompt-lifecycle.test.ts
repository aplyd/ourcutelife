/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";

import {
  chooseRandomFirstLocalMinute,
  choosePromptRecipientOrder,
  createDailyPromptDeliveryKey,
  getPromptDateInTimezone,
  isValidIanaTimezone,
  localDateMinuteToTimestamp,
  validateDailyPromptDeliveryStepTransition,
  validateDailyPromptLifecycleTransition,
} from "../../convex/dailyPromptLifecycle";

void test("validates IANA timezones and rejects invalid timezone names", () => {
  assert.equal(isValidIanaTimezone("America/New_York"), true);
  assert.equal(isValidIanaTimezone("UTC"), true);
  assert.equal(isValidIanaTimezone("Mars/Olympus_Mons"), false);
  assert.equal(isValidIanaTimezone(""), false);
});

void test("derives prompt date in a timezone and blocks invalid timezone names", () => {
  const instant = Date.UTC(2026, 0, 1, 4, 30);

  assert.equal(getPromptDateInTimezone(instant, "America/New_York"), "2025-12-31");
  assert.equal(getPromptDateInTimezone(instant, "UTC"), "2026-01-01");
  assert.throws(() => getPromptDateInTimezone(instant, "Mars/Olympus_Mons"), /Invalid timezone/);
});

void test("converts local date and minute to timestamps across New York DST and rejects bad input", () => {
  assert.equal(
    localDateMinuteToTimestamp("2026-03-08", 1140, "America/New_York"),
    Date.UTC(2026, 2, 8, 23, 0),
  );
  assert.equal(
    localDateMinuteToTimestamp("2026-11-01", 1259, "America/New_York"),
    Date.UTC(2026, 10, 2, 1, 59),
  );

  assert.throws(() => localDateMinuteToTimestamp("2026-3-8", 1140, "America/New_York"), /date/);
  assert.throws(() => localDateMinuteToTimestamp("2026-03-08", 1260, "America/New_York"), /minute/);
  assert.throws(
    () => localDateMinuteToTimestamp("2026-03-08", 1140.5, "America/New_York"),
    /minute/,
  );
  assert.throws(() => localDateMinuteToTimestamp("2026-03-08", 1140, "Nope/Zone"), /timezone/);
});

void test("chooses injected random prompt minutes within bounds and rejects invalid injections", () => {
  const calls: Array<[number, number]> = [];
  const deterministicMinute = chooseRandomFirstLocalMinute((minInclusive, maxInclusive) => {
    calls.push([minInclusive, maxInclusive]);
    return 1197;
  });

  assert.equal(deterministicMinute, 1197);
  assert.equal(
    chooseRandomFirstLocalMinute(() => 1197),
    1197,
  );
  assert.deepEqual(calls, [[1140, 1259]]);
  assert.equal(
    chooseRandomFirstLocalMinute(() => 1140),
    1140,
  );
  assert.equal(
    chooseRandomFirstLocalMinute(() => 1259),
    1259,
  );
  assert.throws(() => chooseRandomFirstLocalMinute(() => 1139), /minute/);
  assert.throws(() => chooseRandomFirstLocalMinute(() => 1260), /minute/);
  assert.throws(() => chooseRandomFirstLocalMinute(() => 1140.5), /minute/);
});

void test("chooses first-day recipient from creator or deterministic joinedAt and user-id fallback", () => {
  assert.deepEqual(
    choosePromptRecipientOrder({
      members: [
        { userId: "user_b", joinedAt: 20 },
        { userId: "user_a", joinedAt: 10 },
      ],
      createdByUserId: "user_b",
      previousFirstUserId: null,
    }),
    { firstUserId: "user_b", secondUserId: "user_a" },
  );

  assert.deepEqual(
    choosePromptRecipientOrder({
      members: [
        { userId: "user_b", joinedAt: 10 },
        { userId: "user_a", joinedAt: 10 },
      ],
      createdByUserId: "former_user",
      previousFirstUserId: null,
    }),
    { firstUserId: "user_a", secondUserId: "user_b" },
  );
});

void test("alternates recipients and rejects invalid two-member prompt membership", () => {
  const members = [
    { userId: "user_a", joinedAt: 10 },
    { userId: "user_b", joinedAt: 20 },
  ];

  assert.deepEqual(
    choosePromptRecipientOrder({
      members,
      createdByUserId: "user_a",
      previousFirstUserId: "user_a",
    }),
    { firstUserId: "user_b", secondUserId: "user_a" },
  );

  assert.throws(
    () =>
      choosePromptRecipientOrder({
        members: [{ userId: "user_a", joinedAt: 10 }],
        createdByUserId: "user_a",
        previousFirstUserId: null,
      }),
    /exactly two/,
  );
  assert.throws(
    () =>
      choosePromptRecipientOrder({
        members: [
          { userId: "user_a", joinedAt: 10 },
          { userId: "user_a", joinedAt: 20 },
        ],
        createdByUserId: "user_a",
        previousFirstUserId: null,
      }),
    /duplicate/,
  );
  assert.throws(
    () =>
      choosePromptRecipientOrder({
        members,
        createdByUserId: "user_a",
        previousFirstUserId: "former_user",
      }),
    /previous/,
  );
});

void test("creates first and second delivery idempotency keys and rejects blank lifecycle IDs", () => {
  assert.equal(createDailyPromptDeliveryKey("lifecycle_123", "first"), "lifecycle_123:first");
  assert.equal(createDailyPromptDeliveryKey("lifecycle_123", "second"), "lifecycle_123:second");

  assert.throws(() => createDailyPromptDeliveryKey("", "first"), /lifecycle/);
  assert.throws(() => createDailyPromptDeliveryKey("   ", "second"), /lifecycle/);
});

void test("guards whole daily prompt lifecycle transitions independently from delivery steps", () => {
  assert.equal(validateDailyPromptLifecycleTransition("active", "completed").kind, "terminal");
  assert.equal(validateDailyPromptLifecycleTransition("active", "skipped").kind, "terminal");
  assert.equal(validateDailyPromptLifecycleTransition("active", "active").kind, "noop");
  assert.equal(validateDailyPromptLifecycleTransition("completed", "completed").kind, "noop");
  assert.equal(validateDailyPromptLifecycleTransition("skipped", "skipped").kind, "noop");

  assert.throws(() => validateDailyPromptLifecycleTransition("completed", "active"), /terminal/);
  assert.throws(() => validateDailyPromptLifecycleTransition("completed", "skipped"), /terminal/);
  assert.throws(() => validateDailyPromptLifecycleTransition("skipped", "active"), /terminal/);
  assert.throws(() => validateDailyPromptLifecycleTransition("skipped", "completed"), /terminal/);
});

void test("guards delivery-step transitions separately and supports early second-start completion path", () => {
  assert.equal(
    validateDailyPromptDeliveryStepTransition("pending", "scheduled").kind,
    "transition",
  );
  assert.equal(
    validateDailyPromptDeliveryStepTransition("scheduled", "sending").kind,
    "transition",
  );
  assert.equal(validateDailyPromptDeliveryStepTransition("sending", "sent").kind, "terminal");
  assert.equal(validateDailyPromptDeliveryStepTransition("sent", "sent").kind, "noop");
  assert.equal(validateDailyPromptDeliveryStepTransition("pending", "skipped").kind, "terminal");
  assert.equal(validateDailyPromptDeliveryStepTransition("scheduled", "skipped").kind, "terminal");
  assert.equal(validateDailyPromptDeliveryStepTransition("sending", "skipped").kind, "terminal");
  assert.equal(validateDailyPromptDeliveryStepTransition("skipped", "skipped").kind, "noop");

  assert.equal(validateDailyPromptLifecycleTransition("active", "completed").kind, "terminal");

  assert.throws(() => validateDailyPromptDeliveryStepTransition("sent", "skipped"), /terminal/);
  assert.throws(() => validateDailyPromptDeliveryStepTransition("skipped", "sent"), /terminal/);
  assert.throws(
    () => validateDailyPromptDeliveryStepTransition("scheduled", "pending"),
    /backward/,
  );
  assert.throws(
    () => validateDailyPromptDeliveryStepTransition("sending", "scheduled"),
    /backward/,
  );
  assert.throws(() => validateDailyPromptDeliveryStepTransition("pending", "sent"), /illegal/);
  assert.throws(() => validateDailyPromptDeliveryStepTransition("pending", "sending"), /illegal/);
  assert.throws(() => validateDailyPromptDeliveryStepTransition("scheduled", "sent"), /illegal/);
});
