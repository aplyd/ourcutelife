import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import {
  dispatchReservedDailyPrompt,
  type DailyPromptDeliveryDispatchStart,
  type DailyPromptDeliveryPersistence,
  type DailyPromptDeliveryReservation,
} from "./dailyPromptDelivery";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const deliveryStepValidator = v.union(v.literal("first"), v.literal("second"));
const reserveDailyPromptDelivery = makeFunctionReference<
  "mutation",
  {
    lifecycleId: Id<"dailyPromptLifecycles">;
    step: "first" | "second";
    nowMs: number;
    recoveryAttemptId?: Id<"dailyPromptDeliveryAttempts">;
  },
  DailyPromptDeliveryReservation
>("dailyPromptDeliveryReservation:reserveDailyPromptDelivery");
const startDailyPromptDeliveryDispatch = makeFunctionReference<
  "mutation",
  { attemptId: string; nowMs: number },
  DailyPromptDeliveryDispatchStart
>("dailyPromptDeliveryStart:startDailyPromptDeliveryDispatch");
const persistDailyPromptDeliveryOutcome = makeFunctionReference<
  "mutation",
  {
    attemptId: string;
    outcome:
      | { status: "provider_accepted"; expoTicketId: string }
      | { status: "provider_rejected"; expoErrorCode: string; disableDevice: boolean }
      | { status: "sending_unknown" };
    nowMs: number;
  },
  DailyPromptDeliveryPersistence
>("dailyPromptDeliveryOutcome:persistDailyPromptDeliveryOutcome");

export const dispatchDailyPrompt = internalAction({
  args: {
    lifecycleId: v.id("dailyPromptLifecycles"),
    step: deliveryStepValidator,
    recoveryAttemptId: v.optional(v.id("dailyPromptDeliveryAttempts")),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    return await dispatchReservedDailyPrompt(
      { lifecycleId: args.lifecycleId, step: args.step, nowMs },
      {
        reserve: async (reservationArgs) =>
          await ctx.runMutation(reserveDailyPromptDelivery, {
            ...reservationArgs,
            lifecycleId: args.lifecycleId,
            recoveryAttemptId: args.recoveryAttemptId,
          }),
        startDispatch: async (startArgs) =>
          await ctx.runMutation(startDailyPromptDeliveryDispatch, startArgs),
        provider: {
          send: async (message) => {
            const response = await fetch(EXPO_PUSH_URL, {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify(message),
            });
            if (!response.ok) throw new Error(`Expo push failed with HTTP ${response.status}`);
            const payload = (await response.json()) as { data?: unknown };
            return payload.data;
          },
        },
        persist: async (persistenceArgs) =>
          await ctx.runMutation(persistDailyPromptDeliveryOutcome, persistenceArgs),
      },
    );
  },
});
