import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { classifyExpoPushTicket, type ExpoTicketClassification } from "./dailyPromptDelivery";
import { buildPairingAcceptedPushMessage } from "./pairingAcceptedNotification";
import type { PairingAcceptedReservation } from "./pairingAcceptedNotificationState";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const reservePairingAcceptedNotification = makeFunctionReference<
  "mutation",
  { notificationId: Id<"pairingAcceptedNotifications">; nowMs: number },
  PairingAcceptedReservation
>("pairingAcceptedNotificationState:reservePairingAcceptedNotification");

const persistPairingAcceptedNotificationOutcome = makeFunctionReference<
  "mutation",
  {
    notificationId: Id<"pairingAcceptedNotifications">;
    outcome: ExpoTicketClassification;
    nowMs: number;
  },
  unknown
>("pairingAcceptedNotificationState:persistPairingAcceptedNotificationOutcome");

export const dispatchPairingAcceptedNotification = internalAction({
  args: { notificationId: v.id("pairingAcceptedNotifications") },
  handler: async (ctx, args) => {
    const dispatchStartedAt = Date.now();
    const reservation = await ctx.runMutation(reservePairingAcceptedNotification, {
      notificationId: args.notificationId,
      nowMs: dispatchStartedAt,
    });
    if (reservation.disposition === "no_send") return reservation;

    let outcome: ExpoTicketClassification;
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPairingAcceptedPushMessage(reservation.pushToken)),
      });
      if (!response.ok) throw new Error(`Expo push failed with HTTP ${response.status}`);
      const payload = (await response.json()) as { data?: unknown };
      outcome = classifyExpoPushTicket(payload.data);
    } catch {
      outcome = { status: "sending_unknown" };
    }

    return await ctx.runMutation(persistPairingAcceptedNotificationOutcome, {
      notificationId: args.notificationId,
      outcome,
      nowMs: Date.now(),
    });
  },
});
