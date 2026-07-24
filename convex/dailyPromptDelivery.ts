export const DAILY_PROMPT_ROUTE = "/prompts/today";

export type DailyPromptPushMessage = {
  to: string;
  sound: "default";
  title: string;
  body: string;
  data: {
    url: typeof DAILY_PROMPT_ROUTE;
    promptDate: string;
  };
};

export type ExpoTicketClassification =
  | { status: "provider_accepted"; expoTicketId: string }
  | { status: "provider_rejected"; expoErrorCode: string; disableDevice: boolean }
  | { status: "sending_unknown" };

export type DailyPromptDeliveryStep = "first" | "second";

export type DailyPromptDeliveryReservation =
  | {
      disposition: "reserved";
      attemptId: string;
      deviceId: string;
      pushToken: string;
      promptDate: string;
      step: DailyPromptDeliveryStep;
    }
  | { disposition: "no_send"; reason: string };

export type DailyPromptDeliveryPersistence = {
  disposition: "persisted" | "already_persisted";
  status: ExpoTicketClassification["status"];
};

export type DailyPromptDeliveryDispatchStart = {
  disposition: "started" | "already_started" | "already_finalized";
  status: "sending_unknown";
};

export type DailyPromptDispatchDependencies = {
  reserve: (args: {
    lifecycleId: string;
    step: DailyPromptDeliveryStep;
    nowMs: number;
  }) => Promise<DailyPromptDeliveryReservation>;
  startDispatch: (args: {
    attemptId: string;
    nowMs: number;
  }) => Promise<DailyPromptDeliveryDispatchStart>;
  provider: {
    send: (message: DailyPromptPushMessage) => Promise<unknown>;
  };
  persist: (args: {
    attemptId: string;
    outcome: ExpoTicketClassification;
    nowMs: number;
  }) => Promise<DailyPromptDeliveryPersistence>;
};

export function buildDailyPromptPushMessage(
  pushToken: string,
  promptDate: string,
): DailyPromptPushMessage {
  return {
    to: pushToken,
    sound: "default",
    title: "Today's prompt is ready",
    body: "Open Our Cute Life to connect together.",
    data: {
      url: DAILY_PROMPT_ROUTE,
      promptDate,
    },
  };
}

export function classifyExpoPushTicket(ticket: unknown): ExpoTicketClassification {
  if (!ticket || typeof ticket !== "object") return { status: "sending_unknown" };

  const value = ticket as {
    status?: unknown;
    id?: unknown;
    details?: { error?: unknown };
  };
  if (value.status === "ok" && typeof value.id === "string" && value.id.trim()) {
    return { status: "provider_accepted", expoTicketId: value.id };
  }

  const errorCode = value.details?.error;
  if (value.status === "error" && typeof errorCode === "string" && errorCode.trim()) {
    return {
      status: "provider_rejected",
      expoErrorCode: errorCode,
      disableDevice: errorCode === "DeviceNotRegistered",
    };
  }

  return { status: "sending_unknown" };
}

export async function dispatchReservedDailyPrompt(
  args: { lifecycleId: string; step: DailyPromptDeliveryStep; nowMs: number },
  dependencies: DailyPromptDispatchDependencies,
): Promise<DailyPromptDeliveryReservation | DailyPromptDeliveryPersistence> {
  const reservation = await dependencies.reserve(args);
  if (reservation.disposition === "no_send") return reservation;

  const dispatchStart = await dependencies.startDispatch({
    attemptId: reservation.attemptId,
    nowMs: args.nowMs,
  });
  if (dispatchStart.disposition !== "started") {
    return {
      disposition: "no_send",
      reason:
        dispatchStart.disposition === "already_started"
          ? "dispatch_already_started"
          : "dispatch_already_finalized",
    };
  }

  const message = buildDailyPromptPushMessage(reservation.pushToken, reservation.promptDate);
  let outcome: ExpoTicketClassification;
  try {
    outcome = classifyExpoPushTicket(await dependencies.provider.send(message));
  } catch {
    outcome = { status: "sending_unknown" };
  }

  return await dependencies.persist({
    attemptId: reservation.attemptId,
    outcome,
    nowMs: args.nowMs,
  });
}
