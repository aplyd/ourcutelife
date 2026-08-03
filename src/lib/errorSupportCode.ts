const approvedTodayReadPhases = new Set([
  "membership",
  "moments",
  "couple",
  "timezone",
  "prompt-date",
  "generated-content",
  "lifecycle-recipients",
  "assigned-prompt",
  "responses",
  "couple-members",
]);

export function getErrorSupportCode(error: unknown): string | null {
  try {
    if (!(error instanceof Error)) return null;

    const data = Reflect.get(error, "data");
    if (
      typeof data === "object" &&
      data !== null &&
      Object.getPrototypeOf(data) === Object.prototype
    ) {
      const code = Reflect.get(data, "code");
      const phase = Reflect.get(data, "phase");
      if (
        code === "TODAY_READ_UNEXPECTED" &&
        typeof phase === "string" &&
        approvedTodayReadPhases.has(phase)
      ) {
        return `${code}:${phase}`;
      }
    }

    const message = Reflect.get(error, "message");
    if (typeof message !== "string") return null;
    const requestId = /\[Request ID: ([a-f0-9]{16})\]/.exec(message)?.[1];
    return requestId ? `REQUEST:${requestId}` : null;
  } catch {
    return null;
  }
}
