import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDailyPromptPushMessage,
  classifyExpoPushTicket,
  dispatchReservedDailyPrompt,
} from "../../convex/dailyPromptDelivery.js";

void test("daily prompt push content is generic and carries only safe routing context", () => {
  const message = buildDailyPromptPushMessage("ExponentPushToken[device]", "2026-07-22");

  assert.deepEqual(message, {
    to: "ExponentPushToken[device]",
    sound: "default",
    title: "Today's prompt is ready",
    body: "Open Our Cute Life to connect together.",
    data: { url: "/prompts/today", promptDate: "2026-07-22" },
  });
  const serialized = JSON.stringify(message);
  for (const privateField of ["answer", "question", "moment", "tag", "userId", "coupleId"]) {
    assert.doesNotMatch(serialized, new RegExp(privateField, "i"));
  }
});

void test("accepted Expo tickets retain only the ticket id", () => {
  assert.deepEqual(classifyExpoPushTicket({ status: "ok", id: "ticket-123" }), {
    status: "provider_accepted",
    expoTicketId: "ticket-123",
  });
});

void test("deterministic Expo rejection disables only an unregistered device", () => {
  assert.deepEqual(
    classifyExpoPushTicket({
      status: "error",
      message: "Device is not registered",
      details: { error: "DeviceNotRegistered" },
    }),
    {
      status: "provider_rejected",
      expoErrorCode: "DeviceNotRegistered",
      disableDevice: true,
    },
  );
  assert.deepEqual(
    classifyExpoPushTicket({
      status: "error",
      details: { error: "MessageRateExceeded" },
    }),
    {
      status: "provider_rejected",
      expoErrorCode: "MessageRateExceeded",
      disableDevice: false,
    },
  );
});

void test("malformed or incomplete provider results remain ambiguous and cannot invite blind resend", () => {
  for (const ticket of [
    null,
    undefined,
    {},
    { status: "ok" },
    { status: "error" },
    { status: "error", details: "wrong-type" },
    { status: "error", details: { error: 123 } },
  ]) {
    assert.deepEqual(classifyExpoPushTicket(ticket), { status: "sending_unknown" });
  }
});

void test("mocked dispatch consumes the ephemeral token once and persists an accepted outcome", async () => {
  let providerCalls = 0;
  const persisted: unknown[] = [];
  const events: string[] = [];
  let reserved = false;
  const dependencies = {
    reserve: async () => {
      if (reserved) return { disposition: "no_send" as const, reason: "attempt_exists" };
      reserved = true;
      return {
        disposition: "reserved" as const,
        attemptId: "attempt-1",
        deviceId: "device-1",
        pushToken: "ExponentPushToken[ephemeral]",
        promptDate: "2026-07-22",
        step: "first" as const,
      };
    },
    startDispatch: async (args: { attemptId: string; nowMs: number }) => {
      events.push("start");
      assert.deepEqual(args, { attemptId: "attempt-1", nowMs: 1_000 });
      assert.doesNotMatch(JSON.stringify(args), /ExponentPushToken/);
      return { disposition: "started" as const, status: "sending_unknown" as const };
    },
    provider: {
      send: async (message: ReturnType<typeof buildDailyPromptPushMessage>) => {
        events.push("provider");
        providerCalls += 1;
        assert.equal(message.to, "ExponentPushToken[ephemeral]");
        return { status: "ok", id: "ticket-1" };
      },
    },
    persist: async (args: unknown) => {
      persisted.push(args);
      return { disposition: "persisted" as const, status: "provider_accepted" as const };
    },
  };

  const first = await dispatchReservedDailyPrompt(
    { lifecycleId: "lifecycle-1", step: "first", nowMs: 1_000 },
    dependencies,
  );
  const retry = await dispatchReservedDailyPrompt(
    { lifecycleId: "lifecycle-1", step: "first", nowMs: 2_000 },
    dependencies,
  );

  assert.deepEqual(first, { disposition: "persisted", status: "provider_accepted" });
  assert.deepEqual(retry, { disposition: "no_send", reason: "attempt_exists" });
  assert.equal(providerCalls, 1);
  assert.deepEqual(events, ["start", "provider"]);
  assert.deepEqual(persisted, [
    {
      attemptId: "attempt-1",
      outcome: { status: "provider_accepted", expoTicketId: "ticket-1" },
      nowMs: 1_000,
    },
  ]);
  assert.doesNotMatch(JSON.stringify(persisted), /ExponentPushToken/);
});

void test("mocked provider rejection and thrown ambiguity are classified before persistence", async () => {
  for (const scenario of [
    {
      providerResult: { status: "error", details: { error: "DeviceNotRegistered" } },
      expected: {
        status: "provider_rejected" as const,
        expoErrorCode: "DeviceNotRegistered",
        disableDevice: true,
      },
    },
    {
      providerResult: new Error("transport became ambiguous after dispatch"),
      expected: { status: "sending_unknown" as const },
    },
  ]) {
    let persistedOutcome: unknown;
    const result = await dispatchReservedDailyPrompt(
      { lifecycleId: "lifecycle-1", step: "second", nowMs: 5_000 },
      {
        reserve: async () => ({
          disposition: "reserved" as const,
          attemptId: "attempt-2",
          deviceId: "device-2",
          pushToken: "ExponentPushToken[ephemeral]",
          promptDate: "2026-07-22",
          step: "second" as const,
        }),
        startDispatch: async () => ({
          disposition: "started" as const,
          status: "sending_unknown" as const,
        }),
        provider: {
          send: async () => {
            if (scenario.providerResult instanceof Error) throw scenario.providerResult;
            return scenario.providerResult;
          },
        },
        persist: async ({ outcome }) => {
          persistedOutcome = outcome;
          return { disposition: "persisted" as const, status: outcome.status };
        },
      },
    );

    assert.deepEqual(persistedOutcome, scenario.expected);
    assert.deepEqual(result, { disposition: "persisted", status: scenario.expected.status });
  }
});

void test("dispatcher invokes the provider only when dispatch start authorizes a fresh send", async () => {
  for (const disposition of ["already_started", "already_finalized"] as const) {
    let providerCalls = 0;
    let persistenceCalls = 0;

    const result = await dispatchReservedDailyPrompt(
      { lifecycleId: "lifecycle-1", step: "first", nowMs: 1_000 },
      {
        reserve: async () => ({
          disposition: "reserved" as const,
          attemptId: "attempt-1",
          deviceId: "device-1",
          pushToken: "ExponentPushToken[must-not-send]",
          promptDate: "2026-07-22",
          step: "first" as const,
        }),
        startDispatch: async () => ({ disposition, status: "sending_unknown" as const }),
        provider: {
          send: async () => {
            providerCalls += 1;
            return { status: "ok", id: "unauthorized-ticket" };
          },
        },
        persist: async () => {
          persistenceCalls += 1;
          return { disposition: "persisted" as const, status: "provider_accepted" as const };
        },
      },
    );

    assert.deepEqual(result, {
      disposition: "no_send",
      reason:
        disposition === "already_started"
          ? "dispatch_already_started"
          : "dispatch_already_finalized",
    });
    assert.equal(providerCalls, 0);
    assert.equal(persistenceCalls, 0);
  }
});
