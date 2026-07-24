export function isValidIanaTimezone(timezone: string): boolean {
  if (timezone.length === 0) return false;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function getPromptDateInTimezone(timestampMs: number, timezone: string): string {
  if (!isValidIanaTimezone(timezone)) throw new Error(`Invalid timezone: ${timezone}`);

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestampMs));
  const partValue = (type: string) => {
    const part = parts.find((candidate) => candidate.type === type);
    if (!part) throw new Error(`Unable to derive ${type} for timezone: ${timezone}`);
    return part.value;
  };

  return `${partValue("year")}-${partValue("month")}-${partValue("day")}`;
}

function getLocalParts(timestampMs: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestampMs));
  const value = (type: string) => {
    const part = parts.find((candidate) => candidate.type === type);
    if (!part) throw new Error(`Unable to derive ${type} for timezone: ${timezone}`);
    return Number(part.value);
  };

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function timezoneOffsetMs(timestampMs: number, timezone: string): number {
  const local = getLocalParts(timestampMs, timezone);
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);

  return asUtc - timestampMs;
}

export function localDateMinuteToTimestamp(
  localDate: string,
  minuteOfDay: number,
  timezone: string,
): number {
  if (!isValidIanaTimezone(timezone)) throw new Error(`Invalid timezone: ${timezone}`);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) throw new Error(`Invalid local date: ${localDate}`);
  if (!Number.isInteger(minuteOfDay) || minuteOfDay < 1140 || minuteOfDay > 1259) {
    throw new Error(`Invalid minute of day: ${minuteOfDay}`);
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const candidate = utcGuess - timezoneOffsetMs(utcGuess, timezone);
  const corrected = utcGuess - timezoneOffsetMs(candidate, timezone);
  const local = getLocalParts(corrected, timezone);

  if (
    local.year !== year ||
    local.month !== month ||
    local.day !== day ||
    local.hour !== hour ||
    local.minute !== minute
  ) {
    throw new Error(`Invalid local date/minute for timezone: ${localDate} ${minuteOfDay}`);
  }

  return corrected;
}

const firstLocalMinuteMinInclusive = 1140;
const firstLocalMinuteMaxInclusive = 1259;

export function chooseRandomFirstLocalMinute(
  randomMinute: (minInclusive: number, maxInclusive: number) => number,
): number {
  const minute = randomMinute(firstLocalMinuteMinInclusive, firstLocalMinuteMaxInclusive);
  if (!Number.isInteger(minute) || minute < 1140 || minute > 1259) {
    throw new Error(`Invalid randomized first local minute: ${minute}`);
  }

  return minute;
}

export type PromptMember = {
  userId: string;
  joinedAt: number;
};

export type PromptRecipientOrder = {
  firstUserId: string;
  secondUserId: string;
};

export type DailyPromptDeliveryStep = "first" | "second";

export type DailyPromptDeliveryStepStatus =
  | "pending"
  | "scheduled"
  | "sending"
  | "sent"
  | "skipped";

export function choosePromptRecipientOrder({
  members,
  createdByUserId,
  previousFirstUserId,
}: {
  members: PromptMember[];
  createdByUserId: string;
  previousFirstUserId: string | null;
}): PromptRecipientOrder {
  if (members.length !== 2) throw new Error("Expected exactly two prompt members");
  if (new Set(members.map((member) => member.userId)).size !== 2) {
    throw new Error("Prompt members must not contain duplicate user IDs");
  }

  const sortedMembers = [...members].sort(
    (left, right) => left.joinedAt - right.joinedAt || left.userId.localeCompare(right.userId),
  );
  const previousFirst = previousFirstUserId
    ? sortedMembers.find((member) => member.userId === previousFirstUserId)
    : undefined;
  if (previousFirstUserId && previousFirst === undefined) {
    throw new Error("previous first prompt member is no longer active");
  }

  const creator = sortedMembers.find((member) => member.userId === createdByUserId);
  const first =
    previousFirst === undefined
      ? (creator ?? sortedMembers[0])
      : sortedMembers.find((member) => member.userId !== previousFirst.userId);
  if (!first) throw new Error("Expected exactly two prompt members");
  const second = sortedMembers.find((member) => member.userId !== first.userId);
  if (!second) throw new Error("Expected exactly two prompt members");

  return { firstUserId: first.userId, secondUserId: second.userId };
}

export function createDailyPromptDeliveryKey(
  lifecycleId: string,
  step: DailyPromptDeliveryStep,
): string {
  if (lifecycleId.trim().length === 0) throw new Error("daily prompt lifecycle ID is required");

  return `${lifecycleId}:${step}`;
}

export type DailyPromptLifecycleStatus = "active" | "completed" | "skipped";

export type DailyPromptLifecycleTransitionResult = {
  kind: "noop" | "transition" | "terminal";
};

const deliveryStepAllowedNextStatuses: Record<
  DailyPromptDeliveryStepStatus,
  DailyPromptDeliveryStepStatus[]
> = {
  pending: ["scheduled", "skipped"],
  scheduled: ["sending", "skipped"],
  sending: ["sent", "skipped"],
  sent: [],
  skipped: [],
};

const deliveryStepStatusRanks: Record<DailyPromptDeliveryStepStatus, number> = {
  pending: 0,
  scheduled: 1,
  sending: 2,
  sent: 3,
  skipped: 3,
};

export function validateDailyPromptDeliveryStepTransition(
  from: DailyPromptDeliveryStepStatus,
  to: DailyPromptDeliveryStepStatus,
): DailyPromptLifecycleTransitionResult {
  if (from === to) return { kind: "noop" };
  if (from === "sent" || from === "skipped") {
    throw new Error(`Cannot transition from terminal daily prompt delivery step state: ${from}`);
  }
  if (deliveryStepStatusRanks[to] < deliveryStepStatusRanks[from]) {
    throw new Error(`Cannot move daily prompt delivery step backward from ${from} to ${to}`);
  }
  if (!deliveryStepAllowedNextStatuses[from].includes(to)) {
    throw new Error(`illegal daily prompt delivery step transition from ${from} to ${to}`);
  }

  return { kind: to === "sent" || to === "skipped" ? "terminal" : "transition" };
}

const lifecycleAllowedNextStatuses: Record<
  DailyPromptLifecycleStatus,
  DailyPromptLifecycleStatus[]
> = {
  active: ["completed", "skipped"],
  completed: [],
  skipped: [],
};

export function validateDailyPromptLifecycleTransition(
  from: DailyPromptLifecycleStatus,
  to: DailyPromptLifecycleStatus,
): DailyPromptLifecycleTransitionResult {
  if (from === to) return { kind: "noop" };
  if (from === "completed" || from === "skipped") {
    throw new Error(`Cannot transition from terminal daily prompt lifecycle state: ${from}`);
  }
  if (!lifecycleAllowedNextStatuses[from].includes(to)) {
    throw new Error(`illegal daily prompt lifecycle transition from ${from} to ${to}`);
  }

  return { kind: to === "skipped" || to === "completed" ? "terminal" : "transition" };
}
